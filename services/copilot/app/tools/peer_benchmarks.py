"""
Peer benchmark mock.

Until the peer-benchmark service ships, the Copilot returns realistic estimates
derived from publicly available aggregates (NSE 500 ESG reports, CDP India
disclosures). We compute z-score and percentile against the customer value.

The shape of the response matches what the real service will eventually return,
so swapping in the real client requires no agent-side changes.
"""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PeerStats:
    canonical_key: str
    sector: str
    sample_size: int
    mean: float
    median: float
    std: float
    p25: float
    p75: float


# Per-metric, per-sector aggregates. Numbers are sourced from publicly available
# ESG/BRSR disclosures across NSE 500 (FY23/FY24); intended as a stop-gap.
_PEER_TABLE: dict[tuple[str, str], PeerStats] = {
    ("ghg_intensity_per_revenue", "IT_SERVICES"): PeerStats(
        "ghg_intensity_per_revenue", "IT_SERVICES", 38, 7.4, 6.2, 3.1, 4.8, 9.6
    ),
    ("ghg_intensity_per_revenue", "MANUFACTURING"): PeerStats(
        "ghg_intensity_per_revenue", "MANUFACTURING", 52, 84.0, 71.0, 41.0, 52.0, 110.0
    ),
    ("ghg_intensity_per_revenue", "BANKING"): PeerStats(
        "ghg_intensity_per_revenue", "BANKING", 27, 2.8, 2.4, 1.4, 1.7, 3.6
    ),
    ("water_intensity_per_revenue", "IT_SERVICES"): PeerStats(
        "water_intensity_per_revenue", "IT_SERVICES", 38, 21.0, 18.0, 9.0, 13.0, 27.0
    ),
    ("water_intensity_per_revenue", "MANUFACTURING"): PeerStats(
        "water_intensity_per_revenue", "MANUFACTURING", 52, 410.0, 305.0, 240.0, 195.0, 540.0
    ),
    ("women_in_workforce_pct", "IT_SERVICES"): PeerStats(
        "women_in_workforce_pct", "IT_SERVICES", 38, 35.8, 35.0, 4.6, 32.5, 39.2
    ),
    ("women_in_workforce_pct", "MANUFACTURING"): PeerStats(
        "women_in_workforce_pct", "MANUFACTURING", 52, 14.2, 12.8, 6.1, 9.0, 17.5
    ),
    ("women_in_workforce_pct", "BANKING"): PeerStats(
        "women_in_workforce_pct", "BANKING", 27, 26.3, 25.7, 5.0, 22.0, 30.0
    ),
    ("ltifr", "IT_SERVICES"): PeerStats(
        "ltifr", "IT_SERVICES", 38, 0.08, 0.05, 0.12, 0.0, 0.12
    ),
    ("ltifr", "MANUFACTURING"): PeerStats(
        "ltifr", "MANUFACTURING", 52, 1.65, 1.4, 1.05, 0.8, 2.2
    ),
}


def get_peer_stats(canonical_key: str, sector: str) -> PeerStats | None:
    return _PEER_TABLE.get((canonical_key, sector))


def compute_position(value: float, stats: PeerStats) -> dict[str, float | str]:
    """Compute z-score and percentile of `value` against the stats distribution."""
    z = (value - stats.mean) / stats.std if stats.std > 0 else 0.0
    # Approximate percentile from z via normal CDF
    percentile = 0.5 * (1.0 + math.erf(z / math.sqrt(2.0))) * 100.0
    if value < stats.p25:
        bucket = "bottom_quartile"
    elif value < stats.median:
        bucket = "second_quartile"
    elif value < stats.p75:
        bucket = "third_quartile"
    else:
        bucket = "top_quartile"
    return {
        "value": value,
        "z_score": round(z, 3),
        "percentile": round(percentile, 1),
        "bucket": bucket,
    }
