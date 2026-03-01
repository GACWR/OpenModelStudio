# Deployment Guide

## Local Development (Kind)

```bash
make k8s-deploy    # Sets up everything
make k8s-teardown  # Tears down everything
```

This is the default. See the README for details.

## Production Deployment

### Prerequisites

- A Kubernetes cluster (EKS, GKE, AKS, or self-managed)
- `kubectl` configured to connect to your cluster
- A container registry (ECR, GCR, Docker Hub)
- PostgreSQL 16 (managed or self-hosted)
- A domain name + TLS certificates

### Step 1: Build and Push Images

```bash
export REGISTRY=your-registry.example.com/openmodelstudio

docker build -f deploy/Dockerfile.api -t $REGISTRY/api:latest .
docker build -f deploy/Dockerfile.frontend -t $REGISTRY/frontend:latest ./web
docker build -f deploy/Dockerfile.postgraphile -t $REGISTRY/postgraphile:latest ./postgraphile
docker build -f deploy/Dockerfile.model-runner-python -t $REGISTRY/model-runner-python:latest ./model-runner/python
docker build -f deploy/Dockerfile.model-runner-rust -t $REGISTRY/model-runner-rust:latest ./model-runner/rust

docker push $REGISTRY/api:latest
docker push $REGISTRY/frontend:latest
docker push $REGISTRY/postgraphile:latest
docker push $REGISTRY/model-runner-python:latest
docker push $REGISTRY/model-runner-rust:latest
```

### Step 2: Configure Secrets

```bash
kubectl create namespace openmodelstudio

kubectl -n openmodelstudio create secret generic db-credentials \
  --from-literal=DATABASE_URL="postgres://user:pass@host:5432/openmodelstudio"

kubectl -n openmodelstudio create secret generic jwt-secret \
  --from-literal=JWT_SECRET="your-secret-here"

kubectl -n openmodelstudio create secret generic llm-keys \
  --from-literal=OPENAI_API_KEY="sk-..." \
  --from-literal=ANTHROPIC_API_KEY="sk-ant-..."
```

### Step 3: Apply Manifests

```bash
# Update image references in deploy/k8s/*.yaml to point to your registry
sed -i "s|image:.*api.*|image: $REGISTRY/api:latest|g" deploy/k8s/*.yaml

kubectl apply -n openmodelstudio -f deploy/k8s/
```

### Step 4: Ingress / TLS

Note: An ingress manifest is not included by default. Create one for your environment. API routes do NOT have an `/api` prefix -- all endpoints are at the root level (e.g., `/auth/login`, `/projects`). Route accordingly.

```yaml
# Example: deploy/k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: openmodelstudio
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts: [openmodelstudio.example.com]
      secretName: openmodelstudio-tls
  rules:
    - host: openmodelstudio.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port: { number: 3000 }
    - host: api.openmodelstudio.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port: { number: 8080 }
    - host: graphql.openmodelstudio.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: postgraphile
                port: { number: 5433 }
```

### Step 5: Database Migration

```bash
kubectl -n openmodelstudio run migrate --rm -it --image=$REGISTRY/api:latest \
  --env="DATABASE_URL=postgres://..." -- /app/migrate
```

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
| `S3_ENDPOINT` | No | Custom S3 endpoint (MinIO) |
| `K8S_NAMESPACE` | No | Kubernetes namespace (default: `openmodelstudio`) |

## Scaling

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### GPU Nodes

For GPU-accelerated training, add a GPU node pool and label nodes:

```bash
kubectl label nodes gpu-node-1 accelerator=nvidia-a100
```

Training jobs can request GPU resources via their config.

## Monitoring

- **Prometheus** -- Metrics from API and training jobs
- **Grafana** -- Dashboards for system health and training progress
- **Loki** -- Log aggregation from all pods

## Backups

```bash
# PostgreSQL backup
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz

# Artifact storage backup
aws s3 sync s3://openmodelstudio-artifacts ./backups/artifacts/
```
