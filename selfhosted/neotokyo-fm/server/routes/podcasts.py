import os, re, logging, threading, time, uuid, html
from datetime import datetime, timezone
from flask import request, jsonify, Response
from . import podcasts_bp
from config import DEFAULT_DOWNLOAD_DIR, HTTP_SESSION, HAS_YTDLP
from models.db import (add_podcast, list_podcasts, get_podcast, delete_podcast,
                        update_podcast, add_podcast_episode, list_episodes,
                        get_episode, mark_episode_played, mark_episode_downloaded,
                        search_podcasts, get_podcast_feed_urls,
                        get_episode_progress, set_episode_progress, clear_episode_progress,
                        get_podcast_categories)
from utils.security import auth_required

try:
    import feedparser
except ImportError:
    feedparser = None

logger = logging.getLogger('batch_dl')

def _parse_pub_date(pub_date_str: str) -> str:
    if not pub_date_str:
        return ''
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(pub_date_str).strftime('%Y-%m-%d %H:%M:%S')
    except Exception:
        return pub_date_str[:50]

def _parse_duration(dur_str: str) -> int:
    if not dur_str:
        return 0
    if dur_str.isdigit():
        return int(dur_str)
    m = re.match(r'(?:(\d+):)?(\d+):(\d+)', dur_str)
    if m:
        h, m_, s = m.groups()
        return int(h or 0) * 3600 + int(m_) * 60 + int(s)
    return 0

def sync_feed(podcast_id: int) -> int:
    podcast = get_podcast(podcast_id)
    if not podcast:
        return 0
    try:
        resp = HTTP_SESSION.get(podcast['feed_url'], timeout=30)
        resp.raise_for_status()
        content = resp.content
    except Exception as e:
        update_podcast(podcast_id, error=str(e)[:500])
        return 0

    if feedparser is None:
        update_podcast(podcast_id, error='feedparser not installed')
        return 0

    feed = feedparser.parse(content)
    if feed.bozo and not feed.entries:
        update_podcast(podcast_id, error=feed.bozo_exception[:500] if hasattr(feed, 'bozo_exception') else 'Parse error')
        return 0

    feed_title = (feed.feed.get('title') or podcast['title'] or '')[:500]
    feed_desc = (feed.feed.get('subtitle') or feed.feed.get('description') or '')[:2000]
    feed_author = (feed.feed.get('author') or '')[:200]
    feed_image = ''
    if hasattr(feed.feed, 'image') and feed.feed.image:
        feed_image = (feed.feed.image.get('href') or '')[:500]
    feed_link = (feed.feed.get('link') or '')[:500]

    update_podcast(podcast_id, title=feed_title, description=feed_desc,
                   author=feed_author, image_url=feed_image, link=feed_link,
                   last_synced=datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'),
                   error='')

    count = 0
    for entry in feed.entries:
        guid = entry.get('id', entry.get('link', ''))
        if not guid:
            continue
        title = (entry.get('title') or '')[:500]
        desc = (entry.get('summary') or entry.get('description') or '')[:2000]
        pub_date = _parse_pub_date(entry.get('published', ''))
        duration = _parse_duration(entry.get('itunes_duration', entry.get('duration', '')))
        image = ''
        if hasattr(entry, 'image') and entry.image:
            image = (entry.image.get('href') or '')[:500]
        elif hasattr(entry, 'itunes_image') and entry.itunes_image:
            image = (entry.itunes_image.get('href') or '')[:500]
        link = (entry.get('link') or '')[:500]

        enclosure_url = ''
        enclosure_type = ''
        enclosure_length = 0
        if hasattr(entry, 'enclosures') and entry.enclosures:
            enc = entry.enclosures[0]
            enclosure_url = (enc.get('href') or '')[:1000]
            enclosure_type = (enc.get('type') or '')[:100]
            try:
                enclosure_length = int(enc.get('length', 0))
            except (ValueError, TypeError):
                enclosure_length = 0

        added = add_podcast_episode(podcast_id, guid, title, desc,
                                     enclosure_url, enclosure_type, enclosure_length,
                                     duration, pub_date, image, link)
        if added is not None:
            count += 1
    return count

