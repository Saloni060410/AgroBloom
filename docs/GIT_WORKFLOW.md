# Git workflow

Repo: `https://github.com/Saloni060410/AgroBloom`

## Branches

| Branch | Owner | Works in |
|---|---|---|
| `main` | everyone | Stable and demo-ready. Only docs-only contract PRs and reviewed feature PRs land here. |
| `feature/saloni-ml-core` | Saloni | `ml/src/api`, `ml/src/engine`, `ml/src/models` |
| `feature/richa-ml-data` | Richa | `ml/data`, `ml/src/data_pipeline`, `ml/src/weather`, `ml/src/degradation`, `ml/src/evaluation`, `ml/notebooks` |
| `feature/josh-backend` | Josh | `backend/**`, `docker-compose.yml`, `.github/workflows/` |
| `feature/darsh-frontend` | Darsh | `frontend/**` |

Saloni and Richa share `ml/`, so they pull `main` often. The shared files are `ml/requirements.txt` and `ml/src/api/`.

## Daily flow

```bash
git checkout feature/<your-branch>
git pull origin main --rebase
# work, commit in small steps
git push origin feature/<your-branch>
```

Open a PR into `main` when a feature works end to end, not only when it is finished. Merge often instead of saving one large merge for the end. One other teammate reviews each PR. Rebase onto `main` before opening it.

## Commits

Form: `<area>: <what changed>`, present tense, at most 72 characters. One logical change per commit.

- `ml: add NPK dose calculator`
- `backend: add refresh token rotation`
- `frontend: add schedule page with print styles`
- `docs: api-contract add risk-score`

No AI co-author trailers and no "Generated with" lines in commits or PR descriptions.

## Avoiding conflicts

- Do not edit another person's folder. Ask them, or open a small PR against their branch.
- Contracts change only through a docs-only PR to `main` that both owners approve (see `api-contract.md`, "Change process"). Both owners rebase the same day.
- Never commit `.env`, raw datasets, `models_artifacts/`, `node_modules/`, `.venv/`, `dist/` or `*.pkl` and `*.joblib` files.

## Merge order at integration gates

1. Contracts and reference vocabularies (docs-only PRs) first.
2. `feature/josh-backend` and the two ML branches next, so the recommendation works end to end.
3. `feature/darsh-frontend` last against the real endpoints, after working on mocks.

The step-by-step version with gates is in `docs/prompt-packs/`.
