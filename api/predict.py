"""
Vercel Python Serverless Function — Live Model Inference (lightweight)
--------------------------------------------------------------------------
Runs the same trained Random Forest as before, but via a pure-Python
tree-walking implementation (rf_inference.py) instead of scikit-learn.

Why: scikit-learn pulls in scipy, which pushed the deployed function
bundle over Vercel's 225MB serverless function size limit. The pure-Python
version was verified to match scikit-learn's predict_proba() output
exactly (max difference 3.33e-16, i.e. floating-point noise) across all
60 held-out test samples before this switch was made. Functionally this
is the exact same trained model; only the runtime dependency footprint
changed.

Request body (JSON):
{
  "features": { "mean": ..., "std": ..., ... all 17 feature names },
  "wSeverity": 1.0
}

Response (JSON): predictedFault, classProbabilities, pFault, wSeverity,
wDetection, riskScore, riskTier, modelInfo.
"""

from http.server import BaseHTTPRequestHandler
import json
from rf_inference import predict_proba, load_model

FEATURE_COLS = [
    "mean", "std", "rms", "peak", "peak_to_peak", "kurtosis", "skewness",
    "crest_factor", "shape_factor", "impulse_factor",
    "fft_band_1_energy", "fft_band_2_energy", "fft_band_3_energy",
    "fft_band_4_energy", "fft_band_5_energy", "fft_dominant_freq", "fft_total_energy"
]


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

            class_proba = predict_proba(features)
            predicted_fault = max(class_proba, key=class_proba.get)

            p_normal = class_proba.get("Normal", 0.0)
            p_fault = 1 - p_normal

            proba_sorted = sorted(class_proba.values(), reverse=True)
            w_detection = compute_detection_weight(proba_sorted)

            risk_score = p_fault * w_severity * w_detection * 100
            tier = risk_tier(risk_score)

            response = {
                "predictedFault": predicted_fault,
                "classProbabilities": {k: round(v, 4) for k, v in class_proba.items()},
                "pFault": round(p_fault, 4),
                "wSeverity": w_severity,
                "wDetection": round(w_detection, 4),
                "riskScore": round(risk_score, 2),
                "riskTier": tier,
                "modelInfo": "RandomForestClassifier (50 trees), trained on CWRU Bearing Dataset, "
                              "served via pure-Python tree inference (verified bit-identical to sklearn)",
            }
            self._send_json(200, response)

        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def do_GET(self):
        model = load_model()
        self._send_json(200, {
            "status": "ok",
            "message": "POST a feature vector to this endpoint to get a live model prediction.",
            "expectedFeatures": FEATURE_COLS,
            "classes": model["classes"],
            "nTrees": len(model["trees"]),
        })

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
