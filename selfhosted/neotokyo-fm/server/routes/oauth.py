import secrets, logging
from urllib.parse import urlencode
from flask import request, redirect, jsonify, abort
from . import oauth_bp
from config import (
    OAUTH_REDIRECT_BASE,
    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET,
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
    HTTP_SESSION,
)
from models.db import (
    get_oauth_link, link_oauth_account, create_user_from_oauth, get_user_by_username,
)
from models.db import create_session, get_user_by_id

logger = logging.getLogger('batch_dl')

PROVIDERS = {
    'discord': {
        'auth_url': 'https://discord.com/api/oauth2/authorize',
        'token_url': 'https://discord.com/api/oauth2/token',
        'userinfo_url': 'https://discord.com/api/users/@me',
        'scope': 'identify email',
        'client_id': DISCORD_CLIENT_ID,
        'client_secret': DISCORD_CLIENT_SECRET,
        'email_key': 'email',
    },
    'google': {
        'auth_url': 'https://accounts.google.com/o/oauth2/v2/auth',
        'token_url': 'https://oauth2.googleapis.com/token',
        'userinfo_url': 'https://www.googleapis.com/oauth2/v2/userinfo',
        'scope': 'openid email profile',
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'email_key': 'email',
    },
    'github': {
        'auth_url': 'https://github.com/login/oauth/authorize',
        'token_url': 'https://github.com/login/oauth/access_token',
        'userinfo_url': 'https://api.github.com/user',
        'scope': 'read:user user:email',
        'client_id': GITHUB_CLIENT_ID,
        'client_secret': GITHUB_CLIENT_SECRET,
        'email_key': 'email',
    },
}

_TOKEN_CONTENT_TYPE = 'application/x-www-form-urlencoded'


