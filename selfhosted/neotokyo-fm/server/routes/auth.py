import time, logging, os, secrets, hashlib, smtplib
from email.message import EmailMessage
from flask import request, jsonify, g, send_file
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from . import auth_bp
from config import ADMIN_USERNAME, SESSION_BACKEND, METADATA_DIR, SMTP_SERVER, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_USE_TLS, SMTP_FROM, SITE_URL
from utils.security import require_auth, _check_login_rate_limit, get_current_user, auth_required, require_role, rate_limit
from models.db import get_user_by_username, create_user, list_users, get_user_by_id, update_user_password, log_visit, create_session, delete_session, get_session_by_token, clean_expired_sessions, get_user_sessions, delete_session_by_id, update_user, create_password_reset_token, validate_password_reset_token, invalidate_password_reset_token

AVATARS_DIR = os.path.join(METADATA_DIR, 'avatars')

if SESSION_BACKEND == 'redis':
    try:
        import redis as _redis
        _redis_client = _redis.Redis.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379/0'))
        _redis_client.ping()
    except Exception:
        _redis_client = None
else:
    _redis_client = None

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
    user = get_user_by_username(u)
    if user and check_password_hash(user['password_hash'], p):
        token = create_session(user['id'], ip)
        if _redis_client is not None:
            import json
            _redis_client.setex(f'session:{token}', 86400, json.dumps({
                'user_id': user['id'], 'username': user['username'],
                'role': user['role'], 'ip': ip,
            }))
        logger.info(f"Login successful from {ip}")
        log_visit(ip, u, '/login')
        return jsonify({'token': token, 'username': user['username'], 'role': user['role']})
    logger.warning(f"Failed login attempt from {ip}")
    return jsonify({'error': 'Invalid credentials'}), 401

@auth_bp.route('/logout', methods=['POST'])
def api_logout():
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
        delete_session(token)
        if _redis_client is not None:
            _redis_client.delete(f'session:{token}')
    return jsonify({'auth': False})

@auth_bp.route('/check-auth')
def api_check_auth():
    user = get_current_user()
    if user:
        return jsonify({'auth': True, 'username': user['username'], 'role': user['role']})
    return jsonify({'auth': False})

@auth_bp.route('/settings', methods=['PUT'])
def api_settings():
    if not require_auth():
        return jsonify({'error': 'Unauthorized'}), 401
    user = get_current_user()
    data = request.json or {}
    changed = []
    password = data.get('password', '')
    if password:
        if 'current_password' not in data or not check_password_hash(user['password_hash'], data['current_password']):
            return jsonify({'error': 'Current password required'}), 401
        if len(password) < 12:
            return jsonify({'error': 'Password must be at least 12 characters'}), 400
        update_user_password(user['id'], generate_password_hash(password))
        changed.append('password')
    if changed:
        logger.info(f"Credentials changed via API for user {user['username']}: {', '.join(changed)}")
        logger.warning("Changes are persist in DB across restarts")
    return jsonify({'ok': True})

@auth_bp.route('/users', methods=['GET'])
def api_list_users():
    if not require_auth():
        return jsonify({'error': 'Unauthorized'}), 401
    user = get_current_user()
    if user.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    users = list_users()
    return jsonify(users)

@auth_bp.route('/users', methods=['POST'])
@rate_limit(10, 60)
def api_create_user():
    if not require_auth():
        return jsonify({'error': 'Unauthorized'}), 401
    user = get_current_user()
    if user.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'user')
    if len(username) < 2:
        return jsonify({'error': 'Username must be at least 2 characters'}), 400
    if len(password) < 12:
        return jsonify({'error': 'Password must be at least 12 characters'}), 400
    if role not in ('user', 'admin'):
        return jsonify({'error': 'Invalid role'}), 400
    existing = get_user_by_username(username)
    if existing:
        return jsonify({'error': 'Username already exists'}), 409
    uid = create_user(username, generate_password_hash(password), role)
    if uid is None:
        return jsonify({'error': 'Failed to create user'}), 500
    return jsonify({'id': uid, 'username': username, 'role': role}), 201

# --- Profile endpoints ---

