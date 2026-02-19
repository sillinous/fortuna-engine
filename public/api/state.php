<?php
/**
 * FORTUNA ENGINE - State Sync API
 * 
 * This is the core data persistence endpoint that replaces localStorage.
 * Handles bidirectional sync with conflict detection.
 * 
 * Endpoints:
 *   GET    /api/state.php              - Load current state
 *   POST   /api/state.php              - Save state (with conflict detection)
 *   GET    /api/state.php?action=meta   - Get state metadata only (version, checksum, last sync)
 *   POST   /api/state.php?action=merge  - Smart merge local + remote state
 *   GET    /api/state.php?action=snapshots - List snapshots
 *   POST   /api/state.php?action=snapshot  - Create manual snapshot
 *   GET    /api/state.php?action=restore&id=X - Restore from snapshot
 */

require_once __DIR__ . '/core.php';

$auth = requireAuth();
checkRateLimit('api_call', $auth['sub']);

$action = $_GET['action'] ?? '';

switch ($action) {
    case '':
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            handleLoadState($auth);
        } else {
            handleSaveState($auth);
        }
        break;
    case 'meta':
        handleStateMeta($auth);
        break;
    case 'merge':
        handleMergeState($auth);
        break;
    case 'snapshots':
        handleListSnapshots($auth);
        break;
    case 'snapshot':
        handleCreateSnapshot($auth);
        break;
    case 'restore':
        handleRestoreSnapshot($auth);
        break;
    default:
        sendError('Invalid action', 400);
}

// ============================================
// LOAD STATE
// ============================================
function handleLoadState(array $auth): void {
    requireMethod('GET');
    
    $db = getDB();
    $stmt = $db->prepare(
        'SELECT state_data, state_version, checksum, last_synced_at 
         FROM fortuna_states WHERE user_id = ?'
    );
    $stmt->execute([$auth['uid']]);
    $row = $stmt->fetch();
    
    if (!$row) {
        // No state yet - return empty
        sendSuccess([
            'state' => null,
            'version' => 0,
            'checksum' => null,
            'last_synced_at' => null,
            'is_new' => true
        ]);
    }
    
    sendSuccess([
        'state' => json_decode($row['state_data'], true),
        'version' => (int)$row['state_version'],
        'checksum' => $row['checksum'],
        'last_synced_at' => $row['last_synced_at']
    ]);
}

