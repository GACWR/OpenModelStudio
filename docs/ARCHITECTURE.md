# Architecture

## System Overview

```
+---------------------------------------------------------------------+
|                        Kind Cluster                                  |
|                                                                      |
|  +----------+  +----------+  +-------------+  +------------+        |
|  | Frontend  |  | Rust API |  | PostGraphile|  | JupyterHub |        |
|  | Next.js   |  |  Axum    |  |  GraphQL    |  |            |        |
|  | :31000    |  |  :31001  |  |  :31002     |  |  :31003    |        |
|  +-----+-----+  +----+-----+  +------+------+  +------+-----+       |
|        |              |               |                |             |
|        |         +----+---------------+----+           |             |
|        |         |      PostgreSQL 16      |           |             |
|        |         |        :5432            |           |             |
|        |         +-------------------------+           |             |
|        |              |                                |             |
|        |         +----+-------------+                  |             |
|        |         |  Model Runner    |   +------------+ |             |
|        |         |  Pods (ephemeral)|   |  User       | |            |
|        |         |  - Python        |   |  Notebook   | |            |
|        |         |  - Rust          |   |  Pods       | |            |
|        |         +------------------+   +------------+ |             |
|                                                                      |
+----------------------------------------------------------------------+
```

## Components

### Frontend (Next.js 16)
- **App Router** with server and client components
- **shadcn/ui** component library + Tailwind CSS
- **Monaco Editor** for in-browser code editing
- **Recharts** for real-time training metrics
- **SSE client** for streaming updates
- **Cmd+K** command palette for global search
- **Framer Motion** for animations

### Rust API (Axum 0.8)
- **Axum** web framework with Tower middleware
- **SQLx 0.8** for compile-time checked SQL queries
- **JWT** authentication with role-based access control (access + refresh tokens)
- **SSE** endpoints for real-time training metrics
- **K8s client** for launching training pods and workspaces
- **LLM integration** for the AI assistant (OpenAI, Anthropic, Ollama)
- **S3-compatible storage** for artifacts and datasets

### PostGraphile
- Auto-generates GraphQL from PostgreSQL schema
- Runs on internal port 5433, exposed via NodePort 31002
- Provides `graphiql` playground

### PostgreSQL 16
- Primary data store for all application state
- 27 tables covering users, projects, models, jobs, datasets, experiments, workspaces, features, pipelines, and more

### Model Runner
- Ephemeral Kubernetes pods per training/inference job
- Supports Python (PyTorch) and Rust (tch-rs) models
- Reports metrics back via API (SSE relay)
- Configurable resource limits (CPU, memory, GPU)

### JupyterHub
- Spawns per-user JupyterLab instances
- Pre-configured with project datasets and model code
- Accessed via iframe in the frontend

## Data Flow

### Training Job Lifecycle

```
User clicks "Train" --> API creates job record in 'jobs' table
                    --> API creates K8s Job with model code + config
                    --> Pod starts, loads data via streaming
                    --> Pod reports metrics via HTTP --> API stores + relays via SSE
                    --> Frontend receives SSE --> Updates charts in real-time
                    --> Pod completes --> Saves model artifacts to S3
                    --> API updates job status --> Frontend shows results
```

### Authentication Flow

```
Register/Login --> API validates --> Returns JWT (access + refresh)
               --> Frontend stores in httpOnly cookie
               --> All subsequent requests include JWT
               --> API middleware validates + extracts user
               --> Role-based access control on routes
```

### LLM Assistant Flow

```
User sends message --> Frontend POSTs JSON to /llm/chat
                   --> API resolves LLM provider from config or per-request overrides
                   --> LLM response processed (non-streaming for tool detection)
                   --> Tool calls executed against DB/K8s (up to 5 rounds)
                   --> Final response streams to frontend via SSE
```

## Database Schema (Key Tables)

```sql
-- Core entities
users               (id, email, name, password_hash, role, ...)
projects            (id, name, description, stage, owner_id, ...)
project_collaborators (id, project_id, user_id, role, ...)
models              (id, project_id, name, framework, language, source_code, ...)
model_versions      (id, model_id, version, code, ...)

-- Jobs and training
jobs                (id, project_id, model_id, job_type, status, config, metrics, ...)
training_metrics    (id, job_id, metric_name, metric_value, step, epoch, ...)
job_logs            (id, job_id, level, message, ...)

-- Data
datasets            (id, project_id, name, path, format, size_bytes, ...)
data_sources        (id, name, source_type, connection_config, ...)
feature_groups      (id, project_id, name, description, ...)
features            (id, feature_group_id, name, dtype, transform, ...)

-- Experiments
experiments         (id, project_id, name, description, ...)
experiment_runs     (id, experiment_id, job_id, parameters, metrics, ...)

-- Infrastructure
workspaces          (id, user_id, project_id, status, jupyter_url, ...)
environments        (id, name, base_image, dockerfile_extra, ...)
artifacts           (id, job_id, name, artifact_type, s3_key, ...)

-- Platform
hyperparameter_sets (id, project_id, name, parameters, ...)
pipelines           (id, project_id, name, description, ...)
pipeline_steps      (id, pipeline_id, step_order, step_type, config, ...)
sweeps              (id, project_id, name, search_strategy, ...)
templates           (id, name, category, description, ...)

-- User-facing
notifications       (id, user_id, title, message, ...)
activity_log        (id, user_id, action, entity_type, entity_id, ...)
search_history      (id, user_id, query, ...)
api_keys            (id, user_id, name, key_hash, ...)
inference_endpoints (id, model_id, name, status, ...)
```
