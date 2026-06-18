# my_lab

[![GitHub stars](https://img.shields.io/badge/stars-0-lightgrey?style=flat-square)](https://github.com/user/my_lab)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Last Updated](https://img.shields.io/github/last-commit/user/my_lab?style=flat-square)](https://github.com/user/my_lab/commits)

> A curated collection of homelab setups, infrastructure-as-code configurations, and operational runbooks. Reproducible, documented, and built for real-world constraints like CGNAT, limited budgets, and commodity hardware.

---

## Table of Contents

- [Overview](#overview)
- [Topics](#topics)
  - [Remote Access](#1-remote-access)
  - [Networking](#2-networking)
  - [Media Server](#3-media-server)
  - [More to Come](#4-more-to-come)
- [Quick Start](#quick-start)
- [Philosophy](#philosophy)
- [Repository Structure](#repository-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

`my_lab` is a living knowledge base for my personal homelab. Every setup here is designed to be:

- **Reproducible** — scripts, systemd units, and config files, not vague instructions.
- **Documented** — each topic has its own README explaining the architecture, constraints, and day-2 operations.
- **Resilient** — built to survive reboots, network outages, and ISP quirks (CGNAT, no IPv6, port-blocking).

The repo currently covers one production-tested system (remote desktop behind CGNAT) and has stubs for upcoming projects. The long-term goal is a reference-grade homelab blueprint that others can adapt.

---

## Topics

### 1. Remote Access

[`remote-access/`](remote-access/) — Dual-tunnel remote desktop system for NoMachine behind CGNAT.

| Tunnel | Role | Latency | Bandwidth | Lifespan |
|--------|------|---------|-----------|----------|
| **Bore** (`bore.pub`) | Stable baseline | ~232 ms | ~2.2 Mbps | Persistent |
| **Pinggy** (`a.pinggy.io`) | On-demand speed | ~75 ms | ~1.1 Mbps | 60 min |

Both tunnels are **on-demand**, controlled remotely via [ntfy.sh](https://ntfy.sh) commands from a phone. A Python SSE listener (`ntfy-cmd-listener.py`) subscribes to a command topic and dispatches `systemctl --user start/stop` actions. State is tracked in ephemeral files under `$XDG_RUNTIME_DIR`; notifications are echoed back through ntfy and optionally Telegram.

**Key files:**
- `remote-access/bore-tunnel.sh` — Bore runner with auto-restart loop
- `remote-access/pinggy-tunnel.sh` — Pinggy runner with auto-restart loop
- `remote-access/ntfy-cmd-listener.py` — SSE command listener (control hub)
- `remote-access/bore-notify.sh` — Shared notification dispatcher
- `remote-access/bore-status.sh` / `pinggy-status.sh` — CLI health checks

See the [full documentation](remote-access/README.md) for setup, architecture diagrams, and troubleshooting.

---

### 2. Networking

[`network/`](network/) — *Coming soon.*

Planned content: Pi-hole (or AdGuard Home) on a Raspberry Pi, VLAN experiments with a managed switch, wireguard site-to-site, and firewall rules for segmented IoT/guest/trusted zones.

---

### 3. Media Server

[`media-server/`](media-server/) — *Coming soon.*

Planned content: Jellyfin on Debian, hardware transcoding (Intel QuickSync / AMD VA-API), *arr stack (Sonarr, Radarr, Prowlarr), and NFS/Samba mounts for a NAS.

---

### 4. More to Come

Ideas being scouted:

- **Backup Server** — Borg-based encrypted offsite backups with `borgmatic`.
- **Monitoring** — Prometheus + node_exporter + Grafana dashboards on a low-power SBC.
- **Container Host** — Docker Compose stacks with `traefik` reverse proxy and Let's Encrypt.
- **Home Automation** — Home Assistant via Docker with Zigbee/Z-Wave dongle passthrough.

---

## Quick Start

Each topic is self-contained. Navigate into its directory and follow the local README:

```bash
cd remote-access
cat README.md
```

All scripts assume a Debian-based system with `systemd --user` available. Dependencies (if any) are listed at the top of each topic's README. No global installer — copy what you need, adapt the variables, and run.

---

## Philosophy

Every configuration in this repo is written with three principles:

1. **Default-deny complexity.** Start minimal. Add layers only when a real need appears. The remote-access system began as a single `ssh -R` and grew organically — every component earns its keep.

2. **Infrastructure-as-code, not infrastructure-as-vague-notes.** Shell scripts, systemd unit files, Ansible playbooks (eventually) — if it can be checked in, it should be. This turns the repo into a time machine: I can see what changed, why, and revert if needed.

3. **Operate under real constraints.** CGNAT, ISP blocks on common ports, no static IP, no IPv6, commodity hardware. Solutions are chosen for reliability and simplicity, not theoretical performance. Cheap, boring, and working beats expensive, clever, and fragile.

---

## Repository Structure

```
my_lab/
├── README.md                 # You are here
├── LICENSE                   # MIT
│
├── remote-access/            # NoMachine behind CGNAT (Bore + Pinggy)
│   ├── README.md
│   ├── bore-tunnel.sh
│   ├── pinggy-tunnel.sh
│   ├── ntfy-cmd-listener.py
│   ├── bore-notify.sh
│   ├── bore-status.sh
│   └── pinggy-status.sh
│
├── network/                  # (placeholder)
│   └── README.md
│
├── media-server/             # (placeholder)
│   └── README.md
│
└── homelab/                  # Shared resources, notes
    └── README.md
```

---

## Contributing

This is a personal lab, so contributions aren't expected in the traditional sense. That said:

- **Ideas and suggestions** are always welcome — open an issue or start a discussion.
- **Alternative approaches** to problems I've solved (e.g., FRP instead of Bore, Cloudflare Tunnel instead of Pinggy) would make great comparison docs.
- **Bug reports** if you adapt a script and it breaks — I'll help debug where I can.

If you want to fork the repo for your own lab, go for it. Attribution is appreciated but not required.

---

## License

[MIT](LICENSE) — do what you want, no warranty, don't blame me if your tunnel goes down at 2 AM.
