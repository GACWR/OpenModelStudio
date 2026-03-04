# OpenClaw + OpenModelStudio — Full Flow & Testing Guide

This doc summarizes everything we set up so you can run and test the integration tomorrow.

---

## What We Built

- **OpenClaw** = AI agent (runs 24/7, talks on Telegram/Discord/Control UI). Uses Anthropic (or other LLM) and has **tools** that call the OpenModelStudio API.
- **OpenModelStudio plugin** = A plugin for OpenClaw that registers 16 tools (`oms_*`) so the agent can create projects, models, datasets, start training, manage experiments, launch workspaces, and search—all via the OpenModelStudio REST API.
- **Agent instructions** = Your OpenClaw workspace `AGENTS.md` now has an “OpenModelStudio (OMS) workflow” section so the agent chains steps (create project → create model → start training, etc.) and uses the exact IDs returned by the API.

**Result:** You say in Telegram (or Control UI): *“Create a project called MyML, add a model, and start training.”* The agent calls the API step by step and reports back. You see the same projects/jobs in the OpenModelStudio dashboard.

---

## 1. Start OpenModelStudio (API must be reachable)

The plugin calls the OpenModelStudio API. Choose one:

**Option A — Full Kubernetes**
```bash
cd /path/to/OpenModelStudio
make k8s-deploy
```
- API: **http://localhost:31001**
- Frontend: http://localhost:31000  
- Login: `test@openmodel.studio` / `Test1234`

**Option B — Local dev (API only)**
```bash
make dev-api
```
- API: **http://localhost:8080**  
- You must set the plugin `baseUrl` to `http://localhost:8080` in OpenClaw config (see below).

---

## 2. Start OpenClaw Gateway

```bash
openclaw gateway
```

- Gateway: **ws://127.0.0.1:18789**
- Control UI: **http://127.0.0.1:18789/** or **http://127.0.0.1:18789/__openclaw__/canvas/**

If you see “unauthorized: gateway token missing” in the Control UI, paste your gateway token in the UI settings. Token is in `~/.openclaw/openclaw.json` under `gateway.auth.token`.

---

## 3. Plugin Config (OpenModelStudio URL + token or API key)

The plugin needs the **OpenModelStudio API URL** and either an **API key** (recommended) or a **JWT** so it can call the API.

**Config location:** `~/.openclaw/openclaw.json` → `plugins.entries["openclaw-plugin"].config`

Example:
```json
"openclaw-plugin": {
  "enabled": true,
  "config": {
    "baseUrl": "http://localhost:31001",
    "accessToken": "oms_xxxxxxxx..."
  }
}
```

- **baseUrl** — Use `http://localhost:31001` for K8s deploy, or `http://localhost:8080` for `make dev-api`.
- **accessToken** — Use an **API key** (recommended) or a JWT.

### Option A — API key (recommended; no expiry, no user-provided JWT)

1. Log into OpenModelStudio (UI) once.
2. Go to **Settings → API Keys** and create a key (e.g. name: `OpenClaw`).
3. Copy the key (it looks like `oms_xxxxxxxx...`; you only see it once).
4. Put that value in `accessToken` in the plugin config above.

End users never need to provide or refresh a token; the same key is used until you revoke it in Settings → API Keys.

**Production:** Use **HTTPS** for the OpenModelStudio API so the key is not sent in the clear, and practice **good secret handling** (secrets manager or secure config, restrict permissions on config files, never commit credentials).

### Option B — JWT (short-lived; needs refresh)

Use a JWT as `accessToken`. It expires (often 15–60 min). To get a fresh token:
```bash
curl -s -X POST http://localhost:31001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@openmodel.studio","password":"Test1234"}' | jq -r '.access_token'
```
Copy the output and replace `accessToken` in the config. No need to restart the gateway for a token-only change (plugin reads config when a tool runs).

---

## 4. OpenClaw Agent Auth (LLM provider)

The agent needs an LLM to run. We set it up with **Anthropic**.

- Add/update auth: `openclaw agents add main` → follow prompts, paste Anthropic API key when asked.
- Or manually: create/edit `~/.openclaw/agents/main/agent/auth-profiles.json` with your Anthropic (or other) provider credentials.

If you see “No API key found for provider anthropic”, run `openclaw agents add main` and add the key, then restart the gateway.

---

## 5. How to Talk to the Agent

**Control UI (browser)**  
- Open http://127.0.0.1:18789/  
- Enter gateway token if prompted  
- Chat in the UI. Example: *“List my OpenModelStudio projects”*

**Telegram**  
- Your OpenClaw bot is already configured. Open the bot in Telegram and send the same kinds of messages. Example: *“Create a project called Test and list my projects.”*

**Agent tools allowlist**  
Your config has `agents.list[].tools.allow: ["openclaw-plugin"]`, so all 16 OMS tools are enabled. No extra config needed.

---

## 6. OpenModelStudio Tools the Agent Has

