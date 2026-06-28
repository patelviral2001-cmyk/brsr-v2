"""Declarative validation rules engine for extracted ESG metrics.

Public surface:
  * :class:`RuleEngine` — evaluates all registered rules over a batch of
    extracted fields.
  * :class:`ValidationContext` — carries the cross-field / historical data
    each rule needs.
  * :class:`ValidationRule`, :class:`RuleResult`, :class:`Severity` — types
    used to declare new rules.
  * :data:`DEFAULT_RULES` — the canonical (~40) rule set wired into the
    orchestrator.
"""
from app.validation.context import ValidationContext, ValidationContextLoader
from app.validation.rules_engine import (
    DEFAULT_RULES,
    RuleEngine,
    RuleResult,
    Severity,
    ValidationRule,
)

__all__ = [
    "DEFAULT_RULES",
    "RuleEngine",
    "RuleResult",
    "Severity",
    "ValidationContext",
    "ValidationContextLoader",
    "ValidationRule",
]
