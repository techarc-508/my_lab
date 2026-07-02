# NEOTOKYO FM — Proxmox 1-Click Deployment Guide

## Overview

Deploy NEOTOKYO FM on a Proxmox host using either LXC (lighter, preferred) or a full VM. The automated installer at `scripts/install-proxmox.sh` handles OS detection, dependency installation, project setup, and service enablement.

## Prerequisites

- Proxmox VE 7.x or 8.x
- Root access to the Proxmox host
- Internet connection (for package installation and cloning)
- 1GB+ RAM, 5GB+ disk for the container/VM

## Quick Start (LXC)

### 1. Create an LXC container

```bash
# Ubuntu 24.04 LXC template
pveam update
pveam download local ubuntu-24.04-standard_24.04-2_amd64.tar.zst

# Create container (ID 200, 2GB RAM, 10GB disk)
pct create 200 local:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst \
  --hostname neotokyo-fm \
  --storage local-lvm \
  --memory 2048 \
  --swap 512 \
  --cores 2 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1

# Start the container
pct start 200

# Enter the container
pct enter 200
```

### 2. Run the installer

```bash
# Inside the LXC container
apt update && apt install -y curl

# Clone and run the installer (from git)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/anomalyco/mini_radio/main/scripts/install-proxmox.sh)" -- --git https://github.com/anomalyco/mini_radio.git

# Or if you have the project directory accessible:
bash /path/to/mini_radio/scripts/install-proxmox.sh --source /path/to/mini_radio --docker

# Or with Docker mode (recommended for isolation):
bash install-proxmox.sh --git https://github.com/anomalyco/mini_radio.git --docker
```

## Import Existing Library from Development VM

After the installer finishes, migrate your existing songs, metadata sidecars, database, and radio stations from this development VM to the Proxmox container.

### Step 1: Package the data on this VM

```bash
# On the development VM (this machine)
cd /mnt/data/projects/mini_radio/server

# Estimate size first
du -sh downloads/ batch_history.db radio_stations.json

# Create a tarball of all persistent data (~3.8GB with songs)
tar czf /tmp/neotokyo-library.tar.gz \
  downloads/ \
  batch_history.db \
  radio_stations.json

# Check the tarball
ls -lh /tmp/neotokyo-library.tar.gz
```

### Step 2: Transfer to the Proxmox host

```bash
# On the Proxmox host (or directly into the container)
# Option A: Copy via SCP (if Proxmox host is reachable)
scp user@development-vm-ip:/tmp/neotokyo-library.tar.gz /root/

# Option B: Copy to a shared mount accessible by Proxmox
cp /tmp/neotokyo-library.tar.gz /mnt/shared-storage/

# Option C: Use pct push directly into the LXC container
pct push 200 /tmp/neotokyo-library.tar.gz /tmp/neotokyo-library.tar.gz
```

If you're using a USB drive or network share as an intermediate:

```bash
# On dev VM — write to external drive
cp /tmp/neotokyo-library.tar.gz /media/usb/

# On Proxmox host — mount and copy
mount /dev/sdX1 /mnt/usb
cp /mnt/usb/neotokyo-library.tar.gz /root/
```

### Step 3: Extract into the container

```bash
# If transferred to the Proxmox host, push into the container
pct push 200 /root/neotokyo-library.tar.gz /tmp/neotokyo-library.tar.gz

# Inside the LXC container (pct enter 200)
# Stop services first
systemctl stop neotokyo-grabber 2>/dev/null || true
docker compose -f /opt/neotokyo-fm/docker-compose.yml down 2>/dev/null || true

# Back up any fresh-install defaults
cd /opt/neotokyo-fm/server
mv downloads downloads.orig 2>/dev/null || true
mv batch_history.db batch_history.db.orig 2>/dev/null || true
mv radio_stations.json radio_stations.json.orig 2>/dev/null || true

# Extract the library
tar xzf /tmp/neotokyo-library.tar.gz -C /opt/neotokyo-fm/server/

# Set correct ownership (Docker usually runs as root; native may use a different user)
chown -R root:root /opt/neotokyo-fm/server/downloads
chmod -R 755 /opt/neotokyo-fm/server/downloads

# Clean up
rm -f /tmp/neotokyo-library.tar.gz

# Restart services
systemctl start neotokyo-grabber 2>/dev/null || docker compose -f /opt/neotokyo-fm/docker-compose.yml up -d 2>/dev/null || true
```

### Step 4: Verify the migration

```bash
# Inside the container — check file count matches dev VM
ls /opt/neotokyo-fm/server/downloads/*.mp3 | wc -l

# Check sidecar metadata directories
ls /opt/neotokyo-fm/server/downloads/.metadata/ | wc -l

# Check the database loaded
curl -s http://localhost:5050/api/downloads | python3 -m json.tool | head -20

# Check radio stations loaded
curl -s http://localhost:5050/api/radio-stations | python3 -m json.tool | head -20

# Browse a cover URL
curl -sI http://localhost:5050/api/cover/any-track-name.mp3 | head -5
```

