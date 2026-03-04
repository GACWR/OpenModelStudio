/**
 * OpenModelStudio plugin for OpenClaw
 * Registers tools that call the OpenModelStudio REST API so agents can drive
 * projects, models, training, experiments, and workspaces.
 */
import { Type } from "@sinclair/typebox";

type PluginConfig = {
  baseUrl: string;
  accessToken: string;
};

const PLUGIN_ID = "openclaw-plugin";

function getConfig(api: { config: Record<string, unknown> }): PluginConfig {
  const entries = (api.config?.plugins as Record<string, unknown>)?.entries as Record<string, { config?: PluginConfig }> | undefined;
  const pluginConfig = entries?.[PLUGIN_ID]?.config;
  if (!pluginConfig?.baseUrl || !pluginConfig?.accessToken) {
    throw new Error(`OpenModelStudio plugin not configured: set baseUrl and accessToken in plugins.entries.${PLUGIN_ID}.config`);
  }
  return {
    baseUrl: String(pluginConfig.baseUrl).replace(/\/$/, ""),
    accessToken: String(pluginConfig.accessToken),
  };
}

async function omsFetch(
  baseUrl: string,
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : text || res.statusText,
    };
  }
  return { ok: true, status: res.status, data };
}

function textResult(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

/** Wraps execute so every path returns a valid tool result (no thrown errors). */
function safeExecute<T>(
  fn: (params: T) => Promise<{ content: Array<{ type: "text"; text: string }> }>
): (id: string, params: T) => Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return async (id: string, params: T) => {
    try {
      return await fn(params);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return textResult(`Error: ${msg}`);
    }
  };
}

