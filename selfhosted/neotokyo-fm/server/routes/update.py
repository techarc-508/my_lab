import os, logging, threading, json
from flask import request, jsonify
from . import update_bp
from config import APP_VERSION
from utils.security import admin_required

logger = logging.getLogger('batch_dl')

_update_status = {'status': 'idle', 'message': ''}

@update_bp.route('/update/check')
@admin_required
def update_check():
    current = APP_VERSION
    latest = APP_VERSION
    update_available = False
    release_notes = ''
    try:
        import subprocess
        r = subprocess.run(['git', 'tag', '--sort=-version:refname'], capture_output=True, text=True, timeout=10, cwd=os.path.dirname(os.path.dirname(__file__)))
        tags = [t.strip() for t in r.stdout.strip().split('\n') if t.strip()]
        if tags and tags[0] != current:
            latest = tags[0]
            update_available = True
    except Exception:
        pass
    return jsonify({
        'current': current,
        'latest': latest,
        'update_available': update_available,
        'release_notes': release_notes,
    })

@update_bp.route('/update/apply', methods=['POST'])
@admin_required
def update_apply():
    global _update_status
    if _update_status['status'] == 'installing':
        return jsonify({'error': 'Update already in progress'}), 409
    _update_status = {'status': 'installing', 'message': 'Starting update...'}
    threading.Thread(target=_do_update, daemon=True).start()
    return jsonify({'status': 'installing'})

def _do_update():
    global _update_status
    try:
        import subprocess
        base = os.path.dirname(os.path.dirname(__file__))
        _update_status['message'] = 'Fetching latest code...'
        r = subprocess.run(['git', 'fetch', 'origin'], capture_output=True, text=True, timeout=30, cwd=base)
        if r.returncode != 0:
            _update_status = {'status': 'error', 'message': f'git fetch failed: {r.stderr[:200]}'}
            return
        _update_status['message'] = 'Rebasing...'
        r = subprocess.run(['git', 'rebase', 'origin/main'], capture_output=True, text=True, timeout=30, cwd=base)
        if r.returncode != 0:
            subprocess.run(['git', 'rebase', '--abort'], capture_output=True, cwd=base)
            _update_status = {'status': 'error', 'message': f'Rebase failed: {r.stderr[:200] if r.stderr else r.stdout[:200]}'}
            return
        _update_status['message'] = 'Update complete. Please restart.'
        _update_status['status'] = 'done'
    except Exception as e:
        _update_status = {'status': 'error', 'message': str(e)[:500]}

@update_bp.route('/update/status')
def update_status():
    return jsonify(_update_status)
