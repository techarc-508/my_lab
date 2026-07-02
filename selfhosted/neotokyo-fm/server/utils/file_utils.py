import os, re
from urllib.parse import urlparse, unquote
from config import AUDIO_EXTS, STREAMING_DOMAINS, DEFAULT_DOWNLOAD_DIR, METADATA_DIR

def is_audio_file(fname: str) -> bool:
    return os.path.splitext(fname)[1].lower() in AUDIO_EXTS

def get_youtube_video_id(url):
    m = re.search(r'(?:v=|youtu\.be\/|embed\/|v\/)([\w-]{11})', url)
    return m.group(1) if m else None

def is_streaming_url(url: str) -> bool:
    if not url: return False
    domain = urlparse(url).hostname or ''
    for d in STREAMING_DOMAINS:
        if domain.endswith(d):
            return True
    return False

def extract_filename_from_url(url: str) -> str:
    parsed = urlparse(url)
    path = unquote(parsed.path)
    fn = os.path.basename(path)
    if not fn or fn == '/':
        fn = parsed.hostname or 'download'
    fn = re.sub(r'[^\w\-.]', '_', fn)
    return fn[:120] if len(fn) > 120 else fn

def safe_path(user_path: str, base_dir: str = None) -> str | None:
    if base_dir is None:
        base_dir = DEFAULT_DOWNLOAD_DIR
    joined = os.path.join(base_dir, user_path)
    real = os.path.realpath(joined)
    base_real = os.path.realpath(base_dir)
    if real.startswith(base_real + os.sep) or real == base_real:
        return real
    return None

def metadata_subdir(basename: str) -> str:
    return os.path.join(METADATA_DIR, basename)

def ensure_meta_dir(basename: str) -> str:
    d = metadata_subdir(basename)
    os.makedirs(d, exist_ok=True)
    return d

def sidecar_cover(basename: str) -> str | None:
    d = metadata_subdir(basename)
    for ext in ('.jpg', '.jpeg', '.png', '.webp'):
        fp = os.path.join(d, 'cover' + ext)
        if os.path.isfile(fp): return fp
    return None

def sidecar_lyrics(basename: str) -> str:
    return os.path.join(metadata_subdir(basename), 'lyrics.lrc')

def sidecar_info(basename: str) -> str:
    return os.path.join(metadata_subdir(basename), 'info.json')
