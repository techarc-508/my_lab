import os, uuid, time, threading, logging
from collections import deque
import requests
from requests.adapters import HTTPAdapter
from werkzeug.security import generate_password_hash

LOG_BUFFER = deque(maxlen=500)

class LogBufferHandler(logging.Handler):
    def emit(self, record):
        LOG_BUFFER.append(self.format(record))

def add_log_handler():
    logging.getLogger().addHandler(LogBufferHandler())

HAS_YTDLP = False
try:
    import yt_dlp
    HAS_YTDLP = True
except ImportError:
    pass

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DOWNLOAD_DIR = os.path.join(BASE_DIR, 'downloads')
os.makedirs(DEFAULT_DOWNLOAD_DIR, exist_ok=True)
METADATA_DIR = os.path.join(DEFAULT_DOWNLOAD_DIR, '.metadata')
os.makedirs(METADATA_DIR, exist_ok=True)

SIDECAR_EXTS = {'.jpg', '.jpeg', '.png', '.webp', '.lrc', '.meta.json'}

LRCLIB_TIMEOUT = int(os.environ.get('LRCLIB_TIMEOUT', '15'))
LRCLIB_SKIP = os.environ.get('LRCLIB_SKIP', '0') == '1'

_ADMIN_USERNAME_ENV = os.environ.get('ADMIN_USERNAME', '')
_ADMIN_PASSWORD_ENV = os.environ.get('ADMIN_PASSWORD', '')
if not _ADMIN_USERNAME_ENV or not _ADMIN_PASSWORD_ENV:
    ADMIN_USERNAME = _ADMIN_USERNAME_ENV or 'admin'
    _random_pw = uuid.uuid4().hex[:16]
    ADMIN_PASSWORD_HASH = generate_password_hash(_random_pw)
    logger = logging.getLogger('batch_dl')
    logger.info("Admin password not set. Generated random password: %s", _random_pw)
else:
    ADMIN_USERNAME = _ADMIN_USERNAME_ENV
    ADMIN_PASSWORD_HASH = generate_password_hash(_ADMIN_PASSWORD_ENV)

_LOGIN_RATE_LIMIT = int(os.environ.get('LOGIN_RATE_LIMIT', '5'))
_LOGIN_RATE_WINDOW = int(os.environ.get('LOGIN_RATE_WINDOW', '300'))
_MAX_CONCURRENCY = int(os.environ.get('MAX_CONCURRENCY', '5'))
_MAX_BATCHES = int(os.environ.get('MAX_BATCHES', '10'))
_MAX_UPLOAD_MB = int(os.environ.get('MAX_UPLOAD_MB', '32'))
_MAX_CONTENT_LENGTH = _MAX_UPLOAD_MB * 1024 * 1024
_MAX_DOWNLOAD_AGE_DAYS = int(os.environ.get('MAX_DOWNLOAD_AGE_DAYS', '7'))

CORS_ORIGIN = os.environ.get('CORS_ORIGIN', 'http://localhost:3000').strip()
_secret_key_file = os.path.join(BASE_DIR, '.flask_secret_key')
if 'FLASK_SECRET_KEY' in os.environ:
    FLASK_SECRET_KEY = os.environ['FLASK_SECRET_KEY']
elif os.path.isfile(_secret_key_file):
    with open(_secret_key_file) as f:
        FLASK_SECRET_KEY = f.read().strip()
else:
    FLASK_SECRET_KEY = uuid.uuid4().hex
    with open(_secret_key_file, 'w') as f:
        f.write(FLASK_SECRET_KEY)
DEFAULT_PLAYLIST_DIR = os.path.join(BASE_DIR, 'playlists')
DOWNLOADS_DIR = DEFAULT_DOWNLOAD_DIR
PORT = int(os.environ.get('PORT', '5050'))
HOST = os.environ.get('HOST', '0.0.0.0')

STREAMING_DOMAINS = {
    'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
    'music.youtube.com', 'soundcloud.com', 'on.soundcloud.com',
    'bandcamp.com', '.bandcamp.com', 'vimeo.com', 'www.vimeo.com',
    'dailymotion.com', 'www.dailymotion.com', 'twitch.tv', 'www.twitch.tv',
    'facebook.com', 'www.facebook.com', 'instagram.com', 'www.instagram.com',
    'tiktok.com', 'www.tiktok.com', 'spotify.com', 'open.spotify.com',
    'deezer.com', 'www.deezer.com', 'tidal.com', 'listen.tidal.com',
    'mixcloud.com', 'www.mixcloud.com',
}

FORMAT_MAP = {
    'mp3_128':   {'codec': 'mp3',  'quality': '128', 'ext': 'mp3'},
    'mp3_320':   {'codec': 'mp3',  'quality': '320', 'ext': 'mp3'},
    'flac':      {'codec': 'flac', 'quality': '0',   'ext': 'flac'},
    'opus':      {'codec': 'opus', 'quality': '0',   'ext': 'opus'},
    'best':      {'codec': None,   'quality': None,  'ext': None},
    'original':  {'codec': None,   'quality': None,  'ext': None},
}

AUDIO_EXTS = {'.mp3', '.m4a', '.flac', '.ogg', '.opus', '.wav', '.wma', '.aac', '.mp4', '.webm'}

DB_PATH = os.path.join(BASE_DIR, 'batch_history.db')

def set_admin_password_hash(new_hash: str):
    global ADMIN_PASSWORD_HASH
    ADMIN_PASSWORD_HASH = new_hash

_start_time = time.time()

HTTP_SESSION = requests.Session()
HTTP_SESSION.mount('https://', HTTPAdapter(pool_connections=10, pool_maxsize=20))
HTTP_SESSION.mount('http://', HTTPAdapter(pool_connections=10, pool_maxsize=20))
HTTP_SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) NEOTOKYO-FM/1.0'
})
