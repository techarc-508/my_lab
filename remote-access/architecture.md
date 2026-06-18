# Architecture: Remote Access Tunnel System

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Phone (ntfy.sh app)                      │
│  Sends: "bore" | "fast" | "stop" | "status" | "help"           │
│  Receives: tunnel endpoints, countdown, status reports          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS (SSE + POST)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ntfy.sh (pushpal-cmd topic)                   │
│  • SSE stream: listener subscribes for incoming commands        │
│  • REST API: listener posts responses back                      │
│  • All bot responses tagged `bot` to prevent feedback loop      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              ntfy-cmd-listener.py (SSE Stream Client)            │
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────────┐    │
│  │ SSE Connect  │───>│ Command      │───>│ systemctl --user │    │
│  │ (curl -N)    │    │ Dispatcher   │    │ start/stop       │    │
│  └─────────────┘    └──────────────┘    └────────┬─────────┘    │
│                                                   │              │
│  State: ~/.cache/ntfy-cmd/last_msg_id             │              │
└──────────────────────────────────────────────────┼──────────────┘
                                                    │
                    ┌───────────────────────────────┼───────────┐
                    │          systemd (user)                   │
                    │                               │           │
                    │  ┌────────────────────────────┴────────┐  │
                    │  │         bore-tunnel.service         │  │
                    │  │  (disabled — started on-demand)     │  │
                    │  │  ExecStart: bore-tunnel.sh          │  │
                    │  └────────────────┬───────────────────┘  │
                    │                   │                       │
                    │  ┌────────────────┴───────────────────┐  │
                    │  │        pinggy-tunnel.service       │  │
                    │  │  (disabled — started on-demand)     │  │
                    │  │  ExecStart: pinggy-tunnel.sh       │  │
                    │  └────────────────┬───────────────────┘  │
                    │                   │                       │
                    │  ┌────────────────┴───────────────────┐  │
                    │  │    ntfy-cmd-listener.service       │  │
                    │  │  (enabled — auto-start)            │  │
                    │  │  ExecStart: ntfy-cmd-listener.py   │  │
                    │  └────────────────────────────────────┘  │
                    └──────────────────────────────────────────┘
```

## Component Details

### 1. ntfy-cmd-listener.py — Command Hub

- Subscribes to `pushpal-cmd` SSE stream via `curl -N`
- Uses `Last-Event-ID` header to resume from last processed message
- Skips messages tagged `bot` (prevents echo loop)
- Dispatches commands to systemd:
  - `bore` / `fast` → `systemctl --user start <service>`
  - `stop` → `systemctl --user stop <service>`
  - `status` / `help` → replies immediately
- Uses _polling_ (1s interval, 20s timeout) to detect tunnel endpoints
- All command responses tagged `bot` and sent to same topic

### 2. Bore Tunnel

```
bore local 4000 --to bore.pub
      │              │
      │              └── bore.pub server (public)
      │                  assigns random port XXXXX
      │
      └── local NoMachine (port 4000)
```

- **Protocol:** Raw TCP forwarding
- **Lifetime:** No expiry (stable until process exit)
- **Restart:** Auto-restart on crash (3s delay in loop)
- **Notification:** On port change → `bore-notify.sh` → `pushpal-cmd`

### 3. Pinggy Tunnel

```
ssh -p 443 -R 0:localhost:4000 tcp@a.pinggy.io
      │              │           │
      │              │           └── Pinggy server
      │              │               assigns host:port
      │              │
      │              └── local NoMachine (port 4000)
      │
      └── Pinggy uses SSH reverse tunnel (-R)
          over port 443 (HTTPS, rarely blocked)
```

- **Protocol:** SSH reverse tunnel (raw TCP via `tcp@`)
- **Lifetime:** 60-minute timeout, auto-renewed by restart loop
- **Restart:** On expiry/disconnect → auto-restart in 3s
- **Countdown:** `pinggy_tunnel_start` written on each reconnect
- **Notification:** On reconnect → `bore-notify.sh` → `pushpal-cmd` with `⏱` countdown

### 4. bore-notify.sh — Notification Dispatcher

- Single notification script used by both tunnels
- Service-specific formatting (emoji, title, tags, priority)
- Pinggy messages include countdown (reads `pinggy_tunnel_start`)
- All notifications tagged `bot` to prevent listener feedback loop
- Sends to `pushpal-cmd` (same topic as commands)

### 5. State Management

| File | Location | Contents | Persistence |
|------|----------|----------|-------------|
| `bore_tunnel_port` | `$XDG_RUNTIME_DIR` | Current Bore port | Service restart |
| `pinggy_tunnel_url` | `$XDG_RUNTIME_DIR` | Current Pinggy endpoint | Service restart |
| `pinggy_tunnel_start` | `$XDG_RUNTIME_DIR` | Unix timestamp of last reconnect | Service restart |
| `ntfy_cmd_listener.pid` | `$XDG_RUNTIME_DIR` | Listener PID | Service restart |
| `last_msg_id` | `~/.cache/ntfy-cmd/` | Last processed ntfy message ID | Reboot |

## Security Model

- **No open ports** on the local machine — outbound connections only
- **No credentials stored** in tunnel scripts (tokens in notify.conf only)
- **ntfy.sh uses HTTPS** — commands/responses encrypted in transit
- **Bore/Pinggy are third-party** — traffic goes through their servers (trust model)
- **NoMachine session** encrypted by NX protocol

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| On-demand tunnels | Save bandwidth when not needed; start only when remote access required |
| Two tunnel types | Bore for stability (no expiry), Pinggy for speed (low latency) |
| ntfy.sh instead of Telegram | ISP blocks Telegram IPs; ntfy.sh works reliably |
| Shell scripts + Python | Minimal dependencies (curl, ssh, python3 — all pre-installed) |
| systemd user services | Proper lifecycle management, auto-restart, journald logging |
| Single ntfy topic | Simpler: subscribe once, send commands and receive updates together |
| `bot` tag filtering | Prevents echo loop when listener processes its own responses |
| Polling instead of sleep | More reliable endpoint detection (1s intervals, configurable timeout) |
