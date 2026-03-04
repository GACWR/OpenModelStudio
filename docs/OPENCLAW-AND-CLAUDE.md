# OpenClaw and Claude: Step-by-Step Guide

This guide walks you through controlling OpenModelStudio with **OpenClaw** (chat bots) and **Claude Code** (terminal) using the same API and API key.

---

## Prerequisites

- OpenModelStudio running (API reachable).
- An **API key** from OpenModelStudio: log in to the UI → **Settings → API Keys** → Create (e.g. name: `OpenClaw`). Copy the key once (`oms_...`).

---

## Part 1: OpenClaw (Telegram / Discord / Control UI)

OpenClaw is an AI agent that runs 24/7. You talk to it in natural language; it uses tools to call the OpenModelStudio API.

### Step 1 — Start OpenModelStudio

```bash
cd /path/to/OpenModelStudio
make k8s-deploy
```

- API: **http://localhost:31001**
- UI: http://localhost:31000 (login: `test@openmodel.studio` / `Test1234`)

Or API only: `make dev-api` → API at **http://localhost:8080**.

### Step 2 — Install the OpenClaw plugin

```bash
openclaw plugins install -l ./integrations/openclaw
cd ~/.openclaw/extensions/openmodelstudio && npm install
```

### Step 3 — Configure the plugin

Edit **`~/.openclaw/openclaw.json`**. Under `plugins.entries["openclaw-plugin"].config` set:

```json
"openclaw-plugin": {
  "enabled": true,
  "config": {
    "baseUrl": "http://localhost:31001",
    "accessToken": "oms_your_api_key_here"
  }
}
```

- Use `http://localhost:8080` if you used `make dev-api`.
- Allow the plugin for your agent, e.g. `agents.list[].tools.allow: ["openclaw-plugin"]`.

### Step 4 — Start OpenClaw and add LLM auth

```bash
openclaw gateway
```

- Control UI: http://127.0.0.1:18789  
- Add your Anthropic (or other) API key for the agent: `openclaw agents add main` or via the UI.

### Step 5 — Use it

In Telegram, Discord, or the Control UI, say things like:

- *"List my OpenModelStudio projects."*
- *"Create a project called Sales and add a dataset named sales_data."*
- *"Start training for model X with dataset Y."*

The agent uses the `oms_*` tools and reports back. No user needs to paste a token.

---

## Part 2: Claude Code (terminal)

Claude Code is the Claude CLI in your terminal. You give it the same base URL and API key; it runs `curl` or scripts to call the OpenModelStudio API.

### Step 1 — Start OpenModelStudio

Same as Part 1 — e.g. `make k8s-deploy` (API at http://localhost:31001) or `make dev-api` (http://localhost:8080).

### Step 2 — Set environment variables

In the **same terminal** where you will run `claude`:

```bash
export OMS_BASE_URL="http://localhost:31001"
export OMS_API_KEY="oms_your_api_key_here"
```

Use `http://localhost:8080` if you used `make dev-api`.

### Step 3 — Start Claude Code

```bash
claude
```

Tell Claude: *"Use the env vars OMS_BASE_URL and OMS_API_KEY for OpenModelStudio API calls."*

### Step 4 — Ask Claude to control OpenModelStudio

Examples:

- *"List my OpenModelStudio projects."*
- *"Create an OpenModelStudio project named Test."*
- *"Create a dataset in project &lt;project_id&gt; named mydata."*
- *"Create dummy CSV data and upload it to OpenModelStudio dataset &lt;dataset_id&gt;."*
- *"Create a PyTorch model in project &lt;project_id&gt; named MyModel."*
- *"Start OpenModelStudio training for model &lt;model_id&gt; with dataset &lt;dataset_id&gt;."*
- *"Get status of OpenModelStudio training job &lt;job_id&gt;."*
- *"Get metrics for OpenModelStudio training job &lt;job_id&gt;."*
- *"Launch an OpenModelStudio workspace for project &lt;project_id&gt;."*

Claude will call the API (e.g. with `curl` or the Python SDK) using your base URL and API key.

---

## Summary

| | OpenClaw | Claude Code |
|---|----------|-------------|
| **Where** | Telegram, Discord, Control UI | Terminal (`claude`) |
| **Config** | `~/.openclaw/openclaw.json` → `baseUrl` + `accessToken` | `OMS_BASE_URL` + `OMS_API_KEY` in shell |
| **Auth** | API key in config (no user-provided token) | API key in env |
| **Same API** | Yes | Yes |

Both use the **same REST API** and **API key**. Production: use HTTPS and good secret handling; see [OpenClaw Integration](OPENCLAW-INTEGRATION.md) and [API for agents](API-FOR-AGENTS.md).
