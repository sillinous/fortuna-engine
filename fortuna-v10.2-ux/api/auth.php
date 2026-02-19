<?php
/**
 * FORTUNA ENGINE - Auth API
 * 
 * Endpoints:
 *   POST /api/auth.php?action=register   - Create account
 *   POST /api/auth.php?action=login      - Sign in
 *   POST /api/auth.php?action=refresh    - Refresh access token
 *   POST /api/auth.php?action=logout     - Sign out (revoke refresh token)
 *   GET  /api/auth.php?action=me         - Get current user profile
 *   PUT  /api/auth.php?action=update     - Update profile/password
 */

require_once __DIR__ . '/core.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        handleRegister();
        break;
    case 'login':
        handleLogin();
        break;
    case 'refresh':
        handleRefresh();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'me':
        handleMe();
        break;
    case 'update':
        handleUpdate();
        break;
    default:
        sendError('Invalid action', 400);
}

// ============================================
// REGISTER
// ============================================
function handleRegister(): void {
    requireMethod('POST');
    checkRateLimit('register');
    
    $body = getJSONBody();
    requireFields($body, ['email', 'password']);
    
    $email = sanitizeEmail($body['email']);
    $password = $body['password'];
    $displayName = trim($body['display_name'] ?? '');
    
    // Validate email
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendError('Invalid email address', 400, 'INVALID_EMAIL');
    }
    
    // Validate password
    if (strlen($password) < MIN_PASSWORD_LENGTH) {
        sendError('Password must be at least ' . MIN_PASSWORD_LENGTH . ' characters', 400, 'WEAK_PASSWORD');
    }
    
    if (strlen($password) > 128) {
        sendError('Password too long', 400, 'PASSWORD_TOO_LONG');
    }
    
    $db = getDB();
    
    // Check if email already exists
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        sendError('An account with this email already exists', 409, 'EMAIL_EXISTS');
    }
    
    // Create user
    $uuid = generateUUID();
    $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);
    
    $stmt = $db->prepare(
        'INSERT INTO users (uuid, email, password_hash, display_name, last_login_at) 
         VALUES (?, ?, ?, ?, NOW())'
    );
    $stmt->execute([$uuid, $email, $passwordHash, $displayName ?: null]);
    $userId = (int)$db->lastInsertId();
    
    // Create empty state record
    $defaultState = json_encode([
        'profile' => [],
        'scenarios' => [],
        'version' => 1,
        'created_at' => date('c')
    ]);
    $stmt = $db->prepare(
        'INSERT INTO fortuna_states (user_id, state_data, state_version) VALUES (?, ?, 1)'
    );
    $stmt->execute([$userId, $defaultState]);
    
    // Generate tokens
    $accessToken = createAccessToken($userId, $uuid, $email);
    $refreshToken = createRefreshToken($userId, $uuid);
    storeRefreshToken($userId, $refreshToken);
    
    sendSuccess([
        'user' => [
            'uuid' => $uuid,
            'email' => $email,
            'display_name' => $displayName ?: null,
            'created_at' => date('c')
        ],
        'tokens' => [
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'expires_in' => JWT_ACCESS_TTL,
            'token_type' => 'Bearer'
        ]
    ], 'Account created successfully');
}