# --- Auto-download worker ---

_download_queue = []

def _podcast_download_worker():
    while True:
        time.sleep(1)
        if not _download_queue:
            continue
        item = _download_queue.pop(0)
        episode_id, url, podcast_title, ep_title = item
        try:
            from workers.download import _download_direct
            safe_title = re.sub(r'[\\/*?:"<>|]', '_', f"{podcast_title}_{ep_title}")[:100]
            ext = os.path.splitext(url.split('?')[0])[1] or '.mp3'
            filename = f"{safe_title}{ext}"
            dest = os.path.join(DEFAULT_DOWNLOAD_DIR, filename)

            resp = HTTP_SESSION.get(url, stream=True, timeout=30)
            resp.raise_for_status()
            total = int(resp.headers.get('content-length', 0))
            downloaded = 0
            with open(dest, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
            mark_episode_downloaded(episode_id, filename)
            logger.info(f"Downloaded podcast episode: {filename}")
        except Exception as e:
            logger.warning(f"Podcast download failed for {ep_title}: {e}")

threading.Thread(target=_podcast_download_worker, daemon=True).start()

# --- Routes ---

@podcasts_bp.route('/podcasts', methods=['GET'])
@auth_required
def list_podcasts_handler():
    user_id = getattr(request, 'user_id', 0)
    category = request.args.get('category', '').strip()
    podcasts = list_podcasts(user_id, category)
    return jsonify(podcasts)

@podcasts_bp.route('/podcasts', methods=['POST'])
@auth_required
def subscribe_podcast():
    user_id = getattr(request, 'user_id', 0)
    data = request.get_json() or {}
    feed_url = data.get('feed_url', '').strip()
    if not feed_url:
        return jsonify({'error': 'feed_url required'}), 400
    if not feed_url.startswith('http://') and not feed_url.startswith('https://'):
        return jsonify({'error': 'Invalid URL'}), 400

    existing = list_podcasts(user_id)
    for p in existing:
        if p['feed_url'] == feed_url:
            return jsonify(p), 200

    podcast_id = add_podcast(feed_url, user_id=user_id)
    if podcast_id is None:
        return jsonify({'error': 'Already subscribed or invalid feed'}), 409

    threading.Thread(target=lambda: sync_feed(podcast_id), daemon=True).start()
    podcast = get_podcast(podcast_id)
    return jsonify(podcast), 201

@podcasts_bp.route('/podcasts/<int:podcast_id>', methods=['GET'])
@auth_required
def get_podcast_handler(podcast_id):
    podcast = get_podcast(podcast_id)
    if not podcast:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(podcast)

@podcasts_bp.route('/podcasts/<int:podcast_id>', methods=['DELETE'])
@auth_required
def unsubscribe_podcast(podcast_id):
    podcast = get_podcast(podcast_id)
    if not podcast:
        return jsonify({'error': 'Not found'}), 404
    delete_podcast(podcast_id)
    return jsonify({'ok': True})

@podcasts_bp.route('/podcasts/<int:podcast_id>/sync', methods=['POST'])
@auth_required
def sync_podcast(podcast_id):
    podcast = get_podcast(podcast_id)
    if not podcast:
        return jsonify({'error': 'Not found'}), 404
    threading.Thread(target=lambda: sync_feed(podcast_id), daemon=True).start()
    return jsonify({'ok': True})

@podcasts_bp.route('/podcasts/<int:podcast_id>/auto-download', methods=['PUT'])
@auth_required
def toggle_auto_download(podcast_id):
    podcast = get_podcast(podcast_id)
    if not podcast:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    enabled = 1 if data.get('enabled', False) else 0
    update_podcast(podcast_id, auto_download=enabled)
    return jsonify({'ok': True, 'auto_download': bool(enabled)})

@podcasts_bp.route('/podcasts/<int:podcast_id>/episodes', methods=['GET'])
@auth_required
def list_episodes_handler(podcast_id):
    podcast = get_podcast(podcast_id)
    if not podcast:
        return jsonify({'error': 'Not found'}), 404
    limit = min(int(request.args.get('limit', 100)), 200)
    offset = int(request.args.get('offset', 0))
    episodes = list_episodes(podcast_id, limit, offset)
    return jsonify({'episodes': episodes, 'count': len(episodes), 'total': podcast['episode_count']})

@podcasts_bp.route('/podcasts/episodes/<int:episode_id>/play', methods=['POST'])
@auth_required
def mark_played(episode_id):
    episode = get_episode(episode_id)
    if not episode:
        return jsonify({'error': 'Not found'}), 404
    mark_episode_played(episode_id)
    return jsonify({'ok': True})

@podcasts_bp.route('/podcasts/episodes/<int:episode_id>/download', methods=['POST'])
@auth_required
def download_episode(episode_id):
    episode = get_episode(episode_id)
    if not episode:
        return jsonify({'error': 'Not found'}), 404
    if episode['downloaded']:
        return jsonify({'ok': True, 'filename': episode['download_path']})
    podcast = get_podcast(episode['podcast_id'])
    if not podcast:
        return jsonify({'error': 'Podcast not found'}), 404
    if not episode['enclosure_url']:
        return jsonify({'error': 'No audio URL'}), 400
    _download_queue.append((
        episode_id, episode['enclosure_url'],
        podcast['title'] or f"podcast_{podcast['id']}",
        episode['title'] or f"episode_{episode_id}"
    ))
    return jsonify({'ok': True, 'queued': True})

@podcasts_bp.route('/podcasts/episodes/<int:episode_id>/progress', methods=['GET'])
@auth_required
def get_progress(episode_id):
    episode = get_episode(episode_id)
    if not episode:
        return jsonify({'error': 'Not found'}), 404
    progress = get_episode_progress(episode_id)
    if not progress:
        return jsonify({'position': 0, 'duration': 0})
    return jsonify({'position': progress['position'], 'duration': progress['duration'], 'updated_at': progress['updated_at']})

@podcasts_bp.route('/podcasts/episodes/<int:episode_id>/progress', methods=['PUT'])
@auth_required
def save_progress(episode_id):
    episode = get_episode(episode_id)
    if not episode:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    position = float(data.get('position', 0))
    duration = float(data.get('duration', 0))
    set_episode_progress(episode_id, position, duration)
    return jsonify({'ok': True})

@podcasts_bp.route('/podcasts/from-youtube', methods=['POST'])
@auth_required
def from_youtube():
    if not HAS_YTDLP:
        return jsonify({'error': 'yt-dlp not installed'}), 400
    user_id = getattr(request, 'user_id', 0)
    data = request.get_json() or {}
    youtube_url = data.get('youtube_url', '').strip()
    if not youtube_url:
        return jsonify({'error': 'youtube_url required'}), 400
    title = data.get('title', '').strip() or None
    try:
        import yt_dlp
        with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True, 'extract_flat': True, 'skip_download': True}) as ydl:
            info = ydl.extract_info(youtube_url, download=False)
        if info.get('_type') == 'playlist':
            playlist_title = title or info.get('title', 'YouTube Playlist')[:500]
            podcast_id = add_podcast(
                feed_url=youtube_url,
                title=playlist_title,
                description=(info.get('description') or '')[:2000],
                author=(info.get('uploader') or '')[:200],
                image_url=(info.get('thumbnail') or '')[:500],
                link=youtube_url[:500],
                category='youtube',
                user_id=user_id
            )
            if podcast_id is None:
                return jsonify({'error': 'Could not create podcast'}), 409
            count = 0
            for entry in info.get('entries', []):
                if not entry:
                    continue
                video_id = entry.get('id', '')
                if not video_id:
                    continue
                ep_title = (entry.get('title') or '')[:500]
                ep_link = f'https://www.youtube.com/watch?v={video_id}'
                duration = entry.get('duration', 0) or 0
                thumb = (entry.get('thumbnail') or '')[:500]
                added = add_podcast_episode(
                    podcast_id, ep_link, ep_title, '',
                    f'/api/yt-proxy/{video_id}', 'audio/webm', 0,
                    duration, (entry.get('upload_date') or '')[:50], thumb, ep_link
                )
                if added is not None:
                    count += 1
            podcast = get_podcast(podcast_id)
            return jsonify({'podcast': podcast, 'episodes_added': count}), 201
        else:
            video_id = info.get('id', '')
            if not video_id:
                return jsonify({'error': 'Could not extract video ID'}), 400
            video_url = f'https://www.youtube.com/watch?v={video_id}'
            podcast_title = title or info.get('title', 'YouTube Video')[:500]
            podcast_id = add_podcast(
                feed_url=video_url,
                title=podcast_title,
                description=(info.get('description') or '')[:2000],
                author=(info.get('uploader') or '')[:200],
                image_url=(info.get('thumbnail') or '')[:500],
                link=video_url[:500],
                category='youtube',
                user_id=user_id
            )
            if podcast_id is None:
                return jsonify({'error': 'Could not create podcast'}), 409
            duration = info.get('duration', 0) or 0
            add_podcast_episode(
                podcast_id, video_url, podcast_title, '',
                f'/api/yt-proxy/{video_id}', 'audio/webm', 0,
                duration, '', (info.get('thumbnail') or '')[:500], video_url
            )
            podcast = get_podcast(podcast_id)
            return jsonify({'podcast': podcast, 'episodes_added': 1}), 201
    except Exception as e:
        return jsonify({'error': str(e)[:200]}), 400

