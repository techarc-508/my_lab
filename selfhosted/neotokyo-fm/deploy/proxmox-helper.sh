#!/bin/bash
# NEOTOKYO FM — Proxmox 1-Click Helper
# Run this on your Proxmox VE host to create an LXC container and deploy NEOTOKYO FM.
#
# Usage:
#   # Fresh install (empty library, code only):
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/techarc-508/my_lab/main/selfhosted/neotokyo-fm/deploy/proxmox-helper.sh)"
#
#   # Migrate with existing media (RECOMMENDED):
#   # First copy the project to the Proxmox host, then:
#   bash proxmox-helper.sh --source /path/to/neotokyo-fm
#
#   # Customize resource allocation:
#   VMID=201 MEMORY=4096 CORES=4 DISK_SIZE=50 bash proxmox-helper.sh

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

SOURCE_DIR=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source) SOURCE_DIR="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: bash proxmox-helper.sh [--source /path/to/project]"
            echo ""
            echo "  --source /path   Copy local project (with media) into container"
            echo "                   Use this for migration with all 266 tracks"
            echo "  (no flags)       Download code from GitHub, library starts empty"
            exit 0 ;;
        *) err "Unknown arg: $1. Use --help for usage." ;;
    esac
done

STORAGE="${STORAGE:-local-lvm}"
TEMPLATE="${TEMPLATE:-ubuntu-24.04-standard_24.04-2_amd64.tar.zst}"
VMID="${VMID:-}"
HOSTNAME="${HOSTNAME:-neotokyo-fm}"
MEMORY="${MEMORY:-2048}"
SWAP="${SWAP:-512}"
CORES="${CORES:-2}"
DISK_SIZE="${DISK_SIZE:-20}"
BRIDGE="${BRIDGE:-vmbr0}"
RAW_BASE="https://raw.githubusercontent.com/techarc-508/my_lab/main/selfhosted/neotokyo-fm"
INSTALL_DIR="/opt/neotokyo-fm"

[[ $EUID -eq 0 ]] || err "Run as root (sudo su -)"
command -v pct &>/dev/null || err "pct not found. Are you on a Proxmox host?"
command -v pveam &>/dev/null || err "pveam not found. Are you on a Proxmox host?"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     NEOTOKYO FM — Proxmox 1-Click Installer  ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Pick VMID ──────────────────────────────────────────────────────
VMID=$(pvesh get /cluster/nextid 2>/dev/null || echo "200")
info "Using VM ID: $VMID"

# ─── Template ────────────────────────────────────────────────────────
TEMPLATE_PATH=$(pveam list "$STORAGE" 2>/dev/null | grep "$TEMPLATE" | head -1 | awk '{print $2}' || true)
if [[ -z "$TEMPLATE_PATH" ]]; then
    info "Downloading LXC template $TEMPLATE..."
    pveam download "$STORAGE" "$TEMPLATE" || err "Failed to download template"
    TEMPLATE_PATH="$STORAGE:vztmpl/$TEMPLATE"
fi

# ─── Create container ────────────────────────────────────────────────
pct create "$VMID" "$TEMPLATE_PATH" \
    --hostname "$HOSTNAME" \
    --storage "$STORAGE" \
    --memory "$MEMORY" \
    --swap "$SWAP" \
    --cores "$CORES" \
    --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
    --unprivileged 1 \
    --features "nesting=1" \
    --rootfs "$STORAGE:${DISK_SIZE}" || err "Container creation failed."

log "Container $VMID created."

# ─── Start & wait ────────────────────────────────────────────────────
pct start "$VMID" || true
info "Waiting for container to boot..."
for i in $(seq 1 30); do
    if pct exec "$VMID" -- hostname &>/dev/null 2>&1; then
        log "Container ready."
        break
    fi
    sleep 2
done

# ─── Install base deps ───────────────────────────────────────────────
pct exec "$VMID" -- bash -c "apt-get update -qq && apt-get install -y -qq curl systemd ca-certificates" || true

