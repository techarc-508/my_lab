import os, time, threading, functools, ipaddress, socket, logging, random
from urllib.parse import urlparse
from config import _LOGIN_RATE_LIMIT, _LOGIN_RATE_WINDOW

def retry_with_backoff(max_retries=3, base_delay=1, max_delay=30, jitter=True):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (ConnectionError, TimeoutError, OSError) as e:
                    if attempt == max_retries - 1:
                        raise
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    if jitter:
                        delay += random.uniform(0, delay * 0.1)
                    logging.getLogger('batch_dl').debug(f"Retry {attempt+1}/{max_retries} for {func.__name__}: {e}, waiting {delay:.1f}s")
                    time.sleep(delay)
            return None
        return wrapper
    return decorator

login_attempts: dict[str, list[float]] = {}
_login_lock = threading.Lock()

def auth_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        from flask import session, jsonify
        if session.get('auth'):
            return f(*args, **kwargs)
        return jsonify({'error': 'Unauthorized'}), 401
    return wrapper

def require_auth():
    from flask import session
    return bool(session.get('auth'))

def _check_login_rate_limit(ip: str) -> bool:
    now = time.time()
    window = _LOGIN_RATE_WINDOW
    with _login_lock:
        if ip not in login_attempts:
            login_attempts[ip] = []
        login_attempts[ip] = [t for t in login_attempts[ip] if now - t < window]
        if len(login_attempts[ip]) >= _LOGIN_RATE_LIMIT:
            return False
        login_attempts[ip].append(now)
    return True

def _is_private_ip(host: str) -> bool:
    try:
        socket.setdefaulttimeout(5)
        addrs = socket.getaddrinfo(host, None)
        for addr in addrs:
            ip = ipaddress.ip_address(addr[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return True
        return False
    except socket.gaierror:
        return False
    finally:
        socket.setdefaulttimeout(None)

def validate_external_url(url: str) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    host = parsed.hostname or ''
    if host == 'localhost' or host == '127.0.0.1' or host == '0.0.0.0':
        return False
    if _is_private_ip(host):
        return False
    return True
