import os, json, threading, logging, subprocess, time
from config import DEFAULT_DOWNLOAD_DIR, METADATA_DIR, LRCLIB_SKIP
from utils.file_utils import safe_path, sidecar_cover, sidecar_lyrics, sidecar_info, ensure_meta_dir, is_audio_file

logger = logging.getLogger('batch_dl')

_recording_lock = threading.Lock()
_recording_status = {}

def musicbrainz_lookup(title: str, artist: str = '') -> dict | None:
    if not title:
        return None
    try:
        from config import HTTP_SESSION, MUSICBRAINZ_ENABLED
        if not MUSICBRAINZ_ENABLED:
            return None
        import xml.etree.ElementTree as ET
        query = f'recording:"{title}"'
        if artist:
            query += f' AND artist:"{artist}"'
        url = f'https://musicbrainz.org/ws/2/recording/?query={query}&fmt=xml&limit=1'
        resp = HTTP_SESSION.get(url, timeout=10, headers={'User-Agent': 'NEOTOKYO-FM/2.2'})
        if resp.status_code != 200:
            return None
        root = ET.fromstring(resp.content)
        ns = {'ns': 'http://musicbrainz.org/ns/mmd-2.0#'}
        rec = root.find('.//ns:recording', ns)
        if rec is None:
            return None
        result = {}
        title_el = rec.find('ns:title', ns)
        if title_el is not None:
            result['title'] = title_el.text
        artist_list = rec.find('.//ns:artist-credit/ns:name-credit/ns:artist/ns:name', ns)
        if artist_list is not None:
            result['artist'] = artist_list.text
        release = rec.find('.//ns:release', ns)
        if release is not None:
            album_el = release.find('ns:title', ns)
            if album_el is not None:
                result['album'] = album_el.text
            date_el = release.find('ns:date', ns)
            if date_el is not None:
                result['date'] = date_el.text
            mbid = release.get('id', '')
            if mbid:
                ca_url = f'https://coverartarchive.org/release/{mbid}/front'
                try:
                    ca_resp = HTTP_SESSION.head(ca_url, timeout=10)
                    if ca_resp.status_code == 200:
                        result['cover_url'] = ca_url
                except Exception:
                    pass
        return result if result else None
    except Exception:
        return None

def detect_sidecar_type(filename: str):
    base, ext = os.path.splitext(filename)
    lower_ext = ext.lower()
    sidecar_exts = {'.json': 'meta', '.lrc': 'lyrics', '.jpg': 'cover', '.png': 'cover'}
    if lower_ext in sidecar_exts:
        return (sidecar_exts[lower_ext], base)
    return (None, None)

def get_track_genre_and_metadata(filepath):
    import mutagen
    genre, title, artist = None, None, None
    try:
        audio = mutagen.File(filepath, easy=True)
        if audio:
            title = str(audio.get('title', [''])[0]) or None
            artist = str(audio.get('artist', [''])[0]) or None
            genre = str(audio.get('genre', [''])[0]) or None
    except Exception:
        pass
    if not genre:
        base = os.path.splitext(os.path.basename(filepath))[0]
        meta_fp = sidecar_info(base)
        if os.path.isfile(meta_fp):
            try:
                with open(meta_fp, 'r') as mf:
                    meta = json.load(mf)
                genre = meta.get('genre') or genre
                title = title or meta.get('title')
                artist = artist or meta.get('artist')
            except (json.JSONDecodeError, OSError):
                pass
    return genre, title, artist

def write_metadata_sidecar(filepath: str, info: dict):
    base = os.path.splitext(os.path.basename(filepath))[0]
    ensure_meta_dir(base)
    meta = {
        'title': info.get('title', ''),
        'artist': info.get('artist') or info.get('uploader', info.get('channel', '')),
        'album': info.get('album', info.get('playlist_title', '')),
        'genre': info.get('genre', ''),
        'date': info.get('upload_date', ''),
        'duration': info.get('duration', 0),
        'source_url': info.get('webpage_url', ''),
    }
    meta_path = sidecar_info(base)
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    lyrics = info.get('lyrics', '')
    if lyrics:
        lrc_path = sidecar_lyrics(base)
        with open(lrc_path, 'w', encoding='utf-8') as f:
            f.write(lyrics)
    elif not LRCLIB_SKIP:
        try:
            from services.lrclib import fetch_lyrics_from_lrclib
            title = meta.get('title', '')
            artist = meta.get('artist', '')
            lrc_text = fetch_lyrics_from_lrclib(base, title, artist, filepath)
            if lrc_text:
                lrc_path = sidecar_lyrics(base)
                with open(lrc_path, 'w', encoding='utf-8') as f:
                    f.write(lrc_text)
        except Exception as e:
            logger.debug(f"LRCLIB fallback failed for {base}: {e}")
    try:
        from models.db import upsert_track_fts
        upsert_track_fts(
            os.path.basename(filepath),
            title=meta.get('title', ''),
            artist=meta.get('artist', ''),
            album=meta.get('album', ''),
            genre=meta.get('genre', ''),
        )
    except Exception as e:
        logger.debug(f"FTS5 insert failed for {base}: {e}")

    thumbnail = info.get('thumbnail', '')
    if thumbnail:
        cover_path = sidecar_cover(base)
        if cover_path and not os.path.isfile(cover_path):
            try:
                from config import HTTP_SESSION
                resp = HTTP_SESSION.get(thumbnail, timeout=10)
                if resp.status_code == 200:
                    with open(cover_path, 'wb') as f:
                        f.write(resp.content)
            except Exception as e:
                logger.debug(f"Thumbnail download skipped: {e}")

