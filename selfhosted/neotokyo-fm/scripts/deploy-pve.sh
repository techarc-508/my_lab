#!/bin/bash
# NEOTOKYO FM — PVE Deploy Script
# Deploys to a Proxmox LXC container, preserving .env and server state.
#
# Usage:
#   bash scripts/deploy-pve.sh <pve_host> <ct_id> <pve_password>

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

PVE_HOST="${1:?Usage: $0 <pve_host> <ct_id> <pve_password>}"
CT_ID="${2:?Missing container ID}"
PVE_PASS="${3:?Missing PVE password}"
INSTALL_DIR="/opt/neotokyo-fm"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

ssh_cmd() {
  sshpass -p "$PVE_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@$PVE_HOST" "$@"
}

pct_cmd() {
  sshpass -p "$PVE_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@$PVE_HOST" pct exec "$CT_ID" -- "$@"
}

log "Deploying to PVE ct-$CT_ID ($PVE_HOST)..."

# 1. Sync code
log "Syncing code..."
export SSHPASS="$PVE_PASS"
rsync -az --delete \
  --exclude='node_modules/' --exclude='dist/' --exclude='__pycache__/' \
  --exclude='.git/' --exclude='*.tar.gz' --exclude='xyx_builds/' \
  --exclude='media.tar.gz' --exclude='client/.vite/' --exclude='server/logs/' \
  --exclude='server/downloads/' --exclude='.env' \
  -e "sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10" \
  "$REPO_DIR/" "root@$PVE_HOST:/tmp/neotokyo-deploy/"
unset SSHPASS

# 2. Save .env + downloads before wipe
log "Saving state..."
ssh_cmd "pct exec $CT_ID -- mkdir -p /tmp/nt-backup"
ssh_cmd "pct exec $CT_ID -- cp $INSTALL_DIR/.env /tmp/nt-backup/.env 2>/dev/null || true"
ssh_cmd "pct exec $CT_ID -- bash -c 'if [ -d $INSTALL_DIR/server/downloads ]; then cp -a $INSTALL_DIR/server/downloads /tmp/nt-backup/downloads; fi'"

# 3. Package and push
log "Packaging..."
ssh_cmd "cd /tmp && tar czf neotokyo-deploy.tar.gz neotokyo-deploy/"
ssh_cmd "pct push $CT_ID /tmp/neotokyo-deploy.tar.gz /tmp/neotokyo-deploy.tar.gz"

# 4. Extract in container
log "Extracting in container..."
ssh_cmd "pct exec $CT_ID -- bash -c 'cd /opt && rm -rf neotokyo-fm && tar xzf /tmp/neotokyo-deploy.tar.gz && mv neotokyo-deploy neotokyo-fm && rm /tmp/neotokyo-deploy.tar.gz'"

# 5. Restore .env
log "Restoring .env..."
ssh_cmd "pct exec $CT_ID -- bash -c 'if [ -f /tmp/nt-backup/.env ]; then cp /tmp/nt-backup/.env $INSTALL_DIR/.env && echo restored; else SECRET=\$(python3 -c \"import uuid; print(uuid.uuid4().hex)\"); PASS=\$(python3 -c \"import uuid; print(uuid.uuid4().hex[:16])\"); printf \"ADMIN_PASSWORD=%s\nFLASK_SECRET_KEY=%s\n\" \"\$PASS\" \"\$SECRET\" > $INSTALL_DIR/.env && echo \"generated: \$PASS\"; fi'"

# 6. Restore downloads
log "Restoring downloads..."
ssh_cmd "pct exec $CT_ID -- bash -c 'if [ -d /tmp/nt-backup/downloads ]; then cp -a /tmp/nt-backup/downloads $INSTALL_DIR/server/ && echo restored; else echo no-backup; fi'"

# 7. Fix UID for appuser (uid 999)
log "Fixing permissions..."
ssh_cmd "pct exec $CT_ID -- chown -R 999:999 $INSTALL_DIR/server/downloads/ $INSTALL_DIR/server/playlists/ $INSTALL_DIR/server/logs/ $INSTALL_DIR/server/batch_history.db $INSTALL_DIR/server/radio_stations.json 2>/dev/null || true"

# 8. Rebuild and restart
log "Rebuilding containers..."
ssh_cmd "pct exec $CT_ID -- bash -c 'cd $INSTALL_DIR && docker compose down && docker compose up --build --force-recreate -d'"

# 9. Wait for healthy
log "Waiting for server health..."
for i in $(seq 1 30); do
  sleep 2
  STATUS=$(ssh_cmd "pct exec $CT_ID -- docker exec neotokyo-server curl -sf http://localhost:5050/api/health" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])" 2>/dev/null || true)
  if [ "$STATUS" = "ok" ]; then
    log "Server healthy!"
    break
  fi
  if [ $i -eq 30 ]; then err "Server did not become healthy in 60s"; fi
done

# 10. Cleanup
ssh_cmd "pct exec $CT_ID -- rm -rf /tmp/nt-backup" || true
ssh_cmd "rm -f /tmp/neotokyo-deploy.tar.gz /tmp/neotokyo-deploy -rf" || true

# 11. Print credentials
PASS=$(ssh_cmd "pct exec $CT_ID -- grep ADMIN_PASSWORD $INSTALL_DIR/.env | cut -d= -f2")
log "Deploy complete!"
echo ""
echo "  URL:  http://$CT_ID:80 (or your tunnel URL)"
echo "  User: admin"
echo "  Pass: $PASS"
