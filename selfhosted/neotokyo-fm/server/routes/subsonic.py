import os, logging, time, json, hashlib, random
from flask import request, jsonify, Response, send_file
from xml.etree.ElementTree import Element, SubElement, tostring
from . import subsonic_bp
from config import DEFAULT_DOWNLOAD_DIR, DEFAULT_PLAYLIST_DIR
from utils.security import require_auth
from utils.file_utils import is_audio_file, safe_path

logger = logging.getLogger('batch_dl')


def _get_format():
    return request.args.get('f', 'xml')


def _load_meta(basename):
    meta_path = os.path.join(DEFAULT_DOWNLOAD_DIR, '.meta', basename, f'{basename}.meta.json')
    if os.path.isfile(meta_path):
        try:
            with open(meta_path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _scan_all_tracks():
    tracks = []
    for f in os.listdir(DEFAULT_DOWNLOAD_DIR):
        if not f.startswith('.') and is_audio_file(f):
            base, _ = os.path.splitext(f)
            meta = _load_meta(base)
            tracks.append((f, meta))
    return tracks


def _content_type(ext):
    ext = ext.lower()
    return {
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/ogg',
        '.wav': 'audio/wav',
        '.wma': 'audio/x-ms-wma',
        '.aac': 'audio/aac',
        '.mp4': 'audio/mp4',
        '.webm': 'audio/webm',
    }.get(ext, 'audio/mpeg')


def _load_playlists_from_disk():
    pl_file = os.path.join(DEFAULT_PLAYLIST_DIR, 'playlists.json')
    if os.path.isfile(pl_file):
        try:
            with open(pl_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _save_playlists_to_disk(playlists):
    os.makedirs(DEFAULT_PLAYLIST_DIR, exist_ok=True)
    pl_file = os.path.join(DEFAULT_PLAYLIST_DIR, 'playlists.json')
    with open(pl_file, 'w', encoding='utf-8') as f:
        json.dump(playlists, f, indent=2)


def _build_song_attrib(filename, meta=None):
    if meta is None:
        base, _ = os.path.splitext(filename)
        meta = _load_meta(base)
    filepath = os.path.join(DEFAULT_DOWNLOAD_DIR, filename)
    size = str(os.path.getsize(filepath)) if os.path.isfile(filepath) else '0'
    ext = os.path.splitext(filename)[1].lower()
    return {
        'id': filename,
        'title': meta.get('title', os.path.splitext(filename)[0]),
        'artist': meta.get('artist', ''),
        'album': meta.get('album', ''),
        'size': size,
        'contentType': _content_type(ext),
        'suffix': ext.lstrip('.'),
        'duration': str(meta.get('duration', '0')),
        'bitRate': str(meta.get('bitrate', '128')),
        'path': filename,
    }


def _elem_to_json(elem):
    if len(elem) == 0 and not elem.attrib:
        return elem.text or ""
    children = list(elem)
    if not children:
        result = dict(elem.attrib)
        if 'openSubsonic' in result:
            result['openSubsonic'] = True
        return result
    tags = {}
    for c in children:
        tags.setdefault(c.tag, []).append(c)
    result = dict(elem.attrib) if elem.attrib else {}
    for tag, items in tags.items():
        if len(items) == 1:
            result[tag] = _elem_to_json(items[0])
        else:
            result[tag] = [_elem_to_json(c) for c in items]
    return result


def _response(root, fmt='xml'):
    root.set('openSubsonic', 'true')
    if fmt == 'json':
        data = {"subsonic-response": {}}
        for key, val in root.attrib.items():
            if key == 'openSubsonic':
                data["subsonic-response"][key] = True
            else:
                data["subsonic-response"][key] = val
        for child in root:
            data["subsonic-response"][child.tag] = _elem_to_json(child)
        resp = jsonify(data)
    else:
        xml = '<?xml version="1.0" encoding="UTF-8"?>' + tostring(root, encoding='unicode')
        resp = Response(xml, mimetype='application/xml')
    resp.headers['X-OpenSubsonic'] = 'true'
    return resp


def _subsonic_error(code=40, message='Unknown error', fmt='xml'):
    root = Element('subsonic-response', attrib={
        'xmlns': 'http://subsonic.org/restapi',
        'status': 'failed',
        'version': '1.16.1',
    })
    SubElement(root, 'error', attrib={'code': str(code), 'message': message})
    return _response(root, fmt)


def _check_auth():
    u = request.args.get('u', '')
    p = request.args.get('p', '')
    t = request.args.get('t', '')
    s = request.args.get('s', '')
    if not u:
        auth = request.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            from models.db import get_session_by_token
            session = get_session_by_token(auth[7:])
            if session:
                return session
        return None
    from models.db import get_user_by_username
    user = get_user_by_username(u)
    if not user:
        return None
    if p:
        from werkzeug.security import check_password_hash
        if p.startswith('enc:'):
            p = p[4:]
        if check_password_hash(user['password_hash'], p):
            return user
    if t and s:
        logger.debug(f"Subsonic token auth rejected for user '{u}': MD5 token auth not supported with hashed passwords. Use Bearer token or plaintext password.")
        return None
    return None


def _make_root(status='ok'):
    return Element('subsonic-response', attrib={
        'xmlns': 'http://subsonic.org/restapi',
        'status': status,
        'version': '1.16.1',
    })


# ============================================================
# EXISTING ENDPOINTS (refactored with JSON + OpenSubsonic)
# ============================================================

@subsonic_bp.route('/ping')
def ping():
    fmt = _get_format()
    return _response(_make_root(), fmt)


@subsonic_bp.route('/getMusicFolders')
def get_music_folders():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    root = _make_root()
    folders = SubElement(root, 'musicFolders')
    SubElement(folders, 'musicFolder', attrib={
        'id': '1', 'name': os.path.basename(DEFAULT_DOWNLOAD_DIR)
    })
    return _response(root, fmt)


@subsonic_bp.route('/getArtists')
def get_artists():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    artists = {}
    for f in os.listdir(DEFAULT_DOWNLOAD_DIR):
        if not f.startswith('.') and is_audio_file(f):
            base, _ = os.path.splitext(f)
            meta = _load_meta(base)
            name = meta.get('artist', '')
            if name:
                artists.setdefault(name, {'count': 0})
                artists[name]['count'] += 1
    root = _make_root()
    artists_el = SubElement(root, 'artists')
    for name in sorted(artists):
        SubElement(artists_el, 'artist', attrib={
            'id': name, 'name': name,
            'albumCount': str(artists[name]['count']),
        })
    return _response(root, fmt)


@subsonic_bp.route('/getAlbumList')
def get_album_list():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    albums = {}
    for f in os.listdir(DEFAULT_DOWNLOAD_DIR):
        if not f.startswith('.') and is_audio_file(f):
            base, _ = os.path.splitext(f)
            meta = _load_meta(base)
            name = meta.get('album', '')
            if name:
                albums.setdefault(name, {'artist': meta.get('artist', ''), 'count': 0})
                albums[name]['count'] += 1
    offset = int(request.args.get('offset', '0'))
    size = int(request.args.get('size', '20'))
    root = _make_root()
    album_list = SubElement(root, 'albumList')
    for name in sorted(albums)[offset:offset + size]:
        SubElement(album_list, 'album', attrib={
            'id': name,
            'name': name,
            'artist': albums[name]['artist'],
            'songCount': str(albums[name]['count']),
        })
    return _response(root, fmt)


@subsonic_bp.route('/stream')
def stream():
    user = _check_auth()
    if not user:
        fmt = _get_format()
        return _subsonic_error(40, 'Wrong username or password', fmt)
    fid = request.args.get('id', '')
    if not fid:
        fmt = _get_format()
        return _subsonic_error(10, 'Missing id parameter', fmt)
    filepath = safe_path(fid)
    if filepath is None or not os.path.isfile(filepath):
        fmt = _get_format()
        return _subsonic_error(70, 'File not found', fmt)
    return send_file(filepath)


@subsonic_bp.route('/getCoverArt')
def get_cover_art():
    user = _check_auth()
    if not user:
        fmt = _get_format()
        return _subsonic_error(40, 'Wrong username or password', fmt)
    fid = request.args.get('id', '')
    if not fid:
        fmt = _get_format()
        return _subsonic_error(10, 'Missing id parameter', fmt)
    fid = os.path.basename(fid)
    base = os.path.splitext(fid)[0]
    cover_path = os.path.join(DEFAULT_DOWNLOAD_DIR, '.meta', base, 'cover.jpg')
    alt_path = os.path.join(DEFAULT_DOWNLOAD_DIR, '.meta', base, 'cover.png')
    p = cover_path if os.path.isfile(cover_path) else (alt_path if os.path.isfile(alt_path) else None)
    if not p:
        fmt = _get_format()
        return _subsonic_error(70, 'Cover not found', fmt)
    return send_file(p)


@subsonic_bp.route('/scrobble', methods=['GET', 'POST'])
def scrobble():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    title = request.args.get('title', '')
    artist = request.args.get('artist', '')
    album = request.args.get('album', '')
    if title:
        from models.db import log_play
        log_play(title, artist, album, ip=request.remote_addr or '')
    return _response(_make_root(), fmt)


# ============================================================
# NEW ENDPOINTS — Playlists
# ============================================================

@subsonic_bp.route('/getPlaylists')
def get_playlists():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    playlists = _load_playlists_from_disk()
    root = _make_root()
    pl_el = SubElement(root, 'playlists')
    for idx, pl in enumerate(playlists):
        total_dur = 0
        for track_name in pl.get('tracks', []):
            base, _ = os.path.splitext(track_name)
            meta = _load_meta(base)
            total_dur += int(meta.get('duration', 0))
        SubElement(pl_el, 'playlist', attrib={
            'id': str(idx),
            'name': pl.get('name', ''),
            'owner': user.get('username', ''),
            'public': 'false',
            'songCount': str(len(pl.get('tracks', []))),
            'duration': str(total_dur),
            'created': pl.get('created', ''),
        })
    return _response(root, fmt)


@subsonic_bp.route('/getPlaylist')
def get_playlist():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    pid = request.args.get('id', '')
    if not pid:
        return _subsonic_error(10, 'Missing id parameter', fmt)
    try:
        idx = int(pid)
    except ValueError:
        return _subsonic_error(10, 'Invalid playlist id', fmt)
    playlists = _load_playlists_from_disk()
    if idx < 0 or idx >= len(playlists):
        return _subsonic_error(70, 'Playlist not found', fmt)
    pl = playlists[idx]
    total_dur = 0
    root = _make_root()
    pl_el = SubElement(root, 'playlist', attrib={
        'id': str(idx),
        'name': pl.get('name', ''),
        'owner': user.get('username', ''),
        'public': 'false',
        'songCount': str(len(pl.get('tracks', []))),
        'created': pl.get('created', ''),
    })
    for track_name in pl.get('tracks', []):
        base, _ = os.path.splitext(track_name)
        meta = _load_meta(base)
        total_dur += int(meta.get('duration', 0))
        SubElement(pl_el, 'entry', attrib=_build_song_attrib(track_name, meta))
    pl_el.set('duration', str(total_dur))
    return _response(root, fmt)


@subsonic_bp.route('/createPlaylist', methods=['GET', 'POST'])
def create_playlist():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    name = (request.args.get('name', '') or '').strip()
    if not name:
        return _subsonic_error(10, 'Missing playlist name', fmt)
    song_ids = request.args.getlist('songId')
    playlists = _load_playlists_from_disk()
    pl = {
        'name': name,
        'tracks': song_ids,
        'created': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'user_id': user.get('id', 1),
    }
    playlists.append(pl)
    _save_playlists_to_disk(playlists)
    total_dur = 0
    for track_name in song_ids:
        base, _ = os.path.splitext(track_name)
        meta = _load_meta(base)
        total_dur += int(meta.get('duration', 0))
    root = _make_root()
    SubElement(root, 'playlist', attrib={
        'id': str(len(playlists) - 1),
        'name': name,
        'owner': user.get('username', ''),
        'public': 'false',
        'songCount': str(len(song_ids)),
        'duration': str(total_dur),
        'created': pl['created'],
    })
    return _response(root, fmt)


@subsonic_bp.route('/deletePlaylist', methods=['GET', 'POST'])
def delete_playlist():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    pid = request.args.get('id', '')
    if not pid:
        return _subsonic_error(10, 'Missing id parameter', fmt)
    try:
        idx = int(pid)
    except ValueError:
        return _subsonic_error(10, 'Invalid playlist id', fmt)
    playlists = _load_playlists_from_disk()
    if idx < 0 or idx >= len(playlists):
        return _subsonic_error(70, 'Playlist not found', fmt)
    del playlists[idx]
    _save_playlists_to_disk(playlists)
    return _response(_make_root(), fmt)


@subsonic_bp.route('/updatePlaylist', methods=['GET', 'POST'])
def update_playlist():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    pid = request.args.get('playlistId', '')
    if not pid:
        return _subsonic_error(10, 'Missing playlistId parameter', fmt)
    try:
        idx = int(pid)
    except ValueError:
        return _subsonic_error(10, 'Invalid playlist id', fmt)
    playlists = _load_playlists_from_disk()
    if idx < 0 or idx >= len(playlists):
        return _subsonic_error(70, 'Playlist not found', fmt)
    pl = playlists[idx]
    songs_to_add = request.args.getlist('songIdToAdd')
    songs_to_remove = request.args.getlist('songIndexToRemove')
    if songs_to_add:
        pl.setdefault('tracks', []).extend(songs_to_add)
    if songs_to_remove:
        tracks = pl.get('tracks', [])
        for ri in sorted(songs_to_remove, key=int, reverse=True):
            r = int(ri)
            if 0 <= r < len(tracks):
                del tracks[r]
    _save_playlists_to_disk(playlists)
    return _response(_make_root(), fmt)


# ============================================================
# NEW ENDPOINTS — Search
# ============================================================

@subsonic_bp.route('/search2')
def search2():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    query = request.args.get('query', '')
    if not query:
        return _subsonic_error(10, 'Missing query parameter', fmt)
    artist_count = int(request.args.get('artistCount', '20'))
    album_count = int(request.args.get('albumCount', '20'))
    song_count = int(request.args.get('songCount', '20'))
    tracks = _scan_all_tracks()
    ql = query.lower()
    matched_artists = {}
    matched_albums = {}
    matched_songs = []
    for filename, meta in tracks:
        title = meta.get('title', '')
        artist = meta.get('artist', '')
        album = meta.get('album', '')
        if artist and ql in artist.lower() and artist not in matched_artists:
            matched_artists[artist] = True
        if album and ql in album.lower() and (artist, album) not in matched_albums:
            matched_albums[(artist, album)] = {'artist': artist, 'album': album}
        if ql in title.lower() or ql in artist.lower() or ql in album.lower():
            matched_songs.append((filename, meta))
    root = _make_root()
    sr = SubElement(root, 'searchResult2')
    for artist_name in sorted(matched_artists.keys())[:artist_count]:
        SubElement(sr, 'artist', attrib={'id': artist_name, 'name': artist_name})
    for (artist_name, album_name), info in list(matched_albums.items())[:album_count]:
        SubElement(sr, 'album', attrib={
            'id': album_name,
            'name': album_name,
            'artist': info['artist'],
        })
    for filename, meta in matched_songs[:song_count]:
        SubElement(sr, 'song', attrib=_build_song_attrib(filename, meta))
    return _response(root, fmt)


@subsonic_bp.route('/search3')
def search3():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    query = request.args.get('query', '')
    if not query:
        return _subsonic_error(10, 'Missing query parameter', fmt)
    artist_count = int(request.args.get('artistCount', '20'))
    album_count = int(request.args.get('albumCount', '20'))
    song_count = int(request.args.get('songCount', '20'))
    tracks = _scan_all_tracks()
    ql = query.lower()
    matched_artists = {}
    matched_albums = {}
    matched_songs = []
    for filename, meta in tracks:
        title = meta.get('title', '')
        artist = meta.get('artist', '')
        album = meta.get('album', '')
        if artist and ql in artist.lower() and artist not in matched_artists:
            matched_artists[artist] = {'artist': artist}
        if album and ql in album.lower() and (artist, album) not in matched_albums:
            matched_albums[(artist, album)] = {'artist': artist, 'album': album}
        if ql in title.lower() or ql in artist.lower() or ql in album.lower():
            matched_songs.append((filename, meta))
    root = _make_root()
    sr = SubElement(root, 'searchResult3')
    for artist_name in sorted(matched_artists.keys())[:artist_count]:
        SubElement(sr, 'artist', attrib={
            'id': artist_name,
            'name': artist_name,
            'albumCount': '0',
        })
    for (artist_name, album_name), info in list(matched_albums.items())[:album_count]:
        SubElement(sr, 'album', attrib={
            'id': album_name,
            'name': album_name,
            'artist': info['artist'],
            'artistId': info['artist'],
            'songCount': '0',
        })
    for filename, meta in matched_songs[:song_count]:
        SubElement(sr, 'song', attrib=_build_song_attrib(filename, meta))
    return _response(root, fmt)


# ============================================================
# NEW ENDPOINTS — Browse/Library
# ============================================================

@subsonic_bp.route('/getSong')
def get_song():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    fid = request.args.get('id', '')
    if not fid:
        return _subsonic_error(10, 'Missing id parameter', fmt)
    filepath = safe_path(fid)
    if filepath is None or not os.path.isfile(filepath):
        return _subsonic_error(70, 'File not found', fmt)
    base, _ = os.path.splitext(fid)
    meta = _load_meta(base)
    root = _make_root()
    SubElement(root, 'song', attrib=_build_song_attrib(fid, meta))
    return _response(root, fmt)


@subsonic_bp.route('/getArtist')
def get_artist():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    artist_id = request.args.get('id', '')
    if not artist_id:
        return _subsonic_error(10, 'Missing id parameter', fmt)
    tracks = _scan_all_tracks()
    albums = {}
    for filename, meta in tracks:
        if meta.get('artist', '') == artist_id:
            album_name = meta.get('album', '')
            if album_name:
                albums.setdefault(album_name, {'count': 0})
                albums[album_name]['count'] += 1
    root = _make_root()
    SubElement(root, 'artist', attrib={
        'id': artist_id,
        'name': artist_id,
        'albumCount': str(len(albums)),
    })
    return _response(root, fmt)


@subsonic_bp.route('/getAlbum')
def get_album():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    album_id = request.args.get('id', '')
    if not album_id:
        return _subsonic_error(10, 'Missing id parameter', fmt)
    tracks = _scan_all_tracks()
    album_songs = []
    artist_name = ''
    for filename, meta in tracks:
        if meta.get('album', '') == album_id:
            album_songs.append((filename, meta))
            if not artist_name:
                artist_name = meta.get('artist', '')
    root = _make_root()
    album_el = SubElement(root, 'album', attrib={
        'id': album_id,
        'name': album_id,
        'artist': artist_name,
        'songCount': str(len(album_songs)),
    })
    for filename, meta in album_songs:
        SubElement(album_el, 'song', attrib=_build_song_attrib(filename, meta))
    return _response(root, fmt)


@subsonic_bp.route('/getIndexes')
def get_indexes():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    tracks = _scan_all_tracks()
    artists = set()
    for _, meta in tracks:
        name = meta.get('artist', '')
        if name:
            artists.add(name)
    root = _make_root()
    indexes_el = SubElement(root, 'indexes')
    if artists:
        import string
        by_letter = {}
        for name in sorted(artists):
            letter = name[0].upper()
            if letter not in string.ascii_uppercase:
                letter = '#'
            by_letter.setdefault(letter, []).append(name)
        for letter in sorted(by_letter.keys()):
            idx_el = SubElement(indexes_el, 'index', attrib={'name': letter})
            for artist_name in by_letter[letter]:
                SubElement(idx_el, 'artist', attrib={
                    'id': artist_name,
                    'name': artist_name,
                })
    return _response(root, fmt)


@subsonic_bp.route('/getMusicDirectory')
def get_music_directory():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    did = request.args.get('id', '')
    if not did:
        return _subsonic_error(10, 'Missing id parameter', fmt)
    tracks = _scan_all_tracks()
    root = _make_root()
    dir_el = SubElement(root, 'directory', attrib={
        'id': did,
        'name': did,
    })
    for filename, meta in tracks:
        if meta.get('artist', '') == did or meta.get('album', '') == did:
            SubElement(dir_el, 'child', attrib=_build_song_attrib(filename, meta))
    return _response(root, fmt)


# ============================================================
# NEW ENDPOINTS — Misc
# ============================================================

@subsonic_bp.route('/getLicense')
def get_license():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    root = _make_root()
    SubElement(root, 'license', attrib={
        'valid': 'true',
        'email': 'opensource@neotokyo.fm',
        'licenseExpires': '2099-12-31T23:59:59Z',
    })
    return _response(root, fmt)


@subsonic_bp.route('/getRandomSongs')
def get_random_songs():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    size = int(request.args.get('size', '10'))
    tracks = _scan_all_tracks()
    if tracks:
        selected = random.sample(tracks, min(size, len(tracks)))
    else:
        selected = []
    root = _make_root()
    songs_el = SubElement(root, 'randomSongs')
    for filename, meta in selected:
        SubElement(songs_el, 'song', attrib=_build_song_attrib(filename, meta))
    return _response(root, fmt)


@subsonic_bp.route('/getNowPlaying')
def get_now_playing():
    fmt = _get_format()
    user = _check_auth()
    if not user:
        return _subsonic_error(40, 'Wrong username or password', fmt)
    from models.db import get_recent_plays
    recent = get_recent_plays(limit=10)
    root = _make_root()
    np_el = SubElement(root, 'nowPlaying')
    for entry in recent:
        title = entry.get('title', '')
        artist = entry.get('artist', '')
        album = entry.get('album', '')
        played_at = entry.get('played_at', '')
        try:
            import datetime
            if played_at:
                dt = datetime.datetime.strptime(played_at, '%Y-%m-%d %H:%M:%S')
                minutes_ago = int((datetime.datetime.now() - dt).total_seconds() / 60)
            else:
                minutes_ago = 0
        except Exception:
            minutes_ago = 0
        SubElement(np_el, 'entry', attrib={
            'id': title,
            'title': title,
            'artist': artist,
            'album': album,
            'username': user.get('username', ''),
            'minutesAgo': str(minutes_ago),
            'playerId': '0',
            'playerName': 'NEOTOKYO FM',
        })
    return _response(root, fmt)


@subsonic_bp.route('/download')
def download():
    user = _check_auth()
    if not user:
        fmt = _get_format()
        return _subsonic_error(40, 'Wrong username or password', fmt)
    fid = request.args.get('id', '')
    if not fid:
        fmt = _get_format()
        return _subsonic_error(10, 'Missing id parameter', fmt)
    filepath = safe_path(fid)
    if filepath is None or not os.path.isfile(filepath):
        fmt = _get_format()
        return _subsonic_error(70, 'File not found', fmt)
    return send_file(filepath, as_attachment=True, download_name=os.path.basename(fid))


@subsonic_bp.route('/getAvatar')
def get_avatar():
    user = _check_auth()
    if not user:
        fmt = _get_format()
        return _subsonic_error(40, 'Wrong username or password', fmt)
    avatar_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'default_avatar.png')
    if not os.path.isfile(avatar_path):
        avatar_path = os.path.join(os.path.dirname(__file__), '..', 'static', 'default_avatar.jpg')
    if os.path.isfile(avatar_path):
        return send_file(avatar_path)
    default = ('data:image/png;base64,'
               'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY'
               '42YAAAAASUVORK5CYII=')
    import base64
    img_bytes = base64.b64decode(default.split(',')[1])
    return Response(img_bytes, mimetype='image/png')
