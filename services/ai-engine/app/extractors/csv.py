"""CSV extractor — delegates to ExcelExtractor's sheet logic."""
from __future__ import annotations

import asyncio
import io
from typing import Optional

import pandas as pd

from app.extractors.base import BaseExtractor, ExtractionContext, ExtractionResult
from app.extractors.excel import (
    SHEET_HANDLERS,
    _handle_generic_table,
    classify_sheet,
)
from app.utils.logging import get_logger

logger = get_logger("extractors.csv")


class CsvExtractor(BaseExtractor):
    name = "csv"

    async def extract(self, ctx: ExtractionContext) -> ExtractionResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._sync_extract, ctx)

    def _sync_extract(self, ctx: ExtractionContext) -> ExtractionResult:
        result = ExtractionResult()
        df: Optional[pd.DataFrame] = None
        for sep in (",", ";", "\t", "|"):
            try:
                df = pd.read_csv(io.BytesIO(ctx.file_bytes), sep=sep, dtype=str, engine="python")
                if df.shape[1] > 1:
                    break
            except Exception:
                continue
        if df is None or df.empty:
            try:
                df = pd.read_csv(io.BytesIO(ctx.file_bytes), dtype=str)
            except Exception as e:  # noqa: BLE001
                logger.error("csv.parse_failed", err=str(e))
                result.notes.append(f"csv parse failed: {e}")
                return result

        sheet_name = ctx.filename or "csv"
        headers = [str(c) for c in df.columns]
        stype, score = classify_sheet(headers)
        logger.info("csv.classified", type=stype, score=round(score, 3))

        def chunk_id_fn(i: int) -> str:
            return self._chunk_id("csv", 1, i + 1)

        handler = SHEET_HANDLERS.get(stype, _handle_generic_table)
        out = handler(sheet_name, df, chunk_id_fn)
        result.chunks.extend(out.chunks)
        result.raw_fields.extend(out.raw_fields)
        result.page_count = 1
        result.text_preview = df.head(20).to_csv(index=False)[:2000]
        return result