@podcasts_bp.route('/podcasts/categories', methods=['GET'])
@auth_required
def list_categories():
    categories = get_podcast_categories()
    return jsonify({'categories': categories})

@podcasts_bp.route('/podcasts/search', methods=['GET'])
@auth_required
def search_podcasts_handler():
    q = request.args.get('q', '').strip()
    if len(q) < 2:
        return jsonify({'results': [], 'count': 0})
    user_id = getattr(request, 'user_id', 0)
    results = search_podcasts(q, user_id)
    return jsonify({'results': results, 'count': len(results)})

@podcasts_bp.route('/podcasts/opml', methods=['GET'])
@auth_required
def export_opml():
    user_id = getattr(request, 'user_id', 0)
    podcasts = list_podcasts(user_id)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<opml version="2.0">',
        '  <head><title>NEOTOKYO FM Podcast Subscriptions</title></head>',
        '  <body>',
    ]
    for p in podcasts:
        title = html.escape(p['title'] or p['feed_url'])
        feed_url = html.escape(p['feed_url'])
        lines.append(f'    <outline type="rss" text="{title}" title="{title}" xmlUrl="{feed_url}" />')
    lines.append('  </body>')
    lines.append('</opml>')
    return Response('\n'.join(lines), mimetype='text/xml')

