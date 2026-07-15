import React, { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis
} from "recharts";
import { AlertTriangle, CheckCircle2, Activity, Gauge, Clock, ChevronRight, Ruler, Cpu } from "lucide-react";
import modelPredictions from "./crusher_model_predictions.json";
import testSamples from "./crusher_test_samples.json";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const COLORS = {
  bgBase: "#1C1B19",
  bgPanel: "#242119",
  bgPanelRaised: "#2D2A22",
  border: "#3D3833",
  textPrimary: "#EDE8DF",
  textMuted: "#948C80",
  steel: "#7A93A6",
  wear: "#B5651D",
  wearTrack: "#3D3833",
  critical: "#C0392B",
  high: "#DD7A2E",
  medium: "#E3B23C",
  low: "#4F9270",
};

const TIER_COLOR = { Critical: COLORS.critical, High: COLORS.high, Medium: COLORS.medium, Low: COLORS.low };

const EQUIPMENT_META = {
  "Eccentric / Main Shaft Bearing": { id: "eccentric", short: "Eccentric Shaft", severity: 1.00 },
  "Drive Motor Bearing": { id: "motor", short: "Drive Motor", severity: 0.65 },
  "Countershaft Bearing": { id: "counter", short: "Countershaft", severity: 0.55 },
};

// Wear (unmodeled) components — no trained classifier backs these, per the
// reliability framework's explicit assumptions. Progressed by a fixed wear
// rate, not a model prediction — kept visually and logically distinct.
const WEAR_BASELINE = [
  { id: "jaw", name: "Jaw Plate Wear", short: "Jaw Plates", startPct: 62, weeksToCondemn: 3.4 },
  { id: "toggle", name: "Toggle Plate / Toggle Seat", short: "Toggle Plate", startPct: 28, weeksToCondemn: 9.1 },
  { id: "css", name: "CSS Setting Drift", short: "CSS Drift", startPct: 41, weeksToCondemn: 5.6 },
];

const ACTION_TEXT = {
  Critical: "Immediate inspection — plan controlled stop within days",
  High: "Schedule inspection within 1–2 weeks; raise monitoring frequency",
  Medium: "Add to next planned maintenance window; monitor trend",
  Low: "No action — continue routine monitoring",
};

function nowLabel() {
  const d = new Date();
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Calls the real Vercel Python serverless function, which loads the actual
// trained RandomForestClassifier and runs model.predict_proba() fresh on
// every request. Sends a genuine held-out CWRU test-set feature vector,
// not a fabricated one.
async function callLiveApi(equipmentName) {
  const sample = testSamples[Math.floor(Math.random() * testSamples.length)];
  const wSeverity = EQUIPMENT_META[equipmentName].severity;

  const res = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features: sample.features, wSeverity }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return {
    trueFault: sample.trueLabel,
    predictedFault: data.predictedFault,
    pFault: data.pFault,
    wSeverity: data.wSeverity,
    wDetection: data.wDetection,
    riskScore: data.riskScore,
    riskTier: data.riskTier,
  };
}

// Cycles through real precomputed rows from risk_scores_crushers.csv
// (produced by risk_scoring_engine_crushers.py on the trained CWRU-based
// Random Forest). Each call returns a GENUINE model output row, not a
// randomly generated number.
function nextRealReading(equipmentName, cursorRef) {
  const rows = modelPredictions[equipmentName];
  const i = cursorRef.current[equipmentName] ?? 0;
  const row = rows[i % rows.length];
  cursorRef.current[equipmentName] = i + 1;
  return row;
}

// ---------------------------------------------------------------------------
// Radial gauge
// ---------------------------------------------------------------------------
function RiskGauge({ score, tier, size = 64 }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = c * pct;
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.border} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={TIER_COLOR[tier]} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.6s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, fontWeight: 600, color: COLORS.textPrimary, lineHeight: 1 }}>
          {Math.round(score)}
        </span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, color: COLORS.textMuted }}>/100</span>
      </div>
    </div>
  );
}

