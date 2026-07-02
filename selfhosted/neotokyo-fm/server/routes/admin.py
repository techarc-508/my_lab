import os, json, logging, datetime, importlib, time, shutil, subprocess
import requests as http_requests
from flask import request, jsonify, Response, stream_with_context
from . import admin_bp
from config import DOWNLOADS_DIR, DEFAULT_DOWNLOAD_DIR, DEFAULT_PLAYLIST_DIR, METADATA_DIR, LOG_BUFFER, _start_time
from utils.security import auth_required
from utils.file_utils import ensure_meta_dir, sidecar_lyrics
from models.cache import LRUCache

logger = logging.getLogger('batch_dl')

_stats_cache = LRUCache(maxsize=1, ttl=30)
_health_cache = None
_system_cache = LRUCache(maxsize=1, ttl=30)

@admin_bp.route('/logs')
@auth_required
def get_logs():
    lines = request.args.get('lines', '200')
    try:
        n = min(int(lines), 500)
    except ValueError:
        n = 200
    buf = list(LOG_BUFFER)[-n:]
    return '\n'.join(buf), 200, {'Content-Type': 'text/plain; charset=utf-8'}

@admin_bp.route('/logs/stream')
@auth_required
def log_stream():
    def generate():
        last_len = len(LOG_BUFFER)
        while True:
            time.sleep(0.5)
            current_len = len(LOG_BUFFER)
            if current_len > last_len:
                new_lines = list(LOG_BUFFER)[last_len - current_len:]
                for line in new_lines:
                    yield f"data: {json.dumps({'text': line})}\n\n"
                last_len = current_len
    return Response(stream_with_context(generate()), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@admin_bp.route('/health')
def api_health():
    global _health_cache
    if _health_cache is None:
        import sys
        ffmpeg_ver = None
        try:
            r = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=5)
            if r.returncode == 0:
                ffmpeg_ver = r.stdout.split('\n')[0].strip()
        except Exception:
            ffmpeg_ver = None
        lrclib_ok = True
        try:
            from services.lrclib import _lrclib_disabled
            lrclib_ok = not _lrclib_disabled
        except Exception:
            lrclib_ok = False
        _health_cache = {
            'status': 'ok',
            'ffmpeg': ffmpeg_ver, 'lrclib': lrclib_ok,
            'python': sys.version,
            'download_dir': DEFAULT_DOWNLOAD_DIR,
        }
    return jsonify({
        **_health_cache,
        'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
    })

@admin_bp.route('/settings', methods=['GET'])
@auth_required
def get_settings():
    return jsonify({
        'download_dir': DEFAULT_DOWNLOAD_DIR,
        'playlist_dir': DEFAULT_PLAYLIST_DIR,
        'metadata_dir': METADATA_DIR,
        'output_dir': DOWNLOADS_DIR,
        'ytdlp_available': importlib.util.find_spec('yt_dlp') is not None,
    })

@admin_bp.route('/stats')
@auth_required
def admin_stats():
    cached = _stats_cache.get('stats')
    if cached is not None:
        return jsonify(cached)
    audio_exts = {'.mp3','.flac','.m4a','.ogg','.wav','.webm','.opus'}
    try:
        files = [f for f in os.listdir(DEFAULT_DOWNLOAD_DIR) if os.path.isfile(os.path.join(DEFAULT_DOWNLOAD_DIR, f)) and os.path.splitext(f)[1].lower() in audio_exts]
        total_size = sum(os.path.getsize(os.path.join(DEFAULT_DOWNLOAD_DIR, f)) for f in files)
        result = {'total_files': len(files), 'total_size': total_size, 'download_dir': DEFAULT_DOWNLOAD_DIR}
        _stats_cache.set('stats', result)
        return jsonify(result)
    except Exception as e:
        logger.error(f"admin/stats error: {e}")
        return jsonify({'error': 'Failed to get stats'}), 500

