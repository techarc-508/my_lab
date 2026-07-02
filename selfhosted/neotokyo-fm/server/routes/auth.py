import time, logging
from flask import request, jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash
from . import auth_bp
from config import ADMIN_USERNAME, ADMIN_PASSWORD_HASH
from utils.security import require_auth, _check_login_rate_limit

logger = logging.getLogger('batch_dl')

@auth_bp.route('/login', methods=['POST'])
def api_login():
    ip = request.remote_addr or 'unknown'
    if not _check_login_rate_limit(ip):
        logger.warning(f"Rate limit exceeded for login from {ip}")
        return jsonify({'error': 'Too many attempts. Try again in 5 minutes.'}), 429
    data = request.json or {}
    u = data.get('username', '')
    p = data.get('password', '')
    if u == ADMIN_USERNAME and check_password_hash(ADMIN_PASSWORD_HASH, p):
        session['auth'] = True
        session['auth_time'] = time.time()
        session.permanent = True
        logger.info(f"Login successful from {ip}")
        from models.db import log_visit
        log_visit(ip, u, '/login')
        return jsonify({'auth': True})
    logger.warning(f"Failed login attempt from {ip}")
    return jsonify({'error': 'Invalid credentials'}), 401

@auth_bp.route('/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'auth': False})

@auth_bp.route('/check-auth')
def api_check_auth():
    return jsonify({'auth': require_auth()})

@auth_bp.route('/settings', methods=['PUT'])
def api_settings():
    if not require_auth():
        return jsonify({'error': 'Unauthorized'}), 401
    global ADMIN_USERNAME
    data = request.json or {}
    changed = []
    password = data.get('password', '')
    if password:
        if 'current_password' not in data or not check_password_hash(ADMIN_PASSWORD_HASH, data['current_password']):
            return jsonify({'error': 'Current password required'}), 401
        if len(password) < 12:
            return jsonify({'error': 'Password must be at least 12 characters'}), 400
        from config import set_admin_password_hash
        set_admin_password_hash(generate_password_hash(password))
        changed.append('password')
    if 'username' in data and len(data['username']) >= 2:
        ADMIN_USERNAME = data['username']
        changed.append('username')
    if changed:
        logger.info(f"Credentials changed via API: {', '.join(changed)}")
        logger.warning("Changes are in-memory only — set env vars to persist across restarts")
    return jsonify({'ok': True})
