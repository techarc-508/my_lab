# v4 Shipping Plan — v1 → v4 Upgrade

## Current State (radio.rplab)

**Two services running via systemd/watchdog (`start.sh`):**
| Service | Port | How |
|---------|------|-----|
| Flask (gunicorn) | :5050 | `neotokyo-grabber.service` + `start.sh` watchdog |
| Vite dev server | :3000 | `start.sh` runs `npx vite --host` (dev mode) |

**Alternatively via Docker:** `docker compose up --build` (nginx on :80, flask on :5050)

---

## Upgrade Steps

### 1. Backup (do first, always)

```bash
# DB backup
cp server/batch_history.db server/batch_history.db.v4-preupgrade

# Auto-backup already runs daily at 18:30 UTC to server/downloads/.auto_backups/
# Trigger one manually:
curl -X POST http://localhost:5050/api/admin/podcasts/backup  # (if available)

# Or just copy the whole project
cd /mnt/data/projects/mini_radio && tar czf ../neotokyo-v1-backup-$(date +%Y%m%d).tgz .
```

### 2. Pull & Install

```bash
cd /mnt/data/projects/mini_radio

# Get latest code
git fetch origin
git stash  # save any local changes
git checkout main  # or the release branch
git pull --ff-only

# Server deps
cd server
pip install -r requirements.txt

# Client deps + build
cd ../client
npm ci
```

### 3. Client: Switch to Production Build

**Critical change:** v1 runs `npx vite --host` (dev server). v4 should use the production build.

**Option A — Nginx (recommended for radio.rplab systemd setup):**
- Install nginx on the host
- Use the `client/nginx.conf` to serve `client/dist/`
- Proxy `/api/` to `localhost:5050`
- Replace the `start_client()` in `start.sh` with:
```bash
start_client() {
  cd "$CLIENT_DIR"
  npm run build
  nohup npx vite preview --host --port 3000 >> "$CLIENT_LOG" 2>&1 &
  echo $! > "$CLIENT_PIDFILE"
  wait $! 2>/dev/null
}
```

**Option B — Docker (already correct):**
```bash
docker compose up --build
```
This builds the client into nginx (`client/Dockerfile`) and correctly serves `dist/`.

### 4. Run Database Migrations

Alembic is configured and runs automatically at server startup (`app.py:237`). The `init_db()` function creates all new tables inline. **No manual migration step needed** — just restart the server.

To verify:
```bash
cd server && python3 -c "from alembic.config import Config; from alembic import command; cfg = Config('alembic.ini'); command.upgrade(cfg, 'head')"
```

### 5. Restart Services

**Via systemd:**
```bash
sudo systemctl restart neotokyo-grabber.service
./start.sh restart
```

**Via Docker:**
```bash
docker compose down && docker compose up --build -d
```

---

## What Changes on Upgrade (User-Facing)

| Area | v1 | v4 | Breaking? |
|------|----|----|-----------|
| Login | username + password | username + password (same) | No |
| API endpoints | all existing | all existing + new podcasts, subsonic, profile, auth/* | No |
| Subsonic API | 8 endpoints | 25 endpoints + JSON format + OpenSubsonic | No (additive) |
| Library | browse + search | same + ReplayGain loudness normalization | No |
| Radio | same | same | No |
| Podcasts | — | new full podcast system with subscriptions, downloads | New feature |
| Music Videos | — | YouTube video overlay, PiP, mini-player | New feature |
| User Profiles | none | avatar, display name, email, sessions, settings | New feature |
| PWA | basic | background sync, share target, haptics, iOS unlock | Enhancement |
| UI | fixed 72px sidebar | expandable sidebar, glassmorphism, hover cards | Visual change |
| Admin panel | basic user/radio/files | + podcast management, gain analysis, users CRUD | New admin pages |
| DB | 8 tables | 15 tables (7 new) | Not breaking |
| Dependencies | baseline | +feedparser, prometheus-client optional | pip handles |

---

## Rollback Plan

```bash
cd /mnt/data/projects/mini_radio

# 1. Restore DB
cp server/batch_history.db.v4-preupgrade server/batch_history.db

# 2. Revert code
git reset --hard HEAD~1  # or git checkout <v1-tag>

# 3. Rebuild client
cd client && npm ci && npm run build

# 4. Restart services
./start.sh restart
```

---

## Verification Checklist

After upgrade, confirm:

- [ ] `curl http://localhost:5050/api/health` → `status: ok`
- [ ] `curl http://localhost:5050/api/login` with admin creds → returns token
- [ ] Browser loads `http://localhost:3000` (or reverse proxy) without errors
- [ ] Admin panel accessible: `/admin` → login → see dashboard
- [ ] Podcasts page accessible: `/podcasts`
- [ ] Settings page accessible: `/settings`
- [ ] Music library loads and plays
- [ ] Subsonic API: `curl "http://localhost:5050/api/subsonic/ping?u=admin&p=admin123&c=test&f=json"` → `subsonic-response`
- [ ] Password reset: `POST /api/auth/forgot-password` returns 200
- [ ] OAuth config: env vars set → `/api/oauth/discord/login` redirects
