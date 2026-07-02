# NEOTOKYO FM — Cloudflare Tunnel Guide

## Overview

NEOTOKYO FM uses **Cloudflare Tunnel** (cloudflared) to expose the service publicly at `https://radio.rplab.qzz.io` **without opening any firewall ports**.

### How It Works

```
Browser ──https──→ Cloudflare ──tunnel──→ LXC Container
                                            │
                                    localhost:80 (nginx)
                                            │
                                    localhost:5050 (Flask API)
```

- Traffic is encrypted end-to-end
- Zero open ports on your home network
- Automatic SSL/TLS certificate management
- DDoS protection, HTTP/2, Brotli compression at Cloudflare edge

---

## Automated Setup

The installer script handles everything:

```bash
bash /opt/neotokyo-fm/deploy/cloudflare-tunnel.sh
```

This will:
1. Install `cloudflared`
2. Open a browser for Cloudflare authentication (one-time)
3. Create a tunnel named `neotokyo-fm`
4. Route `radio.rplab.qzz.io` to the local service
5. Install as a systemd service (auto-restarts on boot)

---

## Manual Setup

### 1. Install cloudflared

```bash
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb
```

### 2. Authenticate

```bash
cloudflared tunnel login
```

Follow the URL to authorize with your Cloudflare account.

### 3. Create tunnel

```bash
cloudflared tunnel create neotokyo-fm
```

### 4. Route DNS

```bash
cloudflared tunnel route dns neotokyo-fm radio.rplab.qzz.io
```

### 5. Configure ingress

Create `/root/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: radio.rplab.qzz.io
    service: http://localhost:80
  - service: http_status:404
```

### 6. Run as service

```bash
cloudflared service install
systemctl start cloudflared
systemctl enable cloudflared
```

---

## Verification

```bash
# Check tunnel status
cloudflared tunnel list

# Check service status
systemctl status cloudflared

# View logs
journalctl -u cloudflared -f
```

## Updating

```bash
cloudflared update
```

## Removing

```bash
cloudflared tunnel delete neotokyo-fm
cloudflared service uninstall
```

## DNS Records

The tunnel creates a CNAME record automatically. You can verify in Cloudflare Dashboard:
- **DNS** → `radio` CNAME → `<tunnel-id>.cfargotunnel.com`
- **Proxied** (orange cloud) — must be enabled for tunnel to work
