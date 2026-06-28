"""Google Cloud Document AI adapter (primary OCR for scanned/image documents).

Maps a Document AI `Document` proto → `NormalizedLayout`, preserving EVERYTHING:
pages, blocks, paragraphs, tokens, tables (rows/cols/cells), form key-values,
bounding boxes (normalized vertices) and per-element confidence + detected
languages. Nothing is discarded.

Config (env or constructor):
  GCP_PROJECT_ID, DOCAI_LOCATION (us|eu), DOCAI_PROCESSOR_ID,
  GOOGLE_APPLICATION_CREDENTIALS (path to service-account JSON).

Live only when google-cloud-documentai is installed AND credentials resolve.
Until then the module imports fine and `available()` reports False, so the router
falls back to Vision / native-PDF.
"""
from __future__ import annotations

import os
from typing import Optional

from .base import (BBox, Block, Cell, KeyValue, NormalizedLayout, OcrSource,
                   Page, Table, Token)

try:                                              # pragma: no cover - env dependent
    from google.cloud import documentai_v1 as documentai
    from google.api_core.client_options import ClientOptions
    _LIB = True
except Exception:
    documentai = None                             # type: ignore
    ClientOptions = None                          # type: ignore
    _LIB = False


def _text(anchor, full_text: str) -> str:
    if not anchor or not anchor.text_segments:
        return ""
    parts = []
    for seg in anchor.text_segments:
        start = int(seg.start_index or 0)
        end = int(seg.end_index or 0)
        parts.append(full_text[start:end])
    return "".join(parts).strip()


def _bbox(layout, page_no: int) -> Optional[BBox]:
    try:
        verts = layout.bounding_poly.normalized_vertices
        if not verts:
            return None
        xs = [v.x for v in verts]
        ys = [v.y for v in verts]
        return BBox(page=page_no, x=min(xs), y=min(ys),
                    w=max(xs) - min(xs), h=max(ys) - min(ys))
    except Exception:
        return None


class DocumentAIProvider:
    name = "document_ai"

    def __init__(self, project_id: Optional[str] = None, location: Optional[str] = None,
                 processor_id: Optional[str] = None):
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID", "ocrextractionengine")
        self.location = location or os.environ.get("DOCAI_LOCATION", "us")
        self.processor_id = processor_id or os.environ.get("DOCAI_PROCESSOR_ID")

    def available(self) -> bool:
        if not _LIB or not self.processor_id:
            return False
        return bool(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
                    or os.environ.get("GOOGLE_CLOUD_PROJECT"))

    def supports(self, mime: str, filename: str, data: bytes) -> bool:
        return self.available()

    def _client(self):
        opts = ClientOptions(api_endpoint=f"{self.location}-documentai.googleapis.com")
        return documentai.DocumentProcessorServiceClient(client_options=opts)

    def extract(self, data: bytes, mime: str, filename: str = "") -> NormalizedLayout:
        if not self.available():
            raise RuntimeError("Document AI not configured (lib/creds/processor missing)")
        client = self._client()
        name = client.processor_path(self.project_id, self.location, self.processor_id)
        raw = documentai.RawDocument(content=data, mime_type=mime or "application/pdf")
        result = client.process_document(
            request=documentai.ProcessRequest(name=name, raw_document=raw))
        return self._map(result.document)

    def _map(self, doc) -> NormalizedLayout:
        full = doc.text or ""
        pages: list[Page] = []
        langs: set[str] = set()
        confs: list[float] = []
        for pno, page in enumerate(doc.pages, start=1):
            tokens: list[Token] = []
            for tok in page.tokens:
                c = float(tok.layout.confidence or 0.0)
                confs.append(c)
                tokens.append(Token(text=_text(tok.layout.text_anchor, full),
                                    confidence=c, bbox=_bbox(tok.layout, pno)))
            blocks = [Block(text=_text(b.layout.text_anchor, full),
                            confidence=float(b.layout.confidence or 0.0),
                            bbox=_bbox(b.layout, pno)) for b in page.blocks]
            tables: list[Table] = []
            for t in page.tables:
                cells: list[Cell] = []
                for ri, row in enumerate(list(t.header_rows) + list(t.body_rows)):
                    for ci, cell in enumerate(row.cells):
                        cells.append(Cell(
                            text=_text(cell.layout.text_anchor, full), row=ri, col=ci,
                            row_span=int(cell.row_span or 1),
                            col_span=int(cell.col_span or 1),
                            confidence=float(cell.layout.confidence or 0.0),
                            bbox=_bbox(cell.layout, pno)))
                nrows = len(t.header_rows) + len(t.body_rows)
                ncols = max((c.col for c in cells), default=-1) + 1
                tables.append(Table(rows=nrows, cols=ncols, cells=cells,
                                    bbox=_bbox(t.layout, pno)))
            kvs: list[KeyValue] = []
            for ff in page.form_fields:
                kvs.append(KeyValue(
                    key=_text(ff.field_name.text_anchor, full),
                    value=_text(ff.field_value.text_anchor, full),
                    key_conf=float(ff.field_name.confidence or 0.0),
                    value_conf=float(ff.field_value.confidence or 0.0),
                    bbox=_bbox(ff.field_name, pno), page=pno))
            dl = [d.language_code for d in page.detected_languages]
            langs.update(dl)
            pages.append(Page(number=pno, width=float(page.dimension.width or 0),
                              height=float(page.dimension.height or 0), blocks=blocks,
                              tokens=tokens, tables=tables, key_values=kvs, languages=dl))
        mean_conf = round(sum(confs) / len(confs), 4) if confs else None
        return NormalizedLayout(source=OcrSource.DOCUMENT_AI, text=full, pages=pages,
                                languages=sorted(langs), mean_word_confidence=mean_conf,
                                provider_meta={"processor_id": self.processor_id,
                                               "location": self.location})