@admin_bp.route('/stats/library-breakdown')
@auth_required
def library_breakdown():
    from utils.file_utils import sidecar_info, sidecar_lyrics
    audio_exts = {'.mp3','.flac','.m4a','.ogg','.wav','.webm','.opus'}
    genre_counts: dict[str, int] = {}
    format_counts: dict[str, int] = {}
    total_lyrics = 0
    total_files = 0
    try:
        for fn in os.listdir(DEFAULT_DOWNLOAD_DIR):
            fp = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)
            if not os.path.isfile(fp) or os.path.splitext(fn)[1].lower() not in audio_exts:
                continue
            total_files += 1
            ext = os.path.splitext(fn)[1].lower()
            format_counts[ext] = format_counts.get(ext, 0) + 1
            base = os.path.splitext(fn)[0]
            mfp = sidecar_info(base)
            if os.path.isfile(mfp):
                try:
                    with open(mfp) as f:
                        meta = json.load(f)
                    g = meta.get('genre', '').strip()
                    if g:
                        genre_counts[g] = genre_counts.get(g, 0) + 1
                except Exception:
                    pass
            if os.path.isfile(sidecar_lyrics(base)):
                total_lyrics += 1
        return jsonify({
            'total_files': total_files,
            'genres': [{'name': k, 'count': v} for k, v in sorted(genre_counts.items(), key=lambda x: -x[1])],
            'formats': [{'ext': k, 'count': v} for k, v in sorted(format_counts.items(), key=lambda x: -x[1])],
            'with_lyrics': total_lyrics,
        })
    except Exception as e:
        logger.error(f"library_breakdown error: {e}")
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/retry-metadata', methods=['POST'])
@auth_required
def retry_metadata():
    from workers.metadata import scan_for_metadata
    count = scan_for_metadata()
    return jsonify({'scanned': count})

