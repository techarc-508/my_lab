# NEOTOKYO FM — Troubleshooting Guide

## Installation Issues

### Container creation fails
```
Error: container already exists
```
Change VMID:
```bash
# Delete the old one
pct stop 200
pct destroy 200

# Or use a different ID
VMID=201 bash proxmox-helper.sh
```

### Template download fails
```bash
# List available templates
pveam available

# Try a different storage
STORAGE=local bash proxmox-helper.sh
```

### Docker not working in LXC
Ensure nesting is enabled:
```bash
pct set 200 --features nesting=1
pct stop 200 && pct start 200
```

Also verify these in `/etc/pve/lxc/200.conf`:
```
lxc.apparmor.profile: unconfined
lxc.cgroup2.devices.allow: c 10:200 rwm
```

---

## Application Issues

### Services won't start
```bash
# Check container
pct enter 200
cd /opt/neotokyo-fm

# View logs
docker compose logs server
docker compose logs client

# Restart
docker compose restart
```

### "Connection refused" on port 80 or 5050
```bash
# Check if containers are running
docker compose ps

# Rebuild
docker compose up --build -d
```

### Health check failing
```bash
# Test directly
curl -v http://localhost:5050/api/health

# Check server logs
docker compose logs server --tail=50
```

### Database issues
```bash
# Reset the database (will lose download history)
docker compose exec server rm /app/batch_history.db
docker compose restart server
```

---

## Cloudflare Tunnel Issues

### Tunnel won't start
```bash
# Check config
cloudflared tunnel info neotokyo-fm

# Test locally
cloudflared tunnel --config /root/.cloudflared/config.yml run neotokyo-fm
```

### DNS not resolving
```bash
# Check DNS routing
cloudflared tunnel route dns neotokyo-fm radio.rplab.qzz.io

# Verify in Cloudflare Dashboard: radio → CNAME → tunnel-id.cfargotunnel.com (orange cloud)
```

### Certificate expired
```bash
# Re-authenticate
cloudflared tunnel login
```

### Tunnel running but site not loading
Check the nginx service inside the container:
```bash
docker compose logs client
```

---

## Audio Playback Issues

### No audio / buffering
- Check the network connection
- Try a different browser (Chrome/Firefox recommended)
- Ensure audio files exist: `ls /opt/neotokyo-fm/server/downloads/ | head -20`

### YouTube playback fails
- YouTube may be blocked in your region
- Try a different video
- Check server logs: `docker compose logs server | grep yt`

### Radio stations won't play
- Some stations may be offline
- Try a different station/genre
- Check server logs: `docker compose logs server | grep radio`

### Lyrics not showing
- LRCLIB may be rate-limited (waits 5 minutes)
- Check: `docker compose exec server env | grep LRCLIB_SKIP`
- Set `LRCLIB_SKIP=0` in `.env` to re-enable

---

## Common Port Conflicts

### Port 80 in use
Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Change host port
```

### Port 5050 in use
Edit `docker-compose.yml`:
```yaml
ports:
  - "5051:5050"  # Change host port
```

---

## Getting Help

If issues persist:
1. Check logs: `journalctl -u neotokyo-grabber -n 100`
2. Check Docker logs: `docker compose logs --tail=100`
3. Open an issue on GitHub
