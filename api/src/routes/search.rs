use axum::{
    extract::{Query, State},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;
use crate::middleware::auth::AuthUser;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
    pub limit: Option<i64>,
    pub category: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchItem {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
    pub href: String,
    pub icon_hint: Option<String>,
    pub status: Option<String>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct SearchResults {
    pub projects: Vec<SearchItem>,
    pub models: Vec<SearchItem>,
    pub datasets: Vec<SearchItem>,
    pub experiments: Vec<SearchItem>,
    pub training: Vec<SearchItem>,
    pub workspaces: Vec<SearchItem>,
    pub features: Vec<SearchItem>,
    pub visualizations: Vec<SearchItem>,
    pub data_sources: Vec<SearchItem>,
}

pub async fn search(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<SearchResults>> {
    let limit = query.limit.unwrap_or(10);
    let pattern = format!("%{}%", query.q);
    let cat = query.category.as_deref();

    let should = |name: &str| cat.is_none_or(|c| c == name);

    // Projects: name, description, tags::text, stage
    let projects = if should("projects") {
        sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, DateTime<Utc>)>(
            "SELECT id, name, description, stage, updated_at FROM projects
             WHERE name ILIKE $1 OR description ILIKE $1 OR tags::text ILIKE $1 OR stage ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, desc, stage, updated)| SearchItem {
            id,
            name,
            description: desc,
            category: "projects".into(),
            href: format!("/projects/{id}"),
            icon_hint: stage,
            status: None,
            updated_at: Some(updated),
        })
        .collect()
    } else {
        vec![]
    };

    // Models: name, description, framework, status, registry_name
    let models = if should("models") {
        sqlx::query_as::<_, (Uuid, String, Option<String>, String, String, DateTime<Utc>)>(
            "SELECT id, name, description, framework, status, updated_at FROM models
             WHERE name ILIKE $1 OR description ILIKE $1 OR framework ILIKE $1
                OR status ILIKE $1 OR COALESCE(registry_name, '') ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, desc, framework, status, updated)| SearchItem {
            id,
            name,
            description: desc,
            category: "models".into(),
            href: format!("/models/{id}"),
            icon_hint: Some(framework),
            status: Some(status),
            updated_at: Some(updated),
        })
        .collect()
    } else {
        vec![]
    };

    // Datasets: name, description, format
    let datasets = if should("datasets") {
        sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, DateTime<Utc>)>(
            "SELECT id, name, description, format, updated_at FROM datasets
             WHERE name ILIKE $1 OR description ILIKE $1 OR COALESCE(format, '') ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, desc, fmt, updated)| SearchItem {
            id,
            name,
            description: desc,
            category: "datasets".into(),
            href: format!("/datasets/{id}"),
            icon_hint: fmt,
            status: None,
            updated_at: Some(updated),
        })
        .collect()
    } else {
        vec![]
    };

    // Experiments: name, description, experiment_type
    let experiments = if should("experiments") {
        sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, DateTime<Utc>)>(
            "SELECT id, name, description, experiment_type, updated_at FROM experiments
             WHERE name ILIKE $1 OR description ILIKE $1 OR COALESCE(experiment_type, '') ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, desc, exp_type, updated)| SearchItem {
            id,
            name,
            description: desc,
            category: "experiments".into(),
            href: format!("/experiments/{id}"),
            icon_hint: exp_type,
            status: None,
            updated_at: Some(updated),
        })
        .collect()
    } else {
        vec![]
    };

    // Training jobs: job_type, status, hardware_tier
    let training = if should("training") {
        sqlx::query_as::<_, (Uuid, String, String, String, DateTime<Utc>)>(
            "SELECT id, job_type, status::text, hardware_tier, updated_at FROM jobs
             WHERE job_type ILIKE $1 OR status::text ILIKE $1 OR hardware_tier ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, job_type, status, hw, updated)| {
            let href = if job_type == "inference" {
                format!("/inference/{id}")
            } else {
                format!("/training/{id}")
            };
            SearchItem {
                id,
                name: format!("{} — {}", job_type, hw),
                description: Some(format!("Status: {}", status)),
                category: "training".into(),
                href,
                icon_hint: Some(job_type),
                status: Some(status),
                updated_at: Some(updated),
            }
        })
        .collect()
    } else {
        vec![]
    };

    // Workspaces: name, ide, status, hardware_tier
    let workspaces = if should("workspaces") {
        sqlx::query_as::<_, (Uuid, String, String, String, DateTime<Utc>)>(
            "SELECT id, name, ide, status, updated_at FROM workspaces
             WHERE name ILIKE $1 OR ide ILIKE $1 OR status ILIKE $1 OR hardware_tier ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, ide, status, updated)| SearchItem {
            id,
            name,
            description: Some(format!("{} — {}", ide, status)),
            category: "workspaces".into(),
            href: "/workspaces".into(),
            icon_hint: Some(ide),
            status: Some(status),
            updated_at: Some(updated),
        })
        .collect()
    } else {
        vec![]
    };

    // Features: name, description, feature_type
    let features = if should("features") {
        sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, DateTime<Utc>)>(
            "SELECT id, name, description, feature_type, updated_at FROM features
             WHERE name ILIKE $1 OR COALESCE(description, '') ILIKE $1 OR COALESCE(feature_type, '') ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, desc, ftype, updated)| SearchItem {
            id,
            name,
            description: desc,
            category: "features".into(),
            href: "/features".into(),
            icon_hint: ftype,
            status: None,
            updated_at: Some(updated),
        })
        .collect()
    } else {
        vec![]
    };

    // Visualizations: name, description, backend
    let visualizations = if should("visualizations") {
        sqlx::query_as::<_, (Uuid, String, Option<String>, String, DateTime<Utc>)>(
            "SELECT id, name, description, backend, updated_at FROM visualizations
             WHERE name ILIKE $1 OR COALESCE(description, '') ILIKE $1 OR backend ILIKE $1
             ORDER BY updated_at DESC LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, desc, backend, updated)| SearchItem {
            id,
            name,
            description: desc,
            category: "visualizations".into(),
            href: format!("/visualizations/{id}"),
            icon_hint: Some(backend),
            status: None,
            updated_at: Some(updated),
        })
        .collect()
    } else {
        vec![]
    };

    // Data Sources: name, source_type
    let data_sources = if should("data_sources") {
        sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT id, name, source_type FROM data_sources
             WHERE name ILIKE $1 OR source_type ILIKE $1
             LIMIT $2",
        )
        .bind(&pattern)
        .bind(limit)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, stype)| SearchItem {
            id,
            name,
            description: Some(format!("Type: {}", stype)),
            category: "data_sources".into(),
            href: "/data-sources".into(),
            icon_hint: Some(stype),
            status: None,
            updated_at: None,
        })
        .collect()
    } else {
        vec![]
    };

    Ok(Json(SearchResults {
        projects,
        models,
        datasets,
        experiments,
        training,
        workspaces,
        features,
        visualizations,
        data_sources,
    }))
}
