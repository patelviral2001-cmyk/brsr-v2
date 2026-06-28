"""
Semantic chunker.

The goal is to keep chunk boundaries on paragraph/sentence breaks so that an
LLM retrieving a chunk gets a coherent unit. The rough heuristic:

  1) Split on paragraph breaks (\n\n+).
  2) For each paragraph, if it fits within target_tokens, keep it whole.
  3) If it exceeds, split on sentence boundaries (regex .!?), accumulating
     until the budget is exhausted.
  4) Apply a small `overlap_tokens` window between adjacent chunks so context
     stays continuous.

Tokens are approximated as words * 1.3 (close enough for English; the LLM
will accept slight under/over-sizing).
"""
from __future__ import annotations

import re
from dataclasses import dataclass


_PARA_RE = re.compile(r"\n\s*\n+")
_SENT_RE = re.compile(r"(?<=[.!?])\s+")
_WS_RE = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class Chunk:
    text: str
    char_start: int
    char_end: int


def _est_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, int(len(text.split()) * 1.3))


class SemanticChunker:
    def __init__(self, target_tokens: int = 400, overlap_tokens: int = 50) -> None:
        if target_tokens <= 0:
            raise ValueError("target_tokens must be positive")
        if overlap_tokens < 0 or overlap_tokens >= target_tokens:
            raise ValueError("overlap_tokens must be in [0, target_tokens)")
        self.target_tokens = target_tokens
        self.overlap_tokens = overlap_tokens

    def chunk(self, text: str) -> list[Chunk]:
        text = text.strip()
        if not text:
            return []

        paragraphs = self._paragraphs(text)
        chunks: list[Chunk] = []
        buf: list[str] = []
        buf_tokens = 0
        buf_start: int | None = None

        for para_text, para_start, para_end in paragraphs:
            tokens = _est_tokens(para_text)

            if tokens > self.target_tokens:
                # Flush whatever we have, then split this oversized para by sentences.
                if buf:
                    chunks.append(self._finalize(buf, buf_start, para_start))
                    buf, buf_tokens, buf_start = [], 0, None
                chunks.extend(self._sentence_split(para_text, para_start))
                continue

            if buf_tokens + tokens > self.target_tokens and buf:
                chunks.append(self._finalize(buf, buf_start, para_start))
                buf, buf_tokens, buf_start = [], 0, None

            if buf_start is None:
                buf_start = para_start
            buf.append(para_text)
            buf_tokens += tokens

        if buf:
            chunks.append(self._finalize(buf, buf_start, len(text)))

        return self._apply_overlap(chunks, text)

    def _paragraphs(self, text: str) -> list[tuple[str, int, int]]:
        out: list[tuple[str, int, int]] = []
        pos = 0
        for match in _PARA_RE.finditer(text):
            end = match.start()
            para = text[pos:end].strip()
            if para:
                start_idx = text.find(para, pos)
                out.append((para, start_idx, start_idx + len(para)))
            pos = match.end()
        tail = text[pos:].strip()
        if tail:
            start_idx = text.find(tail, pos)
            out.append((tail, start_idx, start_idx + len(tail)))
        return out

    def _sentence_split(self, para_text: str, para_start: int) -> list[Chunk]:
        sentences = _SENT_RE.split(para_text)
        out: list[Chunk] = []
        buf: list[str] = []
        buf_tokens = 0
        cursor = para_start
        buf_start = para_start
        for sent in sentences:
            sent = sent.strip()
            if not sent:
                continue
            t = _est_tokens(sent)
            if buf_tokens + t > self.target_tokens and buf:
                joined = " ".join(buf)
                out.append(Chunk(text=joined, char_start=buf_start, char_end=cursor))
                buf, buf_tokens = [], 0
                buf_start = cursor
            if not buf:
                buf_start = cursor
            buf.append(sent)
            buf_tokens += t
            cursor += len(sent) + 1
        if buf:
            joined = " ".join(buf)
            out.append(Chunk(text=joined, char_start=buf_start, char_end=cursor))
        return out

    def _finalize(self, buf: list[str], start: int | None, end: int) -> Chunk:
        text = "\n\n".join(buf).strip()
        return Chunk(text=text, char_start=start or 0, char_end=end)

    def _apply_overlap(self, chunks: list[Chunk], full_text: str) -> list[Chunk]:
        if not chunks or self.overlap_tokens == 0:
            return chunks
        out: list[Chunk] = [chunks[0]]
        for i in range(1, len(chunks)):
            prev = chunks[i - 1]
            cur = chunks[i]
            # Pull a small overlap from end of prev into start of cur
            tail_words = prev.text.split()[-self.overlap_tokens :]
            tail = " ".join(tail_words).strip()
            if tail and not cur.text.startswith(tail):
                merged = (tail + " " + cur.text).strip()
                out.append(Chunk(text=merged, char_start=cur.char_start, char_end=cur.char_end))
            else:
                out.append(cur)
        return out
