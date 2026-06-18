#!/usr/bin/env bash
set -e

URL_FILE="${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel_url"
PID_FILE="${XDG_RUNTIME_DIR:-/tmp}/pinggy_tunnel.pid"

echo "=== Pinggy Tunnel Status ==="

if [ -f "$PID_FILE" ] && [ -d "/proc/$(cat "$PID_FILE" 2>/dev/null)" ]; then
    echo "Status: running (PID: $(cat "$PID_FILE"))"
else
    echo "Status: not running"
fi

if [ -f "$URL_FILE" ]; then
    ADDRESS=$(cat "$URL_FILE")
    HOST="${ADDRESS%%:*}"
    PORT="${ADDRESS##*:}"
    echo "Endpoint: $ADDRESS"
    echo ""
    echo "NoMachine connection settings:"
    echo "  Host: $HOST"
    echo "  Port: $PORT"
    echo "  Protocol: NX"
else
    echo "Endpoint: not yet assigned"
fi

echo ""
echo "Systemd: $(systemctl --user is-active pinggy-tunnel.service 2>/dev/null || echo unknown)"
echo "Enabled: $(systemctl --user is-enabled pinggy-tunnel.service 2>/dev/null || echo unknown)"
