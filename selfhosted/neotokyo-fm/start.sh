#!/bin/bash
# NEOTOKYO FM — Watchdog: keeps both services alive, survives restarts/failures
# Usage:
#   ./start.sh              start both services in background
#   ./start.sh status       show running status
#   ./start.sh stop         stop both services
#   ./start.sh logs         tail logs
#   ./start.sh restart      full restart

SERVER_DIR="/mnt/data/projects/mini_radio/server"
CLIENT_DIR="/mnt/data/projects/mini_radio/client"
SERVER_LOG="/tmp/ntk-server.log"
CLIENT_LOG="/tmp/ntk-client.log"
SERVER_PIDFILE="/tmp/ntk-server.pid"
CLIENT_PIDFILE="/tmp/ntk-client.pid"

is_running() {
  [ -f "$1" ] && kill -0 $(cat "$1") 2>/dev/null
}

status() {
  echo "── NEOTOKYO FM  STATUS ──"
  if is_running "$SERVER_PIDFILE"; then
    echo "  ✓ Server   (PID $(cat $SERVER_PIDFILE)) → http://127.0.0.1:5050"
  else
    echo "  ✗ Server   — STOPPED"
  fi
  if is_running "$CLIENT_PIDFILE"; then
    echo "  ✓ Client   (PID $(cat $CLIENT_PIDFILE)) → http://localhost:3000"
  else
    echo "  ✗ Client   — STOPPED"
  fi
}

stop() {
  echo "Stopping services..."
  for pf in "$SERVER_PIDFILE" "$CLIENT_PIDFILE"; do
    if [ -f "$pf" ]; then
      kill $(cat "$pf") 2>/dev/null
      rm -f "$pf"
    fi
  done
  pkill -f "gunicorn" 2>/dev/null
  pkill -f "vite" 2>/dev/null
  sleep 1
  echo "  ✓ Stopped"
}

start_server() {
  while true; do
    cd "$SERVER_DIR"
    echo "[server] starting..." >> "$SERVER_LOG"
    nohup gunicorn -c gunicorn.conf.py app:create_app() >> "$SERVER_LOG" 2>&1 &
    echo $! > "$SERVER_PIDFILE"
    wait $! 2>/dev/null
    echo "[server] exited (restarting in 3s)" >> "$SERVER_LOG"
    sleep 3
  done
}

start_client() {
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  while true; do
    cd "$CLIENT_DIR"
    echo "[client] starting..." >> "$CLIENT_LOG"
    nohup npx vite --host >> "$CLIENT_LOG" 2>&1 &
    echo $! > "$CLIENT_PIDFILE"
    wait $! 2>/dev/null
    echo "[client] exited (restarting in 3s)" >> "$CLIENT_LOG"
    sleep 3
  done
}

case "${1:-start}" in
  start)
    stop 2>/dev/null
    > "$SERVER_LOG"
    > "$CLIENT_LOG"
    start_server &
    start_client &
    sleep 3
    status
    echo ""
    echo "  Client  → http://localhost:3000"
    echo "  API     → http://127.0.0.1:5050"
    echo "  Logs    → $SERVER_LOG  |  $CLIENT_LOG"
    echo "  (watchdog auto-restarts on crash)"
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    sleep 1
    exec "$0" start
    ;;
  status)
    status
    ;;
  logs)
    echo "── Server log ──"
    tail -20 "$SERVER_LOG"
    echo ""
    echo "── Client log ──"
    tail -20 "$CLIENT_LOG"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart|logs}"
    ;;
esac
