export interface TrackMeta {
  name: string
  size: number
  modified: number
}

export interface FileMeta extends TrackMeta {
  title?: string
  artist?: string | null
  album?: string | null
  album_art?: string | null
  has_cover: boolean
  has_lyrics: boolean
  genre?: string | null
  date?: string | null
}

export interface RadioStation {
  id: string
  name: string
  url: string
  genre: string
}

export interface NowPlaying {
  title: string | null
  artist: string | null
  raw: string | null
  cached_at?: number
}

export interface PlaylistItem {
  title: string
  artist?: string
  url: string
  albumArt?: string
  source?: string
  duration?: number
}

export interface Download {
  download_id: string
  url: string
  filename: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'processing'
  added: number
  progress: number
  title?: string
  uploader?: string
  filepath?: string
  error?: string | null
  speed?: number
  eta?: number
  total_bytes?: number
  downloaded_bytes?: number
}

export interface HealthResponse {
  status: string
  timestamp: string
  ffmpeg: string | null
  lrclib: boolean
  python: string
  download_dir: string
}

export interface ServerSettings {
  download_dir: string
  playlist_dir: string
  metadata_dir: string
  output_dir: string
  ytdlp_available: boolean
}

export interface BatchRecord {
  id: string
  title: string
  url: string
  status: string
  created_at: string
}

export interface Playlist {
  name: string
  tracks: PlaylistItem[]
  created: number
}

export interface YTSearchResult {
  url: string
  title: string
  uploader: string
  duration: number
  thumbnail: string
}

export interface SystemInfo {
  uptime: string
  uptime_secs: number
  disk_total: number
  disk_used: number
  disk_free: number
  active_downloads: number
  cpu_count: number | null
  memory_total: number | null
  ffmpeg: string | null
}

export interface Webhook {
  url: string
  events?: string[]
  enabled?: boolean
}

export interface BrowseResult {
  path: string
  dirs: string[]
}

export interface BackupRecord {
  id: number
  version: number
  device: string
  created: string
}

export interface AlbumArtResult {
  title: string
  artist: string
  album: string
  artwork: string
  genre: string
  release_date: string
}

export interface AuthResponse {
  auth: boolean
  username?: string
  role?: string
  token?: string
}

export interface UserRecord {
  id: number
  username: string
  role: string
  created_at: string
  email?: string
  display_name?: string
  avatar_path?: string
  is_active?: number
}

export interface UserProfile {
  id: number
  username: string
  role: string
  email: string
  email_verified: number
  display_name: string
  avatar_path: string
  created_at: string
  is_active: number
  sessions: Session[]
}

export interface Session {
  id: number
  created: string
  expires: string
  ip: string
}

export interface UpdateInfo {
  current: string
  latest: string
  update_available: boolean
  release_notes: string
}

export interface IngestionEvent {
  id: number
  filename: string
  status: string
  source: string
  title: string
  artist: string
  error: string
  created: string
}

export interface Podcast {
  id: number
  feed_url: string
  title: string
  description: string
  author: string
  image_url: string
  link: string
  category: string
  auto_download: number
  last_synced: string
  error: string
  created: string
  user_id: number
  unplayed: number
  episode_count: number
}

export interface PodcastProgress {
  id: number
  episode_id: number
  position: number
  duration: number
  updated_at: string
}

export interface PodcastCategory {
  category: string
  count: number
}

export interface PodcastEpisode {
  id: number
  podcast_id: number
  guid: string
  title: string
  description: string
  enclosure_url: string
  enclosure_type: string
  enclosure_length: number
  duration: number
  pub_date: string
  image_url: string
  link: string
  downloaded: number
  download_path: string
  played: number
  played_at: string
  created: string
  progress?: PodcastProgress
}
