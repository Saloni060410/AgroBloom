import pytest

from src.evaluation.explainability import (
    TemplateError,
    _load_templates,
    _numeric_effect,
    explain,
    render_template,
)

FEATURES = {
    "crop_id": "wheat", "variety_id": "generic",
    "n": 200.0, "p": 15.0, "k": 120.0,
    "temperature_c": 26.0, "humidity_pct": 52.0, "moisture_pct": 40.0,
}

# A hand-written rule_trace matching npk_calculator.py's real shape/rule_ids, with distinct
# effect magnitudes so top_k ranking is unambiguous to assert on.
RULE_TRACE = [
    {
        "rule_id": "dose_reference", "nutrient": "n", "value": 123.6, "threshold": None,
        "effect": "+123.6 kg/ha", "params": {"variety_id": "generic", "irrigation": "irrigated"},
    },
    {
        "rule_id": "soil_adjustment", "nutrient": "k", "value": 150, "threshold": "low",
        "effect": "+29.7 kg/ha", "params": {"soil_rating": "low"},
    },
    {
        "rule_id": "prior_credit", "nutrient": "n", "value": 8.5, "threshold": 60,
        "effect": "-8.5 kg/ha", "params": {"raw_kg_ha": 20.0, "efficiency": 0.426},
    },
    {
        "rule_id": "credit_ignored_unknown_product", "nutrient": "p", "value": None, "threshold": None,
        "effect": "ignored for credit and cost", "params": {"unknown_product_ids": ["mystery_brand"]},
    },
]


def test_numeric_effect_ranks_by_magnitude_and_zero_for_non_numeric():
    assert _numeric_effect(RULE_TRACE[0]) == pytest.approx(123.6)
    assert _numeric_effect(RULE_TRACE[1]) == pytest.approx(29.7)
    assert _numeric_effect(RULE_TRACE[2]) == pytest.approx(8.5)
    assert _numeric_effect(RULE_TRACE[3]) == 0.0  # "ignored for credit and cost" -- not invented


def test_explain_returns_exactly_top_k_sentences_with_no_prediction():
    sentences = explain(FEATURES, None, RULE_TRACE, top_k=3)
    assert len(sentences) == 3
    assert all(isinstance(s, str) and s for s in sentences)


def test_soil_adjustment_sentence_does_not_double_the_unit():
    # Regression: entry["effect"] is already a full string like "+29.7 kg/ha" -- an earlier
    # template version appended a second literal "kg/ha" after {effect}, producing
    # "+29.7 kg/ha kg/ha". Caught by actually reading the rendered sentence, not just
    # checking that render_template() didn't raise.
    sentence = explain(FEATURES, None, [RULE_TRACE[1]], top_k=1)[0]
    assert "kg/ha kg/ha" not in sentence
    assert "+29.7 kg/ha" in sentence


def test_explain_ranks_by_absolute_effect_largest_first():
    sentences = explain(FEATURES, None, RULE_TRACE, top_k=2)
    # dose_reference (123.6) then soil_adjustment (29.7) -- prior_credit (8.5) excluded at top_k=2
    assert "123.6" in sentences[0]
    assert "29.7" in sentences[1] or "low" in sentences[1]


def test_explain_never_exceeds_top_k_when_more_items_exist():
    sentences = explain(FEATURES, None, RULE_TRACE, top_k=1)
    assert len(sentences) == 1


def test_explain_handles_fewer_items_than_top_k():
    sentences = explain(FEATURES, None, RULE_TRACE[:1], top_k=3)
    assert len(sentences) == 1


def test_explain_skips_unknown_rule_ids_without_crashing():
    trace = [{"rule_id": "some_future_rule_id", "nutrient": None, "value": 999,
              "threshold": None, "effect": "+999 kg/ha", "params": {}}]
    assert explain(FEATURES, None, trace, top_k=3) == []


def test_explain_appends_one_product_choice_sentence_when_prediction_given(monkeypatch):
    class _FakeClf:
        def __init__(self):
            import numpy as np
            self.feature_importances_ = np.array([0.9] + [0.01] * 10)

    class _FakePipeline:
        def __init__(self):
            self.named_steps = {"clf": _FakeClf()}

    monkeypatch.setattr(
        "src.evaluation.explainability._load_active_classifier",
        lambda: (_FakePipeline(), ["urea", "dap"]),
    )
    prediction = [{"product": "urea", "probability": 0.7}]
    sentences = explain(FEATURES, prediction, RULE_TRACE, top_k=2)
    assert len(sentences) == 3  # 2 rule_trace sentences + 1 product-choice sentence


def test_explain_omits_product_sentence_when_no_model_registered(monkeypatch):
    monkeypatch.setattr(
        "src.evaluation.explainability._load_active_classifier",
        lambda: (None, None),
    )
    prediction = [{"product": "urea", "probability": 0.7}]
    sentences = explain(FEATURES, prediction, RULE_TRACE, top_k=2)
    assert len(sentences) == 2  # model unavailable -- rule_trace sentences only, no crash


def test_render_template_raises_for_unknown_id():
    with pytest.raises(TemplateError, match="not found"):
        render_template("rule.does_not_exist")


def test_render_template_raises_for_missing_param():
    with pytest.raises(TemplateError, match="missing param"):
        render_template("rule.dose_reference", crop="wheat", nutrient_label="N")


def test_every_rule_and_risk_template_renders_with_sample_params():
    """Every template in explanation_templates.yaml renders in both en and hi with a
    generic sample-params dict -- catches a template referencing a placeholder no caller
    would ever supply."""
    sample_params = {
        "value": 123.6, "adjustment": 29.7, "effect": "+29.7 kg/ha", "nutrient_label": "N",
        "crop": "wheat", "irrigation": "irrigated", "soil_rating": "low",
        "target_yield_q_ha": 50, "raw_kg_ha": 20.0, "unknown_product_ids": "mystery_brand",
        "classifier_choice": "urea", "balance_choice": "dap", "feature_label": "soil nitrogen",
        "feature_value": 200.0, "product": "urea", "ratio_pct": 150, "applied": 200.0,
        "needed": 123.6, "high_nutrient_label": "N", "high_ratio_pct": 200, "low_nutrient_label": "P2O5",
        "low_ratio_pct": 40, "low_below": 6.5, "high_above": 7.5, "rainfall": 25,
        # history.* templates (engine/history.py)
        "label": "Nitrogen (N)", "now": "800", "before": "300", "unit": "kg/ha", "date": "12 Sep 2026",
        "before_rating": "medium", "now_rating": "low", "first": "0.62", "n": 4,
    }
    templates = _load_templates()
    for template_id in templates:
        for language in ("en", "hi"):
            rendered = render_template(template_id, language=language, **sample_params)
            assert rendered and "{" not in rendered  # no unfilled placeholder slipped through
