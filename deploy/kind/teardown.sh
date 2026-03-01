#!/usr/bin/env bash
set -euo pipefail
echo "==> Deleting Kind cluster 'openmodelstudio'..."
kind delete cluster --name openmodelstudio
echo "✅ Cluster deleted."
