/**
 * Fortuna Engine — Workspace Panel
 * 
 * Full collaboration hub: create/join workspaces, manage members,
 * share resources, pool API keys, view activity.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Users, Plus, Settings, Copy, Link2, Shield, Key,
  FileText, Trash2, LogOut, Crown, Eye, UserPlus,
  ChevronRight, Check, RefreshCw, Activity, X, User, LogIn
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  listWorkspaces, createWorkspace, getWorkspace, switchWorkspace,
  listMembers, changeMemberRole, removeMember, leaveWorkspace,
  createInvite, joinWorkspace,
  listResources, createResource, deleteResource,
  listAIKeys, addAIKey, deleteAIKey,
  getActivity,
  getLocalActiveWorkspace, setLocalActiveWorkspace,
  type Workspace, type WorkspaceMember, type SharedResource, type SharedAIKey,
  type ActivityEntry, type WorkspacePermissions,
} from '../engine/workspace-api'

// ─── Styles ──────────────────────────────────────────────────────────

const card = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 12 }
const pill = (color: string) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}33` })
const btn = { padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border-subtle)', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 } as React.CSSProperties
const btnPrimary = { ...btn, background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', color: '#0a0e1a', fontWeight: 600 } as React.CSSProperties
const input = { width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' as const }
const roleColor: Record<string, string> = { owner: '#f59e0b', admin: '#8b5cf6', member: '#3b82f6', viewer: '#6b7280' }
const roleIcon = (role: string) => role === 'owner' ? <Crown size={10} /> : role === 'admin' ? <Shield size={10} /> : role === 'viewer' ? <Eye size={10} /> : <User size={10} />

// ─── Main Panel ──────────────────────────────────────────────────────

type Tab = 'workspaces' | 'members' | 'resources' | 'keys' | 'activity'

export function WorkspacePanel() {
  const { isLoggedIn, isOfflineMode, connectAccount } = useAuth()

  // Gate: require authentication for collaboration
  if (!isLoggedIn) {
    return (
      <div className="view-enter" style={{ maxWidth: 800 }}>
        <h1 className="section-title">Collaboration</h1>
        <p className="section-subtitle" style={{ marginBottom: 24 }}>
          Create or join a workspace to collaborate with others
        </p>
        <div style={{ ...{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 12 }, textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            Account Required
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
            Collaboration features require a Fortuna account to sync workspaces,
            share data, and manage team members.
          </div>
          <button
            onClick={connectAccount}
            style={{
              padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              color: '#0a0e1a',
            }}
          >
            Sign In or Create Account
          </button>
          {isOfflineMode && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
              You're currently in offline mode. Your local data will be preserved.
            </div>
          )}
        </div>
      </div>
    )
  }

  const [tab, setTab] = useState<Tab>('workspaces')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWs, setActiveWs] = useState<Workspace | null>(null)
  const [permissions, setPermissions] = useState<WorkspacePermissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listWorkspaces()
      setWorkspaces(data.workspaces || [])
      
      // Restore active workspace
      const local = getLocalActiveWorkspace()
      if (data.active_workspace_id) {
        const active = (data.workspaces || []).find(w => w.id === data.active_workspace_id)
        if (active) {
          setActiveWs(active)
          setLocalActiveWorkspace({ id: active.id, name: active.name, role: active.role })
          // Fetch permissions
          const detail = await getWorkspace(active.id)
          setPermissions(detail.permissions)
        }
      } else if (local) {
        const active = (data.workspaces || []).find(w => w.id === local.id)
        if (active) {
          setActiveWs(active)
          const detail = await getWorkspace(active.id)
          setPermissions(detail.permissions)
        }
      }
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const handleSwitch = async (ws: Workspace | null) => {
    try {
      await switchWorkspace(ws?.id ?? null)
      setActiveWs(ws)
      if (ws) {
        setLocalActiveWorkspace({ id: ws.id, name: ws.name, role: ws.role })
        const detail = await getWorkspace(ws.id)
        setPermissions(detail.permissions)
      } else {
        setLocalActiveWorkspace(null)
        setPermissions(null)
      }
      // Dispatch event so useFortuna can reload state
      window.dispatchEvent(new CustomEvent('fortuna:workspace-changed', { detail: ws }))
    } catch (e: any) { setError(e.message) }
  }

  const tabs: { key: Tab; label: string; icon: JSX.Element; need?: keyof WorkspacePermissions }[] = [
    { key: 'workspaces', label: 'Workspaces', icon: <Users size={12} /> },
    { key: 'members', label: 'Members', icon: <UserPlus size={12} /> },
    { key: 'resources', label: 'Resources', icon: <FileText size={12} /> },
    { key: 'keys', label: 'AI Keys', icon: <Key size={12} /> },
    { key: 'activity', label: 'Activity', icon: <Activity size={12} /> },
  ]

  return (
    <div className="view-enter" style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 className="section-title">Collaboration</h1>
        {activeWs && (
          <span style={pill(roleColor[activeWs.role] || '#6b7280')}>
            {roleIcon(activeWs.role)} {activeWs.name}
          </span>
        )}
      </div>
      <p className="section-subtitle" style={{ marginBottom: 16 }}>
        {activeWs ? `Working in shared workspace · ${activeWs.member_count} member${activeWs.member_count !== 1 ? 's' : ''}` : 'Create or join a workspace to collaborate with others'}
      </p>

      {error && <div style={{ ...card, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', color: '#fca5a5', fontSize: 12 }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            disabled={t.key !== 'workspaces' && !activeWs}
            style={{
              ...btn,
              ...(tab === t.key ? { background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' } : {}),
              opacity: t.key !== 'workspaces' && !activeWs ? 0.4 : 1,
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading...
        </div>
      ) : (
        <>
          {tab === 'workspaces' && <WorkspacesTab workspaces={workspaces} activeWs={activeWs} onSwitch={handleSwitch} onRefresh={refresh} setError={setError} />}
          {tab === 'members' && activeWs && <MembersTab ws={activeWs} permissions={permissions} setError={setError} />}
          {tab === 'resources' && activeWs && <ResourcesTab ws={activeWs} permissions={permissions} setError={setError} />}
          {tab === 'keys' && activeWs && <KeysTab ws={activeWs} permissions={permissions} setError={setError} />}
          {tab === 'activity' && activeWs && <ActivityTab ws={activeWs} />}
        </>
      )}
    </div>
  )
}

// ─── Workspaces Tab ──────────────────────────────────────────────────

function WorkspacesTab({ workspaces, activeWs, onSwitch, onRefresh, setError }: {
  workspaces: Workspace[]; activeWs: Workspace | null
  onSwitch: (ws: Workspace | null) => void; onRefresh: () => void
  setError: (e: string | null) => void
}) {
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)

  // Auto-detect pending invite from URL
  useEffect(() => {
    const pending = sessionStorage.getItem('fortuna:pending-invite')
    if (pending) {
      sessionStorage.removeItem('fortuna:pending-invite')
      setJoinCode(pending)
      setShowJoin(true)
    }
  }, [])

  const handleCreate = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createWorkspace(name.trim(), desc.trim() || undefined)
      setShowCreate(false); setName(''); setDesc('')
      onRefresh()
    } catch (e: any) { setError(e.message) }
    setBusy(false)
  }

  const handleJoin = async () => {
    if (!joinCode.trim()) return
    setBusy(true)
    try {
      await joinWorkspace(joinCode.trim())
      setShowJoin(false); setJoinCode('')
      onRefresh()
    } catch (e: any) { setError(e.message) }
    setBusy(false)
  }

  return (
    <div>
      {/* Personal mode */}
      <div style={{ ...card, cursor: 'pointer', border: !activeWs ? '1px solid rgba(251,191,36,0.4)' : '1px solid var(--border-subtle)' }} onClick={() => onSwitch(null)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={16} style={{ color: 'var(--text-muted)' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Personal</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Your private data — not shared</div>
            </div>
          </div>
          {!activeWs && <span style={pill('#10b981')}>Active</span>}
        </div>
      </div>

      {/* Workspace list */}
      {workspaces.map(ws => (
        <div
          key={ws.id}
          style={{ ...card, cursor: 'pointer', border: activeWs?.id === ws.id ? '1px solid rgba(251,191,36,0.4)' : '1px solid var(--border-subtle)' }}
          onClick={() => onSwitch(ws)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={16} style={{ color: roleColor[ws.role] }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ws.name}</span>
                  <span style={pill(roleColor[ws.role])}>{roleIcon(ws.role)} {ws.role}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ws.member_count} member{ws.member_count !== 1 ? 's' : ''}{ws.description ? ` · ${ws.description}` : ''}</div>
              </div>
            </div>
            {activeWs?.id === ws.id ? <span style={pill('#10b981')}>Active</span> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
          </div>
        </div>
      ))}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button style={btnPrimary} onClick={() => setShowCreate(!showCreate)}><Plus size={12} /> Create Workspace</button>
        <button style={btn} onClick={() => setShowJoin(!showJoin)}><Link2 size={12} /> Join with Code</button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>New Workspace</div>
          <input placeholder="Workspace name" value={name} onChange={e => setName(e.target.value)} style={{ ...input, marginBottom: 8 }} />
          <input placeholder="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} style={{ ...input, marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btnPrimary} onClick={handleCreate} disabled={busy || !name.trim()}>{busy ? 'Creating...' : 'Create'}</button>
            <button style={btn} onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Join form */}
      {showJoin && (
        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Join Workspace</div>
          <input placeholder="Paste invite code..." value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{ ...input, marginBottom: 10, fontFamily: 'var(--font-mono)' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btnPrimary} onClick={handleJoin} disabled={busy || !joinCode.trim()}>{busy ? 'Joining...' : 'Join'}</button>
            <button style={btn} onClick={() => setShowJoin(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Members Tab ─────────────────────────────────────────────────────

function MembersTab({ ws, permissions, setError }: { ws: Workspace; permissions: WorkspacePermissions | null; setError: (e: string | null) => void }) {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState('member')
  const [copied, setCopied] = useState(false)
  const canManage = permissions?.can_manage_members ?? false

  useEffect(() => {
    setLoading(true)
    listMembers(ws.id).then(d => setMembers(d.members)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ws.id])

  const handleInvite = async () => {
    try {
      const inv = await createInvite(ws.id, { role: inviteRole, expires_hours: 168 })
      setInviteLink(inv.invite_url || inv.invite_code)
    } catch (e: any) { setError(e.message) }
  }

  const handleCopy = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRemove = async (uuid: string) => {
    if (!confirm('Remove this member?')) return
    try {
      await removeMember(ws.id, uuid)
      setMembers(m => m.filter(x => x.user_uuid !== uuid))
    } catch (e: any) { setError(e.message) }
  }

  const handleRoleChange = async (uuid: string, newRole: string) => {
    try {
      await changeMemberRole(ws.id, uuid, newRole)
      setMembers(m => m.map(x => x.user_uuid === uuid ? { ...x, role: newRole as any } : x))
    } catch (e: any) { setError(e.message) }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 20 }}>Loading members...</div>

  return (
    <div>
      {/* Invite */}
      {canManage && (
        <div style={{ ...card, background: 'rgba(251,191,36,0.03)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>
            <UserPlus size={13} style={{ marginRight: 6 }} /> Invite People
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...input, width: 'auto' }}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </select>
            <button style={btnPrimary} onClick={handleInvite}>Generate Invite Link</button>
          </div>
          {inviteLink && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: 11, padding: '6px 8px', background: 'var(--bg-hover)', borderRadius: 6, color: '#fbbf24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviteLink}</code>
              <button style={btn} onClick={handleCopy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}</button>
            </div>
          )}
        </div>
      )}

      {/* Member list */}
      {members.map(m => (
        <div key={m.user_uuid} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{m.display_name || m.email}</span>
              <span style={pill(roleColor[m.role])}>{roleIcon(m.role)} {m.role}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email}{m.last_active_at ? ` · Last active ${new Date(m.last_active_at).toLocaleDateString()}` : ''}</div>
          </div>
          {canManage && m.role !== 'owner' && (
            <div style={{ display: 'flex', gap: 4 }}>
              <select
                value={m.role}
                onChange={e => handleRoleChange(m.user_uuid, e.target.value)}
                style={{ ...input, width: 'auto', fontSize: 11, padding: '3px 6px' }}
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
              <button style={{ ...btn, padding: '3px 6px', color: '#ef4444' }} onClick={() => handleRemove(m.user_uuid)}>
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Resources Tab ───────────────────────────────────────────────────

function ResourcesTab({ ws, permissions, setError }: { ws: Workspace; permissions: WorkspacePermissions | null; setError: (e: string | null) => void }) {
  const [resources, setResources] = useState<SharedResource[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [resType, setResType] = useState('note')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const canEdit = permissions?.can_edit_data ?? false

  useEffect(() => {
    setLoading(true)
    listResources(ws.id).then(d => setResources(d.resources)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ws.id])

  const handleAdd = async () => {
    if (!title.trim()) return
    setBusy(true)
    try {
      await createResource(ws.id, { title: title.trim(), resource_type: resType, content: content.trim() || undefined })
      setShowAdd(false); setTitle(''); setContent('')
      const d = await listResources(ws.id); setResources(d.resources)
    } catch (e: any) { setError(e.message) }
    setBusy(false)
  }

  const handleDelete = async (uuid: string) => {
    if (!confirm('Delete this resource?')) return
    try {
      await deleteResource(uuid)
      setResources(r => r.filter(x => x.uuid !== uuid))
    } catch (e: any) { setError(e.message) }
  }

  const typeIcon: Record<string, string> = { document: '📄', note: '📝', template: '📋', snapshot: '💾', config: '⚙️' }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 20 }}>Loading resources...</div>

  return (
    <div>
      {canEdit && (
        <button style={{ ...btnPrimary, marginBottom: 12 }} onClick={() => setShowAdd(!showAdd)}>
          <Plus size={12} /> Add Resource
        </button>
      )}

      {showAdd && (
        <div style={{ ...card }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={{ ...input, flex: 1 }} />
            <select value={resType} onChange={e => setResType(e.target.value)} style={{ ...input, width: 'auto' }}>
              <option value="note">Note</option>
              <option value="document">Document</option>
              <option value="template">Template</option>
              <option value="config">Config</option>
            </select>
          </div>
          <textarea
            placeholder="Content (notes, data, JSON, etc.)"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            style={{ ...input, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button style={btnPrimary} onClick={handleAdd} disabled={busy || !title.trim()}>{busy ? 'Saving...' : 'Save'}</button>
            <button style={btn} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {resources.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No shared resources yet</div>
      ) : resources.map(r => (
        <div key={r.uuid} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{typeIcon[r.type] || '📎'}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</span>
              {r.is_pinned && <span style={pill('#f59e0b')}>📌 Pinned</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {r.uploaded_by} · {new Date(r.created_at).toLocaleDateString()}
              {r.tags.length > 0 && ` · ${r.tags.join(', ')}`}
            </div>
          </div>
          {canEdit && (
            <button style={{ ...btn, padding: '3px 6px', color: '#ef4444' }} onClick={() => handleDelete(r.uuid)}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── AI Keys Tab ─────────────────────────────────────────────────────

function KeysTab({ ws, permissions, setError }: { ws: Workspace; permissions: WorkspacePermissions | null; setError: (e: string | null) => void }) {
  const [keys, setKeys] = useState<SharedAIKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [provider, setProvider] = useState('openrouter')
  const [keyVal, setKeyVal] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const canManage = permissions?.can_manage_keys ?? false

  useEffect(() => {
    setLoading(true)
    listAIKeys(ws.id).then(d => setKeys(d.keys)).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [ws.id])

  const handleAdd = async () => {
    if (!keyVal.trim()) return
    setBusy(true)
    try {
      await addAIKey(ws.id, provider, keyVal.trim(), label.trim() || undefined)
      setShowAdd(false); setKeyVal(''); setLabel('')
      const d = await listAIKeys(ws.id); setKeys(d.keys)
    } catch (e: any) { setError(e.message) }
    setBusy(false)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this API key?')) return
    try {
      await deleteAIKey(id)
      setKeys(k => k.filter(x => x.id !== id))
    } catch (e: any) { setError(e.message) }
  }

  const providerIcon: Record<string, string> = { anthropic: '🟠', openai: '🟢', gemini: '🔵', openrouter: '🟣' }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 20 }}>Loading keys...</div>

  return (
    <div>
      <div style={{ ...card, background: 'rgba(139,92,246,0.03)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <Key size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
        Shared API keys are encrypted on the server and used by all workspace members for the AI Advisor. Members never see the actual key.
      </div>

      {canManage && (
        <button style={{ ...btnPrimary, marginBottom: 12 }} onClick={() => setShowAdd(!showAdd)}>
          <Plus size={12} /> Add API Key
        </button>
      )}

      {showAdd && (
        <div style={{ ...card }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select value={provider} onChange={e => setProvider(e.target.value)} style={{ ...input, width: 'auto' }}>
              <option value="anthropic">🟠 Anthropic</option>
              <option value="openai">🟢 OpenAI</option>
              <option value="gemini">🔵 Gemini</option>
              <option value="openrouter">🟣 OpenRouter</option>
            </select>
            <input placeholder="Label (optional)" value={label} onChange={e => setLabel(e.target.value)} style={{ ...input, flex: 1 }} />
          </div>
          <input
            type="password"
            placeholder="API key..."
            value={keyVal}
            onChange={e => setKeyVal(e.target.value)}
            style={{ ...input, marginBottom: 10, fontFamily: 'var(--font-mono)' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btnPrimary} onClick={handleAdd} disabled={busy || !keyVal.trim()}>{busy ? 'Adding...' : 'Add Key'}</button>
            <button style={btn} onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No shared API keys configured</div>
      ) : keys.map(k => (
        <div key={k.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{providerIcon[k.provider] || '⚪'}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{k.label || k.provider}</span>
              {k.is_active ? <span style={pill('#10b981')}>Active</span> : <span style={pill('#6b7280')}>Inactive</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {k.key_preview} · {k.usage_count} uses · Added by {k.added_by}
            </div>
          </div>
          {canManage && (
            <button style={{ ...btn, padding: '3px 6px', color: '#ef4444' }} onClick={() => handleDelete(k.id)}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Activity Tab ────────────────────────────────────────────────────

function ActivityTab({ ws }: { ws: Workspace }) {
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getActivity(ws.id).then(d => setActivity(d.activity)).catch(() => {}).finally(() => setLoading(false))
  }, [ws.id])

  const actionIcon: Record<string, string> = {
    created: '🏗️', joined: '👋', left: '🚪', saved_state: '💾', uploaded_resource: '📎',
    deleted_resource: '🗑️', added_key: '🔑', removed_key: '🔓', created_invite: '✉️',
    role_changed: '🔄', removed_member: '❌', updated_settings: '⚙️',
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 20 }}>Loading activity...</div>

  return (
    <div>
      {activity.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No activity yet</div>
      ) : activity.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 14, lineHeight: '20px' }}>{actionIcon[a.action] || '•'}</span>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>
              <strong>{a.user}</strong> {a.detail || a.action.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(a.created_at).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
