#!/usr/bin/env bash
# Called by tunnel scripts when endpoint changes.
# Sends formatted notifications via ntfy.sh and/or Telegram.
# Usage: $0 <port> <host> [service_name]
#   service_name: "Bore" (default) or "Pinggy"

set -e

CONF="$HOME/.config/bore-tunnel/notify.conf"
PORT="${1:-}"
HOST="${2:-}"
SERVICE="${3:-Bore}"
ADDRESS="$HOST:$PORT"
[ -z "$PORT" ] && { echo "Usage: $0 <port> <host> [service]"; exit 1; }

[ -f "$CONF" ] && source "$CONF"

LOG_TAG="tunnel-notify"

log() {
    logger -t "$LOG_TAG" "$1"
    echo "[$(date '+%H:%M:%S')] $1"
}

# ---- Service-specific formatting ----
if [ "$SERVICE" = "Pinggy" ]; then
    EMOJI="🔄"
    NTFY_TITLE="🔄 Pinggy Renewed"
    NTFY_TAGS="bot,fire,computer"
    NTFY_PRIORITY="urgent"
    BODY_INTRO="Low-latency tunnel (Pinggy) reconnected"
    BODY_FOOTER="Send \"status\" to check"
elif [ "$SERVICE" = "Bore" ]; then
    EMOJI="🖥️"
    NTFY_TITLE="🖥️ Bore Tunnel Active"
    NTFY_TAGS="bot,computer"
    NTFY_PRIORITY="high"
    BODY_INTRO="Stable tunnel (bore.pub) active"
    BODY_FOOTER="No expiry — always on"
else
    EMOJI="🚀"
    NTFY_TITLE="🚀 Tunnel Updated"
    NTFY_TAGS="bot,computer"
    NTFY_PRIORITY="high"
    BODY_INTRO="Tunnel active"
    BODY_FOOTER=""
fi

# ---- Pinggy countdown ----
COUNTDOWN=""
if [ "$SERVICE" = "Pinggy" ]; then
    START_FILE="${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel_start"
    if [ -f "$START_FILE" ]; then
        NOW=$(date +%s)
        START=$(cat "$START_FILE")
        ELAPSED=$((NOW - START))
        REMAINING=$((3600 - ELAPSED))
        if [ "$REMAINING" -gt 0 ]; then
            MINS=$((REMAINING / 60))
            HOURS=$((MINS / 60))
            MIN_REM=$((MINS % 60))
            if [ "$HOURS" -gt 0 ]; then
                COUNTDOWN="${HOURS}h ${MIN_REM}m left"
            else
                COUNTDOWN="${MINS}m left"
            fi
            AT=$(date -d "@$((START + 3600))" '+%H:%M' 2>/dev/null || true)
            [ -n "$AT" ] && COUNTDOWN="$COUNTDOWN (until $AT)"
        else
            COUNTDOWN="expiring now"
        fi
    fi
fi

notify_ntfy() {
    local topic="${NTFY_CMD_TOPIC:-}"
    local server="${NTFY_SERVER:-https://ntfy.sh}"
    [ -z "$topic" ] && return 0

    local msg="$EMOJI $BODY_INTRO
Address: $ADDRESS
Time:    $(date '+%Y-%m-%d %H:%M:%S')"
    [ -n "$COUNTDOWN" ] && msg="$msg
⏱ $COUNTDOWN"
    msg="$msg

NoMachine connection settings:
  Host: $HOST
  Port: $PORT
  Protocol: NX

$BODY_FOOTER"

    if curl -sf -X POST "$server/$topic" \
        -H "Title: $NTFY_TITLE" \
        -H "Priority: $NTFY_PRIORITY" \
        -H "Tags: $NTFY_TAGS" \
        -d "$msg" >/dev/null 2>&1; then
        log "ntfy.sh notification sent ($SERVICE)"
    else
        log "WARNING: ntfy.sh notification failed"
    fi
}

notify_telegram() {
    local token="${TELEGRAM_BOT_TOKEN:-}"
    local chat_id="${TELEGRAM_CHAT_ID:-}"
    [ -z "$token" ] || [ -z "$chat_id" ] && return 0

    # Telegram is blocked by ISP (Alliance Broadband) — skip fast
    timeout 3 bash -c "echo > /dev/tcp/api.telegram.org/443" 2>/dev/null || {
        log "Telegram skipped (ISP block)"
        return 0
    }

    local msg="$EMOJI $BODY_INTRO
Address: <code>$ADDRESS</code>
Time:    $(date '+%Y-%m-%d %H:%M:%S')"
    [ -n "$COUNTDOWN" ] && msg="$msg
⏱ $COUNTDOWN"
    msg="$msg

NoMachine connection settings:
  Host: <code>$HOST</code>
  Port: <code>$PORT</code>
  Protocol: NX

$BODY_FOOTER"

    local api_url="https://api.telegram.org/bot${token}/sendMessage"
    if curl -sf --max-time 10 -X POST "$api_url" \
        -d "chat_id=$chat_id" \
        -d "parse_mode=HTML" \
        -d "text=$msg" >/dev/null 2>&1; then
        log "Telegram notification sent ($SERVICE)"
    else
        log "WARNING: Telegram notification failed"
    fi
}

notify_ntfy
notify_telegram
