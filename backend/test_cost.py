"""Unit tests for the cost engine, against a real captured usage block."""

import os

from pricing import (
    BATCH_DISCOUNT,
    CACHE_READ_MULT,
    CACHE_WRITE_1H_MULT,
    CACHE_WRITE_5M_MULT,
    INFERENCE_GEO_US_MULT,
    WEB_SEARCH_PER_REQUEST,
    cache_savings,
    message_cost,
    model_rates,
    pricing_catalog,
    token_cost,
    tool_surcharges,
    usd_to_ccu,
)

# Captured from a real ~/.claude assistant message (claude-opus-4-8):
USAGE = {
    "input_tokens": 8935,
    "cache_creation_input_tokens": 2135,
    "cache_read_input_tokens": 16310,
    "output_tokens": 326,
    "cache_creation": {"ephemeral_1h_input_tokens": 2135, "ephemeral_5m_input_tokens": 0},
    "speed": "standard",
    "inference_geo": "global",
}


def test_opus_cost_matches_hand_calc():
    # Opus 4.8: $5 in / $25 out per 1M. cache read 0.1x, 1h write 2.0x.
    expected = (
        8935 * 5 + 326 * 25 + 16310 * 0.10 * 5 + 2135 * 2.00 * 5
    ) / 1_000_000
    assert abs(message_cost(USAGE, "claude-opus-4-8") - expected) < 1e-9


def test_5m_vs_1h_writes_priced_differently():
    u5 = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation": {"ephemeral_5m_input_tokens": 1000, "ephemeral_1h_input_tokens": 0},
    }
    u1 = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 1000},
    }
    c5 = message_cost(u5, "claude-opus-4-8")
    c1 = message_cost(u1, "claude-opus-4-8")
    assert c5 == 1000 * CACHE_WRITE_5M_MULT * 5 / 1_000_000
    assert c1 == 1000 * CACHE_WRITE_1H_MULT * 5 / 1_000_000
    assert c1 > c5


def test_synthetic_model_is_free():
    assert message_cost(USAGE, "<synthetic>") == 0.0
    assert message_cost(USAGE, None) == 0.0


def test_haiku_dated_id_matches_prefix():
    (i, o), est = model_rates("claude-haiku-4-5-20251001")
    assert (i, o) == (1.0, 5.0)
    assert est is False


def test_unknown_model_falls_back_estimated():
    (i, o), est = model_rates("claude-future-9")
    assert (i, o) == (5.0, 25.0)
    assert est is True


def test_cache_savings_positive():
    s = cache_savings(USAGE, "claude-opus-4-8")
    assert s == 16310 * (1.0 - CACHE_READ_MULT) * 5 / 1_000_000
    assert s > 0


def test_claude_3_opus_legacy_id():
    (i, o), est = model_rates("claude-3-opus-20240229")
    assert (i, o) == (15.0, 75.0)
    assert est is False


def test_claude_3_sonnet_legacy_id():
    (i, o), est = model_rates("claude-3-sonnet-20240229")
    assert (i, o) == (3.0, 15.0)
    assert est is False


def test_opus_41_not_matched_as_opus_4():
    (i, o), _ = model_rates("claude-opus-4-1-20250805")
    assert (i, o) == (15.0, 75.0)


def test_all_current_models_priced():
    cases = {
        "claude-fable-5": (10.0, 50.0),
        "claude-mythos-5": (10.0, 50.0),
        "claude-opus-4-8": (5.0, 25.0),
        "claude-opus-4-7": (5.0, 25.0),
        "claude-opus-4-6": (5.0, 25.0),
        "claude-opus-4-5-20251101": (5.0, 25.0),
        "claude-sonnet-4-6": (3.0, 15.0),
        "claude-sonnet-4-5-20250929": (3.0, 15.0),
        "claude-haiku-4-5-20251001": (1.0, 5.0),
        "claude-3-5-haiku-20241022": (0.80, 4.0),
    }
    for model, expected in cases.items():
        (i, o), est = model_rates(model)
        assert (i, o) == expected, model
        assert est is False, model


