"""The plan's product quantities against the product tables PAU prints for each crop.

PAU's Package of Practices gives, for a medium-fertility soil, kg per acre of urea, DAP (or single
superphosphate, or nitrophosphate) and muriate of potash. This test runs the engine at that soil and
checks the plan lands on PAU's numbers, so a change to the doses, the credit for the nitrogen DAP carries,
or the phosphorus product cannot quietly move what a farmer is told to buy.

Where PAU lists urea next to DAP it says how much to cut urea when DAP is used (20 kg for 55 kg DAP, 10 kg
for 27 kg DAP). The expected urea below is PAU's urea figure minus that cut. Tolerance is 6%: PAU rounds
to whole bags and the engine converts from kg/ha.

Sources: PAU Package of Practices for Crops of Punjab, Rabi 2025-26 (wheat, barley) and Kharif 2026 (rice,
maize, cotton, sugarcane). Chickpea is not here: its table is not in the manual text that was checked.
"""

from datetime import date

import pytest

from src.api.schemas import RecommendRequest
from src.engine.recommendation_engine import Engine, recommend

TODAY = date(2026, 10, 22)
TOLERANCE = 0.06
MEDIUM = {"n": 300, "p": 15, "k": 150, "ph": 7.0, "organic_carbon": 0.6, "moisture": 30}
LOW_K = {**MEDIUM, "k": 60}
LOW_P = {**MEDIUM, "p": 5}
FIRST_STAGE = {"wheat": "sowing", "barley": "sowing", "rice": "transplanting", "maize": "sowing", "cotton": "sowing", "sugarcane": "planting"}


@pytest.fixture(scope="module")
def engine():
    return Engine()


def totals(engine, crop, soil, variety=None):
    request = RecommendRequest(
        field_id="f", crop_type=crop, variety=variety, irrigation="irrigated", growth_stage=FIRST_STAGE[crop], soil=soil,
        weather={"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"}, previous_fertilizer_usage=[],
    )
    out: dict[str, float] = {}
    for item in recommend(request, engine, TODAY).recommendation.schedule:
        out[item.fertilizer_type] = out.get(item.fertilizer_type, 0.0) + item.quantity_kg_per_acre
    return out


# (crop, variety, soil, {product: PAU kg/acre})
CASES = [
    ("wheat", None, MEDIUM, {"dap": 55, "urea": 110 - 20}),
    ("wheat", None, LOW_K, {"mop": 20}),  # PAU: 20 kg muriate of potash on soil testing low in potassium
    ("barley", None, MEDIUM, {"dap": 27, "urea": 45}),  # PAU: apply 45 kg urea if the recommended DAP is applied
    ("barley", None, LOW_K, {"mop": 10}),
    ("maize", None, MEDIUM, {"dap": 55, "urea": 110 - 20}),
    ("rice", None, MEDIUM, {"urea": 90}),  # PAU: phosphorus and potassium only when the soil test shows deficiency
    ("cotton", None, MEDIUM, {"dap": 27, "urea": 120 - 10}),  # the general cotton dose is PAU's Bt hybrids row
    ("cotton", "bt", MEDIUM, {"dap": 27, "urea": 80 - 10}),
    ("cotton", "non_bt", MEDIUM, {"dap": 27, "urea": 65 - 10}),
    ("sugarcane", None, MEDIUM, {"urea": 130}),
    ("sugarcane", None, LOW_P, {"ssp": 75}),  # PAU: 75 kg single superphosphate on soil low in phosphorus
    ("sugarcane", None, LOW_K, {"mop": 50}),
]


@pytest.mark.parametrize("crop,variety,soil,expected", CASES, ids=[f"{c}-{v or 'general'}-{sorted(e)}" for c, v, _, e in CASES])
def test_the_plan_lands_on_the_pau_product_table(engine, crop, variety, soil, expected):
    plan = totals(engine, crop, soil, variety)
    for product, pau_kg in expected.items():
        assert plan.get(product, 0.0) == pytest.approx(pau_kg, rel=TOLERANCE), (crop, variety, product, plan)


def test_the_rice_plan_has_no_phosphorus_or_potash_on_a_medium_soil(engine):
    assert set(totals(engine, "rice", MEDIUM)) == {"urea"}


def test_sugarcane_phosphorus_comes_as_single_superphosphate_not_dap(engine):
    plan = totals(engine, "sugarcane", LOW_P)
    assert "ssp" in plan and "dap" not in plan


