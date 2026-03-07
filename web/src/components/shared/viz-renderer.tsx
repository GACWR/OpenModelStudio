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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    loadScript(
      "https://cdn.plot.ly/plotly-2.34.0.min.js",
      "Plotly"
    )
      .then(() => setReady(true))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!ready || !divRef.current) return;
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;
    try {
      const parsed = typeof spec === "string" ? JSON.parse(spec) : spec;
      const data = parsed.data || [];
      const layout = {
        ...(parsed.layout || {}),
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "rgba(255,255,255,0.7)" },
        margin: { l: 50, r: 20, t: 40, b: 40 },
        ...(autoResize ? { autosize: true } : {}),
      };
      const config = { responsive: true, displayModeBar: false };
      // Use newPlot for initial render (react requires existing plot)
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

  useEffect(() => {
    Promise.all([
      loadScript("https://cdn.jsdelivr.net/npm/vega@5", "vega"),
      loadScript("https://cdn.jsdelivr.net/npm/vega-lite@5", "vegaLite"),
      loadScript("https://cdn.jsdelivr.net/npm/vega-embed@6", "vegaEmbed"),
    ]).then(() => setReady(true));
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      loadScript(
        "https://cdn.bokeh.org/bokeh/release/bokeh-3.4.3.min.js",
        "Bokeh"
      ),
      loadScript(
        "https://cdn.bokeh.org/bokeh/release/bokeh-api-3.4.3.min.js",
        "BokehAPI"
      ),
    ]).then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !divRef.current) return;
    try {
      const parsed = typeof spec === "string" ? JSON.parse(spec) : spec;
      divRef.current.innerHTML = "";
      (window as any).Bokeh.embed.embed_item(parsed, divRef.current.id);
    } catch (err) {
      console.error("Bokeh render error:", err);
    }
  }, [ready, spec]);

  if (!ready) return <LoadingSpinner />;

  return (
    <div
      ref={divRef}
      id={`bokeh-${Math.random().toString(36).slice(2)}`}
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

const _scriptCache = new Map<string, Promise<void>>();

function loadScript(src: string, globalName: string): Promise<void> {
  if ((window as any)[globalName]) return Promise.resolve();
  if (_scriptCache.has(src)) return _scriptCache.get(src)!;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      // Some libraries need an extra tick to register their global.
      // Poll until the global is available (up to 3 seconds).
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
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  _scriptCache.set(src, promise);
  return promise;
}
