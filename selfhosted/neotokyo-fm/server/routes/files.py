import os, json, io, csv, re, base64, time, threading, logging
from urllib.parse import quote
from flask import request, jsonify, Response, send_from_directory
from . import files_bp
from config import DEFAULT_DOWNLOAD_DIR, HAS_YTDLP, LRCLIB_TIMEOUT, LRCLIB_SKIP, METADATA_DIR
from utils.file_utils import safe_path, sidecar_cover, sidecar_lyrics, sidecar_info, is_audio_file, ensure_meta_dir, extract_filename_from_url, is_streaming_url, metadata_subdir
from utils.security import auth_required, rate_limit
from utils.svg import generate_fallback_svg
from utils.circuit_breaker import get_breaker

_lrclib_breaker = get_breaker('lrclib', threshold=10, cooldown=300)

logger = logging.getLogger('batch_dl')

@files_bp.after_request
def add_caching(response):
    if response.status_code == 200:
        path = request.path
        if '/audio/' in path:
            response.headers['Cache-Control'] = 'public, max-age=3600'
        elif '/cover/' in path:
            response.headers.setdefault('Cache-Control', 'public, max-age=86400')
        elif '/metadata/' in path or '/lyrics' in path or '/meta-file/' in path:
            response.headers['Cache-Control'] = 'public, max-age=600'
    return response

def stream_with_chunk(fp, offset, length):
    with open(fp, 'rb') as f:
        f.seek(offset)
        remaining = length
        while remaining > 0:
            chunk = f.read(min(65536, remaining))
            if not chunk: break
            remaining -= len(chunk)
            yield chunk

@files_bp.route('/search')
def search_files():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'results': [], 'count': 0})
    try:
        from models.db import search_tracks_fts
        results = search_tracks_fts(q)
        return jsonify({'results': results, 'count': len(results)})
    except Exception:
        return jsonify({'results': [], 'count': 0})

@files_bp.route('/library/tree')
def library_tree():
    tree = []
    for entry in sorted(os.listdir(DEFAULT_DOWNLOAD_DIR)):
        if entry.startswith('.'):
            continue
        path = os.path.join(DEFAULT_DOWNLOAD_DIR, entry)
        if os.path.isdir(path):
            children = []
            for f in os.listdir(path):
                if is_audio_file(f):
                    children.append({
                        'filename': f'{entry}/{f}',
                        'name': f,
                        'size': os.path.getsize(os.path.join(path, f)),
                    })
            tree.append({'name': entry, 'type': 'directory', 'children': children})
        elif is_audio_file(entry):
            tree.append({'name': entry, 'type': 'file', 'filename': entry, 'size': os.path.getsize(path)})
    return jsonify({'tree': tree, 'count': len(tree)})

@files_bp.route('/files')
@rate_limit(100, 60)
def list_files():
    try:
        limit = request.args.get('limit', type=int, default=0)
        offset = request.args.get('offset', type=int, default=0)
        files = []
        for f in os.listdir(DEFAULT_DOWNLOAD_DIR):
            if f.startswith('.'): continue
            from workers.metadata import detect_sidecar_type
            base_side, _ = detect_sidecar_type(f)
            if base_side is not None: continue
            fp = os.path.join(DEFAULT_DOWNLOAD_DIR, f)
            if os.path.isfile(fp) and os.path.getsize(fp) > 0:
                mtime = os.path.getmtime(fp)
                files.append({'name': f, 'size': os.path.getsize(fp), 'modified': mtime})
        files.sort(key=lambda x: x['modified'], reverse=True)
        total = len(files)
        if limit > 0:
            files = files[offset:offset + limit]
        return jsonify({'files': files, 'count': len(files), 'total': total, 'limit': limit, 'offset': offset})
    except Exception as e:
        return jsonify({'error': str(e), 'files': [], 'count': 0})

@files_bp.route('/audio/<path:filename>')
def stream_audio(filename):
    safe = safe_path(os.path.basename(filename))
    if safe is None:
        return jsonify({'error': 'Invalid path'}), 400
    fp = safe
    if not os.path.isfile(fp):
        return jsonify({'error': 'File not found'}), 404
    size = os.path.getsize(fp)
    ext = os.path.splitext(safe)[1].lower()
    mime_map = {
        '.mp3': 'audio/mpeg', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4',
        '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
        '.flac': 'audio/flac',
    }
    content_type = mime_map.get(ext, 'audio/mpeg')
    range_header = request.headers.get('Range', None)
    if range_header:
        start, end = 0, size - 1
        match = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if match:
            start = int(match.group(1))
            if match.group(2):
                end = int(match.group(2))
        length = end - start + 1
        return Response(stream_with_chunk(fp, start, length), status=206, mimetype=content_type, headers={
            'Content-Range': f'bytes {start}-{end}/{size}', 'Content-Length': str(length), 'Accept-Ranges': 'bytes',
        })
    return Response(stream_with_chunk(fp, 0, size), mimetype=content_type, headers={
        'Content-Length': str(size), 'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
    })

