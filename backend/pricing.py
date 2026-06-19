"""Pricing + cost engine for Claude Code usage.

Rates are USD per 1,000,000 tokens. Cache multipliers apply to the *input* rate:
  - cache read         = 0.10x input
  - cache write 5-min  = 1.25x input
  - cache write 1-hour = 2.00x input

Modifiers (stack per Anthropic docs):
  - Fast mode (usage.speed == "fast"): premium Opus rates
  - Batch tier (usage.service_tier == "batch"): 50% off token rates
  - US inference (usage.inference_geo == "us"): 1.1x on supported models
  - Cloud regional endpoints (env CLOUD_ENDPOINT=regional): 1.1x Bedrock/Vertex premium
  - Negotiated enterprise discount (env ENTERPRISE_DISCOUNT_MULT): scales token rates

Tool surcharges (server_tool_use): web search $10 / 1,000 requests.

Source: https://docs.anthropic.com/en/docs/about-claude/pricing (June 2026)

Costs are framed as "equivalent API cost" — what the usage would cost on the
pay-as-you-go API. Subscription (Max/Pro/Team) users don't actually pay per token
for included usage; Enterprise is seat fee + metered API rates.
"""

from __future__ import annotations

import os

# (input_per_mtok, output_per_mtok). Matched by longest model-id prefix.
PRICING: dict[str, tuple[float, float]] = {
    # Current flagship / frontier
    "claude-fable-5": (10.0, 50.0),
    "claude-mythos-5": (10.0, 50.0),
    "claude-mythos-preview": (10.0, 50.0),
    # Opus 4.x (current gen)
    "claude-opus-4-8": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-opus-4-6": (5.0, 25.0),
    "claude-opus-4-5": (5.0, 25.0),
    # Opus 4.x (legacy / retired)
    "claude-opus-4-1": (15.0, 75.0),
    "claude-opus-4": (15.0, 75.0),
    # Sonnet 4.x
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-sonnet-4-5": (3.0, 15.0),
    "claude-sonnet-4": (3.0, 15.0),
    # Haiku 4.x / 3.x
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-3-5-haiku": (0.80, 4.0),
    "claude-3-haiku": (0.25, 1.25),
    # Claude 3.x legacy IDs (API uses claude-3-* not claude-*-3)
    "claude-3-7-sonnet": (3.0, 15.0),
    "claude-3-5-sonnet": (3.0, 15.0),
    "claude-3-sonnet": (3.0, 15.0),
    "claude-3-opus": (15.0, 75.0),
}

# Fast mode premium rates ($/MTok) when usage.speed == "fast" (not combinable with Batch).
FAST_MODE: dict[str, tuple[float, float]] = {
    "claude-opus-4-8": (10.0, 50.0),
    "claude-opus-4-7": (30.0, 150.0),
    "claude-opus-4-6": (30.0, 150.0),
}

# Official batch rates = 50% of standard (also derivable; kept explicit for parity with docs).
BATCH_PRICING: dict[str, tuple[float, float]] = {
    k: (round(i * 0.5, 4), round(o * 0.5, 4)) for k, (i, o) in PRICING.items()
}

# Models that support inference_geo == "us" (1.1x on all token categories).
_INFERENCE_GEO_US_PREFIXES = (
    "claude-fable-5",
    "claude-mythos-5",
    "claude-mythos-preview",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-sonnet-4-6",
)

CACHE_READ_MULT = 0.10
CACHE_WRITE_5M_MULT = 1.25
CACHE_WRITE_1H_MULT = 2.00
BATCH_DISCOUNT = 0.50
INFERENCE_GEO_US_MULT = 1.10
CLOUD_REGIONAL_MULT = 1.10  # Bedrock / Vertex regional & multi-region endpoints

# Tool & platform surcharges (USD)
WEB_SEARCH_PER_REQUEST = 10.0 / 1_000  # $10 per 1,000 searches
MANAGED_AGENT_SESSION_HOUR = 0.08  # Claude Managed Agents runtime
CODE_EXECUTION_HOUR = 0.05  # container-hour beyond free tier
CCU_PER_USD = 100  # Claude Platform on AWS: 100 CCU = $1.00

_FALLBACK = PRICING["claude-opus-4-8"]

