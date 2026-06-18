#!/usr/bin/env bash
set -e

URL_FILE="${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel_url"
PID_FILE="${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel.pid"
LOG_TAG="pinggy-tunnel"

log() {
    logger -t "$LOG_TAG" "$1"
    echo "[$(date '+%H:%M:%S')] $1"
}

cleanup() {
    rm -f "$PID_FILE"
    log "Tunnel stopped"
}
trap cleanup EXIT

echo $$ > "$PID_FILE"
log "Starting Pinggy tunnel for NoMachine..."

NOTIFY_SCRIPT="$HOME/.local/bin/bore-notify.sh"
LAST_URL_FILE="${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel_last_url"

while true; do
    ssh -p 443 -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
        -R 0:localhost:4000 tcp@a.pinggy.io 2>&1 | while IFS= read -r line; do
        echo "$line"
        logger -t "$LOG_TAG" "$line"
        if [[ "$line" =~ tcp://([^:]+):([0-9]+) ]]; then
            HOST="${BASH_REMATCH[1]}"
            PORT="${BASH_REMATCH[2]}"
            ADDRESS="$HOST:$PORT"
            echo "$ADDRESS" > "$URL_FILE"
            echo "============================================"
            echo "TUNNEL ACTIVE: $ADDRESS"
            echo "============================================"
            LAST_URL="$(cat "$LAST_URL_FILE" 2>/dev/null || echo "")"
            if [ "$ADDRESS" != "$LAST_URL" ]; then
                echo "$ADDRESS" > "$LAST_URL_FILE"
                # Record start timestamp for countdown (resets on each reconnect)
                date +%s > "${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel_start"
                log "Endpoint changed to $ADDRESS — sending notification..."
                NOTIFY_SCRIPT="$NOTIFY_SCRIPT" bash -c 'source "$0" "$@"' "$NOTIFY_SCRIPT" "$PORT" "$HOST" "Pinggy" &
            fi
        fi
    done
    log "Pinggy exited unexpectedly, restarting in 3s..."
    sleep 3
done
