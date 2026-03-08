#!/usr/bin/env node
/**
 * OpenModelStudio Architecture Diagram Generator
 *
 * Generates a clean, professional SVG architecture diagram with
 * orthogonal (elbow) connectors and strict grid alignment.
 *
 * Run:    node docs/diagrams/generate-architecture.js
 * Output: docs/diagrams/architecture.svg
 */

const fs = require("fs");
const path = require("path");

// ── Canvas ────────────────────────────────────────────────────────────
const W = 1100;
const H = 700;

// ── Colors ────────────────────────────────────────────────────────────
const BG = "#0d1117";
const TEXT_PRIMARY = "#e6edf3";
const TEXT_SEC = "rgba(230,237,243,0.5)";
const TEXT_DIM = "rgba(230,237,243,0.3)";
const LINE_COLOR = "rgba(230,237,243,0.12)";

const C = {
  violet:  { bg: "rgba(139,92,246,0.10)",  border: "rgba(139,92,246,0.35)",  text: "#a78bfa" },
  blue:    { bg: "rgba(59,130,246,0.10)",   border: "rgba(59,130,246,0.35)",  text: "#60a5fa" },
  teal:    { bg: "rgba(20,184,166,0.10)",   border: "rgba(20,184,166,0.35)",  text: "#2dd4bf" },
  amber:   { bg: "rgba(245,158,11,0.08)",   border: "rgba(245,158,11,0.30)",  text: "#fbbf24" },
  emerald: { bg: "rgba(16,185,129,0.08)",   border: "rgba(16,185,129,0.30)",  text: "#34d399" },
  slate:   { bg: "rgba(148,163,184,0.06)",  border: "rgba(148,163,184,0.20)", text: "#94a3b8" },
  storage: { bg: "rgba(255,255,255,0.025)", border: "rgba(255,255,255,0.06)", text: TEXT_SEC },
};

// ── SVG primitives ────────────────────────────────────────────────────
const p = []; // SVG parts accumulator

function rect(x, y, w, h, color, { rx = 8, dash = false } = {}) {
  const d = dash ? ` stroke-dasharray="6,4"` : "";
  p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${color.bg}" stroke="${color.border}" stroke-width="1"${d}/>`);
}

function txt(x, y, str, { size = 12, fill = TEXT_PRIMARY, bold = false, anchor = "middle", mono = false } = {}) {
  const fam = mono
    ? `'JetBrains Mono','SF Mono','Fira Code',monospace`
    : `'Inter','Segoe UI',system-ui,sans-serif`;
  const fw = bold ? 600 : 400;
  p.push(`<text x="${x}" y="${y}" font-family="${fam}" font-size="${size}" font-weight="${fw}" fill="${fill}" text-anchor="${anchor}">${str}</text>`);
}

function label(x, y, str) {
  txt(x, y, str.toUpperCase(), { size: 9, fill: TEXT_DIM, bold: true, anchor: "start" });
}

// Service box: colored rect with title, subtitle, optional port
function svc(x, y, w, h, title, sub, port, color) {
  rect(x, y, w, h, color);
  txt(x + w / 2, y + (port ? 20 : h / 2 - 3), title, { size: 12, fill: color.text, bold: true });
  txt(x + w / 2, y + (port ? 35 : h / 2 + 12), sub, { size: 9, fill: TEXT_SEC });
  if (port) txt(x + w / 2, y + 50, port, { size: 8, fill: TEXT_DIM, mono: true });
}

function pill(x, y, w, h, title, color, sub) {
  rect(x, y, w, h, color, { rx: 6 });
  txt(x + w / 2, y + (sub ? h / 2 - 4 : h / 2 + 4), title, { size: 10, fill: color.text, bold: true });
  if (sub) txt(x + w / 2, y + h / 2 + 10, sub, { size: 8, fill: TEXT_DIM });
}

// ── Elbow connectors ──────────────────────────────────────────────────
// All connectors use orthogonal paths (only horizontal + vertical segments)

