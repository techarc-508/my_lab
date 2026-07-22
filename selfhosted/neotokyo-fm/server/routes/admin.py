import os, json, logging, datetime, importlib, time, shutil, subprocess
import requests as http_requests
from flask import request, jsonify, Response, stream_with_context
from . import admin_bp
from config import DOWNLOADS_DIR, DEFAULT_DOWNLOAD_DIR, DEFAULT_PLAYLIST_DIR, METADATA_DIR, LOG_BUFFER, _start_time
from utils.security import auth_required, rate_limit
from utils.file_utils import ensure_meta_dir, sidecar_lyrics
from models.cache import LRUCache
from utils.circuit_breaker import get_breaker
from models.db import (add_podcast, get_podcast, delete_podcast, list_podcasts,
                        get_podcast_feed_urls, update_podcast, get_db)

_webhook_breaker = get_breaker('webhook', threshold=5, cooldown=60)

_socketio = None

def register_socketio_events(sio):
    global _socketio
    _socketio = sio

def emit_socketio(event: str, data: dict):
    if _socketio:
        try:
            _socketio.emit(event, data)
        except Exception:
            pass

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
        cb_lrclib = get_breaker('lrclib', threshold=10, cooldown=300)
        _health_cache = {
            'status': 'ok',
            'ffmpeg': ffmpeg_ver, 'lrclib': not cb_lrclib.is_open(),
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
    def _do_webhook_test():
        r = http_requests.post(url, json={'test': True, 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'},
                          timeout=10, headers={'User-Agent': 'NEOTOKYO-FM/1.0'})
        return {'ok': r.ok, 'status': r.status_code}
    try:
        return jsonify(_webhook_breaker.call(_do_webhook_test))
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
@auth_required
def log_play_event():
    from flask import session
    data = request.get_json() or {}
    title = data.get('title', 'Unknown')
    artist = data.get('artist', '')
    album = data.get('album', '')
    ip = request.remote_addr or ''
    user_id = session.get('user_id', 1)
    from models.db import log_play
    log_play(title, artist, album, ip, user_id)
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

@admin_bp.route('/scanner-status')
@auth_required
def scanner_status():
    from workers.metadata import get_scan_status
    return jsonify(get_scan_status())

@admin_bp.route('/stats/clear-plays', methods=['POST'])
@auth_required
def clear_plays():
    from models.db import clear_play_stats
    try:
        clear_play_stats()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/analytics/overview')
@auth_required
def analytics_overview():
    from models.db import get_db
    conn = get_db()
    try:
        top_tracks = conn.execute(
            'SELECT title, artist, COUNT(*) as play_count FROM play_log GROUP BY title ORDER BY play_count DESC LIMIT 10'
        ).fetchall()
        top_artists = conn.execute(
            'SELECT artist, COUNT(*) as play_count FROM play_log WHERE artist != "" GROUP BY artist ORDER BY play_count DESC LIMIT 10'
        ).fetchall()
        recent_count = conn.execute(
            "SELECT COUNT(*) as c FROM play_log WHERE played_at > datetime('now', '-24 hours')"
        ).fetchone()
        total_plays = conn.execute('SELECT COUNT(*) as c FROM play_log').fetchone()
        return jsonify({
            'top_tracks': [dict(r) for r in top_tracks],
            'top_artists': [dict(r) for r in top_artists],
            'plays_24h': dict(recent_count)['c'] if recent_count else 0,
            'total_plays': dict(total_plays)['c'] if total_plays else 0,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@admin_bp.route('/admin/ingestion-log')
@auth_required
def admin_ingestion_log():
    limit = request.args.get('limit', default=20, type=int)
    from models.db import get_recent_ingestions
    return jsonify(get_recent_ingestions(limit))

@admin_bp.route('/admin/reset-lrclib', methods=['POST'])
@auth_required
def reset_lrclib():
    try:
        cb_lrclib = get_breaker('lrclib', threshold=10, cooldown=300)
        cb_lrclib.reset()
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

@admin_bp.route('/analyze-gains', methods=['POST'])
@auth_required
@rate_limit(5, 60)
def trigger_gain_analysis():
    from workers.metadata import start_gain_analysis
    started = start_gain_analysis()
    if not started:
        return jsonify({'analyzing': False, 'error': 'Already analyzing'}), 409
    return jsonify({'analyzing': True})

@admin_bp.route('/gains/status')
@auth_required
def gain_analysis_status():
    from workers.metadata import get_gain_status
    return jsonify(get_gain_status())

@admin_bp.route('/gains/<path:filename>')
def get_file_gain(filename: str):
    from workers.metadata import get_gain_for_file
    from urllib.parse import unquote
    filename = unquote(filename)
    data = get_gain_for_file(filename)
    if not data:
        return jsonify({'error': 'No gain data'}), 404
    return jsonify(data)

@admin_bp.route('/analyze-gain/<path:filename>', methods=['POST'])
@auth_required
def analyze_single_gain(filename: str):
    from workers.metadata import analyze_track_gain
    from urllib.parse import unquote
    filename = unquote(filename)
    result = analyze_track_gain(filename)
    if not result:
        return jsonify({'error': 'Analysis failed'}), 500
    return jsonify(result)

@admin_bp.route('/gains')
@auth_required
def list_all_gains():
    from models.db import get_all_gain_tracks
    return jsonify(get_all_gain_tracks())

@admin_bp.route('/telemetry', methods=['POST'])
def receive_telemetry():
    try:
        events = request.get_json(force=True)
        if not isinstance(events, list):
            events = [events]
        from models.db import insert_qoe_events
        from config import TELEMETRY_SAMPLE_RATE
        if TELEMETRY_SAMPLE_RATE < 100:
            import random
            events = [e for e in events if random.randint(1, 100) <= TELEMETRY_SAMPLE_RATE]
        if events:
            insert_qoe_events(events, request.remote_addr or '')
        return jsonify({'ok': True, 'count': len(events)})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# --- Admin podcast endpoints ---

@admin_bp.route('/admin/podcasts', methods=['GET'])
@auth_required
def admin_list_podcasts():
    podcasts = list_podcasts()
    return jsonify(podcasts)

@admin_bp.route('/admin/podcasts/<int:podcast_id>', methods=['DELETE'])
@auth_required
@rate_limit(20, 60)
def admin_delete_podcast(podcast_id):
    podcast = get_podcast(podcast_id)
    if not podcast:
        return jsonify({'error': 'Not found'}), 404
    delete_podcast(podcast_id)
    return jsonify({'ok': True})

@admin_bp.route('/admin/podcasts/sync-all', methods=['POST'])
@auth_required
@rate_limit(5, 60)
def admin_sync_all_podcasts():
    feeds = get_podcast_feed_urls()
    count = 0
    for pid, _ in feeds:
        try:
            from routes.podcasts import sync_feed
            import threading
            threading.Thread(target=lambda: sync_feed(pid), daemon=True).start()
            count += 1
        except Exception:
            pass
    try:
        from workers.podcast_scheduler import auto_download_new_episodes
        threading.Thread(target=auto_download_new_episodes, daemon=True).start()
    except Exception:
        pass
    return jsonify({'syncing': count})

@admin_bp.route('/admin/podcasts/stats', methods=['GET'])
@auth_required
def admin_podcast_stats():
    conn = get_db()
    total_podcasts = conn.execute('SELECT COUNT(*) FROM podcasts').fetchone()[0]
    total_episodes = conn.execute('SELECT COUNT(*) FROM podcast_episodes').fetchone()[0]
    total_downloads = conn.execute('SELECT COUNT(*) FROM podcast_episodes WHERE downloaded = 1').fetchone()[0]
    conn.close()
    return jsonify({
        'total_podcasts': total_podcasts,
        'total_episodes': total_episodes,
        'total_downloads': total_downloads,
    })

@admin_bp.route('/admin/podcasts/seed', methods=['POST'])
@auth_required
@rate_limit(2, 60)
def admin_seed_podcasts():
    curated = [
        {'feed_url': 'https://feed.songexploder.net/SongExploder', 'title': 'Song Exploder', 'category': 'Music'},
        {'feed_url': 'https://feeds.npr.org/510319/podcast.xml', 'title': 'All Songs Considered', 'category': 'Music'},
        {'feed_url': 'https://feed.kexp.org/kexp/songoftheday', 'title': 'KEXP Song of the Day', 'category': 'Music'},
        {'feed_url': 'https://hnpod.libsyn.com/rss', 'title': 'The Hacker News', 'category': 'Technology'},
        {'feed_url': 'https://feeds.simplecast.com/4MtfQvqk', 'title': 'CodeNewbie', 'category': 'Technology'},
        {'feed_url': 'https://feed.syntax.fm/rss', 'title': 'Syntax.fm', 'category': 'Technology'},
        {'feed_url': 'https://softwareengineeringdaily.com/feed/podcast/', 'title': 'Software Engineering Daily', 'category': 'Technology'},
        {'feed_url': 'https://www.nasa.gov/rss/dynage/Podcast.xml', 'title': "NASA's Curious Universe", 'category': 'Science'},
        {'feed_url': 'https://www.sciencefriday.com/feed/', 'title': 'Science Friday', 'category': 'Science'},
        {'feed_url': 'https://feeds.simplecast.com/EmW8hzxo', 'title': 'Radiolab', 'category': 'Science'},
        {'feed_url': 'https://feeds.simplecast.com/BqbsxVfO', 'title': '99% Invisible', 'category': 'Arts & Culture'},
        {'feed_url': 'https://feeds.simplecast.com/YK2YKK6k', 'title': 'The Creative Brain', 'category': 'Arts & Culture'},
        {'feed_url': 'https://feeds.npr.org/510313/podcast.xml', 'title': 'How I Built This', 'category': 'Business'},
        {'feed_url': 'https://feeds.simplecast.com/izQk89nw', 'title': 'TED Talks Daily', 'category': 'Business'},
        {'feed_url': 'https://feeds.simplecast.com/UIpFBw4o', 'title': "Conan O'Brien Needs A Friend", 'category': 'Comedy'},
        {'feed_url': 'https://feeds.simplecast.com/0dfmArJv', 'title': 'Stuff You Should Know', 'category': 'Education'},
        {'feed_url': 'https://feeds.simplecast.com/FfJUPm5J', 'title': 'Ologies with Alie Ward', 'category': 'Education'},
        {'feed_url': 'https://feeds.simplecast.com/9D8S_5NS', 'title': 'Criminal', 'category': 'True Crime'},
        {'feed_url': 'https://feeds.simplecast.com/I2qJpX8D', 'title': 'Serial', 'category': 'True Crime'},
        {'feed_url': 'https://libsyn.libsyn.com/rss', 'title': 'The Feed: The Official Libsyn Podcast', 'category': 'Podcasting'},
    ]
    added = 0
    skipped = 0
    existing = {p['feed_url'] for p in list_podcasts()}
    for p in curated:
        if p['feed_url'] in existing:
            skipped += 1
            continue
        pid = add_podcast(p['feed_url'], title=p['title'], category=p['category'])
        if pid is not None:
            try:
                from routes.podcasts import sync_feed
                import threading
                threading.Thread(target=lambda: sync_feed(pid), daemon=True).start()
            except Exception:
                pass
            added += 1
        else:
            skipped += 1
    return jsonify({'added': added, 'skipped': skipped})