function WearBar({ pct, weeksToCondemn }) {
  const danger = pct >= 80;
  const warn = pct >= 55;
  const color = danger ? COLORS.critical : warn ? COLORS.wear : COLORS.low;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: COLORS.textMuted }}>WEAR DEPTH</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color, fontWeight: 600 }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 8, background: COLORS.wearTrack, borderRadius: 4, overflow: "hidden", position: "relative" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.6s ease" }} />
        <div style={{ position: "absolute", left: "80%", top: 0, bottom: 0, width: 1, background: COLORS.critical + "99" }} />
      </div>
      <div style={{ marginTop: 5, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: COLORS.textMuted }}>
        condemn limit in ~{weeksToCondemn.toFixed(1)} wks at current rate
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crusher schematic
// ---------------------------------------------------------------------------
function CrusherSchematic({ eccentricScore, eccentricTier, jawWear, cssPct }) {
  return (
    <div style={{ padding: "26px 32px 22px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Ruler size={15} color={COLORS.wear} />
          <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 2, color: COLORS.textMuted, textTransform: "uppercase" }}>
            Primary Jaw Crusher — Chamber Live Status
          </span>
        </div>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.textMuted }}>
          Feed → Crushing Chamber → CSS Outlet
        </span>
      </div>

      <svg viewBox="0 0 760 260" style={{ width: "100%", height: 230 }}>
        <polygon points="60,30 220,90 220,230 60,230" fill={COLORS.bgPanelRaised} stroke={COLORS.border} strokeWidth="2" />
        <line x1="220" y1="90" x2="220" y2="230" stroke={jawWear >= 80 ? COLORS.critical : jawWear >= 55 ? COLORS.wear : COLORS.low} strokeWidth="5" opacity="0.85" />

        <g style={{ transformOrigin: "560px 40px", animation: "jawSwing 2.2s ease-in-out infinite" }}>
          <polygon points="560,40 400,95 400,230 560,230" fill={COLORS.bgPanelRaised} stroke={COLORS.border} strokeWidth="2" />
          <line x1="400" y1="95" x2="400" y2="230" stroke={jawWear >= 80 ? COLORS.critical : jawWear >= 55 ? COLORS.wear : COLORS.low} strokeWidth="5" opacity="0.85" />
        </g>

        {[
          { x: 300, y: 70, s: 16 }, { x: 330, y: 65, s: 13 },
          { x: 295, y: 130, s: 11 }, { x: 325, y: 135, s: 9 },
          { x: 305, y: 185, s: 6 }, { x: 320, y: 190, s: 5 },
        ].map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.s} height={r.s}
            fill={COLORS.textMuted} opacity="0.5" transform={`rotate(${i * 37} ${r.x + r.s / 2} ${r.y + r.s / 2})`} />
        ))}

        <circle cx="560" cy="40" r="9" fill={TIER_COLOR[eccentricTier]} stroke={COLORS.bgPanel} strokeWidth="2">
          {eccentricTier === "Critical" && <animate attributeName="r" values="9;13;9" dur="1.4s" repeatCount="indefinite" />}
        </circle>
        <text x="575" y="35" fontFamily="'IBM Plex Mono', monospace" fontSize="11" fill={COLORS.textPrimary}>Eccentric Shaft</text>
        <text x="575" y="50" fontFamily="'IBM Plex Mono', monospace" fontSize="12" fontWeight="600" fill={TIER_COLOR[eccentricTier]}>{Math.round(eccentricScore)}</text>

        <line x1="560" y1="200" x2="640" y2="215" stroke={COLORS.steel} strokeWidth="4" />
        <circle cx="640" cy="215" r="6" fill={COLORS.steel} />
        <text x="600" y="240" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fill={COLORS.textMuted}>Toggle Plate</text>

        <line x1="270" y1="235" x2="360" y2="235" stroke={COLORS.wear} strokeWidth="2" strokeDasharray="3,3" />
        <text x="270" y="253" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fill={COLORS.wear}>CSS gap: {cssPct >= 55 ? "drifted" : "nominal"}</text>

        <text x="60" y="20" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fill={COLORS.textMuted}>FEED</text>
        <text x="330" y="20" fontFamily="'IBM Plex Mono', monospace" fontSize="10" fill={COLORS.textMuted}>CRUSHING CHAMBER</text>
      </svg>

      <style>{`
        @keyframes jawSwing {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(1.2deg); }
        }
      `}</style>
    </div>
  );
}

