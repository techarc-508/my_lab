import os, re, time, uuid, threading, logging
from urllib.parse import urlparse
from config import DEFAULT_DOWNLOAD_DIR, HAS_YTDLP, HTTP_SESSION, FORMAT_MAP
from utils.file_utils import extract_filename_from_url
from models.download_state import add_download_record, get_download, update_download, _downloads_lock

logger = logging.getLogger('batch_dl')

DIRECT_AUDIO_EXTS = {'.mp3', '.m4a', '.flac', '.ogg', '.opus', '.wav', '.wma', '.aac', '.mp4', '.webm'}

def _filename_from_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        bn = os.path.basename(parsed.path.rstrip('/'))
        if bn and '.' in bn:
            return bn
    except Exception:
        pass
    return None

def _is_direct_audio_url(url: str) -> bool:
    fn = _filename_from_url(url)
    return fn is not None and os.path.splitext(fn)[1].lower() in DIRECT_AUDIO_EXTS

def add_download_task(url: str, filename: str = None, duplicates: str = 'replace', output_format: str = None) -> dict:
    download_id = add_download_record(url, filename=filename)
    thread = threading.Thread(target=_process_download, args=(download_id, duplicates, output_format), daemon=True)
    thread.start()
    dl = get_download(download_id)
    return dl or {'download_id': download_id, 'status': 'pending'}

def _sanitize_filename(name: str) -> str:
    name = re.sub(r'[\\/*?:"<>|]', '_', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:120] or f"track_{uuid.uuid4().hex[:6]}"

def _process_download(download_id: str, duplicates: str = 'replace', output_format: str = None):
    update_download(download_id, status='running')
    dl = get_download(download_id)
    if not dl:
        return
    url = dl['url']
    filename_hint = dl.get('filename') or extract_filename_from_url(url)

    if _is_direct_audio_url(url):
        _download_direct(download_id, url, filename_hint, duplicates)
    elif HAS_YTDLP:
        _download_with_ytdlp(download_id, url, filename_hint, duplicates, output_format)
    else:
        _download_direct(download_id, url, filename_hint, duplicates)

def _download_direct(download_id: str, url: str, filename_hint: str, duplicates: str):
    update_download(download_id, status='running', progress=0)
    try:
        resp = HTTP_SESSION.get(url, stream=True, timeout=30)
        resp.raise_for_status()

        fn = None
        cd = resp.headers.get('Content-Disposition', '')
        if cd and 'filename=' in cd:
            import email
            msg = email.message.EmailMessage()
            msg['Content-Disposition'] = cd
            fn = msg.get_filename()
        if not fn:
            fn = _filename_from_url(url) or filename_hint
        if not fn or fn == 'download':
            fn = f"download_{uuid.uuid4().hex[:6]}"

        base, ext = os.path.splitext(fn)
        if not ext.lower() in DIRECT_AUDIO_EXTS:
            ct_map = {
                'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a',
                'audio/flac': '.flac', 'audio/ogg': '.ogg', 'audio/opus': '.opus',
                'audio/wav': '.wav', 'audio/webm': '.webm', 'audio/x-m4a': '.m4a',
                'audio/aac': '.aac', 'audio/x-wav': '.wav',
            }
            guessed = '.mp3'
            ct = resp.headers.get('Content-Type', '').split(';')[0].strip()
            if ct in ct_map:
                guessed = ct_map[ct]
            fn = base + guessed

        fn = _sanitize_filename(fn)
        final_path = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)

        if duplicates == 'skip' and os.path.isfile(final_path):
            update_download(download_id, status='completed', progress=100, filepath=final_path, filename=fn)
            return
        if duplicates == 'rename' and os.path.isfile(final_path):
            counter = 1
            base_no_ext = os.path.splitext(fn)[0]
            ext = os.path.splitext(fn)[1]
            while os.path.isfile(final_path):
                fn = f"{base_no_ext}_{counter}{ext}"
                final_path = os.path.join(DEFAULT_DOWNLOAD_DIR, fn)
                counter += 1

        total = int(resp.headers.get('Content-Length', 0))
        downloaded = 0
        chunk_size = 65536
        last_update = time.time()

        with open(final_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    now = time.time()
                    if total > 0 and now - last_update >= 0.5:
                        update_download(download_id, progress=min(int(downloaded / total * 100), 99),
                                       downloaded_bytes=downloaded, total_bytes=total)
                        last_update = now

        update_download(download_id, status='completed', progress=100, filepath=final_path,
                       filename=fn, title=os.path.splitext(fn)[0], total_bytes=total, downloaded_bytes=downloaded)
        logger.info(f"Direct download completed: {final_path}")

        try:
            meta = {'title': os.path.splitext(fn)[0]}
            try:
                import mutagen
                audio = mutagen.File(final_path, easy=True)
                if audio:
                    meta['title'] = str(audio.get('title', [meta['title']])[0])
                    meta['artist'] = str(audio.get('artist', [''])[0])
                    meta['album'] = str(audio.get('album', [''])[0])
            except Exception:
                pass
            from workers.metadata import write_metadata_sidecar
            write_metadata_sidecar(final_path, meta)
        except Exception:
            pass

    except Exception as e:
        logger.error(f"Direct download failed for {url}: {e}")
        update_download(download_id, status='failed', error=str(e)[:200])

def _get_ytdlp_format_opts(output_format: str | None) -> dict:
    if not output_format or output_format == 'mp3_192':
        return {
            'format': 'bestaudio*',
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
        }
    fmt = FORMAT_MAP.get(output_format)
    if fmt and fmt['ext']:
        return {
            'format': 'bestaudio*',
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': fmt['codec'], 'preferredquality': fmt['quality']}],
        }
    if output_format == 'original':
        return {'format': 'bestaudio/best'}
    if output_format == 'best':
        return {'format': 'bestaudio*'}
    return {
        'format': 'bestaudio*',
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}],
    }