| Tool | What it does |
|------|------------------|
| `oms_list_projects` | List projects |
| `oms_create_project` | Create project (name, optional description) |
| `oms_list_models` | List models (optional project_id) |
| `oms_create_model` | Create model (project_id, name, framework, optional description/source_code) |
| `oms_create_dataset` | Create dataset (project_id, name, format e.g. csv, optional description) |
| `oms_list_datasets` | List datasets (optional project_id) |
| `oms_start_training` | Start training (model_id; optional dataset_id, hardware_tier, hyperparameters) |
| `oms_list_training_jobs` | List training jobs |
| `oms_get_training_job` | Get job status (job_id) |
| `oms_get_job_metrics` | Get job metrics (job_id) |
| `oms_create_experiment` | Create experiment (project_id, name, optional description) |
| `oms_add_experiment_run` | Add run (experiment_id, job_id, optional parameters/metrics) |
| `oms_list_experiment_runs` | List runs for an experiment |
| `oms_list_experiments` | List experiments (optional project_id) |
| `oms_launch_workspace` | Launch JupyterLab workspace (project_id; optional name, hardware_tier) |
| `oms_search` | Search projects/models/datasets |

All IDs are UUIDs returned by the API; the agent is instructed to pass them from one step to the next.

---

## 7. Agent Workflow (what we added to AGENTS.md)

In **`~/.openclaw/workspace/AGENTS.md`** we added an **“OpenModelStudio (OMS) workflow”** section. It tells the agent to:

1. List or create project → remember **project_id**
2. Create model (project_id, name, framework) → remember **model_id**
3. List or create dataset if needed → remember **dataset_id**
4. Start training (model_id, optionally dataset_id) → remember **job_id**
5. Optionally create experiment and add run (experiment_id, job_id)
6. Optionally launch workspace (project_id) and share the URL

So when you say *“Create a project and train a model”*, the agent should run: create project → create model → start training, using the returned IDs in each step.

---

## 8. Quick Test Checklist (for tomorrow)

**Before you start**
- [ ] OpenModelStudio API is running (K8s or `make dev-api`) and reachable at the URL in the plugin config.
- [ ] OpenClaw gateway is running (`openclaw gateway`).
- [ ] Plugin `baseUrl` and `accessToken` in `~/.openclaw/openclaw.json` are correct. If in doubt, get a new token with the `curl` above and update `accessToken`.
- [ ] Agent has LLM auth (e.g. Anthropic) so it can reply.

**Tests**
1. **Control UI:** Open http://127.0.0.1:18789/ → paste gateway token if needed → say *“List my OpenModelStudio projects.”* You should see JSON or a summary of projects.
2. **Create project:** *“Create a project called MondayTest.”* Agent should call `oms_create_project` and show the new project with its id.
3. **Chained flow:** *“In that project create a model named demo-model with framework pytorch and start training for it.”* Agent should create the model then start training, using the project_id and model_id from previous steps.
4. **Telegram:** Same prompts in your OpenClaw Telegram bot. You should get the same behavior.

**Check OpenModelStudio UI**  
- Open http://localhost:31000 (if using K8s), log in, and confirm the new project, model, and training job appear.

---

## 9. Troubleshooting

| Issue | What to do |
|-------|------------|
| “Session token expired” / 401 from OMS | Get a new JWT with the `curl` in section 3 and update `accessToken` in the plugin config. |
| “No API key found for provider anthropic” | Run `openclaw agents add main` and add your Anthropic API key; restart gateway. |
| “Gateway token missing” in Control UI | Paste the token from `~/.openclaw/openclaw.json` → `gateway.auth.token` in the Control UI settings. |
| “Missing tool result” / synthetic error | We fixed this by wrapping all tool executions in a safe handler so errors return a proper message. Restart the gateway so it loads the updated plugin. |
| Agent doesn’t chain steps | Ensure `~/.openclaw/workspace/AGENTS.md` contains the “OpenModelStudio (OMS) workflow” section. Restart the gateway. |
| API unreachable (connection refused) | Start OpenModelStudio (e.g. `make k8s-deploy` or `make dev-api`) and ensure `baseUrl` matches (e.g. 31001 for K8s, 8080 for dev-api). |

---

## 10. File Reference

| What | Where |
|------|--------|
| OpenClaw config | `~/.openclaw/openclaw.json` |
| Agent workspace (AGENTS.md, SOUL.md) | `~/.openclaw/workspace/` |
| Plugin code | `OpenModelStudio/integrations/openclaw/` (index.ts, openclaw.plugin.json, package.json) |
| Plugin install (linked) | `openclaw plugins install -l ./integrations/openclaw` from repo root |
| OMS workflow example | `integrations/openclaw/AGENTS-oms-example.md` |
| Full integration doc | `docs/OPENCLAW-INTEGRATION.md` |

---

## One-Sentence Summary

**Start OpenModelStudio API and OpenClaw gateway; keep the plugin’s baseUrl and accessToken correct; then in Telegram or the Control UI ask the agent to list projects, create a project, create a model, and start training—it will call the API step by step and you can verify everything in the OpenModelStudio dashboard.**