# Enterprise / subscription catalog (seat fees are monthly; token rates use PRICING above).
ENTERPRISE_PLANS: list[dict] = [
    {
        "id": "api_standard",
        "name": "API — Standard tier",
        "group": "API",
        "kind": "metered",
        "factor": 1.0,
        "note": "Default pay-as-you-go. Priority Tier uses the same per-token rates with committed capacity.",
    },
    {
        "id": "api_priority",
        "name": "API — Priority Tier",
        "group": "API",
        "kind": "metered",
        "factor": 1.0,
        "note": "Same token rates as Standard; production SLA via committed input/output TPM (1–12 mo).",
    },
    {
        "id": "api_batch",
        "name": "API — Batch tier (−50%)",
        "group": "API",
        "kind": "metered",
        "factor": 0.5,
        "note": "Asynchronous batch processing. Auto-detected when usage.service_tier is batch.",
    },
    {
        "id": "aws_ccu",
        "name": "Claude Platform on AWS (CCU)",
        "group": "Enterprise",
        "kind": "metered",
        "factor": 1.0,
        "note": "Token usage rated at API rates, converted to CCUs at 100 CCU = $1. Negotiated discounts apply before CCU conversion.",
    },
    {
        "id": "team_std",
        "name": "Team — standard seat",
        "group": "Enterprise",
        "kind": "flat",
        "monthly": 25.0,
        "monthly_annual": 20.0,
        "per_seat": True,
        "note": "Per user/month. Usage billed at standard API rates on top of seat fee.",
    },
    {
        "id": "team_prem",
        "name": "Team — premium seat",
        "group": "Enterprise",
        "kind": "flat",
        "monthly": 125.0,
        "monthly_annual": 100.0,
        "per_seat": True,
        "note": "Higher usage limits per seat. Overage at standard API rates.",
    },
    {
        "id": "enterprise_seat",
        "name": "Enterprise — seat + API",
        "group": "Enterprise",
        "kind": "flat",
        "monthly": 20.0,
        "per_seat": True,
        "note": "Negotiated contract. ~$20/seat/mo plus all token usage at API rates (volume discounts case-by-case).",
    },
    {
        "id": "enterprise_negotiated",
        "name": "Enterprise — negotiated discount",
        "group": "Enterprise",
        "kind": "metered",
        "factor": 0.7,
        "note": "Illustrative private-offer discount on API rates. Set ENTERPRISE_DISCOUNT_MULT env to your contract factor.",
    },
    {
        "id": "bedrock_regional",
        "name": "Bedrock / Vertex — regional endpoint (+10%)",
        "group": "Enterprise",
        "kind": "metered",
        "factor": 1.1,
        "note": "Regional & multi-region cloud endpoints. Set CLOUD_ENDPOINT=regional or auto from usage when available.",
    },
    {
        "id": "inference_us",
        "name": "US-only inference (+10%)",
        "group": "Enterprise",
        "kind": "metered",
        "factor": 1.1,
        "note": "Auto-applied when usage.inference_geo is us on Opus 4.6+, Sonnet 4.6+, Fable/Mythos.",
    },
]


def _match_prefix(model: str, table: dict[str, tuple[float, float]]) -> tuple[float, float] | None:
    for prefix in sorted(table, key=len, reverse=True):
        if model.startswith(prefix):
            return table[prefix]
    return None


def _supports_inference_geo_us(model: str) -> bool:
    return any(model.startswith(p) for p in _INFERENCE_GEO_US_PREFIXES)


def _is_batch_tier(usage: dict | None) -> bool:
    return bool(usage and (usage.get("service_tier") or "").lower() == "batch")


def _cloud_regional_enabled() -> bool:
    return os.environ.get("CLOUD_ENDPOINT", "").lower() in (
        "regional",
        "bedrock_regional",
        "vertex_regional",
        "multi_region",
    )


def _enterprise_discount_mult() -> float:
    raw = os.environ.get("ENTERPRISE_DISCOUNT_MULT", "1")
    try:
        v = float(raw)
        return v if 0 < v <= 1 else 1.0
    except ValueError:
        return 1.0


def model_rates(model: str | None, usage: dict | None = None) -> tuple[tuple[float, float], bool]:
    """Return ((input_rate, output_rate), estimated) in USD per MTok.

    `<synthetic>` and empty models are local/non-billable -> zero cost.
    Unknown models fall back to Opus 4.8 rates flagged as estimated.
    """
    if not model or model == "<synthetic>":
        return (0.0, 0.0), False

    estimated = False
    rates = _match_prefix(model, PRICING)
    if rates is None:
        rates = _FALLBACK
        estimated = True

    in_rate, out_rate = rates
    is_batch = _is_batch_tier(usage)

    if is_batch:
        batch = _match_prefix(model, BATCH_PRICING)
        if batch is not None:
            in_rate, out_rate = batch
        else:
            in_rate *= BATCH_DISCOUNT
            out_rate *= BATCH_DISCOUNT
    elif usage and (usage.get("speed") or "").lower() == "fast":
        fast = _match_prefix(model, FAST_MODE)
        if fast is not None:
            in_rate, out_rate = fast

    if usage and (usage.get("inference_geo") or "").lower() == "us":
        if _supports_inference_geo_us(model):
            in_rate *= INFERENCE_GEO_US_MULT
            out_rate *= INFERENCE_GEO_US_MULT

    if _cloud_regional_enabled():
        in_rate *= CLOUD_REGIONAL_MULT
        out_rate *= CLOUD_REGIONAL_MULT

    discount = _enterprise_discount_mult()
    if discount != 1.0:
        in_rate *= discount
        out_rate *= discount

    return (in_rate, out_rate), estimated