@files_bp.route('/cover/<path:filename>')
def serve_cover(filename):
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None:
        return jsonify({'error': 'Invalid path'}), 400
    base = os.path.splitext(fn)[0]
    fp = sidecar_cover(base)
    if fp:
        resp = send_from_directory(os.path.dirname(fp), os.path.basename(fp))
        resp.headers['Cache-Control'] = 'public, max-age=86400'
        resp.headers['ETag'] = f'"{quote(base, safe="")}-cover"'
        return resp
    from workers.metadata import get_track_genre_and_metadata
    genre, title, artist = get_track_genre_and_metadata(safe)
    if not genre:
        full_text = f"{title} {artist}".lower()
        if any(w in full_text for w in ["lofi", "lo-fi", "chill", "relax", "study", "sleep"]):
            genre = "lofi"
        elif any(w in full_text for w in ["city pop", "citypop", "sunset", "pop", "mari", "tatsuro", "anri", "plastic love", "80s", "disco"]):
            genre = "city pop"
        elif any(w in full_text for w in ["synthwave", "retrowave", "outrun", "cyberpunk", "cyber", "grid"]):
            genre = "synthwave"
        elif any(w in full_text for w in ["anime", "jpop", "j-pop", "vocaloid", "miku", "kawaii"]):
            genre = "anime"
        elif any(w in full_text for w in ["future funk", "funk", "disco"]):
            genre = "future funk"
    svg_content = generate_fallback_svg(genre, title, artist)
    resp = Response(svg_content, mimetype='image/svg+xml')
    resp.headers['Cache-Control'] = 'public, max-age=3600'
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    return resp

