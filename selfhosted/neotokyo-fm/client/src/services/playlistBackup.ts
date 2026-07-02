import { API_BASE } from '../config'
import { getCsrfToken } from './grabberAPI'

export async function backupPlaylists(data: unknown, version: number, device = '') {
  try {
    await fetch(`${API_BASE}/api/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
      body: JSON.stringify({ data, version, device }),
      credentials: 'include',
    })
  } catch {}
}
