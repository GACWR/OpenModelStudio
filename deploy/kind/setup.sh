#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLUSTER_NAME="openmodelstudio"

if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "==> Deleting existing Kind cluster '$CLUSTER_NAME'..."
  kind delete cluster --name "$CLUSTER_NAME"
fi

echo "==> Creating Kind cluster '$CLUSTER_NAME'..."
kind create cluster --name "$CLUSTER_NAME" --config "$SCRIPT_DIR/kind-config.yaml"

echo "==> Building Docker images..."
docker build -t openmodelstudio/api:latest -f "$ROOT_DIR/deploy/Dockerfile.api" "$ROOT_DIR"
docker build -t openmodelstudio/frontend:latest -f "$ROOT_DIR/deploy/Dockerfile.frontend" "$ROOT_DIR/web"
docker build -t openmodelstudio/postgraphile:latest -f "$ROOT_DIR/deploy/Dockerfile.postgraphile" "$ROOT_DIR/postgraphile"

docker build -t openmodelstudio/model-runner-python:latest -f "$ROOT_DIR/deploy/Dockerfile.model-runner-python" "$ROOT_DIR/model-runner/python"
docker build -t openmodelstudio/workspace:latest -f "$ROOT_DIR/deploy/Dockerfile.workspace" "$ROOT_DIR"
docker build -t openmodelstudio/model-runner-rust:latest -f "$ROOT_DIR/deploy/Dockerfile.model-runner-rust" "$ROOT_DIR" || echo "  (model-runner-rust build skipped — Dockerfile not yet created)"

echo "==> Loading images into Kind..."
kind load docker-image openmodelstudio/api:latest --name "$CLUSTER_NAME"
kind load docker-image openmodelstudio/frontend:latest --name "$CLUSTER_NAME"
kind load docker-image openmodelstudio/postgraphile:latest --name "$CLUSTER_NAME"
kind load docker-image openmodelstudio/model-runner-python:latest --name "$CLUSTER_NAME"
kind load docker-image openmodelstudio/workspace:latest --name "$CLUSTER_NAME"
kind load docker-image openmodelstudio/model-runner-rust:latest --name "$CLUSTER_NAME" || echo "  (model-runner-rust load skipped)"

echo "==> Applying K8s manifests..."
kubectl apply -f "$ROOT_DIR/deploy/k8s/namespace.yaml"

echo "==> Creating postgres-init ConfigMap from init.sql..."
kubectl create configmap postgres-init \
  --from-file=init.sql="$ROOT_DIR/db/init.sql" \
  --namespace openmodelstudio --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$ROOT_DIR/deploy/k8s/secret.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/configmap.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/pvc.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/rbac.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/postgres.yaml"

echo "==> Waiting for postgres..."
kubectl rollout status statefulset/postgres -n openmodelstudio --timeout=120s

echo "==> Applying database schema and seed data..."
kubectl cp "$ROOT_DIR/db/init.sql" openmodelstudio/postgres-0:/tmp/init.sql
kubectl exec postgres-0 -n openmodelstudio -- psql -U openmodelstudio -d openmodelstudio -f /tmp/init.sql
kubectl cp "$ROOT_DIR/db/seed.sql" openmodelstudio/postgres-0:/tmp/seed.sql
kubectl exec postgres-0 -n openmodelstudio -- psql -U openmodelstudio -d openmodelstudio -f /tmp/seed.sql

kubectl apply -f "$ROOT_DIR/deploy/k8s/api.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/postgraphile.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/frontend.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/jupyter-hub.yaml"
kubectl apply -f "$ROOT_DIR/deploy/k8s/nodeport-services.yaml"

echo "==> Waiting for all deployments..."
"$SCRIPT_DIR/wait-ready.sh"

echo ""
echo "✅ OpenModelStudio deployed!"
echo "   Frontend:     http://localhost:31000"
echo "   API:          http://localhost:31001"
echo "   GraphQL:      http://localhost:31002/graphql"
echo "   JupyterHub:   http://localhost:31003"