@admin_bp.route('/admin/system')
@auth_required
def system_info():
    cached = _system_cache.get('system')
    if cached is not None:
        return jsonify(cached)
    uptime_secs = time.time() - _start_time
    days, rem = divmod(uptime_secs, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    uptime_str = f"{int(days)}d {int(hours)}h {int(minutes)}m {int(secs)}s"
    disk = shutil.disk_usage(DEFAULT_DOWNLOAD_DIR)
    active_downloads = 0
    try:
        from models.download_state import _downloads, _downloads_lock
        with _downloads_lock:
            active_downloads = sum(1 for d in _downloads.values() if d.get('status') in ('running', 'pending'))
    except Exception:
        pass
    cpu = None
    try:
        cpu = os.cpu_count() or None
    except Exception:
        pass
    mem = None
    try:
        with open('/proc/meminfo') as f:
            for line in f:
                if line.startswith('MemTotal:'):
                    mem = int(line.split()[1]) * 1024
                    break
    except Exception:
        pass
    result = {
        'uptime': uptime_str, 'uptime_secs': uptime_secs,
        'disk_total': disk.total, 'disk_used': disk.used, 'disk_free': disk.free,
        'active_downloads': active_downloads,
        'cpu_count': cpu, 'memory_total': mem,
        'ffmpeg': None,
    }
    _system_cache.set('system', result)
    return jsonify(result)

@admin_bp.route('/admin/webhooks', methods=['GET', 'POST'])
@auth_required
def webhooks_handler():
    webhooks_file = os.path.join(METADATA_DIR, 'webhooks.json')
    if request.method == 'POST':
        data = request.get_json() or {}
        hooks = data.get('webhooks', [])
        if isinstance(hooks, list):
            for h in hooks:
                h.pop('testing', None)
            with open(webhooks_file, 'w') as f:
                json.dump(hooks, f)
        return jsonify(hooks)
    if os.path.isfile(webhooks_file):
        with open(webhooks_file) as f:
            return jsonify(json.load(f))
    return jsonify([])

@admin_bp.route('/admin/webhooks/test', methods=['POST'])
@auth_required
def webhook_test():
    data = request.get_json() or {}
    url = data.get('url', '').strip()
    if not url:
        return jsonify({'error': 'No URL'}), 400
    try:
        r = http_requests.post(url, json={'test': True, 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'},
                          timeout=10, headers={'User-Agent': 'NEOTOKYO-FM/1.0'})
        return jsonify({'ok': r.ok, 'status': r.status_code})
    except http_requests.exceptions.Timeout:
        return jsonify({'ok': False, 'status': 0}), 200
    except Exception as e:
        return jsonify({'ok': False, 'status': 0}), 200

@admin_bp.route('/stats/batch-history')
@auth_required
def batch_history():
    try:
        db_path = os.path.join(METADATA_DIR, 'cached.db')
        if os.path.isfile(db_path):
            import sqlite3
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.execute('SELECT id, title, url, created_at, status FROM batches ORDER BY created_at DESC LIMIT 100')
            rows = [dict(r) for r in cursor.fetchall()]
            conn.close()
            return jsonify(rows)
    except Exception as e:
        logger.warning(f"Batch history error: {e}")
    return jsonify([])

@admin_bp.route('/play/log', methods=['POST'])
def log_play_event():
    data = request.get_json() or {}
    title = data.get('title', 'Unknown')
    artist = data.get('artist', '')
    album = data.get('album', '')
    ip = request.remote_addr or ''
    from models.db import log_play
    log_play(title, artist, album, ip)
    return jsonify({'ok': True})

@admin_bp.route('/stats/plays')
@auth_required
def stats_plays():
    from models.db import get_most_played
    return jsonify(get_most_played(20))

@admin_bp.route('/stats/artists')
@auth_required
def stats_artists():
    from models.db import get_top_artists
    return jsonify(get_top_artists(20))

@admin_bp.route('/stats/recent-plays')
@auth_required
def stats_recent_plays():
    from models.db import get_recent_plays
    return jsonify(get_recent_plays(30))

@admin_bp.route('/stats/visits')
@auth_required
def stats_visits():
    from models.db import get_recent_visits
    return jsonify(get_recent_visits(30))

@admin_bp.route('/stats/scheduled-backups')
@auth_required
def stats_scheduled_backups():
    from models.db import get_scheduled_backups
    return jsonify(get_scheduled_backups())

@admin_bp.route('/fetch-lyrics', methods=['POST'])
@auth_required
def fetch_lyrics():
    data = request.get_json() or {}
    filename = data.get('filename', '').strip()
    target = data.get('target', 'all')

    from services.lrclib import fetch_lyrics_from_lrclib
    from utils.file_utils import safe_path, sidecar_lyrics, sidecar_info, ensure_meta_dir, is_audio_file
    from workers.metadata import detect_sidecar_type
    from concurrent.futures import ThreadPoolExecutor, as_completed

    results = {'fetched': 0, 'skipped': 0, 'errors': 0, 'files': []}

    audio_exts = {'.mp3','.flac','.m4a','.ogg','.wav','.webm','.opus'}

    if filename:
        candidates = [filename]
    else:
        candidates = [
            f for f in os.listdir(DEFAULT_DOWNLOAD_DIR)
            if not f.startswith('.')
            and os.path.isfile(os.path.join(DEFAULT_DOWNLOAD_DIR, f))
            and os.path.splitext(f)[1].lower() in audio_exts
        ]

    def process_one(fn):
        base = os.path.splitext(fn)[0]
        fp = safe_path(fn)
        if not fp or not os.path.isfile(fp):
            return {'filename': fn, 'status': 'error', 'reason': 'file_not_found'}

        lrc_path = sidecar_lyrics(base)
        if os.path.isfile(lrc_path) and target != 'force':
            return {'filename': fn, 'status': 'skipped', 'reason': 'exists'}

        meta = {}
        meta_fp = sidecar_info(base)
        if os.path.isfile(meta_fp):
            try:
                with open(meta_fp) as f:
                    meta = json.load(f)
            except Exception:
                pass

        title = meta.get('title', '') or base
        artist = meta.get('artist', '')

        for attempt in range(2):
            try:
                lrc_text = fetch_lyrics_from_lrclib(base, title, artist, fp)
                if lrc_text:
                    ensure_meta_dir(base)
                    with open(lrc_path, 'w', encoding='utf-8') as f:
                        f.write(lrc_text)
                    return {'filename': fn, 'status': 'ok'}
                else:
                    if attempt < 1:
                        time.sleep(0.5)
                        continue
                    return {'filename': fn, 'status': 'not_found'}
            except Exception as e:
                if attempt < 1:
                    time.sleep(0.5)
                    continue
                return {'filename': fn, 'status': 'error', 'reason': str(e)}

    if len(candidates) == 1:
        r = process_one(candidates[0])
        results['files'].append(r)
    else:
        max_workers = min(4, len(candidates))
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            fut_map = {pool.submit(process_one, fn): fn for fn in candidates}
            for fut in as_completed(fut_map):
                try:
                    r = fut.result()
                    results['files'].append(r)
                except Exception as e:
                    results['files'].append({'filename': fut_map[fut], 'status': 'error', 'reason': str(e)})

    for r in results['files']:
        if r['status'] == 'ok':
            results['fetched'] += 1
        elif r['status'] in ('not_found', 'skipped'):
            results['skipped'] += 1
        else:
            results['errors'] += 1

    return jsonify(results)

@admin_bp.route('/lyrics-status')
@auth_required
def lyrics_status():
    audio_exts = {'.mp3','.flac','.m4a','.ogg','.wav','.webm','.opus'}
    files = []
    try:
        for fn in os.listdir(DEFAULT_DOWNLOAD_DIR):
            fp = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)
            if not os.path.isfile(fp) or os.path.splitext(fn)[1].lower() not in audio_exts:
                continue
            base = os.path.splitext(fn)[0]
            lrc = sidecar_lyrics(base)
            meta = {}
            try:
                from utils.file_utils import sidecar_info
                mfp = sidecar_info(base)
                if os.path.isfile(mfp):
                    with open(mfp) as f:
                        meta = json.load(f)
            except Exception:
                pass
            files.append({
                'name': fn,
                'title': meta.get('title', '') or '',
                'artist': meta.get('artist', '') or '',
                'has_lyrics': os.path.isfile(lrc),
                'size': os.path.getsize(fp),
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    return jsonify({'files': files})

@admin_bp.route('/stats/clear-plays', methods=['POST'])
@auth_required
def clear_plays():
    from models.db import clear_play_stats
    try:
        clear_play_stats()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/admin/reset-lrclib', methods=['POST'])
@auth_required
def reset_lrclib():
    try:
        from services.lrclib import _lrclib_disabled, _lrclib_failures, _lrclib_disabled_at, _lrclib_lock
        with _lrclib_lock:
            _lrclib_disabled = False
            _lrclib_failures = 0
            _lrclib_disabled_at = 0.0
        logger.info("LRCLIB circuit breaker manually reset")
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/backups/<backup_id>/restore', methods=['POST'])
@auth_required
def restore_backup(backup_id):
    from models.db import get_backup
    row = get_backup(backup_id)
    if not row:
        return jsonify({'error': 'Backup not found'}), 404
    try:
        data = json.loads(row['data'])
        restored = 0
        for entry in data:
            for filename, content in entry.items():
                fp = os.path.join(DEFAULT_PLAYLIST_DIR, filename)
                with open(fp, 'w') as f:
                    json.dump(content, f, indent=2)
                restored += 1
        return jsonify({'ok': True, 'restored': restored, 'version': row['version']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
