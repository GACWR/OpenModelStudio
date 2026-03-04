# API for agents and automation

OpenModelStudio is **API-first**: the UI, OpenClaw, a future CLI, and any coding agent all use the **same REST API**. Whatever works for OpenClaw works for every other client.

---

## One interface, many clients

| Client | How it uses the API |
|--------|----------------------|
| **Web UI** | Browser → same API (with user session / JWT) |
| **OpenClaw plugin** | Agent tools → HTTP requests with API key |
| **Future CLI** | Commands → HTTP requests with API key |
| **Cursor / any coding agent** | Code or tools → HTTP requests with API key |
| **Python SDK** | Wraps the same API with an API key or JWT |

There is no special “OpenClaw-only” path. The OpenClaw plugin is just one client that calls the REST API with a base URL and an API key.

---

## Contract for any coding agent or CLI

To control OpenModelStudio from **any** agent (OpenClaw, Cursor, a script, or a CLI):

1. **Base URL** — OpenModelStudio API root, e.g. `http://localhost:31001` or `https://api.your-oms.com`.
2. **Auth** — API key (recommended) or JWT in the `Authorization` header:
   - `Authorization: Bearer oms_xxxxxxxx...` (API key from Settings → API Keys)
   - or `Authorization: Bearer <jwt>` (from `POST /auth/login`).
3. **Endpoints** — Same REST routes the UI and OpenClaw use: projects, models, datasets, training, experiments, workspaces, search, etc.

Example (curl):

```bash
export OMS_BASE_URL="http://localhost:31001"
export OMS_API_KEY="oms_xxxxxxxx..."

curl -s -H "Authorization: Bearer $OMS_API_KEY" "$OMS_BASE_URL/projects"
curl -s -X POST -H "Authorization: Bearer $OMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Project"}' "$OMS_BASE_URL/projects"
```

Any coding agent that can send HTTP requests and store a base URL + API key can do the same (e.g. in Python with `requests`, in Node with `fetch`, or via a small CLI that wraps these calls).

---

## API surface (overview)

The API already covers the system. Main areas:

- **Auth** — `/auth/login`, `/auth/refresh`, `/auth/me`; API keys via `/api-keys`.
- **Projects** — `/projects` (list, create, get, update, delete, collaborators, activity).
- **Datasets** — `/datasets`, `/projects/{id}/datasets` (list, create, get, delete, upload).
- **Data sources** — `/data-sources` (list, create, delete, test).
- **Models** — `/models`, `/projects/{id}/models` (list, create, get, update, delete, code, run, versions).
- **Training** — `/training/start`, `/training/jobs`, `/training/{id}`, metrics, logs, cancel.
- **Inference** — `/inference/run`, `/inference/{id}`, output.
- **Experiments** — `/experiments` (list, create, get, delete, runs, add run, compare).
- **Artifacts** — `/jobs/{id}/artifacts`, `/artifacts` (create, get, delete, download).
- **Workspaces** — `/workspaces`, `/workspaces/launch`, get, stop.
- **Environments** — `/environments` (list, create, get, update, delete).
- **Features** — `/features`, `/projects/{id}/features`, groups.
- **Search** — `/search?q=...`.
- **LLM** — `/llm/chat`, `/llm/conversations`.
- **SDK-style** — `/sdk/*` (register-model, datasets, features, hyperparameters, start-training, start-inference, jobs, pipelines, sweeps).
- **Admin** — `/admin/users`, `/admin/stats` (admin role).

So the system is already **API-enabled**; a CLI would be another client on top of this surface.

---

## OpenClaw vs other agents

- **OpenClaw:** Plugin registers tools (e.g. `oms_list_projects`, `oms_create_project`); each tool runs an HTTP request to the API with the configured `baseUrl` and `accessToken` (API key or JWT). No magic—just REST.
- **Other agents (e.g. Cursor, custom scripts):** Use the same `baseUrl` + API key and the same endpoints. You can:
  - Give the agent the base URL and API key (via env or a config file) and instructions to call the REST API, or
  - Build a small CLI (e.g. `oms projects list`, `oms training start ...`) that calls the API and let the agent run CLI commands, or
  - Use the Python SDK with an API key.

So: **yes, whatever you do for OpenClaw works for all coding agents**—same API, same auth. Making the system “API-enabled” is already done; adding a CLI is another client that reuses this same interface.

---

## See also

- [OpenClaw Integration](OPENCLAW-INTEGRATION.md) — Plugin setup and tools.
- [OpenClaw Quickstart](OPENCLAW-QUICKSTART.md) — Full flow and config (API key, base URL).
- [Python SDK](../sdk/python/README.md) — Programmatic access from Python (e.g. notebooks, scripts).
