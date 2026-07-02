#!/bin/bash
# NEOTOKYO FM — Production mode (static build + serve)
# Use this instead of "npm run dev" for stability

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Building NEOTOKYO FM for production..."
cd "$SCRIPT_DIR/client"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
npm run build

echo "Starting production server on http://0.0.0.0:4173"
echo "API proxy: http://127.0.0.1:5050"
npx vite preview --host --port 4173
