#!/usr/bin/env bash
set -e

PORT_FILE="${XDG_RUNTIME_DIR:-/tmp}/bore_tunnel_port"
PID_FILE="${XDG_RUNTIME_DIR:-/tmp}/bore_tunnel.pid"
LOG_TAG="bore-tunnel"

log() {
    logger -t "$LOG_TAG" "$1"
    echo "[$(date '+%H:%M:%S')] $1"
}

cleanup() {
    rm -f "$PID_FILE" "$LAST_PORT_FILE"
    log "Tunnel stopped"
}
trap cleanup EXIT

echo $$ > "$PID_FILE"
log "Starting Bore tunnel to bore.pub..."

NOTIFY_SCRIPT="$HOME/.local/bin/bore-notify.sh"
LAST_PORT_FILE="${XDG_RUNTIME_DIR:-/tmp}/bore_tunnel_last_port"

while true; do
    /home/pushpal/.local/bin/bore local 4000 --to bore.pub 2>&1 | while IFS= read -r line; do
        echo "$line"
        logger -t "$LOG_TAG" "$line"
        if [[ "$line" =~ listening\ at\ bore\.pub:([0-9]+) ]]; then
            PORT="${BASH_REMATCH[1]}"
            echo "$PORT" > "$PORT_FILE"
            echo "============================================"
            echo "TUNNEL ACTIVE: bore.pub:$PORT"
            echo "============================================"
            # Notify only if port changed since last notification
            LAST_PORT="$(cat "$LAST_PORT_FILE" 2>/dev/null || echo "")"
            if [ "$PORT" != "$LAST_PORT" ]; then
                echo "$PORT" > "$LAST_PORT_FILE"
                # Notify only on reconnect (when LAST_PORT had a previous value)
                # Initial connection notification is handled by the listener
                if [ -n "$LAST_PORT" ]; then
                    log "Port changed to $PORT — sending notification..."
                    NOTIFY_SCRIPT="$NOTIFY_SCRIPT" bash -c 'source "$0" "$@"' "$NOTIFY_SCRIPT" "$PORT" "bore.pub" "Bore" &
                fi
            fi
        fi
    done
    log "Bore exited unexpectedly, restarting in 3s..."
    sleep 3
done
