# Troubleshooting — Remote Access Tunnel System

## Listener Issues

### Listener is not responding to commands
```bash
# Check if the service is running
systemctl --user status ntfy-cmd-listener.service

# Check recent logs
journalctl --user -u ntfy-cmd-listener -n 20 --no-pager

# Restart if stuck
systemctl --user restart ntfy-cmd-listener.service
```

### Listener starts but stops immediately
Check for Python errors:
```bash
journalctl --user -u ntfy-cmd-listener --no-pager -p err
```

Common causes:
- Missing `python3` — install with `apt install python3`
- Curl not installed — `apt install curl`
- Invalid syntax in notify.conf — check the file

### Commands not being processed (no response)
The listener skips messages tagged `bot`. If you're testing with `curl`, make sure you don't include `bot` in the tags:

```bash
# ✅ Correct — no bot tag
curl -d "status" https://ntfy.sh/pushpal-cmd

# ❌ Wrong — will be ignored
curl -d "status" -H "Tags: bot" https://ntfy.sh/pushpal-cmd
```

## Tunnel Connection Issues

### Bore fails to connect
```bash
# Check tunnel logs
journalctl --user -u bore-tunnel -n 20 --no-pager

# Try manually
bore local 4000 --to bore.pub
```

Common causes:
- **bore.pub is down** — try an alternative server:
  ```bash
  bore local 4000 --to bore.pub:8080
  ```
- **Port 4000 not accessible** — verify NoMachine is listening:
  ```bash
  ss -tlnp | grep 4000
  ```
- **Binary outdated** — download latest from https://github.com/ekzhang/bore

### Pinggy fails to connect
```bash
# Check tunnel logs
journalctl --user -u pinggy-tunnel -n 20 --no-pager

# Try manually
ssh -p 443 -o StrictHostKeyChecking=no -R 0:localhost:4000 tcp@a.pinggy.io
```

Common causes:
- **Pinggy server down** — check https://pinggy.io for status
- **SSH blocked** — verify outbound SSH on port 443:
  ```bash
  nc -zv a.pinggy.io 443
  ```
- **NoMachine not running** — start NoMachine server first

### Tunnel connects but NoMachine can't connect
```bash
# Verify NoMachine is actually listening
ss -tlnp | grep 4000

# Check NoMachine status
systemctl status nxserver.service 2>/dev/null || /usr/NX/bin/nxserver --status
```

## Notification Issues

### Not getting responses on phone
1. Check that the listener is running (see above)
2. Verify notify.conf has the correct topic:
   ```bash
   grep NTFY_CMD_TOPIC ~/.config/tunnel/notify.conf
   ```
3. Test ntfy.sh directly:
   ```bash
   curl -d "hello from vm" https://ntfy.sh/pushpal-cmd
   ```
4. Check your phone's ntfy.sh app subscription to `pushpal-cmd`

### Getting duplicate messages
The `last_msg_id` cache might be stale:
```bash
# Reset the cache (will re-process last message on next connect)
rm -f ~/.cache/ntfy-cmd/last_msg_id
systemctl --user restart ntfy-cmd-listener.service
```

## Systemd Issues

### Service won't start
```bash
# Check for errors
journalctl --user -u <service> --no-pager -p err

# Verify the ExecStart script exists and is executable
ls -la ~/.local/bin/<script>

# Reload systemd after manual file changes
systemctl --user daemon-reload
```

### Service starts then immediately stops
The script has `set -e` — any error causes immediate exit. Check logs:
```bash
journalctl --user -u bore-tunnel -n 50 --no-pager
```

## Pinggy Countdown Issues

### Countdown shows wrong time
The countdown resets on every Pinggy reconnect. If the tunnel has been running for a while without reconnecting, the countdown reflects time since last reconnect (which is approximately when the 60-min timer started).

To reset: send `stop` then `fast` again.

### Countdown shows "expiring now" but tunnel still works
Pinggy's actual timeout is 60 minutes from the _last data transfer_, not from when the tunnel started. If there's active traffic, the tunnel may stay alive beyond the countdown. The countdown is an estimate.

## ISP / Network Issues

### Alliance Broadband-specific
- **Telegram blocked** — all `149.154.x.x` IPs are blocked. Use ntfy.sh instead.
- **No IPv6** — this network doesn't have IPv6. All tunnels use IPv4.
- **CGNAT** — double NAT; port forwarding impossible. Tunnels are the only option.

### General network checks
```bash
# Test internet connectivity
ping -c 3 8.8.8.8

# Test DNS resolution
nslookup bore.pub

# Test outbound connectivity to tunnel servers
nc -zv bore.pub 443
nc -zv a.pinggy.io 443
```

## Recovery Procedures

### Full restart (all services)
```bash
systemctl --user stop bore-tunnel.service pinggy-tunnel.service
systemctl --user restart ntfy-cmd-listener.service
```

### After VM reboot
The listener auto-starts (enabled service). Tunnels stay off until you send `bore` or `fast` from your phone.

### Restore from scratch
Restore the checkpoint:
```bash
~/Documents/Remote-Access-Setup/checkpoint-20260618-2025/
# Follow restore instructions in checkpoint-state.txt
```
