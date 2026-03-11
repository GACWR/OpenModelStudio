<p align="center">
  <img src="web/public/openmodelstudio-logo.png" alt="OpenModelStudio" width="120" />
</p>

<h1 align="center">OpenModelStudio</h1>

<p align="center">
  An open-source AI laboratory for building, training, and deploying machine learning models.<br/>
  Powered by Kubernetes.
</p>

| Status | Badge | Status | Badge |
| --- | --- | --- | --- |
| `Build` | [![Build](https://github.com/GACWR/OpenModelStudio/actions/workflows/ci.yml/badge.svg)](https://github.com/GACWR/OpenModelStudio/actions) | `Docker` | [![Docker](https://github.com/GACWR/OpenModelStudio/actions/workflows/docker.yml/badge.svg)](https://github.com/GACWR/OpenModelStudio/actions) |
| `License` | [![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](https://github.com/GACWR/OpenModelStudio/blob/main/LICENSE) | `Platform` | ![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macos-lightgrey.svg) |
| `Issues` | [![Issues](https://img.shields.io/github/issues/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio/issues) | `Closed Issues` | [![Closed Issues](https://img.shields.io/github/issues-closed/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio/issues?q=is%3Aissue+is%3Aclosed) |
| `Pull Requests` | [![PRs](https://img.shields.io/github/issues-pr/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio/pulls) | `Last Commit` | [![Last commit](https://img.shields.io/github/last-commit/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio/commits/main) |
| `Top Language` | [![Top language](https://img.shields.io/github/languages/top/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio) | `Code Size` | [![Code size](https://img.shields.io/github/languages/code-size/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio) |
| `Repo Size` | [![Repo size](https://img.shields.io/github/repo-size/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio) | `Contributors` | [![Contributors](https://img.shields.io/github/contributors/GACWR/OpenModelStudio.svg)](https://github.com/GACWR/OpenModelStudio/graphs/contributors) |
| `Stars` | [![Stars](https://img.shields.io/github/stars/GACWR/OpenModelStudio.svg?style=social)](https://github.com/GACWR/OpenModelStudio/stargazers) | `Forks` | [![Forks](https://img.shields.io/github/forks/GACWR/OpenModelStudio.svg?style=social)](https://github.com/GACWR/OpenModelStudio/network/members) |
| `Rust` | ![Rust](https://img.shields.io/badge/rust-edition_2021-orange.svg?logo=rust&logoColor=white) | `Axum` | ![Axum](https://img.shields.io/badge/axum-0.8-orange.svg?logo=rust&logoColor=white) |
| `Next.js` | ![Next.js](https://img.shields.io/badge/next.js-16-black.svg?logo=next.js&logoColor=white) | `React` | ![React](https://img.shields.io/badge/react-19-61DAFB.svg?logo=react&logoColor=black) |
| `TypeScript` | ![TypeScript](https://img.shields.io/badge/typescript-5-3178C6.svg?logo=typescript&logoColor=white) | `Python` | ![Python](https://img.shields.io/badge/python-3.11+-3776AB.svg?logo=python&logoColor=white) |
| `PostgreSQL` | ![PostgreSQL](https://img.shields.io/badge/postgresql-16-4169E1.svg?logo=postgresql&logoColor=white) | `Kubernetes` | ![Kubernetes](https://img.shields.io/badge/kubernetes-native-326CE5.svg?logo=kubernetes&logoColor=white) |
| `PyTorch` | ![PyTorch](https://img.shields.io/badge/pytorch-2.3-EE4C2C.svg?logo=pytorch&logoColor=white) | `Docker` | ![Docker](https://img.shields.io/badge/docker-10_images-2496ED.svg?logo=docker&logoColor=white) |
| `shadcn/ui` | ![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-components-000000.svg?logo=shadcnui&logoColor=white) | `GraphQL` | ![GraphQL](https://img.shields.io/badge/graphql-postgraphile-E10098.svg?logo=graphql&logoColor=white) |
| `Playwright` | ![Playwright](https://img.shields.io/badge/playwright-e2e-2EAD33.svg?logo=playwright&logoColor=white) | `PRs Welcome` | [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/GACWR/OpenModelStudio/pulls) |
| `Discord` | [![Discord](https://img.shields.io/badge/discord-join-5865F2.svg?logo=discord&logoColor=white)](https://discord.gg/kCwDRnvpMt) | | |

<p align="center">
  <img src="docs/screenshots/oms-screenshot1.png" alt="OpenModelStudio Dashboard and JupyterLab" width="100%" />
</p>

---

## Features

### For Data Scientists
- **Project Management** -- Organize experiments with stage-based workflow (Ideation, Development, Production)
- **Project-Scoped Filtering** -- Global project selector in the topbar scopes every page (models, datasets, experiments, jobs, workspaces, features, visualizations) to a single project
- **Model Editor** -- Write and edit models directly in the browser with Monaco (Python + Rust)
- **Model Registry & CLI** -- Search, install, and manage models from the [Open Model Registry](https://github.com/GACWR/open-model-registry) via CLI (`openmodelstudio install iris-svm`) or the in-app registry browser. Install status syncs bidirectionally between CLI and UI
- **Real-Time Training** -- Watch loss curves, accuracy, and all metrics auto-update live during training with second-level duration accuracy
- **Generative Output Viewer** -- See video/image/audio outputs as models train
- **Experiment Tracking** -- Compare runs with parallel coordinates and sortable tables
- **Visualizations & Dashboards** -- 9 visualization backends (matplotlib, seaborn, plotly, bokeh, altair, plotnine, datashader, networkx, geopandas) with a unified `render()` abstraction. Combine visualizations into drag-and-drop dashboards with persistent layout
- **Global Search** -- Cmd+K command palette searches across models, datasets, experiments, training jobs, projects, and visualizations with instant navigation
- **Notifications** -- Real-time notification bell with unread count, grouped timeline (Today / This Week / Earlier), mark-all-read, and context-aware icons
- **JupyterLab Workspaces** -- Launch cloud-native notebooks pre-loaded with tutorial notebooks (Welcome, Visualizations, Registry)
- **LLM Assistant** -- Natural language control of the entire platform
- **AutoML** -- Automated hyperparameter search
- **Feature Store** -- Reusable features across projects

### For ML Engineers
- **Kubernetes-Native** -- Every model trains in its own ephemeral pod
- **Rust API** -- High-performance backend built with Axum + SQLx
- **Python SDK & CLI** -- `pip install openmodelstudio` gives you both a Python SDK (`import openmodelstudio as oms`) and a CLI for registry management, model install/uninstall, and configuration
- **GraphQL** -- Auto-generated from PostgreSQL via PostGraphile
- **Streaming Data** -- Never load full datasets to disk
- **One-Command Deploy** -- `make k8s-deploy` sets up everything

### For Researchers
- **HARPA Architecture** -- Novel hierarchical adaptive recurrent model included
- **Genie World Model** -- Interactive video generation from unlabeled video
- **Video-JEPA** -- Self-supervised video representation learning
- **TRM** -- Tiny recursive reasoning model (7M params, recursion-as-depth)
- **Video Generation Pipeline** -- End-to-end video+audio dataset processing
- **PyTorch + Rust-Torch** -- Write models in either language
- **Consumer Hardware** -- Designed to train on laptops, not GPU clusters

---

<p align="center">
  <img src="docs/screenshots/oms-screenshot2.png" alt="OpenModelStudio Workspaces and Model Metrics" width="100%" />
</p>

### Visualizations & Dashboards

Create, render, and publish data visualizations from notebooks or the in-browser editor. OpenModelStudio supports **9 visualization backends** with a unified `render()` function that auto-detects the library:

| Backend | Output | Use Case |
|---------|--------|----------|
| matplotlib | SVG | Standard plots, publication-quality figures |
| seaborn | SVG | Statistical visualization, heatmaps |
| plotly | JSON | Interactive charts with zoom, pan, hover |
| bokeh | JSON | Interactive streaming charts |
| altair | JSON | Declarative Vega-Lite specifications |
| plotnine | SVG | ggplot2-style grammar of graphics |
| datashader | PNG | Server-side rendering for millions of points |
| networkx | SVG | Network/graph visualizations |
| geopandas | SVG | Geospatial maps |

Combine visualizations into **drag-and-drop dashboards** with resizable panels, lock/unlock layout, and persistent configuration. Each visualization also has a full **in-browser editor** with Monaco, live preview for JSON backends, template insertion, and data/config tabs. See the [Visualizations Guide](docs/VISUALIZATIONS.md) for SDK usage.

<p align="center">
  <img src="docs/screenshots/oms-screenshot3.png" alt="OpenModelStudio Visualization Framework" width="100%" />
</p>

<p align="center">
  <img src="docs/screenshots/oms-screenshot4.png" alt="OpenModelStudio Visualization Framework" width="100%" />
</p>


### Model Registry

Browse, install, and manage models from the [Open Model Registry](https://github.com/GACWR/open-model-registry) -- a public GitHub repo that acts as a decentralized model package manager.

**From the CLI:**
```bash
openmodelstudio search classification        # Search by keyword
openmodelstudio install iris-svm             # Install a model
openmodelstudio list                         # List installed models
```

From notebooks or scripts, use `oms.use_model("iris-svm")` to load an installed model, then register and train it with the SDK. Works inside workspace containers via the platform API — no filesystem access needed. Install status syncs bidirectionally between CLI and UI. See the [Registry Guide](docs/CLI-REGISTRY.md) for full SDK usage.

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Docker | Latest |
| Kind | 0.20+ |
| Rust | 1.93+ |
| Node.js | 22+ |
| pnpm | 9+ |

### One-Command Setup

```bash
make k8s-deploy
```

This will:
1. Tear down any existing cluster (clean slate)
2. Build all Docker images (API, Frontend, PostGraphile, Model Runners)
3. Create a Kind cluster
4. Deploy PostgreSQL, API, Frontend, PostGraphile, JupyterHub
5. Run database schema and seed data
6. Health check all services

### Access

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:31000 |
| **API** | http://localhost:31001 |
| **GraphQL Playground** | http://localhost:31002/graphql |
| **JupyterHub** | http://localhost:31003 |

### Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `test@openmodel.studio` | `Test1234` |

---

## Architecture

![Architecture](docs/diagrams/architecture.svg)

### Components

| Component | Stack | Description |
|-----------|-------|-------------|
| **Frontend** | Next.js 16, shadcn/ui, Tailwind, Recharts | App Router, Monaco editor, SSE streaming, Cmd+K search |
| **API** | Rust, Axum, SQLx | JWT auth, RBAC, K8s client, SSE metrics, LLM integration |
| **PostGraphile** | Node.js | Auto-generated GraphQL from PostgreSQL schema |
| **PostgreSQL 16** | SQL | Primary data store: users, projects, models, jobs, datasets, experiments, visualizations, dashboards, notifications |
| **Model Runner** | Python/Rust | Ephemeral K8s pods per training job, streaming metrics |
| **JupyterHub** | Python | Per-user JupyterLab with pre-configured SDK, tutorial notebooks, and datasets |

### Training Job Lifecycle

```
User clicks "Train" --> API creates training_job record
                    --> API creates K8s Job with model code + config
                    --> Pod starts, loads data via streaming
                    --> Pod reports metrics via HTTP --> API stores + relays via SSE
                    --> Frontend receives SSE --> Updates charts in real-time
                    --> Pod completes --> Saves model artifacts
                    --> API updates training_job status --> Frontend shows results
```

### Database Schema (Key Tables)

```sql
users            (id, email, name, password_hash, role, created_at)
projects         (id, name, description, stage, owner_id, created_at)
models           (id, project_id, name, framework, registry_name, created_at)
model_versions   (id, model_id, version, code, created_at)
jobs             (id, project_id, model_id, job_type, status, config, metrics, started_at, completed_at)
datasets         (id, project_id, name, path, format, size_bytes, created_at)
experiments      (id, project_id, name, description, created_at)
experiment_runs  (id, experiment_id, parameters, metrics, created_at)
workspaces       (id, user_id, status, jupyter_url, created_at)
visualizations   (id, project_id, name, backend, code, output_type, output_data, published, created_at)
dashboards       (id, project_id, name, description, layout, created_at)
notifications    (id, user_id, title, message, notification_type, read, link, created_at)
```

> See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture documentation.

---

## Tutorial

Follow these guides to go from zero to a fully tracked ML experiment:

1. **[Usage Guide](docs/USAGE.md)** -- Log in, create a project, upload a dataset, launch a workspace
2. **[Modeling Guide](docs/MODELING.md)** -- Train, evaluate, and track models using the SDK (16-cell notebook walkthrough including visualizations and dashboards)
3. **[Visualization Guide](docs/VISUALIZATIONS.md)** -- All 9 backends, `render()` function, dashboards, and the in-browser editor (pre-loaded as `visualization.ipynb` in workspaces)
4. **[Registry & CLI Guide](docs/CLI-REGISTRY.md)** -- Install, use, and manage models from the Open Model Registry (pre-loaded as `registry.ipynb` in workspaces)

---

## REST API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register a new user |
| `POST` | `/auth/login` | Login and receive JWT |
| `GET` | `/auth/me` | Get current user profile |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects` | List all projects |
| `POST` | `/projects` | Create a project |
| `GET` | `/projects/:id` | Get project details |
| `PUT` | `/projects/:id` | Update project |
| `DELETE` | `/projects/:id` | Delete project |

### Models

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/models` | List models |
| `POST` | `/models` | Create a model |
| `PUT` | `/models/:id/code` | Update model source code |
| `POST` | `/models/:id/run` | Execute model |

### Training

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/training/start` | Start a training job |
| `GET` | `/training/:id` | Get training job status |
| `GET` | `/training/:id/metrics` | SSE stream of training metrics |

### Visualizations & Dashboards

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/visualizations` | List visualizations (supports `?project_id=`) |
| `POST` | `/visualizations` | Create a visualization |
| `GET` | `/visualizations/:id` | Get visualization details |
| `PUT` | `/visualizations/:id` | Update visualization code/config |
| `POST` | `/visualizations/:id/render` | Render a visualization |
| `POST` | `/visualizations/:id/publish` | Publish for dashboard use |
| `GET` | `/dashboards` | List dashboards |
| `POST` | `/dashboards` | Create a dashboard |
| `PUT` | `/dashboards/:id` | Update dashboard layout |

### Notifications & Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/notifications` | Get user notifications (supports `?unread=true`) |
| `POST` | `/notifications/:id/read` | Mark notification as read |
| `POST` | `/notifications/read-all` | Mark all notifications as read |
| `GET` | `/search?q=` | Global search across models, datasets, experiments, jobs, projects |

### Model Registry

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/models/registry-status?names=` | Check install status for registry models |
| `POST` | `/models/registry-install` | Register a model from the registry |
| `POST` | `/models/registry-uninstall` | Unregister a registry model |
| `GET` | `/sdk/models/resolve-registry/:name` | Resolve a registry model by name (used by SDK `use_model()`) |

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/workspaces/launch` | Launch a JupyterLab workspace |
| `DELETE` | `/workspaces/:id` | Stop a workspace |
| `POST` | `/llm/chat` | Chat with LLM assistant (SSE) |
| `GET` | `/datasets` | List datasets |
| `POST` | `/datasets` | Upload a dataset |
| `POST` | `/experiments` | Create an experiment |
| `GET` | `/experiments/:id/runs` | Get experiment runs |

### GraphQL (port 31002)

Auto-generated from PostgreSQL schema via PostGraphile. Explore at [`/graphiql`](http://localhost:31002/graphiql).

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing |
| `JWT_REFRESH_SECRET` | Yes | Secret for refresh token signing |
| `RUST_LOG` | No | Log level (default: `info`) |
| `LLM_PROVIDER` | No | LLM provider: `ollama`, `openai`, or `anthropic` (default: `ollama`) |
| `LLM_API_KEY` | No | API key for the configured LLM provider |
| `LLM_MODEL` | No | Model name for the LLM provider (default: `llama2`) |
| `LLM_BASE_URL` | No | Base URL for LLM API (default: `http://localhost:11434`) |
| `S3_BUCKET` | No | For dataset/artifact storage (default: `openmodelstudio`) |
| `S3_REGION` | No | S3 region (default: `us-east-1`) |
| `K8S_NAMESPACE` | No | Kubernetes namespace (default: `openmodelstudio`) |

---

## Development

### Local Development

```bash
make dev           # Starts Postgres via Docker, prints instructions for API + Frontend
make dev-api       # Run Rust API locally on :8080
make dev-frontend  # Run Next.js frontend locally on :3000
```

### Run Tests

```bash
make test          # API + Frontend tests
make test-api      # Rust API tests only
make test-e2e      # Playwright E2E tests
make test-all      # Everything (unit + e2e + models + pipelines)
```

### Makefile Targets

Run `make help` to see all available targets. Key ones:

| Target | Description |
|--------|-------------|
| `make k8s-deploy` | Full K8s deployment (Kind + all services) |
| `make k8s-teardown` | Destroy Kind cluster and all resources |
| `make k8s-redeploy` | Rebuild + redeploy to existing cluster |
| `make k8s-restart-api` | Rebuild and restart just the API pod |
| `make k8s-restart-frontend` | Rebuild and restart just the Frontend pod |
| `make k8s-status` | Show pod/service/PVC status |
| `make k8s-logs` | Tail all pod logs |
| `make k8s-psql` | Open a psql shell to K8s Postgres |
| `make dev` | Local development mode |
| `make test` | Run all tests |
| `make lint` | Lint everything (Rust + TypeScript) |
| `make doctor` | Check all prerequisites are installed |
| `make clean` | Clean build artifacts |

---

## Documentation

| Doc | Description |
|-----|-------------|
| [Usage Guide](docs/USAGE.md) | UI walkthrough: login, projects, datasets, workspaces |
| [Modeling Guide](docs/MODELING.md) | End-to-end SDK notebook: train, evaluate, visualize, track |
| [Visualizations Guide](docs/VISUALIZATIONS.md) | 9 backends, `render()`, dashboards, in-browser editor |
| [CLI & Registry Guide](docs/CLI-REGISTRY.md) | Model registry: search, install, `use_model()`, uninstall |
| [Architecture](docs/ARCHITECTURE.md) | System design, component diagram, data flow |
| [Model Authoring](docs/MODEL-AUTHORING.md) | How to write models for OpenModelStudio |
| [Dataset Guide](docs/DATASET-GUIDE.md) | Preparing and uploading datasets |
| [Deployment](docs/DEPLOYMENT.md) | Production deployment guide |
| [LLM Integration](docs/LLM-INTEGRATION.md) | LLM assistant architecture and extending |
| [API for agents & automation](docs/API-FOR-AGENTS.md) | Same REST API for OpenClaw, CLI, and any coding agent; API key auth |
| [OpenClaw Integration](docs/OPENCLAW-INTEGRATION.md) | Drive OpenModelStudio from OpenClaw AI agents (Telegram, Discord, etc.) |
| [OpenClaw & Claude step-by-step](docs/OPENCLAW-AND-CLAUDE.md) | Follow-along guide: OpenClaw and Claude Code setup and usage |
| [OpenClaw Quickstart & Testing](docs/OPENCLAW-QUICKSTART.md) | Full flow, config, API key, and test checklist |
| [Research Models](docs/RESEARCH_MODELS.md) | Research architectures: HARPA, Genie, JEPA |
| [Contributing](docs/CONTRIBUTING.md) | How to contribute |

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

---

## License

[GPL License](https://github.com/GACWR/OpenModelStudio/blob/main/LICENSE)
