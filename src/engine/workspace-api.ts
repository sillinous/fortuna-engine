/**
 * Fortuna Engine — Workspace API Client v2
 *
 * ALL mutations use POST. GET for reads only.
 * Action names match workspace.php v2.
 */

import { getAPIBaseUrl } from './api-client'

// ─── HTTP Helpers ─────────────────────────────────────────────────

const getHeaders = (): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('fortuna:access-token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

const url = (params: string) => `${getAPIBaseUrl()}/workspace.php?${params}`

async function api<T>(endpoint: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(endpoint, { headers: getHeaders(), ...opts })
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error(`Server error ${res.status} (non-JSON response)`)
  }
  if (!res.ok || data.error) throw new Error(data.message || `Error ${res.status}`)
  return data as T
}

function post<T>(action: string, body: Record<string, any>): Promise<T> {
  return api<T>(url(`action=${action}`), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function get<T>(action: string, params = ''): Promise<T> {
  return api<T>(url(`action=${action}${params ? '&' + params : ''}`))
}

// ─── Types ────────────────────────────────────────────────────────

export interface Workspace {
  id: number
  uuid: string
  name: string
  description: string | null
  slug: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  member_count: number
  joined_at?: string
  owner?: string
  max_members?: number
  created_at?: string
}

export interface WorkspaceMember {
  user_uuid: string
  email: string
  display_name: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joined_at: string
  last_active_at: string | null
  permissions: WorkspacePermissions
}

export interface SharedResource {
  uuid: string
  type: string
  title: string
  description: string | null
  content: string | null
  file_name: string | null
  tags: string[]
  is_pinned: boolean
  uploaded_by: string
  created_at: string
  updated_at: string
}

export interface SharedAIKey {
  id: number
  provider: string
  label: string
  key_preview: string
  is_active: boolean
  usage_count: number
  last_used_at: string | null
  added_by: string
  created_at: string
}

export interface ActivityEntry {
  action: string
  detail: string | null
  user: string
  created_at: string
}

export type WorkspacePermissions = {
  can_edit_data: boolean
  can_manage_members: boolean
  can_manage_keys: boolean
  can_export: boolean
  can_use_advisor: boolean
}

// ─── Workspace CRUD ───────────────────────────────────────────────

export function listWorkspaces() {
  return get<{ workspaces: Workspace[]; active_workspace_id: number | null }>('list')
}

export function createWorkspace(name: string, description?: string) {
  return post<{ workspace: Workspace }>('create', { name, description })
}

export function getWorkspace(id: number) {
  return get<{ workspace: Workspace; my_role: string; permissions: WorkspacePermissions }>('get', `id=${id}`)
}

export function updateWorkspace(id: number, data: Partial<{ name: string; description: string }>) {
  return post<{ updated: boolean }>('update', { workspace_id: id, ...data })
}

export function deleteWorkspace(id: number) {
  return post<{ deleted: boolean }>('delete', { workspace_id: id })
}

// ─── Members ──────────────────────────────────────────────────────

export function listMembers(wsId: number) {
  return get<{ members: WorkspaceMember[] }>('members', `id=${wsId}`)
}

export function changeMemberRole(wsId: number, targetUuid: string, role: string) {
  return post<{ updated: boolean }>('member_role', { workspace_id: wsId, target_user_uuid: targetUuid, role })
}

export function removeMember(wsId: number, targetUuid: string) {
  return post<{ removed: boolean }>('remove_member', { workspace_id: wsId, target_user_uuid: targetUuid })
}

export function leaveWorkspace(id: number) {
  return post<{ left: boolean }>('leave', { workspace_id: id })
}

// ─── Invites ──────────────────────────────────────────────────────

export function createInvite(wsId: number, opts?: { role?: string; max_uses?: number; expires_hours?: number; email?: string }) {
  return post<{ invite_code: string; role: string; max_uses: number; expires_at: string | null }>('invite', { workspace_id: wsId, ...opts })
}

export function getInviteInfo(code: string) {
  return get<{ workspace_name: string; workspace_description: string | null; role: string; member_count: number; restricted_email: boolean }>('invite_info', `code=${code}`)
}

export function joinWorkspace(inviteCode: string) {
  return post<{ joined: boolean; workspace: { id: number; name: string; role: string } }>('join', { invite_code: inviteCode })
}

// ─── Shared State ─────────────────────────────────────────────────

export function loadWorkspaceState(wsId: number) {
  return get<{ state_data: any; version: number; checksum: string | null; last_edited_by: string; last_synced_at: string }>('state', `id=${wsId}`)
}

export function saveWorkspaceState(wsId: number, stateData: any, expectedVersion?: number, force?: boolean) {
  return post<{ saved: boolean; version: number; checksum: string }>('save_state', { workspace_id: wsId, state_data: stateData, expected_version: expectedVersion, force })
}

// ─── Shared Resources ─────────────────────────────────────────────

export function listResources(wsId: number, type?: string) {
  return get<{ resources: SharedResource[] }>('resources', `id=${wsId}${type ? '&type=' + type : ''}`)
}

export function createResource(wsId: number, data: { title: string; resource_type: string; description?: string; content?: string; tags?: string[] }) {
  return post<{ uuid: string; created: boolean }>('add_resource', { workspace_id: wsId, ...data })
}

export function deleteResource(uuid: string) {
  return post<{ deleted: boolean }>('delete_resource', { uuid })
}

// ─── Shared AI Keys ───────────────────────────────────────────────

export function listAIKeys(wsId: number) {
  return get<{ keys: SharedAIKey[] }>('keys', `id=${wsId}`)
}

export function addAIKey(wsId: number, provider: string, apiKey: string, label?: string) {
  return post<{ added: boolean }>('add_key', { workspace_id: wsId, provider, api_key: apiKey, label })
}

export function deleteAIKey(keyId: number) {
  return post<{ deleted: boolean }>('delete_key', { key_id: keyId })
}

// ─── Activity ─────────────────────────────────────────────────────

export function getActivity(wsId: number, limit = 50) {
  return get<{ activity: ActivityEntry[] }>('activity', `id=${wsId}&limit=${limit}`)
}

// ─── Switch Workspace ─────────────────────────────────────────────

export function switchWorkspace(id: number | null) {
  return post<{ switched: boolean; workspace_id: number | null; mode: string }>('switch', { workspace_id: id ?? 0 })
}

// ─── Local Storage ────────────────────────────────────────────────

const WS_KEY = 'fortuna:active-workspace'

export function getLocalActiveWorkspace(): { id: number; name: string; role: string } | null {
  try {
    const raw = localStorage.getItem(WS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function setLocalActiveWorkspace(ws: { id: number; name: string; role: string } | null): void {
  if (ws) localStorage.setItem(WS_KEY, JSON.stringify(ws))
  else localStorage.removeItem(WS_KEY)
  // Notify sidebar badge etc
  window.dispatchEvent(new Event('storage'))
}
