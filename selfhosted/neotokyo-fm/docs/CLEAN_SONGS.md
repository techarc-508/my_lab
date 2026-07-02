# NEOTOKYO FM — Songs Cleanup Reference

## Overview

Methods to clean, deduplicate, and fix metadata for existing audio files in the library.

---

## Method 1: Admin Scanner (UI)

The **Scanner** page (`/admin/scanner`) provides a visual interface for managing song metadata and covers.

### Scan New Files

1. Navigate to Scanner tab in the admin panel
2. Click **Scan New Files** — this runs `POST /api/backfill` on the server
3. The server scans all files in the download directory that don't have sidecar metadata (`.metadata/<basename>/info.json`)
4. For each file, it extracts tags from the embedded ID3/mutagen tags and writes sidecar files
5. A progress bar animates during scanning

### Fix Missing Covers

1. After scanning, files without covers show a **No cover** badge
2. Click **Fix All Covers (N)** to batch-process all coverless files
3. The overlay shows per-job progress:
   - **Searching** — queries source URL / iTunes / YouTube for album art
   - **Applying** — downloads and saves the cover to `.metadata/<basename>/cover.jpg`
   - **Done** — cover applied successfully with source badge
   - **Failed** — no source found or apply error (reason shown)
4. Alternatively, expand individual files and click **Find Cover** for per-file manual search
5. Candidates appear as clickable thumbnails — select one and click **Apply Selected**

### Edit Metadata Inline

1. Expand a file row in the Scanner
2. Edit **Title**, **Artist**, and **Album** fields
3. Click **Save** — updates both sidecar JSON (`info.json`) and ID3 tags

---

## Method 2: Direct Server Commands (SSH)

### Trigger a Backfill Scan

```bash
# Via curl (requires auth)
curl -X POST http://localhost:5050/api/backfill \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(curl -s http://localhost:5050/api/csrf-token | python3 -c 'import sys,json; print(json.load(sys.stdin)["csrf_token"])')" \
  -b /tmp/cookies.txt

# Or via the Flask shell
cd /mnt/data/projects/mini_radio/server
python3 -c "
from workers.metadata import scan_for_metadata
count = scan_for_metadata()
print(f'Scanned {count} files')
"
```

### Find Cover via YouTube / iTunes API

```bash
curl -X POST http://localhost:5050/api/find-cover \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $(curl -s http://localhost:5050/api/csrf-token | python3 -c 'import sys,json; print(json.load(sys.stdin)["csrf_token"])')" \
  -d '{"title": "Song Title", "artist": "Artist Name"}'
```

### Apply Cover Art

```bash
curl -X POST "http://localhost:5050/api/files/cover/track.mp3" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <token>" \
  -d '{"url": "https://example.com/cover.jpg"}'
```

---

## Method 3: Manual File Cleanup (Filesystem)

### Sidecar File Structure

```
server/downloads/
├── track.mp3
├── another_song.flac
└── .metadata/
    ├── track/
    │   ├── cover.jpg
    │   ├── lyrics.lrc
    │   └── info.json
    └── another_song/
        ├── cover.jpg
        ├── lyrics.lrc
        └── info.json
```

### Remove Orphaned Sidecars

To delete sidecar directories that no longer have a corresponding audio file:

```bash
cd /mnt/data/projects/mini_radio/server/downloads
for meta_dir in .metadata/*/; do
  basename=$(basename "$meta_dir")
  # Check if any audio file with this basename exists
  found=$(find . -maxdepth 1 -type f \( -name "$basename.mp3" -o -name "$basename.flac" -o -name "$basename.opus" -o -name "$basename.m4a" -o -name "$basename.wav" \) 2>/dev/null | head -1)
  if [ -z "$found" ]; then
    echo "Removing orphaned sidecar: $meta_dir"
    rm -rf "$meta_dir"
  fi
done
```

### Delete Covers for Specific Files

```bash
curl -X DELETE "http://localhost:5050/api/files/cover/track.mp3" \
  -H "X-CSRF-Token: <token>"
```

### Manual Cover Replacement

```bash
# Replace a cover manually via filesystem
cp /path/to/new-cover.jpg "/mnt/data/projects/mini_radio/server/downloads/.metadata/track/cover.jpg"
```

---

## Method 4: Deduplication

### Identify Duplicate Files (by size + checksum)

```bash
cd /mnt/data/projects/mini_radio/server/downloads

# Find files with identical sizes
find . -maxdepth 1 -type f -name "*.mp3" -exec md5sum {} \; | sort > /tmp/sums.txt
awk '{print $1}' /tmp/sums.txt | sort | uniq -d > /tmp/duplicates.txt

# List duplicate pairs
while read hash; do
  grep "^$hash" /tmp/sums.txt
  echo "---"
done < /tmp/duplicates.txt
```

### Remove Duplicates (Keep First)

```bash
while read hash; do
  files=($(grep "^$hash" /tmp/sums.txt | awk '{print $2}'))
  # Keep the first file, remove the rest
  for ((i=1; i<${#files[@]}; i++)); do
    echo "Removing duplicate: ${files[$i]}"
    # Remove file
    rm "${files[$i]}"
    # Remove corresponding sidecar
    basename=$(basename "${files[$i]}")
    base_noext="${basename%.*}"
    rm -rf ".metadata/$base_noext"
  done
done < /tmp/duplicates.txt
```

### Find Duplicates by Title (Fuzzy Match)

The admin Scanner shows all files with their extracted titles. Manual review is recommended for title-based deduplication. A future upgrade could add auto-dedup via Levenshtein distance on filenames.

---

## Method 5: Radio Recording Cleanup

Radio recordings are saved to the download directory with the pattern `radio_recording_<timestamp>.mp3`. To list and clean them:

```bash
# List all radio recordings
ls -lh /mnt/data/projects/mini_radio/server/downloads/radio_recording_*.mp3

# Remove recordings older than 30 days
find /mnt/data/projects/mini_radio/server/downloads/ \
  -name "radio_recording_*.mp3" -mtime +30 -delete
```

---

## Automatic Maintenance

The server runs these scheduled tasks automatically:

| Task | Interval | Description |
|------|----------|-------------|
| Metadata scan | Manual (Scanner UI) | Scan for missing sidecars |
| SQLite WAL checkpoint | Every 1 hour | Compact database |
| Radio stations backup | Daily at 9PM | Backup radio_stations.json |
| Lyrics circuit breaker | Resets on restart | Disables LRCLIB after 3 consecutive failures |

To add a periodic metadata scan, add a cron job:

```bash
# Daily scan at 3AM
0 3 * * * cd /mnt/data/projects/mini_radio/server && python3 -c "from workers.metadata import scan_for_metadata; scan_for_metadata()" >> /var/log/neotokyo-scan.log 2>&1
```
