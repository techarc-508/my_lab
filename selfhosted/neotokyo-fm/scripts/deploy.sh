#!/bin/bash
# NEOTOKYO FM — Universal Deploy Script
# One command to get up and running anywhere.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<user>/mini_radio/main/scripts/deploy.sh | bash
#   bash scripts/deploy.sh [--docker|--native|--codespaces]

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

MODE="auto"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker|--native|--codespaces) MODE="${1#--}"; shift ;;
    --help|-h) echo "Usage: $0 [--docker|--native|--codespaces]"; exit 0 ;;
    *) err "Unknown arg: $1" ;;
  esac
done

# ─── Auto-detect mode ────────────────────────────────────────────
if [[ "$MODE" == "auto" ]]; then
  if [[ -n "$CODESPACES" ]]; then
    MODE="codespaces"
  elif command -v docker &>/dev/null && command -v docker compose &>/dev/null; then
    MODE="docker"
  else
    MODE="native"
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        NEOTOKYO FM — Universal Deploy        ║"
echo "║        Mode: $MODE                              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Mode: Docker ────────────────────────────────────────────────
if [[ "$MODE" == "docker" ]]; then
  info "Deploying with Docker Compose..."
  cd "$REPO_DIR"
  cp -n .env.example .env 2>/dev/null || warn ".env already exists, skipping"
  docker compose up --build -d
  log "Services started"
  echo ""
  echo "  Player → http://localhost:80"
  echo "  API    → http://localhost:5050"
  echo ""
  docker compose logs --tail=10
  exit 0
fi

# ─── Mode: Codespaces ────────────────────────────────────────────
if [[ "$MODE" == "codespaces" ]]; then
  info "Deploying in GitHub Codespaces..."
  cd "$REPO_DIR"
  bash .devcontainer/setup.sh
  info "Starting services..."
  cd server
  nohup gunicorn -c gunicorn.conf.py app:create_app() > /tmp/ntk-server.log 2>&1 &
  SERVER_PID=$!
  cd "$REPO_DIR/client"
  nohup npm run dev -- --host > /tmp/ntk-client.log 2>&1 &
  CLIENT_PID=$!
  sleep 3
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║  NEOTOKYO FM running in Codespaces!          ║"
  echo "╠══════════════════════════════════════════════╣"
  echo "║  Server (PID $SERVER_PID)                       ║"
  echo "║  Client (PID $CLIENT_PID)                      ║"
  echo "║                                              ║"
  echo "║  Use the 'Ports' tab in VS Code to access:   ║"
  echo "║  - Client on port 3000                       ║"
  echo "║  - API on port 5050                          ║"
  echo "╚══════════════════════════════════════════════╝"
  exit 0
fi

# ─── Mode: Native (systemd or watchdog) ──────────────────────────
if [[ "$MODE" == "native" ]]; then
  info "Deploying natively..."
  cd "$REPO_DIR"

  # Install system deps
  if command -v apt &>/dev/null; then
    info "Installing system dependencies..."
    apt-get update -qq && apt-get install -y -qq python3 python3-pip python3-venv ffmpeg curl 2>/dev/null || true
  fi

  if ! command -v node &>/dev/null; then
    warn "Node.js not found. Install it or use Docker mode."
    warn "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs"
    warn "  Or install via nvm: https://github.com/nvm-sh/nvm"
  fi

  # Setup server
  info "Setting up Server..."
  cd server
  python3 -m venv venv 2>/dev/null || true
  source venv/bin/activate 2>/dev/null || true
  pip install --quiet -r requirements.txt
  deactivate 2>/dev/null || true

  # Setup client
  info "Setting up Client..."
  cd "$REPO_DIR/client"
  npm install 2>/dev/null || true

  # Try systemd
  if command -v systemctl &>/dev/null; then
    info "Installing systemd services..."
    cd "$REPO_DIR"
    sed "s|/mnt/data/projects/mini_radio|$REPO_DIR|g" neotokyo-grabber.service | tee /etc/systemd/system/neotokyo-grabber.service >/dev/null
    cp neotokyo-player.service /etc/systemd/system/neotokyo-player.service
    systemctl daemon-reload
    systemctl enable neotokyo-grabber neotokyo-player 2>/dev/null || true
    systemctl restart neotokyo-grabber neotokyo-player 2>/dev/null || true
    log "systemd services started"
  else
    info "Using watchdog script..."
    cd "$REPO_DIR"
    nohup bash start.sh > /tmp/ntk-watchdog.log 2>&1 &
    log "Watchdog started (PID $!)"
  fi

  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║       NEOTOKYO FM — INSTALL COMPLETE         ║"
  echo "╚══════════════════════════════════════════════╝"
  echo "  Client → http://localhost:3000"
  echo "  API    → http://localhost:5050"
  echo "  Logs   → /tmp/ntk-server.log / /tmp/ntk-client.log"
  echo ""
  exit 0
fi
