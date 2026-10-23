# AGENTS.md — ml

Read the root `AGENTS.md` first. This file is ML-only conventions. Owners: **Saloni** (`src/api/`, `src/engine/`, `src/models/`) and **Richa** (`data/`, `src/data_pipeline/`, `src/weather/`, `src/degradation/`, `src/evaluation/`).

## Stack

- Python 3.11+, pandas/numpy, scikit-learn + XGBoost.
- FastAPI for serving (`src/api/main.py`), Pydantic schemas for request and response validation.
- `joblib` for model persistence. Artifacts go in `models_artifacts/` (gitignored), not in git.
- The service is stateless: no database access.

## Folder map

```
data/{raw,processed,external}/   raw and processed are gitignored. external/ holds sourced reference tables. See data/README.md
notebooks/                        exploration only. Nothing in src/ imports from it
src/
├── api/             SALONI  main.py, schemas.py, endpoints/ (recommend, risk_score, health, reference)
├── engine/          SALONI  npk_calculator.py (standard dose + soil adjustment), recommendation_engine.py (schedule, cost, blend)
├── models/          SALONI  train.py, fertilizer_model.py, model_registry/ (model loading and
│                            inference live in engine/recommendation_engine.py, not a separate
│                            predict.py -- there was one early on, deleted, nothing imported it)
├── degradation/     RICHA   risk_analyzer.py (over/under-application risk and impact text)
├── data_pipeline/   RICHA   ingest.py, clean.py, feature_engineering.py, soil_data_loader.py
├── weather/         RICHA   weather_client.py (Open-Meteo)
└── evaluation/      RICHA   metrics.py, explainability.py
```

## Conventions

- The soil schema (`n`, `p`, `k`, `ph`, `organic_carbon`, `moisture`) is fixed by the problem statement. Never change it.
- `src/api/schemas.py` must match `docs/api-contract.md` exactly, and both must match `docs/contract-fixtures/`. Update the doc and fixtures in the same change.
- The core is the dose formula in `engine/npk_calculator.py` (standard dose + soil-test adjustment - credit, or an STCR equation where one exists). Every decision appends a rule-trace entry so explanations can be produced. The model only refines the product choice.
- Feature engineering lives in `data_pipeline/`. Training and serving import the same functions so they cannot drift.
- No agronomy number in code. Reference doses, adjustments, efficiencies, prices, cut-offs and thresholds come from `data/external/` and every value has a source.
- Every trained model is saved with a version tag in `model_registry/`. Never overwrite a previous version silently. `model_version` is `<model>-<semver>+rules-<hash8>`.
- Seed everything and record it. Report metrics with baselines and confidence intervals. Use the test split once.
- Do not commit raw datasets or model artifacts. Document where to fetch each dataset in `data/README.md`.

## Commands

```bash
pip install -r requirements.txt
pytest -q && ruff check .
jupyter notebook                                  # for notebooks/
uvicorn src.api.main:app --reload --port 8001     # serve locally

# Rebuild the training data from a clean checkout: ingest -> clean -> features -> split, in one
# command. Prints a dataset_version (config version + content hash). Works with no manual step
# (falls back to the committed synthetic dataset); the real Kaggle file, if you have it, is
# picked up automatically from data/raw/ if present -- see ml/data/README.md.
python -m src.data_pipeline.build_dataset --config configs/data.yaml

# Recreate the active model from a clean checkout (models_artifacts/ is gitignored). The service
# serves the last model in model_registry/registry.json. The current one is the rule-imitation
# classifier: it learns the rule engine's main product from requests the engine labels, takes a few
# seconds, and must be retrained whenever data/external/ or the engine's product logic changes
# (the Docker image does it on every build). See MODEL_CARD_RULE_IMITATION.md.
python -m src.models.train_imitation --config configs/imitation.yaml

# The original classifier, trained on the synthetic dataset (MODEL_CARD.md). Registering it makes
# it the active model again:
python -m src.models.train --config configs/train.yaml

# Build and run the service image alone (S9) -- data/external/ and configs/ are baked in,
# the model artifact is bind-mounted read-only so it never needs to be in the image:
docker build -t khetgpt-ml .
docker run -p 8001:8001 -e PREDICT_MODE=real \
  -v "$(pwd)/models_artifacts:/app/models_artifacts:ro" khetgpt-ml
```
