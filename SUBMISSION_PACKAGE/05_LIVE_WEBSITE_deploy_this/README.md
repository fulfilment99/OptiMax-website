# DCP Crusher Reliability Monitor — Live Dashboard

React + Vite frontend with a real Python model backend, for the DCP
University Engineering Challenge (Track 2).

## Two modes, both using genuine model output

**Precomputed mode (default):** cycles through 80 real predictions per
bearing component, generated ahead of time by running the actual trained
Random Forest on held-out CWRU test data. Fast, works with zero backend.

**Live API mode (toggle in the header):** every "Pull Next Reading" sends a
real held-out sensor feature vector to `/api/predict`, a Vercel Python
serverless function that loads the actual trained model
(`api/crusher_bearing_model.pkl`) and runs `model.predict_proba()` fresh on
each request. This is genuine on-demand inference, not a lookup table.

Wear components (Jaw Plate, Toggle Plate, CSS Drift) are simulated in BOTH
modes by design — no public dataset exists for these failure modes (see the
reliability framework document, Section 0). They're visually distinct
(thickness bar, not a risk gauge) so nothing implies they're ML-scored.

## Project structure

```
src/CrusherDashboard.jsx        Main dashboard component
src/crusher_model_predictions.json  80 precomputed real predictions per component
src/crusher_test_samples.json   60 real held-out feature vectors, used by Live mode
api/predict.py                  Vercel Python serverless function (live inference)
api/crusher_bearing_model.pkl   Trained RandomForestClassifier (~1MB, 50 trees)
requirements.txt                Python deps for the serverless function
```

## Local development

```bash
npm install
npm run dev
```

Note: `npm run dev` only runs the Vite frontend. The `/api/predict` route
needs Vercel's dev server to work locally:

```bash
npm install -g vercel
vercel dev
```

Without `vercel dev`, Live API mode will show a fetch error and you should
use Precomputed mode instead — this is expected, not a bug.

## Deploy to Vercel

**Option A — Vercel dashboard (no CLI needed):**
1. Push this folder to a GitHub repo.
2. Import the repo at https://vercel.com/new.
3. Vercel auto-detects Vite for the frontend AND the `/api` folder for the
   Python serverless function. Click Deploy.
4. Both modes will work immediately on the deployed URL.

**Option B — Vercel CLI:**
```bash
npm install -g vercel
vercel login
vercel --prod
```

## Regenerating model artifacts

If you retrain the classifier:
1. Re-run training, save with `joblib.dump(model, 'crusher_bearing_model.pkl', compress=3)`
   — keep the model small (≤~2MB) by limiting `n_estimators`/`max_depth`,
   since serverless functions have package size limits.
2. Replace `api/crusher_bearing_model.pkl`.
3. Regenerate `src/crusher_model_predictions.json` and
   `src/crusher_test_samples.json` from the new model's test-set output.

## What's real vs. simulated — full transparency

| Element | Status |
|---|---|
| Bearing component risk scores (both modes) | REAL — trained Random Forest output |
| Bearing true/predicted fault labels | REAL — from held-out CWRU test data |
| Live API inference | REAL — server computes prediction on each request |
| Jaw Plate / Toggle Plate / CSS wear bars | SIMULATED — no dataset exists for these failure modes |
| Equipment-to-sensor assignment | SIMULATED — real deployment would tie each reading to a known physical sensor |