def _download_with_ytdlp(download_id: str, url: str, filename_hint: str, duplicates: str, output_format: str = None):
    update_download(download_id, status='running')
    temp_dir = os.path.join(DEFAULT_DOWNLOAD_DIR, f'.tmp_{download_id}')
    os.makedirs(temp_dir, exist_ok=True)

    fmt_opts = _get_ytdlp_format_opts(output_format)
    ydl_opts = {
        'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
        'quiet': True, 'no_warnings': True, 'ignoreerrors': True,
        'progress_hooks': [lambda d: _progress_hook(d, download_id)],
        **fmt_opts,
    }

    try:
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                update_download(download_id, status='failed', error='yt-dlp returned no info')
                return

            title = info.get('title', 'Unknown')
            uploader = info.get('uploader', '')
            stem = f"{title} - {uploader}" if uploader else title
            stem = _sanitize_filename(stem)

            target_ext = '.mp3'
            if output_format == 'original':
                target_ext = '.' + (info.get('ext', 'mp3'))
            elif output_format:
                fmt = FORMAT_MAP.get(output_format)
                if fmt and fmt['ext']:
                    target_ext = '.' + fmt['ext']

            final_path = os.path.join(DEFAULT_DOWNLOAD_DIR, f"{stem}{target_ext}")

            if duplicates == 'skip' and os.path.isfile(final_path):
                update_download(download_id, status='completed', progress=100, filepath=final_path,
                              title=title, uploader=uploader, filename=stem + target_ext)
                _cleanup_temp(temp_dir)
                return
            if duplicates == 'rename' and os.path.isfile(final_path):
                counter = 1
                while os.path.isfile(final_path):
                    final_path = os.path.join(DEFAULT_DOWNLOAD_DIR, f"{stem}_{counter}{target_ext}")
                    counter += 1

            actual_path = None
            for f in os.listdir(temp_dir):
                if f.endswith(target_ext):
                    actual_path = os.path.join(temp_dir, f)
                    break
            if not actual_path:
                for f in os.listdir(temp_dir):
                    fp = os.path.join(temp_dir, f)
                    if os.path.isfile(fp) and not f.startswith('.'):
                        actual_path = fp
                        break

            if actual_path and os.path.isfile(actual_path):
                os.rename(actual_path, final_path)
                update_download(download_id, status='completed', progress=100, filepath=final_path,
                              filename=os.path.basename(final_path), title=title, uploader=uploader)
                logger.info(f"Download completed: {final_path}")
                try:
                    from workers.metadata import write_metadata_sidecar
                    write_metadata_sidecar(final_path, info)
                except Exception as e:
                    logger.warning(f"Metadata tagging skipped: {e}")
            else:
                update_download(download_id, status='failed', error='Output file not found')
    except Exception as e:
        logger.error(f"yt-dlp download failed for {url}: {e}")
        update_download(download_id, status='failed', error=str(e)[:200])
    _cleanup_temp(temp_dir)

def _cleanup_temp(temp_dir: str):
    try:
        if os.path.isdir(temp_dir):
            for f in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, f))
            os.rmdir(temp_dir)
    except Exception:
        pass

def _progress_hook(d: dict, download_id: str):
    if d['status'] == 'downloading':
        total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
        downloaded = d.get('downloaded_bytes', 0)
        percent = int(downloaded / total * 100) if total > 0 else 0
        speed = d.get('speed', 0) or 0
        eta = d.get('eta', 0) or 0
        update_download(download_id, progress=min(percent, 99), status='running',
                      speed=int(speed), eta=int(eta),
                      total_bytes=int(total), downloaded_bytes=int(downloaded))
    elif d['status'] == 'finished':
        update_download(download_id, progress=99, status='processing')

def preview_url_ytdlp(url: str) -> dict | None:
    if not HAS_YTDLP:
        return None
    try:
        import yt_dlp
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True}) as ydl:
            info = ydl.extract_info(url, download=False)
            if info:
                return {
                    'title': info.get('title', ''),
                    'duration': info.get('duration', 0),
                    'thumbnail': info.get('thumbnail', ''),
                    'uploader': info.get('uploader', info.get('channel', '')),
                    'filesize': info.get('filesize', info.get('filesize_approx', 0)),
                    'extractor': info.get('extractor', 'generic'),
                    'is_streaming': info.get('is_live', False),
                }
    except Exception as e:
        logger.debug(f"Preview failed: {e}")
    return None
