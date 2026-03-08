#!/usr/bin/env node
/**
 * OpenModelStudio Architecture Diagram Generator
 *
 * Generates a professional SVG architecture diagram.
 * Run: node docs/diagrams/generate-architecture.js
 * Output: docs/diagrams/architecture.svg
 */

const fs = require("fs");
const path = require("path");

// ── Layout constants ──────────────────────────────────────────────────
const W = 1200;
const H = 620;
const PAD = 40;

// Colors
const BG = "#0d1117";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#e6edf3";
const TEXT_SECONDARY = "rgba(230,237,243,0.55)";
const TEXT_DIM = "rgba(230,237,243,0.35)";
const LABEL_COLOR = "rgba(230,237,243,0.45)";

// Component colors
const VIOLET = { fill: "rgba(139,92,246,0.12)", stroke: "rgba(139,92,246,0.4)", text: "#a78bfa" };
const BLUE = { fill: "rgba(59,130,246,0.12)", stroke: "rgba(59,130,246,0.4)", text: "#60a5fa" };
const TEAL = { fill: "rgba(20,184,166,0.12)", stroke: "rgba(20,184,166,0.4)", text: "#2dd4bf" };
const AMBER = { fill: "rgba(245,158,11,0.10)", stroke: "rgba(245,158,11,0.35)", text: "#fbbf24" };
const SLATE = { fill: "rgba(148,163,184,0.08)", stroke: "rgba(148,163,184,0.25)", text: "#94a3b8" };
const EMERALD = { fill: "rgba(16,185,129,0.10)", stroke: "rgba(16,185,129,0.35)", text: "#34d399" };

// ── SVG helpers ───────────────────────────────────────────────────────

function roundRect(x, y, w, h, { fill, stroke }, rx = 10, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="1.2" ${extra}/>`;
}

function text(x, y, content, { size = 13, fill = TEXT_PRIMARY, weight = 400, anchor = "middle", family = "'Inter','Segoe UI',system-ui,sans-serif" } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${content}</text>`;
}

function monoText(x, y, content, { size = 10, fill = TEXT_DIM } = {}) {
  return `<text x="${x}" y="${y}" font-family="'JetBrains Mono','SF Mono','Fira Code',monospace" font-size="${size}" fill="${fill}" text-anchor="middle">${content}</text>`;
}

function serviceBox(x, y, w, h, title, subtitle, port, color) {
  const cx = x + w / 2;
  let s = roundRect(x, y, w, h, color, 8);
  s += text(cx, y + h / 2 - 8, title, { size: 13, fill: color.text, weight: 600 });
  s += text(cx, y + h / 2 + 7, subtitle, { size: 10, fill: TEXT_SECONDARY });
  if (port) {
    s += monoText(cx, y + h / 2 + 22, port, { size: 9, fill: TEXT_DIM });
  }
  return s;
}

function smallBox(x, y, w, h, title, color, subtitle) {
  const cx = x + w / 2;
  let s = roundRect(x, y, w, h, color, 6);
  s += text(cx, y + h / 2 - (subtitle ? 4 : 0), title, { size: 11, fill: color.text, weight: 500 });
  if (subtitle) {
    s += text(cx, y + h / 2 + 10, subtitle, { size: 9, fill: TEXT_DIM });
  }
  return s;
}

