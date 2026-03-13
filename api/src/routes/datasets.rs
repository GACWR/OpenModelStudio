use axum::{
    extract::{Path, Query, State},
    Json,
};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::middleware::auth::AuthUser;
use crate::models::dataset::*;
use crate::services::notify::{notify, NotifyType};
use crate::AppState;

const DATASETS_DIR: &str = "/data/datasets";

pub async fn list(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(project_id): Path<Uuid>,
) -> AppResult<Json<Vec<Dataset>>> {
    let datasets: Vec<Dataset> = sqlx::query_as(
        "SELECT * FROM datasets WHERE project_id = $1 ORDER BY created_at DESC"
    )
    .bind(project_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(datasets))
}

pub async fn list_all(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Query(params): Query<super::ProjectFilter>,
) -> AppResult<Json<Vec<Dataset>>> {
    let datasets: Vec<Dataset> = if let Some(pid) = params.project_id {
        sqlx::query_as("SELECT * FROM datasets WHERE project_id = $1 ORDER BY created_at DESC")
            .bind(pid)
            .fetch_all(&state.db)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM datasets ORDER BY created_at DESC")
            .fetch_all(&state.db)
            .await?
    };
    Ok(Json(datasets))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Dataset>> {
    let mut dataset: Dataset = sqlx::query_as("SELECT * FROM datasets WHERE id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    // Lazy backfill: if schema is missing but we have a stored CSV file, extract it now
    if dataset.schema.is_none() && dataset.format.eq_ignore_ascii_case("csv") {
        if let Some(ref key) = dataset.s3_key {
            let path = key.strip_prefix("local:").unwrap_or(key);
            if let Ok(bytes) = std::fs::read(path) {
                if let Some((schema, row_count)) = extract_csv_schema(&bytes) {
                    let _ = sqlx::query(
                        "UPDATE datasets SET schema = $1, row_count = COALESCE(row_count, $2), updated_at = NOW() WHERE id = $3"
                    )
                    .bind(&schema)
                    .bind(row_count)
                    .bind(dataset.id)
                    .execute(&state.db)
                    .await;
                    dataset.schema = Some(schema);
                    if dataset.row_count.is_none() {
                        dataset.row_count = Some(row_count);
                    }
                }
            }
        }
    }

    Ok(Json(dataset))
}

/// Infer the type of a CSV cell value by attempting numeric/bool parsing.
fn infer_cell_type(val: &str) -> &'static str {
    if val.is_empty() {
        return "string";
    }
    if val.parse::<i64>().is_ok() {
        return "int64";
    }
    if val.parse::<f64>().is_ok() {
        return "float64";
    }
    if val.eq_ignore_ascii_case("true") || val.eq_ignore_ascii_case("false") {
        return "boolean";
    }
    "string"
}

/// Parse a CSV byte slice and return (schema JSON, row_count).
fn extract_csv_schema(bytes: &[u8]) -> Option<(serde_json::Value, i64)> {
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(bytes);

    let headers = rdr.headers().ok()?.clone();
    if headers.is_empty() {
        return None;
    }

    let num_cols = headers.len();
    // Track best type per column: start with unknown, refine by sampling rows
    let mut col_types: Vec<Option<&'static str>> = vec![None; num_cols];
    let mut row_count: i64 = 0;
    let sample_limit = 100; // sample first 100 rows for type inference

    for result in rdr.records() {
        let record = match result {
            Ok(r) => r,
            Err(_) => continue,
        };
        row_count += 1;

        if row_count <= sample_limit {
            for (i, field) in record.iter().enumerate() {
                if i >= num_cols {
                    break;
                }
                let cell_type = infer_cell_type(field.trim());
                col_types[i] = Some(match col_types[i] {
                    None => cell_type,
                    Some(prev) => {
                        if prev == cell_type {
                            prev
                        } else if (prev == "int64" && cell_type == "float64")
                            || (prev == "float64" && cell_type == "int64")
                        {
                            "float64" // promote int ↔ float
                        } else {
                            "string" // fall back to string on conflict
                        }
                    }
                });
            }
        }
    }
    // Count remaining rows after sampling
    // (rdr already consumed all records in the loop above)

    let columns: Vec<serde_json::Value> = headers
        .iter()
        .enumerate()
        .map(|(i, name)| {
            serde_json::json!({
                "name": name,
                "type": col_types.get(i).and_then(|t| *t).unwrap_or("string"),
                "nullable": true
            })
        })
        .collect();

    Some((serde_json::Value::Array(columns), row_count))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(req): Json<CreateDatasetRequest>,
) -> AppResult<Json<Dataset>> {
    let dataset_id = Uuid::new_v4();

    // If file data is provided (base64), store it to local PVC
    let (s3_key, size_bytes, inferred_schema, inferred_row_count) = if let Some(ref data_b64) = req.data {
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data_b64)
            .map_err(|e| AppError::BadRequest(format!("Invalid base64: {e}")))?;

        let size = bytes.len() as i64;
        let dir = format!("{}/{}", DATASETS_DIR, dataset_id);
        std::fs::create_dir_all(&dir)
            .map_err(|e| AppError::Internal(format!("Failed to create dir: {e}")))?;

        let ext = req.format.to_lowercase();
        let file_path = format!("{}/{}.{}", dir, req.name, ext);
        std::fs::write(&file_path, &bytes)
            .map_err(|e| AppError::Internal(format!("Failed to write file: {e}")))?;

        // Extract schema from CSV files
        let (schema, row_count) = if ext == "csv" {
            extract_csv_schema(&bytes).unwrap_or((serde_json::Value::Null, 0))
        } else {
            (serde_json::Value::Null, 0)
        };

        let schema_opt = if schema.is_null() { None } else { Some(schema) };
        let row_count_opt = if row_count > 0 { Some(row_count) } else { req.row_count };

        (Some(format!("local:{}", file_path)), Some(size), schema_opt, row_count_opt)
    } else {
        (None, None, None, req.row_count)
    };

    let dataset: Dataset = sqlx::query_as(
        "INSERT INTO datasets (id, project_id, name, description, format, s3_key, size_bytes, row_count, version, created_by, schema, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10, NOW(), NOW()) RETURNING *"
    )
    .bind(dataset_id)
    .bind(req.project_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&req.format)
    .bind(&s3_key)
    .bind(size_bytes)
    .bind(inferred_row_count)
    .bind(claims.sub)
    .bind(&inferred_schema)
    .fetch_one(&state.db)
    .await?;
    notify(&state.db, claims.sub, "Dataset Created", &format!("Dataset '{}' ({}) uploaded", dataset.name, dataset.format), NotifyType::Success, Some(&format!("/datasets/{}", dataset.id))).await;
    Ok(Json(dataset))
}

pub async fn upload_url(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<UploadUrlResponse>> {
    let s3_key = format!("datasets/{}/{}", id, uuid::Uuid::new_v4());
    let upload_url = state
        .s3
        .presign_upload(&s3_key, "application/octet-stream", 3600)
        .await
        .map_err(|e| crate::error::AppError::Internal(format!("S3 error: {e}")))?;

    // Update dataset with s3_key
    sqlx::query("UPDATE datasets SET s3_key = $1, updated_at = NOW() WHERE id = $2")
        .bind(&s3_key)
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(UploadUrlResponse { upload_url, s3_key }))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM datasets WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}
