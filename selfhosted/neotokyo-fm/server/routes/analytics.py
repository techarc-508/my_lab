from flask import request, jsonify
from . import analytics_bp
from utils.security import auth_required

@analytics_bp.route('/analytics/overview')
@auth_required
def overview():
    from models.db import get_db
    conn = get_db()
    try:
        top_tracks = conn.execute(
            'SELECT title, artist, COUNT(*) as play_count FROM play_log GROUP BY title ORDER BY play_count DESC LIMIT 10'
        ).fetchall()
        top_artists = conn.execute(
            'SELECT artist, COUNT(*) as play_count FROM play_log WHERE artist != "" GROUP BY artist ORDER BY play_count DESC LIMIT 10'
        ).fetchall()
        recent_count = conn.execute(
            "SELECT COUNT(*) as c FROM play_log WHERE played_at > datetime('now', '-24 hours')"
        ).fetchone()
        total_plays = conn.execute('SELECT COUNT(*) as c FROM play_log').fetchone()
        return jsonify({
            'top_tracks': [dict(r) for r in top_tracks],
            'top_artists': [dict(r) for r in top_artists],
            'plays_24h': dict(recent_count)['c'] if recent_count else 0,
            'total_plays': dict(total_plays)['c'] if total_plays else 0,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
