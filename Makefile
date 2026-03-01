# ======================================================================
#  OpenModelStudio — Makefile
#
#  Run `make k8s-deploy` to stand up the entire system.
#  Run `make help` to see everything available.
# ======================================================================

.PHONY: help k8s-deploy k8s-teardown k8s-status k8s-logs k8s-seed k8s-restart \
        k8s-forward k8s-forward-db k8s-forward-api k8s-forward-gql k8s-forward-jupyter \
        build build-api build-frontend build-postgraphile build-model-runner-python build-workspace build-model-runner-rust build-all-images \
        dev dev-api dev-frontend dev-db dev-stop \
        test test-api test-frontend test-sdk test-sdk-cov test-sdk-frameworks test-sdk-unit test-e2e test-pipelines test-all \
        lint lint-api lint-frontend \
        db-init db-seed db-migrate db-reset reset-db \
        pipeline-run pipeline-test \
        clean clean-docker clean-k8s \
        status doctor

# -----------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------

ROOT_DIR       := $(shell pwd)
API_DIR        := $(ROOT_DIR)/api
WEB_DIR        := $(ROOT_DIR)/web
DB_DIR         := $(ROOT_DIR)/db
DEPLOY_DIR     := $(ROOT_DIR)/deploy
K8S_DIR        := $(DEPLOY_DIR)/k8s
KIND_DIR       := $(DEPLOY_DIR)/kind
PG_DIR         := $(ROOT_DIR)/postgraphile
MODEL_DIR      := $(ROOT_DIR)/model-runner
PIPELINE_DIR   := $(ROOT_DIR)/pipelines
TEST_DIR       := $(ROOT_DIR)/tests
E2E_DIR        := $(TEST_DIR)/e2e

CLUSTER_NAME   := openmodelstudio
NAMESPACE      := openmodelstudio
KIND_CONFIG    := $(KIND_DIR)/kind-config.yaml

# Docker image names
IMG_API        := openmodelstudio/api:latest
IMG_FRONTEND   := openmodelstudio/frontend:latest
IMG_POSTGRAPHILE := openmodelstudio/postgraphile:latest
IMG_RUNNER_PY  := openmodelstudio/model-runner-python:latest
IMG_RUNNER_RS  := openmodelstudio/model-runner-rust:latest
IMG_WORKSPACE  := openmodelstudio/workspace:latest

# Database defaults
DB_HOST        ?= localhost
DB_PORT        ?= 5432
DB_NAME        ?= openmodelstudio
DB_USER        ?= openmodelstudio
DB_PASSWORD    ?= openmodelstudio_secret
DATABASE_URL   := postgres://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)

# Logs
LOG_DIR        := $(ROOT_DIR)/.logs
$(shell mkdir -p $(LOG_DIR))