@files_bp.route('/lyrics')
def get_lyrics():
    title = request.args.get('title', '').strip()
    artist = request.args.get('artist', '').strip()
    filename = request.args.get('filename', '').strip()
    if filename:
        fn = os.path.basename(filename)
        safe = safe_path(fn)
        if safe:
            base = os.path.splitext(fn)[0]
            fp = sidecar_lyrics(base)
            if os.path.isfile(fp):
                try:
                    with open(fp, 'r', encoding='utf-8') as f:
                        text = f.read()
                    parsed = parse_lrc(text)
                    if parsed:
                        return jsonify({'source': 'sidecar', 'lines': parsed, 'plain': text})
                    plain_lines = [{'time': None, 'text': l} for l in text.split('\n') if l.strip()]
                    return jsonify({'source': 'sidecar', 'lines': plain_lines, 'plain': text})
                except Exception:
                    pass
    if not title or LRCLIB_SKIP or _lrclib_breaker.is_open():
        return jsonify({'source': None, 'lines': [], 'plain': None})
    try:
        from config import HTTP_SESSION
        params = {'track_name': title}
        if artist:
            params['artist_name'] = artist
        resp = HTTP_SESSION.get('https://lrclib.net/api/get', params=params, timeout=LRCLIB_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            synced = data.get('syncedLyrics')
            plain = data.get('plainLyrics')
            if synced:
                return jsonify({'source': 'lrclib', 'lines': parse_lrc(synced), 'plain': plain})
            if plain:
                lines_list = [{'time': None, 'text': l} for l in plain.split('\n') if l.strip()]
                return jsonify({'source': 'lrclib', 'lines': lines_list, 'plain': plain})
        search_q = f"{title} {artist}".strip()
        sr = HTTP_SESSION.get('https://lrclib.net/api/search', params={'q': search_q}, timeout=LRCLIB_TIMEOUT)
        if sr.status_code == 200:
            results = sr.json()
            if results and isinstance(results, list):
                best = results[0]
                synced = best.get('syncedLyrics')
                plain = best.get('plainLyrics')
                if synced:
                    return jsonify({'source': 'lrclib', 'lines': parse_lrc(synced), 'plain': plain})
                if plain:
                    lines_list = [{'time': None, 'text': l} for l in plain.split('\n') if l.strip()]
                    return jsonify({'source': 'lrclib', 'lines': lines_list, 'plain': plain})
        return jsonify({'source': None, 'lines': [], 'plain': None})
    except Exception as e:
        logger.warning(f"Lyrics fetch error: {e}")
        return jsonify({'source': None, 'lines': [], 'plain': None})

def parse_lrc(lrc_text):
    lines = []
    pattern = re.compile(r'\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)')
    for line in lrc_text.split('\n'):
        m = pattern.match(line)
        if m:
            minutes = int(m.group(1))
            seconds = int(m.group(2))
            millis = int(m.group(3).ljust(3, '0')[:3])
            time_sec = minutes * 60 + seconds + millis / 1000
            text = m.group(4).strip()
            if text:
                lines.append({'time': round(time_sec, 3), 'text': text})
    return lines

@files_bp.route('/lyrics-file/<path:filename>')
def serve_lyrics_file(filename):
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None:
        return jsonify({'error': 'Invalid path'}), 400
    base = os.path.splitext(fn)[0]
    fp = sidecar_lyrics(base)
    if os.path.isfile(fp):
        with open(fp, 'r', encoding='utf-8') as f:
            return Response(f.read(), mimetype='text/plain; charset=utf-8')
    return jsonify({'error': 'No lyrics'}), 404


@files_bp.route('/lyrics/submit', methods=['POST'])
def submit_lyrics():
    data = request.get_json(silent=True) or {}
    filename = (data.get('filename') or '').strip()
    lyrics_text = (data.get('lyrics') or '').strip()
    if not filename or not lyrics_text:
        return jsonify({'error': 'Missing filename or lyrics'}), 400
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None:
        return jsonify({'error': 'Invalid filename'}), 400
    base = os.path.splitext(fn)[0]
    ensure_meta_dir(base)
    fp = sidecar_lyrics(base)
    try:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(lyrics_text)
        from services.lrclib import clear_lyrics_cache
        clear_lyrics_cache(base)
        return jsonify({'status': 'ok', 'message': 'Lyrics saved'})
    except Exception as e:
        logger.error(f"Failed to save lyrics: {e}")
        return jsonify({'error': 'Failed to save lyrics'}), 500


@files_bp.route('/meta-file/<path:filename>')
def serve_meta_file(filename):
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None:
        return jsonify({'error': 'Invalid path'}), 400
    base = os.path.splitext(fn)[0]
    fp = sidecar_info(base)
    if os.path.isfile(fp):
        with open(fp, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify({})

@files_bp.route('/browse', methods=['POST'])
@auth_required
def browse_directory():
    data = request.get_json() or {}
    path = (data.get('path') or '').strip()
    if path:
        safe = safe_path(path)
        base = safe if safe else DEFAULT_DOWNLOAD_DIR
    else:
        base = DEFAULT_DOWNLOAD_DIR
    try:
        items = os.listdir(base)
        dirs = [d for d in items if os.path.isdir(os.path.join(base, d))]
        return jsonify({'path': base, 'dirs': dirs})
    except Exception:
        return jsonify({'path': base, 'dirs': []})

@files_bp.route('/metadata/<path:filename>')
def get_metadata(filename):
    from flask import make_response
    import mutagen
    safe = os.path.basename(filename)
    filepath = os.path.join(DEFAULT_DOWNLOAD_DIR, safe)
    if not os.path.exists(filepath):
        return jsonify({'error': 'File not found'}), 404
    try:
        audio = mutagen.File(filepath, easy=True)
        if audio is None:
            fallback = os.path.splitext(safe)[0].replace('_', ' ').replace('-', ' ').strip()
            return jsonify({'title': fallback, 'artist': None, 'album': None, 'album_art': None, 'has_cover': False, 'has_lyrics': False})
        title = str(audio.get('title', [None])[0]) if audio.get('title') else None
        artist = str(audio.get('artist', [None])[0]) if audio.get('artist') else None
        album = str(audio.get('album', [None])[0]) if audio.get('album') else None
        album_art = None
        try:
            f2 = mutagen.File(filepath)
            if f2 and hasattr(f2, 'tags') and f2.tags:
                for k, v in f2.tags.items():
                    if k.startswith('APIC:'):
                        album_art = base64.b64encode(v.data).decode('utf-8')
                        break
        except Exception:
            pass
        base_name = os.path.splitext(safe)[0]
        has_cover = sidecar_cover(base_name) is not None
        has_lyrics = os.path.isfile(sidecar_lyrics(base_name))
        sidecar = {}
        meta_fp = sidecar_info(base_name)
        if os.path.isfile(meta_fp):
            try:
                with open(meta_fp, 'r') as mf:
                    sidecar = json.load(mf)
            except (json.JSONDecodeError, OSError):
                pass
        return jsonify({
            'title': title or sidecar.get('title', '') or os.path.splitext(safe)[0].replace('_', ' ').replace('-', ' ').strip(),
            'artist': artist or sidecar.get('artist', None),
            'album': album or sidecar.get('album', None),
            'album_art': album_art,
            'has_cover': has_cover or (album_art is not None),
            'has_lyrics': has_lyrics,
            'genre': sidecar.get('genre', None),
            'date': sidecar.get('date', None),
        })
    except Exception as e:
        return jsonify({'title': os.path.splitext(safe)[0].replace('_', ' ').replace('-', ' ').strip(), 'artist': None, 'album': None, 'album_art': None, 'has_cover': False, 'has_lyrics': False})

@files_bp.route('/metadata-batch', methods=['POST'])
@auth_required
def get_metadata_batch():
    import mutagen
    filenames = request.json.get('files', [])
    results = {}
    for safe in filenames:
        safe = os.path.basename(safe)
        filepath = os.path.join(DEFAULT_DOWNLOAD_DIR, safe)
        try:
            if not os.path.exists(filepath):
                fallback = os.path.splitext(safe)[0].replace('_', ' ').replace('-', ' ').strip()
                results[safe] = {'title': fallback, 'artist': None, 'album': None, 'album_art': None, 'has_cover': False, 'has_lyrics': False}
                continue
            audio = mutagen.File(filepath, easy=True)
            if audio is None:
                fallback = os.path.splitext(safe)[0].replace('_', ' ').replace('-', ' ').strip()
                results[safe] = {'title': fallback, 'artist': None, 'album': None, 'album_art': None, 'has_cover': False, 'has_lyrics': False}
                continue
            title = str(audio.get('title', [None])[0]) if audio.get('title') else None
            artist = str(audio.get('artist', [None])[0]) if audio.get('artist') else None
            album = str(audio.get('album', [None])[0]) if audio.get('album') else None
            album_art = None
            try:
                f2 = mutagen.File(filepath)
                if f2 and hasattr(f2, 'tags') and f2.tags:
                    for k, v in f2.tags.items():
                        if k.startswith('APIC:'):
                            album_art = base64.b64encode(v.data).decode('utf-8')
                            break
            except Exception:
                pass
            base_name = os.path.splitext(safe)[0]
            has_cover = sidecar_cover(base_name) is not None
            has_lyrics = os.path.isfile(sidecar_lyrics(base_name))
            results[safe] = {
                'title': title or os.path.splitext(safe)[0].replace('_', ' ').replace('-', ' ').strip(),
                'artist': artist,
                'album': album,
                'album_art': album_art,
                'has_cover': has_cover or (album_art is not None),
                'has_lyrics': has_lyrics,
            }
        except Exception as e:
            fallback = os.path.splitext(safe)[0].replace('_', ' ').replace('-', ' ').strip()
            results[safe] = {'title': fallback, 'artist': None, 'album': None, 'album_art': None, 'has_cover': False, 'has_lyrics': False, 'error': str(e)}
    return jsonify(results)

@files_bp.route('/files/<path:filename>', methods=['PUT'])
@auth_required
def update_file_metadata(filename):
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None or not os.path.isfile(safe):
        return jsonify({'error': 'File not found'}), 404
    data = request.get_json() or {}
    base = os.path.splitext(fn)[0]
    meta_fp = sidecar_info(base)
    meta = {}
    if os.path.isfile(meta_fp):
        try:
            with open(meta_fp, 'r') as f:
                meta = json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    for key in ('title', 'artist', 'album', 'genre', 'date'):
        if key in data:
            meta[key] = data[key]
    ensure_meta_dir(base)
    with open(meta_fp, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    return jsonify({'ok': True})

@files_bp.route('/files/batch-update', methods=['POST'])
@auth_required
def batch_update_metadata():
    data = request.get_json() or {}
    updates = data.get('files', [])
    updated = 0
    for item in updates:
        fn = os.path.basename(item.get('name', ''))
        if not fn:
            continue
        safe = safe_path(fn)
        if safe is None or not os.path.isfile(safe):
            continue
        base = os.path.splitext(fn)[0]
        meta_fp = sidecar_info(base)
        meta = {}
        if os.path.isfile(meta_fp):
            try:
                with open(meta_fp, 'r') as f:
                    meta = json.load(f)
            except (json.JSONDecodeError, OSError):
                pass
        for key in ('title', 'artist', 'album', 'genre', 'date'):
            if key in item:
                meta[key] = item[key]
        ensure_meta_dir(base)
        with open(meta_fp, 'w', encoding='utf-8') as f:
            json.dump(meta, f, indent=2)
        updated += 1
    return jsonify({'updated': updated})

@files_bp.route('/files/cover/<path:filename>', methods=['POST'])
@auth_required
def upload_cover(filename):
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None or not os.path.isfile(safe):
        return jsonify({'error': 'File not found'}), 404
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    uploaded = request.files['file']
    if uploaded.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
    ext = os.path.splitext(uploaded.filename)[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp'):
        return jsonify({'error': 'Invalid image format. Use jpg, png, or webp'}), 400
    base = os.path.splitext(fn)[0]
    ensure_meta_dir(base)
    old = sidecar_cover(base)
    if old:
        try:
            os.remove(old)
        except OSError:
            pass
    cover_path = os.path.join(metadata_subdir(base), 'cover' + ext)
    uploaded.save(cover_path)
    return jsonify({'ok': True, 'path': cover_path})

@files_bp.route('/upload', methods=['POST'])
@auth_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    uploaded = request.files['file']
    if uploaded.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
    fn = os.path.basename(uploaded.filename)
    if not is_audio_file(fn):
        return jsonify({'error': 'Not a supported audio format'}), 400
    safe = safe_path(fn)
    if safe and os.path.isfile(safe):
        base = os.path.splitext(fn)[0]
        counter = 1
        while os.path.isfile(safe):
            fn = f"{base}_{counter}{os.path.splitext(fn)[1]}"
            safe = safe_path(fn)
            counter += 1
    filepath = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)
    uploaded.save(filepath)
    try:
        import mutagen
        audio = mutagen.File(filepath, easy=True)
        meta = {}
        if audio:
            meta = {
                'title': str(audio.get('title', [os.path.splitext(fn)[0]])[0]),
                'artist': str(audio.get('artist', [''])[0]),
                'album': str(audio.get('album', [''])[0]),
                'genre': str(audio.get('genre', [''])[0]),
            }
        from workers.metadata import write_metadata_sidecar
        write_metadata_sidecar(filepath, meta)
    except Exception:
        pass
    return jsonify({'ok': True, 'filename': fn, 'size': os.path.getsize(filepath)})

@files_bp.route('/files/cover/<path:filename>', methods=['DELETE'])
@auth_required
def delete_cover(filename):
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None or not os.path.isfile(safe):
        return jsonify({'error': 'File not found'}), 404
    base = os.path.splitext(fn)[0]
    old = sidecar_cover(base)
    if old:
        try:
            os.remove(old)
            return jsonify({'ok': True})
        except OSError as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'ok': True})

@files_bp.route('/scan-metadata', methods=['POST'])
@auth_required
def scan_metadata():
    from workers.metadata import scan_for_metadata, get_scan_status
    if get_scan_status().get('running'):
        return jsonify({'scanned': 0, 'running': True}), 200
    count = scan_for_metadata()
    return jsonify({'scanned': count, 'running': count < 0})

@files_bp.route('/search-album-art', methods=['POST'])
@auth_required
def search_album_art():
    data = request.get_json() or {}
    title = data.get('title', '')
    artist = data.get('artist', '')
    if not title:
        return jsonify({'error': 'Title required'}), 400
    query = f"{title} {artist}".strip()
    try:
        import urllib.request, urllib.parse
        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=song&limit=8"
        req = urllib.request.Request(url, headers={'User-Agent': 'NEOTOKYO-FM/1.0'})
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
        results = data.get('results', [])
        candidates = []
        for r in results:
            art = r.get('artworkUrl100', '')
            if art:
                candidates.append({
                    'title': r.get('trackName', ''),
                    'artist': r.get('artistName', ''),
                    'album': r.get('collectionName', ''),
                    'artwork': art.replace('100x100', '600x600'),
                    'genre': r.get('primaryGenreName', ''),
                    'release_date': r.get('releaseDate', ''),
                })
        return jsonify({'results': candidates, 'count': len(candidates)})
    except Exception as e:
        return jsonify({'error': str(e)[:100], 'results': []}), 200

@files_bp.route('/apply-album-art', methods=['POST'])
@auth_required
def apply_album_art():
    data = request.get_json() or {}
    filename = data.get('filename', '')
    artwork_url = data.get('artwork_url', '')
    if not filename or not artwork_url:
        return jsonify({'error': 'Filename and artwork_url required'}), 400
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None or not os.path.isfile(safe):
        return jsonify({'error': 'File not found'}), 404
    base = os.path.splitext(fn)[0]
    try:
        import urllib.request
        req = urllib.request.Request(artwork_url, headers={'User-Agent': 'NEOTOKYO-FM/1.0'})
        resp = urllib.request.urlopen(req, timeout=15)
        img_data = resp.read()
        from utils.file_utils import metadata_subdir
        d = metadata_subdir(base)
        os.makedirs(d, exist_ok=True)
        ext = '.jpg'
        cover_path = os.path.join(d, 'cover' + ext)
        with open(cover_path, 'wb') as f:
            f.write(img_data)
        return jsonify({'ok': True, 'cover_path': cover_path})
    except Exception as e:
        return jsonify({'error': str(e)[:100]}), 500

@files_bp.route('/find-cover', methods=['POST'])
@auth_required
def find_cover():
    import urllib.request, urllib.parse
    data = request.get_json() or {}
    filename = data.get('filename', '')
    title = data.get('title', '')
    artist = data.get('artist', '')
    source_url = ''

    if filename:
        base = os.path.splitext(os.path.basename(filename))[0]
        meta_fp = sidecar_info(base)
        if os.path.isfile(meta_fp):
            try:
                with open(meta_fp, 'r') as f:
                    meta = json.load(f)
                source_url = meta.get('source_url', '') or ''
                if not title: title = meta.get('title', '') or ''
                if not artist: artist = meta.get('artist', '') or ''
            except Exception:
                pass

    if source_url and HAS_YTDLP:
        from workers.download import preview_url_ytdlp
        try:
            preview = preview_url_ytdlp(source_url)
            thumb = preview.get('thumbnail', '') if preview else ''
            if thumb:
                return jsonify({'cover_url': thumb, 'source': 'source_url', 'title': title, 'artist': artist})
        except Exception:
            pass

    if title:
        try:
            query = f"{title} {artist}".strip()
            search_url = f"https://itunes.apple.com/search?term={urllib.parse.quote(query)}&entity=song&limit=5"
            req = urllib.request.Request(search_url, headers={'User-Agent': 'NEOTOKYO-FM/1.0'})
            resp = urllib.request.urlopen(req, timeout=10)
            idata = json.loads(resp.read().decode())
            for r in idata.get('results', []):
                art = r.get('artworkUrl100', '')
                if art:
                    return jsonify({'cover_url': art.replace('100x100', '600x600'), 'source': 'itunes', 'title': title, 'artist': artist})
        except Exception:
            pass

    if title and HAS_YTDLP:
        try:
            import yt_dlp
            query = f"{title} {artist}".strip()
            with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True}) as ydl:
                info = ydl.extract_info(f'ytsearch1:{query}', download=False)
                entries = info.get('entries', []) if info else []
                if entries and entries[0]:
                    thumb = entries[0].get('thumbnail', '')
                    if thumb:
                        return jsonify({'cover_url': thumb, 'source': 'youtube', 'title': title, 'artist': artist})
        except Exception:
            pass

    return jsonify({'cover_url': '', 'source': None, 'title': title, 'artist': artist}), 404

@files_bp.route('/update-tags/<path:filename>', methods=['POST'])
@auth_required
def update_file_tags(filename):
    fn = os.path.basename(filename)
    safe = safe_path(fn)
    if safe is None or not os.path.isfile(safe):
        return jsonify({'error': 'File not found'}), 404
    data = request.get_json() or {}
    base = os.path.splitext(fn)[0]
    from workers.metadata import write_metadata_sidecar
    sidecar_meta = {
        'title': data.get('title', ''),
        'uploader': data.get('artist', ''),
        'album': data.get('album', ''),
        'genre': data.get('genre', ''),
    }
    write_metadata_sidecar(safe, sidecar_meta)
    try:
        import mutagen
        audio = mutagen.File(safe, easy=True)
        if audio:
            if data.get('title'): audio['title'] = data['title']
            if data.get('artist'): audio['artist'] = data['artist']
            if data.get('album'): audio['album'] = data['album']
            if data.get('genre'): audio['genre'] = data['genre']
            audio.save()
    except Exception as e:
        logger.warning(f"Tag save skipped: {e}")
    return jsonify({'ok': True, 'filename': fn})
