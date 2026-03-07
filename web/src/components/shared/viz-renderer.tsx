"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BarChart3, Loader2 } from "lucide-react";

interface VizRendererProps {
  outputType: string;
  renderedOutput?: string | null;
  className?: string;
  autoResize?: boolean;
}

/**
 * Universal visualization renderer.
 *
 * Renders visualization output based on its type:
 *   - "svg"       → inline SVG via dangerouslySetInnerHTML
 *   - "plotly"    → Plotly.js (loaded from CDN on demand)
 *   - "vega-lite" → vega-embed (loaded from CDN on demand)
 *   - "bokeh"     → BokehJS (loaded from CDN on demand)
 *   - "png"       → <img> tag (expects base64 data URL)
 */
export function VizRenderer({
  outputType,
  renderedOutput,
  className = "",
  autoResize = true,
}: VizRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── SVG ──
  if (outputType === "svg" && renderedOutput) {
    return (
      <div
        ref={containerRef}
        className={`viz-renderer viz-svg ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeSvg(renderedOutput) }}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      />
    );
  }

  // ── PNG ──
  if (outputType === "png" && renderedOutput) {
    return (
      <div
        className={`viz-renderer viz-png flex items-center justify-center ${className}`}
        style={{ width: "100%", height: "100%" }}
      >
        <img
          src={renderedOutput}
          alt="Visualization"
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      </div>
    );
  }

  // ── Plotly ──
  if (outputType === "plotly" && renderedOutput) {
    return (
      <PlotlyRenderer
        spec={renderedOutput}
        className={className}
        autoResize={autoResize}
      />
    );
  }

  // ── Vega-Lite ──
  if (outputType === "vega-lite" && renderedOutput) {
    return (
      <VegaLiteRenderer
        spec={renderedOutput}
        className={className}
      />
    );
  }

  // ── Bokeh ──
  if (outputType === "bokeh" && renderedOutput) {
    return (
      <BokehRenderer
        spec={renderedOutput}
        className={className}
      />
    );
  }

  // ── Empty state ──
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-6 ${className}`}
      style={{ width: "100%", height: "100%", minHeight: 120 }}
    >
      <BarChart3 className="h-8 w-8 text-muted-foreground/20 mb-2" />
      <p className="text-[11px] text-muted-foreground/40">
        {renderedOutput
          ? `Unsupported output type: ${outputType}`
          : "Not rendered yet — run from a notebook or click Preview"}
      </p>
    </div>
  );
}

// ── SVG Sanitizer ──────────────────────────────────────────────────

function sanitizeSvg(svg: string): string {
  // Strip <script> tags for safety while preserving SVG content
  return svg.replace(/<script[\s\S]*?<\/script>/gi, "");
}

// ── Plotly Renderer ────────────────────────────────────────────────

function PlotlyRenderer({
  spec,
  className,
  autoResize,
}: {
  spec: string;
  className: string;
  autoResize: boolean;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadPlotly()
      .then(() => setReady(true))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!ready || !divRef.current) return;
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;
    try {
      const parsed = typeof spec === "string" ? JSON.parse(spec) : spec;
      const userLayout = parsed.layout || {};
      // Deep-merge: preserve user's margin, font, yaxis2, etc.
      const layout = {
        ...userLayout,
        paper_bgcolor: userLayout.paper_bgcolor || "rgba(0,0,0,0)",
        plot_bgcolor: userLayout.plot_bgcolor || "rgba(0,0,0,0)",
        font: { color: "rgba(255,255,255,0.7)", ...(userLayout.font || {}) },
        margin: {
          l: 50,
          r: userLayout.yaxis2 ? 60 : 20,
          t: 40,
          b: 40,
          ...(userLayout.margin || {}),
        },
        ...(autoResize ? { autosize: true } : {}),
      };
      const data = parsed.data || [];
      const config = { responsive: true, displayModeBar: false };
      Plotly.newPlot(divRef.current, data, layout, config);
    } catch (err) {
      console.error("Plotly render error:", err);
    }
  }, [ready, spec, autoResize]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[120px] text-xs text-red-400">
        Failed to load Plotly: {loadError}
      </div>
    );
  }

  if (!ready) return <LoadingSpinner />;

  return (
    <div
      ref={divRef}
      className={`viz-renderer viz-plotly ${className}`}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

// ── Vega-Lite Renderer ─────────────────────────────────────────────

function VegaLiteRenderer({
  spec,
  className,
}: {
  spec: string;
  className: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadVegaEmbed()
      .then(() => setReady(true))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!ready || !divRef.current) return;
    try {
      const parsed = typeof spec === "string" ? JSON.parse(spec) : spec;
      const vegaSpec = {
        ...parsed,
        background: "transparent",
        config: {
          ...(parsed.config || {}),
          axis: { labelColor: "rgba(255,255,255,0.6)", titleColor: "rgba(255,255,255,0.7)" },
          legend: { labelColor: "rgba(255,255,255,0.6)", titleColor: "rgba(255,255,255,0.7)" },
          title: { color: "rgba(255,255,255,0.8)" },
          view: { stroke: "transparent" },
        },
      };
      (window as any).vegaEmbed(divRef.current, vegaSpec, {
        actions: false,
        theme: "dark",
      });
    } catch (err) {
      console.error("Vega-Lite render error:", err);
    }
  }, [ready, spec]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[120px] text-xs text-red-400">
        Failed to load Vega: {loadError}
      </div>
    );
  }

  if (!ready) return <LoadingSpinner />;

  return (
    <div
      ref={divRef}
      className={`viz-renderer viz-vega ${className}`}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

// ── Bokeh Renderer ─────────────────────────────────────────────────

function BokehRenderer({
  spec,
  className,
}: {
  spec: string;
  className: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const [bokehId] = useState(() => `bokeh-${Math.random().toString(36).slice(2)}`);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadBokeh()
      .then(() => setReady(true))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!ready || !divRef.current) return;
    try {
      const parsed = typeof spec === "string" ? JSON.parse(spec) : spec;
      divRef.current.innerHTML = "";
      (window as any).Bokeh.embed.embed_item(parsed, bokehId);
    } catch (err) {
      console.error("Bokeh render error:", err);
    }
  }, [ready, spec, bokehId]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center w-full h-full min-h-[120px] text-xs text-red-400">
        Failed to load Bokeh: {loadError}
      </div>
    );
  }

  if (!ready) return <LoadingSpinner />;

  return (
    <div
      ref={divRef}
      id={bokehId}
      className={`viz-renderer viz-bokeh ${className}`}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

// ── Shared Helpers ─────────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[120px]">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
    </div>
  );
}