def test_every_crop_has_a_phosphorus_source_and_every_product_it_names_exists(engine):
    tables = engine.tables
    product_ids = {row["product_id"] for row in tables.fertilizer_products}
    by_crop = {row["crop_id"]: row for row in tables.phosphorus_sources}
    assert set(by_crop) == {row["crop_id"] for row in tables.crops}
    for crop, row in by_crop.items():
        named = [row["primary_product"], *[p for p in row["alternative_products"].split("|") if p]]
        assert set(named) <= product_ids, (crop, named)
        assert all(float(next(p for p in tables.fertilizer_products if p["product_id"] == name)["p2o5_pct"]) > 0 for name in named), crop


# ---- the same phosphorus from another product ---------------------------------------------------

def alternatives_note(engine, crop, soil):
    request = RecommendRequest(
        field_id="f", crop_type=crop, irrigation="irrigated", growth_stage=FIRST_STAGE[crop], soil=soil,
        weather={"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"}, previous_fertilizer_usage=[],
    )
    notes = recommend(request, engine, TODAY).explanation.data_notes
    return next((n for n in notes if "phosphorus fertilizer in PAU's table" in n), None)


def test_wheat_alternatives_match_pau_superphosphate_and_nitrophosphate_quantities(engine):
    """PAU: 55 kg DAP = 155 kg superphosphate = 125 kg nitrophosphate, all for 25 kg P2O5 per acre."""
    from src.engine.npk_calculator import phosphorus_alternatives

    schedule = [{"stage": "sowing", "fertilizer_type": "dap", "quantity_kg_per_acre": 54.35, "apply_by": None, "timing_note": None}]
    options = {o["product_id"]: o for o in phosphorus_alternatives(schedule, "wheat", engine.tables)["options"]}
    assert options["ssp"]["quantity_kg_per_acre"] == pytest.approx(155, rel=TOLERANCE)
    assert options["np_20_20_0"]["quantity_kg_per_acre"] == pytest.approx(125, rel=TOLERANCE)
    # superphosphate carries no nitrogen, so urea goes up by the nitrogen the DAP would have supplied
    assert options["ssp"]["urea_change_kg_per_acre"] == pytest.approx(54.35 * 0.18 / 0.46, abs=0.2)
    # nitrophosphate carries more nitrogen than DAP, so urea goes down
    assert options["np_20_20_0"]["urea_change_kg_per_acre"] < 0


def test_the_note_names_the_alternatives_and_the_urea_change(engine):
    note = alternatives_note(engine, "wheat", LOW_P)
    assert note.startswith("DAP is the phosphorus fertilizer in PAU's table for wheat")
    assert "SSP (Single Superphosphate)" in note and "NP 20-20-0" in note and "more urea" in note and "less urea" in note
    assert "also supplies sulphur" in note


def test_sugarcane_note_offers_dap_as_the_alternative(engine):
    note = alternatives_note(engine, "sugarcane", LOW_P)
    assert note.startswith("SSP (Single Superphosphate) is the phosphorus fertilizer in PAU's table for sugarcane")
    assert "DAP:" in note and "less urea" in note


def test_no_phosphorus_in_the_plan_means_no_alternatives_note(engine):
    assert alternatives_note(engine, "rice", MEDIUM) is None


# ---- varieties ---------------------------------------------------------------------------------

def test_the_note_tells_the_farmer_when_pau_has_a_dose_for_their_variety(engine):
    request = RecommendRequest(
        field_id="f", crop_type="cotton", irrigation="irrigated", growth_stage="sowing", soil=MEDIUM,
        weather={"temperature_c": 25, "humidity_pct": 50, "rainfall_mm_forecast": 0, "source": "live"}, previous_fertilizer_usage=[],
    )
    notes = recommend(request, engine, TODAY).explanation.data_notes
    assert any("different cotton dose for Non-Bt cotton and Bt cotton" in n for n in notes)
    chosen = recommend(request.model_copy(update={"variety": "bt"}), engine, TODAY).explanation.data_notes
    assert not any("different cotton dose" in n for n in chosen)


def test_cotton_nitrogen_follows_the_variety_type(engine):
    urea = {v: totals(engine, "cotton", MEDIUM, v)["urea"] for v in (None, "bt", "non_bt")}
    assert urea["non_bt"] < urea["bt"] < urea[None]
