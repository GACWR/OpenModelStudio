# LLM Integration

## Overview

OpenModelStudio includes a built-in LLM assistant that can control the platform via natural language. Users interact through a chat panel in the UI, and the LLM can execute actions like creating projects, starting training, and querying data.

## Architecture

```
User --> Chat Panel --> POST /llm/chat (JSON body) --> API LLM Service
                                                           |
                                                    Resolve provider from
                                                    config or per-request overrides
                                                           |
                                                    LLM Provider (OpenAI/Anthropic/Ollama)
                                                           |
                                                    Tool call detection (up to 5 rounds)
                                                           |
                                                    Tool execution --> DB/K8s actions
                                                           |
                                                    SSE stream --> User
```

## Supported Providers

| Provider | Config | Variables |
|----------|--------|-----------|
| OpenAI | `LLM_PROVIDER=openai` | `LLM_API_KEY`, `LLM_MODEL` (e.g. `gpt-4o`) |
| Anthropic | `LLM_PROVIDER=anthropic` | `LLM_API_KEY`, `LLM_MODEL` (e.g. `claude-sonnet-4-20250514`) |
| Ollama | `LLM_PROVIDER=ollama` (default) | `LLM_BASE_URL` (default: `http://localhost:11434`), `LLM_MODEL` (default: `llama2`) |

The provider is set via the `LLM_PROVIDER` environment variable. The default is `ollama`. Per-request overrides are also supported via the chat request body (`provider`, `model`, `api_key`, `base_url` fields).

## Available Tools

The LLM can call these tools during conversation:

| Tool | Description | Parameters |
|------|-------------|------------|
| `create_project` | Create a new project | `name`, `description` |
| `list_projects` | List all projects | (none) |
| `create_model` | Create a new model in a project | `project_id`, `name`, `framework`, `language`, `source_code` |
| `start_training` | Start training a model | `model_id`, `hyperparams` |
| `run_inference` | Run inference on a model | `model_id`, `input_data` |
| `list_training_jobs` | List training jobs | `project_id` |
| `launch_workspace` | Launch a JupyterLab workspace | `project_id`, `ide_type` |
| `search` | Search projects, models, datasets | `query` |
| `get_metrics` | Get training job metrics | `job_id` |
| `upload_dataset` | Get presigned URL for dataset upload | `name`, `content_type` |

## Chat Request Format

```json
{
  "messages": [
    { "role": "user", "content": "Create a project called 'My Experiment'" }
  ],
  "provider": "openai",
  "model": "gpt-4o",
  "api_key": "sk-...",
  "base_url": null
}
```

The `provider`, `model`, `api_key`, and `base_url` fields are optional per-request overrides. If omitted, the server-side config is used.

## Streaming Response

Responses stream via Server-Sent Events (SSE). Each event is a JSON object with a `type` field:

| Type | Description | Fields |
|------|-------------|--------|
| `tool` | Tool execution status | `name`, `status` ("executing") |
| `thinking` | Model thinking/reasoning | `content` |
| `text` | Final text response | `content` |
| `done` | Stream complete | (none) |

### Frontend Usage

```typescript
const response = await fetch('/llm/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ messages: [{ role: 'user', content: '...' }] }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      // data.type: 'tool' | 'thinking' | 'text' | 'done'
    }
  }
}
```

## Adding Custom Tools

Extend the LLM's capabilities by adding tools in the API:

1. Add a `ToolDef` entry to `TOOLS` in `api/src/services/llm.rs`:

```rust
ToolDef {
    name: "my_tool",
    description: "Does something useful",
    params: "input",
},
```

2. Add a handler in the `execute_tool` function:

```rust
"my_tool" => {
    let input = args["input"].as_str().unwrap_or_default();
    // Do something with input using db pool
    serde_json::json!({ "result": "done" })
}
```

## System Prompt

The LLM receives a system prompt that describes the platform and instructs it to use tools:

```
"You are the OpenModelStudio assistant. You help users manage ML projects,
models, training jobs, datasets, and workspaces. Use the provided tools to
take actions on behalf of the user. Always confirm what you did after
executing a tool."
```
