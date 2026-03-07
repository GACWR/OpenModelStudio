-- Migration 003: Visualizations and Dashboards
-- Adds tables for visualization rendering and dashboard composition

-- Visualizations
CREATE TABLE IF NOT EXISTS visualizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    backend TEXT NOT NULL,  -- matplotlib, seaborn, plotly, bokeh, altair, plotnine, datashader, networkx, geopandas
    output_type TEXT NOT NULL,  -- svg, plotly, bokeh, vega-lite, png
    code TEXT,  -- Python code with render(ctx) function
    data JSONB,  -- Data payload
    config JSONB,  -- Config (width, height, theme, etc.)
    rendered_output TEXT,  -- Cached rendered output
    refresh_interval INT DEFAULT 0,  -- 0 = static, >0 = seconds between refreshes
    published BOOLEAN DEFAULT false,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visualizations_project ON visualizations(project_id);

-- Dashboards
CREATE TABLE IF NOT EXISTS dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    layout JSONB DEFAULT '[]'::jsonb,  -- Array of {visualization_id, x, y, w, h}
    published BOOLEAN DEFAULT false,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboards_project ON dashboards(project_id);
