import os, json, threading, logging, time
from flask import request, jsonify
from . import playlists_bp
from config import DEFAULT_DOWNLOAD_DIR, DEFAULT_PLAYLIST_DIR
from utils.security import auth_required

logger = logging.getLogger('batch_dl')

_playlists_file = os.path.join(DEFAULT_PLAYLIST_DIR, 'playlists.json')
_playlists_cache = None
_playlists_lock = threading.Lock()
_playlists_mtime = 0

def _load_playlists():
    global _playlists_cache, _playlists_mtime
    with _playlists_lock:
        if os.path.isfile(_playlists_file):
            mtime = os.path.getmtime(_playlists_file)
            if _playlists_cache is not None and mtime <= _playlists_mtime:
                return _playlists_cache
            try:
                with open(_playlists_file, 'r', encoding='utf-8') as f:
                    _playlists_cache = json.load(f)
                _playlists_mtime = mtime
                return _playlists_cache
            except (json.JSONDecodeError, OSError):
                pass
    return []

def _save_playlists(playlists):
    global _playlists_cache, _playlists_mtime
    with _playlists_lock:
        os.makedirs(DEFAULT_PLAYLIST_DIR, exist_ok=True)
        with open(_playlists_file, 'w', encoding='utf-8') as f:
            json.dump(playlists, f, indent=2)
        _playlists_cache = playlists
        _playlists_mtime = os.path.getmtime(_playlists_file)

@playlists_bp.route('/playlists', methods=['GET'])
def list_playlists():
    return jsonify(_load_playlists())

@playlists_bp.route('/playlists', methods=['POST'])
@auth_required
def create_playlist():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name required'}), 400
    if len(name) > 128:
        return jsonify({'error': 'name must be 128 characters or fewer'}), 400
    pl = {'name': name, 'tracks': [], 'created': time.time()}
    playlists = _load_playlists()
    playlists.append(pl)
    _save_playlists(playlists)
    return jsonify(pl)

@playlists_bp.route('/playlists/<playlist_name>', methods=['PUT'])
@auth_required
def update_playlist(playlist_name):
    data = request.get_json() or {}
    tracks = data.get('tracks', [])
    playlists = _load_playlists()
    for pl in playlists:
        if pl.get('name') == playlist_name:
            pl['tracks'] = tracks
            _save_playlists(playlists)
            return jsonify(pl)
    return jsonify({'error': 'Not found'}), 404

@playlists_bp.route('/playlists/<playlist_name>', methods=['DELETE'])
@auth_required
def delete_playlist(playlist_name):
    playlists = _load_playlists()
    new_pls = [pl for pl in playlists if pl.get('name') != playlist_name]
    if len(new_pls) < len(playlists):
        _save_playlists(new_pls)
        return jsonify({'ok': True})
    return jsonify({'error': 'Not found'}), 404

@playlists_bp.route('/playlists/export', methods=['POST'])
@auth_required
def export_playlist():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name required'}), 400
    playlists = _load_playlists()
    for pl in playlists:
        if pl.get('name') == name:
            return jsonify({'name': pl['name'], 'tracks': pl.get('tracks', []), 'exported': True})
    return jsonify({'error': 'Not found'}), 404