If something went wrong, restore the fresh-install defaults:

```bash
cd /opt/neotokyo-fm/server
rm -rf downloads batch_history.db radio_stations.json
mv downloads.orig downloads 2>/dev/null || true
mv batch_history.db.orig batch_history.db 2>/dev/null || true
mv radio_stations.json.orig radio_stations.json 2>/dev/null || true
systemctl restart neotokyo-grabber
```

### Quick rsync Alternative (Direct Transfer)

If the container has SSH access and you prefer rsync:

```bash
# On the dev VM — sync directly into the container
rsync -avzP --delete \
  /mnt/data/projects/mini_radio/server/downloads/ \
  /mnt/data/projects/mini_radio/server/batch_history.db \
  /mnt/data/projects/mini_radio/server/radio_stations.json \
  root@container-ip:/opt/neotokyo-fm/server/

# Then inside the container, fix permissions and restart
chown -R root:root /opt/neotokyo-fm/server/downloads
systemctl restart neotokyo-grabber
```

## Deploy Modes

### Docker Mode (Recommended)

Uses `docker-compose.yml` to run both server and client in containers:
- Best isolation, easy updates, predictable environment
- Ports: `:5050` (API) and `:80` (Player)

**Update:**
```bash
cd /opt/neotokyo-fm
git pull
docker compose up --build -d
```

### Native Mode (systemd)

Installs Python venv + Node.js directly:
- Lower overhead, direct filesystem access
- Uses `neotokyo-grabber.service` and `neotokyo-player.service`
- Ports: `:5050` (API) and `:4173` (Player preview mode)

**Update:**
```bash
cd /opt/neotokyo-fm
git pull
# Rebuild
cd server && source venv/bin/activate && pip install -r requirements.txt && deactivate
cd /opt/neotokyo-fm/client && npm ci && npm run build
sudo systemctl restart neotokyo-grabber neotokyo-player
```

## Persistent Storage

The install directory `/opt/neotokyo-fm` contains all persistent data:

```
/opt/neotokyo-fm/
├── server/
│   ├── downloads/           # Audio files + .metadata sidecars
│   ├── batch_history.db     # Download history SQLite
│   └── radio_stations.json  # Radio station list
└── client/
    └── ...                  # Built React app (rebuilt on update)
```

### Backup Strategy

```bash
# Backup all persistent data
tar czf neotokyo-backup-$(date +%Y%m%d).tar.gz \
  /opt/neotokyo-fm/server/downloads \
  /opt/neotokyo-fm/server/batch_history.db \
  /opt/neotokyo-fm/server/radio_stations.json

# Restore
tar xzf neotokyo-backup-20260628.tar.gz -C /
```

### Mounting External Storage

To store audio files on a separate Proxmox mount point:

```bash
# Inside the LXC or VM
mkdir -p /mnt/audio
mount /dev/sdX1 /mnt/audio

# Symlink the downloads directory
rm -rf /opt/neotokyo-fm/server/downloads
ln -s /mnt/audio /opt/neotokyo-fm/server/downloads
```

## Network Configuration

### Port Mapping (LXC)

If using Proxmox port forwarding (e.g., container on internal bridge):

```bash
# On Proxmox host (iptables DNAT to container IP 192.168.100.200)
iptables -t nat -A PREROUTING -p tcp --dport 5050 -j DNAT --to-destination 192.168.100.200:5050
iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 192.168.100.200:80
```

### Tailscale (Recommended for Remote Access)

```bash
# Inside the container
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# → Access at http://100.x.x.x:5050 (API) / http://100.x.x.x:80 (Player)
```

### Cloudflare Tunnel

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Authenticate and create tunnel
cloudflared tunnel login
cloudflared tunnel create neotokyo
cloudflared tunnel route dns neotokyo player.your.domain
cloudflared tunnel run neotokyo
```

## Resource Recommendations

| Scenario | Cores | RAM | Disk | Mode |
|----------|-------|-----|------|------|
| Minimal (single user) | 1 | 1GB | 5GB | LXC + Docker |
| Standard (family) | 2 | 2GB | 20GB+ | LXC + Docker |
| Heavy (many downloads) | 4 | 4GB | 100GB+ | VM + Docker |
| Production / public | 4 | 8GB | 500GB+ | VM + Docker + TLS |

## Troubleshooting

**Container won't start:**
```bash
pct status 200
pct logs 200
# Check if template is missing: pveam list local
```

**Services not running after install:**
```bash
systemctl status neotokyo-grabber neotokyo-player
journalctl -u neotokyo-grabber -n 50 --no-pager
journalctl -u neotokyo-player -n 50 --no-pager
```

**Port already in use:**
```bash
ss -tlnp | grep -E '5050|80|3000'
# Change ports in docker-compose.yml or .env and restart
```

**Docker not available in LXC:**
- Ensure the container is created with `--features nesting=1`
- Verify `lxc.apparmor.profile: unconfined` and `lxc.cgroup2.devices.allow: c 10:200 rwm` are set in the container config
- Restart the container after config changes