// ============================================
// LOGIN
// ============================================
function handleLogin(): void {
    requireMethod('POST');
    checkRateLimit('login');
    
    $body = getJSONBody();
    requireFields($body, ['email', 'password']);
    
    $email = sanitizeEmail($body['email']);
    $password = $body['password'];
    
    $db = getDB();
    
    $stmt = $db->prepare(
        'SELECT id, uuid, email, password_hash, display_name, is_active, created_at 
         FROM users WHERE email = ?'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    
    if (!$user || !password_verify($password, $user['password_hash'])) {
        sendError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }
    
    if (!$user['is_active']) {
        sendError('Account is deactivated', 403, 'ACCOUNT_DISABLED');
    }
    
    // Update last login
    $stmt = $db->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?');
    $stmt->execute([$user['id']]);
    
    // Generate tokens
    $accessToken = createAccessToken($user['id'], $user['uuid'], $user['email']);
    $refreshToken = createRefreshToken($user['id'], $user['uuid']);
    storeRefreshToken($user['id'], $refreshToken);
    
    sendSuccess([
        'user' => [
            'uuid' => $user['uuid'],
            'email' => $user['email'],
            'display_name' => $user['display_name'],
            'created_at' => $user['created_at']
        ],
        'tokens' => [
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'expires_in' => JWT_ACCESS_TTL,
            'token_type' => 'Bearer'
        ]
    ], 'Logged in successfully');
}

// ============================================
// REFRESH TOKEN
// ============================================
function handleRefresh(): void {
    requireMethod('POST');
    
    $body = getJSONBody();
    requireFields($body, ['refresh_token']);
    
    $oldRefreshToken = $body['refresh_token'];
    $session = validateRefreshToken($oldRefreshToken);
    
    if (!$session) {
        sendError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN');
    }
    
    $db = getDB();
    
    // Get user details
    $stmt = $db->prepare('SELECT id, uuid, email, is_active FROM users WHERE id = ?');
    $stmt->execute([$session['user_id']]);
    $user = $stmt->fetch();
    
    if (!$user || !$user['is_active']) {
        sendError('Account not found or disabled', 401, 'ACCOUNT_DISABLED');
    }
    
    // Revoke old refresh token (rotation)
    revokeRefreshToken($oldRefreshToken);
    
    // Issue new tokens
    $accessToken = createAccessToken($user['id'], $user['uuid'], $user['email']);
    $refreshToken = createRefreshToken($user['id'], $user['uuid']);
    storeRefreshToken($user['id'], $refreshToken);
    
    sendSuccess([
        'tokens' => [
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'expires_in' => JWT_ACCESS_TTL,
            'token_type' => 'Bearer'
        ]
    ], 'Token refreshed');
}

// ============================================
// LOGOUT
// ============================================
function handleLogout(): void {
    requireMethod('POST');
    
    $body = getJSONBody();
    $refreshToken = $body['refresh_token'] ?? null;
    
    if ($refreshToken) {
        revokeRefreshToken($refreshToken);
    }
    
    // Optionally revoke all sessions
    if (!empty($body['all_devices'])) {
        $auth = requireAuth();
        $db = getDB();
        $stmt = $db->prepare('UPDATE sessions SET revoked = 1 WHERE user_id = ?');
        $stmt->execute([$auth['uid']]);
    }
    
    sendSuccess([], 'Logged out successfully');
}

// ============================================
// GET CURRENT USER
// ============================================
function handleMe(): void {
    requireMethod('GET');
    $auth = requireAuth();
    
    $db = getDB();
    $stmt = $db->prepare(
        'SELECT uuid, email, display_name, email_verified, created_at, last_login_at, updated_at 
         FROM users WHERE id = ?'
    );
    $stmt->execute([$auth['uid']]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendError('User not found', 404);
    }
    
    // Get state metadata
    $stmt = $db->prepare(
        'SELECT state_version, checksum, last_synced_at FROM fortuna_states WHERE user_id = ?'
    );
    $stmt->execute([$auth['uid']]);
    $stateMeta = $stmt->fetch();
    
    sendSuccess([
        'user' => $user,
        'state_meta' => $stateMeta ?: null
    ]);
}

// ============================================
// UPDATE PROFILE / PASSWORD
// ============================================
function handleUpdate(): void {
    requireMethod('PUT');
    $auth = requireAuth();
    
    $body = getJSONBody();
    $db = getDB();
    
    $updates = [];
    $params = [];
    
    // Update display name
    if (isset($body['display_name'])) {
        $updates[] = 'display_name = ?';
        $params[] = trim($body['display_name']) ?: null;
    }
    
    // Update email
    if (isset($body['email'])) {
        $newEmail = sanitizeEmail($body['email']);
        if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
            sendError('Invalid email address', 400, 'INVALID_EMAIL');
        }
        // Check uniqueness
        $stmt = $db->prepare('SELECT id FROM users WHERE email = ? AND id != ?');
        $stmt->execute([$newEmail, $auth['uid']]);
        if ($stmt->fetch()) {
            sendError('Email already in use', 409, 'EMAIL_EXISTS');
        }
        $updates[] = 'email = ?';
        $params[] = $newEmail;
    }
    
    // Update password
    if (isset($body['new_password'])) {
        requireFields($body, ['current_password']);
        
        // Verify current password
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$auth['uid']]);
        $user = $stmt->fetch();
        
        if (!password_verify($body['current_password'], $user['password_hash'])) {
            sendError('Current password is incorrect', 401, 'WRONG_PASSWORD');
        }
        
        if (strlen($body['new_password']) < MIN_PASSWORD_LENGTH) {
            sendError('New password must be at least ' . MIN_PASSWORD_LENGTH . ' characters', 400, 'WEAK_PASSWORD');
        }
        
        $updates[] = 'password_hash = ?';
        $params[] = password_hash($body['new_password'], PASSWORD_BCRYPT, ['cost' => BCRYPT_COST]);
    }
    
    if (empty($updates)) {
        sendError('No fields to update', 400);
    }
    
    $params[] = $auth['uid'];
    $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?';
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    sendSuccess([], 'Profile updated successfully');
}
