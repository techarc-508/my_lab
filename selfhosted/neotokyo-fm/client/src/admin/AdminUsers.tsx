import { useState, useEffect } from 'react'
import { listUsers, createUserAPI, updateUser, deleteUser } from '../services/grabberAPI'
import { usePlayerStore } from '../stores/playerStore'
import type { UserRecord } from '../types/audio'
import { Users, UserPlus, Shield, User, X, Check, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const role = usePlayerStore(s => s.role)

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const data = await listUsers()
      setUsers(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users')
    }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await createUserAPI(newUsername, newPassword, newRole)
      setShowCreate(false)
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      await fetchUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user')
    }
  }

  const startEdit = (u: UserRecord) => {
    setEditingId(u.id)
    setEditRole(u.role)
    setEditEmail(u.email || '')
    setEditDisplayName(u.display_name || '')
    setEditActive(u.is_active !== 0)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleEdit = async (userId: number) => {
    setError('')
    try {
      await updateUser(userId, { role: editRole, email: editEmail, display_name: editDisplayName, is_active: editActive })
      setEditingId(null)
      await fetchUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    }
  }

  const handleToggleActive = async (u: UserRecord) => {
    setError('')
    try {
      await updateUser(u.id, { is_active: u.is_active === 0 })
      await fetchUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle user status')
    }
  }

  const handleDelete = async (userId: number) => {
    setError('')
    try {
      await deleteUser(userId)
      setDeleteConfirmId(null)
      await fetchUsers()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user')
    }
  }

  if (role !== 'admin') {
    return (
      <div className="p-6">
        <p className="text-content-tertiary text-sm">Admin access required.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-hot-pink" />
          <h1 className="text-lg font-display tracking-[1px] text-content-primary">Users</h1>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-gradient-to-r from-hot-pink to-purple text-white text-xs font-body tracking-[1px] uppercase hover:brightness-110 active:brightness-90 transition-all shadow-glow-pink-sm">
          <UserPlus size={14} /> New User
        </button>
      </div>

      {error && <p className="text-error text-xs bg-error/10 border border-error/20 rounded px-3 py-2">{error}</p>}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-surface-raised border border-border-default/50 rounded-lg p-4 space-y-3 max-w-md">
          <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Username" required
            className="w-full px-3 py-2 bg-surface-sunken border border-border-default rounded text-xs font-body text-content-primary focus:outline-none focus:border-hot-pink" />
          <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="Password (min 8 chars)" required
            className="w-full px-3 py-2 bg-surface-sunken border border-border-default rounded text-xs font-body text-content-primary focus:outline-none focus:border-hot-pink" />
          <select value={newRole} onChange={e => setNewRole(e.target.value as 'user' | 'admin')}
            className="w-full px-3 py-2 bg-surface-sunken border border-border-default rounded text-xs font-body text-content-primary focus:outline-none focus:border-hot-pink">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 py-2 rounded bg-gradient-to-r from-hot-pink to-purple text-white text-xs font-body tracking-[1px] uppercase hover:brightness-110 transition-all">
              Create
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded border border-border-default text-xs font-body text-content-tertiary hover:text-white transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-content-tertiary text-xs">Loading...</p>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="bg-surface-raised border border-border-default/50 rounded-lg px-4 py-3">
              {editingId === u.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {u.role === 'admin' ? <Shield size={16} className="text-hot-pink" /> : <User size={16} className="text-content-tertiary" />}
                    <p className="text-sm font-body text-content-primary">{u.username}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Role</label>
                      <select value={editRole} onChange={e => setEditRole(e.target.value)}
                        className="w-full mt-1 px-3 py-2 bg-surface-sunken border border-border-default rounded text-xs font-body text-content-primary focus:outline-none focus:border-hot-pink">
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Active</label>
                      <button onClick={() => setEditActive(!editActive)}
                        className="mt-1 flex items-center gap-2 text-xs text-content-primary">
                        {editActive ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} className="text-content-tertiary" />}
                        {editActive ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Email</label>
                    <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email"
                      className="w-full mt-1 px-3 py-2 bg-surface-sunken border border-border-default rounded text-xs font-body text-content-primary focus:outline-none focus:border-hot-pink" />
                  </div>
                  <div>
                    <label className="text-[10px] font-body text-content-tertiary uppercase tracking-[1px]">Display Name</label>
                    <input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} placeholder="Display name"
                      className="w-full mt-1 px-3 py-2 bg-surface-sunken border border-border-default rounded text-xs font-body text-content-primary focus:outline-none focus:border-hot-pink" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(u.id)} className="flex items-center gap-1 px-3 py-1.5 rounded bg-gradient-to-r from-hot-pink to-purple text-white text-[10px] font-body tracking-[1px] uppercase hover:brightness-110 transition-all">
                      <Check size={12} /> Save
                    </button>
                    <button onClick={cancelEdit} className="px-3 py-1.5 rounded border border-border-default text-[10px] font-body text-content-tertiary hover:text-white transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {u.role === 'admin' ? <Shield size={16} className="text-hot-pink" /> : <User size={16} className="text-content-tertiary" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-body text-content-primary">{u.username}</p>
                        <span className={`text-[10px] font-body px-1.5 py-0.5 rounded-full ${u.is_active === 0 ? 'bg-error/10 text-error' : u.role === 'admin' ? 'bg-hot-pink/10 text-hot-pink' : 'bg-content-tertiary/10 text-content-tertiary'}`}>
                          {u.is_active === 0 ? 'Inactive' : u.role}
                        </span>
                      </div>
                      <p className="text-[10px] font-body text-content-tertiary">
                        Role: {u.role} · Created: {u.created_at}
                        {u.email ? ` · Email: ${u.email}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleToggleActive(u)} title={u.is_active === 0 ? 'Activate' : 'Deactivate'}
                      className="text-content-tertiary hover:text-content-primary transition-colors">
                      {u.is_active === 0 ? <ToggleLeft size={16} /> : <ToggleRight size={16} className="text-green-400" />}
                    </button>
                    <button onClick={() => startEdit(u)} className="text-content-tertiary hover:text-content-primary transition-colors" title="Edit">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {deleteConfirmId === u.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(u.id)} className="text-error hover:brightness-110 transition-colors" title="Confirm delete">
                          <Trash2 size={14} />
                        </button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-content-tertiary hover:text-white transition-colors text-[10px]">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirmId(u.id)} className="text-content-tertiary hover:text-error transition-colors" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {users.length === 0 && <p className="text-content-tertiary text-xs text-center py-8">No users found</p>}
        </div>
      )}
    </div>
  )
}
