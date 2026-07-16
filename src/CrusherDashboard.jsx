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

<<<<<<< HEAD
const WEAR_ACTION = "Plan replacement before condemn limit — schedule during next stop";
=======
// Escalation workflow — who gets notified, response SLA, per tier.
// Mirrors the Maintenance Escalation Workflow document (Task 1.1).
const ESCALATION_INFO = {
  Critical: {
    notified: "Area Maintenance Supervisor + Plant Reliability Manager + Shift Operations Manager",
    channel: "SMS / direct call",
    sla: "Acknowledge within 2 hrs",
    logging: "Formal incident log opened; RCA Level 3 mandatory; requires Reliability Manager sign-off to close",
  },
  High: {
    notified: "Maintenance Planner + Area Maintenance Supervisor",
    channel: "Push notification + dashboard alert",
    sla: "Acknowledge within 48 hrs; inspect within 1–2 weeks",
    logging: "Work order raised in CMMS; triggers RCA Level 2 if inspection confirms abnormal condition",
  },
  Medium: {
    notified: "Shift Reliability Engineer + Maintenance Planner",
    channel: "Daily digest email",
    sla: "Within 24 hrs (next planning cycle)",
    logging: "Logged in CMMS as a watch item",
  },
  Low: {
    notified: "None — dashboard visibility only",
    channel: "Dashboard only",
    sla: "N/A (routine)",
    logging: "Auto-logged by system, no manual entry",
  },
};

// Root-cause hints per component — drawn from the Fishbone (Ishikawa)
// categories in the RCA Framework document (Task 1.2). These are starting
// hypotheses for an investigator, not a diagnosis.
const ROOT_CAUSE_HINTS = {
  eccentric: "Most common root cause industry-wide: lubrication starvation — 56% of premature bearing failures are lubrication-related. Check grease line pressure and schedule first.",
  motor: "Common contributors: misalignment, electrical imbalance, or bearing seating wear. Cross-check motor current signature if available.",
  counter: "Often linked to belt or coupling misalignment upstream rather than the bearing itself.",
  jaw: "Wear-related, not a sudden fault — tied to tonnage processed and feed material hardness. Compare against expected wear-rate curve.",
  toggle: "Structural fatigue — cracks typically appear suddenly between shifts, not gradually. Prioritize visual inspection over trend analysis.",
  css: "Setting drift usually reflects accumulated liner wear or eccentric bushing wear, not a single-point failure.",
};

// Top system risks — condensed from the Industrial Risk Register (Task 1.3).
const RISK_REGISTER_TOP = [
  { id: "R2", desc: "Model trained on proxy data (CWRU Bearing Dataset) may not generalize to real DCP sensors", impact: "High", mitigation: "Phase 1 pilot validates against real signals before full trust is placed in output; human sign-off required on Critical alerts during pilot" },
  { id: "R3", desc: "Unmodeled components (jaw plate, toggle plate, CSS drift) produce no ML warning", impact: "High", mitigation: "Reported separately via thickness tracking against a condemn limit — never silently omitted or given a fabricated score" },
  { id: "R5", desc: "Alert fatigue — high alert volume causes operators to start ignoring notifications", impact: "Medium", mitigation: "Only High/Critical tiers interrupt operators directly (SMS/push); false-positive rate tracked as an ongoing KPI" },
  { id: "R6", desc: "Coal mill fire/explosion signal wrongly treated as a routine maintenance alert", impact: "Catastrophic (low likelihood)", mitigation: "Kept as a fully separate, independent hardwired safety trip — never blended into this 0–100 mechanical score" },
];

// Business impact reference figures — industry-wide estimates (not DCP-
// confirmed), used only to illustrate the order of magnitude at stake.
const CRUSHER_DOWNTIME_COST_PER_DAY = { low: 120000, high: 350000 };
>>>>>>> 30a888f60f5f34688958e8ccaca2730e96260c45

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
// Risk marker pinned at a physical component location (FR4). One shared
// implementation for all modeled bearings.
function SchematicMarker({ x, y, tier, score, label, labelX, labelY, anchor = "start" }) {
  return (
    <g>
      <circle cx={x} cy={y} r="9" fill={TIER_COLOR[tier]} stroke={COLORS.bgPanel} strokeWidth="2">
        {tier === "Critical" && <animate attributeName="r" values="9;13;9" dur="1.4s" repeatCount="indefinite" />}
      </circle>
      <text x={labelX} y={labelY} textAnchor={anchor} fontFamily="'IBM Plex Mono', monospace" fontSize="11" fill={COLORS.textPrimary}>{label}</text>
      <text x={labelX} y={labelY + 15} textAnchor={anchor} fontFamily="'IBM Plex Mono', monospace" fontSize="12" fontWeight="600" fill={TIER_COLOR[tier]}>{Math.round(score)}</text>
    </g>
  );
}

