#!/bin/bash
# NEOTOKYO FM — LXC Installer
# Runs inside the Proxmox LXC container. Installs Docker, pulls the release
# tarball, and starts the application.
#
# Usage:
#   bash install.sh [--tarball-url <URL>] [--source-dir <path>]
#
# --source-dir : Path to local project copy (including media). Use for migration.
# --tarball-url: URL to code-only tarball (default: GitHub release, ~373KB)

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

TARBALL_URL=""
SOURCE_DIR=""
INSTALL_DIR="/opt/neotokyo-fm"
MEDIA_URL=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tarball-url) TARBALL_URL="$2"; shift 2 ;;
        --source-dir)  SOURCE_DIR="$2"; shift 2 ;;
        --install-dir) INSTALL_DIR="$2"; shift 2 ;;
        --media-url)   MEDIA_URL="$2"; shift 2 ;;
        --help|-h) echo "Usage: $0 [--tarball-url <URL>] [--source-dir <path>] [--media-url <URL>]"; exit 0 ;;
        *) err "Unknown arg: $1" ;;
    esac
done

DEFAULT_TARBALL_URL="https://github.com/techarc-508/my_lab/releases/download/neotokyo-fm-v1/neotokyo-fm-code.tar.gz"
TARBALL_URL="${TARBALL_URL:-$DEFAULT_TARBALL_URL}"

[[ $EUID -eq 0 ]] || err "Run as root"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        NEOTOKYO FM — Container Installer     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── System deps ────────────────────────────────────────────────────
info "Installing system dependencies..."
if command -v apt &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq curl wget ca-certificates tar gzip rsync
elif command -v apk &>/dev/null; then
    apk add --no-cache curl wget ca-certificates tar gzip rsync
fi
log "System dependencies installed."

# ─── Docker ─────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    log "Docker installed."
fi
if ! docker compose version &>/dev/null; then
    apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
fi

# ─── Get application files ──────────────────────────────────────────
if [[ -n "$SOURCE_DIR" ]]; then
    # Local source (includes media)
    info "Copying project from $SOURCE_DIR..."
    mkdir -p "$INSTALL_DIR"
    rsync -a --delete \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.vite' \
        --exclude='server/logs' \
        "$SOURCE_DIR/" "$INSTALL_DIR/"
    log "Project copied from local source (includes media)."
elif ls "$INSTALL_DIR/server/downloads/"*.mp3 &>/dev/null 2>&1; then
    # Files already exist (pushed by proxmox-helper.sh with media)
    info "Project files already present (with media), skipping download."
else
    # Download code-only tarball
    info "Downloading NEOTOKYO FM (~373KB)..."
    mkdir -p "$INSTALL_DIR"
    curl -L "$TARBALL_URL" -o /tmp/neotokyo-fm.tar.gz
    tar xzf /tmp/neotokyo-fm.tar.gz -C "$INSTALL_DIR"
    rm -f /tmp/neotokyo-fm.tar.gz
    log "Code extracted."

    # Ensure downloads directory exists
    mkdir -p "$INSTALL_DIR/server/downloads/.metadata"

    # Optional media download
    if [[ -n "$MEDIA_URL" ]]; then
        info "Downloading media library..."
        curl -L "$MEDIA_URL" -o /tmp/neotokyo-media.tar.gz
        tar xzf /tmp/neotokyo-media.tar.gz -C "$INSTALL_DIR/server/downloads/"
        rm -f /tmp/neotokyo-media.tar.gz
        log "Media library extracted."
    else
        warn "No media source provided. Library will be empty."
        warn "Upload tracks via Admin panel or use --source-dir for migration."
    fi
fi

cd "$INSTALL_DIR"

# ─── .env ───────────────────────────────────────────────────────────
info "Generating secure .env..."
if [[ ! -f .env ]]; then
    cp .env.example .env 2>/dev/null || true
    ADMIN_PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(16))" 2>/dev/null || \
                 tr -dc A-Za-z0-9 < /dev/urandom | head -c 20)
    FLASK_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || \
                tr -dc a-f0-9 < /dev/urandom | head -c 64)
    sed -i "s/ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$ADMIN_PASS/" .env 2>/dev/null || true
    sed -i "s/FLASK_SECRET_KEY=.*/FLASK_SECRET_KEY=$FLASK_KEY/" .env 2>/dev/null || true
    echo "CORS_ORIGIN=http://localhost:80" >> .env
    echo "HOST=0.0.0.0" >> .env
    echo "PORT=5050" >> .env
    echo "$ADMIN_PASS" > /root/.neotokyo-admin-password
    log "Admin password saved to /root/.neotokyo-admin-password"
fi

# ─── Build & start ──────────────────────────────────────────────────
info "Building and starting NEOTOKYO FM..."
docker compose up --build -d

info "Waiting for application to become healthy..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:5050/api/health >/dev/null 2>&1; then
        log "Application is healthy!"
        break
    fi
    if [[ $i -eq 30 ]]; then
        warn "Health check timeout. Run: docker compose logs server"
    fi
    sleep 4
done

# ─── Output ─────────────────────────────────────────────────────────
ADMIN_PASS_SHOWN=$(cat /root/.neotokyo-admin-password 2>/dev/null || echo "<check .env>")
TRACK_COUNT=$(ls "$INSTALL_DIR/server/downloads/"*.mp3 2>/dev/null | wc -l || echo "0")
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║       NEOTOKYO FM — INSTALL COMPLETE         ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Local Access:                               ║"
echo "║  http://$(hostname -I 2>/dev/null | awk '{print $1}'):80   "
echo "║                                              ║"
echo "║  Tracks loaded: $TRACK_COUNT                 "
echo "║                                              ║"
echo "║  Admin Login:                                ║"
echo "║  URL:  http://$(hostname -I 2>/dev/null | awk '{print $1}'):80/admin"
echo "║  User: admin                                 "
echo "║  Pass: $ADMIN_PASS_SHOWN                     "
echo "║                                              ║"
echo "║  For public access, run:                     ║"
echo "║  bash $INSTALL_DIR/deploy/cloudflare-tunnel.sh"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
