#!/usr/bin/env bash
set -euo pipefail

# Path to the repo on the remote box
REPO_DIR="/root/AxeBench/v3.0.0/axebench-matrix-ui"

cd "$REPO_DIR"

echo "==> Pulling latest main"
git fetch origin
git pull origin main

echo "==> Building frontend"
cd client
npm install
npm run build
cd "$REPO_DIR"

echo "==> Restarting axebench.service"
sudo systemctl restart axebench.service
sudo systemctl status --no-pager axebench.service

echo "Done."
