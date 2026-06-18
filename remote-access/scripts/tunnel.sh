#!/usr/bin/env bash
set -e

SCRIPT_NAME="$(basename "$0")"
BORE_SERVICE="bore-tunnel.service"
PINGGY_SERVICE="pinggy-tunnel.service"
BORE_PORT_FILE="${XDG_RUNTIME_DIR:-/tmp}/bore_tunnel_port"
PINGGY_URL_FILE="${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel_url"

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

cmd_status() {
    echo "╔══════════════════════════════════════════════╗"
    echo "║         Tunnel Status Report                ║"
    echo "╚══════════════════════════════════════════════╝"
    echo ""

    # Bore
    bore_active="$(systemctl --user is-active "$BORE_SERVICE" 2>/dev/null || echo inactive)"
    if [ "$bore_active" = "active" ]; then
        port="$(cat "$BORE_PORT_FILE" 2>/dev/null || echo "awaiting...")"
        printf "  %-10s %s\n" "🖥️ Bore:" "RUNNING — bore.pub:$port (no expiry)"
    else
        printf "  %-10s %s\n" "🖥️ Bore:" "STOPPED (send \"bore\" via ntfy)"
    fi

    # Pinggy
    pinggy_active="$(systemctl --user is-active "$PINGGY_SERVICE" 2>/dev/null || echo inactive)"
    if [ "$pinggy_active" = "active" ]; then
        addr="$(cat "$PINGGY_URL_FILE" 2>/dev/null || echo "awaiting...")"
        printf "  %-10s %s\n" "🔥 Pinggy:" "RUNNING — $addr (expires 60min)"
    else
        printf "  %-10s %s\n" "🔥 Pinggy:" "STOPPED (send \"fast\" via ntfy)"
    fi

    echo ""
    echo "  Listener: $(systemctl --user is-active ntfy-cmd-listener.service 2>/dev/null || echo unknown)"
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║  Local usage                                 ║"
    echo "╚══════════════════════════════════════════════╝"
    echo "  $SCRIPT_NAME status  — show this report"
    echo "  $SCRIPT_NAME logs    — follow all tunnel logs"
    echo ""
    echo "  ntfy commands (topic: pushpal-cmd):"
    echo "    fast   — start Pinggy"
    echo "    bore   — start Bore"
    echo "    stop   — stop all"
    echo "    status — report all"
    echo "    help   — show commands"
}

cmd_logs() {
    echo "=== Bore logs ==="
    journalctl --user -u "$BORE_SERVICE" -n 5 --no-pager -q 2>/dev/null || echo "(no logs)"
    echo ""
    echo "=== Pinggy logs ==="
    journalctl --user -u "$PINGGY_SERVICE" -n 5 --no-pager -q 2>/dev/null || echo "(no logs)"
    echo ""
    echo "=== Listener logs ==="
    journalctl --user -u ntfy-cmd-listener.service -n 5 --no-pager -q 2>/dev/null || echo "(no logs)"
}

case "${1:-status}" in
    status|st)
        cmd_status
        ;;
    logs|log)
        cmd_logs
        ;;
    *)
        echo "Usage: $SCRIPT_NAME {status|logs}"
        exit 1
        ;;
esac
