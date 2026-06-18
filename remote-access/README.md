# Remote Access — Dual-Tunnel NoMachine System

On-demand remote desktop access for machines behind CGNAT, using **Bore** and **Pinggy** tunnels with smartphone control via **ntfy.sh**.

## Problem

Most residential ISPs (including Alliance Broadband) use **Carrier-Grade NAT (CGNAT)**, which means your machine gets a shared public IP. Incoming port forwarding is impossible — there's no way to open port 4000 for NoMachine. Traditional solutions like DDNS + port forwarding simply don't work.

Without a public IP or IPv6, the only option is **outbound tunneling**: a local process connects to a public relay, which forwards traffic back to the local machine.

## Solution

A dual-tunnel architecture with two complementary services:

| Tunnel | Role | Latency | Expiry | When to use |
|--------|------|---------|--------|-------------|
| **Bore** | Stable, always-on relay | ~232ms | None | Long sessions, overnight work, fallback |
| **Pinggy** | Low-latency, on-demand | ~75ms | 60 min | Interactive use, quick file transfers |

Both tunnels are **on-demand** — started and stopped via ntfy commands from a phone. Nothing runs when you don't need it.

Two tunnels hedge against any single provider going down, and let you choose between latency and session length per use case.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Phone (ntfy.sh app)                    │
│                                                             │
│  Send: "bore", "fast", "stop", "status", "help"            │
│  Receive: endpoint info, countdown, status reports          │
└─────────────────────┬───────────────────────────────────────┘
                      │ ntfy.sh topic: pushpal-cmd
                      │ (HTTP/SSE)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│         ntfy-cmd-listener.py (Python SSE daemon)            │
│                                                             │
│  Reads commands from ntfy.sh JSON stream                    │
│  Skips messages tagged "bot" (avoids feedback loop)         │
│  Persists last message ID to survive reboots                │
│                                                             │
│  "fast" ──→ systemctl --user start pinggy-tunnel.service    │
│  "bore" ───→ systemctl --user start bore-tunnel.service     │
│  "stop" ───→ stop both services                             │
│  "status" ─→ query state files, reply with report           │
└───────┬─────────────────────────────────────┬───────────────┘
        │                                     │
        ▼                                     ▼
┌──────────────────┐             ┌──────────────────────┐
│ pinggy-tunnel.sh │             │ bore-tunnel.sh        │
│ (auto-restart)   │             │ (auto-restart)        │
│                   │             │                       │
│ ssh -R ...        │             │ bore local 4000 ...   │
│ tcp@a.pinggy.io   │             │ --to bore.pub         │
│                   │             │                       │
│ Writes URL to     │             │ Writes port to        │
│ pinggy_tunnel_url │             │ bore_tunnel_port      │
│ (state file)      │             │ (state file)          │
└────────┬──────────┘             └───────────┬───────────┘
         │                                    │
         │ Endpoint changes call              │
         │ bore-notify.sh ───→ ntfy.sh reply  │
         │                    (tagged "bot")   │
         └────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  NoMachine Client        │
              │  (office PC or mobile)   │
              │                          │
              │  Connects to:            │
              │  bore.pub:XXXXX          │
              │  or a.pinggy's TCP addr  │
              │  Protocol: NX            │
              └─────────────────────────┘
```

## Features

- **On-demand tunnels** — nothing runs idle; start tunnels from your phone
- **Smartphone as remote control** — send commands via any ntfy.sh client
- **Auto-notifications** — receive updated endpoint info when tunnels connect or reconnect
- **Auto-restart loops** — both tunnel scripts reconnect on failure
- **Pinggy 60-min countdown** — notifications include time remaining until tunnel expiry
- **Bot-tag feedback prevention** — all automated replies carry a `bot` tag; the listener ignores them
- **Dual-tunnel fallback** — Bore stays up indefinitely; Pinggy gives low latency when needed
- **Ephemeral state** — port/URL files in `$XDG_RUNTIME_DIR`, clean up on reboot
- **systemd integration** — user services for lifecycle management
- **Extensible** — add new commands by extending the listener's dispatch table

## Prerequisites

- Linux machine (tested on Fedora 40 / Ubuntu 24.04)
- [NoMachine](https://www.nomachine.com) installed and listening on port 4000
- [ntfy.sh](https://ntfy.sh) app on your phone (Android/iOS)
- `curl`, `ssh`, `systemctl --user` available
- Python 3.x for the listener

## Setup

### 1. Install the Bore binary

Bore is a single Rust binary. Prebuilt releases are available on GitHub:

```bash
# Download the latest bore binary for your architecture
curl -L https://github.com/anderspitman/bore/releases/latest/download/bore-x86_64-unknown-linux-gnu.tar.gz \
  | tar xz -C ~/.local/bin/
