import socket, re, ssl, time, threading, logging
from urllib.parse import urlparse

logger = logging.getLogger('batch_dl')

icy_cache: dict[str, dict] = {}
icy_cache_lock = threading.Lock()

def parse_icy_metadata(stream_url, timeout=8):
    """Open a socket to an ICY/SHOUTcast stream and parse one StreamTitle block."""
    parsed = urlparse(stream_url)
    host = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    path = parsed.path or '/'
    if parsed.query:
        path += '?' + parsed.query
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        if parsed.scheme == 'https':
            ctx = ssl.create_default_context()
            ctx.check_hostname = True
            ctx.verify_mode = ssl.CERT_REQUIRED
            sock = ctx.wrap_socket(sock, server_hostname=host)
        req = (
            f"GET {path} HTTP/1.0\r\n"
            f"Host: {host}\r\n"
            f"Icy-MetaData: 1\r\n"
            f"Connection: close\r\n"
            f"User-Agent: Mozilla/5.0\r\n"
            f"\r\n"
        )
        sock.sendall(req.encode())
        headers = b''
        while b'\r\n\r\n' not in headers and b'\n\n' not in headers:
            chunk = sock.recv(4096)
            if not chunk: break
            headers += chunk
            if len(headers) > 65536:
                sock.close(); return None
        m = re.search(r'icy-metaint:\s*(\d+)', headers.decode('utf-8', errors='replace'), re.IGNORECASE)
        if not m:
            sock.close()
            return None
        metaint = int(m.group(1))
        buf = b''
        while len(buf) < metaint:
            chunk = sock.recv(min(65536, metaint - len(buf)))
            if not chunk: break
            buf += chunk
        if len(buf) < metaint:
            sock.close()
            return None
        meta_len_byte = sock.recv(1)
        if not meta_len_byte:
            sock.close()
            return None
        meta_len = meta_len_byte[0] * 16
        if meta_len == 0:
            sock.close()
            return None
        meta_data = sock.recv(meta_len)
        sock.close()
        st = re.search(r"StreamTitle='([^']*)'", meta_data.decode('utf-8', errors='replace'))
        return st.group(1).strip() if st else None
    except Exception:
        return None

def parse_now_playing(raw):
    if not raw:
        return {'title': None, 'artist': None, 'raw': None}
    title = raw
    artist = None
    if ' - ' in raw:
        parts = raw.split(' - ', 1)
        artist = parts[0].strip()
        title = parts[1].strip()
    return {'title': title, 'artist': artist, 'raw': raw}

def get_cached_now_playing(url):
    with icy_cache_lock:
        cached = icy_cache.get(url)
    if cached and time.time() - cached.get('cached_at', 0) < 15:
        return cached
    result = parse_icy_metadata(url)
    parsed = parse_now_playing(result)
    parsed['cached_at'] = time.time()
    with icy_cache_lock:
        icy_cache[url] = parsed
    return parsed

def icy_poll_worker(interval: float = 10.0):
    from services.radio_stations import load_stations
    while True:
        try:
            stations = load_stations()
            for s in stations:
                url = s.get('url', '')
                if url:
                    get_cached_now_playing(url)
            logger.debug(f"ICY poll: refreshed {len(stations)} stations")
        except Exception as e:
            logger.debug(f"ICY poll error: {e}")
        time.sleep(interval)
