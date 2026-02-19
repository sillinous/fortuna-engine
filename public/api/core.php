<?php
/**
 * FORTUNA ENGINE - Core Bootstrap
 * Database connection, JWT handling, CORS, utilities
 */

require_once __DIR__ . '/config.php';

// ============================================
// ERROR HANDLING
// ============================================
if (APP_DEBUG) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(0);
    ini_set('display_errors', '0');
}

// ============================================
// CORS HANDLING
// ============================================
function handleCors(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    
    if (in_array($origin, ALLOWED_ORIGINS)) {
        header("Access-Control-Allow-Origin: $origin");
    }
    
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
    
    // Handle preflight
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

handleCors();
header('Content-Type: application/json; charset=utf-8');

// ============================================
// DATABASE CONNECTION
// ============================================
function getDB(): PDO {
    static $pdo = null;
    
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=' . DB_CHARSET;
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
            ]);
        } catch (PDOException $e) {
            sendError('Database connection failed', 500);
        }
    }
    
    return $pdo;
}

// ============================================
// RESPONSE HELPERS
// ============================================
function sendJSON(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function sendError(string $message, int $status = 400, ?string $code = null): void {
    $response = ['error' => true, 'message' => $message];
    if ($code) $response['code'] = $code;
    sendJSON($response, $status);
}

function sendSuccess(array $data = [], string $message = 'OK'): void {
    sendJSON(array_merge(['success' => true, 'message' => $message], $data));
}

// ============================================
// INPUT HELPERS
// ============================================
function getJSONBody(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function requireMethod(string ...$methods): void {
    if (!in_array($_SERVER['REQUEST_METHOD'], $methods)) {
        sendError('Method not allowed', 405);
    }
}

function requireFields(array $data, array $fields): void {
    foreach ($fields as $field) {
        if (!isset($data[$field]) || (is_string($data[$field]) && trim($data[$field]) === '')) {
            sendError("Missing required field: $field", 400, 'MISSING_FIELD');
        }
    }
}

function sanitizeEmail(string $email): string {
    return strtolower(trim(filter_var($email, FILTER_SANITIZE_EMAIL)));
}

function generateUUID(): string {
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // Version 4
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // Variant
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

// ============================================
// JWT IMPLEMENTATION (No external deps)
// ============================================
function base64UrlEncode(string $data): string {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function base64UrlDecode(string $data): string {
    $remainder = strlen($data) % 4;
    if ($remainder) {
        $data .= str_repeat('=', 4 - $remainder);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function jwtEncode(array $payload): string {
    $header = ['typ' => 'JWT', 'alg' => JWT_ALGORITHM];
    
    $segments = [
        base64UrlEncode(json_encode($header)),
        base64UrlEncode(json_encode($payload))
    ];
    
    $signingInput = implode('.', $segments);
    $signature = hash_hmac('sha256', $signingInput, JWT_SECRET, true);
    $segments[] = base64UrlEncode($signature);
    
    return implode('.', $segments);
}

function jwtDecode(string $token): ?array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    
    [$headerB64, $payloadB64, $signatureB64] = $parts;
    
    // Verify signature
    $signingInput = "$headerB64.$payloadB64";
    $expectedSig = base64UrlEncode(hash_hmac('sha256', $signingInput, JWT_SECRET, true));
    
    if (!hash_equals($expectedSig, $signatureB64)) return null;
    
    $payload = json_decode(base64UrlDecode($payloadB64), true);
    if (!$payload) return null;
    
    // Check expiration
    if (isset($payload['exp']) && $payload['exp'] < time()) return null;
    
    // Check issuer
    if (isset($payload['iss']) && $payload['iss'] !== JWT_ISSUER) return null;
    
    return $payload;
}

function createAccessToken(int $userId, string $uuid, string $email): string {
    return jwtEncode([
        'iss' => JWT_ISSUER,
        'sub' => $uuid,
        'uid' => $userId,
        'email' => $email,
        'type' => 'access',
        'iat' => time(),
        'exp' => time() + JWT_ACCESS_TTL
    ]);
}

function createRefreshToken(int $userId, string $uuid): string {
    return jwtEncode([
        'iss' => JWT_ISSUER,
        'sub' => $uuid,
        'uid' => $userId,
        'type' => 'refresh',
        'jti' => bin2hex(random_bytes(16)),
        'iat' => time(),
        'exp' => time() + JWT_REFRESH_TTL
    ]);
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
function requireAuth(): array {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    
    if (empty($authHeader)) {
        sendError('Authorization required', 401, 'AUTH_REQUIRED');
    }
    
    // Extract Bearer token
    if (!preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
        sendError('Invalid authorization format', 401, 'INVALID_AUTH');
    }
    
    $token = $matches[1];
    $payload = jwtDecode($token);
    
    if (!$payload) {
        sendError('Invalid or expired token', 401, 'TOKEN_EXPIRED');
    }
    
    if (($payload['type'] ?? '') !== 'access') {
        sendError('Invalid token type', 401, 'INVALID_TOKEN_TYPE');
    }
    
    return $payload;
}

// ============================================
// RATE LIMITING
// ============================================
function checkRateLimit(string $action, ?string $identifier = null, ?int $limit = null): void {
    $identifier = $identifier ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    
    $limits = [
        'login' => RATE_LIMIT_LOGIN,
        'register' => RATE_LIMIT_REGISTER,
        'api_call' => RATE_LIMIT_API,
        'ai_query' => RATE_LIMIT_AI
    ];
    
    $maxAttempts = $limit ?? ($limits[$action] ?? RATE_LIMIT_API);
    $db = getDB();
    $windowStart = date('Y-m-d H:i:s', time() - RATE_LIMIT_WINDOW);
    
    // Count recent attempts
    $stmt = $db->prepare(
        'SELECT COUNT(*) as cnt FROM rate_limits 
         WHERE identifier = ? AND action = ? AND window_start > ?'
    );
    $stmt->execute([$identifier, $action, $windowStart]);
    $count = (int)$stmt->fetch()['cnt'];
    
    if ($count >= $maxAttempts) {
        sendError('Too many requests. Please try again later.', 429, 'RATE_LIMITED');
    }
    
    // Record this attempt
    $stmt = $db->prepare(
        'INSERT INTO rate_limits (identifier, action) VALUES (?, ?)'
    );
    $stmt->execute([$identifier, $action]);
    
    // Lazy cleanup (1% chance per request)
    if (mt_rand(1, 100) === 1) {
        $db->exec("DELETE FROM rate_limits WHERE window_start < '$windowStart'");
    }
}

// ============================================
// SESSION MANAGEMENT
// ============================================
function storeRefreshToken(int $userId, string $refreshToken): void {
    $db = getDB();
    
    // Enforce max sessions
    $stmt = $db->prepare(
        'SELECT COUNT(*) as cnt FROM sessions WHERE user_id = ? AND revoked = 0 AND expires_at > NOW()'
    );
    $stmt->execute([$userId]);
    $activeSessions = (int)$stmt->fetch()['cnt'];
    
    if ($activeSessions >= MAX_SESSIONS_PER_USER) {
        // Revoke oldest session
        $stmt = $db->prepare(
            'UPDATE sessions SET revoked = 1 
             WHERE user_id = ? AND revoked = 0 
             ORDER BY created_at ASC LIMIT 1'
        );
        $stmt->execute([$userId]);
    }
    
    $stmt = $db->prepare(
        'INSERT INTO sessions (user_id, refresh_token, device_info, ip_address, expires_at) 
         VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $userId,
        hash('sha256', $refreshToken), // Store hashed
        $_SERVER['HTTP_USER_AGENT'] ?? null,
        $_SERVER['REMOTE_ADDR'] ?? null,
        date('Y-m-d H:i:s', time() + JWT_REFRESH_TTL)
    ]);
}

function validateRefreshToken(string $refreshToken): ?array {
    $payload = jwtDecode($refreshToken);
    if (!$payload || ($payload['type'] ?? '') !== 'refresh') return null;
    
    $db = getDB();
    $tokenHash = hash('sha256', $refreshToken);
    
    $stmt = $db->prepare(
        'SELECT id, user_id FROM sessions 
         WHERE refresh_token = ? AND revoked = 0 AND expires_at > NOW()'
    );
    $stmt->execute([$tokenHash]);
    $session = $stmt->fetch();
    
    if (!$session) return null;
    
    return [
        'session_id' => $session['id'],
        'user_id' => $session['user_id'],
        'payload' => $payload
    ];
}

function revokeRefreshToken(string $refreshToken): void {
    $db = getDB();
    $tokenHash = hash('sha256', $refreshToken);
    
    $stmt = $db->prepare('UPDATE sessions SET revoked = 1 WHERE refresh_token = ?');
    $stmt->execute([$tokenHash]);
}
