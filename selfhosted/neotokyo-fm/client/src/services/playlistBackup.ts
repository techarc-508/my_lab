import { API_BASE } from '../config'

export async function backupPlaylists(data: unknown, version: number, device = '') {
  try {
    const token = (() => { try { return localStorage.getItem('neotokyo-auth-token') || '' } catch { return '' } })()
    await fetch(`${API_BASE}/api/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
      body: JSON.stringify({ data, version, device }),
    })
  } catch {}
}
