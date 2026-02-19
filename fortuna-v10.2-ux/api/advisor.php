<?php
/**
 * FORTUNA ENGINE - AI Advisor Proxy
 * 
 * Routes AI requests to the configured provider. API keys stay server-side.
 * 
 * Supports:
 *   - Anthropic (Claude)
 *   - OpenAI (GPT-4, etc.)
 *   - Google Gemini
 *   - OpenRouter (any model)
 * 
 * POST /api/advisor.php                  - Send message to AI
 * GET  /api/advisor.php?action=providers - List available providers
 */

require_once __DIR__ . '/core.php';
require_once __DIR__ . '/ai-config.php';

$action = $_GET['action'] ?? '';

if ($action === 'providers') {
    handleListProviders();
} else {
    handleChat();
}

// ============================================
// LIST AVAILABLE PROVIDERS
// ============================================
function handleListProviders(): void {
    requireMethod('GET');
    $auth = requireAuth();
    
    $providers = [];
    
    foreach (AI_PROVIDERS as $id => $config) {
        if (!empty($config['api_key'])) {
            $providers[] = [
                'id' => $id,
                'name' => getProviderDisplayName($id),
                'models' => $config['models'],
                'default_model' => $config['default_model'],
            ];
        }
    }
    
    sendSuccess([
        'providers' => $providers,
        'default_provider' => AI_DEFAULT_PROVIDER,
        'client_keys_allowed' => AI_ALLOW_CLIENT_KEYS,
    ]);
}

function getProviderDisplayName(string $id): string {
    $names = [
        'anthropic' => 'Anthropic (Claude)',
        'openai' => 'OpenAI (GPT)',
        'gemini' => 'Google Gemini',
        'openrouter' => 'OpenRouter',
    ];
    return $names[$id] ?? ucfirst($id);
}