@podcasts_bp.route('/podcasts/opml', methods=['POST'])
@auth_required
def import_opml():
    user_id = getattr(request, 'user_id', 0)
    data = request.get_data(as_text=True)
    if not data:
        return jsonify({'error': 'No data'}), 400
    if feedparser is None:
        return jsonify({'error': 'feedparser not installed'}), 500
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 400
    urls = set()
    for outline in root.iter('outline'):
        url = outline.get('xmlUrl', '')
        if url:
            urls.add(url)
    added = 0
    for url in urls:
        existing = list_podcasts(user_id)
        if any(p['feed_url'] == url for p in existing):
            continue
        pid = add_podcast(url, user_id=user_id)
        if pid is not None:
            threading.Thread(target=lambda: sync_feed(pid), daemon=True).start()
            added += 1
    return jsonify({'added': added, 'total': len(urls)})

@podcasts_bp.route('/podcasts/sync-all', methods=['POST'])
@auth_required
def sync_all():
    user_id = getattr(request, 'user_id', 0)
    feeds = get_podcast_feed_urls()
    count = 0
    for pid, _ in feeds:
        podcast = get_podcast(pid)
        if podcast and (user_id == 0 or podcast['user_id'] == user_id):
            threading.Thread(target=lambda: sync_feed(pid), daemon=True).start()
            count += 1
    return jsonify({'syncing': count})

@podcasts_bp.route('/podcasts/auto-download/run', methods=['POST'])
@auth_required
def run_auto_download_now():
    from workers.podcast_scheduler import auto_download_new_episodes
    def _run():
        auto_download_new_episodes()
    threading.Thread(target=_run, daemon=True).start()
    return jsonify({'ok': True, 'started': True})