@auth_bp.route('/profile', methods=['GET'])
@auth_required
def api_get_profile():
    user = get_current_user()
    full = get_user_by_id(user['id'])
    sessions = get_user_sessions(user['id'])
    return jsonify({
        'id': full['id'],
        'username': full['username'],
        'role': full['role'],
        'email': full.get('email', ''),
        'email_verified': full.get('email_verified', 0),
        'display_name': full.get('display_name', ''),
        'avatar_path': full.get('avatar_path', ''),
        'created_at': full.get('created_at', ''),
        'is_active': full.get('is_active', 1),
        'sessions': sessions,
    })

@auth_bp.route('/profile', methods=['PUT'])
@auth_required
def api_update_profile():
    user = get_current_user()
    data = request.json or {}
    updates = {}
    if 'display_name' in data:
        updates['display_name'] = data['display_name'][:64]
    if 'email' in data:
        updates['email'] = data['email'][:255]
    if updates:
        update_user(user['id'], **updates)
    return jsonify({'ok': True})

@auth_bp.route('/profile/avatar', methods=['POST'])
@auth_required
def api_upload_avatar():
    user = get_current_user()
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    os.makedirs(AVATARS_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename)[1] or '.jpg'
    filename = f'user_{user["id"]}{ext}'
    path = os.path.join(AVATARS_DIR, filename)
    file.save(path)
    try:
        from PIL import Image
        img = Image.open(path)
        img = img.convert('RGB')
        img.thumbnail((128, 128), Image.LANCZOS)
        jpg_filename = f'user_{user["id"]}.jpg'
        jpg_path = os.path.join(AVATARS_DIR, jpg_filename)
        img.save(jpg_path, 'JPEG', quality=85)
        filename = jpg_filename
        if path != jpg_path and os.path.exists(path):
            os.remove(path)
    except ImportError:
        pass
    update_user(user['id'], avatar_path=f'avatars/{filename}')
    return jsonify({'ok': True, 'avatar_path': f'avatars/{filename}'})

@auth_bp.route('/profile/avatar', methods=['DELETE'])
@auth_required
def api_delete_avatar():
    user = get_current_user()
    full = get_user_by_id(user['id'])
    old = full.get('avatar_path', '')
    if old:
        old_path = os.path.join(METADATA_DIR, old)
        if os.path.exists(old_path):
            os.remove(old_path)
    update_user(user['id'], avatar_path='')
    return jsonify({'ok': True})

@auth_bp.route('/profile/avatar/file', methods=['GET'])
def api_serve_avatar():
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    full = get_user_by_id(user['id'])
    avatar = full.get('avatar_path', '')
    if not avatar:
        return jsonify({'error': 'No avatar'}), 404
    path = os.path.join(METADATA_DIR, avatar)
    if not os.path.exists(path):
        return jsonify({'error': 'Avatar not found'}), 404
    return send_file(path, mimetype='image/jpeg')

@auth_bp.route('/profile/sessions', methods=['GET'])
@auth_required
def api_get_sessions():
    user = get_current_user()
    sessions = get_user_sessions(user['id'])
    return jsonify(sessions)

@auth_bp.route('/profile/sessions/<int:session_id>', methods=['DELETE'])
@auth_required
def api_revoke_session(session_id):
    user = get_current_user()
    delete_session_by_id(session_id, user['id'])
    return jsonify({'ok': True})

@auth_bp.route('/profile/account', methods=['DELETE'])
@auth_required
@rate_limit(3, 60)
def api_delete_account():
    user = get_current_user()
    if user['role'] == 'admin':
        return jsonify({'error': 'Admin account cannot be self-deleted'}), 400
    from models.db import get_db
    conn = get_db()
    conn.execute('DELETE FROM sessions WHERE user_id = ?', (user['id'],))
    conn.execute('DELETE FROM users WHERE id = ?', (user['id'],))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# --- Admin user management ---

@auth_bp.route('/users/<int:user_id>', methods=['PUT'])
@auth_required
@require_role('admin')
@rate_limit(30, 60)
def api_update_user(user_id):
    data = request.json or {}
    updates = {}
    if 'username' in data:
        updates['username'] = data['username']
    if 'role' in data:
        if data['role'] not in ('user', 'admin'):
            return jsonify({'error': 'Invalid role'}), 400
        updates['role'] = data['role']
    if 'email' in data:
        updates['email'] = data['email']
    if 'display_name' in data:
        updates['display_name'] = data['display_name']
    if 'is_active' in data:
        updates['is_active'] = 1 if data['is_active'] else 0
    if updates:
        update_user(user_id, **updates)
    return jsonify({'ok': True})

