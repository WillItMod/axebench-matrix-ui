#!/usr/bin/env bash
# Build AxeBench backend with Nuitka (Linux)
# Prerequisites: Python 3.11+, npm, venv tools
set -euo pipefail

OUTPUT_NAME="AxeBench_v3.0.0_BETA"

cd "$(dirname "$0")"

# Build frontend (served from dist/public)
npm run build

# Fresh build venv
rm -rf .venv-build
python -m venv .venv-build
source .venv-build/bin/activate

pip install -r python/requirements.txt
pip install nuitka

python -m nuitka \
  --onefile \
  --follow-imports \
  --output-filename="$OUTPUT_NAME" \
  --include-data-dir=dist/public=dist/public \
  --include-data-dir=python/templates=python/templates \
  --include-data-file=python/config.py=python/config.py \
  --output-dir=build-linux \
  python/launcher.py

echo
echo "Build complete: build-linux/${OUTPUT_NAME}"
