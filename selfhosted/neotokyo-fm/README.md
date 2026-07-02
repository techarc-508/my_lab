# NEOTOKYO FM 🎵

> A retro-wave anime music player with radio streaming, YouTube integration, rich visualizers, and one-click Proxmox deployment.

[![Proxmox](https://img.shields.io/badge/Proxmox-1--Click-E57000?logo=proxmox)](deploy/proxmox-helper.sh)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](docker-compose.yml)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Tunnel-F38020?logo=cloudflare)](docs/CLOUDFLARE_TUNNEL.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎶 **Local Library** | 266 tracks with album art, lyrics, metadata |
| 📻 **Internet Radio** | 75 curated stations across 13 genres with live proxy |
| ▶️ **YouTube Integration** | Search, play, and download from YouTube |
| 🎨 **Rich Visualizers** | VU Meter, Spectrum, Waveform, Circular, Particle |
| 🎚 **10-Band Equalizer** | Peaking EQ with presets |
| 🎤 **Synced Lyrics** | Karaoke-style overlay with multi-source fetching |
| 🌙 **Sleep Timer** | Fall asleep to music |
| 🔄 **Crossfade** | Smooth transitions between tracks |
| 📋 **Queue Management** | Loop, repeat, reorder |
| 🔐 **Admin Panel** | Dashboard, logs, settings, backups |

---

## 🚀 One-Click Proxmox Deploy

### Option A: Migrate with existing media (RECOMMENDED)

Copy the project to your Proxmox host first, then run:

```bash
# On your Proxmox host
rsync -avz /path/to/your/neotokyo-fm/ root@proxmox:/tmp/neotokyo-fm/
bash /tmp/neotokyo-fm/deploy/proxmox-helper.sh --source /tmp/neotokyo-fm
```

This copies all 266 tracks + metadata into the container.

### Option B: Fresh install (empty library)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/techarc-508/my_lab/main/selfhosted/neotokyo-fm/deploy/proxmox-helper.sh)"
```

Downloads code from GitHub. Library starts empty — upload tracks via the Admin panel.

### What the script does

1. Creates Ubuntu 24.04 LXC (2GB RAM, 20GB disk, nesting enabled)
2. Installs Docker + Docker Compose
3. Deploys the application
4. Generates secure admin credentials
5. Outputs access URL and password

---

## ☁️ Public Access via Cloudflare Tunnel

After installation, make it accessible from anywhere:

```bash
# Inside the container
bash /opt/neotokyo-fm/deploy/cloudflare-tunnel.sh
```

Sets up **https://radio.rplab.qzz.io** — no open firewall ports, automatic SSL.

---

## 🐳 Docker Compose (any server)

```bash
git clone https://github.com/techarc-508/my_lab.git
cd my_lab/selfhosted/neotokyo-fm
cp .env.example .env
docker compose up --build -d
```

---

## 📁 Project Structure

```
selfhosted/neotokyo-fm/
├── server/                    ← Flask backend (Python)
│   ├── app.py
│   ├── config.py
│   ├── routes/               ← API endpoints
│   ├── services/             ← Radio, lyrics, metadata
│   ├── models/               ← Database, cache
│   ├── downloads/            ← Audio files + metadata (excluded from git)
│   └── Dockerfile
├── client/                    ← React frontend (TypeScript)
│   ├── src/                  ← Components, pages, stores
│   ├── nginx.conf            ← Optimized with gzip + caching
│   └── Dockerfile
├── deploy/                    ← One-click deployment scripts
│   ├── proxmox-helper.sh     ← Run on Proxmox host
│   ├── install.sh            ← Run inside LXC
│   ├── cloudflare-tunnel.sh  ← Public access setup
│   └── package-tarball.sh    ← Release packager
├── docs/                      ← Guides & plans
│   ├── PROXMOX_DEPLOY.md     ← Manual deployment guide
│   ├── CLOUDFLARE_TUNNEL.md  ← Tunnel setup
│   ├── ADMIN_GUIDE.md        ← First use reference
│   ├── UPGRADE_PLAN.md       ← Roadmap to beat Navidrome
│   └── TROUBLESHOOTING.md    ← Common fixes
├── docker-compose.yml
└── README.md
```

---

## 🔑 First Login

```
URL:   http://<container-ip>/admin
User:  admin
Pass:  auto-generated (displayed at install, saved in /root/.neotokyo-admin-password)
```

---

## 🗺 Roadmap

- **Phase 1**: Bulletproof radio, YouTube, visualizers, lyrics
- **Phase 2**: Mobile apps via CapacitorJS + PWA perfection
- **Phase 3**: Multi-user support + transcoding
- **Phase 4**: Smart Radio (blend local + YouTube + radio), SyncPlay, AI playlists
- **Phase 5**: Subsonic API compatibility (unlocks 50+ mobile apps)

Full details in [docs/UPGRADE_PLAN.md](docs/UPGRADE_PLAN.md).

---

Built with ❤️ for the love of music and retro aesthetics.