function elbowV(x1, y1, x2, y2, lbl, { color = LINE_COLOR, dash = false, arrow = "end", lblPos = "right" } = {}) {
  // Vertical-first elbow: go down to midY, then horizontal, then down
  const midY = (y1 + y2) / 2;
  const d = `M${x1},${y1} V${midY} H${x2} V${y2}`;
  const da = dash ? ` stroke-dasharray="4,3"` : "";
  let markers = "";
  if (arrow === "end") markers = ` marker-end="url(#ah)"`;
  if (arrow === "both") markers = ` marker-start="url(#ah-r)" marker-end="url(#ah)"`;
  p.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1"${da}${markers}/>`);
  if (lbl) {
    const lx = lblPos === "right" ? Math.max(x1, x2) + 6 : Math.min(x1, x2) - 6;
    const anc = lblPos === "right" ? "start" : "end";
    txt(lx, midY + 3, lbl, { size: 8, fill: TEXT_DIM, anchor: anc });
  }
}

function elbowH(x1, y1, x2, y2, lbl, { color = LINE_COLOR, dash = false, arrow = "end" } = {}) {
  // Horizontal-first elbow: go right to midX, then vertical, then right
  const midX = (x1 + x2) / 2;
  const d = `M${x1},${y1} H${midX} V${y2} H${x2}`;
  const da = dash ? ` stroke-dasharray="4,3"` : "";
  let markers = "";
  if (arrow === "end") markers = ` marker-end="url(#ah)"`;
  if (arrow === "both") markers = ` marker-start="url(#ah-r)" marker-end="url(#ah)"`;
  p.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1"${da}${markers}/>`);
  if (lbl) {
    txt(midX, Math.min(y1, y2) - 5, lbl, { size: 8, fill: TEXT_DIM });
  }
}