// ============================================
// PROVIDER RESOLUTION (workspace keys → server config)
// ============================================
function resolveProviderConfig(string $provider, ?int $workspaceId, string $userUuid): ?array {
    // 1. Try workspace shared keys
    if ($workspaceId) {
        try {
            $db = getDB();
            // Verify user has advisor permission in this workspace
            $stmt = $db->prepare('
                SELECT wm.can_use_advisor FROM workspace_members wm
                JOIN users u ON wm.user_id = u.id
                WHERE wm.workspace_id = ? AND u.uuid = ?
            ');
            $stmt->execute([$workspaceId, $userUuid]);
            $member = $stmt->fetch();
            
            if ($member && $member['can_use_advisor']) {
                $stmt = $db->prepare('SELECT * FROM workspace_ai_keys WHERE workspace_id = ? AND provider = ? AND is_active = 1');
                $stmt->execute([$workspaceId, $provider]);
                $wsKey = $stmt->fetch();
                
                if ($wsKey) {
                    $secret = defined('JWT_SECRET') ? JWT_SECRET : 'fortuna-default-key';
                    $data = base64_decode($wsKey['api_key_encrypted']);
                    $parts = explode('::', $data, 2);
                    $decrypted = (count($parts) === 2) ? openssl_decrypt($parts[1], 'aes-256-cbc', $secret, 0, $parts[0]) : '';
                    
                    if ($decrypted) {
                        // Update usage stats
                        $stmt = $db->prepare('UPDATE workspace_ai_keys SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = ?');
                        $stmt->execute([$wsKey['id']]);
                        
                        // Use server config's model list but workspace's key
                        $serverConfig = AI_PROVIDERS[$provider] ?? [];
                        return [
                            'api_key' => $decrypted,
                            'default_model' => $serverConfig['default_model'] ?? getDefaultModel($provider),
                            'models' => $serverConfig['models'] ?? getDefaultModels($provider),
                            'source' => 'workspace',
                        ];
                    }
                }
            }
        } catch (\Exception $e) { /* fall through to server config */ }
    }
    
    // 2. Fall back to server config
    if (isset(AI_PROVIDERS[$provider]) && !empty(AI_PROVIDERS[$provider]['api_key'])) {
        return array_merge(AI_PROVIDERS[$provider], ['source' => 'server']);
    }
    
    return null;
}

function getDefaultModel(string $provider): string {
    $defaults = [
        'anthropic' => 'claude-sonnet-4-20250514',
        'openai' => 'gpt-4o',
        'gemini' => 'gemini-2.0-flash',
        'openrouter' => 'anthropic/claude-sonnet-4',
    ];
    return $defaults[$provider] ?? '';
}

function getDefaultModels(string $provider): array {
    $models = [
        'anthropic' => ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
        'openai' => ['gpt-4o', 'gpt-4o-mini'],
        'gemini' => ['gemini-2.0-flash', 'gemini-1.5-pro'],
        'openrouter' => ['anthropic/claude-sonnet-4', 'openai/gpt-4o'],
    ];
    return $models[$provider] ?? [];
}

// ============================================
// CHAT
// ============================================
function handleChat(): void {
    requireMethod('POST');
    $auth = requireAuth();
    checkRateLimit('ai_query', $auth['sub']);
    
    $body = getJSONBody();
    requireFields($body, ['messages']);
    
    $messages = $body['messages'];
    $system = $body['system'] ?? '';
    $provider = $body['provider'] ?? AI_DEFAULT_PROVIDER;
    $model = $body['model'] ?? null;
    $maxTokens = min((int)($body['max_tokens'] ?? 4000), 8000);
    $workspaceId = $body['workspace_id'] ?? null;
    
    // Try to resolve API key: workspace shared key → server config
    $config = resolveProviderConfig($provider, $workspaceId, $auth['sub']);
    
    if (!$config) {
        sendError("Provider '$provider' is not configured. Add a key in workspace settings or server config.", 400, 'INVALID_PROVIDER');
    }
    
    $model = $model ?? $config['default_model'];
    
    // Validate model is in allowed list
    if (!in_array($model, $config['models'])) {
        $model = $config['default_model'];
    }
    
    // Route to provider
    switch ($provider) {
        case 'anthropic':
            $result = callAnthropic($config, $model, $messages, $system, $maxTokens);
            break;
        case 'openai':
            $result = callOpenAI($config, $model, $messages, $system, $maxTokens);
            break;
        case 'gemini':
            $result = callGemini($config, $model, $messages, $system, $maxTokens);
            break;
        case 'openrouter':
            $result = callOpenRouter($config, $model, $messages, $system, $maxTokens);
            break;
        default:
            sendError('Unknown provider', 400);
    }
    
    if (!$result['success']) {
        sendError($result['error'] ?? 'AI provider error', 502, 'PROVIDER_ERROR');
    }
    
    sendSuccess([
        'content' => $result['content'],
        'provider' => $provider,
        'model' => $model,
        'usage' => $result['usage'] ?? null,
    ]);
}

// ============================================
// ANTHROPIC (Claude)
// ============================================
function callAnthropic(array $config, string $model, array $messages, string $system, int $maxTokens): array {
    $payload = [
        'model' => $model,
        'max_tokens' => $maxTokens,
        'messages' => $messages,
    ];
    if (!empty($system)) {
        $payload['system'] = $system;
    }
    
    $response = httpPost('https://api.anthropic.com/v1/messages', $payload, [
        'x-api-key: ' . $config['api_key'],
        'anthropic-version: 2023-06-01',
        'Content-Type: application/json',
    ]);
    
    if (!$response['ok']) {
        return ['success' => false, 'error' => $response['error'] ?? 'Anthropic API error'];
    }
    
    $data = $response['data'];
    $text = '';
    foreach (($data['content'] ?? []) as $block) {
        if ($block['type'] === 'text') $text .= $block['text'];
    }
    
    return [
        'success' => true,
        'content' => [['type' => 'text', 'text' => $text]],
        'usage' => $data['usage'] ?? null,
    ];
}

// ============================================
// OPENAI (GPT)
// ============================================
function callOpenAI(array $config, string $model, array $messages, string $system, int $maxTokens): array {
    $apiMessages = [];
    if (!empty($system)) {
        $apiMessages[] = ['role' => 'system', 'content' => $system];
    }
    foreach ($messages as $msg) {
        $apiMessages[] = ['role' => $msg['role'], 'content' => $msg['content']];
    }
    
    $payload = [
        'model' => $model,
        'max_tokens' => $maxTokens,
        'messages' => $apiMessages,
        'temperature' => 0.7,
    ];
    
    $response = httpPost('https://api.openai.com/v1/chat/completions', $payload, [
        'Authorization: Bearer ' . $config['api_key'],
        'Content-Type: application/json',
    ]);
    
    if (!$response['ok']) {
        return ['success' => false, 'error' => $response['error'] ?? 'OpenAI API error'];
    }
    
    $data = $response['data'];
    $text = $data['choices'][0]['message']['content'] ?? '';
    
    return [
        'success' => true,
        'content' => [['type' => 'text', 'text' => $text]],
        'usage' => $data['usage'] ?? null,
    ];
}

// ============================================
// GOOGLE GEMINI
// ============================================
function callGemini(array $config, string $model, array $messages, string $system, int $maxTokens): array {
    $contents = [];
    foreach ($messages as $msg) {
        $contents[] = [
            'role' => $msg['role'] === 'assistant' ? 'model' : 'user',
            'parts' => [['text' => $msg['content']]],
        ];
    }
    
    $payload = [
        'contents' => $contents,
        'generationConfig' => [
            'maxOutputTokens' => $maxTokens,
            'temperature' => 0.7,
        ],
    ];
    if (!empty($system)) {
        $payload['systemInstruction'] = ['parts' => [['text' => $system]]];
    }
    
    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key=" . $config['api_key'];
    
    $response = httpPost($url, $payload, ['Content-Type: application/json']);
    
    if (!$response['ok']) {
        return ['success' => false, 'error' => $response['error'] ?? 'Gemini API error'];
    }
    
    $data = $response['data'];
    $text = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    
    $usage = null;
    if (isset($data['usageMetadata'])) {
        $usage = [
            'input_tokens' => $data['usageMetadata']['promptTokenCount'] ?? 0,
            'output_tokens' => $data['usageMetadata']['candidatesTokenCount'] ?? 0,
        ];
    }
    
    return ['success' => true, 'content' => [['type' => 'text', 'text' => $text]], 'usage' => $usage];
}

// ============================================
// OPENROUTER
// ============================================
function callOpenRouter(array $config, string $model, array $messages, string $system, int $maxTokens): array {
    $apiMessages = [];
    if (!empty($system)) {
        $apiMessages[] = ['role' => 'system', 'content' => $system];
    }
    foreach ($messages as $msg) {
        $apiMessages[] = ['role' => $msg['role'], 'content' => $msg['content']];
    }
    
    $payload = [
        'model' => $model,
        'max_tokens' => $maxTokens,
        'messages' => $apiMessages,
    ];
    
    $headers = [
        'Authorization: Bearer ' . $config['api_key'],
        'Content-Type: application/json',
    ];
    if (!empty($config['site_url'])) $headers[] = 'HTTP-Referer: ' . $config['site_url'];
    if (!empty($config['site_name'])) $headers[] = 'X-Title: ' . $config['site_name'];
    
    $response = httpPost('https://openrouter.ai/api/v1/chat/completions', $payload, $headers);
    
    if (!$response['ok']) {
        return ['success' => false, 'error' => $response['error'] ?? 'OpenRouter API error'];
    }
    
    $data = $response['data'];
    $text = $data['choices'][0]['message']['content'] ?? '';
    
    return [
        'success' => true,
        'content' => [['type' => 'text', 'text' => $text]],
        'usage' => $data['usage'] ?? null,
    ];
}

// ============================================
// HTTP HELPER
// ============================================
function httpPost(string $url, array $payload, array $headers): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    
    $responseBody = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    
    if ($curlError) {
        return ['ok' => false, 'error' => "Connection error: $curlError"];
    }
    
    $data = json_decode($responseBody, true);
    
    if ($httpCode >= 400) {
        $errorMsg = 'API error ' . $httpCode;
        if (isset($data['error']['message'])) {
            $errorMsg = $data['error']['message'];
        } elseif (isset($data['error']) && is_string($data['error'])) {
            $errorMsg = $data['error'];
        }
        return ['ok' => false, 'error' => $errorMsg, 'status' => $httpCode];
    }
    
    return ['ok' => true, 'data' => $data, 'status' => $httpCode];
}
