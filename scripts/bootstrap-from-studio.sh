#!/usr/bin/env bash
set -euo pipefail

SRC="/Users/g/Desktop/探索/studio"
DST="/Users/g/Desktop/探索/ZeoCanvasLite"

if [[ ! -d "$SRC" ]]; then
  echo "source directory not found: $SRC" >&2
  exit 1
fi

# Bootstrap lite baseline from studio while preserving local planning/reference docs.
rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'docs' \
  --exclude 'OpenClaw' \
  "$SRC/" "$DST/"
