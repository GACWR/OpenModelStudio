# OpenClaw Integration

OpenModelStudio can be driven by [OpenClaw](https://openclaw.im/) AI agents so users talk in natural language (e.g. Telegram, Discord, WhatsApp) and the agent creates projects, starts training, and manages experiments via the API. The same REST API (and API key auth) works for **any** coding agent or CLI—see [API for agents & automation](API-FOR-AGENTS.md).

## Overview

- **OpenClaw** runs the agent (LLM + tools) and handles channels (Telegram, Discord, etc.).
- An **OpenModelStudio plugin** for OpenClaw registers tools that call the OpenModelStudio REST API.
- The user sees the agent “doing everything” in the chat; the same actions appear in the OpenModelStudio UI (projects, jobs, experiments).

## Plugin location

The plugin lives in the repo at:

```
integrations/openclaw/
├── openclaw.plugin.json   # Manifest + config schema
├── package.json           # npm package + OpenClaw extension entry
├── index.ts               # Tool definitions + OMS API client
└── README.md              # Install, config, tool list, SOUL.md tips
```

## Quick setup

1. **Install OpenClaw** (see [openclaw.im](https://openclaw.im/) or [docs.openclaw.ai](https://docs.openclaw.ai/)).

2. **Install the plugin** (from OpenModelStudio repo root):
   ```bash
   openclaw plugins install -l ./integrations/openclaw
   cd ~/.openclaw/extensions/openmodelstudio && npm install
   ```

3. **Get an OpenModelStudio API key or JWT**  
   **Recommended:** In the OpenModelStudio UI, go to **Settings → API Keys**, create a key (e.g. "OpenClaw"), and use that as `accessToken`. It never expires and end users don’t need to provide a token.  
   **Alternatively:** Get a JWT (default test user):
   ```bash
   curl -s -X POST http://localhost:31001/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@openmodel.studio","password":"Test1234"}' | jq -r '.access_token'
   ```

4. **Configure OpenClaw** (e.g. `~/.openclaw/openclaw.json`):
   ```json5
   {
     plugins: {
       entries: {
         "openclaw-plugin": {
           enabled: true,
           config: {
             baseUrl: "http://localhost:31001",
             accessToken: "oms_xxxx..."  // or JWT from login
           }
         }
       }
     },
     agents: {
       list: [{
         id: "main",
         tools: { allow: ["openclaw-plugin"] }
       }]
     }
   }
   ```
   (Entry key `openclaw-plugin` comes from the package name.)

5. **Restart the OpenClaw Gateway.** The agent can then use tools like `oms_create_project`, `oms_start_training`, `oms_create_experiment`, etc.

## Tools registered by the plugin

| Tool | Purpose |
|------|--------|
| `oms_list_projects` | List projects |
| `oms_create_project` | Create project (name, description?) |
| `oms_list_models` | List models (optional project_id) |
| `oms_create_model` | Create model (project_id, name, framework, …) |
| `oms_start_training` | Start training job (model_id, …) |
| `oms_list_training_jobs` | List training jobs |
| `oms_get_training_job` | Get job status |
| `oms_get_job_metrics` | Get job metrics |
| `oms_create_experiment` | Create experiment |
| `oms_add_experiment_run` | Add run (experiment_id, job_id, params, metrics) |
| `oms_list_experiment_runs` | List runs for an experiment |
| `oms_list_experiments` | List experiments |
| `oms_launch_workspace` | Launch JupyterLab workspace |
| `oms_list_datasets` | List datasets |
| `oms_search` | Search projects/models/datasets |

All tools are **optional** in OpenClaw; allowlist them (or the plugin id `openmodelstudio`) under `agents.list[].tools.allow`.

## Agent instructions

In your OpenClaw workspace, add instructions (e.g. in SOUL.md or AGENTS.md) so the agent uses the tools in a sensible order:

- Create project → create model → start training → create experiment → add run.
- Use IDs returned by the API (project_id, model_id, job_id, experiment_id) in later tool calls.
- After each action, confirm what was done and point the user to the OpenModelStudio dashboard.

See `integrations/openclaw/README.md` for an example SOUL.md snippet.

## Architecture

```
User (Telegram/Discord/…)
    → OpenClaw (agent + channels)
        → Plugin tools (oms_*)
            → HTTP GET/POST to OpenModelStudio API (Bearer API key or JWT)
                → OpenModelStudio (Rust API, DB, K8s, …)
```

The plugin does not run inside OpenModelStudio; it runs inside the OpenClaw Gateway and only needs the API base URL and a valid API key or JWT.

## Security

- **accessToken** is sensitive; store it in OpenClaw config (or use Control UI with sensitive hint). Do not commit tokens.
- Use an API key (Settings → API Keys) so end users never need to provide a token; all tool calls run as the user who created the key. Use a dedicated user or key for the agent if you want to audit or restrict access.
- OpenModelStudio API enforces auth and scoping (e.g. projects owned by or shared with the user).
- API keys are stored only as a SHA-256 hash in the database; the raw key is never persisted.

**Production:** Use **HTTPS** for the OpenModelStudio API (and OpenClaw gateway if exposed) so tokens and API keys are never sent in the clear. Practice **good secret handling**: keep API keys and tokens in a secrets manager or secure config, restrict file permissions on `openclaw.json`, and never commit credentials to version control.

## See also

- **[OpenClaw Quickstart & Testing](OPENCLAW-QUICKSTART.md)** — full flow: start both systems, config (API key or JWT), agent instructions, and a test checklist.
- [LLM Integration](LLM-INTEGRATION.md) — built-in in-app LLM assistant (OpenModelStudio UI).
- [integrations/openclaw/README.md](../integrations/openclaw/README.md) — plugin install, config, and tool list.
