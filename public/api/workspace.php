<?php
/**
 * FORTUNA ENGINE - Workspace / Collaboration API v2
 * 
 * ALL mutations use POST to avoid body-stripping on shared hosting.
 * 
 * GET endpoints:
 *   ?action=list                  - List user's workspaces
 *   ?action=get&id=X              - Get workspace details
 *   ?action=members&id=X          - List members
 *   ?action=invite_info&code=X    - Invite preview (public, no auth)
 *   ?action=state&id=X            - Load shared state
 *   ?action=resources&id=X        - List resources
 *   ?action=keys&id=X             - List AI keys (masked)
 *   ?action=activity&id=X         - Activity log
 * 
 * POST endpoints (all mutations):
 *   ?action=create                - Create workspace
 *   ?action=update                - Update workspace (body: workspace_id, name?, description?)
 *   ?action=delete                - Delete workspace (body: workspace_id)
 *   ?action=member_role           - Change role (body: workspace_id, target_user_uuid, role)
 *   ?action=remove_member         - Remove member (body: workspace_id, target_user_uuid)
 *   ?action=leave                 - Leave workspace (body: workspace_id)
 *   ?action=invite                - Create invite (body: workspace_id, role?, max_uses?, expires_hours?)
 *   ?action=join                  - Join via code (body: invite_code)
 *   ?action=save_state            - Save shared state (body: workspace_id, state_data)
 *   ?action=add_resource          - Add resource (body: workspace_id, title, resource_type, content?)
 *   ?action=delete_resource       - Delete resource (body: uuid)
 *   ?action=add_key               - Add AI key (body: workspace_id, provider, api_key)
 *   ?action=delete_key            - Delete AI key (body: key_id)
 *   ?action=switch                - Switch workspace (body: workspace_id — 0 for personal)
 */

require_once __DIR__ . '/core.php';
require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    // GET
    case 'list':         handleList(); break;
    case 'get':          handleGet(); break;
    case 'members':      handleMembers(); break;
    case 'invite_info':  handleInviteInfo(); break;
    case 'state':        handleLoadState(); break;
    case 'resources':    handleListResources(); break;
    case 'keys':         handleListKeys(); break;
    case 'activity':     handleActivity(); break;

    // POST (all mutations)
    case 'create':          handleCreate(); break;
    case 'update':          handleUpdate(); break;
    case 'delete':          handleDelete(); break;
    case 'member_role':     handleMemberRole(); break;
    case 'remove_member':   handleRemoveMember(); break;
    case 'leave':           handleLeave(); break;
    case 'invite':          handleCreateInvite(); break;
    case 'join':            handleJoin(); break;
    case 'save_state':      handleSaveState(); break;
    case 'add_resource':    handleAddResource(); break;
    case 'delete_resource': handleDeleteResource(); break;
    case 'add_key':         handleAddKey(); break;
    case 'delete_key':      handleDeleteKey(); break;
    case 'switch':          handleSwitch(); break;

    default:
        sendError('Unknown workspace action: ' . $action, 400);
}

// ============================================
// HELPERS
// ============================================

function getUserIdFromUUID(string $uuid): ?int {
    $db = getDB();
    $stmt = $db->prepare('SELECT id FROM users WHERE uuid = ? AND is_active = 1');
    $stmt->execute([$uuid]);
    $row = $stmt->fetch();
    return $row ? (int)$row['id'] : null;
}

function getAuthUser(): array {
    $auth = requireAuth();
    $userId = getUserIdFromUUID($auth['sub']);
    if (!$userId) sendError('User not found', 404, 'USER_NOT_FOUND');
    return [$auth, $userId];
}

function requireWorkspaceMember(int $wsId, int $userId, array $requiredPerms = []): array {
    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?');
    $stmt->execute([$wsId, $userId]);
    $member = $stmt->fetch();
    if (!$member) sendError('You are not a member of this workspace', 403, 'NOT_MEMBER');
    foreach ($requiredPerms as $perm) {
        if (empty($member[$perm])) sendError("Permission denied: $perm", 403, 'INSUFFICIENT_PERMISSIONS');
    }
    return $member;
}

function logActivity(int $wsId, ?int $userId, string $action, ?string $detail = null): void {
    try {
        $db = getDB();
        $stmt = $db->prepare('INSERT INTO workspace_activity (workspace_id, user_id, action, detail) VALUES (?, ?, ?, ?)');
        $stmt->execute([$wsId, $userId, $action, $detail]);
    } catch (\Exception $e) { /* non-critical */ }
}