chmod +x ~/.local/bin/bore
```

Verify: `bore --version`

### 2. Deploy the scripts

Copy the scripts from this repository to `~/.local/bin/`:

```bash
cp scripts/* ~/.local/bin/
chmod +x ~/.local/bin/bore-tunnel.sh ~/.local/bin/pinggy-tunnel.sh \
  ~/.local/bin/bore-notify.sh ~/.local/bin/bore-status.sh \
  ~/.local/bin/pinggy-status.sh
```

### 3. Configure notifications

```bash
mkdir -p ~/.config/bore-tunnel
```

Create `~/.config/bore-tunnel/notify.conf`:

```ini
# Single ntfy topic for both commands and notifications
NTFY_CMD_TOPIC="pushpal-cmd"

# Optional Telegram (may be blocked by ISP)
# TELEGRAM_BOT_TOKEN="your:token"
# TELEGRAM_CHAT_ID="your-chat-id"
```

The topic must match the one you subscribe to on your phone. Telegram is optional — ntfy.sh is the primary notification channel.

### 4. Set up systemd user services

```bash
mkdir -p ~/.config/systemd/user
cp services/* ~/.config/systemd/user/
systemctl --user daemon-reload
```

The services:

| Service | File | Default state |
|---------|------|---------------|
| `ntfy-cmd-listener.service` | `services/ntfy-cmd-listener.service` | Enabled (auto-starts on login) |
| `bore-tunnel.service` | `services/bore-tunnel.service` | Disabled (started on-demand) |
| `pinggy-tunnel.service` | `services/pinggy-tunnel.service` | Disabled (started on-demand) |

### 5. Start the listener

```bash
systemctl --user enable --now ntfy-cmd-listener.service
```

Verify: `systemctl --user status ntfy-cmd-listener.service`

The listener subscribes to the ntfy.sh SSE stream for your command topic and processes incoming commands.

### 6. Enable lingering (optional but recommended)

Allow user services to run when no user is logged in (e.g., after SSH disconnects):

```bash
sudo loginctl enable-linger $USER
```

## Usage

Send commands to your ntfy topic (`pushpal-cmd`) from the ntfy app on your phone:

| Command | Action | Response |
|---------|--------|----------|
| `bore` or `2` | Start Bore tunnel (stable, no expiry) | Endpoint + NoMachine connection info |
| `fast` or `1` | Start Pinggy tunnel (low-latency, 60 min) | Endpoint + countdown + connection info |
| `stop` or `0` | Stop all running tunnels | Confirmation of what was stopped |
| `status` | Report status of all tunnels | Bore + Pinggy state, endpoints, countdown |
| `help` or `h` or `?` | Show available commands | Command reference list |
| `on` | Alias for `fast` (start Pinggy) | Same as `fast` |
| `off` | Alias for `stop` | Same as `stop` |

**Typical workflow:**

1. Open ntfy.sh app, subscribe to `pushpal-cmd`
2. Send `fast` to start a low-latency session
3. Receive the endpoint: `tcp://xxx.pinggy.io:XXXXX`
4. Configure NoMachine with that host:port, protocol NX
5. After 55 minutes, send `fast` again to renew (or send `bore` for a stable tunnel)
6. Send `stop` when done

## How It Works

### Command Flow

```
Phone sends "fast" ──────────────────────────────────────────┐
                                                              │
  ┌──────────────────────────────────────────────────────────┐│
  │ 1. ntfy.sh receives "fast" on pushpal-cmd topic         ││
  │ 2. ntfy-cmd-listener.py (SSE connection) picks it up    ││
  │ 3. Listener checks tags — skips if "bot" present        ││
  │ 4. Dispatches to handle_command("fast")                 ││
  │ 5. Runs: systemctl --user start pinggy-tunnel.service   ││
  │ 6. Polls pinggy_tunnel_url state file (up to 20s)       ││
  │ 7. On success: replies to pushpal-cmd with address      ││
  │    On timeout: replies with failure warning              ││
  └──────────────────────────────────────────────────────────┘│
                                                              │
Phone receives "🔥 Pinggy ON — Ready!" ───────────────────────┘
```

The listener persists the last processed message ID in `~/.cache/ntfy-cmd/last_msg_id`, so it resumes from where it left off after a restart.

### Notification Flow

Tunnel scripts (`bore-tunnel.sh`, `pinggy-tunnel.sh`) monitor their output for endpoint changes:

```
Tunnel script detects new endpoint (or reconnect) ──────────┐
                                                              │
  ┌──────────────────────────────────────────────────────────┐│
  │ 1. Writes endpoint to state file                        ││
  │ 2. Calls bore-notify.sh <port> <host> <service>         ││
  │ 3. bore-notify.sh formats message with:                 ││
  │    - Service emoji and title (🖥️ Bore / 🔄 Pinggy)     ││
  │    - Address, timestamp, NoMachine settings             ││
  │    - Pinggy countdown (time remaining in session)       ││
  │ 4. Posts to ntfy.sh pushpal-cmd with tags: bot,computer ││
  │ 5. Also attempts Telegram (skipped if ISP blocks it)    ││
  └──────────────────────────────────────────────────────────┘│
                                                              │
Phone receives notification ──────────────────────────────────┘
```

The `bot` tag is critical: the listener skips any message that contains it, preventing an infinite loop of the listener responding to its own responses.

### Pinggy 60-Minute Countdown

Pinggy's free tier enforces a 60-minute session timeout. The system tracks this:

1. When `pinggy-tunnel.sh` detects a new endpoint, it writes the current Unix timestamp to `pinggy_tunnel_start` (in `$XDG_RUNTIME_DIR`)
2. `bore-notify.sh` reads this file and calculates remaining time when sending notifications
3. The `status` command also reports remaining time
4. When the tunnel reconnects (typically after expiry), the timestamp resets and a new notification fires

This gives visibility into when the tunnel will drop, so you can proactively renew it.

## Files Reference

### Scripts (`~/.local/bin/`)

| File | Purpose |
|------|---------|
| `bore-tunnel.sh` | Bore tunnel runner with auto-restart loop. Monitors output for `listening at bore.pub:PORT`, writes port to state file, calls notifier on changes. |
| `pinggy-tunnel.sh` | Pinggy tunnel runner with auto-restart loop. Monitors SSH output for `tcp://HOST:PORT`, writes URL to state file, records start timestamp for countdown. |
| `bore-notify.sh` | Shared notification sender. Formats service-specific messages with emoji, countdown, and NoMachine settings. Posts to ntfy.sh and optionally Telegram. |
| `ntfy-cmd-listener.py` | Python daemon that subscribes to ntfy.sh SSE stream, parses JSON events, skips bot-tagged messages, dispatches commands to systemd. |
| `bore-status.sh` | CLI status checker for Bore tunnel — port, PID, notification config. |
| `pinggy-status.sh` | CLI status checker for Pinggy tunnel — endpoint, PID, systemd state. |

### Systemd user services (`~/.config/systemd/user/`)

| File | Type | Enabled? | Notes |
|------|------|----------|-------|
| `ntfy-cmd-listener.service` | Simple | Yes | Always running, auto-starts on login |
| `bore-tunnel.service` | Simple | No | Started by listener on `bore` command |
| `pinggy-tunnel.service` | Simple | No | Started by listener on `fast` command |

### Configuration

| Path | Purpose |
|------|---------|
| `~/.config/bore-tunnel/notify.conf` | ntfy topic name, Telegram credentials |

### State files (in `$XDG_RUNTIME_DIR`, typically `/run/user/1000/`)

| File | Contents | Written by |
|------|----------|------------|
| `bore_tunnel_port` | Current Bore port (e.g., `12345`) | `bore-tunnel.sh` |
| `bore_tunnel.pid` | Bore tunnel script PID | `bore-tunnel.sh` |
| `bore_tunnel_last_port` | Previous port (tracks changes) | `bore-tunnel.sh` |
| `pinggy_tunnel_url` | Current Pinggy address (`host:port`) | `pinggy-tunnel.sh` |
| `pinggy_tunnel.pid` | Pinggy tunnel script PID | `pinggy-tunnel.sh` |
| `pinggy_tunnel_last_url` | Previous URL (tracks changes) | `pinggy-tunnel.sh` |
| `pinggy_tunnel_start` | Unix timestamp of last Pinggy connect | `pinggy-tunnel.sh` |
| `ntfy_cmd_listener.pid` | Listener PID | `ntfy-cmd-listener.py` |

### Cache

| Path | Purpose |
|------|---------|
| `~/.cache/ntfy-cmd/last_msg_id` | Last processed ntfy message ID (persists across reboots) |

## Performance

Benchmarks measured from the remote desktop client to NoMachine on the host machine:

| Metric | Bore (bore.pub) | Pinggy (a.pinggy.io) |
|--------|-----------------|----------------------|
| Average latency | ~232 ms | ~75 ms |
| Throughput | ~2.2 Mbps | ~1.1 Mbps |
| Connection overhead | TCP-level relay | SSH reverse tunnel |
| Session expiry | None | 60 minutes |
| Idle stability | Stable (no keepalive needed) | Stable (30s ServerAliveInterval) |
| Concurrent connections | Yes | Yes |

Bore provides better throughput and no expiry, at the cost of higher latency. Pinggy excels in interactive responsiveness but caps at 1.1 Mbps and enforces a 60-minute timeout.

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| Listener not responding | Service not running | `systemctl --user status ntfy-cmd-listener.service` |
| Bore not connecting | bore.pub may be down | Try `bore local 4000 --to bore.pub:8080` as alt port |
| Pinggy not connecting | Network blocks SSH on 443 | Check `journalctl --user -u pinggy-tunnel -f` for errors |
| Pinggy expired | 60-min session timeout | Send `fast` again to restart |
| No notification received | ntfy topic mismatch | Check `NTFY_CMD_TOPIC` in `notify.conf` |
| Telegram silent | ISP blocks 149.154.x.x | Use ntfy.sh only (Telegram is optional) |
| "command not found" | PATH missing | Services set `PATH=%h/.local/bin:/usr/bin` |
| No IPv6 address | Network lacks IPv6 | Expected; all tunnels use IPv4 |
| Service won't start without login | No lingering | `sudo loginctl enable-linger $USER` |
| Messages processed twice | last_msg_id cache stale | Delete `~/.cache/ntfy-cmd/last_msg_id` |
| Bore port changes on reconnect | Normal — bore.pub assigns random port | Notification fires automatically with new port |

### Quick diagnostics

```bash
# Watch listener activity
journalctl --user -u ntfy-cmd-listener -f

# Watch Bore tunnel logs
journalctl --user -u bore-tunnel -f

# Watch Pinggy tunnel logs
journalctl --user -u pinggy-tunnel -f

# Check current state files
cat "${XDG_RUNTIME_DIR:-/tmp}"/bore_tunnel_port
cat "${XDG_RUNTIME_DIR:-/tmp}"/pinggy_tunnel_url
```

## Alternatives Considered

| Approach | Why it didn't work / not chosen |
|----------|--------------------------------|
| **tunwg / boringtun (WireGuard userspace)** | Kernel lacks `CONFIG_WG` for native WireGuard. Boringtun had MTU issues and frequent connection drops. Complex to automate. |
| **ngrok** | Free tier only supports HTTP/HTTPS tunnels. NoMachine requires raw TCP (NX protocol). Pro tier costs money. |
| **FRP (Fast Reverse Proxy)** | Excellent tool, but requires a VPS with a public IP. No free relay server available. Kept as a future option if a free VPS is obtained. |
| **rathole** | Same requirement as FRP — needs a server. Rust-based, lightweight, would be ideal with a VPS. |
| **Cloudflare Tunnel (cloudflared)** | HTTP-only on free tier. No raw TCP support without Cloudflare Spectrum (paid). |
| **localtonet, serveo, etc.** | Proprietary, less reliable, slower than Bore/Pinggy. |

## Future Improvements

### VPS relay with rathole or FRP

If a free VPS is obtained (Oracle Cloud, GratisVPS), migrate to a self-hosted relay:

```ascii
[NoMachine host] ──→ [VPS with public IP] ──→ [Remote client]
   port 4000             port 4000               connects to
   runs rathole          runs rathole             VPS:4000
   client                server
```

Benefits:
- **Persistent endpoint** — no 60-min expiry, no random port changes
- **Lower latency** — choose VPS region nearest to both ends
- **Full control** — no third-party dependency
- **No message limits** — ntfy.sh has 5 MB/day on free tier

### Enhancements for the current system

- [ ] Add a `renew` command that restarts Pinggy without a full stop/start
- [ ] Persistent ntfy topic for command history (use ntfy.sh's built-in caching)
- [ ] Health check endpoint that notifies if tunnels drop unexpectedly
- [ ] Combine `bore-status.sh` and `pinggy-status.sh` into a single `tunnel-status` script
- [ ] SSH config entry for Pinggy to simplify the command in `pinggy-tunnel.sh`
- [ ] Option to auto-start Bore on boot for users who want a permanent tunnel
- [ ] Monitor and alert if both tunnels are down simultaneously

---

*Part of the [my_lab](https://github.com/pushpal/my_lab) homelab repository.*
