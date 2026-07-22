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

def _resolve_user():
    from flask import request, g
    if hasattr(g, 'current_user') and g.current_user:
        return g.current_user
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
        from models.db import get_session_by_token
        session = get_session_by_token(token)
        if session:
            user = {'id': session['user_id'], 'username': session['username'], 'role': session['role']}
            g.current_user = user
            return user
    return None

def require_role(role: str):
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            user = _resolve_user()
            if not user:
                from flask import jsonify
                return jsonify({'error': 'Unauthorized'}), 401
            if user.get('role') != role:
                from flask import jsonify
                return jsonify({'error': 'Forbidden'}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

def auth_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        user = _resolve_user()
        if not user:
            from flask import jsonify
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return wrapper

def admin_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        user = _resolve_user()
        if not user:
            from flask import jsonify
            return jsonify({'error': 'Unauthorized'}), 401
        if user.get('role') != 'admin':
            from flask import jsonify
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return wrapper

def require_auth():
    return _resolve_user() is not None

def get_current_user():
    return _resolve_user()

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
        addrs = socket.getaddrinfo(host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for addr in addrs:
            ip = ipaddress.ip_address(addr[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return True
        return False
    except (socket.gaierror, ValueError):
        return False

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


# --- Rate limiting ---
from collections import deque

_RATE_LIMITS: dict[str, deque] = {}
_RATE_LOCK = threading.Lock()


def _rate_cleanup(key: str, window: float):
    now = time.time()
    dq = _RATE_LIMITS.get(key)
    if dq is None:
        return
    while dq and now - dq[0] > window:
        dq.popleft()
    if not dq:
        _RATE_LIMITS.pop(key, None)


def rate_limit(calls: int, window: float, key_by: str = 'ip'):
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            from flask import request, jsonify
            if key_by == 'ip':
                key = request.remote_addr or 'unknown'
            elif callable(key_by):
                key = key_by(request)
            else:
                key = key_by
            full_key = f'rl:{key}:{f.__name__}'
            with _RATE_LOCK:
                if full_key not in _RATE_LIMITS:
                    _RATE_LIMITS[full_key] = deque()
                dq = _RATE_LIMITS[full_key]
                _rate_cleanup(full_key, window)
                dq = _RATE_LIMITS.get(full_key)
                if dq is None:
                    dq = deque()
                    _RATE_LIMITS[full_key] = dq
                if len(dq) >= calls:
                    return jsonify({'error': f'Rate limit exceeded ({calls} per {int(window)}s)'}), 429
                dq.append(time.time())
            return f(*args, **kwargs)
        return wrapper
    return decorator
