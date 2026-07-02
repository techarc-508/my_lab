import time, threading, uuid, os

_downloads_lock = threading.Lock()
_downloads: dict[str, dict] = {}

def get_download(download_id: str) -> dict | None:
    with _downloads_lock:
        return _downloads.get(download_id)

def update_download(download_id: str, **kwargs) -> dict | None:
    with _downloads_lock:
        d = _downloads.get(download_id)
        if d is None:
            return None
        d.update(kwargs)
        return d

def remove_download(download_id: str) -> bool:
    with _downloads_lock:
        return _downloads.pop(download_id, None) is not None

def list_downloads_sorted() -> list[dict]:
    with _downloads_lock:
        return sorted(_downloads.values(), key=lambda x: x.get('added', 0), reverse=True)

def add_download_record(url: str, filename: str = None) -> str:
    from utils.file_utils import extract_filename_from_url
    download_id = uuid.uuid4().hex[:12]
    dl = {
        'download_id': download_id,
        'url': url,
        'filename': filename or extract_filename_from_url(url),
        'status': 'pending',
        'added': time.time(),
        'progress': 0,
        'title': '',
        'error': None,
        'speed': 0,
        'eta': 0,
        'total_bytes': 0,
        'downloaded_bytes': 0,
        'uploader': '',
        'filepath': '',
    }
    with _downloads_lock:
        _downloads[download_id] = dl
    return download_id