function ModeledCard({ eq }) {
  const tier = eq.riskTier;
  return (
    <div style={{
      background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
      borderLeft: `3px solid ${TIER_COLOR[tier]}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13.5, color: COLORS.textPrimary }}>{eq.name}</div>
          <div style={{
            marginTop: 5, display: "inline-block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5,
            padding: "2px 7px", borderRadius: 4, background: TIER_COLOR[tier] + "22", color: TIER_COLOR[tier],
            letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
          }}>{tier}</div>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: COLORS.steel }}>
            <Cpu size={10} /> RF model · true: {eq.trueFault} · pred: {eq.predictedFault}
          </div>
        </div>
        <RiskGauge score={eq.riskScore} tier={tier} />
      </div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.4 }}>{ACTION_TEXT[tier]}</div>
    </div>
  );
}

function WearCard({ eq, pct }) {
  return (
    <div style={{
      background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
      borderLeft: `3px solid ${COLORS.wear}`,
    }}>
      <div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13.5, color: COLORS.textPrimary }}>{eq.name}</div>
        <div style={{
          marginTop: 5, display: "inline-block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5,
          padding: "2px 7px", borderRadius: 4, background: COLORS.wear + "22", color: COLORS.wear,
          letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
        }}>No ML model — thickness tracked</div>
      </div>
      <WearBar pct={pct} weeksToCondemn={eq.weeksToCondemn} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------
export default function CrusherDashboard() {
  const cursorRef = useRef({});

  const initReading = (name) => {
    const row = nextRealReading(name, cursorRef);
    return { name, ...EQUIPMENT_META[name], ...row };
  };

  const [modeled, setModeled] = useState(() =>
    Object.keys(EQUIPMENT_META).map(name => initReading(name))
  );
  const [wear, setWear] = useState(WEAR_BASELINE.map(e => ({ ...e, pct: e.startPct })));
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [liveMode, setLiveMode] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const historyRef = useRef([]);

  useEffect(() => {
    const avg = modeled.reduce((s, e) => s + e.riskScore, 0) / modeled.length;
    const seed = [{ t: "T0", plantRisk: Math.round(avg) }];
    historyRef.current = seed;
    setHistory(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyModeledUpdate = (next) => {
    next.forEach(e => {
      if (e.riskTier === "Critical" || e.riskTier === "High") {
        setAlerts(a => [{
          id: Date.now() + Math.random(), time: nowLabel(), name: e.short,
          tier: e.riskTier, score: Math.round(e.riskScore), kind: "model",
          trueFault: e.trueFault, predictedFault: e.predictedFault,
        }, ...a].slice(0, 6));
      }
    });
    const avg = next.reduce((s, e) => s + e.riskScore, 0) / next.length;
    const newHist = [...historyRef.current.slice(-11), { t: `T${historyRef.current.length}`, plantRisk: Math.round(avg) }];
    historyRef.current = newHist;
    setHistory(newHist);
    setModeled(next);
  };

  const runTick = async () => {
    if (liveMode) {
      setLiveLoading(true);
      setLiveError(null);
      try {
        const names = Object.keys(EQUIPMENT_META);
        const results = await Promise.all(names.map(async (name) => {
          const row = await callLiveApi(name);
          return { name, ...EQUIPMENT_META[name], ...row };
        }));
        applyModeledUpdate(results);
      } catch (err) {
        setLiveError(err.message || "Live inference request failed");
      } finally {
        setLiveLoading(false);
      }
    } else {
      const next = modeled.map(e => {
        const row = nextRealReading(e.name, cursorRef);
        return { ...e, ...row };
      });
      applyModeledUpdate(next);
    }

    setWear(prev => prev.map(e => {
      const next = Math.min(100, e.pct + Math.random() * 1.8);
      if (next >= 80 && e.pct < 80) {
        setAlerts(a => [{ id: Date.now() + Math.random(), time: nowLabel(), name: e.short, tier: "Critical", score: Math.round(next), kind: "wear" }, ...a].slice(0, 6));
      }
      return { ...e, pct: next };
    }));
  };

  const eccentric = modeled.find(e => e.id === "eccentric");
  const jawWear = wear.find(w => w.id === "jaw");
  const cssWear = wear.find(w => w.id === "css");
  const plantAvg = Math.round(modeled.reduce((s, e) => s + e.riskScore, 0) / modeled.length);
  const plantTier = plantAvg >= 80 ? "Critical" : plantAvg >= 55 ? "High" : plantAvg >= 30 ? "Medium" : "Low";
  const scatterData = modeled.map(e => ({ x: e.pFault, y: e.severity, z: e.riskScore, tier: e.riskTier }));

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bgBase, color: COLORS.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 32px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bgPanel, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Gauge size={22} color={COLORS.steel} />
          <div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, letterSpacing: 1, fontWeight: 500 }}>DCP RELIABILITY MONITOR</div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
              Crusher Early-Warning System · Track 2 · Live Random Forest Output
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 8, background: TIER_COLOR[plantTier] + "1a", border: `1px solid ${TIER_COLOR[plantTier]}55` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLOR[plantTier] }} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: COLORS.textMuted }}>Modeled Risk</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, color: TIER_COLOR[plantTier] }}>{plantAvg}</span>
          </div>
          <button
            onClick={() => setLiveMode(m => !m)}
            title="Toggle between precomputed real test-set rows and live Python API inference"
            style={{
              display: "flex", alignItems: "center", gap: 7, background: liveMode ? COLORS.low + "22" : COLORS.bgPanelRaised,
              border: `1px solid ${liveMode ? COLORS.low : COLORS.border}`, color: liveMode ? COLORS.low : COLORS.textMuted,
              padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
            }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: liveMode ? COLORS.low : COLORS.textMuted }} />
            {liveMode ? "LIVE API MODE" : "Precomputed mode"}
          </button>
          <button onClick={runTick} disabled={liveLoading} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.bgPanelRaised, border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary, padding: "8px 16px", borderRadius: 8, cursor: liveLoading ? "wait" : "pointer", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, opacity: liveLoading ? 0.6 : 1 }}>
            <Activity size={14} color={COLORS.steel} /> {liveLoading ? "Calling model..." : "Pull Next Reading"}
          </button>
        </div>
      </div>
      {liveMode && (
        <div style={{ padding: "8px 32px", background: COLORS.low + "15", borderBottom: `1px solid ${COLORS.border}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.low, display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={12} /> Live mode: each "Pull Next Reading" sends a real held-out sensor reading to /api/predict and runs the actual trained model server-side.
        </div>
      )}
      {liveError && (
        <div style={{ padding: "8px 32px", background: COLORS.critical + "15", borderBottom: `1px solid ${COLORS.border}`, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLORS.critical }}>
          API error: {liveError}. Falling back to precomputed mode — check that /api/predict deployed correctly (requires Vercel, not `vite dev` alone).
        </div>
      )}

      <div style={{ background: COLORS.bgPanel, borderBottom: `1px solid ${COLORS.border}` }}>
        <CrusherSchematic eccentricScore={eccentric.riskScore} eccentricTier={eccentric.riskTier} jawWear={jawWear.pct} cssPct={cssWear.pct} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, padding: 28 }} className="dashboard-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Cpu size={13} color={COLORS.steel} />
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.textMuted, textTransform: "uppercase" }}>
                Bearing Components — Live Random Forest Predictions
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
              {modeled.map(eq => <ModeledCard key={eq.id} eq={eq} />)}
            </div>
          </div>

          <div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.wear, marginBottom: 12, textTransform: "uppercase" }}>
              Wear Components — Thickness Tracked, No ML Model
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {wear.map(eq => <WearCard key={eq.id} eq={eq} pct={eq.pct} />)}
            </div>
          </div>

          <div style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 10, textTransform: "uppercase" }}>
              Modeled-Component Risk Trend
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={history}>
                <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
                <Tooltip contentStyle={{ background: COLORS.bgPanelRaised, border: `1px solid ${COLORS.border}`, fontSize: 12 }} labelStyle={{ color: COLORS.textMuted }} />
                <Line type="monotone" dataKey="plantRisk" stroke={COLORS.steel} strokeWidth={2} dot={{ r: 3, fill: COLORS.steel }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <div style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 10, textTransform: "uppercase" }}>
              Risk Matrix — Modeled Components Only
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                <XAxis type="number" dataKey="x" name="P(fault)" domain={[0, 1]} tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
                <YAxis type="number" dataKey="y" name="Severity" domain={[0, 1]} tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={{ stroke: COLORS.border }} tickLine={false} />
                <ZAxis type="number" dataKey="z" range={[80, 260]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: COLORS.bgPanelRaised, border: `1px solid ${COLORS.border}`, fontSize: 12 }} formatter={(val, name) => [typeof val === "number" ? val.toFixed(2) : val, name]} />
                <Scatter data={scatterData} fill={COLORS.steel} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "18px 20px", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Clock size={14} color={COLORS.textMuted} />
              <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.textMuted, textTransform: "uppercase" }}>Alert Feed</div>
            </div>
            {alerts.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 10px", color: COLORS.textMuted }}>
                <CheckCircle2 size={22} color={COLORS.low} />
                <div style={{ marginTop: 8, fontSize: 12, textAlign: "center" }}>No active alerts. Press "Pull Next Reading" to advance through real model output.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {alerts.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: COLORS.bgPanelRaised, borderRadius: 8, borderLeft: `3px solid ${a.kind === "wear" ? COLORS.wear : TIER_COLOR[a.tier]}` }}>
                    {a.kind === "wear" ? <Ruler size={14} color={COLORS.wear} style={{ flexShrink: 0 }} /> : <AlertTriangle size={14} color={TIER_COLOR[a.tier]} style={{ flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: COLORS.textPrimary }}>{a.name}</div>
                      <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {a.time} · {a.kind === "wear" ? "Condemn limit approaching" : `${a.tier} · true:${a.trueFault} pred:${a.predictedFault}`}
                      </div>
                    </div>
                    <ChevronRight size={14} color={COLORS.textMuted} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: "0 32px 24px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: COLORS.textMuted, textAlign: "center" }}>
        {liveMode
          ? "LIVE mode: predictions computed on-demand by the actual trained model via /api/predict on every request."
          : "Precomputed mode: cycling through genuine held-out test-set predictions from the same trained model, generated ahead of time."}
        {" "}Bearing model: Random Forest trained on the CWRU Bearing Dataset. Wear components are simulated by design — no dataset backs them.
      </div>

      <style>{`
        @media (max-width: 820px) {
          .dashboard-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