function CrusherSchematic({ modeled, jawWear, cssPct }) {
  const eccentric = modeled.find(e => e.id === "eccentric");
  const motor = modeled.find(e => e.id === "motor");
  const counter = modeled.find(e => e.id === "counter");
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

        {/* Drive motor: flywheel driven off the eccentric shaft via V-belt */}
        <line x1="569" y1="44" x2="647" y2="91" stroke={COLORS.steel} strokeWidth="2" strokeDasharray="5,4" opacity="0.7" />
        <circle cx="660" cy="100" r="15" fill={COLORS.bgPanelRaised} stroke={COLORS.border} strokeWidth="2" />
        {/* Countershaft running off the drive motor */}
        <line x1="668" y1="113" x2="704" y2="178" stroke={COLORS.steel} strokeWidth="3" opacity="0.7" />

        <SchematicMarker x={560} y={40} tier={eccentric.riskTier} score={eccentric.riskScore} label="Eccentric Shaft" labelX={575} labelY={35} />
        <SchematicMarker x={660} y={100} tier={motor.riskTier} score={motor.riskScore} label="Drive Motor" labelX={660} labelY={132} anchor="middle" />
        <SchematicMarker x={710} y={185} tier={counter.riskTier} score={counter.riskScore} label="Countershaft" labelX={710} labelY={212} anchor="middle" />

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

function ModeledCard({ eq, onClick }) {
  const tier = eq.riskTier;
  return (
    <div onClick={onClick} style={{
      background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, cursor: "pointer",
      borderLeft: `3px solid ${TIER_COLOR[tier]}`, transition: "transform 0.15s ease",
    }}
    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
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
      <div style={{ fontSize: 9.5, color: COLORS.steel, fontFamily: "'IBM Plex Mono', monospace" }}>Click for escalation details &amp; root cause →</div>
    </div>
  );
}

function WearCard({ eq, pct, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, cursor: "pointer",
      borderLeft: `3px solid ${COLORS.wear}`, transition: "transform 0.15s ease",
    }}
    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      <div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13.5, color: COLORS.textPrimary }}>{eq.name}</div>
        <div style={{
          marginTop: 5, display: "inline-block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5,
          padding: "2px 7px", borderRadius: 4, background: COLORS.wear + "22", color: COLORS.wear,
          letterSpacing: 1, textTransform: "uppercase", fontWeight: 600,
        }}>No ML model — thickness tracked</div>
      </div>
      <WearBar pct={pct} weeksToCondemn={eq.weeksToCondemn} />
      <div style={{ fontSize: 9.5, color: COLORS.wear, fontFamily: "'IBM Plex Mono', monospace" }}>Click for escalation details &amp; root cause →</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component detail modal — click-through drill-down (escalation + root cause)