def _get_user_info(provider_name, access_token):
    cfg = PROVIDERS[provider_name]
    headers = {'Authorization': f'Bearer {access_token}'}
    if provider_name == 'github':
        headers['Accept'] = 'application/json'
    resp = HTTP_SESSION.get(cfg['userinfo_url'], headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()


def _get_provider_email(provider_name, access_token):
    data = _get_user_info(provider_name, access_token)
    cfg = PROVIDERS[provider_name]
    if provider_name == 'github':
        emails = data.get('email')
        if emails:
            return str(data['id']), emails
        e_resp = HTTP_SESSION.get(
            'https://api.github.com/user/emails',
            headers={'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'},
            timeout=15,
        )
        if e_resp.ok:
            for e in e_resp.json():
                if e.get('primary'):
                    return str(data['id']), e['email']
            if e_resp.json():
                return str(data['id']), e_resp.json()[0]['email']
        return str(data['id']), ''
    if provider_name == 'discord':
        return str(data['id']), data.get('email', '')
    if provider_name == 'google':
        return str(data['id']), data.get('email', '')
    return str(data.get('id', '')), data.get(cfg['email_key'], '')


def _get_username_from_info(provider_name, info_data):
    if provider_name == 'discord':
        name = info_data.get('username', '')
        return name or f'discord_{info_data.get("id", "")}'
    if provider_name == 'github':
        return info_data.get('login', '') or f'github_{info_data.get("id", "")}'
    if provider_name == 'google':
        return info_data.get('name', '') or info_data.get('email', '').split('@')[0] or f'google_{info_data.get("id", "")}'
    return ''


@oauth_bp.route('/<provider>/login')
def oauth_login(provider):
    if provider not in PROVIDERS:
        abort(404)
    cfg = PROVIDERS[provider]
    if not cfg['client_id']:
        return jsonify({'error': f'{provider} OAuth not configured'}), 503

    state = secrets.token_urlsafe(32)
    params = {
        'client_id': cfg['client_id'],
        'redirect_uri': f'{OAUTH_REDIRECT_BASE}/api/oauth/{provider}/callback',
        'response_type': 'code',
        'scope': cfg['scope'],
        'state': state,
    }
    if provider == 'google':
        params['access_type'] = 'offline'
        params['prompt'] = 'consent'

    url = f"{cfg['auth_url']}?{urlencode(params)}"
    resp = redirect(url)
    resp.set_cookie('oauth_state', state, httponly=True, samesite='Lax', max_age=600)
    return resp


@oauth_bp.route('/<provider>/callback')
def oauth_callback(provider):
    if provider not in PROVIDERS:
        abort(404)

    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')

    if error:
        return redirect(f'{OAUTH_REDIRECT_BASE}/login?oauth_error={error}')
    if not code:
        return redirect(f'{OAUTH_REDIRECT_BASE}/login?oauth_error=no_code')

    stored_state = request.cookies.get('oauth_state')
    if stored_state and state and not secrets.compare_digest(state, stored_state):
        return redirect(f'{OAUTH_REDIRECT_BASE}/login?oauth_error=invalid_state')

    cfg = PROVIDERS[provider]
    if not cfg['client_id'] or not cfg['client_secret']:
        return jsonify({'error': f'{provider} OAuth not configured'}), 503

    token_data = {
        'client_id': cfg['client_id'],
        'client_secret': cfg['client_secret'],
        'code': code,
        'grant_type': 'authorization_code',
        'redirect_uri': f'{OAUTH_REDIRECT_BASE}/api/oauth/{provider}/callback',
    }
    token_headers = {'Accept': 'application/json'}
    try:
        token_resp = HTTP_SESSION.post(cfg['token_url'], data=token_data, headers=token_headers, timeout=15)
        token_resp.raise_for_status()
        token_json = token_resp.json()
    except Exception as e:
        logger.warning(f"OAuth token exchange failed for {provider}: {e}")
        return redirect(f'{OAUTH_REDIRECT_BASE}/login?oauth_error=token_exchange_failed')

    access_token = token_json.get('access_token')
    if not access_token:
        logger.warning(f"OAuth no access_token for {provider}: {token_json}")
        return redirect(f'{OAUTH_REDIRECT_BASE}/login?oauth_error=no_access_token')

    try:
        provider_user_id, email = _get_provider_email(provider, access_token)
        info = _get_user_info(provider, access_token)
    except Exception as e:
        logger.warning(f"OAuth userinfo fetch failed for {provider}: {e}")
        return redirect(f'{OAUTH_REDIRECT_BASE}/login?oauth_error=userinfo_failed')

    oauth_link = get_oauth_link(provider, provider_user_id)
    ip = request.remote_addr or 'unknown'

    if oauth_link:
        token = create_session(oauth_link['user_id'], ip)
        logger.info(f"OAuth login via {provider} user_id={oauth_link['user_id']}")
        resp = redirect(f'{OAUTH_REDIRECT_BASE}/')
        resp.set_cookie('auth_token', token, httponly=True, samesite='Lax', max_age=86400)
        resp.delete_cookie('oauth_state')
        return resp

    base_username = _get_username_from_info(provider, info)
    username = base_username
    attempt = 0
    while get_user_by_username(username):
        attempt += 1
        username = f"{base_username}_{attempt}"

    new_uid = create_user_from_oauth(username, provider, provider_user_id)
    if new_uid is None:
        logger.error(f"Failed to create OAuth user for {provider} provider_user_id={provider_user_id}")
        return redirect(f'{OAUTH_REDIRECT_BASE}/login?oauth_error=create_user_failed')

    if email:
        from models.db import update_user
        update_user(new_uid, email=email)

    token = create_session(new_uid, ip)
    logger.info(f"New OAuth user created via {provider}: username={username} id={new_uid}")
    resp = redirect(f'{OAUTH_REDIRECT_BASE}/')
    resp.set_cookie('auth_token', token, httponly=True, samesite='Lax', max_age=86400)
    resp.delete_cookie('oauth_state')
    return resp
