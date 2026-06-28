"""6-layer extraction pipeline.

Layers (each independently callable for instrumentation):

  1. ``layer1_classifier.Layer1Classifier``  — document classification.
  2. ``layer2_layout.Layer2Layout``          — text blocks + table regions per page.
  3. ``layer3_tables.Layer3Tables``          — structured tables + semantic role.
  4. ``layer4_vision_extractor.Layer4Vision`` — LLM extraction over unstructured text.
  5. ``layer5_mapping.Layer5Mapping``         — normalize + dedupe + canonicalise.
  6. ``layer6_validation.Layer6Validation``   — run business / domain rules.

The ``PipelineOrchestrator`` in :mod:`app.pipeline.orchestrator` wires them
together. It is the new entry-point replacing the legacy
``document_orchestrator`` (kept around as a thin compatibility shim).
"""
from app.pipeline.layer1_classifier import Layer1Classifier, Layer1Result
from app.pipeline.layer2_layout import (
    Layer2Layout,
    LayoutPage,
    TableRegion,
    TextBlock,
)
from app.pipeline.layer3_tables import Layer3Tables, TableFieldRow
from app.pipeline.layer4_vision_extractor import Layer4Vision
from app.pipeline.layer5_mapping import Layer5Mapping, NormalizedField
from app.pipeline.layer6_validation import Layer6Validation
from app.pipeline.orchestrator import PipelineOrchestrator

__all__ = [
    "Layer1Classifier",
    "Layer1Result",
    "Layer2Layout",
    "LayoutPage",
    "TextBlock",
    "TableRegion",
    "Layer3Tables",
    "TableFieldRow",
    "Layer4Vision",
    "Layer5Mapping",
    "NormalizedField",
    "Layer6Validation",
    "PipelineOrchestrator",
]
