"""
Vercel Python Serverless Function — Live Model Inference
-----------------------------------------------------------
Loads the actual trained Random Forest (crusher_bearing_model.pkl, trained
on the CWRU bearing dataset -- see /extract_features.py and
/train_classifier.py in the main project) and returns a REAL prediction
for whatever feature vector is POSTed to this endpoint.

This is genuine server-side inference, not a precomputed lookup table --
every request runs model.predict_proba() fresh.

Request body (JSON):
{
  "features": {
    "mean": ..., "std": ..., "rms": ..., "peak": ..., "peak_to_peak": ...,
    "kurtosis": ..., "skewness": ..., "crest_factor": ..., "shape_factor": ...,
    "impulse_factor": ..., "fft_band_1_energy": ..., "fft_band_2_energy": ...,
    "fft_band_3_energy": ..., "fft_band_4_energy": ..., "fft_band_5_energy": ...,
    "fft_dominant_freq": ..., "fft_total_energy": ...
  },
  "equipment": "Eccentric / Main Shaft Bearing",   // determines severity weight
  "wSeverity": 1.0                                  // optional override
}

Response (JSON):
{
  "predictedFault": "OR",
  "classProbabilities": {"Normal": 0.01, "B": 0.02, "IR": 0.03, "OR": 0.94},
  "pFault": 0.99,
  "wDetection": 0.91,
  "riskScore": 90.1,
  "riskTier": "Critical"
}
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import joblib
import numpy as np

FEATURE_COLS = [
    "mean", "std", "rms", "peak", "peak_to_peak", "kurtosis", "skewness",
    "crest_factor", "shape_factor", "impulse_factor",
    "fft_band_1_energy", "fft_band_2_energy", "fft_band_3_energy",
    "fft_band_4_energy", "fft_band_5_energy", "fft_dominant_freq", "fft_total_energy"
]

MODEL_PATH = os.path.join(os.path.dirname(__file__), "crusher_bearing_model.pkl")
_model = None


def get_model():
    global _model
    if _model is None:
        _model = joblib.load(MODEL_PATH)
    return _model


def risk_tier(score):
    if score >= 80:
        return "Critical"
    if score >= 55:
        return "High"
    if score >= 30:
        return "Medium"
    return "Low"


def compute_detection_weight(proba_sorted):
    margin = proba_sorted[0] - proba_sorted[1] if len(proba_sorted) > 1 else proba_sorted[0]
    return 0.5 + 0.5 * margin


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body)

            features = payload.get("features", {})
            w_severity = float(payload.get("wSeverity", 1.0))

            missing = [c for c in FEATURE_COLS if c not in features]
            if missing:
                self._send_json(400, {"error": f"Missing features: {missing}"})
                return

            x = np.array([[features[c] for c in FEATURE_COLS]])

            model = get_model()
            proba = model.predict_proba(x)[0]
            classes = list(model.classes_)
            predicted_fault = classes[int(np.argmax(proba))]

            normal_idx = classes.index("Normal") if "Normal" in classes else None
            p_fault = 1 - proba[normal_idx] if normal_idx is not None else float(np.max(proba))

            proba_sorted = np.sort(proba)[::-1]
            w_detection = compute_detection_weight(proba_sorted)

            risk_score = float(p_fault) * w_severity * w_detection * 100
            tier = risk_tier(risk_score)

            response = {
                "predictedFault": predicted_fault,
                "classProbabilities": {c: round(float(p), 4) for c, p in zip(classes, proba)},
                "pFault": round(float(p_fault), 4),
                "wSeverity": w_severity,
                "wDetection": round(float(w_detection), 4),
                "riskScore": round(risk_score, 2),
                "riskTier": tier,
                "modelInfo": "RandomForestClassifier, 50 trees, trained on CWRU Bearing Dataset (live inference)",
            }
            self._send_json(200, response)

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def do_GET(self):
        self._send_json(200, {
            "status": "ok",
            "message": "POST a feature vector to this endpoint to get a live model prediction.",
            "expectedFeatures": FEATURE_COLS,
        })

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
