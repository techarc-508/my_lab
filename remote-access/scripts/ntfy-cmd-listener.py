#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time

CONF_FILE = os.path.expanduser("~/.config/bore-tunnel/notify.conf")
LOG_TAG = "ntfy-cmd"
CACHE_DIR = os.path.expanduser("~/.cache/ntfy-cmd")
os.makedirs(CACHE_DIR, exist_ok=True)
STATE_FILE = f"{CACHE_DIR}/last_msg_id"
PID_FILE = f"{os.environ.get('XDG_RUNTIME_DIR', '/tmp')}/ntfy_cmd_listener.pid"

NTFY_CMD_TOPIC = "pushpal-cmd"
if os.path.exists(CONF_FILE):
    with open(CONF_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                v = v.strip('"').strip("'")
                if k == "NTFY_CMD_TOPIC":
                    NTFY_CMD_TOPIC = v


def log(msg):
    subprocess.run(["logger", "-t", LOG_TAG, msg], check=False)
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _ntfy_post(topic, title, message, tags, priority):
    subprocess.run(
        [
            "curl", "-sf", "-X", "POST", f"https://ntfy.sh/{topic}",
            "-H", f"Title: {title}",
            "-H", f"Priority: {priority}",
            "-H", f"Tags: {tags}",
            "-d", message,
            "--max-time", "10",
        ],
        check=False, timeout=15,
        capture_output=True,
    )
    log(f"Notification sent to {topic}: {title}")


def ntfy_reply(title, message, tags="computer", priority="high"):
    """Reply to the command topic (pushpal-cmd) so user sees it on same page.
    Adds 'bot' tag to prevent feedback loop when listener reads its own messages.
    """
    _ntfy_post(NTFY_CMD_TOPIC, title, message, f"bot,{tags}", priority)


def ntfy_send_cmd_error(title, message, tags="question", priority="default"):
    """Send error/unknown command to command topic (also tagged as bot)."""
    _ntfy_post(NTFY_CMD_TOPIC, title, message, f"bot,{tags}", priority)


def get_last_id():
    try:
        with open(STATE_FILE) as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0"


def save_last_id(msg_id):
    with open(STATE_FILE, "w") as f:
        f.write(str(msg_id))


PINGGY_TIMEOUT = 3600  # 60 minutes


def _read_pinggy_start():
    path = f"{os.environ.get('XDG_RUNTIME_DIR', '/tmp')}/pinggy_tunnel_start"
    try:
        with open(path) as f:
            return int(f.read().strip())
    except (FileNotFoundError, ValueError):
        return None


def _remaining_pinggy_str():
    start = _read_pinggy_start()
    if start is None:
        return None
    elapsed = time.time() - start
    remaining = PINGGY_TIMEOUT - elapsed
    if remaining <= 0:
        return "expiring now"
    mins = int(remaining // 60)
    if mins >= 60:
        return f"{mins // 60}h {mins % 60}m left"
    return f"{mins}m left"


def _expiry_at_str():
    start = _read_pinggy_start()
    if start is None:
        return None
    t = time.localtime(start + PINGGY_TIMEOUT)
    return time.strftime("%H:%M", t)


def read_url_file():
    path = f"{os.environ.get('XDG_RUNTIME_DIR', '/tmp')}/pinggy_tunnel_url"
    try:
        with open(path) as f:
            return f.read().strip()
    except FileNotFoundError:
        return None


def read_bore_port():
    path = f"{os.environ.get('XDG_RUNTIME_DIR', '/tmp')}/bore_tunnel_port"
    try:
        with open(path) as f:
            return f.read().strip()
    except FileNotFoundError:
        return None


def is_service_active(name):
    r = subprocess.run(["systemctl", "--user", "is-active", name],
                       capture_output=True, text=True, check=False, timeout=10)
    return r.stdout.strip() == "active"


def _wait_for_bore_port(timeout=20):
    """Poll for bore port file up to `timeout` seconds."""
    path = f"{os.environ.get('XDG_RUNTIME_DIR', '/tmp')}/bore_tunnel_port"
    for _ in range(timeout):
        try:
            with open(path) as f:
                val = f.read().strip()
            if val:
                return val
        except FileNotFoundError:
            pass
        time.sleep(1)
    return None


def _wait_for_pinggy_url(timeout=20):
    """Poll for pinggy URL file up to `timeout` seconds."""
    path = f"{os.environ.get('XDG_RUNTIME_DIR', '/tmp')}/pinggy_tunnel_url"
    for _ in range(timeout):
        try:
            with open(path) as f:
                val = f.read().strip()
            if val:
                return val
        except FileNotFoundError:
            pass
        time.sleep(1)
    return None


def _stop_service(name):
    """Stop a systemd user service if active."""
    if is_service_active(name):
        subprocess.run(["systemctl", "--user", "stop", name], check=False, timeout=30)
        time.sleep(2)
        return True
    return False


def handle_command(cmd):
    cmd = cmd.strip().lower()
    log(f"Command: {cmd}")

    if cmd in ("fast", "on", "start", "pinggy", "1"):
        if is_service_active("pinggy-tunnel.service"):
            addr = read_url_file() or "connecting..."
            rem = _remaining_pinggy_str()
            line = f"Already running\n{addr}"
            if rem:
                line += f"\n⏱ {rem}"
            ntfy_reply("🔥 Pinggy ON", line, "fire,computer", "high")
            log("Already running")
            return

        log("Starting Pinggy...")
        subprocess.run(["systemctl", "--user", "start", "pinggy-tunnel.service"], check=False, timeout=30)
        addr = _wait_for_pinggy_url()
        if addr and ":" in addr:
            host, port = addr.split(":", 1)
            rem = _remaining_pinggy_str() or "~60m"
            at = _expiry_at_str() or "~60 min"
            ntfy_reply(
                "🔥 Pinggy ON — Ready!",
                f"Address: {host}:{port}\n⏱ {rem} (until {at})\n\nNoMachine: {host}:{port}  Protocol: NX",
                "fire,computer", "urgent",
            )
            log(f"Active: {addr}")
        else:
            ntfy_reply("⚠️ Pinggy Failed", "No endpoint yet", "warning", "high")

    elif cmd in ("stop", "off", "0"):
        stopped_pinggy = _stop_service("pinggy-tunnel.service")
        stopped_bore = _stop_service("bore-tunnel.service")
        parts = []
        if stopped_pinggy:
            parts.append("Pinggy stopped")
        if stopped_bore:
            parts.append("Bore stopped")
        if not parts:
            ntfy_reply("⏹️ All OFF", "Nothing was running", "no_entry", "default")
        else:
            ntfy_reply("⏹️ Stopped", "\n".join(parts), "no_entry", "default")
        log("Stop: " + ", ".join(parts) if parts else "nothing running")

    elif cmd in ("bore", "on-bore", "2"):
        if is_service_active("bore-tunnel.service"):
            port = read_bore_port() or "awaiting endpoint..."
            ntfy_reply(
                "🖥️ Bore ON",
                f"Already running\nbore.pub:{port}\nNo expiry",
                "computer", "default",
            )
            log("Bore already running")
            return

        log("Starting Bore...")
        subprocess.run(["systemctl", "--user", "start", "bore-tunnel.service"], check=False, timeout=30)
        port = _wait_for_bore_port()
        if port:
            ntfy_reply(
                "🖥️ Bore ON — Ready!",
                f"Address: bore.pub:{port}\nNo expiry — stable tunnel\n\nNoMachine: bore.pub:{port}  Protocol: NX",
                "computer", "default",
            )
            log(f"Bore active on port {port}")
        else:
            ntfy_reply("⚠️ Bore Failed", "No port assigned yet", "warning", "high")

    elif cmd == "status":
        pinggy_active = is_service_active("pinggy-tunnel.service")
        pinggy_addr = read_url_file() or ""
        bore_active = is_service_active("bore-tunnel.service")
        bore_port = read_bore_port() or ""

        lines = ["📊 Tunnel Status Report", ""]
        if bore_active and bore_port:
            lines.append(f"🖥️ Bore: RUNNING — bore.pub:{bore_port} (no expiry)")
        elif bore_active:
            lines.append("🖥️ Bore: RUNNING (awaiting endpoint)")
        else:
            lines.append("🖥️ Bore: STOPPED — send \"bore\" to start")

        if pinggy_active and pinggy_addr:
            rem = _remaining_pinggy_str() or "~60m"
            at = _expiry_at_str() or ""
            expiry = f"{rem}" + (f" (until {at})" if at else "")
            lines.append(f"🔥 Pinggy: RUNNING — {pinggy_addr} ({expiry})")
        elif pinggy_active:
            lines.append("🔥 Pinggy: RUNNING (awaiting endpoint)")
        else:
            lines.append("🔥 Pinggy: STOPPED — send \"fast\" to start")

        lines.append("")
        lines.append("Commands: fast | bore | stop | status | help")

        ntfy_reply("📊 Tunnel Status", "\n".join(lines), "chart_with_upwards_trend", "default")

    elif cmd in ("help", "h", "?"):
        ntfy_reply(
            "📋 Available Commands",
            "fast     — Start Pinggy (low-latency, 60min)\n"
            "bore     — Start Bore (stable, no expiry)\n"
            "stop     — Stop all tunnels\n"
            "status   — Report all tunnels\n"
            "help     — This message",
            "bookmark", "default",
        )

    else:
        ntfy_send_cmd_error(
            "❓ Unknown Command",
            f"Received: \"{cmd}\"\nSend \"help\" for available commands.",
            "question", "default",
        )


def listen_stream():
    url = f"https://ntfy.sh/{NTFY_CMD_TOPIC}/json"

    last_id = get_last_id()
    log(f"Connecting to stream: {NTFY_CMD_TOPIC} (from id: {last_id})")
    curl_cmd = ["curl", "-s", "-N", "--max-time", "3600", url]
    if last_id != "0":
        curl_cmd += ["-H", f"Last-Event-ID: {last_id}"]
    proc = subprocess.Popen(
        curl_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )

    for raw in proc.stdout:
        line = raw.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
            msg_id = event.get("id", "")
            message = event.get("message", "")
            tags = event.get("tags", [])
            if msg_id:
                save_last_id(msg_id)
            # Skip our own bot responses to avoid feedback loop
            if "bot" in tags:
                continue
            if message and message.strip():
                handle_command(message)
        except json.JSONDecodeError:
            pass


def main():
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    log(f"Listener started (topic: {NTFY_CMD_TOPIC})")
    log('Commands: fast | bore | stop | status | help')

    while True:
        try:
            listen_stream()
        except Exception as e:
            log(f"Stream error: {e} — reconnecting in 10s")
        time.sleep(10)


if __name__ == "__main__":
    main()
