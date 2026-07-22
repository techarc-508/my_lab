#!/bin/bash
# NEOTOKYO FM — 1-Click Proxmox LXC/VM Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/<user>/mini_radio/main/scripts/install-proxmox.sh | bash
#
#   # Or with a local project copy (preserves full library):
#   bash install-proxmox.sh --source /path/to/mini_radio
#
#   # Or clone from git + restore media separately:
#   bash install-proxmox.sh --git https://github.com/<user>/mini_radio.git

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ─── Parse args ──────────────────────────────────────────────────
SOURCE=""
GIT_REPO=""
INSTALL_DIR="/opt/neotokyo-fm"
USE_DOCKER=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)    SOURCE="$2"; shift 2 ;;
    --git)       GIT_REPO="$2"; shift 2 ;;
    --dir)       INSTALL_DIR="$2"; shift 2 ;;
    --docker)    USE_DOCKER=true; shift ;;
    --help|-h)   echo "Usage: $0 [--source <path>] [--git <url>] [--dir <path>] [--docker]"; exit 0 ;;
    *)           err "Unknown arg: $1" ;;
  esac
done

# ─── Root check ───────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Run as root (sudo)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        NEOTOKYO FM — Proxmox Installer       ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Detect OS ────────────────────────────────────────────────────
if grep -qi "ubuntu\|debian" /etc/os-release 2>/dev/null; then
  PKG_MGR="apt"
elif grep -qi "alpine" /etc/os-release 2>/dev/null; then
  PKG_MGR="apk"
else
  err "Unsupported OS. Currently supports Ubuntu/Debian/Alpine."
fi

# ─── Install system deps ──────────────────────────────────────────
info "Installing system dependencies..."
case "$PKG_MGR" in
  apt)
    apt-get update -qq
    apt-get install -y -qq curl wget git python3 python3-pip python3-venv ffmpeg nodejs npm || {
      # Node.js might need nodesource on older distros
      if ! command -v node &>/dev/null; then
        warn "Node.js not found, installing via nodesource..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
      fi
    }
    ;;
  apk)
    apk add --no-cache python3 py3-pip ffmpeg nodejs npm git curl
    ;;
esac

log "System deps installed (Python $(python3 --version), Node $(node --version))"

# ─── Clone / copy project ────────────────────────────────────────
if [[ -n "$SOURCE" ]]; then
  info "Copying project from $SOURCE to $INSTALL_DIR..."
  rsync -a --delete "$SOURCE/" "$INSTALL_DIR/"
elif [[ -n "$GIT_REPO" ]]; then
  info "Cloning from $GIT_REPO..."
  git clone "$GIT_REPO" "$INSTALL_DIR"
else
  warn "No --source or --git provided. Cloning default repo..."
  git clone https://github.com/techarc-508/my_lab.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ─── Setup Grabber (Flask) ────────────────────────────────────────
info "Setting up Grabber (Flask backend)..."
cd grabbar/retro-music-player
python3 -m venv venv
source venv/bin/activate
pip install --quiet -r requirements.txt
deactivate
log "Grabber deps installed"

# ─── Setup Player (React) ─────────────────────────────────────────
info "Setting up Player (React frontend)..."
cd "$INSTALL_DIR/player/neotokyo-fm"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
log "Player deps installed"

# ─── Build Player for production ──────────────────────────────────
info "Building Player..."
npm run build
log "Player built"

# ─── Install as systemd services (if available) ───────────────────
cd "$INSTALL_DIR"
if command -v systemctl &>/dev/null; then
  info "Installing systemd services..."

  # Fix paths in service files to match INSTALL_DIR
  sed "s|/home/pushpal/Documents/mini_radio|$INSTALL_DIR|g" neotokyo-grabber.service > /etc/systemd/system/neotokyo-grabber.service
  sed "s|/home/pushpal/Documents/mini_radio|$INSTALL_DIR|g" neotokyo-player.service > /etc/systemd/system/neotokyo-player.service

  # Fix player ExecStart to serve from nginx/vite-preview instead of dev mode
  sed -i "s|ExecStart=.*|ExecStart=$INSTALL_DIR/start-prod.sh|" /etc/systemd/system/neotokyo-player.service

  systemctl daemon-reload
  systemctl enable neotokyo-grabber neotokyo-player
  systemctl start neotokyo-grabber neotokyo-player

  log "systemd services started"

  # ─── Status info ──────────────────────────────────────────────
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║       NEOTOKYO FM — INSTALL COMPLETE         ║"
  echo "╠══════════════════════════════════════════════╣"
  systemctl is-active neotokyo-grabber >/dev/null && echo "║  ✓ Grabber API : http://$(hostname -I | awk '{print $1}'):5050  ║" || echo "║  ✗ Grabber     : FAILED                         ║"
  systemctl is-active neotokyo-player >/dev/null && echo "║  ✓ Player UI   : http://$(hostname -I | awk '{print $1}'):4173  ║" || echo "║  ✗ Player      : FAILED                         ║"
  echo "╠──────────────────────────────────────────────╣"
  echo "║  Commands:                                    ║"
  echo "║  status : systemctl status neotokyo-grabber   ║"
  echo "║  logs   : journalctl -u neotokyo-grabber -f   ║"
  echo "║  stop   : systemctl stop neotokyo-grabber     ║"
  echo "╚══════════════════════════════════════════════╝"
else
  warn "systemd not available. Use the watchdog script instead:"
  warn "  cd $INSTALL_DIR && nohup bash start.sh &"
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║       NEOTOKYO FM — INSTALL COMPLETE         ║"
  echo "╠══════════════════════════════════════════════╣"
  echo "║  Start with:                                  ║"
  echo "║  ./start.sh                                   ║"
  echo "║                                              ║"
  echo "║  Player → http://localhost:3000               ║"
  echo "║  API    → http://localhost:5050               ║"
  echo "╚══════════════════════════════════════════════╝"
fi