def test_fast_mode_opus_48():
    usage = {"input_tokens": 1000, "output_tokens": 500, "speed": "fast"}
    cost = message_cost(usage, "claude-opus-4-8")
    assert cost == (1000 * 10 + 500 * 50) / 1_000_000


def test_fast_mode_opus_47():
    usage = {"input_tokens": 1000, "output_tokens": 500, "speed": "fast"}
    cost = message_cost(usage, "claude-opus-4-7")
    assert cost == (1000 * 30 + 500 * 150) / 1_000_000


def test_fast_mode_unsupported_model_uses_standard():
    usage = {"input_tokens": 1000, "output_tokens": 500, "speed": "fast"}
    cost = message_cost(usage, "claude-sonnet-4-6")
    assert cost == (1000 * 3 + 500 * 15) / 1_000_000


def test_inference_geo_us_multiplier():
    usage = {
        "input_tokens": 10_000,
        "output_tokens": 1_000,
        "inference_geo": "us",
        "speed": "standard",
    }
    cost = message_cost(usage, "claude-sonnet-4-6")
    in_rate = 3.0 * INFERENCE_GEO_US_MULT
    out_rate = 15.0 * INFERENCE_GEO_US_MULT
    assert cost == (10_000 * in_rate + 1_000 * out_rate) / 1_000_000


def test_inference_geo_us_not_applied_to_legacy_sonnet():
    usage = {"input_tokens": 10_000, "output_tokens": 1_000, "inference_geo": "us"}
    cost = message_cost(usage, "claude-sonnet-4-5-20250929")
    assert cost == (10_000 * 3 + 1_000 * 15) / 1_000_000


def test_fast_mode_and_geo_stack():
    usage = {
        "input_tokens": 1000,
        "output_tokens": 500,
        "speed": "fast",
        "inference_geo": "us",
    }
    in_rate = 10.0 * INFERENCE_GEO_US_MULT
    out_rate = 50.0 * INFERENCE_GEO_US_MULT
    cost = message_cost(usage, "claude-opus-4-8")
    assert cost == (1000 * in_rate + 500 * out_rate) / 1_000_000


def test_batch_tier_half_price():
    usage = {
        "input_tokens": 10_000,
        "output_tokens": 2_000,
        "service_tier": "batch",
    }
    cost = message_cost(usage, "claude-opus-4-8")
    assert cost == (10_000 * 2.5 + 2_000 * 12.5) / 1_000_000


def test_batch_overrides_fast_mode():
    usage = {
        "input_tokens": 1000,
        "output_tokens": 500,
        "service_tier": "batch",
        "speed": "fast",
    }
    cost = message_cost(usage, "claude-opus-4-8")
    assert cost == (1000 * 2.5 + 500 * 12.5) / 1_000_000


def test_web_search_surcharge():
    usage = {
        "input_tokens": 100,
        "output_tokens": 50,
        "server_tool_use": {"web_search_requests": 3},
    }
    assert tool_surcharges(usage) == 3 * WEB_SEARCH_PER_REQUEST
    assert message_cost(usage, "claude-sonnet-4-6") == token_cost(usage, "claude-sonnet-4-6") + 3 * WEB_SEARCH_PER_REQUEST


def test_usd_to_ccu():
    assert usd_to_ccu(1.0) == 100.0
    assert usd_to_ccu(0.705) == 70.5


def test_pricing_catalog_includes_enterprise():
    cat = pricing_catalog()
    assert "enterprise_plans" in cat
    assert len(cat["enterprise_plans"]) >= 8
    assert "batch" in cat
    assert cat["ccu"]["per_usd"] == 100


def test_enterprise_discount_env(monkeypatch):
    monkeypatch.setenv("ENTERPRISE_DISCOUNT_MULT", "0.8")
    usage = {"input_tokens": 1_000_000, "output_tokens": 0}
    cost = message_cost(usage, "claude-opus-4-8")
    assert cost == 5.0 * 0.8