function lineH(x1, y, x2, lbl, { color = LINE_COLOR, arrow = "end" } = {}) {
  let markers = "";
  if (arrow === "end") markers = ` marker-end="url(#ah)"`;
  if (arrow === "both") markers = ` marker-start="url(#ah-r)" marker-end="url(#ah)"`;
  p.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="1"${markers}/>`);
  if (lbl) txt((x1 + x2) / 2, y - 6, lbl, { size: 8, fill: TEXT_DIM });
}

function lineV(x, y1, y2, lbl, { color = LINE_COLOR, arrow = "end", dash = false, lblPos = "right" } = {}) {
  const da = dash ? ` stroke-dasharray="4,3"` : "";
  let markers = "";
  if (arrow === "end") markers = ` marker-end="url(#ah)"`;
  if (arrow === "both") markers = ` marker-start="url(#ah-r)" marker-end="url(#ah)"`;
  p.push(`<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="1"${da}${markers}/>`);
  if (lbl) {
    const lx = lblPos === "right" ? x + 7 : x - 7;
    const anc = lblPos === "right" ? "start" : "end";
    txt(lx, (y1 + y2) / 2 + 3, lbl, { size: 8, fill: TEXT_DIM, anchor: anc });
  }
}

// ── GENERATE ──────────────────────────────────────────────────────────

function generate() {
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
  p.push(`<defs>
  <marker id="ah" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5Z" fill="rgba(230,237,243,0.3)"/></marker>
  <marker id="ah-r" markerWidth="7" markerHeight="5" refX="1" refY="2.5" orient="auto"><path d="M7,0 L0,2.5 L7,5Z" fill="rgba(230,237,243,0.3)"/></marker>
</defs>`);

  // Background
  p.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);

  // Title
  txt(W / 2, 28, "OpenModelStudio — System Architecture", { size: 16, bold: true });

  // ═══════════════════════════════════════════════════════════════════
  // ROW 0: Clients (y = 48)
  // ═══════════════════════════════════════════════════════════════════
  const R0 = 48;
  const clientW = 110, clientH = 34;
  // Center 3 clients above the cluster's core services
  const c1x = 310, c2x = 530, c3x = 750;
  pill(c1x, R0, clientW, clientH, "Browser", C.slate);
  pill(c2x, R0, clientW, clientH, "Python SDK", C.slate);
  pill(c3x, R0, clientW, clientH, "CLI", C.slate);

  // ═══════════════════════════════════════════════════════════════════
  // KUBERNETES CLUSTER BOX (main container)
  // ═══════════════════════════════════════════════════════════════════
  const KX = 250, KY = 100, KW = 820, KH = 540;
  rect(KX, KY, KW, KH, { bg: "rgba(255,255,255,0.015)", border: "rgba(255,255,255,0.05)" }, { rx: 14 });
  txt(KX + 14, KY + 16, "Kubernetes Cluster", { size: 10, fill: TEXT_DIM, bold: true, anchor: "start" });
  txt(KX + KW - 14, KY + 16, "ns: openmodelstudio", { size: 8, fill: TEXT_DIM, anchor: "end", mono: true });

  // ═══════════════════════════════════════════════════════════════════
  // ROW 1: Core Services (y = 130)
  // ═══════════════════════════════════════════════════════════════════
  const R1 = 130;
  const sW = 175, sH = 58, sGap = 18;
  const s1x = KX + 30;               // Frontend
  const s2x = s1x + sW + sGap;       // Rust API
  const s3x = s2x + sW + sGap;       // PostGraphile
  const s4x = s3x + sW + sGap;       // JupyterHub

  label(s1x, R1 - 6, "Core Services");
  svc(s1x, R1, sW, sH, "Frontend", "Next.js + shadcn/ui", ":31000", C.violet);
  svc(s2x, R1, sW, sH, "Rust API", "Axum + SQLx", ":31001", C.blue);
  svc(s3x, R1, sW, sH, "PostGraphile", "Auto-gen GraphQL", ":31002", C.blue);
  svc(s4x, R1, sW, sH, "JupyterHub", "Workspace Manager", ":31003", C.emerald);

  // Center-x of each service
  const f_cx = s1x + sW / 2;
  const a_cx = s2x + sW / 2;
  const pg_cx = s3x + sW / 2;
  const j_cx = s4x + sW / 2;

  // ── Client → Service arrows (straight vertical drops, clean) ──
  lineV(c1x + clientW / 2, R0 + clientH, R1, "HTTP", { color: C.violet.border });
  lineV(c2x + clientW / 2, R0 + clientH, R1, "REST", { color: C.blue.border });
  // CLI arrow elbows to API
  elbowV(c3x + clientW / 2, R0 + clientH, a_cx + 20, R1, "REST", { color: C.blue.border, lblPos: "left" });

  // ── Horizontal: Frontend ↔ API ──
  lineH(s1x + sW, R1 + sH / 2, s2x, "REST + SSE", { arrow: "both", color: C.violet.border });

  // ── Horizontal: Frontend ↔ PostGraphile (skip over API) ──
  const gqlY = R1 + sH + 8;
  p.push(`<path d="M${f_cx},${R1 + sH} V${gqlY} H${pg_cx} V${R1 + sH}" fill="none" stroke="${C.blue.border}" stroke-width="1" stroke-dasharray="4,3" marker-start="url(#ah-r)" marker-end="url(#ah)"/>`);
  txt((f_cx + pg_cx) / 2, gqlY + 12, "GraphQL", { size: 8, fill: TEXT_DIM });

  // ═══════════════════════════════════════════════════════════════════
  // ROW 2: PostgreSQL (y = 250)
  // ═══════════════════════════════════════════════════════════════════
  const R2 = 260;
  const dbW = 280, dbH = 55;
  const dbX = KX + KW / 2 - dbW / 2;

  label(s1x, R2 - 6, "Data Layer");
  rect(dbX, R2, dbW, dbH, C.teal);
  txt(dbX + dbW / 2, R2 + 18, "PostgreSQL 16", { size: 13, fill: C.teal.text, bold: true });
  txt(dbX + dbW / 2, R2 + 33, "27 tables \u00b7 System of Record", { size: 9, fill: TEXT_SEC });
  txt(dbX + dbW / 2, R2 + 47, ":5432", { size: 8, fill: TEXT_DIM, mono: true });

  const db_cx = dbX + dbW / 2;

  // ── API → DB  (vertical drop) ──
  lineV(a_cx, R1 + sH, R2, "SQL", { color: C.teal.border, arrow: "both" });

  // ── PostGraphile → DB (elbow) ──
  elbowV(pg_cx, R1 + sH + 20, db_cx + 40, R2, "SQL", { color: C.teal.border, arrow: "both", lblPos: "left" });

  // ═══════════════════════════════════════════════════════════════════
  // ROW 3: Ephemeral Pods (y = 370)
  // ═══════════════════════════════════════════════════════════════════
  const R3 = 375;
  const podW = (KW - 60 - 20) / 2, podH = 70;
  const pod1x = KX + 30;
  const pod2x = pod1x + podW + 20;

  label(s1x, R3 - 6, "Ephemeral Pods");

  // Model Runner
  rect(pod1x, R3, podW, podH, C.amber, { dash: true });
  txt(pod1x + podW / 2, R3 + 17, "Model Runner Pods", { size: 11, fill: C.amber.text, bold: true });
  txt(pod1x + podW / 2, R3 + 32, "Ephemeral K8s Jobs", { size: 9, fill: TEXT_SEC });
  txt(pod1x + podW / 2, R3 + 46, "Python (PyTorch / sklearn) \u00b7 Rust (tch-rs)", { size: 8, fill: TEXT_DIM });
  txt(pod1x + podW / 2, R3 + 60, "oms-job-*", { size: 8, fill: TEXT_DIM, mono: true });

  // Workspace
  rect(pod2x, R3, podW, podH, C.emerald, { dash: true });
  txt(pod2x + podW / 2, R3 + 17, "Workspace Pods", { size: 11, fill: C.emerald.text, bold: true });
  txt(pod2x + podW / 2, R3 + 32, "Per-User JupyterLab", { size: 9, fill: TEXT_SEC });
  txt(pod2x + podW / 2, R3 + 46, "SDK + Tutorial Notebooks + Datasets", { size: 8, fill: TEXT_DIM });
  txt(pod2x + podW / 2, R3 + 60, "oms-ws-*", { size: 8, fill: TEXT_DIM, mono: true });

  const runner_cx = pod1x + podW / 2;
  const ws_cx = pod2x + podW / 2;

  // ── API → Runner (elbow: down from API, right to runner) ──
  elbowV(a_cx - 15, R2 + dbH + 10, runner_cx, R3, "Job orchestration", { color: C.amber.border, dash: true, lblPos: "left" });

  // ── Runner → API (metrics — separate path, elbow back up) ──
  elbowV(runner_cx + 40, R3, a_cx + 15, R2 + dbH + 10, "Metrics + Logs", { color: C.amber.border, arrow: "end", lblPos: "right" });

  // ── JupyterHub → Workspace Pods ──
  lineV(j_cx, R1 + sH + 20, R3, "Pod spawning", { color: C.emerald.border, dash: true });

  // ── Workspace SDK → API (elbow) ──
  elbowV(ws_cx - 40, R3, a_cx + 40, R2 + dbH + 10, "SDK \u2192 REST", { color: C.blue.border, dash: true, arrow: "both", lblPos: "right" });

  // ═══════════════════════════════════════════════════════════════════
  // ROW 4: Persistent Volumes (y = 500)
  // ═══════════════════════════════════════════════════════════════════
  const R4 = 500;
  const pvW = (KW - 60 - 16 * 3) / 4, pvH = 40;

  label(s1x, R4 - 6, "Persistent Volumes");

  const pvData = [
    ["models-pvc", "Model Code"],
    ["datasets-pvc", "Training Data"],
    ["artifacts-pvc", "Job Outputs"],
    ["postgres-data", "Database"],
  ];
  for (let i = 0; i < 4; i++) {
    const px = KX + 30 + i * (pvW + 16);
    rect(px, R4, pvW, pvH, C.storage, { rx: 6 });
    txt(px + pvW / 2, R4 + 16, pvData[i][0], { size: 9, fill: TEXT_SEC, mono: true });
    txt(px + pvW / 2, R4 + 30, pvData[i][1], { size: 8, fill: TEXT_DIM });
  }

  // ═══════════════════════════════════════════════════════════════════
  // LEFT COLUMN: External Services
  // ═══════════════════════════════════════════════════════════════════
  const EX = 30, EW = 190, EH = 50, EGap = 14;
  const E1y = 140, E2y = E1y + EH + EGap, E3y = E2y + EH + EGap;

  label(EX, E1y - 8, "External Services");
  pill(EX, E1y, EW, EH, "GitHub Registry", C.slate, "Open Model Registry");
  pill(EX, E2y, EW, EH, "LLM Providers", C.slate, "OpenAI / Anthropic / Ollama");
  pill(EX, E3y, EW, EH, "S3 / MinIO", C.slate, "Artifact Storage");

  // ── External → API (horizontal elbows into left edge of API) ──
  const extRight = EX + EW;
  const apiLeft = s2x;

  // GitHub → API (straight horizontal — same Y as API row)
  lineH(extRight, E1y + EH / 2, apiLeft, "Model fetch", { color: C.slate.border, arrow: "both" });

  // LLM → API (elbow: goes right, up to API mid, then right into API)
  const llmMidX = extRight + 30;
  p.push(`<path d="M${extRight},${E2y + EH / 2} H${llmMidX} V${R1 + 20} H${apiLeft}" fill="none" stroke="${C.slate.border}" stroke-width="1" marker-start="url(#ah-r)" marker-end="url(#ah)"/>`);
  txt(llmMidX + 4, R1 + 16, "HTTPS", { size: 8, fill: TEXT_DIM, anchor: "start" });

  // S3 → API (elbow: goes right, up to API bottom area, then right into API)
  const s3MidX = extRight + 50;
  p.push(`<path d="M${extRight},${E3y + EH / 2} H${s3MidX} V${R1 + 40} H${apiLeft}" fill="none" stroke="${C.slate.border}" stroke-width="1" marker-start="url(#ah-r)" marker-end="url(#ah)"/>`);
  txt(s3MidX + 4, R1 + 36, "Presigned URLs", { size: 8, fill: TEXT_DIM, anchor: "start" });

  // ═══════════════════════════════════════════════════════════════════
  // LEGEND (bottom)
  // ═══════════════════════════════════════════════════════════════════
  const LY = H - 26;
  const legends = [
    ["Frontend / UI", C.violet],
    ["API / Backend", C.blue],
    ["Data Layer", C.teal],
    ["Ephemeral Pods", C.amber],
    ["Workspaces", C.emerald],
    ["External", C.slate],
  ];
  const legSpacing = 170;
  for (let i = 0; i < legends.length; i++) {
    const lx = 40 + i * legSpacing;
    p.push(`<rect x="${lx}" y="${LY - 5}" width="10" height="10" rx="2" fill="${legends[i][1].bg}" stroke="${legends[i][1].border}" stroke-width="1"/>`);
    txt(lx + 16, LY + 4, legends[i][0], { size: 9, fill: TEXT_SEC, anchor: "start" });
  }

  p.push("</svg>");
  return p.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────
const svg = generate();
const outPath = path.join(__dirname, "architecture.svg");
fs.writeFileSync(outPath, svg);
console.log(`Generated ${outPath} (${(svg.length / 1024).toFixed(1)} KB)`);