if [[ -n "$SOURCE_DIR" ]]; then
    # ── WITH MEDIA: push entire project into container ────────────────
    info "Pushing project (with media) into container..."
    # Use rsync over pct push for efficiency
    pct exec "$VMID" -- mkdir -p "$INSTALL_DIR"

    # Push the install script first
    pct push "$VMID" "$(dirname "$0")/install.sh" /tmp/install.sh 2>/dev/null || \
        pct exec "$VMID" -- curl -fsSL "$RAW_BASE/deploy/install.sh" > /tmp/install.sh

    # Rsync the entire project (excluding .git, node_modules etc.)
    pct exec "$VMID" -- apt-get install -y -qq rsync
    rsync -a --delete \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.vite' \
        --exclude='server/logs' \
        --exclude='server/.flask_secret_key' \
        -e "pct exec $VMID --" \
        "$SOURCE_DIR/" "$INSTALL_DIR/" 2>/dev/null || {
        # Fallback: tar + pct push
        info "Rsync failed, using tar fallback..."
        cd "$SOURCE_DIR"
        tar czf /tmp/_neotokyo_push.tar.gz \
            --exclude='.git' --exclude='node_modules' --exclude='venv' \
            --exclude='__pycache__' --exclude='*.pyc' --exclude='.vite' \
            --exclude='server/logs' --exclude='server/.flask_secret_key' \
            .
        pct push "$VMID" /tmp/_neotokyo_push.tar.gz /tmp/_neotokyo_push.tar.gz
        pct exec "$VMID" -- tar xzf /tmp/_neotokyo_push.tar.gz -C "$INSTALL_DIR"
        pct exec "$VMID" -- rm -f /tmp/_neotokyo_push.tar.gz
        rm -f /tmp/_neotokyo_push.tar.gz
    }

    log "Project pushed with media."

    # Run install.sh with --source-dir pointing to the pushed project
    pct exec "$VMID" -- bash /tmp/install.sh --install-dir "$INSTALL_DIR" || \
        warn "install.sh had issues. Check: pct enter $VMID"
else
    # ── WITHOUT MEDIA: download code from GitHub ──────────────────────
    info "Running installer (code-only from GitHub)..."
    pct exec "$VMID" -- bash -c "
        curl -fsSL $RAW_BASE/deploy/install.sh > /tmp/install.sh
        chmod +x /tmp/install.sh
        bash /tmp/install.sh
    " || warn "install.sh had issues. Check container logs."
fi

# ─── Wait for app ────────────────────────────────────────────────────
info "Waiting for application to start..."
for i in $(seq 1 20); do
    if pct exec "$VMID" -- curl -sf http://localhost:5050/api/health &>/dev/null; then
        log "Application is running!"
        break
    fi
    sleep 3
done

# ─── Get IP ──────────────────────────────────────────────────────────
CONTAINER_IP=$(pct exec "$VMID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo "DHCP")

# ─── Check track count ───────────────────────────────────────────────
TRACK_COUNT=$(pct exec "$VMID" -- ls "$INSTALL_DIR/server/downloads/"*.mp3 2>/dev/null | wc -l || echo "0")

# ─── Output ───────────────────────────────────────────────────────────
ADMIN_PASS=$(pct exec "$VMID" -- cat /root/.neotokyo-admin-password 2>/dev/null || echo "<check .env>")
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     NEOTOKYO FM — DEPLOYMENT COMPLETE        ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Container ID : $VMID                        "
echo "║  IP Address   : $CONTAINER_IP                "
echo "║  Tracks       : $TRACK_COUNT                 "
echo "║                                              ║"
echo "║  Access: http://${CONTAINER_IP}:80           "
echo "║  Admin:  http://${CONTAINER_IP}:80/admin     "
echo "║  User:   admin                               "
echo "║  Pass:   $ADMIN_PASS                         "
echo "║                                              ║"
echo "║  Manage:                                      ║"
echo "║  pct enter $VMID                              "
echo "║  pct stop $VMID                               "
echo "║  pct start $VMID                              "
echo "║                                              ║"
echo "║  Public access:                               ║"
echo "║  pct exec $VMID -- bash $INSTALL_DIR/deploy/cloudflare-tunnel.sh"
echo "║  → https://radio.rplab.qzz.io                 "
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
