"""SemanticChunker tests."""
from __future__ import annotations

from app.rag.chunker import SemanticChunker


def test_small_text_returns_single_chunk():
    text = "Energy consumption is reported in GJ. We use IPCC AR6 GWP."
    chunks = SemanticChunker(target_tokens=400, overlap_tokens=0).chunk(text)
    assert len(chunks) == 1
    assert chunks[0].text == text


def test_large_text_splits_into_multiple_chunks():
    para = "Section. " + (" ".join(["word"] * 200))
    text = "\n\n".join([para] * 5)
    chunker = SemanticChunker(target_tokens=120, overlap_tokens=20)
    chunks = chunker.chunk(text)
    assert len(chunks) > 1
    for c in chunks:
        assert c.text


def test_oversized_paragraph_splits_on_sentences():
    para = " ".join(f"Sentence {i}." for i in range(60))
    chunker = SemanticChunker(target_tokens=80, overlap_tokens=0)
    chunks = chunker.chunk(para)
    assert len(chunks) > 1


def test_empty_text_returns_empty():
    assert SemanticChunker().chunk("") == []
    assert SemanticChunker().chunk("   \n  ") == []