@auth_bp.route('/users/<int:user_id>', methods=['DELETE'])
@auth_required
@require_role('admin')
@rate_limit(10, 60)
def api_delete_user(user_id):
    target = get_user_by_id(user_id)
    if not target:
        return jsonify({'error': 'User not found'}), 404
    if target['role'] == 'admin':
        return jsonify({'error': 'Cannot delete admin users'}), 400
    from models.db import get_db
    conn = get_db()
    conn.execute('DELETE FROM sessions WHERE user_id = ?', (user_id,))
    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@auth_bp.route('/register', methods=['POST'])
def api_register():
    data = request.json or {}
    token = data.get('admin_token', '')
    username = data.get('username', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'viewer')

    if role not in ('viewer', 'operator'):
        return jsonify({'error': 'Invalid role'}), 400

    admin = get_current_user()
    if not admin or admin.get('role') != 'admin':
        if token:
            session = get_session_by_token(token)
            if not session or session.get('role') != 'admin':
                return jsonify({'error': 'Admin token required'}), 403
        else:
            return jsonify({'error': 'Admin credentials required'}), 403

    if len(username) < 2:
        return jsonify({'error': 'Username must be at least 2 characters'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    existing = get_user_by_username(username)
    if existing:
        return jsonify({'error': 'Username already exists'}), 409
    uid = create_user(username, generate_password_hash(password), role)
    if uid is None:
        return jsonify({'error': 'Failed to create user'}), 500
    return jsonify({'id': uid, 'username': username, 'role': role}), 201

# --- Password reset ---

def _send_reset_email(to_email: str, token: str):
    reset_url = f"{SITE_URL}/reset-password?token={token}"
    if not SMTP_SERVER or not SMTP_USERNAME:
        logger.info(f"Password reset link (SMTP not configured): {reset_url}")
        return False
    msg = EmailMessage()
    msg['Subject'] = 'NEOTOKYO FM - Password Reset'
    msg['From'] = SMTP_FROM or SMTP_USERNAME
    msg['To'] = to_email
    msg.set_content(f'You requested a password reset.\n\nClick the link below to reset your password:\n\n{reset_url}\n\nThis link expires in 1 hour.\n\nIf you did not request this, ignore this email.')
    try:
        if SMTP_USE_TLS:
            server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=10)
        if SMTP_USERNAME:
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"Password reset email sent to {to_email}")
        return True
    except Exception as e:
        logger.warning(f"SMTP failed, logging reset link to console: {e}")
        logger.info(f"Password reset link: {reset_url}")
        return False

@auth_bp.route('/auth/forgot-password', methods=['POST'])
def api_forgot_password():
    data = request.json or {}
    email = data.get('email', '').strip()
    if not email:
        return jsonify({'error': 'Email is required'}), 400
    from models.db import get_db
    db = get_db()
    row = db.execute('SELECT id, username FROM users WHERE email = ?', (email,)).fetchone()
    db.close()
    if not row:
        return jsonify({'ok': True, 'message': 'If an account with that email exists, a reset link has been sent.'})
    user_id = row['id']
    token = create_password_reset_token(user_id)
    _send_reset_email(email, token)
    return jsonify({'ok': True, 'message': 'If an account with that email exists, a reset link has been sent.'})

@auth_bp.route('/auth/reset-password', methods=['POST'])
def api_reset_password():
    data = request.json or {}
    token = data.get('token', '').strip()
    new_password = data.get('new_password', '')
    if not token or not new_password:
        return jsonify({'error': 'Token and new password are required'}), 400
    if len(new_password) < 12:
        return jsonify({'error': 'Password must be at least 12 characters'}), 400
    user_id = validate_password_reset_token(token)
    if user_id is None:
        return jsonify({'error': 'Invalid or expired token'}), 400
    update_user_password(user_id, generate_password_hash(new_password))
    invalidate_password_reset_token(token)
    logger.info(f"Password reset completed for user_id={user_id}")
    return jsonify({'ok': True, 'message': 'Password has been reset'})

@auth_bp.route('/auth/reset-password/<token>', methods=['GET'])
def api_validate_reset_token(token):
    user_id = validate_password_reset_token(token)
    if user_id is None:
        return jsonify({'valid': False, 'error': 'Invalid or expired token'}), 400
    return jsonify({'valid': True})
