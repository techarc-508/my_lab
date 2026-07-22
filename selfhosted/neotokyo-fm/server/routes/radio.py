import os, re, json, time, requests, logging
from flask import request, jsonify, Response
from . import radio_bp
from config import STREAMING_DOMAINS, DEFAULT_DOWNLOAD_DIR, HTTP_SESSION
from utils.file_utils import is_streaming_url
from utils.security import auth_required, require_auth, validate_external_url, rate_limit
from services.icy import get_cached_now_playing
from services.radio_stations import load_stations, save_stations
from utils.circuit_breaker import get_breaker

_radio_breaker = get_breaker('radio-proxy', threshold=5, cooldown=60)

logger = logging.getLogger('batch_dl')

def fetch(url: str, offset: int = 0, timeout: int = 15, icy: bool = False):
    try:
        headers = {'User-Agent': 'Mozilla/5.0'}
        if icy:
            headers['Icy-MetaData'] = '1'
        if offset > 0:
            headers['Range'] = f'bytes={offset}-'
        r = HTTP_SESSION.get(url, headers=headers, stream=True, timeout=timeout)
        r.raise_for_status()
        return r
    except requests.RequestException:
        return None

def resolve_redirect(url, timeout=10):
    try:
        resp = HTTP_SESSION.head(url, allow_redirects=True, timeout=timeout)
        loc = resp.url
        if loc.startswith('http'):
            return loc
    except Exception:
        try:
            resp = HTTP_SESSION.get(url, allow_redirects=True, stream=True, timeout=timeout)
            loc = resp.url
            resp.close()
            if loc.startswith('http'):
                return loc
        except Exception:
            pass
    return url

@radio_bp.route('/radio-proxy')
@rate_limit(30, 60)
def radio_proxy():
    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'error': 'Missing URL'}), 400
    resolved = resolve_redirect(url)
    if not validate_external_url(resolved):
        return jsonify({'error': 'Station URL rejected'}), 403
    try:
        resp = _radio_breaker.call(fetch, resolved, timeout=10)
        if resp is None:
            return jsonify({'error': 'Station unreachable — try another station'}), 502
        ct = resp.headers.get('Content-Type', '')
        if not ct.startswith('audio/') and 'ogg' not in ct and 'mpeg' not in ct:
            logger.warning(f'radio-proxy: bad content-type {ct} for {url}')
        return Response(resp.iter_content(chunk_size=8192), content_type=ct or 'audio/mpeg', headers={
            'icy-name': resp.headers.get('icy-name', ''),
            'icy-genre': resp.headers.get('icy-genre', ''),
            'X-Cache': 'MISS',
        })
    except Exception as e:
        logger.error(f'radio-proxy error: {e}')
        return jsonify({'error': str(e)}), 502

@radio_bp.route('/radio-info')
def radio_info():
    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'error': 'Missing URL'}), 400
    resolved = resolve_redirect(url)
    if not validate_external_url(resolved):
        return jsonify({'error': 'URL not allowed'}), 403
    now_playing = get_cached_now_playing(resolved)
    return jsonify(now_playing)

@radio_bp.route('/radio-stations', methods=['GET', 'POST'])
def radio_stations_endpoint():
    if request.method == 'POST':
        if not require_auth():
            return jsonify({'error': 'Unauthorized'}), 401
        data = request.get_json() or {}
        stations = data.get('stations', [])
        if not isinstance(stations, list):
            return jsonify({'error': 'Stations must be a list'}), 400
        save_stations(stations)
        return jsonify({'ok': True, 'count': len(stations)})
    return jsonify(load_stations())

@radio_bp.route('/radio-stations/defaults', methods=['GET', 'POST'])
@auth_required
def restore_default_stations():
    from services.radio_stations import DEFAULT_STATIONS
    save_stations(DEFAULT_STATIONS)
    return jsonify({'ok': True, 'count': len(DEFAULT_STATIONS)})

