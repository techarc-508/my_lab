#!/usr/bin/env bash
PORT_FILE="${XDG_RUNTIME_DIR:-/tmp}/bore_tunnel_port"
PID_FILE="${XDG_RUNTIME_DIR:-/tmp}/bore_tunnel.pid"
LAST_PORT_FILE="${XDG_RUNTIME_DIR:-/tmp}/bore_tunnel_last_port"
NOTIFY_CONF="$HOME/.config/bore-tunnel/notify.conf"

echo "╔══════════════════════════════════════╗"
echo "║     bore.pub Tunnel Status          ║"
echo "╚══════════════════════════════════════╝"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "  Tunnel:    RUNNING"
else
    echo "  Tunnel:    STOPPED"
fi

if [ -f "$PORT_FILE" ]; then
    PORT=$(cat "$PORT_FILE")
    echo "  Address:   bore.pub:$PORT"
    echo ""
    echo "  NoMachine connection settings:"
    echo "    Host:     bore.pub"
    echo "    Port:     $PORT"
    echo "    Protocol: NX"
else
    echo "  Address:   (waiting...)"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Notifications                    ║"
echo "╚══════════════════════════════════════╝"

if [ -f "$NOTIFY_CONF" ]; then
    source "$NOTIFY_CONF"
    [ -n "$NTFY_TOPIC" ] && echo "  ntfy.sh:   ON  (topic: $NTFY_TOPIC)"
    [ -z "$NTFY_TOPIC" ] && echo "  ntfy.sh:   OFF"
    [ -n "$TELEGRAM_BOT_TOKEN" ] && echo "  Telegram:  ON"
    [ -z "$TELEGRAM_BOT_TOKEN" ] && echo "  Telegram:  OFF"
else
    echo "  Not configured"
    echo "  Edit ~/.config/bore-tunnel/notify.conf"
fi

echo ""
echo "╔══════════════════════════════════════╗
║  Commands                          ║
╚══════════════════════════════════════╝
  Status:     bore-status.sh
  Logs:       journalctl --user -u bore-tunnel -f
  Config:     nano ~/.config/bore-tunnel/notify.conf
  ntfy feed:  https://ntfy.sh/${NTFY_TOPIC:-<topic>}
"
