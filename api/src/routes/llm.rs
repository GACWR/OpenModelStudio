use axum::{
    extract::State,
    response::sse::{Event, KeepAlive, Sse},
    Json,
};
use futures::stream::Stream;
use serde::Deserialize;
use std::convert::Infallible;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::services::llm::{ChatMessage, LlmOverrides};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub conversation_id: Option<uuid::Uuid>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub base_url: Option<String>,
}

pub async fn chat(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<ChatRequest>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = mpsc::channel::<String>(256);

    let llm = state.llm.clone();
    let db = state.db.clone();
    let user_id = claims.sub;

    let overrides = if req.provider.is_some() || req.model.is_some() || req.api_key.is_some() || req.base_url.is_some() {
        Some(LlmOverrides {
            provider: req.provider,
            model: req.model,
            api_key: req.api_key,
            base_url: req.base_url,
        })
    } else {
        None
    };

    tokio::spawn(async move {
        if let Err(e) = llm.stream_chat(req.messages, tx, db, user_id, overrides).await {
            tracing::error!("LLM stream error: {e}");
        }
    });

    let stream = ReceiverStream::new(rx).map(|chunk| {
        Ok(Event::default().data(chunk))
    });

    Sse::new(stream).keep_alive(KeepAlive::default())
}

pub async fn conversations(
    State(_state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> AppResult<Json<serde_json::Value>> {
    Ok(Json(serde_json::json!({
        "conversations": [],
        "user_id": claims.sub,
    })))
}