def token_cost(usage: dict | None, model: str | None) -> float:
    """USD for input/output/cache tokens only."""
    if not usage:
        return 0.0
    (in_rate, out_rate), _ = model_rates(model, usage)
    if in_rate == 0.0 and out_rate == 0.0:
        return 0.0

    input_tokens = usage.get("input_tokens", 0) or 0
    output_tokens = usage.get("output_tokens", 0) or 0
    cache_read = usage.get("cache_read_input_tokens", 0) or 0

    cc = usage.get("cache_creation") or {}
    eph_5m = cc.get("ephemeral_5m_input_tokens", 0) or 0
    eph_1h = cc.get("ephemeral_1h_input_tokens", 0) or 0
    if not cc:
        eph_5m = usage.get("cache_creation_input_tokens", 0) or 0

    cost = (
        input_tokens * in_rate
        + output_tokens * out_rate
        + cache_read * CACHE_READ_MULT * in_rate
        + eph_5m * CACHE_WRITE_5M_MULT * in_rate
        + eph_1h * CACHE_WRITE_1H_MULT * in_rate
    )
    return cost / 1_000_000.0


def tool_surcharges(usage: dict | None) -> float:
    """USD for server-side tools (web search, etc.)."""
    if not usage:
        return 0.0
    stu = usage.get("server_tool_use") or {}
    web = stu.get("web_search_requests", 0) or 0
    return web * WEB_SEARCH_PER_REQUEST


def message_cost(usage: dict | None, model: str | None) -> float:
    """Equivalent API cost in USD for one assistant message (tokens + tool surcharges)."""
    return token_cost(usage, model) + tool_surcharges(usage)


def cache_savings(usage: dict | None, model: str | None) -> float:
    """USD saved by reading from cache instead of paying full input price."""
    if not usage:
        return 0.0
    (in_rate, _), _ = model_rates(model, usage)
    if in_rate == 0.0:
        return 0.0
    cache_read = usage.get("cache_read_input_tokens", 0) or 0
    return cache_read * (1.0 - CACHE_READ_MULT) * in_rate / 1_000_000.0


def usd_to_ccu(usd: float) -> float:
    """Convert USD equivalent cost to Claude Consumption Units (AWS Marketplace)."""
    return usd * CCU_PER_USD


def pricing_catalog() -> dict:
    """Full pricing reference for /api/meta."""
    return {
        "models": {
            m: {"input": i, "output": o, "fast_mode": m in FAST_MODE}
            for m, (i, o) in PRICING.items()
        },
        "fast_mode": {m: {"input": i, "output": o} for m, (i, o) in FAST_MODE.items()},
        "batch": {m: {"input": i, "output": o} for m, (i, o) in BATCH_PRICING.items()},
        "modifiers": {
            "cache_read_mult": CACHE_READ_MULT,
            "cache_write_5m_mult": CACHE_WRITE_5M_MULT,
            "cache_write_1h_mult": CACHE_WRITE_1H_MULT,
            "batch_discount": BATCH_DISCOUNT,
            "inference_geo_us_mult": INFERENCE_GEO_US_MULT,
            "cloud_regional_mult": CLOUD_REGIONAL_MULT,
            "enterprise_discount_mult": _enterprise_discount_mult(),
            "cloud_endpoint": os.environ.get("CLOUD_ENDPOINT", "global"),
        },
        "tools": {
            "web_search_per_request": WEB_SEARCH_PER_REQUEST,
            "managed_agent_session_hour": MANAGED_AGENT_SESSION_HOUR,
            "code_execution_hour": CODE_EXECUTION_HOUR,
        },
        "ccu": {"per_usd": CCU_PER_USD, "usd_per_ccu": 1.0 / CCU_PER_USD},
        "enterprise_plans": ENTERPRISE_PLANS,
    }
