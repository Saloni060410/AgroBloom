FROM python:3.11-slim
WORKDIR /app

# requirements.txt pins every dependency with an exact ==version already.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# src/ is the service code. configs/ (train.yaml) and data/external/ (the reference tables --
# reference_doses.csv, fertilizer_products.csv, agronomy_rules.yaml, etc.) are read at
# runtime by src.data_pipeline/src.engine on every request -- without them /recommend and
# /risk-score fail with a 503 (ReferenceDataError) on every call, and /health never shows
# "ok" degraded for the right reason. models_artifacts/ is NOT copied from the host: it's gitignored. docker-compose
# bind-mounts a locally trained one over the top; any other build trains its own below.
COPY src ./src
COPY configs ./configs
COPY data/external ./data/external

# The product classifier. models_artifacts/ is git-ignored (the team rule is never to commit model
# files), so the image trains its own: the rule-imitation model, which learns the rule engine's main
# product from random requests the engine itself labels (src/models/train_imitation.py, seed and config
# in configs/imitation.yaml). It needs only the reference data copied above and takes a few seconds.
# Without it the service still answers every request from the rule-based engine and /health says "degraded".
# A failed training fails the build, rather than shipping an image with no model.
RUN python -W ignore -m src.models.train_imitation --config configs/imitation.yaml \
 && rm -rf models_artifacts/runs

# Non-root: nothing in this service needs root, and a dependency RCE shouldn't get it either.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8001

# python's own urllib, not curl -- python:3.11-slim doesn't ship curl and this needs no
# extra package. /health always returns 200 (ok or degraded), so this only fails if the
# process itself is down or unresponsive.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD ["python", "-c", "import urllib.request as u; import sys; sys.exit(0 if u.urlopen('http://localhost:8001/health', timeout=2).status == 200 else 1)"]

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8001"]
