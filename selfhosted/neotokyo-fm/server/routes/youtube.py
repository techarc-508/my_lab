import re, requests, logging
from flask import request, jsonify, Response
from . import youtube_bp
from config import HAS_YTDLP, HTTP_SESSION
from utils.file_utils import extract_filename_from_url, is_streaming_url
from utils.security import auth_required
from models.cache import LRUCache
import yt_dlp

logger = logging.getLogger('batch_dl')
search_cache = LRUCache(maxsize=64, ttl=300)

def search_youtube_all(query: str, max_total=50):
    cached = search_cache.get(query)
    if cached is not None:
        return cached
    with yt_dlp.YoutubeDL({
        'quiet': True, 'no_warnings': True, 'extract_flat': True,
        'skip_download': True, 'no-playlist': True,
    }) as ydl:
        info = ydl.extract_info(f'ytsearch{max_total}:{query}', download=False)
        entries = info.get('entries', []) if info else []
        results = []
        for e in entries:
            if e:
                results.append({
                    'url': e.get('url') or e.get('webpage_url', ''),
                    'title': e.get('title', 'Unknown'),
                    'uploader': e.get('uploader', e.get('channel', '')),
                    'duration': e.get('duration', 0),
                    'thumbnail': e.get('thumbnail', ''),
                })
        search_cache.set(query, results)
        return results

@youtube_bp.route('/yt-search', methods=['POST'])
@auth_required
def yt_search():
    if not HAS_YTDLP: return jsonify({'error': 'yt-dlp not installed'}), 400
    data = request.get_json() or {}
    query = (data.get('query') or '').strip()
    try: page = int(data.get('page', 1))
    except (TypeError, ValueError): page = 1
    try: per_page = min(int(data.get('per_page', 10)), 50)
    except (TypeError, ValueError): per_page = 10
    if not query: return jsonify({'error': 'No query'}), 400
    try:
        all_results = search_youtube_all(query, max_total=50)
        total = len(all_results)
        start = (page - 1) * per_page
        end = start + per_page
        page_results = all_results[start:end]
        return jsonify({'results': page_results, 'count': len(page_results), 'total': total, 'has_more': end < total})
    except Exception as e:
        return jsonify({'error': str(e)[:200]}), 400

@youtube_bp.route('/yt-proxy/<video_id>')
def yt_proxy(video_id):
    if not HAS_YTDLP:
        return jsonify({'error': 'yt-dlp not available'}), 503
    try:
        with yt_dlp.YoutubeDL({'format': 'bestaudio/best', 'quiet': True, 'no_warnings': True}) as ydl:
            info = ydl.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)
            url = info.get('url', '')
            if not url:
                return jsonify({'error': 'Could not extract audio URL'}), 500
            duration = info.get('duration', 0)
            resp = requests.get(url, stream=True, timeout=30)
            resp.raise_for_status()
            ctype = resp.headers.get('Content-Type', 'audio/webm')
            def generate():
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        yield chunk
            return Response(generate(), content_type=ctype, headers={
                'X-YT-Duration': str(duration),
                'X-YT-Title': info.get('title', ''),
                'Accept-Ranges': 'bytes',
            })
    except Exception as e:
        return jsonify({'error': str(e)[:200]}), 500

@youtube_bp.route('/expand-playlist', methods=['POST'])
@auth_required
def expand_playlist():
    data = request.get_json()
    url = data.get('url', '').strip()
    if not url or not HAS_YTDLP: return jsonify({'error': 'Invalid URL or no yt-dlp'}), 400
    try:
        with yt_dlp.YoutubeDL({'quiet':True,'no_warnings':True,'extract_flat':True,'skip_download':True}) as ydl:
            info = ydl.extract_info(url, download=False)
            if info.get('_type') == 'playlist':
                entries = info.get('entries', [])
                files = [{'url': e['url'] if 'url' in e else e.get('webpage_url',url),
                          'filename': extract_filename_from_url(e.get('title', e.get('url', 'track'))),
                          'title': e.get('title','')} for e in entries if e]
                return jsonify({'files': files, 'count': len(files), 'playlist': info.get('title','Playlist')})
            title = info.get('title', '')
            fallback = title if title else extract_filename_from_url(url)
            return jsonify({'files': [{'url': url, 'filename': fallback, 'title': title}], 'count': 1})
    except Exception as e:
        return jsonify({'error': str(e)[:100]}), 400

@youtube_bp.route('/preview', methods=['POST'])
@auth_required
def preview_downloads():
    data = request.get_json()
    files = data.get('files', [])
    if not files: return jsonify({'error': 'No files'}), 400
    results = []
    for f in files:
        url = f['url']
        info = {'url': url, 'filename': f.get('filename',''), 'streaming': is_streaming_url(url)}
        if HAS_YTDLP:
            from workers.download import preview_url_ytdlp
            meta = preview_url_ytdlp(url)
            if meta:
                info['title'] = meta.get('title', info['filename'])
                info['duration'] = meta.get('duration', 0)
                info['filesize'] = meta.get('filesize')
                info['uploader'] = meta.get('uploader', '')
                info['thumbnail'] = meta.get('thumbnail', '')
                info['streaming'] = meta.get('is_streaming', info['streaming'])
                info['extractor'] = meta.get('extractor', '')
            else: info['title'] = info['filename']
        else: info['title'] = info['filename']
        results.append(info)
    total_size = sum(r.get('filesize', 0) or 0 for r in results)
    return jsonify({'files': results, 'count': len(results), 'total_size': total_size})