// ── CDN Script Loading ─────────────────────────────────────────────
//
// All UMD libraries (Plotly, Vega, Bokeh) have the same problem:
// Webpack/turbopack set window.define (AMD), and UMD wrappers detect it
// and register as AMD modules instead of setting globals.
// We temporarily hide `define` before appending the script.

/**
 * Load a script from CDN, hiding AMD `define` to force UMD → global fallback.
 * Polls for the expected global up to 3 seconds after load.
 */
const _scriptCache = new Map<string, Promise<void>>();

function loadCdnScript(src: string, globalName: string): Promise<void> {
  if ((window as any)[globalName]) return Promise.resolve();
  if (_scriptCache.has(src)) return _scriptCache.get(src)!;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    // Hide AMD define so UMD wrapper falls through to global assignment
    const savedDefine = (window as any).define;
    (window as any).define = undefined;

    script.onload = () => {
      if (savedDefine) (window as any).define = savedDefine;
      let attempts = 0;
      const check = () => {
        if ((window as any)[globalName]) {
          resolve();
        } else if (attempts++ < 60) {
          setTimeout(check, 50);
        } else {
          reject(new Error(`${globalName} not found after loading ${src}`));
        }
      };
      check();
    };

    script.onerror = () => {
      if (savedDefine) (window as any).define = savedDefine;
      _scriptCache.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };

    document.head.appendChild(script);
  });

  _scriptCache.set(src, promise);
  return promise;
}

// ── Plotly Loader ──────────────────────────────────────────────────

let _plotlyPromise: Promise<void> | null = null;

function loadPlotly(): Promise<void> {
  if ((window as any).Plotly) return Promise.resolve();
  if (_plotlyPromise) return _plotlyPromise;
  _plotlyPromise = loadCdnScript(
    "https://cdn.plot.ly/plotly-2.35.2.min.js",
    "Plotly"
  );
  _plotlyPromise.catch(() => { _plotlyPromise = null; });
  return _plotlyPromise;
}

// ── Vega-Embed Loader ──────────────────────────────────────────────
// Must load vega → vega-lite → vega-embed sequentially (each depends on prior).

let _vegaPromise: Promise<void> | null = null;

function loadVegaEmbed(): Promise<void> {
  if ((window as any).vegaEmbed) return Promise.resolve();
  if (_vegaPromise) return _vegaPromise;

  _vegaPromise = loadCdnScript(
    "https://cdn.jsdelivr.net/npm/vega@5",
    "vega"
  )
    .then(() =>
      loadCdnScript(
        "https://cdn.jsdelivr.net/npm/vega-lite@5",
        "vegaLite"
      )
    )
    .then(() =>
      loadCdnScript(
        "https://cdn.jsdelivr.net/npm/vega-embed@6",
        "vegaEmbed"
      )
    );

  _vegaPromise.catch(() => { _vegaPromise = null; });
  return _vegaPromise;
}

// ── Bokeh Loader ───────────────────────────────────────────────────
// Load main bokeh first, then API extension (which adds to window.Bokeh).

let _bokehPromise: Promise<void> | null = null;

function loadBokeh(): Promise<void> {
  if ((window as any).Bokeh) return Promise.resolve();
  if (_bokehPromise) return _bokehPromise;

  _bokehPromise = loadCdnScript(
    "https://cdn.bokeh.org/bokeh/release/bokeh-3.4.3.min.js",
    "Bokeh"
  ).then(() => {
    // API script extends Bokeh object — no new global to poll for,
    // so we just load it and resolve on script.onload.
    return new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdn.bokeh.org/bokeh/release/bokeh-api-3.4.3.min.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load bokeh-api"));
      document.head.appendChild(script);
    });
  });

  _bokehPromise.catch(() => { _bokehPromise = null; });
  return _bokehPromise;
}
