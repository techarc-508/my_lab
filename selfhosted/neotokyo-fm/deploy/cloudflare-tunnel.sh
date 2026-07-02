#!/bin/bash
# NEOTOKYO FM — Cloudflare Tunnel Setup
# Creates a secure Cloudflare Tunnel to expose NEOTOKYO FM publicly
# at https://radio.rplab.qzz.io (or your custom subdomain).
#
# Usage:
#   bash cloudflare-tunnel.sh [--domain radio.rplab.qzz.io]

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ─── Config ─────────────────────────────────────────────────────────
DOMAIN="${1:-radio.rplab.qzz.io}"
TUNNEL_NAME="neotokyo-fm"
LOCAL_SERVICE="http://localhost:80"
CLOUDFLARED_CONFIG="/root/.cloudflared/config.yml"

# ─── Root check ────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Run as root (sudo)"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║     NEOTOKYO FM — Cloudflare Tunnel          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── Install cloudflared ────────────────────────────────────────────
if ! command -v cloudflared &>/dev/null; then
    info "Installing cloudflared..."
    if command -v apt &>/dev/null; then
        curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
        dpkg -i /tmp/cloudflared.deb
        rm -f /tmp/cloudflared.deb
    else
        curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
        chmod +x /usr/local/bin/cloudflared
    fi
    log "cloudflared installed: $(cloudflared --version)"
else
    log "cloudflared already installed: $(cloudflared --version)"
fi

# ─── Login (interactive — opens browser) ────────────────────────────
if [[ ! -f /root/.cloudflared/cert.pem ]]; then
    info "Starting Cloudflare login..."
    echo ""
    echo -e "${YELLOW}→ A URL will open. Log in to Cloudflare and authorize.${NC}"
    echo -e "${YELLOW}→ If running headless, copy the URL into a browser on another machine.${NC}"
    echo ""
    cloudflared tunnel login
    log "Cloudflare authenticated."
else
    log "Already authenticated with Cloudflare."
fi

# ─── Create tunnel if not exists ────────────────────────────────────
if ! cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
    info "Creating tunnel: $TUNNEL_NAME..."
    cloudflared tunnel create "$TUNNEL_NAME"
    log "Tunnel '$TUNNEL_NAME' created."
else
    log "Tunnel '$TUNNEL_NAME' already exists."
fi

# ─── Get tunnel ID ──────────────────────────────────────────────────
TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
if [[ -z "$TUNNEL_ID" ]]; then
    TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $2}')
fi
if [[ -z "$TUNNEL_ID" ]]; then
    warn "Could not get tunnel ID. Checking files..."
    TUNNEL_ID=$(ls /root/.cloudflared/*.json 2>/dev/null | head -1 | xargs basename | sed 's/\.json//')
fi

if [[ -z "$TUNNEL_ID" ]]; then
    err "Failed to determine tunnel ID. Check: cloudflared tunnel list"
fi

# ─── Route DNS ──────────────────────────────────────────────────────
info "Routing $DOMAIN to tunnel..."
cloudflared tunnel route dns "$TUNNEL_ID" "$DOMAIN" 2>/dev/null || \
    cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>/dev/null || \
    warn "DNS routing may need manual setup in Cloudflare dashboard."
log "DNS routed: $DOMAIN → tunnel"

# ─── Write config.yml ───────────────────────────────────────────────
info "Writing tunnel configuration..."
mkdir -p /root/.cloudflared

cat > "$CLOUDFLARED_CONFIG" <<EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: $LOCAL_SERVICE
  - service: http_status:404
EOF

log "Configuration written to $CLOUDFLARED_CONFIG"

# ─── Install as systemd service ─────────────────────────────────────
info "Installing cloudflared systemd service..."
cloudflared service install 2>/dev/null || {
    # Manual service file
    cat > /etc/systemd/system/cloudflared-tunnel.service <<EOF
[Unit]
Description=Cloudflare Tunnel for NEOTOKYO FM
After=network.target

[Service]
Type=simple
ExecStart=$(which cloudflared) tunnel --config $CLOUDFLARED_CONFIG run $TUNNEL_ID
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
}

systemctl enable cloudflared 2>/dev/null || systemctl enable cloudflared-tunnel 2>/dev/null || true
systemctl restart cloudflared 2>/dev/null || systemctl restart cloudflared-tunnel 2>/dev/null || true
log "Cloudflare tunnel service started and enabled on boot."

# ─── Verify tunnel ──────────────────────────────────────────────────
sleep 3
if systemctl is-active cloudflared &>/dev/null || systemctl is-active cloudflared-tunnel &>/dev/null; then
    log "Tunnel is active!"
else
    warn "Tunnel service may not be running. Check: systemctl status cloudflared-tunnel"
fi

# ─── Output ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║    CLOUDFLARE TUNNEL — SETUP COMPLETE        ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  Public URL: https://$DOMAIN           "
echo "║                                              ║"
echo "║  Tunnel Name: $TUNNEL_NAME                   "
echo "║  Tunnel ID:   $TUNNEL_ID                     "
echo "║                                              ║"
echo "║  Manage: cloudflared tunnel list             ║"
echo "║  Logs:   journalctl -u cloudflared-tunnel -f ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
log "Your NEOTOKYO FM is now live at: https://$DOMAIN"