// ============================================
// SAVE STATE
// ============================================
function handleSaveState(array $auth): void {
    requireMethod('POST');
    
    $body = getJSONBody();
    requireFields($body, ['state']);
    
    $stateJSON = json_encode($body['state'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    
    // Size check
    if (strlen($stateJSON) > MAX_STATE_SIZE) {
        $sizeMB = round(strlen($stateJSON) / 1048576, 2);
        $maxMB = round(MAX_STATE_SIZE / 1048576, 2);
        sendError("State too large ({$sizeMB}MB). Maximum is {$maxMB}MB.", 413, 'STATE_TOO_LARGE');
    }
    
    $newChecksum = hash('sha256', $stateJSON);
    $clientVersion = isset($body['expected_version']) ? (int)$body['expected_version'] : null;
    $forceOverwrite = !empty($body['force']);
    
    $db = getDB();
    
    // Get current state
    $stmt = $db->prepare(
        'SELECT id, state_version, checksum FROM fortuna_states WHERE user_id = ?'
    );
    $stmt->execute([$auth['uid']]);
    $current = $stmt->fetch();
    
    if ($current) {
        $currentVersion = (int)$current['state_version'];
        
        // Conflict detection (if client sends expected version)
        if ($clientVersion !== null && $clientVersion !== $currentVersion && !$forceOverwrite) {
            sendError(
                'State conflict: your version is ' . $clientVersion . ' but server has version ' . $currentVersion,
                409,
                'STATE_CONFLICT'
            );
        }
        
        // Skip if identical
        if ($current['checksum'] === $newChecksum) {
            sendSuccess([
                'version' => $currentVersion,
                'checksum' => $newChecksum,
                'skipped' => true
            ], 'State unchanged');
        }
        
        $newVersion = $currentVersion + 1;
        
        // Auto-snapshot every N saves
        if ($newVersion % STATE_SNAPSHOT_INTERVAL === 0) {
            createAutoSnapshot($db, $auth['uid'], $currentVersion);
        }
        
        // Update
        $stmt = $db->prepare(
            'UPDATE fortuna_states 
             SET state_data = ?, state_version = ?, checksum = ?, last_synced_at = NOW()
             WHERE user_id = ?'
        );
        $stmt->execute([$stateJSON, $newVersion, $newChecksum, $auth['uid']]);
        
    } else {
        // First save
        $newVersion = 1;
        $stmt = $db->prepare(
            'INSERT INTO fortuna_states (user_id, state_data, state_version, checksum) 
             VALUES (?, ?, 1, ?)'
        );
        $stmt->execute([$auth['uid'], $stateJSON, $newChecksum]);
    }
    
    sendSuccess([
        'version' => $newVersion,
        'checksum' => $newChecksum,
        'synced_at' => date('c')
    ], 'State saved');
}

// ============================================
// STATE METADATA ONLY
// ============================================
function handleStateMeta(array $auth): void {
    requireMethod('GET');
    
    $db = getDB();
    $stmt = $db->prepare(
        'SELECT state_version, checksum, last_synced_at FROM fortuna_states WHERE user_id = ?'
    );
    $stmt->execute([$auth['uid']]);
    $row = $stmt->fetch();
    
    sendSuccess([
        'version' => $row ? (int)$row['state_version'] : 0,
        'checksum' => $row['checksum'] ?? null,
        'last_synced_at' => $row['last_synced_at'] ?? null
    ]);
}

// ============================================
// SMART MERGE (for initial sync after login)
// ============================================
function handleMergeState(array $auth): void {
    requireMethod('POST');
    
    $body = getJSONBody();
    requireFields($body, ['local_state']);
    
    $db = getDB();
    $stmt = $db->prepare(
        'SELECT state_data, state_version, last_synced_at FROM fortuna_states WHERE user_id = ?'
    );
    $stmt->execute([$auth['uid']]);
    $remote = $stmt->fetch();
    
    $localState = $body['local_state'];
    $localTimestamp = $body['local_timestamp'] ?? null;
    
    // If no remote state, local wins
    if (!$remote || empty(json_decode($remote['state_data'], true)['profile'])) {
        // Save local as remote
        $stateJSON = json_encode($localState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $checksum = hash('sha256', $stateJSON);
        
        if ($remote) {
            $stmt = $db->prepare(
                'UPDATE fortuna_states SET state_data = ?, state_version = state_version + 1, checksum = ? WHERE user_id = ?'
            );
            $stmt->execute([$stateJSON, $checksum, $auth['uid']]);
        } else {
            $stmt = $db->prepare(
                'INSERT INTO fortuna_states (user_id, state_data, state_version, checksum) VALUES (?, ?, 1, ?)'
            );
            $stmt->execute([$auth['uid'], $stateJSON, $checksum]);
        }
        
        sendSuccess([
            'resolution' => 'local_wins',
            'state' => $localState,
            'version' => ($remote ? (int)$remote['state_version'] + 1 : 1),
            'message' => 'Local data saved to cloud (no remote data existed)'
        ]);
    }
    
    $remoteState = json_decode($remote['state_data'], true);
    
    // If no meaningful local state, remote wins
    if (empty($localState) || empty($localState['profile'] ?? null)) {
        sendSuccess([
            'resolution' => 'remote_wins',
            'state' => $remoteState,
            'version' => (int)$remote['state_version'],
            'message' => 'Cloud data loaded (no local data to merge)'
        ]);
    }
    
    // Both exist - compare timestamps
    $remoteTime = strtotime($remote['last_synced_at']);
    $localTime = $localTimestamp ? strtotime($localTimestamp) : 0;
    
    // Deep merge: take the more complete / newer data
    $merged = deepMergeStates($localState, $remoteState, $localTime > $remoteTime);
    
    // Save merged result
    $stateJSON = json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $checksum = hash('sha256', $stateJSON);
    $newVersion = (int)$remote['state_version'] + 1;
    
    // Snapshot before merge
    createAutoSnapshot($db, $auth['uid'], (int)$remote['state_version'], 'pre_merge');
    
    $stmt = $db->prepare(
        'UPDATE fortuna_states SET state_data = ?, state_version = ?, checksum = ? WHERE user_id = ?'
    );
    $stmt->execute([$stateJSON, $newVersion, $checksum, $auth['uid']]);
    
    sendSuccess([
        'resolution' => 'merged',
        'state' => $merged,
        'version' => $newVersion,
        'message' => 'Local and cloud data merged'
    ]);
}

/**
 * Deep merge two state objects
 * Strategy: take arrays from whichever has more items, scalars from $preferred
 */
function deepMergeStates(array $local, array $remote, bool $localPreferred): array {
    $preferred = $localPreferred ? $local : $remote;
    $secondary = $localPreferred ? $remote : $local;
    $merged = [];
    
    $allKeys = array_unique(array_merge(array_keys($local), array_keys($remote)));
    
    foreach ($allKeys as $key) {
        $inLocal = array_key_exists($key, $local);
        $inRemote = array_key_exists($key, $remote);
        
        if ($inLocal && !$inRemote) {
            $merged[$key] = $local[$key];
        } elseif (!$inLocal && $inRemote) {
            $merged[$key] = $remote[$key];
        } elseif (is_array($local[$key]) && is_array($remote[$key])) {
            // Both are arrays
            if (array_keys($local[$key]) === range(0, count($local[$key]) - 1)) {
                // Indexed array - take the longer one (more scenarios, more history)
                $merged[$key] = count($local[$key]) >= count($remote[$key]) 
                    ? $local[$key] : $remote[$key];
            } else {
                // Associative array - recurse
                $merged[$key] = deepMergeStates($local[$key], $remote[$key], $localPreferred);
            }
        } else {
            // Scalar - take preferred
            $merged[$key] = $preferred[$key] ?? $secondary[$key];
        }
    }
    
    return $merged;
}

// ============================================
// SNAPSHOTS
// ============================================
function handleListSnapshots(array $auth): void {
    requireMethod('GET');
    
    $db = getDB();
    $stmt = $db->prepare(
        'SELECT id, state_version, snapshot_reason, created_at 
         FROM state_snapshots WHERE user_id = ? 
         ORDER BY created_at DESC LIMIT 20'
    );
    $stmt->execute([$auth['uid']]);
    $snapshots = $stmt->fetchAll();
    
    sendSuccess(['snapshots' => $snapshots]);
}

function handleCreateSnapshot(array $auth): void {
    requireMethod('POST');
    
    $db = getDB();
    $stmt = $db->prepare('SELECT state_data, state_version FROM fortuna_states WHERE user_id = ?');
    $stmt->execute([$auth['uid']]);
    $current = $stmt->fetch();
    
    if (!$current) {
        sendError('No state to snapshot', 404);
    }
    
    $body = getJSONBody();
    $reason = $body['reason'] ?? 'manual';
    
    createAutoSnapshot($db, $auth['uid'], (int)$current['state_version'], $reason);
    
    sendSuccess([], 'Snapshot created');
}

function handleRestoreSnapshot(array $auth): void {
    requireMethod('GET');
    
    $snapshotId = (int)($_GET['id'] ?? 0);
    if ($snapshotId <= 0) sendError('Invalid snapshot ID', 400);
    
    $db = getDB();
    
    // Get snapshot (ensure it belongs to this user)
    $stmt = $db->prepare(
        'SELECT state_data, state_version FROM state_snapshots WHERE id = ? AND user_id = ?'
    );
    $stmt->execute([$snapshotId, $auth['uid']]);
    $snapshot = $stmt->fetch();
    
    if (!$snapshot) {
        sendError('Snapshot not found', 404);
    }
    
    // Snapshot current state before restoring
    createAutoSnapshot($db, $auth['uid'], 0, 'pre_restore');
    
    // Restore
    $checksum = hash('sha256', $snapshot['state_data']);
    $stmt = $db->prepare(
        'UPDATE fortuna_states 
         SET state_data = ?, state_version = state_version + 1, checksum = ?
         WHERE user_id = ?'
    );
    $stmt->execute([$snapshot['state_data'], $checksum, $auth['uid']]);
    
    sendSuccess([
        'state' => json_decode($snapshot['state_data'], true),
        'restored_from_version' => (int)$snapshot['state_version']
    ], 'State restored from snapshot');
}

// ============================================
// HELPER
// ============================================
function createAutoSnapshot(PDO $db, int $userId, int $version, string $reason = 'auto'): void {
    // Get current state
    $stmt = $db->prepare('SELECT state_data FROM fortuna_states WHERE user_id = ?');
    $stmt->execute([$userId]);
    $current = $stmt->fetch();
    if (!$current) return;
    
    // Enforce snapshot limit
    $stmt = $db->prepare('SELECT COUNT(*) as cnt FROM state_snapshots WHERE user_id = ?');
    $stmt->execute([$userId]);
    $count = (int)$stmt->fetch()['cnt'];
    
    if ($count >= MAX_SNAPSHOTS_PER_USER) {
        // Delete oldest
        $stmt = $db->prepare(
            'DELETE FROM state_snapshots WHERE user_id = ? ORDER BY created_at ASC LIMIT 1'
        );
        $stmt->execute([$userId]);
    }
    
    $stmt = $db->prepare(
        'INSERT INTO state_snapshots (user_id, state_data, state_version, snapshot_reason) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$userId, $current['state_data'], $version, $reason]);
}
