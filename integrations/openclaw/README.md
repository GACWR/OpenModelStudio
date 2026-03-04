# OpenModelStudio plugin for OpenClaw

This [OpenClaw](https://openclaw.im/) plugin registers **agent tools** that call the OpenModelStudio REST API. AI agents can create projects, models, start training, manage experiments, launch workspaces, and search—so users can say “create a project and train a model” in Telegram/WhatsApp/Discord and the agent does it.

## Prerequisites

- [OpenClaw](https://docs.openclaw.ai/) installed and configured (Node 22+).
- OpenModelStudio API running (e.g. `make k8s-deploy` then API at `http://localhost:31001`).
- An **API key** (recommended) or **JWT** from OpenModelStudio (see below).

## Getting an access token

**Recommended — API key (no expiry; end users never provide a token):**

1. Log into the OpenModelStudio UI.
2. Go to **Settings → API Keys** and create a key (e.g. name: "OpenClaw").
3. Copy the key (it looks like `oms_xxxxxxxx...`; you only see it once).
4. Use it as `accessToken` in the plugin config. No refresh needed.

**Alternatively — JWT (short-lived):**

```bash
curl -s -X POST http://localhost:31001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@openmodel.studio","password":"Test1234"}' | jq -r '.access_token'
```
Use the printed token as `accessToken`. JWTs expire (e.g. 15–60 min); refresh when you get 401s.

## Installation

### From the repo (local path)

```bash
# From OpenModelStudio repo root
openclaw plugins install -l ./integrations/openclaw
```

Or copy into OpenClaw’s extensions dir:

```bash
cp -r integrations/openclaw ~/.openclaw/extensions/openmodelstudio
```

### From npm (if published)

```bash
openclaw plugins install @openmodelstudio/openclaw-plugin
```

Install plugin dependencies:

```bash
cd ~/.openclaw/extensions/openmodelstudio  # or your install path
npm install
```

## Configuration

Add to your OpenClaw config (e.g. `~/.openclaw/openclaw.json` or Control UI):

```json5
{
  plugins: {
    entries: {
      "openclaw-plugin": {
        enabled: true,
        config: {
          baseUrl: "http://localhost:31001",
          accessToken: "YOUR_JWT_OR_TOKEN"
        }
      }
    }
  }
}
```

(The entry key is `openclaw-plugin`, from the package name.)

- **baseUrl** — OpenModelStudio API base (no trailing slash). Examples: `http://localhost:31001`, `https://api.openmodel.studio`.
- **accessToken** — API key (e.g. `oms_...`) or JWT; stored as sensitive in the UI. Prefer an API key so users don’t have to provide or refresh a token.

**Production:** Use **HTTPS** for the API URL and practice **good secret handling** (secrets manager or secure config, restrict permissions on `openclaw.json`, never commit credentials).

Because the tools are **optional**, you must allowlist them for your agent. For example:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        tools: {
          allow: [
            "oms_list_projects",
            "oms_create_project",
            "oms_list_models",
            "oms_create_model",
            "oms_start_training",
            "oms_list_training_jobs",
            "oms_get_training_job",
            "oms_get_job_metrics",
            "oms_create_experiment",
            "oms_add_experiment_run",
            "oms_list_experiment_runs",
            "oms_list_experiments",
            "oms_launch_workspace",
            "oms_list_datasets",
            "oms_search"
          ]
        }
      }
    ]
  }
}
```

Or allow all tools from this plugin by id:

```json5
agents: {
  list: [{ id: "main", tools: { allow: ["openclaw-plugin"] } }]
}
```

Restart the OpenClaw Gateway after changing config.

## Tools

| Tool | Description |
|------|-------------|
| `oms_list_projects` | List projects the user can access |
| `oms_create_project` | Create a project (name, optional description) |
| `oms_list_models` | List models (optional project_id) |
| `oms_create_model` | Create a model (project_id, name, framework, optional description/source_code) |
| `oms_start_training` | Start training (model_id; optional dataset_id, hardware_tier, hyperparameters JSON) |
| `oms_list_training_jobs` | List recent training jobs |
| `oms_get_training_job` | Get job status by job_id |
| `oms_get_job_metrics` | Get stored metrics for a job |
| `oms_create_experiment` | Create experiment (project_id, name, optional description) |
| `oms_add_experiment_run` | Add run to experiment (experiment_id, job_id; optional parameters/metrics JSON) |
| `oms_list_experiment_runs` | List runs for an experiment |
| `oms_list_experiments` | List experiments (optional project_id) |
| `oms_launch_workspace` | Launch JupyterLab workspace (project_id; optional name, hardware_tier) |
| `oms_create_dataset` | Create a dataset (project_id, name, format e.g. csv; optional description) |
| `oms_list_datasets` | List datasets (optional project_id) |
| `oms_search` | Search projects, models, datasets by query |

All IDs are UUIDs returned by the API (e.g. from `oms_create_project`, `oms_create_model`, `oms_start_training`).

## Agent instructions (SOUL.md / AGENTS.md)

So the agent uses the tools in the right order and chains steps (create project → create model → start training, etc.), add workflow instructions to your OpenClaw workspace. A full example is in **AGENTS-oms-example.md** in this plugin folder—copy or paste its content into your workspace `AGENTS.md` (or `SOUL.md`). Minimal version:

```markdown
You have access to OpenModelStudio (OMS) tools. Use them to manage ML projects:

1. Create a project with oms_create_project, then use the returned project id.
2. Create a model with oms_create_model (project_id, name, framework).
3. Start training with oms_start_training (model_id; optionally dataset_id, hyperparameters).
4. Create an experiment with oms_create_experiment, then add runs with oms_add_experiment_run (experiment_id, job_id, parameters, metrics).
5. Launch a workspace with oms_launch_workspace (project_id) for interactive JupyterLab.

Always use the exact ids returned by the API (project_id, model_id, job_id, experiment_id) in later steps. After each action, confirm what you did and tell the user they can check the OpenModelStudio dashboard.
```

## User flow

1. User talks to the OpenClaw agent (e.g. in Telegram): “Create a project called My ML and start a training job for the default model.”
2. Agent calls `oms_list_projects`, then `oms_create_project`, then `oms_list_models`, then `oms_start_training` (using returned ids).
3. Agent replies: “Created project My ML and started training. You can watch the run in OpenModelStudio at http://localhost:31000.”
4. User sees the same project and job in the OpenModelStudio UI.

## License

Same as OpenModelStudio (GPL-3.0).
