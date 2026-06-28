"""
Tool registry — maps tool names to Anthropic schemas and Python handlers.

Why a registry instead of decorator magic? Different agents expose different
tools, and the model must see exactly the tools it's allowed to call. The
registry lets each agent return a list of names and we slice the schema list
deterministically.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from app.auth import Principal
from app.tools import backend_client
from app.tools.peer_benchmarks import compute_position, get_peer_stats


@dataclass(frozen=True, slots=True)
class ToolContext:
    principal: Principal
    fiscal_year: str | None
    framework: str | None
    section_id: str | None


ToolHandler = Callable[[dict[str, Any], ToolContext], Awaitable[dict[str, Any]]]


_TOOL_SCHEMAS: dict[str, dict[str, Any]] = {
    "get_metric": {
        "name": "get_metric",
        "description": (
            "Fetch a canonical metric value for the current tenant. Returns the "
            "value, unit, period, dimensions and the upstream calc_run_id used "
            "to compute it. ALWAYS prefer this over guessing — if the value is "
            "needed for an answer, call this tool."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "canonical_key": {
                    "type": "string",
                    "description": "The canonical metric key, e.g. 'electricity_kwh', 'scope1_total_tco2e'.",
                },
                "period": {
                    "type": "string",
                    "description": "Reporting period (fiscal year), e.g. 'FY24-25'. If null, uses the session fiscal_year.",
                },
                "scope_node_id": {
                    "type": "string",
                    "description": "Optional scope node ID. If null, returns the entity-level roll-up.",
                },
            },
            "required": ["canonical_key"],
        },
    },
    "get_calc_run": {
        "name": "get_calc_run",
        "description": "Fetch the full calculation lineage for a given calc_run_id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "run_id": {"type": "string", "description": "calc_run_id from a metric event."},
            },
            "required": ["run_id"],
        },
    },
    "search_documents": {
        "name": "search_documents",
        "description": (
            "Hybrid (BM25 + dense + reranker) search over the tenant's "
            "policy/evidence/framework-reference corpus. Returns the top "
            "matching chunks with document IDs and page numbers."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "top_k": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 20,
                    "description": "Number of chunks to return. Default 6.",
                },
                "filter_document_type": {
                    "type": "string",
                    "enum": [
                        "policy",
                        "report",
                        "evidence",
                        "framework_reference",
                        "extraction_output",
                        "calculation_log",
                    ],
                },
            },
            "required": ["query"],
        },
    },
    "get_framework_completion": {
        "name": "get_framework_completion",
        "description": (
            "Get the current completion status for a framework, per disclosure. "
            "Returns counts of answered / pending / draft / approved sections."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "framework": {
                    "type": "string",
                    "enum": ["BRSR", "GRI", "SASB", "TCFD", "IFRS_S1", "IFRS_S2", "CSRD_ESRS", "CDP"],
                },
                "fy": {"type": "string", "description": "Fiscal year, e.g. 'FY24-25'."},
            },
            "required": ["framework", "fy"],
        },
    },
    "get_peer_benchmarks": {
        "name": "get_peer_benchmarks",
        "description": (
            "Return peer aggregate statistics (mean, median, p25, p75) for a "
            "canonical metric in a given sector. Use to compute z-score / "
            "percentile vs industry."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "canonical_key": {"type": "string"},
                "sector": {
                    "type": "string",
                    "enum": ["IT_SERVICES", "MANUFACTURING", "BANKING", "PHARMA", "ENERGY"],
                },
                "value": {
                    "type": "number",
                    "description": "The customer's value to position against the peer distribution.",
                },
            },
            "required": ["canonical_key", "sector"],
        },
    },
    "list_recent_changes": {
        "name": "list_recent_changes",
        "description": "Return entities (metrics / disclosures / documents) edited or recalculated within N days.",
        "input_schema": {
            "type": "object",
            "properties": {
                "entity_type": {
                    "type": "string",
                    "enum": ["metric", "disclosure", "document", "calc_run"],
                },
                "days": {"type": "integer", "minimum": 1, "maximum": 365},
            },
            "required": ["entity_type", "days"],
        },
    },
}


class ToolRegistry:
    def __init__(self) -> None:
        self._handlers: dict[str, ToolHandler] = {
            "get_metric": self._get_metric,
            "get_calc_run": self._get_calc_run,
            "search_documents": self._search_documents,
            "get_framework_completion": self._get_framework_completion,
            "get_peer_benchmarks": self._get_peer_benchmarks,
            "list_recent_changes": self._list_recent_changes,
        }

    def tool_definitions(self, names: list[str]) -> list[dict[str, Any]]:
        return [_TOOL_SCHEMAS[n] for n in names if n in _TOOL_SCHEMAS]

    async def run(self, name: str, args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        handler = self._handlers.get(name)
        if handler is None:
            raise ValueError(f"Unknown tool: {name}")
        return await handler(args, ctx)

    # ---- handlers ----
    async def _get_metric(self, args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        canonical_key = args["canonical_key"]
        period = args.get("period") or ctx.fiscal_year
        if not period:
            return {"error": "period not provided and no fiscal_year in session"}
        return await backend_client.get_metric_series(
            tenant_id=ctx.principal.tenant_id,
            user_id=ctx.principal.user_id,
            canonical_key=canonical_key,
            period=period,
            scope_node_id=args.get("scope_node_id"),
        )

    async def _get_calc_run(self, args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        return await backend_client.get_calc_run(
            tenant_id=ctx.principal.tenant_id,
            user_id=ctx.principal.user_id,
            run_id=args["run_id"],
        )

    async def _search_documents(self, args: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
        from app.rag.retriever import HybridRetriever

        retriever = HybridRetriever()
        chunks = await retriever.retrieve(
            tenant_id=ctx.principal.tenant_id,
            query=args["query"],
            top_k=args.get("top_k", 6),
            filter_document_type=args.get("filter_document_type"),
        )
        return {"chunks": [c.to_dict() for c in chunks]}

    async def _get_framework_completion(
        self, args: dict[str, Any], ctx: ToolContext
    ) -> dict[str, Any]:
        return await backend_client.get_framework_completion(
            tenant_id=ctx.principal.tenant_id,
            user_id=ctx.principal.user_id,
            framework=args["framework"],
            fiscal_year=args["fy"],
        )

    async def _get_peer_benchmarks(
        self, args: dict[str, Any], ctx: ToolContext
    ) -> dict[str, Any]:
        stats = get_peer_stats(args["canonical_key"], args["sector"])
        if stats is None:
            return {
                "canonical_key": args["canonical_key"],
                "sector": args["sector"],
                "found": False,
            }
        out: dict[str, Any] = {
            "canonical_key": stats.canonical_key,
            "sector": stats.sector,
            "found": True,
            "sample_size": stats.sample_size,
            "mean": stats.mean,
            "median": stats.median,
            "std": stats.std,
            "p25": stats.p25,
            "p75": stats.p75,
        }
        if "value" in args and args["value"] is not None:
            out["position"] = compute_position(float(args["value"]), stats)
        return out

    async def _list_recent_changes(
        self, args: dict[str, Any], ctx: ToolContext
    ) -> dict[str, Any]:
        return await backend_client.list_recent_changes(
            tenant_id=ctx.principal.tenant_id,
            user_id=ctx.principal.user_id,
            entity_type=args["entity_type"],
            days=int(args["days"]),
        )
