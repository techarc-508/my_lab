import os, time, logging, threading
from config import DEFAULT_DOWNLOAD_DIR
from utils.file_utils import is_audio_file

logger = logging.getLogger('batch_dl')

_watcher_running = False

def start_watcher():
    global _watcher_running
    if _watcher_running:
        return
    _watcher_running = True
    _known = set()
    for f in os.listdir(DEFAULT_DOWNLOAD_DIR):
        if is_audio_file(f):
            _known.add(f)

    from models.db import log_ingestion, upsert_track_fts
    from config import MUSICBRAINZ_ENABLED

    while _watcher_running:
        try:
            current = set(os.listdir(DEFAULT_DOWNLOAD_DIR))
            new_files = [f for f in current if is_audio_file(f) and f not in _known]
            for fn in new_files:
                filepath = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)
                try:
                    stat_stable = False
                    stable_size = -1
                    for _ in range(5):
                        sz = os.path.getsize(filepath)
                        if sz == stable_size:
                            stat_stable = True
                            break
                        stable_size = sz
                        time.sleep(1)
                    if not stat_stable:
                        continue
                    log_ingestion(fn, 'processing', source='watch')
                    base, _ = os.path.splitext(fn)
                    try:
                        import mutagen
                        af = mutagen.File(filepath)
                        title = str(getattr(af, 'title', '')) if af else ''
                        artist = str(getattr(af, 'artist', '')) if af else ''
                    except Exception:
                        title, artist = '', ''
                    meta_path = os.path.join(DEFAULT_DOWNLOAD_DIR, '.meta', base, f'{base}.meta.json')
                    meta = {}
                    if os.path.isfile(meta_path):
                        try:
                            import json
                            with open(meta_path) as mf:
                                meta = json.load(mf)
                        except Exception:
                            pass
                    title = title or meta.get('title', '')
                    artist = artist or meta.get('artist', '')
                    album = meta.get('album', '')
                    genre = meta.get('genre', '')

                    # MusicBrainz enrichment
                    try:
                        if title and MUSICBRAINZ_ENABLED:
                            from workers.metadata import musicbrainz_lookup
                            result = musicbrainz_lookup(title, artist)
                            if result:
                                title = title or result.get('title', '')
                                artist = result.get('artist', artist)
                                album = result.get('album', album)
                    except Exception:
                        pass

                    upsert_track_fts(fn, title=title, artist=artist, album=album, genre=genre)
                    log_ingestion(fn, 'done', source='watch', title=title, artist=artist)
                    logger.info(f"Auto-ingested: {fn}")
                except Exception as e:
                    log_ingestion(fn, 'error', source='watch', error=str(e)[:200])
                    logger.warning(f"Watcher failed for {fn}: {e}")
            _known = current
        except Exception as e:
            logger.warning(f"Watcher loop error: {e}")
        time.sleep(10)