function arrow(x1, y1, x2, y2, label, { color = "rgba(255,255,255,0.15)", dashed = false, labelSide = "right" } = {}) {
  const dashAttr = dashed ? ' stroke-dasharray="4,3"' : "";
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // arrowhead marker is defined in defs
  let s = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.2"${dashAttr} marker-end="url(#arrowhead)"/>`;
  if (label) {
    const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
    if (isVertical) {
      const lx = labelSide === "right" ? mx + 8 : mx - 8;
      const anc = labelSide === "right" ? "start" : "end";
      s += text(lx, my, label, { size: 9, fill: LABEL_COLOR, anchor: anc });
    } else {
      s += text(mx, my - 6, label, { size: 9, fill: LABEL_COLOR });
    }
  }
  return s;
}

function biArrow(x1, y1, x2, y2, label, opts = {}) {
  const color = opts.color || "rgba(255,255,255,0.15)";
  const dashed = opts.dashed ? ' stroke-dasharray="4,3"' : "";
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  let s = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.2"${dashed} marker-start="url(#arrowhead-rev)" marker-end="url(#arrowhead)"/>`;
  if (label) {
    const isVertical = Math.abs(y2 - y1) > Math.abs(x2 - x1);
    if (isVertical) {
      const labelSide = opts.labelSide || "right";
      const lx = labelSide === "right" ? mx + 8 : mx - 8;
      const anc = labelSide === "right" ? "start" : "end";
      s += text(lx, my, label, { size: 9, fill: LABEL_COLOR, anchor: anc });
    } else {
      s += text(mx, my - 6, label, { size: 9, fill: LABEL_COLOR });
    }
  }
  return s;
}

function sectionLabel(x, y, label) {
  return text(x, y, label, { size: 10, fill: TEXT_DIM, weight: 600, anchor: "start" });
}

// ── Build the SVG ─────────────────────────────────────────────────────

function generateSVG() {
  const parts = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);

  // Defs (arrowheads, filters)
  parts.push(`<defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L8,3 L0,6 Z" fill="rgba(255,255,255,0.3)"/>
    </marker>
    <marker id="arrowhead-rev" markerWidth="8" markerHeight="6" refX="1" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M8,0 L0,3 L8,6 Z" fill="rgba(255,255,255,0.3)"/>
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`);

  // Background
  parts.push(`<rect width="${W}" height="${H}" fill="${BG}" rx="0"/>`);

  // Title
  parts.push(text(W / 2, 32, "OpenModelStudio — System Architecture", { size: 18, fill: TEXT_PRIMARY, weight: 700 }));

  // ────────────────────────────────────────────────────────────────
  // LAYER 1: Users & Clients (top)
  // ────────────────────────────────────────────────────────────────
  const clientY = 52;
  parts.push(sectionLabel(PAD, clientY + 10, "CLIENTS"));

  const clientBoxW = 120;
  const clientBoxH = 38;
  const clientSpacing = 160;
  const clientStartX = W / 2 - (clientSpacing * 1); // 3 items centered

  parts.push(smallBox(clientStartX, clientY, clientBoxW, clientBoxH, "Browser", SLATE));
  parts.push(smallBox(clientStartX + clientSpacing, clientY, clientBoxW, clientBoxH, "Python SDK", SLATE));
  parts.push(smallBox(clientStartX + clientSpacing * 2, clientY, clientBoxW, clientBoxH, "CLI", SLATE));

  // ────────────────────────────────────────────────────────────────
  // LAYER 2: External integrations (left and right of cluster)
  // ────────────────────────────────────────────────────────────────

  // External services — positioned on the left side
  const extY = 155;
  const extW = 130;
  const extH = 55;
  const extGap = 12;

  // Left side externals
  parts.push(sectionLabel(PAD, extY - 14, "EXTERNAL"));
  parts.push(smallBox(PAD, extY, extW, extH, "GitHub Registry", SLATE, "Model Registry"));
  parts.push(smallBox(PAD, extY + extH + extGap, extW, extH, "LLM Providers", SLATE, "OpenAI / Anthropic"));
  parts.push(smallBox(PAD, extY + (extH + extGap) * 2, extW, extH, "S3 / MinIO", SLATE, "Artifact Storage"));

  // ────────────────────────────────────────────────────────────────
  // LAYER 3: Kubernetes Cluster (main container)
  // ────────────────────────────────────────────────────────────────
  const clusterX = PAD + extW + 30;
  const clusterY = 108;
  const clusterW = W - clusterX - PAD;
  const clusterH = 460; // fits: services + db + pods + pvcs

  // Cluster background
  parts.push(roundRect(clusterX, clusterY, clusterW, clusterH, { fill: "rgba(255,255,255,0.02)", stroke: "rgba(255,255,255,0.06)" }, 16));

  // Cluster label
  parts.push(text(clusterX + 16, clusterY + 20, "Kubernetes Cluster", { size: 11, fill: TEXT_DIM, weight: 600, anchor: "start" }));
  parts.push(monoText(clusterX + clusterW - 60, clusterY + 20, "namespace: openmodelstudio", { size: 9, fill: TEXT_DIM }));

  // ── Core Services Row ──
  const svcY = clusterY + 40;
  const svcH = 62;
  const svcGap = 16;
  const svcCount = 4;
  const svcTotalW = clusterW - 40;
  const svcW = (svcTotalW - svcGap * (svcCount - 1)) / svcCount;
  const svcStartX = clusterX + 20;

  parts.push(sectionLabel(svcStartX, svcY - 4, "CORE SERVICES"));

  parts.push(serviceBox(svcStartX, svcY, svcW, svcH, "Frontend", "Next.js + shadcn/ui", ":31000", VIOLET));
  parts.push(serviceBox(svcStartX + (svcW + svcGap), svcY, svcW, svcH, "Rust API", "Axum + SQLx", ":31001", BLUE));
  parts.push(serviceBox(svcStartX + (svcW + svcGap) * 2, svcY, svcW, svcH, "PostGraphile", "Auto-gen GraphQL", ":31002", BLUE));
  parts.push(serviceBox(svcStartX + (svcW + svcGap) * 3, svcY, svcW, svcH, "JupyterHub", "Workspace Mgmt", ":31003", EMERALD));

  // ── Arrows: Clients → Core Services ──
  // Browser → Frontend
  const browserCx = clientStartX + clientBoxW / 2;
  const sdkCx = clientStartX + clientSpacing + clientBoxW / 2;
  const cliCx = clientStartX + clientSpacing * 2 + clientBoxW / 2;
  const frontendCx = svcStartX + svcW / 2;
  const apiCx = svcStartX + (svcW + svcGap) + svcW / 2;
  const pgCx = svcStartX + (svcW + svcGap) * 2 + svcW / 2;
  const jupCx = svcStartX + (svcW + svcGap) * 3 + svcW / 2;

  parts.push(arrow(browserCx, clientY + clientBoxH, frontendCx, svcY, "HTTP", { color: VIOLET.stroke }));
  parts.push(arrow(sdkCx, clientY + clientBoxH, apiCx, svcY, "REST", { color: BLUE.stroke }));
  parts.push(arrow(cliCx, clientY + clientBoxH, apiCx + 20, svcY, "REST", { color: BLUE.stroke, labelSide: "left" }));

  // ── Frontend ↔ API arrows (horizontal) ──
  const svcMidY = svcY + svcH / 2;
  parts.push(biArrow(svcStartX + svcW, svcMidY, svcStartX + svcW + svcGap, svcMidY, "REST + SSE", { color: "rgba(139,92,246,0.3)" }));
  // Frontend ↔ PostGraphile
  parts.push(biArrow(svcStartX + svcW, svcMidY + 12, svcStartX + (svcW + svcGap) * 2, svcMidY + 12, "", { color: "rgba(96,165,250,0.2)", dashed: true }));
  parts.push(text(svcStartX + svcW + (svcW + svcGap), svcMidY + 26, "GraphQL", { size: 8, fill: TEXT_DIM }));

  // ── Database Layer ──
  const dbY = svcY + svcH + 50;
  const dbW = 260;
  const dbH = 60;
  const dbX = clusterX + clusterW / 2 - dbW / 2;

  parts.push(sectionLabel(svcStartX, dbY - 4, "DATA LAYER"));
  parts.push(roundRect(dbX, dbY, dbW, dbH, TEAL, 8));
  parts.push(text(dbX + dbW / 2, dbY + dbH / 2 - 10, "PostgreSQL 16", { size: 14, fill: TEAL.text, weight: 600 }));
  parts.push(text(dbX + dbW / 2, dbY + dbH / 2 + 6, "27 tables \u00b7 System of Record", { size: 10, fill: TEXT_SECONDARY }));
  parts.push(monoText(dbX + dbW / 2, dbY + dbH / 2 + 20, ":5432", { size: 9 }));

  // API → DB arrow
  parts.push(biArrow(apiCx, svcY + svcH, dbX + dbW / 2 - 20, dbY, "SQL", { color: TEAL.stroke, labelSide: "left" }));
  // PostGraphile → DB arrow
  parts.push(biArrow(pgCx, svcY + svcH, dbX + dbW / 2 + 20, dbY, "SQL", { color: TEAL.stroke }));

  // ── Ephemeral Pods ──
  const podY = dbY + dbH + 50;
  const podH = 72;
  const podGap = 24;
  const podW = (clusterW - 40 - podGap) / 2;

  parts.push(sectionLabel(svcStartX, podY - 4, "EPHEMERAL PODS"));

  // Model Runner Pods
  const runnerX = svcStartX;
  parts.push(roundRect(runnerX, podY, podW, podH, AMBER, 8, 'stroke-dasharray="6,3"'));
  parts.push(text(runnerX + podW / 2, podY + 18, "Model Runner Pods", { size: 12, fill: AMBER.text, weight: 600 }));
  parts.push(text(runnerX + podW / 2, podY + 34, "Ephemeral K8s Jobs", { size: 10, fill: TEXT_SECONDARY }));
  parts.push(text(runnerX + podW / 2, podY + 50, "Python (PyTorch/sklearn) \u00b7 Rust (tch-rs)", { size: 9, fill: TEXT_DIM }));
  parts.push(monoText(runnerX + podW / 2, podY + 64, "oms-job-*", { size: 9 }));

  // Workspace Pods
  const wsX = svcStartX + podW + podGap;
  parts.push(roundRect(wsX, podY, podW, podH, EMERALD, 8, 'stroke-dasharray="6,3"'));
  parts.push(text(wsX + podW / 2, podY + 18, "Workspace Pods", { size: 12, fill: EMERALD.text, weight: 600 }));
  parts.push(text(wsX + podW / 2, podY + 34, "Per-User JupyterLab", { size: 10, fill: TEXT_SECONDARY }));
  parts.push(text(wsX + podW / 2, podY + 50, "SDK + Tutorial Notebooks + Datasets", { size: 9, fill: TEXT_DIM }));
  parts.push(monoText(wsX + podW / 2, podY + 64, "oms-ws-*", { size: 9 }));

  // API → Model Pods arrow
  parts.push(arrow(apiCx, svcY + svcH, runnerX + podW / 2, podY, "", { color: AMBER.stroke, dashed: true }));
  parts.push(text(apiCx - 40, (svcY + svcH + podY) / 2 + 30, "Job orchestration", { size: 8, fill: LABEL_COLOR, anchor: "end" }));

  // Model Pods → API (metrics)
  parts.push(arrow(runnerX + podW / 2 + 30, podY, apiCx + 30, svcY + svcH, "", { color: AMBER.stroke }));
  parts.push(text(apiCx + 60, (svcY + svcH + podY) / 2 + 30, "Metrics + Logs (HTTP)", { size: 8, fill: LABEL_COLOR, anchor: "start" }));

  // JupyterHub → Workspace Pods
  parts.push(arrow(jupCx, svcY + svcH, wsX + podW / 2, podY, "Pod spawning", { color: EMERALD.stroke, dashed: true }));

  // Workspace SDK → API
  parts.push(biArrow(wsX + podW / 2 - 30, podY, apiCx + 60, svcY + svcH, "", { color: BLUE.stroke, dashed: true }));
  parts.push(text(wsX + 10, (svcY + svcH + podY) / 2 + 40, "SDK → REST", { size: 8, fill: LABEL_COLOR, anchor: "start" }));

  // ── Persistent Volumes ──
  const pvY = podY + podH + 40;
  const pvCount = 4;
  const pvGap = 12;
  const pvTotalW = clusterW - 40;
  const pvW = (pvTotalW - pvGap * (pvCount - 1)) / pvCount;

  parts.push(sectionLabel(svcStartX, pvY - 4, "PERSISTENT VOLUMES"));

  const pvNames = ["models-pvc", "datasets-pvc", "artifacts-pvc", "postgres-data"];
  const pvLabels = ["Model Code", "Training Data", "Job Outputs", "Database"];
  for (let i = 0; i < pvCount; i++) {
    const px = svcStartX + i * (pvW + pvGap);
    parts.push(roundRect(px, pvY, pvW, 42, { fill: "rgba(255,255,255,0.03)", stroke: "rgba(255,255,255,0.06)" }, 6));
    // Storage icon (simple cylinder-ish shape)
    parts.push(monoText(px + pvW / 2, pvY + 16, pvNames[i], { size: 9, fill: TEXT_SECONDARY }));
    parts.push(text(px + pvW / 2, pvY + 32, pvLabels[i], { size: 9, fill: TEXT_DIM }));
  }

  // ── External Integration Arrows ──
  const extMidX = PAD + extW;
  const apiLeft = svcStartX + (svcW + svcGap); // left edge of API box

  // GitHub Registry → API
  const ghMidY = extY + extH / 2;
  parts.push(biArrow(extMidX, ghMidY, apiLeft, svcMidY - 8, "", { color: SLATE.stroke }));
  parts.push(text(extMidX + 24, ghMidY - 8, "Model fetch", { size: 8, fill: LABEL_COLOR, anchor: "start" }));

  // LLM → API
  const llmMidY = extY + extH + extGap + extH / 2;
  parts.push(biArrow(extMidX, llmMidY, apiLeft, svcMidY + 8, "", { color: SLATE.stroke }));
  parts.push(text(extMidX + 24, llmMidY + 14, "HTTPS", { size: 8, fill: LABEL_COLOR, anchor: "start" }));

  // S3 → API
  const s3MidY = extY + (extH + extGap) * 2 + extH / 2;
  parts.push(biArrow(extMidX, s3MidY, apiLeft, svcY + svcH + 10, "", { color: SLATE.stroke }));
  parts.push(text(extMidX + 24, s3MidY + 14, "Presigned URLs", { size: 8, fill: LABEL_COLOR, anchor: "start" }));

  // ── Legend ──
  const legY = H - 32;
  const legX = PAD;
  const legSpacing = 170;
  const legends = [
    { label: "Frontend / UI", color: VIOLET },
    { label: "API / Backend", color: BLUE },
    { label: "Data / Storage", color: TEAL },
    { label: "Ephemeral Pods", color: AMBER },
    { label: "External Services", color: SLATE },
    { label: "Workspaces", color: EMERALD },
  ];
  for (let i = 0; i < legends.length; i++) {
    const lx = legX + i * legSpacing;
    parts.push(`<rect x="${lx}" y="${legY - 6}" width="12" height="12" rx="2" fill="${legends[i].color.fill}" stroke="${legends[i].color.stroke}" stroke-width="1"/>`);
    parts.push(text(lx + 18, legY + 4, legends[i].label, { size: 9, fill: TEXT_SECONDARY, anchor: "start" }));
  }

  parts.push("</svg>");

  return parts.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────

const svg = generateSVG();
const outPath = path.join(__dirname, "architecture.svg");
fs.writeFileSync(outPath, svg);
console.log(`Generated ${outPath} (${(svg.length / 1024).toFixed(1)} KB)`);
