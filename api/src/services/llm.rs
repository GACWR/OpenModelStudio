use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::config::Config;

// ── Per-request overrides ────────────────────────────────────

#[derive(Debug, Clone, Default)]
pub struct LlmOverrides {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
}

// ── Tool definitions ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub params: &'static str,
}

pub const TOOLS: &[ToolDef] = &[
    ToolDef { name: "create_project", description: "Create a new project", params: "name, description" },
    ToolDef { name: "list_projects", description: "List all projects", params: "" },
    ToolDef { name: "create_model", description: "Create a new model in a project", params: "project_id, name, framework, language, source_code" },
    ToolDef { name: "start_training", description: "Start training a model", params: "model_id, hyperparams" },
    ToolDef { name: "run_inference", description: "Run inference on a model", params: "model_id, input_data" },
    ToolDef { name: "list_training_jobs", description: "List training jobs", params: "project_id" },
    ToolDef { name: "launch_workspace", description: "Launch a JupyterLab workspace", params: "project_id, ide_type" },
    ToolDef { name: "search", description: "Search projects, models, datasets", params: "query" },
    ToolDef { name: "get_metrics", description: "Get training job metrics", params: "job_id" },
    ToolDef { name: "upload_dataset", description: "Get presigned URL for dataset upload", params: "name, content_type" },
];

// ── Messages ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

// ── OpenAI-compatible request/response types ──────────────────

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct OpenAIRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
}

#[derive(Debug, Serialize)]
struct OpenAITool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OpenAIFunction,
}

