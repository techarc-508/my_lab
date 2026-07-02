import os, json, threading, logging, subprocess, time
from config import DEFAULT_DOWNLOAD_DIR, METADATA_DIR, LRCLIB_SKIP
from utils.file_utils import safe_path, sidecar_cover, sidecar_lyrics, sidecar_info, ensure_meta_dir, is_audio_file

logger = logging.getLogger('batch_dl')

_recording_lock = threading.Lock()
_recording_status = {}

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

def scan_for_metadata():
    count = 0
    for fn in os.listdir(DEFAULT_DOWNLOAD_DIR):
        if fn.startswith('.'):
            continue
        base, ext = os.path.splitext(fn)
        side_type, _ = detect_sidecar_type(fn)
        if side_type is not None:
            continue
        fp = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)
        if not os.path.isfile(fp):
            continue
        meta_fp = sidecar_info(base)
        if os.path.isfile(meta_fp):
            continue
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
    return count

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

def _do_record(url: str, duration: int, recording_id: str):
    out_path = os.path.join(DEFAULT_DOWNLOAD_DIR, f"radio_recording_{int(time.time())}.mp3")
    try:
        process = subprocess.Popen(
            ['ffmpeg', '-y', '-i', url, '-t', str(duration), '-c:a', 'libmp3lame', '-q:a', '2', out_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
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
            return _recording_status[recording_id]
    return {'status': 'not_found'}

def get_recording_status() -> dict:
    with _recording_lock:
        return dict(_recording_status)
