import os, json, logging
from flask import request, jsonify
from . import downloads_bp
from config import DEFAULT_DOWNLOAD_DIR, HAS_YTDLP
from models.db import list_backups, delete_backup
from models.download_state import get_download, update_download, remove_download, list_downloads_sorted, _downloads, _downloads_lock
from utils.security import auth_required
from utils.file_utils import safe_path
from workers.download import add_download_task

logger = logging.getLogger('batch_dl')

@downloads_bp.route('/downloads', methods=['GET'])
@auth_required
def list_downloads_handler():
    downloads = list_downloads_sorted()
    user_id = getattr(request, 'user_id', None)
    if user_id:
        downloads = [d for d in downloads if d.get('user_id') == user_id]
    return jsonify(downloads)

@downloads_bp.route('/downloads', methods=['POST'])
@auth_required
def create_download():
    if not HAS_YTDLP:
        return jsonify({'error': 'yt-dlp not available'}), 503
    data = request.get_json() or {}
    files = data.get('files', [])
    duplicates = data.get('duplicates', 'replace')
    output_format = data.get('format', 'mp3_192')
    results = []
    for f in files:
        url = f.get('url', '').strip()
        if not url:
            results.append({'error': 'No URL', 'status': 'failed'})
            continue
        filename = f.get('filename') or None
        item_format = f.get('format') or output_format
        result = add_download_task(url, filename=filename, duplicates=duplicates, output_format=item_format)
        results.append(result)
    return jsonify({'downloads': results, 'count': len(results)})

@downloads_bp.route('/downloads/<download_id>', methods=['GET'])
def get_download_status(download_id):
    d = get_download(download_id)
    if d is None:
        return jsonify({'error': 'Download not found'}), 404
    return jsonify(d)

@downloads_bp.route('/downloads/<download_id>', methods=['DELETE'])
@auth_required
def delete_download(download_id):
    d = get_download(download_id)
    if d is None:
        return jsonify({'error': 'Download not found'}), 404
    if d.get('status') in ('running', 'pending'):
        return jsonify({'error': 'Cannot remove active download'}), 400
    remove_download(download_id)
    return jsonify({'ok': True})

@downloads_bp.route('/downloads/retry-all', methods=['POST'])
@auth_required
def retry_all_failed():
    with _downloads_lock:
        failed = [d for d in _downloads.values() if d.get('status') == 'failed']
    if not failed:
        return jsonify({'retried': 0})
    count = 0
    for d in failed:
        url = d.get('url')
        if url:
            add_download_task(url, filename=d.get('filename'), output_format=d.get('format'))
            count += 1
        remove_download(d.get('download_id', ''))
    return jsonify({'retried': count})

@downloads_bp.route('/backups', methods=['GET', 'POST'])
@auth_required
def backups_handler():
    if request.method == 'POST':
        from models.db import save_playlist_backup
        try:
            data = request.get_json(silent=True) or {}
        except Exception:
            data = {}
        import time
        version = int(data.get('version', int(time.time() * 1000)))
        device = (data.get('device') or 'admin').strip()[:64]
        from config import DEFAULT_PLAYLIST_DIR
        playlists = []
        try:
            for fn in os.listdir(DEFAULT_PLAYLIST_DIR):
                if fn.endswith('.json'):
                    fp = os.path.join(DEFAULT_PLAYLIST_DIR, fn)
                    with open(fp, 'r') as f:
                        playlists.append({fn: json.load(f)})
        except Exception:
            pass
        save_playlist_backup(playlists, version, device)
        return jsonify({'ok': True, 'version': version})
    rows = list_backups()
    return jsonify([dict(r) for r in rows])

@downloads_bp.route('/backups/<backup_id>', methods=['DELETE'])
@auth_required
def remove_backup(backup_id):
    if delete_backup(backup_id):
        return jsonify({'ok': True})
    return jsonify({'error': 'Not found'}), 404

@downloads_bp.route('/transcode', methods=['POST'])
@auth_required
def transcode():
    data = request.get_json() or {}
    filename = data.get('filename', '').strip()
    bitrate = int(data.get('bitrate', 320))
    if not filename:
        return jsonify({'error': 'filename required'}), 400
    safe = safe_path(os.path.basename(filename))
    if not safe or not os.path.isfile(safe):
        return jsonify({'error': 'File not found'}), 404
    import subprocess
    basename, ext = os.path.splitext(os.path.basename(safe))
    out_name = f"{basename}_transcode_{bitrate}kpbs.mp3"
    out_path = os.path.join(DEFAULT_DOWNLOAD_DIR, out_name)
    try:
        subprocess.run(['ffmpeg', '-y', '-i', safe, '-b:a', str(bitrate) + 'k', out_path],
                      capture_output=True, timeout=120, check=True)
        return jsonify({'ok': True, 'output': out_name})
    except subprocess.CalledProcessError as e:
        return jsonify({'error': f"FFmpeg error: {e.stderr[:200]}"}), 500
    except FileNotFoundError:
        return jsonify({'error': 'FFmpeg not available'}), 500

@downloads_bp.route('/delete', methods=['POST'])
@auth_required
def delete_files():
    data = request.get_json() or {}
    files = data.get('files', [])
    deleted = 0
    for fn in files:
        safe = safe_path(os.path.basename(fn))
        if safe and os.path.isfile(safe):
            os.remove(safe)
            base = os.path.splitext(os.path.basename(safe))[0]
            for ext in ['.json', '.lrc', '.jpg', '.png']:
                sidecar = os.path.join(DEFAULT_DOWNLOAD_DIR, f"{base}{ext}")
                if os.path.isfile(sidecar):
                    os.remove(sidecar)
            deleted += 1
    return jsonify({'deleted': deleted})