function getQueryId(): int {
    $id = $_GET['id'] ?? null;
    if (!$id || !is_numeric($id)) sendError('Workspace ID required as ?id= query param', 400);
    return (int)$id;
}

function getBodyId(array $body, string $field = 'workspace_id'): int {
    if (empty($body[$field]) || !is_numeric($body[$field])) sendError("$field required in request body", 400);
    return (int)$body[$field];
}

function rolePerms(string $role): array {
    switch ($role) {
        case 'owner':
        case 'admin':
            return [1, 1, 1, 1, 1];
        case 'member':
            return [1, 0, 0, 1, 1];
        case 'viewer':
            return [0, 0, 0, 1, 0];
        default:
            return [0, 0, 0, 0, 0];
    }
}

function insertMember(int $wsId, int $userId, string $role): void {
    $p = rolePerms($role);
    $db = getDB();
    $stmt = $db->prepare('INSERT INTO workspace_members (workspace_id, user_id, role, can_edit_data, can_manage_members, can_manage_keys, can_export, can_use_advisor) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$wsId, $userId, $role, $p[0], $p[1], $p[2], $p[3], $p[4]]);
}

/** Safely set active_workspace_id — silently ignores if column doesn't exist */
function setActiveWorkspace(int $userId, ?int $wsId): void {
    try {
        $db = getDB();
        if ($wsId === null || $wsId === 0) {
            $db->prepare('UPDATE users SET active_workspace_id = NULL WHERE id = ?')->execute([$userId]);
        } else {
            $db->prepare('UPDATE users SET active_workspace_id = ? WHERE id = ?')->execute([$wsId, $userId]);
        }
    } catch (\Exception $e) { /* column may not exist — OK */ }
}

/** Safely get active_workspace_id */
function getActiveWorkspaceId(int $userId): ?int {
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT active_workspace_id FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $val = $stmt->fetchColumn();
        return $val ? (int)$val : null;
    } catch (\Exception $e) { return null; }
}

function encryptKey(string $key): string {
    $secret = defined('JWT_SECRET') ? JWT_SECRET : 'fortuna-default-key';
    $iv = openssl_random_pseudo_bytes(16);
    $enc = openssl_encrypt($key, 'aes-256-cbc', $secret, 0, $iv);
    return base64_encode($iv . '::' . $enc);
}

function decryptKey(string $enc): string {
    $secret = defined('JWT_SECRET') ? JWT_SECRET : 'fortuna-default-key';
    $data = base64_decode($enc);
    $parts = explode('::', $data, 2);
    if (count($parts) !== 2) return '';
    return openssl_decrypt($parts[1], 'aes-256-cbc', $secret, 0, $parts[0]) ?: '';
}

function maskKey(string $key): string {
    if (strlen($key) <= 8) return '••••••••';
    return substr($key, 0, 6) . '••••' . substr($key, -4);
}

