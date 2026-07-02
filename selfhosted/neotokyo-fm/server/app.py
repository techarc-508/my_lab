import os, sys, datetime, threading, logging, subprocess, secrets, time
from datetime import timedelta

_user_bin = os.path.expanduser('~/.opencode/bin')
if _user_bin not in os.environ.get('PATH', ''):
    os.environ['PATH'] = f"{_user_bin}:{os.environ.get('PATH', '')}"

from config import add_log_handler
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
add_log_handler()
logger = logging.getLogger('batch_dl')

from flask import Flask, request, jsonify, session, Response

from config import FLASK_SECRET_KEY, DEFAULT_DOWNLOAD_DIR, DEFAULT_PLAYLIST_DIR, METADATA_DIR, CORS_ORIGIN, PORT, HOST
from utils.security import require_auth
from services.icy import icy_poll_worker
from services.lrclib import _lrclib_disabled
from models.db import init_db

from routes import auth_bp, files_bp, youtube_bp, radio_bp, downloads_bp, playlists_bp, admin_bp

def create_app():
    app = Flask(__name__, static_folder=None)
    app.secret_key = FLASK_SECRET_KEY
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'
    app.config['SESSION_COOKIE_SECURE'] = False
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=24)
    app.config['SESSION_PERMANENT'] = True

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get('Origin', '')
        if CORS_ORIGIN == '*' or origin == CORS_ORIGIN:
            response.headers['Access-Control-Allow-Origin'] = origin if origin else '*'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-CSRF-Token, X-Requested-With'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
            response.headers['Vary'] = 'Origin'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response

    @app.before_request
    def csrf_check():
        if request.method in ('POST', 'PUT', 'DELETE'):
            if '/api/login' in request.path:
                return
            csrf = request.headers.get('X-CSRF-Token', '')
            if not csrf or not secrets.compare_digest(csrf, session.get('csrf_token', '')):
                return jsonify({'error': 'CSRF token missing or invalid'}), 403

    app.register_blueprint(auth_bp)
    app.register_blueprint(files_bp)
    app.register_blueprint(youtube_bp)
    app.register_blueprint(radio_bp)
    app.register_blueprint(downloads_bp)
    app.register_blueprint(playlists_bp)
    app.register_blueprint(admin_bp)

    @app.route('/')
    def index():
        return jsonify({'app': 'NEOTOKYO FM', 'version': '2.0', 'status': 'ok'})

    @app.route('/api/csrf-token')
    def get_csrf_token():
        if 'csrf_token' not in session:
            session['csrf_token'] = secrets.token_hex(32)
        return jsonify({'csrf_token': session['csrf_token']})

    @app.route('/api/metrics')
    def api_metrics():
        try:
            import prometheus_client
            from prometheus_client import REGISTRY, generate_latest, CONTENT_TYPE_LATEST
            metrics = generate_latest(REGISTRY)
            return Response(metrics, mimetype=CONTENT_TYPE_LATEST)
        except Exception:
            import os, time
            from config import _start_time, DEFAULT_DOWNLOAD_DIR
            uptime = time.time() - _start_time
            lines = [
                '# HELP neotokyo_uptime_seconds Server uptime in seconds',
                '# TYPE neotokyo_uptime_seconds gauge',
                f'neotokyo_uptime_seconds {uptime}',
                '# HELP neotokyo_build_info Build info',
                '# TYPE neotokyo_build_info gauge',
                'neotokyo_build_info{version="2.0",python="3.12"} 1',
            ]
            try:
                files = [f for f in os.listdir(DEFAULT_DOWNLOAD_DIR) if os.path.isfile(os.path.join(DEFAULT_DOWNLOAD_DIR, f))]
                lines.append('# HELP neotokyo_files_total Total files in download directory')
                lines.append('# TYPE neotokyo_files_total gauge')
                lines.append(f'neotokyo_files_total {len(files)}')
            except Exception:
                pass
            return Response('\n'.join(lines) + '\n', mimetype='text/plain; charset=utf-8')

    @app.route('/api/health')
    def api_health():
        ffmpeg_ver = None
        try:
            r = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=5)
            if r.returncode == 0:
                ffmpeg_ver = r.stdout.split('\n')[0].strip()
        except Exception:
            pass
        return jsonify({
            'status': 'ok',
            'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
            'ffmpeg': ffmpeg_ver,
            'lrclib': not _lrclib_disabled,
            'python': sys.version,
            'download_dir': DEFAULT_DOWNLOAD_DIR,
        })

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'error': 'Not found'}), 404

    @app.errorhandler(500)
    def server_error(e):
        log_id = secrets.token_hex(8)
        logger.error(f"Internal error [{log_id}]: {e}")
        return jsonify({'error': 'Internal server error', 'log_id': log_id}), 500

    return app

def _periodic_maintenance():
    from models.db import wal_checkpoint
    while True:
        time.sleep(3600)
        wal_checkpoint()

def _daily_auto_backup():
    while True:
        now = datetime.datetime.utcnow()
        target = now.replace(hour=18, minute=30, second=0, microsecond=0)
        if now >= target:
            target += datetime.timedelta(days=1)
        sleep_secs = (target - now).total_seconds()
        time.sleep(sleep_secs)
        try:
            from models.db import save_scheduled_backup
            from services.radio_stations import load_stations
            import json
            ts = datetime.datetime.utcnow().strftime('%Y-%m-%d_%H-%M-%S')
            backup_dir = os.path.join(DEFAULT_DOWNLOAD_DIR, '.auto_backups')
            os.makedirs(backup_dir, exist_ok=True)
            stations = load_stations()
            with open(os.path.join(backup_dir, f'radio_stations_{ts}.json'), 'w') as f:
                json.dump(stations, f, indent=2)
            playlists = []
            for fn in os.listdir(DEFAULT_PLAYLIST_DIR):
                if fn.endswith('.json'):
                    fp = os.path.join(DEFAULT_PLAYLIST_DIR, fn)
                    with open(fp) as f:
                        playlists.append({fn: json.load(f)})
            with open(os.path.join(backup_dir, f'playlists_{ts}.json'), 'w') as f:
                json.dump(playlists, f, indent=2)
            save_scheduled_backup(f'auto_backup_{ts}')
            logger.info(f"Auto backup created: radio_stations_{ts}.json + playlists_{ts}.json")
        except Exception as e:
            logger.warning(f"Auto backup failed: {e}")

def main():
    os.makedirs(DEFAULT_DOWNLOAD_DIR, exist_ok=True)
    os.makedirs(DEFAULT_PLAYLIST_DIR, exist_ok=True)
    os.makedirs(METADATA_DIR, exist_ok=True)
    init_db()

    threading.Thread(target=icy_poll_worker, daemon=True).start()
    threading.Thread(target=_periodic_maintenance, daemon=True).start()
    threading.Thread(target=_daily_auto_backup, daemon=True).start()

    app = create_app()
    logger.info(f"NEOTOKYO FM starting on {HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=False, threaded=True)

if __name__ == '__main__':
    main()
