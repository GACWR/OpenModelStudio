#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="openmodelstudio"
TIMEOUT=300
INTERVAL=5
ELAPSED=0

echo "Waiting for all pods in $NAMESPACE to be ready (timeout: ${TIMEOUT}s)..."

while true; do
  # Exclude ephemeral workspace pods (oms-ws-*) and job pods (oms-job-*) from readiness checks
  NOT_READY=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -v '^oms-ws-\|^oms-job-' | grep -cv "Running\|Completed" || true)
  TOTAL=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -v '^oms-ws-\|^oms-job-' | wc -l | tr -d ' ')

  if [ "$TOTAL" -gt 0 ] && [ "$NOT_READY" -eq 0 ]; then
    # Double-check that all containers within each pod are ready (1/1 not 0/1)
    CONTAINERS_NOT_READY=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null | grep -v '^oms-ws-\|^oms-job-' | grep -c '0/' || true)
    if [ "$CONTAINERS_NOT_READY" -eq 0 ]; then
      echo "All $TOTAL pods are ready!"
      kubectl get pods -n "$NAMESPACE"
      exit 0
    fi
    NOT_READY=$CONTAINERS_NOT_READY
  fi

  if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "Timeout waiting for pods. Current status:"
    kubectl get pods -n "$NAMESPACE"
    exit 1
  fi

  echo "  $NOT_READY/$TOTAL pods not ready... (${ELAPSED}s elapsed)"
  sleep "$INTERVAL"
  ELAPSED=$((ELAPSED + INTERVAL))
done
