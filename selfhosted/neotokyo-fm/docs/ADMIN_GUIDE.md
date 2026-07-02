# NEOTOKYO FM — Admin Guide

## First Login

After installation, access the admin panel:

```
URL:   http://<your-server-ip>/admin
User:  admin
Pass:  (auto-generated — check /root/.neotokyo-admin-password on the server)
```

## Change Password

1. Log in to the admin panel
2. Go to **Settings** → **Change Password**
3. Enter current + new password

## Upload Music

1. Go to **Admin** → **Uploads**
2. Drag-and-drop audio files, or click to browse
3. Supported formats: MP3, FLAC, M4A, OGG, OPUS, WAV, AAC

## Download from YouTube

1. Go to **YouTube** page in the main player
2. Search for a track
3. Click the download icon
4. Choose format (MP3 128/320, FLAC, OPUS, Best Audio)
5. Track appears in Library once complete

## Manage Radio Stations

1. Go to **Admin** → **Radio**
2. Add/edit/remove stations
3. Test connectivity before saving

## Admin Dashboard Features

| Page | What You Can Do |
|------|-----------------|
| Dashboard | System stats, storage usage, top tracks |
| Songs | Browse, edit metadata, delete files |
| Downloads | View/download history, retry failed |
| Uploads | Upload audio files |
| Radio | Manage stations |
| Backups | Create/restore playlist backups |
| Settings | Change password, configure webhooks |
| Logs | Live streaming server logs |
| Scanner | Scan for missing metadata |
| Lyrics | View/fetch lyrics status per file |

## Backup & Restore

Auto-backups run daily at 18:30 UTC. To manually back up:

```bash
# On the server
docker compose exec server python -c "
from models.db import save_scheduled_backup
save_scheduled_backup('manual_backup')
print('Backup created')
"
```

## Troubleshooting

**Forgot admin password?**
```bash
# On the server
docker compose exec server cat /root/.neotokyo-admin-password
```

**Services not running?**
```bash
docker compose logs server
docker compose logs client
docker compose restart
```