export default function register(api: { config: Record<string, unknown>; registerTool: (def: unknown, opts?: { optional?: boolean }) => void }) {
  const tools = [
    {
      name: "oms_list_projects",
      description: "List all OpenModelStudio projects the user can access. Use this to see existing projects before creating or using one.",
      parameters: Type.Object({}),
      execute: safeExecute<Record<string, never>>(async () => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/projects");
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_create_project",
      description: "Create a new project in OpenModelStudio. Returns the project id and name for use in later steps.",
      parameters: Type.Object({
        name: Type.String(),
        description: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ name: string; description?: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/projects", {
          method: "POST",
          body: JSON.stringify({ name: params.name, description: params.description ?? undefined }),
        });
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_list_models",
      description: "List models in OpenModelStudio. Optionally filter by project_id (UUID).",
      parameters: Type.Object({
        project_id: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ project_id?: string }>(async (params) => {
        const cfg = getConfig(api);
        const path = params.project_id ? `/projects/${params.project_id}/models` : "/models";
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, path);
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_create_model",
      description: "Create a new model in a project. Requires project_id (UUID), name, and framework (e.g. pytorch). Optionally description and source_code.",
      parameters: Type.Object({
        project_id: Type.String(),
        name: Type.String(),
        framework: Type.String(),
        description: Type.Optional(Type.String()),
        source_code: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ project_id: string; name: string; framework: string; description?: string; source_code?: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/models", {
          method: "POST",
          body: JSON.stringify({
            project_id: params.project_id,
            name: params.name,
            framework: params.framework,
            description: params.description,
            source_code: params.source_code,
          }),
        });
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_start_training",
      description: "Start a training job for a model. Requires model_id (UUID). Optionally dataset_id, hardware_tier, hyperparameters (JSON object).",
      parameters: Type.Object({
        model_id: Type.String(),
        dataset_id: Type.Optional(Type.String()),
        hardware_tier: Type.Optional(Type.String()),
        hyperparameters: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ model_id: string; dataset_id?: string; hardware_tier?: string; hyperparameters?: string }>(async (params) => {
        const cfg = getConfig(api);
        let hyperparameters: Record<string, unknown> | undefined;
        if (params.hyperparameters) {
          try {
            hyperparameters = JSON.parse(params.hyperparameters);
          } catch {
            return textResult("Invalid hyperparameters: must be valid JSON");
          }
        }
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/training/start", {
          method: "POST",
          body: JSON.stringify({
            model_id: params.model_id,
            dataset_id: params.dataset_id ?? null,
            hardware_tier: params.hardware_tier,
            hyperparameters: hyperparameters ?? undefined,
          }),
        });
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_list_training_jobs",
      description: "List recent training jobs in OpenModelStudio.",
      parameters: Type.Object({}),
      execute: safeExecute<Record<string, never>>(async () => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/training/jobs");
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_get_training_job",
      description: "Get status and details of a training job by job id (UUID).",
      parameters: Type.Object({
        job_id: Type.String(),
      }),
      execute: safeExecute<{ job_id: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, `/training/${params.job_id}`);
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_get_job_metrics",
      description: "Get stored metrics for a training job by job id (UUID).",
      parameters: Type.Object({
        job_id: Type.String(),
      }),
      execute: safeExecute<{ job_id: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, `/training/${params.job_id}/metrics`);
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_create_experiment",
      description: "Create an experiment in a project. Requires project_id (UUID) and name. Optionally description.",
      parameters: Type.Object({
        project_id: Type.String(),
        name: Type.String(),
        description: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ project_id: string; name: string; description?: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/experiments", {
          method: "POST",
          body: JSON.stringify({
            project_id: params.project_id,
            name: params.name,
            description: params.description,
          }),
        });
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_add_experiment_run",
      description: "Add a run to an experiment (link a training job with parameters and metrics). Requires experiment_id and job_id (UUIDs). Optionally parameters and metrics as JSON strings.",
      parameters: Type.Object({
        experiment_id: Type.String(),
        job_id: Type.String(),
        parameters: Type.Optional(Type.String()),
        metrics: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ experiment_id: string; job_id: string; parameters?: string; metrics?: string }>(async (params) => {
        const cfg = getConfig(api);
        let parameters: Record<string, unknown> | undefined;
        let metrics: Record<string, unknown> | undefined;
        try {
          parameters = params.parameters ? JSON.parse(params.parameters) : undefined;
          metrics = params.metrics ? JSON.parse(params.metrics) : undefined;
        } catch {
          return textResult("Invalid parameters or metrics: must be valid JSON");
        }
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, `/experiments/${params.experiment_id}/runs`, {
          method: "POST",
          body: JSON.stringify({ job_id: params.job_id, parameters, metrics }),
        });
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_list_experiment_runs",
      description: "List runs for an experiment. Requires experiment_id (UUID).",
      parameters: Type.Object({
        experiment_id: Type.String(),
      }),
      execute: safeExecute<{ experiment_id: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, `/experiments/${params.experiment_id}/runs`);
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_list_experiments",
      description: "List experiments. Optionally filter by project_id (UUID) using project_id param.",
      parameters: Type.Object({
        project_id: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ project_id?: string }>(async (params) => {
        const cfg = getConfig(api);
        const path = params.project_id ? `/projects/${params.project_id}/experiments` : "/experiments";
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, path);
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_launch_workspace",
      description: "Launch a JupyterLab workspace for a project. Requires project_id (UUID). Optionally name and hardware_tier.",
      parameters: Type.Object({
        project_id: Type.String(),
        name: Type.Optional(Type.String()),
        hardware_tier: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ project_id: string; name?: string; hardware_tier?: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/workspaces/launch", {
          method: "POST",
          body: JSON.stringify({
            project_id: params.project_id,
            name: params.name ?? "Workspace",
            hardware_tier: params.hardware_tier,
          }),
        });
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_create_dataset",
      description: "Create a new dataset in a project. Requires project_id (UUID) and name. Use format like csv, json, parquet. Optionally description. Data upload is done separately in the OpenModelStudio UI.",
      parameters: Type.Object({
        project_id: Type.String(),
        name: Type.String(),
        format: Type.String(),
        description: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ project_id: string; name: string; format: string; description?: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, "/datasets", {
          method: "POST",
          body: JSON.stringify({
            project_id: params.project_id,
            name: params.name,
            format: params.format,
            description: params.description,
          }),
        });
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_list_datasets",
      description: "List datasets in OpenModelStudio. Optionally filter by project_id (UUID).",
      parameters: Type.Object({
        project_id: Type.Optional(Type.String()),
      }),
      execute: safeExecute<{ project_id?: string }>(async (params) => {
        const cfg = getConfig(api);
        const path = params.project_id ? `/projects/${params.project_id}/datasets` : "/datasets";
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, path);
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
    {
      name: "oms_search",
      description: "Search OpenModelStudio for projects, models, datasets by query string.",
      parameters: Type.Object({
        query: Type.String(),
      }),
      execute: safeExecute<{ query: string }>(async (params) => {
        const cfg = getConfig(api);
        const r = await omsFetch(cfg.baseUrl, cfg.accessToken, `/search?q=${encodeURIComponent(params.query)}`);
        if (!r.ok) return textResult(`Error: ${r.error}`);
        return textResult(JSON.stringify(r.data, null, 2));
      }),
    },
  ];

  tools.forEach((tool) => {
    api.registerTool(tool, { optional: true });
  });
}
