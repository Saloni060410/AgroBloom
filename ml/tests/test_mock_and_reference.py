import json
from datetime import date
from pathlib import Path

from fastapi.testclient import TestClient

from src.api.main import app
from src.api.schemas import (
    FertilizerProduct,
    RecommendResponse,
    ReferenceCrop,
    RiskScoreResponse,
    SeasonalWeather,
    SoilRating,
)

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[2] / "docs" / "contract-fixtures"
MOCK_DATA = Path(__file__).resolve().parents[1] / "src" / "api" / "mock_data"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def recommend(**changes) -> dict:
    payload = load("recommend_request.json")
    for key, value in changes.items():
        if key in ("n", "p", "k"):
            payload["soil"][key] = value
        elif key == "rain":
            payload["weather"]["rainfall_mm_forecast"] = value
        elif key == "weather_source":
            payload["weather"]["source"] = value
        else:
            payload[key] = value
    response = client.post("/recommend", json=payload)
    assert response.status_code == 200, response.text
    RecommendResponse.model_validate(response.json())
    return response.json()


def totals(body: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for item in body["recommendation"]["schedule"]:
        out[item["fertilizer_type"]] = round(out.get(item["fertilizer_type"], 0) + item["quantity_kg_per_acre"], 1)
    return out


def test_mock_copies_of_the_fixtures_match_the_contract_fixtures():
    for name in ("recommend_response.json", "risk_score_response.json"):
        assert json.loads((MOCK_DATA / name).read_text()) == load(name)


# ---------- POST /recommend in mock mode ----------


def test_mock_recommend_reproduces_the_fixture_numbers_for_the_fixture_request():
    body, fixture = recommend(), load("recommend_response.json")
    assert body["model_version"] == "mock-0.0.0+rules-mock"
    assert body["recommendation"]["schedule"] == fixture["recommendation"]["schedule"]
    assert body["recommendation"]["fertilizer_type"] == "urea"
    assert body["recommendation"]["quantity_kg_per_acre"] == 87.5
    assert body["cost"] == fixture["cost"]
    assert body["impact"] == fixture["impact"]
    assert body["risk"]["level"] == fixture["risk"]["level"]
    assert body["explanation"]["nutrient_balance"] == fixture["explanation"]["nutrient_balance"]


def test_mock_recommend_is_deterministic():
    assert recommend() == recommend()


def test_mock_recommend_says_it_is_sample_output():
    assert "not a real recommendation" in recommend()["explanation"]["data_notes"][0]


def test_higher_soil_nitrogen_lowers_the_urea_quantity():
    assert totals(recommend(n=350))["urea"] < totals(recommend(n=210))["urea"] < totals(recommend(n=120))["urea"]


def test_potash_only_appears_when_soil_potassium_is_low():
    assert "mop" in totals(recommend(k=90))
    assert "mop" not in totals(recommend(k=200))


def test_sowing_date_shifts_the_dates():
    later = recommend(sowing_date="2026-11-15")
    fixture = load("recommend_response.json")["recommendation"]["schedule"]
    for shifted, original in zip(later["recommendation"]["schedule"], fixture, strict=True):
        if original["apply_by"] is None:
            assert shifted["apply_by"] is None
        else:
            gap = date.fromisoformat(shifted["apply_by"]) - date.fromisoformat(original["apply_by"])
            assert gap.days == 10


def test_an_unsourced_stage_date_stays_null_with_a_timing_note():
    item = next(i for i in recommend()["recommendation"]["schedule"] if i["stage"] == "crown_root_initiation")
    assert item["apply_by"] is None and item["timing_note"] == "At first irrigation"


def test_a_later_growth_stage_drops_the_stages_already_passed():
    stages = {i["stage"] for i in recommend(growth_stage="crown_root_initiation")["recommendation"]["schedule"]}
    assert stages == {"crown_root_initiation", "second_irrigation"}


def test_crop_variety_and_stage_are_reflected():
    body = recommend(crop_type="rice", variety="pr_132", growth_stage="transplanting")
    assert "rice (PR 132)" in body["explanation"]["top_factors"][0]
    assert body["recommendation"]["schedule"][0]["stage"] == "transplanting"


def test_no_previous_usage_gives_null_comparisons_and_low_risk():
    body = recommend(previous_fertilizer_usage=[])
    assert body["cost"]["previous_cost_inr_per_acre"] is None
    assert body["cost"]["saving_inr_per_acre"] is None
    assert body["impact"]["over_application_reduction_pct"] is None
    assert body["risk"]["level"] == "low"


def test_forecast_rain_delays_top_dressing_and_says_so():
    calm, wet = recommend(rain=0), recommend(rain=40)
    calm_second = next(i for i in calm["recommendation"]["schedule"] if i["stage"] == "second_irrigation")
    wet_second = next(i for i in wet["recommendation"]["schedule"] if i["stage"] == "second_irrigation")
    assert (date.fromisoformat(wet_second["apply_by"]) - date.fromisoformat(calm_second["apply_by"])).days == 2
    assert any("delayed" in note for note in wet["explanation"]["data_notes"])


def test_non_live_weather_is_noted():
    notes = recommend(weather_source="seasonal_average")["explanation"]["data_notes"]
    assert any("seasonal average" in note for note in notes)


def test_cost_breakdown_adds_up():
    cost = recommend()["cost"]
    assert sum(line["cost_inr_per_acre"] for line in cost["breakdown"]) == cost["estimated_cost_inr_per_acre"]


def test_the_six_soil_fields_are_still_required():
    payload = load("recommend_request.json")
    for field in ("n", "p", "k", "ph", "organic_carbon", "moisture"):
        broken = json.loads(json.dumps(payload))
        del broken["soil"][field]
        assert client.post("/recommend", json=broken).status_code == 422


# ---------- POST /risk-score in mock mode ----------


def score(planned: list[dict]) -> dict:
    payload = load("risk_score_request.json")
    payload["planned_application"] = planned
    response = client.post("/risk-score", json=payload)
    assert response.status_code == 200, response.text
    RiskScoreResponse.model_validate(response.json())
    return response.json()


def balanced(multiple: float) -> list[dict]:
    plan = {"dap": 54.4, "mop": 20.0, "urea": 87.5}
    return [{"fertilizer_type": p, "quantity_kg_per_acre": round(q * multiple, 1)} for p, q in plan.items()]


def test_mock_risk_score_matches_the_fixture_for_the_fixture_request():
    body, fixture = client.post("/risk-score", json=load("risk_score_request.json")).json(), load("risk_score_response.json")
    for key in ("level", "reason", "soil_health_impact", "over_application_pct"):
        assert body["risk"][key] == fixture["risk"][key]
    # The fixture only names phosphorus as short. The mock also names potash, which is also unplanned.
    assert body["risk"]["yield_impact"].startswith("Yield does not rise past crop need. Unbalanced feeding can lower it")
    assert body["nutrient_balance"] == fixture["nutrient_balance"]
    assert body["model_version"] == "mock-0.0.0+rules-mock"


def test_risk_rises_with_the_planned_quantity():
    assert score(balanced(1.0))["risk"]["level"] == "low"
    assert score(balanced(1.4))["risk"]["level"] == "medium"
    assert score(balanced(2.0))["risk"]["level"] == "high"


def test_planning_too_little_is_flagged_as_under_application():
    result = score(balanced(0.4))
    assert result["risk"]["level"] == "medium"
    assert "percent" in result["risk"]["reason"]


def test_unknown_planned_product_counts_as_nothing():
    assert score([{"fertilizer_type": "mystery", "quantity_kg_per_acre": 500}])["nutrient_balance"]["n"]["applied_kg_ha"] == 0


# ---------- GET /reference/* in mock mode ----------


def test_mock_reference_crops_include_one_crop_with_varieties_and_one_without():
    crops = client.get("/reference/crops").json()
    for crop in crops:
        ReferenceCrop.model_validate(crop)
    assert {len(c["varieties"]) for c in crops} >= {0, 2}
    assert all(c["stages"] for c in crops)


def test_real_mode_reference_crops_lists_every_currently_ready_crop(use_settings):
    # This used to assert barley specifically was excluded (it had a real reference dose but
    # zero split_schedule.csv rows -- ready_crops()'s own "not ready" reason). That gap is now
    # closed (PAU POP Rabi 2025-26 p.25 gives barley a real split_schedule row), so barley is
    # ready like every other crop right now. See
    # src/api/reference_data.py's own test coverage (or test_npk_calculator.py's synthetic
    # not-ready-crop test) for the exclusion behavior itself, kept independent of any one real
    # crop's data so it can't go stale this same way again.
    use_settings(predict_mode="real")
    ids = [c["id"] for c in client.get("/reference/crops").json()]
    assert "wheat" in ids and "barley" in ids  # sanity: the endpoint returns real, ready crops


def test_mock_reference_lists_validate():
    for item in client.get("/reference/soil-ratings").json():
        SoilRating.model_validate(item)
    products = client.get("/reference/fertilizers").json()
    for item in products:
        FertilizerProduct.model_validate(item)
    assert {"urea", "dap", "mop"} <= {p["id"] for p in products}
    assert {r["parameter"] for r in client.get("/reference/soil-ratings").json()} >= {"n", "p", "k", "ph", "organic_carbon"}


def test_mock_seasonal_weather():
    response = client.get("/reference/seasonal-weather", params={"lat": 30.9, "lng": 75.85, "month": 1})
    assert response.status_code == 200
    assert SeasonalWeather.model_validate(response.json()).source == "seasonal_average"


def test_seasonal_weather_rejects_a_bad_month():
    assert client.get("/reference/seasonal-weather", params={"lat": 30.9, "lng": 75.85, "month": 13}).status_code == 422


# ---------- GET /reference/* in real mode ----------

ENDPOINTS = ["/reference/crops", "/reference/soil-ratings", "/reference/fertilizers"]


def test_real_mode_returns_503_when_the_tables_are_missing(use_settings, tmp_path):
    use_settings(predict_mode="real", data_external_dir=tmp_path)
    for path in ENDPOINTS:
        response = client.get(path)
        assert response.status_code == 503, path
        assert "is missing" in response.json()["detail"]
    weather = client.get("/reference/seasonal-weather", params={"lat": 30.9, "lng": 75.85, "month": 1})
    assert weather.status_code == 503


def write(directory: Path, name: str, text: str) -> None:
    (directory / name).write_text(text.strip() + "\n", encoding="utf-8")


def test_real_mode_reads_the_tables(use_settings, tmp_path):
    write(tmp_path, "crops.csv", "crop_id,name_en,name_hi,dataset_label,season,source\nwheat,Wheat,गेहूं,,rabi,x\nrice,Rice,,,kharif,x\nghost,Ghost,,,rabi,x")
    write(tmp_path, "growth_stages.csv", "crop_id,stage_id,name_en,name_hi,order,das_start,das_end,source\nwheat,second,Second,,2,TODO(data),TODO(data),x\nwheat,first,First,पहला,1,0,0,x\nrice,nursery,Nursery,,1,0,0,x")
    write(tmp_path, "crop_varieties.csv", "crop_id,variety_id,name_en,name_hi,source\nrice,pr_132,PR 132,,x\nrice,generic,Generic,,x")
    write(tmp_path, "soil_test_ratings.csv", "parameter,unit,low_below,high_above,source\nn,kg/ha,280,560,x\nk,kg/ha,108,280,x\nzn,ppm,TODO(data),TODO(data),x")
    write(tmp_path, "fertilizer_products.csv", "product_id,name,n_pct,p2o5_pct,k2o_pct,price_inr_per_kg,price_date,source\nurea,Urea,46,0,0,5.92,2025-01-01,x\nmop,MOP,0,0,60,TODO(data),TODO(data),x")
    # Readiness (ready_crops()'s criteria, mirrored in reference_data.py's own
    # _ready_crop_ids -- see its docstring): a generic reference dose with no TODO(data)
    # nutrient cells, and at least one split_schedule row. Both wheat and rice need these to
    # stay listed below -- "ghost" deliberately has neither, on top of having no stages.
    write(
        tmp_path,
        "reference_doses.csv",
        "crop_id,variety_id,irrigation,region,n_kg_ha,p2o5_kg_ha,k2o_kg_ha,source\n"
        "wheat,generic,irrigated,Punjab,123.6,61.8,0,x\nrice,generic,irrigated,Punjab,103.8,29.7,29.7,x",
    )
    write(
        tmp_path,
        "split_schedule.csv",
        "crop_id,stage_id,n_fraction,p_fraction,k_fraction\nwheat,first,1.0,1.0,1.0\nrice,nursery,1.0,1.0,1.0",
    )
    use_settings(predict_mode="real", data_external_dir=tmp_path)

    crops = client.get("/reference/crops").json()
    assert [c["id"] for c in crops] == ["wheat", "rice"]  # a crop with no stages is not listed
    wheat = crops[0]
    assert [s["id"] for s in wheat["stages"]] == ["first", "second"]  # sorted by order
    assert [v["id"] for v in crops[1]["varieties"]] == ["pr_132"]  # generic is never listed

    ratings = client.get("/reference/soil-ratings").json()
    assert [r["parameter"] for r in ratings] == ["n", "k"]  # TODO(data) cut-offs are skipped
    assert ratings[0]["very_low_below"] is None

    products = client.get("/reference/fertilizers").json()
    assert [p["id"] for p in products] == ["urea", "mop"]  # an unpriced product is listed too, with no price
    assert products[0]["price_inr_per_kg"] == 5.92
    assert products[1]["price_inr_per_kg"] is None and products[1]["k2o_pct"] == 60


def test_real_mode_seasonal_weather_picks_the_nearest_region(use_settings, tmp_path):
    write(
        tmp_path,
        "seasonal_weather.csv",
        "region_key,latitude,longitude,month,temperature_c,humidity_pct,rainfall_mm_5day,source\n"
        "ludhiana,30.9,75.85,1,13.5,59,4.3,x\nchennai,13.08,80.27,1,25.0,70,10.0,x",
    )
    use_settings(predict_mode="real", data_external_dir=tmp_path)
    near_punjab = client.get("/reference/seasonal-weather", params={"lat": 31.0, "lng": 76.0, "month": 1}).json()
    assert near_punjab["temperature_c"] == 13.5
    near_chennai = client.get("/reference/seasonal-weather", params={"lat": 13.0, "lng": 80.0, "month": 1}).json()
    assert near_chennai["temperature_c"] == 25.0


def test_real_mode_seasonal_weather_needs_a_row_for_the_month(use_settings, tmp_path):
    write(tmp_path, "seasonal_weather.csv", "region_key,month,temperature_c,humidity_pct,rainfall_mm_5day,source\nludhiana,1,13.5,59,4.3,x")
    use_settings(predict_mode="real", data_external_dir=tmp_path)
    assert client.get("/reference/seasonal-weather", params={"lat": 30.9, "lng": 75.85, "month": 1}).status_code == 200
    response = client.get("/reference/seasonal-weather", params={"lat": 30.9, "lng": 75.85, "month": 2})
    assert response.status_code == 503
    assert "month 2" in response.json()["detail"]


def test_real_mode_seasonal_weather_without_coordinates_and_several_regions_is_a_503(use_settings, tmp_path):
    write(tmp_path, "seasonal_weather.csv", "region_key,month,temperature_c,humidity_pct,rainfall_mm_5day,source\na,1,10,50,1,x\nb,1,20,60,2,x")
    use_settings(predict_mode="real", data_external_dir=tmp_path)
    response = client.get("/reference/seasonal-weather", params={"lat": 30.9, "lng": 75.85, "month": 1})
    assert response.status_code == 503
    assert "latitude and longitude" in response.json()["detail"]