// ---------------------------------------------------------------------------
function DetailModal({ item, onClose }) {
  if (!item) return null;
  const isWear = item.kind === "wear";
  const tier = isWear ? (item.pct >= 80 ? "Critical" : item.pct >= 55 ? "High" : "Medium") : item.riskTier;
  const esc = ESCALATION_INFO[tier];
  const hint = ROOT_CAUSE_HINTS[item.id];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 12,
        maxWidth: 520, width: "100%", padding: 26, maxHeight: "85vh", overflowY: "auto",
        borderTop: `3px solid ${TIER_COLOR[tier] || COLORS.wear}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 18, color: COLORS.textPrimary }}>{item.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{
          display: "inline-block", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10,
          padding: "3px 9px", borderRadius: 4, background: (TIER_COLOR[tier] || COLORS.wear) + "22", color: TIER_COLOR[tier] || COLORS.wear,
          letterSpacing: 1, textTransform: "uppercase", fontWeight: 600, marginBottom: 16,
        }}>{tier} tier{isWear ? " (wear-based)" : " (ML-modeled)"}</div>

        <div style={{ fontSize: 11, letterSpacing: 1, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Escalation Workflow</div>
        <div style={{ background: COLORS.bgPanelRaised, borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 12.5, lineHeight: 1.7, color: COLORS.textPrimary }}>
          <div><b>Notified:</b> {esc.notified}</div>
          <div><b>Channel:</b> {esc.channel}</div>
          <div><b>Response SLA:</b> {esc.sla}</div>
          <div><b>Logging:</b> {esc.logging}</div>
        </div>

        <div style={{ fontSize: 11, letterSpacing: 1, color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>Root Cause Hint</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: COLORS.textPrimary, marginBottom: 4 }}>{hint}</div>
        <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontStyle: "italic" }}>Starting hypothesis only — confirm via 5 Whys / Fishbone RCA per the framework, not a diagnosis.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Business impact strip
// ---------------------------------------------------------------------------
function BusinessImpactStrip({ criticalCount, highCount }) {
  const flagged = criticalCount + highCount;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, padding: "12px 32px",
      background: COLORS.bgPanelRaised, borderBottom: `1px solid ${COLORS.border}`, flexWrap: "wrap",
    }}>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, letterSpacing: 1, color: COLORS.textMuted, textTransform: "uppercase" }}>
        Business Impact
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.textPrimary }}>
        {flagged === 0
          ? "No components currently flagged High/Critical."
          : <>Currently <b style={{ color: criticalCount > 0 ? COLORS.critical : COLORS.high }}>{flagged}</b> component{flagged > 1 ? "s" : ""} at High/Critical risk.</>
        } Industry data puts unplanned primary crusher downtime at{" "}
        <b style={{ color: COLORS.textPrimary }}>${CRUSHER_DOWNTIME_COST_PER_DAY.low.toLocaleString()}–${CRUSHER_DOWNTIME_COST_PER_DAY.high.toLocaleString()} per day</b> in lost production.
      </div>
      <div style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: "italic", marginLeft: "auto" }}>
        Industry-wide estimate, not DCP-confirmed — for illustration of order of magnitude only.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible methodology panel
// ---------------------------------------------------------------------------
function MethodologyPanel({ open, onToggle }) {
  return (
    <div style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "none", border: "none", cursor: "pointer", padding: "16px 20px",
        fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.textMuted, textTransform: "uppercase",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Cpu size={13} color={COLORS.steel} /> Methodology &amp; Data Sources</span>
        <span style={{ color: COLORS.steel }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 20px 20px", fontSize: 12, lineHeight: 1.7, color: COLORS.textPrimary }}>
          <p style={{ margin: "0 0 10px" }}><b>Training data:</b> CWRU Bearing Dataset — real vibration recordings from seeded ball/inner-race/outer-race bearing faults, Case Western Reserve University Bearing Data Center. Widely-cited industry benchmark, not synthetic or fabricated data.</p>
          <p style={{ margin: "0 0 10px" }}><b>Model:</b> Random Forest classifier, 50 trees, 96.6% accuracy on held-out test data (shrunk from a 200-tree/97.3% version to fit serverless deployment size limits — see Live API mode).</p>
          <p style={{ margin: "0 0 10px" }}><b>Modeled vs. unmodeled split:</b> bearing components (Eccentric Shaft, Drive Motor, Countershaft) are backed by this trained classifier. Wear components (Jaw Plate, Toggle Plate, CSS Drift) have no matching public sensor dataset — no vibration dataset captures geometric wear the way it captures bearing degradation — so they are tracked by thickness/inspection interval instead, and clearly marked as such throughout this dashboard rather than assigned a fabricated score.</p>
          <p style={{ margin: 0 }}><b>Key assumption:</b> this model is trained on proxy data, not real DCP sensor signals. It demonstrates the approach is technically sound; a Phase 1 pilot against real plant sensors is required before Critical-tier alerts should be trusted without human sign-off.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible risk & limitations panel
// ---------------------------------------------------------------------------
function RiskLimitationsPanel({ open, onToggle }) {
  return (
    <div style={{ background: COLORS.bgPanel, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: "hidden" }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "none", border: "none", cursor: "pointer", padding: "16px 20px",
        fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.textMuted, textTransform: "uppercase",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={13} color={COLORS.wear} /> System Risks &amp; Limitations</span>
        <span style={{ color: COLORS.steel }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {RISK_REGISTER_TOP.map(r => (
            <div key={r.id} style={{ background: COLORS.bgPanelRaised, borderRadius: 8, padding: "12px 14px", borderLeft: `3px solid ${COLORS.wear}` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: COLORS.wear, fontWeight: 600 }}>{r.id}</span>
                <span style={{ fontSize: 12, color: COLORS.textPrimary }}>{r.desc}</span>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, lineHeight: 1.5 }}><b>Mitigation:</b> {r.mitigation}</div>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: COLORS.textMuted, fontStyle: "italic" }}>Full 8-risk register with likelihood/impact scoring maintained separately in the Industrial Risk Register document (Task 1.3).</div>
        </div>
      )}
    </div>
  );
}


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
  const [selectedItem, setSelectedItem] = useState(null);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showRisks, setShowRisks] = useState(false);
  const historyRef = useRef([]);
  const tickRef = useRef(1);

  useEffect(() => {
    const avg = modeled.reduce((s, e) => s + e.riskScore, 0) / modeled.length;
    const seed = [{ t: "T0", plantRisk: Math.round(avg) }];
    historyRef.current = seed;
    setHistory(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyModeledUpdate = (next) => {
    // Alert only on a tier CHANGE into High/Critical, not on every tick a
    // component stays there — the R5 (alert fatigue) mitigation, implemented.
    const prevTier = Object.fromEntries(modeled.map(e => [e.name, e.riskTier]));
    next.forEach(e => {
      if ((e.riskTier === "Critical" || e.riskTier === "High") && e.riskTier !== prevTier[e.name]) {
        setAlerts(a => [{
          id: Date.now() + Math.random(), time: nowLabel(), name: e.short,
          tier: e.riskTier, score: Math.round(e.riskScore), kind: "model",
          trueFault: e.trueFault, predictedFault: e.predictedFault,
          action: ACTION_TEXT[e.riskTier],
        }, ...a].slice(0, 6));
      }
    });
    const avg = next.reduce((s, e) => s + e.riskScore, 0) / next.length;
    const newHist = [...historyRef.current.slice(-11), { t: `T${tickRef.current++}`, plantRisk: Math.round(avg) }];
    historyRef.current = newHist;
    setHistory(newHist);
    setModeled(next);
  };

  const precomputedTick = () => {
    const next = modeled.map(e => {
      const row = nextRealReading(e.name, cursorRef);
      return { ...e, ...row };
    });
    applyModeledUpdate(next);
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
        // Actually fall back, so the banner copy is true and the demo keeps moving.
        setLiveError(err.message || "Live inference request failed");
        setLiveMode(false);
        precomputedTick();
      } finally {
        setLiveLoading(false);
      }
    } else {
      precomputedTick();
    }

    setWear(prev => prev.map(e => {
      const next = Math.min(100, e.pct + Math.random() * 1.8);
      if (next >= 80 && e.pct < 80) {
        setAlerts(a => [{ id: Date.now() + Math.random(), time: nowLabel(), name: e.short, tier: "Critical", score: Math.round(next), kind: "wear", action: WEAR_ACTION }, ...a].slice(0, 6));
      }
      return { ...e, pct: next };
    }));
  };

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
            onClick={() => { setLiveMode(m => !m); setLiveError(null); }}
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
          API error: {liveError} — switched back to Precomputed mode. Live mode needs the deployed Vercel /api/predict function (or `vercel dev` locally).
        </div>
      )}

      <BusinessImpactStrip
        criticalCount={modeled.filter(e => e.riskTier === "Critical").length}
        highCount={modeled.filter(e => e.riskTier === "High").length}
      />

      <div style={{ background: COLORS.bgPanel, borderBottom: `1px solid ${COLORS.border}` }}>
        <CrusherSchematic modeled={modeled} jawWear={jawWear.pct} cssPct={cssWear.pct} />
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
              {modeled.map(eq => <ModeledCard key={eq.id} eq={eq} onClick={() => setSelectedItem({ ...eq, kind: "model" })} />)}
            </div>
          </div>

          <div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: 1.5, color: COLORS.wear, marginBottom: 12, textTransform: "uppercase" }}>
              Wear Components — Thickness Tracked, No ML Model
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {wear.map(eq => <WearCard key={eq.id} eq={eq} pct={eq.pct} onClick={() => setSelectedItem({ ...eq, kind: "wear" })} />)}
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
                      <div style={{ marginTop: 3, fontSize: 10.5, color: COLORS.textPrimary, lineHeight: 1.35 }}>
                        → {a.action}
                      </div>
                    </div>
                    <ChevronRight size={14} color={COLORS.textMuted} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <MethodologyPanel open={showMethodology} onToggle={() => setShowMethodology(v => !v)} />
          <RiskLimitationsPanel open={showRisks} onToggle={() => setShowRisks(v => !v)} />
        </div>
      </div>

      <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />

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