#[derive(Debug, Serialize)]
struct OpenAIFunction {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
struct OllamaRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OpenAITool>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OllamaStreamChunk {
    message: Option<OllamaMessage>,
    #[allow(dead_code)]
    done: bool,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OllamaMessage {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIStreamChunk {
    choices: Vec<OpenAIChoice>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIChoice {
    delta: Option<OpenAIDelta>,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct OpenAIDelta {
    content: Option<String>,
    tool_calls: Option<Vec<DeltaToolCall>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DeltaToolCall {
    #[allow(dead_code)]
    index: usize,
    id: Option<String>,
    function: Option<DeltaFunction>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct DeltaFunction {
    name: Option<String>,
    arguments: Option<String>,
}

// Non-streaming response for tool-call round
#[derive(Debug, Deserialize)]
struct OpenAINonStreamResponse {
    choices: Vec<OpenAINonStreamChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenAINonStreamChoice {
    message: Option<OpenAINonStreamMessage>,
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAINonStreamMessage {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}

// ── Tool execution ────────────────────────────────────────────

async fn execute_tool(db: &PgPool, user_id: Uuid, name: &str, args: &serde_json::Value) -> serde_json::Value {
    match name {
        "list_projects" => {
            let rows: Vec<crate::models::project::Project> = sqlx::query_as(
                "SELECT * FROM projects WHERE owner_id = $1 OR id IN (SELECT project_id FROM project_collaborators WHERE user_id = $1) ORDER BY updated_at DESC LIMIT 20"
            )
            .bind(user_id)
            .fetch_all(db)
            .await
            .unwrap_or_default();
            serde_json::to_value(&rows).unwrap_or_default()
        }
        "create_project" => {
            let name_val = args.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled");
            let desc = args.get("description").and_then(|v| v.as_str());
            let result: Result<crate::models::project::Project, _> = sqlx::query_as(
                "INSERT INTO projects (id, name, description, owner_id, visibility, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, 'private', NOW(), NOW()) RETURNING *"
            )
            .bind(Uuid::new_v4())
            .bind(name_val)
            .bind(desc)
            .bind(user_id)
            .fetch_one(db)
            .await;
            match result {
                Ok(p) => serde_json::to_value(&p).unwrap_or_default(),
                Err(e) => serde_json::json!({ "error": e.to_string() }),
            }
        }
        "create_model" => {
            let project_id = args.get("project_id").and_then(|v| v.as_str()).and_then(|s| s.parse::<Uuid>().ok());
            let name_val = args.get("name").and_then(|v| v.as_str()).unwrap_or("Untitled");
            let framework = args.get("framework").and_then(|v| v.as_str()).unwrap_or("pytorch");
            let source_code = args.get("source_code").and_then(|v| v.as_str());
            if let Some(pid) = project_id {
                let result: Result<crate::models::model::Model, _> = sqlx::query_as(
                    "INSERT INTO models (id, project_id, name, framework, source_code, version, created_by, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, 1, $6, NOW(), NOW()) RETURNING *"
                )
                .bind(Uuid::new_v4())
                .bind(pid)
                .bind(name_val)
                .bind(framework)
                .bind(source_code)
                .bind(user_id)
                .fetch_one(db)
                .await;
                match result {
                    Ok(m) => serde_json::to_value(&m).unwrap_or_default(),
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                }
            } else {
                serde_json::json!({ "error": "project_id is required" })
            }
        }
        "start_training" => {
            let model_id = args.get("model_id").and_then(|v| v.as_str()).and_then(|s| s.parse::<Uuid>().ok());
            let hyperparams = args.get("hyperparams");
            if let Some(mid) = model_id {
                let model: Result<crate::models::model::Model, _> = sqlx::query_as("SELECT * FROM models WHERE id = $1")
                    .bind(mid)
                    .fetch_one(db)
                    .await;
                match model {
                    Ok(m) => {
                        let job_id = Uuid::new_v4();
                        let result: Result<crate::models::job::Job, _> = sqlx::query_as(
                            "INSERT INTO jobs (id, project_id, model_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
                             VALUES ($1, $2, $3, 'training', 'pending', 'cpu-small', $4, $5, NOW(), NOW()) RETURNING *"
                        )
                        .bind(job_id)
                        .bind(m.project_id)
                        .bind(mid)
                        .bind(hyperparams)
                        .bind(user_id)
                        .fetch_one(db)
                        .await;
                        match result {
                            Ok(j) => serde_json::to_value(&j).unwrap_or_default(),
                            Err(e) => serde_json::json!({ "error": e.to_string() }),
                        }
                    }
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                }
            } else {
                serde_json::json!({ "error": "model_id is required" })
            }
        }
        "run_inference" => {
            let model_id = args.get("model_id").and_then(|v| v.as_str()).and_then(|s| s.parse::<Uuid>().ok());
            let input_data = args.get("input_data");
            if let Some(mid) = model_id {
                let model: Result<crate::models::model::Model, _> = sqlx::query_as("SELECT * FROM models WHERE id = $1")
                    .bind(mid)
                    .fetch_one(db)
                    .await;
                match model {
                    Ok(m) => {
                        let job_id = Uuid::new_v4();
                        let result: Result<crate::models::job::Job, _> = sqlx::query_as(
                            "INSERT INTO jobs (id, project_id, model_id, job_type, status, hardware_tier, hyperparameters, created_by, created_at, updated_at)
                             VALUES ($1, $2, $3, 'inference', 'pending', 'cpu-small', $4, $5, NOW(), NOW()) RETURNING *"
                        )
                        .bind(job_id)
                        .bind(m.project_id)
                        .bind(mid)
                        .bind(input_data)
                        .bind(user_id)
                        .fetch_one(db)
                        .await;
                        match result {
                            Ok(j) => serde_json::to_value(&j).unwrap_or_default(),
                            Err(e) => serde_json::json!({ "error": e.to_string() }),
                        }
                    }
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                }
            } else {
                serde_json::json!({ "error": "model_id is required" })
            }
        }
        "list_training_jobs" => {
            let project_id = args.get("project_id").and_then(|v| v.as_str()).and_then(|s| s.parse::<Uuid>().ok());
            if let Some(pid) = project_id {
                let rows: Vec<crate::models::job::Job> = sqlx::query_as(
                    "SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20"
                )
                .bind(pid)
                .fetch_all(db)
                .await
                .unwrap_or_default();
                serde_json::to_value(&rows).unwrap_or_default()
            } else {
                serde_json::json!({ "error": "project_id is required" })
            }
        }
        "launch_workspace" => {
            let project_id = args.get("project_id").and_then(|v| v.as_str()).and_then(|s| s.parse::<Uuid>().ok());
            let ws_name = args.get("ide_type").and_then(|v| v.as_str()).unwrap_or("jupyterlab");
            if let Some(pid) = project_id {
                let ws_id = Uuid::new_v4();
                let result: Result<crate::models::workspace::Workspace, _> = sqlx::query_as(
                    "INSERT INTO workspaces (id, project_id, name, status, hardware_tier, created_by, created_at, updated_at)
                     VALUES ($1, $2, $3, 'running', 'cpu-small', $4, NOW(), NOW()) RETURNING *"
                )
                .bind(ws_id)
                .bind(pid)
                .bind(ws_name)
                .bind(user_id)
                .fetch_one(db)
                .await;
                match result {
                    Ok(w) => serde_json::to_value(&w).unwrap_or_default(),
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                }
            } else {
                serde_json::json!({ "error": "project_id is required" })
            }
        }
        "search" => {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let pattern = format!("%{}%", query);
            let projects: Vec<crate::models::project::Project> = sqlx::query_as(
                "SELECT * FROM projects WHERE name ILIKE $1 OR description ILIKE $1 LIMIT 10"
            )
            .bind(&pattern)
            .fetch_all(db)
            .await
            .unwrap_or_default();
            let models: Vec<crate::models::model::Model> = sqlx::query_as(
                "SELECT * FROM models WHERE name ILIKE $1 OR description ILIKE $1 LIMIT 10"
            )
            .bind(&pattern)
            .fetch_all(db)
            .await
            .unwrap_or_default();
            serde_json::json!({ "projects": projects, "models": models })
        }
        "get_metrics" => {
            let job_id = args.get("job_id").and_then(|v| v.as_str()).and_then(|s| s.parse::<Uuid>().ok());
            if let Some(jid) = job_id {
                let job: Result<crate::models::job::Job, _> = sqlx::query_as("SELECT * FROM jobs WHERE id = $1")
                    .bind(jid)
                    .fetch_one(db)
                    .await;
                match job {
                    Ok(j) => serde_json::json!({
                        "job_id": j.id,
                        "status": j.status,
                        "metrics": j.metrics,
                    }),
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                }
            } else {
                serde_json::json!({ "error": "job_id is required" })
            }
        }
        "upload_dataset" => {
            let name_val = args.get("name").and_then(|v| v.as_str()).unwrap_or("unnamed");
            let _content_type = args.get("content_type").and_then(|v| v.as_str()).unwrap_or("application/octet-stream");
            serde_json::json!({
                "message": format!("To upload dataset '{}', use the POST /datasets endpoint followed by POST /datasets/{{id}}/upload-url", name_val),
            })
        }
        _ => serde_json::json!({ "error": format!("Unknown tool: {}", name) }),
    }
}

// ── Build OpenAI tool definitions ─────────────────────────────

fn build_openai_tools() -> Vec<OpenAITool> {
    TOOLS.iter().map(|t| {
        let mut properties = serde_json::Map::new();
        let mut required = Vec::new();
        if !t.params.is_empty() {
            for param in t.params.split(", ") {
                properties.insert(param.to_string(), serde_json::json!({ "type": "string", "description": param }));
                required.push(serde_json::Value::String(param.to_string()));
            }
        }
        OpenAITool {
            tool_type: "function".to_string(),
            function: OpenAIFunction {
                name: t.name.to_string(),
                description: t.description.to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": properties,
                    "required": required,
                }),
            },
        }
    }).collect()
}

// ── Service ───────────────────────────────────────────────────

pub struct LlmService {
    client: Client,
    config: Config,
}

impl LlmService {
    pub fn new(config: &Config) -> Self {
        Self {
            client: Client::new(),
            config: config.clone(),
        }
    }

    /// Stream chat completion with tool-calling support
    pub async fn stream_chat(
        &self,
        messages: Vec<ChatMessage>,
        tx: mpsc::Sender<String>,
        db: PgPool,
        user_id: Uuid,
        overrides: Option<LlmOverrides>,
    ) -> Result<(), String> {
        let tools = build_openai_tools();

        // Resolve effective provider/model/api_key/base_url from overrides or config
        let eff_provider = overrides.as_ref().and_then(|o| o.provider.as_deref()).unwrap_or(&self.config.llm_provider);
        let eff_model = overrides.as_ref().and_then(|o| o.model.as_deref()).unwrap_or(&self.config.llm_model);
        let eff_api_key = overrides.as_ref().and_then(|o| o.api_key.as_deref()).unwrap_or(&self.config.llm_api_key);
        let eff_base_url = overrides.as_ref().and_then(|o| o.base_url.as_deref()).unwrap_or(&self.config.llm_base_url);

        // First: non-streaming call to check for tool calls
        let mut conversation = messages.clone();

        // Add system message with tool context
        let system_msg = ChatMessage {
            role: "system".to_string(),
            content: "You are the OpenModelStudio assistant. You help users manage ML projects, models, training jobs, datasets, and workspaces. Use the provided tools to take actions on behalf of the user. Always confirm what you did after executing a tool.".to_string(),
            tool_calls: None,
            tool_call_id: None,
        };
        conversation.insert(0, system_msg);

        // Loop for multi-turn tool calling
        for _round in 0..5 {
            let response = self.call_non_streaming(&conversation, &tools, eff_provider, eff_model, eff_api_key, eff_base_url).await?;

            if let Some(tool_calls) = &response.tool_calls {
                if !tool_calls.is_empty() {
                    // Send structured tool status to client
                    let _ = tx.send(serde_json::json!({
                        "type": "tool",
                        "name": tool_calls[0].function.name,
                        "status": "executing"
                    }).to_string()).await;

                    // Add assistant message with tool calls
                    conversation.push(ChatMessage {
                        role: "assistant".to_string(),
                        content: response.content.clone().unwrap_or_default(),
                        tool_calls: Some(tool_calls.clone()),
                        tool_call_id: None,
                    });

                    // Execute each tool call
                    for tc in tool_calls {
                        let args: serde_json::Value = serde_json::from_str(&tc.function.arguments).unwrap_or_default();
                        let result = execute_tool(&db, user_id, &tc.function.name, &args).await;
                        conversation.push(ChatMessage {
                            role: "tool".to_string(),
                            content: serde_json::to_string(&result).unwrap_or_default(),
                            tool_calls: None,
                            tool_call_id: Some(tc.id.clone()),
                        });
                    }
                    continue; // Let LLM process tool results
                }
            }

            // No tool calls — send structured final response
            if let Some(thinking) = &response.thinking {
                let _ = tx.send(serde_json::json!({
                    "type": "thinking",
                    "content": thinking
                }).to_string()).await;
            }
            if let Some(content) = &response.content {
                let _ = tx.send(serde_json::json!({
                    "type": "text",
                    "content": content
                }).to_string()).await;
            }
            let _ = tx.send(serde_json::json!({
                "type": "done"
            }).to_string()).await;
            return Ok(());
        }

        let _ = tx.send(serde_json::json!({
            "type": "text",
            "content": "Reached maximum tool-calling rounds."
        }).to_string()).await;
        let _ = tx.send(serde_json::json!({
            "type": "done"
        }).to_string()).await;
        Ok(())
    }

    /// Non-streaming call for tool-call detection — routes by provider
    async fn call_non_streaming(
        &self,
        messages: &[ChatMessage],
        tools: &[OpenAITool],
        provider: &str,
        model: &str,
        api_key: &str,
        base_url: &str,
    ) -> Result<NonStreamResult, String> {
        match provider {
            "openai" => self.call_openai_non_streaming(messages, tools, model, api_key, base_url).await,
            "anthropic" => self.call_anthropic_non_streaming(messages, tools, model, api_key).await,
            _ => self.call_ollama_non_streaming(messages, tools, model, base_url).await,
        }
    }

    async fn call_openai_non_streaming(
        &self,
        messages: &[ChatMessage],
        tools: &[OpenAITool],
        model: &str,
        api_key: &str,
        base_url: &str,
    ) -> Result<NonStreamResult, String> {
        let url = format!("{}/v1/chat/completions", base_url);
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": false,
            "tools": tools,
        });

        let resp = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: OpenAINonStreamResponse = resp.json().await.map_err(|e| e.to_string())?;
        if let Some(choice) = data.choices.into_iter().next() {
            if let Some(msg) = choice.message {
                return Ok(NonStreamResult {
                    content: msg.content,
                    thinking: None,
                    tool_calls: msg.tool_calls,
                });
            }
        }
        Ok(NonStreamResult { content: None, thinking: None, tool_calls: None })
    }

    async fn call_ollama_non_streaming(
        &self,
        messages: &[ChatMessage],
        tools: &[OpenAITool],
        model: &str,
        base_url: &str,
    ) -> Result<NonStreamResult, String> {
        let url = format!("{}/api/chat", base_url);
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": false,
            "tools": tools,
        });

        let resp = self.client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
        let content = data.get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .map(String::from);
        let tool_calls: Option<Vec<ToolCall>> = data.get("message")
            .and_then(|m| m.get("tool_calls"))
            .and_then(|tc| serde_json::from_value(tc.clone()).ok());

        Ok(NonStreamResult { content, thinking: None, tool_calls })
    }

    async fn call_anthropic_non_streaming(
        &self,
        messages: &[ChatMessage],
        _tools: &[OpenAITool],
        model: &str,
        api_key: &str,
    ) -> Result<NonStreamResult, String> {
        let url = "https://api.anthropic.com/v1/messages";

        // Extract system message content; Anthropic takes it as a top-level field
        let system_content = messages.iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone())
            .unwrap_or_default();

        // Convert remaining messages to Anthropic format (exclude system and tool roles)
        let api_messages: Vec<serde_json::Value> = messages.iter()
            .filter(|m| m.role != "system" && m.role != "tool")
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let body = serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "system": system_content,
            "messages": api_messages,
        });

        let resp = self.client
            .post(url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

        let mut thinking = String::new();
        let mut text = String::new();

        if let Some(content) = data.get("content").and_then(|c| c.as_array()) {
            for block in content {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let block_text = block.get("text").and_then(|t| t.as_str()).unwrap_or("");
                match block_type {
                    "thinking" => thinking.push_str(block_text),
                    _ => text.push_str(block_text),
                }
            }
        }

        Ok(NonStreamResult {
            content: if text.is_empty() { None } else { Some(text) },
            thinking: if thinking.is_empty() { None } else { Some(thinking) },
            tool_calls: None, // Tool calls via Anthropic can be added later
        })
    }
}

struct NonStreamResult {
    content: Option<String>,
    thinking: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}