def analyze_gain(filepath: str) -> dict | None:
    try:
        cmd = ['ffmpeg', '-i', filepath, '-af',
               'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
               '-f', 'null', '-']
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.warning(f"loudnorm analysis failed for {os.path.basename(filepath)}: {result.stderr[:200]}")
            return None
        stderr = result.stderr
        json_start = stderr.rfind('{')
        json_end = stderr.rfind('}') + 1
        if json_start < 0 or json_end <= json_start:
            logger.warning(f"No JSON output from loudnorm for {os.path.basename(filepath)}")
            return None
        data = json.loads(stderr[json_start:json_end])
        input_i = float(data.get('input_i', 0))
        input_tp = float(data.get('input_tp', 0))
        input_lra = float(data.get('input_lra', 0))
        input_threshold = float(data.get('input_threshold', 0))
        album_name = ''
        try:
            import mutagen
            audio = mutagen.File(filepath, easy=True)
            if audio:
                album_name = str(audio.get('album', [''])[0]) or ''
        except Exception:
            pass
        return {
            'track_gain': -input_i,
            'track_peak': 10 ** (input_tp / 20) if input_tp > -100 else 0,
            'input_lra': input_lra,
            'input_threshold': input_threshold,
            'album_name': album_name,
        }
    except subprocess.TimeoutExpired:
        logger.warning(f"loudnorm timeout for {os.path.basename(filepath)}")
        return None
    except Exception as e:
        logger.warning(f"analyze_gain error for {os.path.basename(filepath)}: {e}")
        return None

def analyze_track_gain(filename: str) -> dict | None:
    from models.db import get_track_gain, set_track_gain, get_album_gains
    from utils.file_utils import safe_path
    fp = safe_path(filename)
    if not fp or not os.path.isfile(fp):
        return None
    data = analyze_gain(fp)
    if data is None:
        return None
    existing = get_track_gain(filename)
    album_gain = existing['album_gain'] if existing else 0
    album_peak = existing['album_peak'] if existing else 0
    if data['album_name']:
        album_tracks = get_album_gains(data['album_name'])
        if album_tracks:
            gains = [t['track_gain'] for t in album_tracks]
            peaks = [t['track_peak'] for t in album_tracks]
            album_gain = sum(gains) / len(gains)
            album_peak = max(peaks) if peaks else 0
    set_track_gain(
        filename,
        track_gain=data['track_gain'],
        track_peak=data['track_peak'],
        album_gain=album_gain,
        album_peak=album_peak,
        album_name=data['album_name'],
    )
    return {
        'filename': filename,
        'track_gain': data['track_gain'],
        'track_peak': data['track_peak'],
        'album_gain': album_gain,
        'album_peak': album_peak,
        'album_name': data['album_name'],
    }

def analyze_all_gains() -> int:
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from utils.file_utils import is_audio_file
    audio_files = [f for f in os.listdir(DEFAULT_DOWNLOAD_DIR)
                   if is_audio_file(f) and not f.startswith('.')]
    if not audio_files:
        return 0
    analyzed = 0
    def _analyze_one(fn):
        nonlocal analyzed
        result = analyze_track_gain(fn)
        if result:
            with _gain_lock:
                _gain_status['analyzed'] += 1
        with _gain_lock:
            _gain_status['current'] += 1
            total = _gain_status['total']
            _gain_status['progress'] = int((_gain_status['current'] / total) * 100) if total else 100
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(_analyze_one, fn): fn for fn in audio_files}
        for fut in as_completed(futures):
            try:
                fut.result()
            except Exception as e:
                logger.warning(f"gain analysis worker error: {e}")
    _gain_status['running'] = False
    _gain_status['done'] = True
    _gain_status['progress'] = 100
    _gain_status['status'] = 'Complete'
    _gain_status['message'] = f"Analyzed {_gain_status['analyzed']} of {len(audio_files)} files"
    return len(audio_files)

_gain_lock = threading.Lock()
_gain_status = {'running': False, 'progress': 0, 'status': '', 'done': False,
                'message': '', 'total': 0, 'current': 0, 'analyzed': 0}

def start_gain_analysis():
    if _gain_status['running']:
        return False
    audio_files = [f for f in os.listdir(DEFAULT_DOWNLOAD_DIR)
                   if is_audio_file(f) and not f.startswith('.')]
    total = len(audio_files)
    with _gain_lock:
        _gain_status.update({
            'running': True, 'progress': 0, 'status': 'Analyzing...',
            'done': False, 'message': '', 'total': total, 'current': 0, 'analyzed': 0,
        })
    thread = threading.Thread(target=analyze_all_gains, daemon=True)
    thread.start()
    return True

