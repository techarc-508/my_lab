import { useState, useEffect, useRef } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { getProfile, updateProfile, uploadAvatar, deleteAvatar, getSessions, revokeSession, deleteAccount, changePassword } from '../services/grabberAPI'
import { showToast } from '../components/ui/StreamToast'
import AvatarCropper from '../components/ui/AvatarCropper'
import type { UserProfile, Session } from '../types/audio'
import { User, Mail, Lock, ShieldAlert, Smartphone, Laptop, LogOut, Save, CheckCircle, AlertTriangle, Camera, Trash2 } from 'lucide-react'

const AVATAR_EMOJIS = ['🗼', '📻', '🌴', '🌅', '🎧', '👾', '🕶️', '📼']

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [cropperOpen, setCropperOpen] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [emojiAvatar, setEmojiAvatar] = useState('🗼')
  const fileRef = useRef<HTMLInputElement>(null)
  const setUser = usePlayerStore(s => s.setUser)

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const data = await getProfile()
      setProfile(data)
      setDisplayName(data.display_name || '')
      setEmail(data.email || '')
      setSessions(data.sessions || [])
    } catch {
      showToast('Failed to load profile', 'error')
    }
    setLoading(false)
  }

  useEffect(() => { fetchProfile() }, [])

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateProfile({ display_name: displayName, email })
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
      fetchProfile()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update profile', 'error')
    }
    setSaving(false)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 12) {
      setPasswordError('New password must be at least 12 characters long!')
      setPasswordSuccess(false)
      return
    }
    setPasswordError('')
    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSuccess(true)
      setTimeout(() => setPasswordSuccess(false), 3000)
      setCurrentPassword('')
      setNewPassword('')
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : 'Failed to change password')
      setPasswordSuccess(false)
    }
    setSaving(false)
  }

  const handleAvatarFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file', 'error')
      return
    }
    setCropFile(file)
    setCropperOpen(true)
  }

  const handleCroppedUpload = async (blob: Blob) => {
    setCropperOpen(false)
    setUploading(true)
    try {
      const file = new File([blob], 'avatar.png', { type: 'image/png' })
      await uploadAvatar(file)
      setAvatarPreview(null)
      showToast('Avatar uploaded', 'success')
      fetchProfile()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to upload avatar', 'error')
    }
    setUploading(false)
    setCropFile(null)
  }

  const handleCropperCancel = () => {
    setCropperOpen(false)
    setCropFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDeleteAvatar = async () => {
    try {
      await deleteAvatar()
      showToast('Avatar removed', 'success')
      fetchProfile()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to remove avatar', 'error')
    }
  }

  const handleRevokeSession = async (sessionId: number) => {
    try {
      await revokeSession(sessionId)
      showToast('Session revoked', 'success')
      fetchProfile()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to revoke session', 'error')
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return
    try {
      await deleteAccount()
      showToast('Account deleted', 'success')
      setUser('', '')
      localStorage.removeItem('neotokyo-auth-token')
      window.location.href = '/'
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete account', 'error')
    }
  }

  const avatarUrl = profile?.avatar_path ? `/api/profile/avatar/file` : null

  if (loading) {
    return <div className="p-6"><p className="text-content-tertiary text-xs">Loading...</p></div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto flex flex-col gap-6 pb-32" id="settings-panel-view">
      {/* HEADER */}
      <div className="text-left pb-3 border-b border-white/10">
        <span className="px-2 py-0.5 rounded bg-neon-cyan/20 text-neon-cyan font-mono text-[9px] font-black uppercase tracking-wider">
          Node Configuration Center
        </span>
        <h2 className="font-sans text-2xl font-black text-white uppercase tracking-wide mt-1">
          User Settings & Security
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: PROFILE + SESSIONS */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* PROFILE FORM CARD */}
          <div className="rounded-2xl p-6 bg-[#110e20]/80 border border-white/5 shadow-xl text-left">
            <h3 className="font-sans text-sm font-bold text-white uppercase tracking-wider mb-5 flex items-center gap-2">
              <User className="w-4 h-4 text-neon-pink" />
              <span>Profile Information</span>
            </h3>

            <form onSubmit={handleUpdateProfile} className="flex flex-col gap-5">
              {/* Avatar section */}
              <div className="flex items-center gap-5 pb-2">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-black/50 border-2 border-neon-pink flex items-center justify-center text-5xl select-none shadow-[0_0_15px_rgba(255,0,127,0.25)] overflow-hidden">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      emojiAvatar
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 p-2 bg-neon-pink rounded-full text-white border border-white/10 hover:scale-105 transition-transform"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-gray-200">{displayName || profile?.username}</span>
                  <span className="font-mono text-[10px] text-neon-cyan uppercase font-bold">{profile?.role}</span>
                  <p className="text-[10px] text-gray-500">Avatar used inside Shinjuku chat and broadcasting nodes.</p>
                  <div className="flex gap-2 mt-1">
                    <button type="button" onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                      className="text-[10px] text-neon-pink hover:underline">
                      {showAvatarPicker ? 'Close' : 'Choose Emoji'}
                    </button>
                    {profile?.avatar_path && (
                      <button type="button" onClick={handleDeleteAvatar} className="text-[10px] text-red-400 hover:underline">
                        Remove Photo
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFileSelect(f) }} />

              {/* Emoji avatar grid */}
              {showAvatarPicker && (
                <div className="p-3 bg-black/40 rounded-xl border border-white/5 grid grid-cols-4 sm:grid-cols-8 gap-2 animate-slide-up">
                  {AVATAR_EMOJIS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => { setEmojiAvatar(av); setShowAvatarPicker(false) }}
                      className={`text-3xl p-2 rounded-lg hover:bg-white/10 transition-colors ${emojiAvatar === av ? 'bg-neon-pink/20 border border-neon-pink/40' : ''}`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              )}

              {/* Edit display name and email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[9px] text-zinc-400 uppercase font-bold">Display Name</label>
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required
                    className="bg-black/40 border border-gray-400/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-neon-pink" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-mono text-[9px] text-zinc-400 uppercase font-bold">Email Address</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="bg-black/40 border border-gray-400/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-neon-pink" />
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 border-t border-white/5 pt-4">
                <div className="flex items-center gap-1.5 min-h-[24px]">
                  {profileSuccess && (
                    <span className="text-xs text-green-400 font-mono flex items-center gap-1 font-bold animate-slide-up">
                      <CheckCircle className="w-4 h-4" /> Profile Updated!
                    </span>
                  )}
                </div>
                <button type="submit" disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-neon-pink hover:bg-neon-pink/90 text-white font-mono text-xs font-bold uppercase border border-neon-pink/20 shadow-[0_4px_12px_rgba(255,0,127,0.25)] flex items-center gap-2 transition-all disabled:opacity-50">
                  <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* ACTIVE SESSIONS CARD */}
          <div className="rounded-2xl p-6 bg-[#110e20]/80 border border-white/5 shadow-xl text-left">
            <h3 className="font-sans text-sm font-bold text-white uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <Laptop className="w-4 h-4 text-neon-cyan" />
              <span>Active Terminal Sessions</span>
            </h3>
            <p className="text-[10px] text-gray-500 mb-5">
              These are the devices currently authenticated to your FM transmitter core. Revoke sessions to force logout.
            </p>

            <div className="flex flex-col gap-3">
              {sessions.length > 0 ? (
                sessions.map((sess) => (
                  <div key={sess.id} className="p-3 bg-black/20 rounded-xl border border-white/5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-black/40 text-neon-cyan">
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-white">Session #{sess.id}</span>
                        <span className="font-mono text-[9px] text-zinc-500 mt-0.5">
                          IP: {sess.ip || 'Unknown'} • Created: {sess.created} • Expires: {sess.expires}
                        </span>
                      </div>
                    </div>
                    <button type="button" onClick={() => handleRevokeSession(sess.id)}
                      className="px-3 py-1.5 bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/5 hover:border-red-500/20 text-[10px] text-zinc-400 font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5">
                      <LogOut className="w-3 h-3" /> Revoke
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 font-mono text-[11px] text-gray-600">
                  NO ACTIVE OTHER TERMINALS DETECTED
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PASSWORD + DANGER */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* PASSWORD RESET CARD */}
          <div className="rounded-2xl p-6 bg-[#110e20]/80 border border-white/5 shadow-xl text-left">
            <h3 className="font-sans text-sm font-bold text-white uppercase tracking-wider mb-5 flex items-center gap-2">
              <Lock className="w-4 h-4 text-neon-purple" />
              <span>Change Gateway Password</span>
            </h3>

            <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[9px] text-zinc-400 uppercase font-bold">Current Password</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required
                  placeholder="••••••••••••"
                  className="bg-black/40 border border-gray-400/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-neon-purple" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-mono text-[9px] text-zinc-400 uppercase font-bold">New Secure Password</label>
                <input type="password" value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); if (e.target.value.length >= 12) setPasswordError('') }}
                  required placeholder="Min 12 characters"
                  className="bg-black/40 border border-gray-400/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-neon-purple" />
                {passwordError && (
                  <span className="text-[10px] text-red-400 font-mono font-semibold flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-3 h-3" /> {passwordError}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5 mt-2">
                {passwordSuccess && (
                  <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-mono font-bold flex items-center gap-1.5 animate-slide-up">
                    <CheckCircle className="w-3.5 h-3.5" /> PASSWORD UPDATED SUCCESSFULLY
                  </div>
                )}
                <button type="submit" disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-neon-purple hover:bg-neon-purple/90 text-white font-mono text-xs font-bold uppercase border border-neon-purple/20 transition-colors disabled:opacity-50">
                  {saving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>

          {/* DANGER ZONE CARD */}
          <div className="rounded-2xl p-6 bg-[#1a0c10]/80 border border-red-500/10 shadow-xl text-left">
            <h3 className="font-sans text-sm font-bold text-red-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <span>Danger Zone</span>
            </h3>
            <p className="text-[10px] text-gray-500 mb-4">
              Scrub all personal mixtape databases, deleted songs history, and customized presets from Tokyo-FM memory chips. This action cannot be undone.
            </p>

            <div className="flex flex-col gap-3">
              {!confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-950/20 hover:bg-red-600 border border-red-500/30 hover:border-red-500 hover:text-white text-red-400 font-mono text-xs font-bold uppercase transition-all flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" /> Delete Broadcast Account
                </button>
              ) : (
                <div className="flex flex-col gap-3 animate-slide-up">
                  <div className="p-3 bg-red-950/10 border border-red-500/20 rounded-xl flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-[10px] text-red-300 leading-relaxed font-semibold">
                      To confirm account erasure, please type <span className="font-mono text-red-500 bg-black/40 px-1 py-0.5 rounded font-bold">DELETE</span> in the box below.
                    </span>
                  </div>

                  <input type="text" value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
                    placeholder="Type DELETE"
                    className="bg-black/60 border border-red-500/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red-500 placeholder-zinc-700" />

                  <div className="flex gap-2 justify-end mt-1">
                    <button type="button" onClick={() => { setConfirmDelete(false); setDeleteInput('') }}
                      className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-mono text-[11px] uppercase transition-colors">
                      Cancel
                    </button>
                    <button type="button" onClick={handleDeleteAccount} disabled={deleteInput !== 'DELETE'}
                      className={`px-4 py-2 rounded-lg font-mono text-[11px] uppercase transition-colors ${
                        deleteInput === 'DELETE'
                          ? 'bg-red-600 hover:bg-red-500 text-white'
                          : 'bg-red-950/30 text-red-500/40 cursor-not-allowed'
                      }`}>
                      Scrub Data
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AvatarCropper open={cropperOpen} file={cropFile} onCrop={handleCroppedUpload} onCancel={handleCropperCancel} />
    </div>
  )
}