// ============================================
// LIST WORKSPACES (GET)
// ============================================
function handleList(): void {
    requireMethod('GET');
    [$auth, $userId] = getAuthUser();

    $db = getDB();
    $stmt = $db->prepare('
        SELECT w.id, w.uuid, w.name, w.description, w.slug, w.created_at,
               wm.role, wm.joined_at,
               (SELECT COUNT(*) FROM workspace_members wm2 WHERE wm2.workspace_id = w.id) as member_count
        FROM workspaces w
        JOIN workspace_members wm ON w.id = wm.workspace_id AND wm.user_id = ?
        WHERE w.is_active = 1
        ORDER BY FIELD(wm.role, "owner", "admin", "member", "viewer"), w.name ASC
    ');
    $stmt->execute([$userId]);

    sendSuccess([
        'workspaces' => array_map(function($w) {
            return [
                'id'           => (int)$w['id'],
                'uuid'         => $w['uuid'],
                'name'         => $w['name'],
                'description'  => $w['description'],
                'slug'         => $w['slug'],
                'role'         => $w['role'],
                'member_count' => (int)$w['member_count'],
                'joined_at'    => $w['joined_at'],
                'created_at'   => $w['created_at'],
            ];
        }, $stmt->fetchAll()),
        'active_workspace_id' => getActiveWorkspaceId($userId),
    ]);
}

// ============================================
// CREATE WORKSPACE (POST)
// ============================================
function handleCreate(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();

    $body = getJSONBody();
    requireFields($body, ['name']);

    $name = trim($body['name']);
    $desc = trim($body['description'] ?? '');
    $slug = preg_replace('/[^a-z0-9-]/', '', strtolower(str_replace(' ', '-', $name)));
    $slug = substr($slug, 0, 50) ?: 'workspace';

    $db = getDB();
    $stmt = $db->prepare('SELECT COUNT(*) FROM workspaces WHERE slug = ?');
    $stmt->execute([$slug]);
    if ($stmt->fetchColumn() > 0) $slug .= '-' . substr(bin2hex(random_bytes(3)), 0, 6);

    $uuid = generateUUID();

    $db->beginTransaction();
    try {
        $stmt = $db->prepare('INSERT INTO workspaces (uuid, name, description, owner_id, slug) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$uuid, $name, $desc, $userId, $slug]);
        $wsId = (int)$db->lastInsertId();

        insertMember($wsId, $userId, 'owner');

        // Init empty shared state
        $empty = json_encode(['profile' => new \stdClass, 'incomeStreams' => [], 'expenses' => [], 'deductions' => [], 'entities' => []]);
        $db->prepare('INSERT INTO workspace_states (workspace_id, state_data) VALUES (?, ?)')->execute([$wsId, $empty]);

        $db->commit();

        setActiveWorkspace($userId, $wsId);
        logActivity($wsId, $userId, 'created', "Created workspace: $name");

        sendSuccess([
            'workspace' => [
                'id' => $wsId, 'uuid' => $uuid, 'name' => $name,
                'description' => $desc, 'slug' => $slug,
                'role' => 'owner', 'member_count' => 1,
            ],
        ]);
    } catch (\Exception $e) {
        $db->rollBack();
        sendError('Failed to create workspace: ' . $e->getMessage(), 500);
    }
}

// ============================================
// GET WORKSPACE (GET)
// ============================================
function handleGet(): void {
    requireMethod('GET');
    [$auth, $userId] = getAuthUser();
    $wsId = getQueryId();
    $member = requireWorkspaceMember($wsId, $userId);

    $db = getDB();
    $stmt = $db->prepare('SELECT * FROM workspaces WHERE id = ? AND is_active = 1');
    $stmt->execute([$wsId]);
    $ws = $stmt->fetch();
    if (!$ws) sendError('Workspace not found', 404);

    $db->prepare('SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?')->execute([$wsId]);
    $memberCount = (int)$db->query("SELECT COUNT(*) FROM workspace_members WHERE workspace_id = $wsId")->fetchColumn();

    $stmt3 = $db->prepare('SELECT display_name, email FROM users WHERE id = ?');
    $stmt3->execute([$ws['owner_id']]);
    $owner = $stmt3->fetch();

    sendSuccess([
        'workspace' => [
            'id' => (int)$ws['id'], 'uuid' => $ws['uuid'],
            'name' => $ws['name'], 'description' => $ws['description'],
            'slug' => $ws['slug'],
            'owner' => $owner ? ($owner['display_name'] ?: $owner['email']) : 'Unknown',
            'member_count' => $memberCount,
            'max_members' => (int)$ws['max_members'],
            'created_at' => $ws['created_at'],
        ],
        'my_role' => $member['role'],
        'permissions' => [
            'can_edit_data'      => (bool)$member['can_edit_data'],
            'can_manage_members' => (bool)$member['can_manage_members'],
            'can_manage_keys'    => (bool)$member['can_manage_keys'],
            'can_export'         => (bool)$member['can_export'],
            'can_use_advisor'    => (bool)$member['can_use_advisor'],
        ],
    ]);
}

// ============================================
// UPDATE WORKSPACE (POST)
// ============================================
function handleUpdate(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    $wsId = getBodyId($body);
    $member = requireWorkspaceMember($wsId, $userId);
    if (!in_array($member['role'], ['owner', 'admin'])) sendError('Only owners/admins can update settings', 403);

    $updates = []; $params = [];
    if (isset($body['name']))        { $updates[] = 'name = ?';        $params[] = trim($body['name']); }
    if (isset($body['description'])) { $updates[] = 'description = ?'; $params[] = trim($body['description']); }
    if (isset($body['settings']))    { $updates[] = 'settings = ?';    $params[] = json_encode($body['settings']); }
    if (empty($updates)) sendError('No fields to update', 400);

    $params[] = $wsId;
    $db = getDB();
    $db->prepare('UPDATE workspaces SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);

    logActivity($wsId, $userId, 'updated', 'Updated workspace settings');
    sendSuccess(['updated' => true]);
}

// ============================================
// DELETE WORKSPACE (POST)
// ============================================
function handleDelete(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    $wsId = getBodyId($body);
    $member = requireWorkspaceMember($wsId, $userId);
    if ($member['role'] !== 'owner') sendError('Only the owner can delete a workspace', 403);

    $db = getDB();
    $db->prepare('UPDATE workspaces SET is_active = 0 WHERE id = ?')->execute([$wsId]);

    // Clear active workspace for all members
    try {
        $db->prepare('UPDATE users SET active_workspace_id = NULL WHERE active_workspace_id = ?')->execute([$wsId]);
    } catch (\Exception $e) { /* column may not exist */ }

    sendSuccess(['deleted' => true]);
}

// ============================================
// LIST MEMBERS (GET)
// ============================================
function handleMembers(): void {
    requireMethod('GET');
    [$auth, $userId] = getAuthUser();
    $wsId = getQueryId();
    requireWorkspaceMember($wsId, $userId);

    $db = getDB();
    $stmt = $db->prepare('
        SELECT wm.role, wm.joined_at, wm.last_active_at,
               wm.can_edit_data, wm.can_manage_members, wm.can_manage_keys,
               wm.can_export, wm.can_use_advisor,
               u.uuid as user_uuid, u.email, u.display_name
        FROM workspace_members wm
        JOIN users u ON wm.user_id = u.id
        WHERE wm.workspace_id = ?
        ORDER BY FIELD(wm.role, "owner", "admin", "member", "viewer"), u.display_name
    ');
    $stmt->execute([$wsId]);

    sendSuccess([
        'members' => array_map(function($m) {
            return [
                'user_uuid'    => $m['user_uuid'],
                'email'        => $m['email'],
                'display_name' => $m['display_name'],
                'role'         => $m['role'],
                'joined_at'    => $m['joined_at'],
                'last_active_at' => $m['last_active_at'],
                'permissions'  => [
                    'can_edit_data'      => (bool)$m['can_edit_data'],
                    'can_manage_members' => (bool)$m['can_manage_members'],
                    'can_manage_keys'    => (bool)$m['can_manage_keys'],
                    'can_export'         => (bool)$m['can_export'],
                    'can_use_advisor'    => (bool)$m['can_use_advisor'],
                ],
            ];
        }, $stmt->fetchAll()),
    ]);
}

// ============================================
// CHANGE MEMBER ROLE (POST)
// ============================================
function handleMemberRole(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['workspace_id', 'target_user_uuid', 'role']);
    $wsId = (int)$body['workspace_id'];
    requireWorkspaceMember($wsId, $userId, ['can_manage_members']);

    $targetId = getUserIdFromUUID($body['target_user_uuid']);
    if (!$targetId) sendError('Target user not found', 404);

    $db = getDB();
    $stmt = $db->prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?');
    $stmt->execute([$wsId, $targetId]);
    $target = $stmt->fetch();
    if (!$target) sendError('Target is not a member', 404);
    if ($target['role'] === 'owner') sendError("Cannot change the owner's role", 403);

    $newRole = $body['role'];
    if (!in_array($newRole, ['admin', 'member', 'viewer'])) sendError('Invalid role', 400);

    $p = rolePerms($newRole);
    $db->prepare('UPDATE workspace_members SET role=?, can_edit_data=?, can_manage_members=?, can_manage_keys=?, can_export=?, can_use_advisor=? WHERE workspace_id=? AND user_id=?')
       ->execute([$newRole, $p[0], $p[1], $p[2], $p[3], $p[4], $wsId, $targetId]);

    logActivity($wsId, $userId, 'role_changed', "Changed role to $newRole");
    sendSuccess(['updated' => true]);
}

// ============================================
// REMOVE MEMBER (POST)
// ============================================
function handleRemoveMember(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['workspace_id', 'target_user_uuid']);
    $wsId = (int)$body['workspace_id'];
    requireWorkspaceMember($wsId, $userId, ['can_manage_members']);

    $targetId = getUserIdFromUUID($body['target_user_uuid']);
    if (!$targetId) sendError('Target user not found', 404);

    $db = getDB();
    $stmt = $db->prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?');
    $stmt->execute([$wsId, $targetId]);
    $target = $stmt->fetch();
    if ($target && $target['role'] === 'owner') sendError('Cannot remove the workspace owner', 403);

    $db->prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?')->execute([$wsId, $targetId]);
    setActiveWorkspace($targetId, null);

    logActivity($wsId, $userId, 'removed_member', 'Removed a member');
    sendSuccess(['removed' => true]);
}

// ============================================
// LEAVE WORKSPACE (POST)
// ============================================
function handleLeave(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    $wsId = getBodyId($body);
    $member = requireWorkspaceMember($wsId, $userId);
    if ($member['role'] === 'owner') sendError('Owner cannot leave. Transfer ownership or delete.', 403);

    $db = getDB();
    $db->prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?')->execute([$wsId, $userId]);
    setActiveWorkspace($userId, null);

    logActivity($wsId, $userId, 'left', 'Left the workspace');
    sendSuccess(['left' => true]);
}

// ============================================
// CREATE INVITE (POST)
// ============================================
function handleCreateInvite(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['workspace_id']);
    $wsId = (int)$body['workspace_id'];
    requireWorkspaceMember($wsId, $userId, ['can_manage_members']);

    $code = bin2hex(random_bytes(16));
    $role = $body['role'] ?? 'member';
    if (!in_array($role, ['admin', 'member', 'viewer'])) $role = 'member';
    $maxUses = min(max((int)($body['max_uses'] ?? 1), 1), 100);
    $email = isset($body['email']) && $body['email'] ? sanitizeEmail($body['email']) : null;

    $expiresAt = null;
    if (!empty($body['expires_hours'])) {
        $hours = min((int)$body['expires_hours'], 720);
        $expiresAt = date('Y-m-d H:i:s', time() + ($hours * 3600));
    }

    $db = getDB();
    $db->prepare('INSERT INTO workspace_invites (workspace_id, invite_code, invited_email, invited_by, role, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
       ->execute([$wsId, $code, $email, $userId, $role, $maxUses, $expiresAt]);

    logActivity($wsId, $userId, 'created_invite', "Invite (role: $role)");

    sendSuccess([
        'invite_code' => $code,
        'role' => $role,
        'max_uses' => $maxUses,
        'expires_at' => $expiresAt,
    ]);
}

// ============================================
// INVITE INFO (GET, public)
// ============================================
function handleInviteInfo(): void {
    requireMethod('GET');
    $code = $_GET['code'] ?? '';
    if (empty($code)) sendError('Invite code required', 400);

    $db = getDB();
    $stmt = $db->prepare('
        SELECT wi.role, wi.expires_at, wi.use_count, wi.max_uses, wi.invited_email,
               w.name as workspace_name, w.description as workspace_description,
               (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count
        FROM workspace_invites wi
        JOIN workspaces w ON wi.workspace_id = w.id AND w.is_active = 1
        WHERE wi.invite_code = ?
    ');
    $stmt->execute([$code]);
    $inv = $stmt->fetch();

    if (!$inv) sendError('Invite not found or workspace deleted', 404);
    if ($inv['expires_at'] && strtotime($inv['expires_at']) < time()) sendError('Invite expired', 410);
    if ($inv['use_count'] >= $inv['max_uses']) sendError('Invite usage limit reached', 410);

    sendSuccess([
        'workspace_name' => $inv['workspace_name'],
        'workspace_description' => $inv['workspace_description'],
        'role' => $inv['role'],
        'member_count' => (int)$inv['member_count'],
        'restricted_email' => (bool)$inv['invited_email'],
    ]);
}

// ============================================
// JOIN VIA INVITE (POST)
// ============================================
function handleJoin(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['invite_code']);

    $db = getDB();
    $stmt = $db->prepare('
        SELECT wi.*, w.name as ws_name, w.max_members
        FROM workspace_invites wi
        JOIN workspaces w ON wi.workspace_id = w.id AND w.is_active = 1
        WHERE wi.invite_code = ?
    ');
    $stmt->execute([$body['invite_code']]);
    $inv = $stmt->fetch();

    if (!$inv) sendError('Invalid invite code', 404);
    if ($inv['expires_at'] && strtotime($inv['expires_at']) < time()) sendError('Invite expired', 410);
    if ($inv['use_count'] >= $inv['max_uses']) sendError('Invite usage limit reached', 410);

    // Email restriction
    if ($inv['invited_email']) {
        $email = $db->prepare('SELECT email FROM users WHERE id = ?');
        $email->execute([$userId]);
        if (strtolower($email->fetchColumn()) !== strtolower($inv['invited_email'])) {
            sendError('This invite is restricted to a different email', 403);
        }
    }

    $wsId = (int)$inv['workspace_id'];

    // Already member?
    $chk = $db->prepare('SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?');
    $chk->execute([$wsId, $userId]);
    if ($chk->fetch()) sendError('You are already a member', 409);

    // Max members
    $cnt = $db->prepare('SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?');
    $cnt->execute([$wsId]);
    if ((int)$cnt->fetchColumn() >= (int)$inv['max_members']) sendError('Workspace is full', 403);

    $db->beginTransaction();
    try {
        insertMember($wsId, $userId, $inv['role']);
        $db->prepare('UPDATE workspace_invites SET use_count = use_count + 1 WHERE id = ?')->execute([$inv['id']]);
        $db->commit();

        setActiveWorkspace($userId, $wsId);
        logActivity($wsId, $userId, 'joined', 'Joined via invite');

        sendSuccess([
            'joined' => true,
            'workspace' => ['id' => $wsId, 'name' => $inv['ws_name'], 'role' => $inv['role']],
        ]);
    } catch (\Exception $e) {
        $db->rollBack();
        sendError('Failed to join: ' . $e->getMessage(), 500);
    }
}

// ============================================
// LOAD SHARED STATE (GET)
// ============================================
function handleLoadState(): void {
    requireMethod('GET');
    [$auth, $userId] = getAuthUser();
    $wsId = getQueryId();
    requireWorkspaceMember($wsId, $userId);

    $db = getDB();
    $stmt = $db->prepare('
        SELECT ws.state_data, ws.state_version, ws.checksum, ws.last_synced_at,
               u.display_name as editor_name
        FROM workspace_states ws
        LEFT JOIN users u ON ws.last_edited_by = u.id
        WHERE ws.workspace_id = ?
    ');
    $stmt->execute([$wsId]);
    $s = $stmt->fetch();

    if (!$s) {
        sendSuccess(['state_data' => null, 'version' => 0]);
        return;
    }

    sendSuccess([
        'state_data'     => json_decode($s['state_data'], true),
        'version'        => (int)$s['state_version'],
        'checksum'       => $s['checksum'],
        'last_edited_by' => $s['editor_name'] ?? 'Unknown',
        'last_synced_at' => $s['last_synced_at'],
    ]);
}

// ============================================
// SAVE SHARED STATE (POST)
// ============================================
function handleSaveState(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['workspace_id', 'state_data']);
    $wsId = (int)$body['workspace_id'];
    requireWorkspaceMember($wsId, $userId, ['can_edit_data']);

    $json = json_encode($body['state_data']);
    $checksum = hash('sha256', $json);
    $expectedVer = (int)($body['expected_version'] ?? 0);

    $db = getDB();

    if ($expectedVer > 0 && empty($body['force'])) {
        $cur = $db->prepare('SELECT state_version FROM workspace_states WHERE workspace_id = ?');
        $cur->execute([$wsId]);
        $row = $cur->fetch();
        if ($row && (int)$row['state_version'] > $expectedVer) {
            sendError('Version conflict — reload and try again', 409, 'VERSION_CONFLICT');
        }
    }

    $db->prepare('
        INSERT INTO workspace_states (workspace_id, state_data, state_version, checksum, last_edited_by)
        VALUES (?, ?, 1, ?, ?)
        ON DUPLICATE KEY UPDATE
            state_data = VALUES(state_data),
            state_version = state_version + 1,
            checksum = VALUES(checksum),
            last_edited_by = VALUES(last_edited_by)
    ')->execute([$wsId, $json, $checksum, $userId]);

    $ver = $db->prepare('SELECT state_version FROM workspace_states WHERE workspace_id = ?');
    $ver->execute([$wsId]);

    logActivity($wsId, $userId, 'saved_state', 'Updated shared data');
    sendSuccess(['saved' => true, 'version' => (int)$ver->fetchColumn(), 'checksum' => $checksum]);
}

// ============================================
// LIST RESOURCES (GET)
// ============================================
function handleListResources(): void {
    requireMethod('GET');
    [$auth, $userId] = getAuthUser();
    $wsId = getQueryId();
    requireWorkspaceMember($wsId, $userId);

    $type = $_GET['type'] ?? null;
    $db = getDB();

    $sql = 'SELECT sr.*, u.display_name as uploader FROM shared_resources sr LEFT JOIN users u ON sr.uploaded_by = u.id WHERE sr.workspace_id = ?';
    $params = [$wsId];
    if ($type) { $sql .= ' AND sr.resource_type = ?'; $params[] = $type; }
    $sql .= ' ORDER BY sr.is_pinned DESC, sr.updated_at DESC LIMIT 100';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);

    sendSuccess([
        'resources' => array_map(function($r) {
            return [
                'uuid'        => $r['uuid'],
                'type'        => $r['resource_type'],
                'title'       => $r['title'],
                'description' => $r['description'],
                'content'     => $r['content'],
                'file_name'   => $r['file_name'],
                'tags'        => json_decode($r['tags'] ?? '[]', true),
                'is_pinned'   => (bool)$r['is_pinned'],
                'uploaded_by' => $r['uploader'] ?? 'Unknown',
                'created_at'  => $r['created_at'],
                'updated_at'  => $r['updated_at'],
            ];
        }, $stmt->fetchAll()),
    ]);
}

// ============================================
// ADD RESOURCE (POST)
// ============================================
function handleAddResource(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['workspace_id', 'title', 'resource_type']);
    $wsId = (int)$body['workspace_id'];
    requireWorkspaceMember($wsId, $userId, ['can_edit_data']);

    $type = $body['resource_type'];
    if (!in_array($type, ['document', 'note', 'template', 'snapshot', 'config'])) sendError('Invalid resource_type', 400);

    $uuid = generateUUID();
    $db = getDB();
    $db->prepare('INSERT INTO shared_resources (uuid, workspace_id, uploaded_by, resource_type, title, description, content, file_name, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
       ->execute([$uuid, $wsId, $userId, $type, trim($body['title']), trim($body['description'] ?? ''), $body['content'] ?? null, $body['file_name'] ?? null, json_encode($body['tags'] ?? [])]);

    logActivity($wsId, $userId, 'added_resource', "Added $type: " . $body['title']);
    sendSuccess(['uuid' => $uuid, 'created' => true]);
}

// ============================================
// DELETE RESOURCE (POST)
// ============================================
function handleDeleteResource(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['uuid']);

    $db = getDB();
    $stmt = $db->prepare('
        SELECT sr.workspace_id, sr.uploaded_by, sr.title, wm.role
        FROM shared_resources sr
        JOIN workspace_members wm ON sr.workspace_id = wm.workspace_id AND wm.user_id = ?
        WHERE sr.uuid = ?
    ');
    $stmt->execute([$userId, $body['uuid']]);
    $r = $stmt->fetch();

    if (!$r) sendError('Resource not found or access denied', 404);
    if ($r['uploaded_by'] != $userId && !in_array($r['role'], ['owner', 'admin'])) {
        sendError('Only the uploader or admins can delete', 403);
    }

    $db->prepare('DELETE FROM shared_resources WHERE uuid = ?')->execute([$body['uuid']]);
    logActivity((int)$r['workspace_id'], $userId, 'deleted_resource', "Deleted: " . $r['title']);
    sendSuccess(['deleted' => true]);
}

// ============================================
// LIST AI KEYS (GET)
// ============================================
function handleListKeys(): void {
    requireMethod('GET');
    [$auth, $userId] = getAuthUser();
    $wsId = getQueryId();
    $member = requireWorkspaceMember($wsId, $userId);

    $canSee = (bool)$member['can_manage_keys'];
    $db = getDB();
    $stmt = $db->prepare('SELECT wak.*, u.display_name as adder FROM workspace_ai_keys wak LEFT JOIN users u ON wak.added_by = u.id WHERE wak.workspace_id = ? ORDER BY wak.provider');
    $stmt->execute([$wsId]);

    sendSuccess([
        'keys' => array_map(function($k) use ($canSee) {
            return [
                'id'           => (int)$k['id'],
                'provider'     => $k['provider'],
                'label'        => $k['label'],
                'key_preview'  => $canSee ? maskKey(decryptKey($k['api_key_encrypted'])) : '••••••••',
                'is_active'    => (bool)$k['is_active'],
                'usage_count'  => (int)$k['usage_count'],
                'last_used_at' => $k['last_used_at'],
                'added_by'     => $k['adder'] ?? 'Unknown',
                'created_at'   => $k['created_at'],
            ];
        }, $stmt->fetchAll()),
    ]);
}

// ============================================
// ADD AI KEY (POST)
// ============================================
function handleAddKey(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['workspace_id', 'provider', 'api_key']);
    $wsId = (int)$body['workspace_id'];
    requireWorkspaceMember($wsId, $userId, ['can_manage_keys']);

    $provider = $body['provider'];
    if (!in_array($provider, ['anthropic', 'openai', 'gemini', 'openrouter'])) sendError('Invalid provider', 400);

    $enc = encryptKey($body['api_key']);
    $label = trim($body['label'] ?? ucfirst($provider));

    $db = getDB();
    $db->prepare('
        INSERT INTO workspace_ai_keys (workspace_id, provider, api_key_encrypted, label, added_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE api_key_encrypted = VALUES(api_key_encrypted), label = VALUES(label), added_by = VALUES(added_by), is_active = 1
    ')->execute([$wsId, $provider, $enc, $label, $userId]);

    logActivity($wsId, $userId, 'added_key', "Added $provider key");
    sendSuccess(['added' => true]);
}

// ============================================
// DELETE AI KEY (POST)
// ============================================
function handleDeleteKey(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    requireFields($body, ['key_id']);

    $db = getDB();
    $stmt = $db->prepare('SELECT workspace_id FROM workspace_ai_keys WHERE id = ?');
    $stmt->execute([$body['key_id']]);
    $key = $stmt->fetch();
    if (!$key) sendError('Key not found', 404);

    requireWorkspaceMember((int)$key['workspace_id'], $userId, ['can_manage_keys']);

    $db->prepare('DELETE FROM workspace_ai_keys WHERE id = ?')->execute([$body['key_id']]);
    logActivity((int)$key['workspace_id'], $userId, 'removed_key', 'Removed an API key');
    sendSuccess(['deleted' => true]);
}

// ============================================
// ACTIVITY LOG (GET)
// ============================================
function handleActivity(): void {
    requireMethod('GET');
    [$auth, $userId] = getAuthUser();
    $wsId = getQueryId();
    requireWorkspaceMember($wsId, $userId);

    $limit = min((int)($_GET['limit'] ?? 50), 200);
    $db = getDB();
    $stmt = $db->prepare('
        SELECT wa.action, wa.detail, wa.created_at,
               u.display_name, u.email
        FROM workspace_activity wa
        LEFT JOIN users u ON wa.user_id = u.id
        WHERE wa.workspace_id = ?
        ORDER BY wa.created_at DESC
        LIMIT ?
    ');
    $stmt->execute([$wsId, $limit]);

    sendSuccess([
        'activity' => array_map(function($a) {
            return [
                'action'     => $a['action'],
                'detail'     => $a['detail'],
                'user'       => $a['display_name'] ?: ($a['email'] ?: 'System'),
                'created_at' => $a['created_at'],
            ];
        }, $stmt->fetchAll()),
    ]);
}

// ============================================
// SWITCH WORKSPACE (POST)
// ============================================
function handleSwitch(): void {
    requireMethod('POST');
    [$auth, $userId] = getAuthUser();
    $body = getJSONBody();
    $wsId = (int)($body['workspace_id'] ?? 0);

    if ($wsId === 0) {
        setActiveWorkspace($userId, null);
        sendSuccess(['switched' => true, 'workspace_id' => null, 'mode' => 'personal']);
        return;
    }

    requireWorkspaceMember($wsId, $userId);
    setActiveWorkspace($userId, $wsId);

    $db = getDB();
    $db->prepare('UPDATE workspace_members SET last_active_at = NOW() WHERE workspace_id = ? AND user_id = ?')->execute([$wsId, $userId]);

    sendSuccess(['switched' => true, 'workspace_id' => $wsId, 'mode' => 'workspace']);
}