def get_gain_status():
    with _gain_lock:
        return dict(_gain_status)

def get_gain_for_file(filename: str) -> dict | None:
    from models.db import get_track_gain
    return get_track_gain(filename)

_scan_status = {'running': False, 'progress': 0, 'status': '', 'done': False, 'message': '', 'total': 0, 'current': 0}

def _do_scan():
    global _scan_status
    _scan_status = {'running': True, 'progress': 0, 'status': 'Enumerating files...', 'done': False, 'message': '', 'total': 0, 'current': 0}
    try:
        all_files = [f for f in os.listdir(DEFAULT_DOWNLOAD_DIR) if not f.startswith('.')]
        _scan_status['total'] = len(all_files)
        count = 0
        for i, fn in enumerate(all_files):
            if not _scan_status['running']:
                _scan_status['status'] = 'Cancelled'
                _scan_status['done'] = True
                _scan_status['message'] = 'Scan cancelled'
                return
            _scan_status['current'] = i + 1
            _scan_status['progress'] = int((i + 1) / len(all_files) * 100)
            base, ext = os.path.splitext(fn)
            side_type, _ = detect_sidecar_type(fn)
            if side_type is not None:
                _scan_status['status'] = f'Skipping sidecar: {fn}'
                continue
            fp = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)
            if not os.path.isfile(fp):
                continue
            meta_fp = sidecar_info(base)
            if os.path.isfile(meta_fp):
                _scan_status['status'] = f'Already has metadata: {fn}'
                continue
            _scan_status['status'] = f'Scanning: {fn}'
            try:
                import mutagen
                audio = mutagen.File(fp, easy=True)
                if audio:
                    info = {
                        'title': str(audio.get('title', [''])[0]),
                        'uploader': str(audio.get('artist', [''])[0]),
                        'album': str(audio.get('album', [''])[0]),
                        'genre': str(audio.get('genre', [''])[0]),
                    }
                    write_metadata_sidecar(fp, info)
                    count += 1
            except Exception as e:
                logger.debug(f"Metadata scan skipped {fn}: {e}")
        _scan_status['running'] = False
        _scan_status['done'] = True
        _scan_status['progress'] = 100
        _scan_status['status'] = 'Complete'
        _scan_status['message'] = f'Scanned {count} files'
    except Exception as e:
        _scan_status['running'] = False
        _scan_status['done'] = True
        _scan_status['progress'] = 0
        _scan_status['status'] = 'Error'
        _scan_status['message'] = str(e)[:200]

def scan_for_metadata():
    if _scan_status['running']:
        return 0
    thread = threading.Thread(target=_do_scan, daemon=True)
    thread.start()
    return -1  # running in background

def get_scan_status():
    return dict(_scan_status)

def start_recording(url: str, duration: int = 300) -> dict:
    recording_id = url
    with _recording_lock:
        if recording_id in _recording_status and _recording_status[recording_id].get('status') == 'recording':
            return {'error': 'Already recording', 'status': 'recording', 'recording_id': recording_id}
        rv = {'status': 'recording', 'url': url, 'started': time.time(), 'duration': duration, 'recording_id': recording_id}
        _recording_status[recording_id] = rv
    thread = threading.Thread(target=_do_record, args=(url, duration, recording_id), daemon=True)
    thread.start()
    return rv

_recording_processes: dict[str, subprocess.Popen] = {}

def _do_record(url: str, duration: int, recording_id: str):
    out_path = os.path.join(DEFAULT_DOWNLOAD_DIR, f"radio_recording_{int(time.time())}.mp3")
    try:
        process = subprocess.Popen(
            ['ffmpeg', '-y', '-i', url, '-t', str(duration), '-c:a', 'libmp3lame', '-q:a', '2', out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
        _recording_processes[recording_id] = process
        process.wait(timeout=duration + 30)
        with _recording_lock:
            if recording_id in _recording_status:
                _recording_status[recording_id].update({'status': 'completed', 'filepath': out_path, 'ended': time.time()})
    except subprocess.TimeoutExpired:
        process.kill()
        with _recording_lock:
            if recording_id in _recording_status:
                _recording_status[recording_id] = {'status': 'failed', 'error': 'timeout', 'url': url}
    except Exception as e:
        with _recording_lock:
            if recording_id in _recording_status:
                _recording_status[recording_id] = {'status': 'failed', 'error': str(e)[:100], 'url': url}

def stop_recording(url: str) -> dict:
    recording_id = url
    with _recording_lock:
        if recording_id in _recording_status:
            _recording_status[recording_id]['status'] = 'stopped'
    proc = _recording_processes.pop(recording_id, None)
    if proc and proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    with _recording_lock:
        if recording_id in _recording_status:
            return _recording_status[recording_id]
    return {'status': 'not_found'}

def get_recording_status() -> dict:
    with _recording_lock:
        return dict(_recording_status)
