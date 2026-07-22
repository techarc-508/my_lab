import logging, re, os, time, threading

logger = logging.getLogger('batch_dl')

def auto_download_new_episodes():
    from models.db import list_podcasts, get_podcast, list_episodes, get_episode
    from routes.podcasts import sync_feed, _download_queue

    podcasts = list_podcasts()
    auto_podcasts = [p for p in podcasts if p.get('auto_download')]
    if not auto_podcasts:
        logger.info("Podcast auto-download: no podcasts with auto_download enabled")
        return 0

    downloaded_count = 0
    processed = 0
    for podcast in auto_podcasts[:3]:
        pid = podcast['id']
        try:
            sync_feed(pid)
            time.sleep(2)
        except Exception as e:
            logger.warning(f"Auto-download sync failed for podcast {pid}: {e}")
            continue

        processed += 1
        episodes = list_episodes(pid, limit=100)
        for ep in episodes:
            if ep['downloaded'] or not ep['enclosure_url']:
                continue
            _download_queue.append((
                ep['id'], ep['enclosure_url'],
                podcast['title'] or f"podcast_{pid}",
                ep['title'] or f"episode_{ep['id']}"
            ))
            downloaded_count += 1
            logger.info(f"Auto-download queued: {ep['title']} from {podcast['title']}")

    logger.info(f"Auto-download cycle complete: {downloaded_count} episodes queued from {processed} podcasts")
    return downloaded_count


def refresh_all_feeds():
    from models.db import get_podcast_feed_urls
    from routes.podcasts import sync_feed

    feeds = get_podcast_feed_urls()
    if not feeds:
        return 0

    synced = 0
    for pid, feed_url in feeds[:5]:
        try:
            sync_feed(pid)
            synced += 1
            time.sleep(1)
        except Exception as e:
            logger.warning(f"Feed refresh failed for podcast {pid}: {e}")

    logger.info(f"Feed refresh cycle complete: {synced}/{min(len(feeds), 5)} feeds synced")
    return synced


def run_auto_download():
    logger.info("Podcast auto-download scheduler started")
    while True:
        try:
            auto_download_new_episodes()
        except Exception as e:
            logger.warning(f"Auto-download cycle error: {e}")
        try:
            refresh_all_feeds()
        except Exception as e:
            logger.warning(f"Feed refresh in auto-download cycle error: {e}")
        time.sleep(1800)


def run_feed_refresh():
    logger.info("Podcast feed refresh scheduler started")
    while True:
        try:
            refresh_all_feeds()
        except Exception as e:
            logger.warning(f"Feed refresh cycle error: {e}")
        time.sleep(3600)
