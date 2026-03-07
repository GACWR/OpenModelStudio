use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::AppState;

#[derive(Deserialize)]
pub struct ListParams {
    pub project_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Visualization {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub backend: String,
    pub output_type: String,
    pub code: Option<String>,
    pub config: Option<serde_json::Value>,
    pub rendered_output: Option<String>,
    pub refresh_interval: Option<i32>,
    pub published: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
pub struct CreateVisualization {
    pub project_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub backend: String,
    pub output_type: Option<String>,
    pub code: Option<String>,
    pub data: Option<serde_json::Value>,
    pub config: Option<serde_json::Value>,
    pub refresh_interval: Option<i32>,
}

#[derive(Deserialize)]
pub struct UpdateVisualization {
    pub name: Option<String>,
    pub description: Option<String>,
    pub code: Option<String>,
    pub data: Option<serde_json::Value>,
    pub config: Option<serde_json::Value>,
    pub refresh_interval: Option<i32>,
    pub rendered_output: Option<String>,
}

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<ListParams>,
) -> AppResult<Json<Vec<Visualization>>> {
    let rows: Vec<Visualization> = if let Some(pid) = params.project_id {
        sqlx::query_as(
            "SELECT id, project_id, name, description, backend, output_type, code,
                    config, rendered_output, refresh_interval, published,
                    created_at, updated_at
             FROM visualizations WHERE project_id = $1
             ORDER BY updated_at DESC"
        )
        .bind(pid)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT id, project_id, name, description, backend, output_type, code,
                    config, rendered_output, refresh_interval, published,
                    created_at, updated_at
             FROM visualizations
             ORDER BY updated_at DESC"
        )
        .fetch_all(&state.db)
        .await?
    };
    Ok(Json(rows))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(body): Json<CreateVisualization>,
) -> AppResult<Json<serde_json::Value>> {
    let id = Uuid::new_v4();
    let output_type = body.output_type.unwrap_or_else(|| {
        match body.backend.as_str() {
            "matplotlib" | "seaborn" | "plotnine" | "networkx" | "geopandas" => "svg".to_string(),
            "plotly" => "plotly".to_string(),
            "bokeh" => "bokeh".to_string(),
            "altair" => "vega-lite".to_string(),
            "datashader" => "png".to_string(),
            _ => "svg".to_string(),
        }
    });

    sqlx::query(
        "INSERT INTO visualizations (id, project_id, name, description, backend, output_type, code, data, config, refresh_interval, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)"
    )
    .bind(id)
    .bind(body.project_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.backend)
    .bind(&output_type)
    .bind(&body.code)
    .bind(&body.data)
    .bind(&body.config)
    .bind(body.refresh_interval.unwrap_or(0))
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "id": id,
        "name": body.name,
        "backend": body.backend,
        "output_type": output_type,
    })))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Visualization>> {
    let viz: Visualization = sqlx::query_as(
        "SELECT id, project_id, name, description, backend, output_type, code,
                config, rendered_output, refresh_interval, published,
                created_at, updated_at
         FROM visualizations WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound("Visualization not found".into()))?;
    Ok(Json(viz))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateVisualization>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(
        "UPDATE visualizations SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            code = COALESCE($4, code),
            data = COALESCE($5, data),
            config = COALESCE($6, config),
            refresh_interval = COALESCE($7, refresh_interval),
            rendered_output = COALESCE($8, rendered_output),
            updated_at = now()
         WHERE id = $1"
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.code)
    .bind(&body.data)
    .bind(&body.config)
    .bind(body.refresh_interval)
    .bind(&body.rendered_output)
    .execute(&state.db)
    .await?;
    Ok(Json(serde_json::json!({"updated": true})))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM visualizations WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"deleted": true})))
}

pub async fn publish(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("UPDATE visualizations SET published = true, updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"published": true})))
}

// ── Dashboards ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Dashboard {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub layout: Option<serde_json::Value>,
    pub published: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
pub struct CreateDashboard {
    pub project_id: Option<Uuid>,
    pub name: String,
    pub description: Option<String>,
    pub layout: Option<serde_json::Value>,
}

#[derive(Deserialize)]
pub struct UpdateDashboard {
    pub name: Option<String>,
    pub description: Option<String>,
    pub layout: Option<serde_json::Value>,
}

pub async fn list_dashboards(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<ListParams>,
) -> AppResult<Json<Vec<Dashboard>>> {
    let rows: Vec<Dashboard> = if let Some(pid) = params.project_id {
        sqlx::query_as(
            "SELECT id, project_id, name, description, layout, published, created_at, updated_at
             FROM dashboards WHERE project_id = $1
             ORDER BY updated_at DESC"
        )
        .bind(pid)
        .fetch_all(&state.db)
        .await?
    } else {
        sqlx::query_as(
            "SELECT id, project_id, name, description, layout, published, created_at, updated_at
             FROM dashboards
             ORDER BY updated_at DESC"
        )
        .fetch_all(&state.db)
        .await?
    };
    Ok(Json(rows))
}

pub async fn create_dashboard(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(body): Json<CreateDashboard>,
) -> AppResult<Json<serde_json::Value>> {
    let id = Uuid::new_v4();
    let layout = body.layout.unwrap_or(serde_json::json!([]));

    sqlx::query(
        "INSERT INTO dashboards (id, project_id, name, description, layout, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(id)
    .bind(body.project_id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&layout)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "id": id,
        "name": body.name,
    })))
}

pub async fn get_dashboard(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Dashboard>> {
    let dash: Dashboard = sqlx::query_as(
        "SELECT id, project_id, name, description, layout, published, created_at, updated_at
         FROM dashboards WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound("Dashboard not found".into()))?;
    Ok(Json(dash))
}

pub async fn update_dashboard(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateDashboard>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(
        "UPDATE dashboards SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            layout = COALESCE($4, layout),
            updated_at = now()
         WHERE id = $1"
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.layout)
    .execute(&state.db)
    .await?;
    Ok(Json(serde_json::json!({"updated": true})))
}

pub async fn delete_dashboard(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM dashboards WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({"deleted": true})))
}