# Colors
CYAN           := \033[36m
GREEN          := \033[32m
YELLOW         := \033[33m
RED            := \033[31m
BOLD           := \033[1m
RESET          := \033[0m


# =====================================================================
#  k8s-deploy — Full System Deploy
# =====================================================================

k8s-deploy: ## Build everything, create Kind cluster, deploy all services
	@echo "$(BOLD)$(GREEN)======================================================$(RESET)"
	@echo "$(BOLD)$(GREEN)  OpenModelStudio — Full System Deploy                $(RESET)"
	@echo "$(BOLD)$(GREEN)======================================================$(RESET)"
	@echo ""
	@echo "$(CYAN)  [1/7]  Checking prerequisites...$(RESET)"
	@$(MAKE) --no-print-directory doctor-quiet
	@echo "$(CYAN)  [2/7]  Tearing down existing cluster (clean slate)...$(RESET)"
	@$(MAKE) --no-print-directory k8s-cluster-delete 2>/dev/null || true
	@echo "$(CYAN)  [3/7]  Building all Docker images...$(RESET)"
	@$(MAKE) --no-print-directory build-all-images
	@echo "$(CYAN)  [4/7]  Creating Kind cluster...$(RESET)"
	@$(MAKE) --no-print-directory k8s-cluster-create
	@echo "$(CYAN)  [5/7]  Loading images into cluster...$(RESET)"
	@$(MAKE) --no-print-directory k8s-load-images
	@echo "$(CYAN)  [6/7]  Deploying all services...$(RESET)"
	@$(MAKE) --no-print-directory k8s-apply
	@echo "$(CYAN)  [7/7]  Waiting for all pods to be ready...$(RESET)"
	@$(MAKE) --no-print-directory k8s-wait
	@echo ""
	@echo "$(BOLD)$(GREEN)======================================================$(RESET)"
	@echo "$(BOLD)$(GREEN)  OpenModelStudio is live!                            $(RESET)"
	@echo "$(BOLD)$(GREEN)======================================================$(RESET)"
	@echo ""
	@echo "  $(CYAN)Frontend:$(RESET)     http://localhost:31000"
	@echo "  $(CYAN)API:$(RESET)          http://localhost:31001"
	@echo "  $(CYAN)GraphQL:$(RESET)      http://localhost:31002/graphql"
	@echo "  $(CYAN)JupyterHub:$(RESET)   http://localhost:31003"
	@echo ""


# =====================================================================
#  Kubernetes — Cluster Lifecycle
# =====================================================================

k8s-cluster-create: ## Create Kind cluster (idempotent, stops conflicting clusters first)
	@if kind get clusters 2>/dev/null | grep -q "^$(CLUSTER_NAME)$$"; then \
		echo "  $(YELLOW)Cluster '$(CLUSTER_NAME)' already exists, skipping creation$(RESET)"; \
	else \
		echo "  Checking for port conflicts..."; \
		CONFLICT=""; \
		for port in 31000 31001 31002 31003; do \
			if lsof -i :$$port -sTCP:LISTEN >/dev/null 2>&1; then \
				CONFLICT="$$CONFLICT $$port"; \
			fi; \
		done; \
		if [ -n "$$CONFLICT" ]; then \
			echo "  $(RED)Ports in use:$$CONFLICT$(RESET)"; \
			echo "  $(YELLOW)Stopping other Kind clusters that may hold these ports...$(RESET)"; \
			for cluster in $$(kind get clusters 2>/dev/null); do \
				echo "    Deleting cluster: $$cluster"; \
				kind delete cluster --name "$$cluster" 2>/dev/null || true; \
			done; \
			sleep 2; \
		fi; \
		kind create cluster --name $(CLUSTER_NAME) --config $(KIND_CONFIG); \
	fi

k8s-cluster-delete: ## Delete Kind cluster
	kind delete cluster --name $(CLUSTER_NAME) || true

k8s-nuke: ## Delete ALL Kind clusters on this machine (frees all ports)
	@echo "$(RED)Deleting ALL Kind clusters...$(RESET)"
	@for cluster in $$(kind get clusters 2>/dev/null); do \
		echo "  Deleting: $$cluster"; \
		kind delete cluster --name "$$cluster" 2>/dev/null || true; \
	done
	@echo "$(GREEN)All clusters deleted.$(RESET)"

k8s-load-images: ## Load all Docker images into Kind cluster
	kind load docker-image $(IMG_API) --name $(CLUSTER_NAME)
	kind load docker-image $(IMG_FRONTEND) --name $(CLUSTER_NAME)
	kind load docker-image $(IMG_POSTGRAPHILE) --name $(CLUSTER_NAME)
	kind load docker-image $(IMG_RUNNER_PY) --name $(CLUSTER_NAME)
	kind load docker-image $(IMG_WORKSPACE) --name $(CLUSTER_NAME)
	kind load docker-image $(IMG_RUNNER_RS) --name $(CLUSTER_NAME) 2>/dev/null || echo "  $(YELLOW)Skipped model-runner-rust (not built)$(RESET)"

k8s-apply: ## Apply all K8s manifests in correct order
	kubectl apply -f $(K8S_DIR)/namespace.yaml
	kubectl apply -f $(K8S_DIR)/secret.yaml
	kubectl apply -f $(K8S_DIR)/configmap.yaml
	kubectl apply -f $(K8S_DIR)/pvc.yaml
	kubectl apply -f $(K8S_DIR)/rbac.yaml
	kubectl apply -f $(K8S_DIR)/postgres.yaml
	@echo "  Waiting for Postgres to be ready..."
	kubectl rollout status statefulset/postgres -n $(NAMESPACE) --timeout=120s
	@# Apply database schema and seed data directly
	@echo "  Applying database schema (init.sql)..."
	kubectl cp $(DB_DIR)/init.sql $(NAMESPACE)/postgres-0:/tmp/init.sql
	kubectl exec postgres-0 -n $(NAMESPACE) -- psql -U $(DB_USER) -d $(DB_NAME) -f /tmp/init.sql
	@echo "  Seeding database (seed.sql)..."
	kubectl cp $(DB_DIR)/seed.sql $(NAMESPACE)/postgres-0:/tmp/seed.sql
	kubectl exec postgres-0 -n $(NAMESPACE) -- psql -U $(DB_USER) -d $(DB_NAME) -f /tmp/seed.sql
	kubectl apply -f $(K8S_DIR)/postgraphile.yaml
	kubectl apply -f $(K8S_DIR)/api.yaml
	kubectl apply -f $(K8S_DIR)/frontend.yaml
	kubectl apply -f $(K8S_DIR)/jupyter-hub.yaml
	kubectl apply -f $(K8S_DIR)/nodeport-services.yaml

k8s-wait: ## Wait for all deployments to be ready
	@chmod +x $(KIND_DIR)/wait-ready.sh 2>/dev/null || true
	@if [ -f "$(KIND_DIR)/wait-ready.sh" ]; then \
		bash $(KIND_DIR)/wait-ready.sh; \
	else \
		kubectl wait --for=condition=available deployment --all -n $(NAMESPACE) --timeout=300s; \
	fi

k8s-teardown: ## Tear down the entire K8s deployment and delete the cluster
	@echo "$(RED)Tearing down OpenModelStudio cluster...$(RESET)"
	@$(MAKE) --no-print-directory k8s-cluster-delete
	@echo "$(GREEN)Cluster deleted.$(RESET)"

k8s-redeploy: ## Rebuild images & re-apply to existing cluster (faster than full deploy)
	@echo "$(CYAN)Rebuilding and redeploying...$(RESET)"
	@$(MAKE) --no-print-directory build-all-images
	@$(MAKE) --no-print-directory k8s-load-images
	@$(MAKE) --no-print-directory k8s-apply
	@$(MAKE) --no-print-directory k8s-wait
	@echo "$(GREEN)Redeployment complete.$(RESET)"


# =====================================================================
#  Kubernetes — Restart Individual Services
# =====================================================================

k8s-restart: ## Restart all deployments
	kubectl rollout restart deployment --all -n $(NAMESPACE)

k8s-restart-api: ## Rebuild & restart API pod only
	@$(MAKE) --no-print-directory build-api
	kind load docker-image $(IMG_API) --name $(CLUSTER_NAME)
	kubectl rollout restart deployment/api -n $(NAMESPACE)
	kubectl rollout status deployment/api -n $(NAMESPACE) --timeout=120s

k8s-restart-frontend: ## Rebuild & restart frontend pod only
	@$(MAKE) --no-print-directory build-frontend
	kind load docker-image $(IMG_FRONTEND) --name $(CLUSTER_NAME)
	kubectl rollout restart deployment/frontend -n $(NAMESPACE)
	kubectl rollout status deployment/frontend -n $(NAMESPACE) --timeout=120s

k8s-restart-postgraphile: ## Rebuild & restart PostGraphile pod only
	@$(MAKE) --no-print-directory build-postgraphile
	kind load docker-image $(IMG_POSTGRAPHILE) --name $(CLUSTER_NAME)
	kubectl rollout restart deployment/postgraphile -n $(NAMESPACE)
	kubectl rollout status deployment/postgraphile -n $(NAMESPACE) --timeout=120s


# =====================================================================
#  Kubernetes — Observability
# =====================================================================

k8s-status: ## Show pod status across the cluster
	@echo "$(BOLD)Pods:$(RESET)"
	@kubectl get pods -n $(NAMESPACE) -o wide 2>/dev/null || echo "  No cluster running"
	@echo ""
	@echo "$(BOLD)Services:$(RESET)"
	@kubectl get svc -n $(NAMESPACE) 2>/dev/null || true
	@echo ""
	@echo "$(BOLD)PVCs:$(RESET)"
	@kubectl get pvc -n $(NAMESPACE) 2>/dev/null || true

k8s-logs: ## Tail logs from all pods (Ctrl+C to stop)
	kubectl logs -n $(NAMESPACE) --all-containers --prefix -f --max-log-requests=10 -l 'app' 2>/dev/null || \
		echo "No pods running. Deploy first with: make k8s-deploy"

k8s-logs-api: ## Tail API pod logs
	kubectl logs -n $(NAMESPACE) -l app=api -f --tail=100

k8s-logs-frontend: ## Tail frontend pod logs
	kubectl logs -n $(NAMESPACE) -l app=frontend -f --tail=100

k8s-logs-postgres: ## Tail Postgres pod logs
	kubectl logs -n $(NAMESPACE) -l app=postgres -f --tail=100

k8s-logs-postgraphile: ## Tail PostGraphile pod logs
	kubectl logs -n $(NAMESPACE) -l app=postgraphile -f --tail=100

k8s-logs-jupyter: ## Tail JupyterHub pod logs
	kubectl logs -n $(NAMESPACE) -l app=jupyter-hub -f --tail=100

k8s-describe: ## Describe all pods (useful for debugging)
	kubectl describe pods -n $(NAMESPACE)

k8s-events: ## Show recent cluster events
	kubectl get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -30


# =====================================================================
#  Kubernetes — Port Forwarding
# =====================================================================

k8s-forward: ## Forward all services to localhost (frontend:3000, api:8080, gql:5433, jupyter:8000)
	@echo "$(CYAN)Port-forwarding all services (Ctrl+C to stop)...$(RESET)"
	@echo "  Frontend:     http://localhost:3000"
	@echo "  API:          http://localhost:8080"
	@echo "  GraphQL:      http://localhost:5433/graphql"
	@echo "  JupyterHub:   http://localhost:8000"
	@echo "  Postgres:     localhost:5432"
	@kubectl port-forward -n $(NAMESPACE) svc/frontend 3000:3000 > $(LOG_DIR)/fwd-frontend.log 2>&1 & \
	 kubectl port-forward -n $(NAMESPACE) svc/api 8080:8080 > $(LOG_DIR)/fwd-api.log 2>&1 & \
	 kubectl port-forward -n $(NAMESPACE) svc/postgraphile 5433:5433 > $(LOG_DIR)/fwd-gql.log 2>&1 & \
	 kubectl port-forward -n $(NAMESPACE) svc/jupyter-hub 8000:8000 > $(LOG_DIR)/fwd-jupyter.log 2>&1 & \
	 kubectl port-forward -n $(NAMESPACE) svc/postgres 5432:5432 > $(LOG_DIR)/fwd-postgres.log 2>&1 & \
	 wait

k8s-forward-db: ## Forward Postgres to localhost:5432
	kubectl port-forward -n $(NAMESPACE) svc/postgres 5432:5432

k8s-forward-api: ## Forward API to localhost:8080
	kubectl port-forward -n $(NAMESPACE) svc/api 8080:8080

k8s-forward-gql: ## Forward PostGraphile to localhost:5433
	kubectl port-forward -n $(NAMESPACE) svc/postgraphile 5433:5433

k8s-forward-jupyter: ## Forward JupyterHub to localhost:8000
	kubectl port-forward -n $(NAMESPACE) svc/jupyter-hub 8000:8000


# =====================================================================
#  Kubernetes — Database Operations
# =====================================================================

k8s-seed: ## Seed the database with sample data via K8s
	@echo "$(CYAN)Seeding database...$(RESET)"
	kubectl port-forward -n $(NAMESPACE) svc/postgres 5432:5432 > /dev/null 2>&1 &
	@sleep 3
	PGPASSWORD=$(DB_PASSWORD) psql -h localhost -p 5432 -U $(DB_USER) -d $(DB_NAME) -f $(DB_DIR)/seed.sql
	@kill %1 2>/dev/null || true
	@echo "$(GREEN)Database seeded.$(RESET)"

k8s-psql: ## Open a psql shell to the K8s Postgres instance
	kubectl exec -it -n $(NAMESPACE) $$(kubectl get pod -n $(NAMESPACE) -l app=postgres -o jsonpath='{.items[0].metadata.name}') -- psql -U $(DB_USER) -d $(DB_NAME)

k8s-db-reset: ## Drop and recreate the database in K8s
	@echo "$(RED)Resetting database in cluster...$(RESET)"
	kubectl exec -n $(NAMESPACE) $$(kubectl get pod -n $(NAMESPACE) -l app=postgres -o jsonpath='{.items[0].metadata.name}') -- \
		psql -U $(DB_USER) -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	kubectl create configmap postgres-init --from-file=$(DB_DIR)/init.sql -n $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	kubectl exec -n $(NAMESPACE) $$(kubectl get pod -n $(NAMESPACE) -l app=postgres -o jsonpath='{.items[0].metadata.name}') -- \
		psql -U $(DB_USER) -d $(DB_NAME) -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || \
	PGPASSWORD=$(DB_PASSWORD) psql -h localhost -p 5432 -U $(DB_USER) -d $(DB_NAME) -f $(DB_DIR)/init.sql
	@echo "$(GREEN)Database reset complete.$(RESET)"

reset-db: ## Reset K8s database: wipe all data except test@openmodel.studio user, re-seed
	@echo "$(CYAN)Resetting K8s database (preserving test@openmodel.studio)...$(RESET)"
	@kubectl exec -n $(NAMESPACE) postgres-0 -- psql -U $(DB_USER) -d $(DB_NAME) -c "\
		DELETE FROM activity_log; \
		DELETE FROM notifications; \
		DELETE FROM artifacts; \
		DELETE FROM training_metrics; \
		DELETE FROM experiment_runs; \
		DELETE FROM experiments; \
		DELETE FROM inference_endpoints; \
		DELETE FROM workspaces; \
		DELETE FROM features; \
		DELETE FROM feature_groups; \
		DELETE FROM data_sources; \
		DELETE FROM jobs; \
		DELETE FROM datasets; \
		DELETE FROM model_versions; \
		DELETE FROM models; \
		DELETE FROM project_collaborators; \
		DELETE FROM projects; \
		DELETE FROM api_keys; \
		DELETE FROM search_history; \
		DELETE FROM templates; \
		DELETE FROM environments; \
		DELETE FROM users WHERE email <> 'test@openmodel.studio'; \
	"
	@echo "  Re-seeding environments and templates..."
	@kubectl exec -n $(NAMESPACE) -i postgres-0 -- psql -U $(DB_USER) -d $(DB_NAME) < $(DB_DIR)/seed.sql
	@echo "$(GREEN)Database reset complete. Only test@openmodel.studio remains.$(RESET)"


# =====================================================================
#  Docker — Build Images
# =====================================================================

build-all-images: build-api build-frontend build-postgraphile build-model-runner-python build-workspace build-model-runner-rust ## Build all Docker images

build-api: ## Build Rust API image
	@echo "  Building $(IMG_API)..."
	docker build -t $(IMG_API) -f $(DEPLOY_DIR)/Dockerfile.api $(ROOT_DIR)

build-frontend: ## Build Next.js frontend image
	@echo "  Building $(IMG_FRONTEND)..."
	docker build -t $(IMG_FRONTEND) -f $(DEPLOY_DIR)/Dockerfile.frontend $(WEB_DIR)

build-postgraphile: ## Build PostGraphile image
	@echo "  Building $(IMG_POSTGRAPHILE)..."
	docker build -t $(IMG_POSTGRAPHILE) -f $(DEPLOY_DIR)/Dockerfile.postgraphile $(PG_DIR)

build-model-runner-python: ## Build Python model runner image (PyTorch, sklearn, transformers)
	@echo "  Building $(IMG_RUNNER_PY)..."
	docker build -t $(IMG_RUNNER_PY) -f $(DEPLOY_DIR)/Dockerfile.model-runner-python $(MODEL_DIR)/python

build-workspace: ## Build workspace image with OpenModelStudio SDK
	@echo "  Building $(IMG_WORKSPACE)..."
	docker build -t $(IMG_WORKSPACE) -f $(DEPLOY_DIR)/Dockerfile.workspace $(ROOT_DIR)

build-model-runner-rust: ## Build Rust model runner image (libtorch)
	@echo "  Building $(IMG_RUNNER_RS)..."
	@if [ -f "$(DEPLOY_DIR)/Dockerfile.model-runner-rust" ]; then \
		docker build -t $(IMG_RUNNER_RS) -f $(DEPLOY_DIR)/Dockerfile.model-runner-rust $(MODEL_DIR)/rust; \
	else \
		echo "  $(YELLOW)Skipped — Dockerfile.model-runner-rust not yet created$(RESET)"; \
	fi


# =====================================================================
#  Local Development
# =====================================================================

dev: ## Start full local dev environment (Postgres + API + Frontend)
	@echo "$(BOLD)$(CYAN)Starting local dev environment...$(RESET)"
	@$(MAKE) --no-print-directory dev-db
	@sleep 2
	@echo "$(GREEN)Postgres running on localhost:5432$(RESET)"
	@echo ""
	@echo "  Now run in separate terminals:"
	@echo "    $(CYAN)make dev-api$(RESET)       — Start Rust API on :8080"
	@echo "    $(CYAN)make dev-frontend$(RESET)   — Start Next.js on :3000"

dev-db: ## Start local Postgres via Docker Compose
	docker compose -f $(DEPLOY_DIR)/docker-compose.dev.yaml up -d postgres

dev-api: ## Run Rust API locally (hot-reload with cargo watch if installed)
	@cd $(API_DIR) && \
	DATABASE_URL="$(DATABASE_URL)" \
	RUST_LOG=debug \
	JWT_SECRET=dev-secret \
	cargo run

dev-frontend: ## Run Next.js frontend locally
	cd $(WEB_DIR) && pnpm dev

dev-stop: ## Stop local dev Postgres
	docker compose -f $(DEPLOY_DIR)/docker-compose.dev.yaml down


# =====================================================================
#  Database — Local
# =====================================================================

db-init: ## Initialize local database schema
	PGPASSWORD=$(DB_PASSWORD) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) -f $(DB_DIR)/init.sql

db-seed: ## Seed local database with sample data
	PGPASSWORD=$(DB_PASSWORD) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) -f $(DB_DIR)/seed.sql

db-migrate: ## Run pending migrations
	@for f in $(DB_DIR)/migrations/*.sql; do \
		echo "  Applying $$f..."; \
		PGPASSWORD=$(DB_PASSWORD) psql -h $(DB_HOST) -p $(DB_PORT) -U $(DB_USER) -d $(DB_NAME) -f "$$f"; \
	done
	@echo "$(GREEN)Migrations complete.$(RESET)"

db-reset: db-init db-seed ## Reset local database (init + seed)
	@echo "$(GREEN)Local database reset complete.$(RESET)"


# =====================================================================
#  Testing
# =====================================================================

test: test-api test-frontend test-sdk ## Run API + frontend + SDK tests

test-all: test-api test-frontend test-sdk test-e2e test-pipelines ## Run ALL tests (unit + e2e + pipelines)

test-api: ## Run Rust API tests
	@echo "$(CYAN)Running API tests...$(RESET)"
	cd $(API_DIR) && cargo test

test-frontend: ## Run frontend tests
	@echo "$(CYAN)Running frontend tests...$(RESET)"
	cd $(WEB_DIR) && pnpm test 2>/dev/null || pnpm run lint

test-e2e: ## Run Playwright end-to-end tests
	@echo "$(CYAN)Running Playwright E2E tests...$(RESET)"
	cd $(E2E_DIR) && npx playwright install --with-deps 2>/dev/null || true
	cd $(E2E_DIR) && npx playwright test

test-e2e-ui: ## Run Playwright tests in headed/UI mode
	cd $(E2E_DIR) && npx playwright test --ui

test-e2e-report: ## Show last Playwright test report
	cd $(E2E_DIR) && npx playwright show-report

test-pipelines: ## Run pipeline tests
	@echo "$(CYAN)Running pipeline tests...$(RESET)"
	@for pipe in $(PIPELINE_DIR)/*/; do \
		name=$$(basename $$pipe); \
		if [ -d "$$pipe/tests" ]; then \
			echo "  Testing $$name..."; \
			cd "$$pipe" && python -m pytest tests/ -v 2>/dev/null || echo "  $(YELLOW)$$name tests skipped$(RESET)"; \
			cd $(ROOT_DIR); \
		fi; \
	done

PYTHON_TEST_DIR := $(TEST_DIR)/python

test-sdk: ## Run Python SDK & model runner tests
	@echo "$(CYAN)Running Python SDK & model runner tests...$(RESET)"
	cd $(PYTHON_TEST_DIR) && python3 -m pytest -v --tb=short -x

test-sdk-cov: ## Run Python tests with coverage report
	@echo "$(CYAN)Running Python tests with coverage...$(RESET)"
	cd $(PYTHON_TEST_DIR) && python3 -m pytest -v --tb=short \
		--cov=$(ROOT_DIR)/sdk/python/openmodelstudio \
		--cov=$(ROOT_DIR)/model-runner/python \
		--cov-report=term-missing

test-sdk-frameworks: ## Run only framework integration tests (sklearn, pytorch, tf)
	@echo "$(CYAN)Running framework integration tests...$(RESET)"
	cd $(PYTHON_TEST_DIR) && python3 -m pytest frameworks/ -v --tb=short

test-sdk-unit: ## Run only SDK unit tests (fast, no ML deps)
	@echo "$(CYAN)Running SDK unit tests...$(RESET)"
	cd $(PYTHON_TEST_DIR) && python3 -m pytest sdk/ -v --tb=short


# =====================================================================
#  Linting
# =====================================================================

lint: lint-api lint-frontend ## Lint everything

lint-api: ## Run cargo clippy on the Rust API
	cd $(API_DIR) && cargo clippy -- -D warnings

lint-frontend: ## Run ESLint on the frontend
	cd $(WEB_DIR) && pnpm run lint



# =====================================================================
#  Pipelines — Video Dataset & ETL
# =====================================================================

pipeline-run: ## Run the video dataset pipeline (usage: make pipeline-run PIPELINE=video-dataset)
	@if [ -z "$(PIPELINE)" ]; then echo "$(RED)Usage: make pipeline-run PIPELINE=video-dataset$(RESET)"; exit 1; fi
	@echo "$(CYAN)Running pipeline: $(PIPELINE)...$(RESET)"
	cd $(PIPELINE_DIR)/$(PIPELINE) && python ingest.py

pipeline-test: ## Run pipeline tests
	cd $(PIPELINE_DIR)/video-dataset && python -m pytest tests/ -v 2>/dev/null || echo "No tests found"


# =====================================================================
#  Dependencies — Install / Setup
# =====================================================================

install: install-api install-frontend install-e2e ## Install all project dependencies

install-api: ## Install Rust API dependencies (builds once to fetch crates)
	cd $(API_DIR) && cargo fetch

install-frontend: ## Install frontend dependencies
	cd $(WEB_DIR) && pnpm install

install-e2e: ## Install Playwright + browsers for E2E tests
	cd $(E2E_DIR) && npm install && npx playwright install --with-deps

install-postgraphile: ## Install PostGraphile dependencies
	cd $(PG_DIR) && npm install


# =====================================================================
#  Cleanup
# =====================================================================

clean: ## Clean build artifacts
	cd $(API_DIR) && cargo clean 2>/dev/null || true
	rm -rf $(WEB_DIR)/.next 2>/dev/null || true
	rm -rf $(LOG_DIR) 2>/dev/null || true
	@echo "$(GREEN)Build artifacts cleaned.$(RESET)"

clean-docker: ## Remove all openmodelstudio Docker images
	docker rmi $(IMG_API) $(IMG_FRONTEND) $(IMG_POSTGRAPHILE) $(IMG_RUNNER_PY) $(IMG_WORKSPACE) $(IMG_RUNNER_RS) 2>/dev/null || true
	docker image prune -f
	@echo "$(GREEN)Docker images cleaned.$(RESET)"

clean-all: clean clean-docker k8s-teardown ## Nuclear option: clean everything + delete cluster
	docker compose -f $(DEPLOY_DIR)/docker-compose.dev.yaml down -v 2>/dev/null || true
	@echo "$(GREEN)Everything cleaned.$(RESET)"


# =====================================================================
#  Status & Health Checks
# =====================================================================

status: ## Show status of everything (cluster, pods, docker, local)
	@echo "$(BOLD)=== Cluster ===$(RESET)"
	@kind get clusters 2>/dev/null | grep -q "$(CLUSTER_NAME)" && echo "  $(GREEN)Kind cluster '$(CLUSTER_NAME)' is running$(RESET)" || echo "  $(YELLOW)No cluster running$(RESET)"
	@echo ""
	@echo "$(BOLD)=== Pods ===$(RESET)"
	@kubectl get pods -n $(NAMESPACE) 2>/dev/null || echo "  (no pods)"
	@echo ""
	@echo "$(BOLD)=== Docker ===$(RESET)"
	@docker ps --filter "name=openmodelstudio" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "  (no containers)"

doctor: ## Check that all required tools are installed
	@echo "$(BOLD)Checking prerequisites...$(RESET)"
	@echo -n "  docker:      " && (docker --version 2>/dev/null && true || echo "$(RED)NOT FOUND — install Docker Desktop$(RESET)")
	@echo -n "  kind:        " && (kind --version 2>/dev/null && true || echo "$(RED)NOT FOUND — brew install kind$(RESET)")
	@echo -n "  kubectl:     " && (kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1 || echo "$(RED)NOT FOUND — brew install kubectl$(RESET)")
	@echo -n "  rust/cargo:  " && (cargo --version 2>/dev/null && true || echo "$(RED)NOT FOUND — curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh$(RESET)")
	@echo -n "  node:        " && (node --version 2>/dev/null && true || echo "$(RED)NOT FOUND — brew install node$(RESET)")
	@echo -n "  pnpm:        " && (pnpm --version 2>/dev/null && true || echo "$(RED)NOT FOUND — npm install -g pnpm$(RESET)")
	@echo -n "  python3:     " && (python3 --version 2>/dev/null && true || echo "$(RED)NOT FOUND — brew install python$(RESET)")
	@echo -n "  psql:        " && (psql --version 2>/dev/null && true || echo "$(YELLOW)NOT FOUND (optional) — brew install postgresql$(RESET)")
	@echo -n "  playwright:  " && (npx playwright --version 2>/dev/null && true || echo "$(YELLOW)NOT FOUND (optional) — make install-e2e$(RESET)")
	@echo ""

doctor-quiet: ## Check prerequisites (silent, fails on missing critical tools)
	@command -v docker >/dev/null 2>&1 || { echo "$(RED)docker not found. Install Docker Desktop.$(RESET)"; exit 1; }
	@command -v kind >/dev/null 2>&1 || { echo "$(RED)kind not found. Run: brew install kind$(RESET)"; exit 1; }
	@command -v kubectl >/dev/null 2>&1 || { echo "$(RED)kubectl not found. Run: brew install kubectl$(RESET)"; exit 1; }


# =====================================================================
#  SDK — Python Package (PyPI)
# =====================================================================

SDK_DIR := sdk/python

# Set version: make sdk-publish VERSION=0.2.0
ifdef VERSION
sdk-set-version:
	@echo "Setting version to $(VERSION)..."
	@sed -i '' 's/^version = ".*"/version = "$(VERSION)"/' $(SDK_DIR)/pyproject.toml
	@sed -i '' 's/^__version__ = ".*"/__version__ = "$(VERSION)"/' $(SDK_DIR)/openmodelstudio/__init__.py
	@echo "Version set to $(VERSION)"
else
sdk-set-version:
	@true
endif

sdk-build: sdk-set-version sdk-clean ## Build the openmodelstudio Python package (VERSION=x.y.z)
	@echo "Building openmodelstudio SDK..."
	cd $(SDK_DIR) && python3 -m pip install --upgrade build --quiet && python3 -m build
	@echo "Build artifacts:"
	@ls -lh $(SDK_DIR)/dist/

sdk-publish-test: sdk-build ## Publish openmodelstudio to TestPyPI (VERSION=x.y.z)
	@echo "Uploading to TestPyPI..."
	cd $(SDK_DIR) && python3 -m pip install --upgrade twine --quiet && python3 -m twine upload --repository testpypi dist/*
	@echo "Done! Install with: pip install --index-url https://test.pypi.org/simple/ openmodelstudio"

sdk-publish: sdk-build ## Publish openmodelstudio to PyPI (VERSION=x.y.z)
	@echo "Uploading to PyPI..."
	cd $(SDK_DIR) && python3 -m pip install --upgrade twine --quiet && python3 -m twine upload dist/*
	@echo "Done! Install with: pip install openmodelstudio"

sdk-clean: ## Remove SDK build artifacts
	rm -rf $(SDK_DIR)/dist/ $(SDK_DIR)/build/ $(SDK_DIR)/*.egg-info

# =====================================================================
#  Help
# =====================================================================

help: ## Show this help
	@echo ""
	@echo "$(BOLD)OpenModelStudio Makefile$(RESET) — run $(CYAN)make k8s-deploy$(RESET) to stand up everything"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-28s$(RESET) %s\n", $$1, $$2}'
	@echo ""
