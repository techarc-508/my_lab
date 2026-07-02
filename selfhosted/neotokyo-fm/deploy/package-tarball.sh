#!/bin/bash
# NEOTOKYO FM — Release Tarball Packager
# Packages the entire project (including media) into a compressed tarball
# for simplified one-click deployment.
#
# Usage:
#   bash package-tarball.sh [--output /tmp/neotokyo-fm-complete.tar.gz]

set -euo pipefail

OUTPUT="${1:-/tmp/neotokyo-fm-complete.tar.gz}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Packaging NEOTOKYO FM from: $PROJECT_DIR"
echo "Output: $OUTPUT"
echo ""

# Estimated size
echo "Project size: $(du -sh "$PROJECT_DIR/server/downloads" 2>/dev/null | cut -f1) (media)"
echo ""

cd "$PROJECT_DIR"

# Create tarball excluding dev/unnecessary directories
tar czf "$OUTPUT" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.vite' \
    --exclude='server/logs' \
    --exclude='server/.flask_secret_key' \
    .

echo ""
echo "✓ Tarball created: $OUTPUT"
echo "  Size: $(du -h "$OUTPUT" | cut -f1)"
echo ""
