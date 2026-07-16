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

## Fixed: serverless function size limit

An earlier version of `/api/predict.py` used scikit-learn to load a
pickled model. scikit-learn pulls in scipy, which pushed the deployed
function bundle over Vercel's 225MB serverless function size limit
(`Total bundle size (228.93 MB) exceeds the maximum function size (225 MB)`).

**Fix:** the trained model's decision trees were exported to plain JSON
(`api/crusher_model_export.json`), and `api/rf_inference.py` walks those
trees using only the Python standard library — no scikit-learn, scipy, or
numpy at runtime. This was verified to match scikit-learn's
`predict_proba()` output exactly (max difference 3.33e-16, i.e.
floating-point noise) across all 60 held-out test samples before the
switch. `requirements.txt` is now empty — zero external dependencies.

## Project structure

```
src/CrusherDashboard.jsx        Main dashboard component
src/crusher_model_predictions.json  80 precomputed real predictions per component
src/crusher_test_samples.json   60 real held-out feature vectors, used by Live mode
api/predict.py                  Vercel Python serverless function (live inference)
api/rf_inference.py             Pure-Python tree-walking inference (no dependencies)
api/crusher_model_export.json   Trained model's raw tree structure (~2.2MB)
requirements.txt                Empty — no external Python packages needed
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
