<?php
/**
 * FORTUNA ENGINE - AI Provider Configuration
 * 
 * Add your API keys for whichever providers you want to use.
 * Leave a key empty to disable that provider.
 * At least ONE provider must be configured for the AI Advisor to work.
 * 
 * Get API keys:
 *   Anthropic:   https://console.anthropic.com/settings/keys
 *   OpenAI:      https://platform.openai.com/api-keys
 *   Gemini:      https://aistudio.google.com/app/apikey
 *   OpenRouter:  https://openrouter.ai/keys
 */

// ============================================
// PROVIDER CONFIGURATIONS
// ============================================
define('AI_PROVIDERS', [

    'anthropic' => [
        'api_key' => '',  // sk-ant-xxxxx
        'default_model' => 'claude-sonnet-4-20250514',
        'models' => [
            'claude-sonnet-4-20250514',
            'claude-haiku-4-5-20251001',
        ],
    ],

    'openai' => [
        'api_key' => '',  // sk-xxxxx
        'default_model' => 'gpt-4o',
        'models' => [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4-turbo',
            'o3-mini',
        ],
    ],

    'gemini' => [
        'api_key' => '',  // AIzaSyxxxxx
        'default_model' => 'gemini-2.0-flash',
        'models' => [
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite',
            'gemini-1.5-pro',
            'gemini-1.5-flash',
        ],
    ],

    'openrouter' => [
        'api_key' => '',  // sk-or-xxxxx
        'default_model' => 'anthropic/claude-sonnet-4',
        'models' => [
            'anthropic/claude-sonnet-4',
            'anthropic/claude-haiku-4',
            'openai/gpt-4o',
            'openai/gpt-4o-mini',
            'google/gemini-2.0-flash-001',
            'deepseek/deepseek-chat-v3-0324',
            'meta-llama/llama-4-maverick',
            'mistralai/mistral-large-2411',
            'qwen/qwen-2.5-72b-instruct',
        ],
        'site_url' => 'https://fortuna.unlessrx.com',
        'site_name' => 'Fortuna Engine',
    ],

]);

// ============================================
// DEFAULT PROVIDER
// ============================================
// Which provider to use when the user doesn't specify one.
// Must match one of the keys above that has an API key set.
define('AI_DEFAULT_PROVIDER', 'openrouter');

// ============================================
// ALLOW CLIENT-SIDE KEYS
// ============================================
// If true, users can enter their own API keys in the browser
// and make direct API calls without going through this proxy.
// Set to false to force all traffic through the server.
define('AI_ALLOW_CLIENT_KEYS', true);