@radio_bp.route('/radio-now')
@auth_required
def radio_now():
    from services.radio_stations import load_stations
    stations = load_stations()
    now = {}
    for s in stations:
        url = s.get('url', '')
        if url:
            now[url] = get_cached_now_playing(url)
    return jsonify(now)

@radio_bp.route('/radio-metadata')
@auth_required
def radio_metadata():
    url = request.args.get('url', '').strip()
    if not url: return jsonify({'error': 'no url'}), 400
    resolved = resolve_redirect(url)
    if not validate_external_url(resolved): return jsonify({'error': 'URL not allowed'}), 403
    try:
        resp = HTTP_SESSION.head(resolved, timeout=10)
        info = {
            'content_type': resp.headers.get('Content-Type', ''),
            'icy_name': resp.headers.get('icy-name', ''),
            'icy_genre': resp.headers.get('icy-genre', ''),
            'icy_br': resp.headers.get('icy-br', ''),
            'icy_url': resp.headers.get('icy-url', ''),
        }
        return jsonify(info)
    except Exception as e:
        return jsonify({'error': str(e)}), 502

@radio_bp.route('/radio-stations/search', methods=['POST'])
def radio_search():
    data = request.get_json() or {}
    query = data.get('query', '').strip()
    genre = data.get('genre', '').strip()
    limit = min(int(data.get('limit', 20)), 50)

    if not query and not genre:
        return jsonify({'error': 'Provide a query or genre'}), 400

    try:
        params = {'limit': limit, 'codec': 'MP3', 'hidebroken': 'true'}
        if query:
            params['name'] = query
        if genre:
            params['tag'] = genre

        resp = HTTP_SESSION.get('https://de1.api.radio-browser.info/json/stations/search',
                                params=params, timeout=15)
        resp.raise_for_status()
        raw = resp.json()
    except requests.RequestException:
        return jsonify({'error': 'radio-browser.info unreachable'}), 502

    results = []
    for st in raw:
        url = (st.get('url', '') or '').strip()
        name = (st.get('name', '') or '').strip()
        tags = (st.get('tags', '') or '').strip()
        codec = (st.get('codec', '') or '').strip()
        bitrate = st.get('bitrate', 0) or 0
        country = (st.get('country', '') or '').strip()
        language = (st.get('language', '') or '').strip()

        if not url or not name:
            continue
        # Zeno FM streams don't work through our proxy (401)
        if 'zeno.fm' in url or 'zenolive.com' in url:
            continue
        # Skip playlist URLs
        if url.endswith('.m3u8') or url.endswith('.pls') or url.endswith('.m3u'):
            continue
        # Quick connectivity test
        try:
            r = HTTP_SESSION.get(url, stream=True, timeout=3, allow_redirects=True)
            ct = r.headers.get('Content-Type', '')
            is_audio = ct.startswith('audio/') or 'ogg' in ct or 'mpeg' in ct
            payload = r.raw.read(512)
            r.close()
            if r.status_code != 200 or not is_audio or len(payload) < 100:
                continue
        except Exception:
            continue

        results.append({
            'name': name,
            'url': url,
            'genre': tags.split(',')[0].strip() or genre or 'Unknown',
            'tags': tags,
            'codec': codec,
            'bitrate': bitrate,
            'country': country,
            'language': language,
        })

    return jsonify({'results': results, 'count': len(results)})


@radio_bp.route('/radio-recording', methods=['POST'])
@auth_required
def radio_recording():
    data = request.get_json() or {}
    station_url = data.get('url', '').strip()
    action = data.get('action', 'start')
    if not station_url:
        return jsonify({'error': 'no url'}), 400
    resolved = resolve_redirect(station_url)
    if not validate_external_url(resolved):
        return jsonify({'error': 'URL not allowed'}), 403
    from workers.metadata import start_recording, stop_recording, get_recording_status
    if action == 'start':
        duration = int(data.get('duration', 300))
        result = start_recording(resolved, duration)
        return jsonify(result)
    elif action == 'stop':
        result = stop_recording(resolved)
        return jsonify(result)
    elif action == 'status':
        return jsonify(get_recording_status())
    return jsonify({'error': 'unknown action'}), 400
