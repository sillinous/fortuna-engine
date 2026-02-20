/**
 * Fortuna Engine — Multi-Provider AI Client
 * 
 * Supports Anthropic, OpenAI, Google Gemini, and OpenRouter.
 * Two modes:
 *   1. Server proxy (keys on server) — preferred, secure
 *   2. Direct browser calls (user enters own keys) — fallback
 */

// ============================================
//  TYPES
// ============================================

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'openrouter'

export interface ProviderConfig {
  id: ProviderId
  name: string
  models: string[]
  defaultModel: string
}

export interface AISettings {
  mode: 'proxy' | 'direct'          // proxy = server keys, direct = browser keys
  provider: ProviderId
  model: string
  // Client-side keys (only used in 'direct' mode)
  clientKeys: Partial<Record<ProviderId, string>>
}

export interface ChatMessagePart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string // e.g., "data:image/jpeg;base64,..."
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string | ChatMessagePart[]
}

export interface AIResponse {
  text: string
  provider: ProviderId
  model: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

// ============================================
//  DEFAULT PROVIDERS (for direct mode)
// ============================================

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT)',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    defaultModel: 'gpt-4o',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    defaultModel: 'gemini-2.0-flash',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    models: [
      'anthropic/claude-sonnet-4',
      'anthropic/claude-haiku-4',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-001',
      'deepseek/deepseek-chat-v3-0324',
      'meta-llama/llama-4-maverick',
      'mistralai/mistral-large-2411',
    ],
    defaultModel: 'anthropic/claude-sonnet-4',
  },
]

// ============================================
//  SETTINGS PERSISTENCE
// ============================================

const SETTINGS_KEY = 'fortuna:ai-settings'

export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...defaultSettings(), ...parsed }
    }
  } catch {}
  return defaultSettings()
}

export function saveAISettings(settings: AISettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

function defaultSettings(): AISettings {
  return {
    mode: 'proxy',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    clientKeys: {},
  }
}

// ============================================
//  FETCH SERVER PROVIDERS
// ============================================

export async function fetchServerProviders(): Promise<{
  providers: ProviderConfig[]
  defaultProvider: ProviderId
  clientKeysAllowed: boolean
} | null> {
  try {
    const apiConfig = localStorage.getItem('fortuna:api-config')
    if (!apiConfig) return null
    
    const { baseUrl } = JSON.parse(apiConfig)
    const accessToken = localStorage.getItem('fortuna:access-token')
    
    const res = await fetch(`${baseUrl}/advisor.php?action=providers`, {
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
      },
    })
    
    if (!res.ok) return null
    const data = await res.json()
    
    return {
      providers: (data.providers || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        models: p.models,
        defaultModel: p.default_model,
      })),
      defaultProvider: data.default_provider,
      clientKeysAllowed: data.client_keys_allowed ?? true,
    }
  } catch {
    return null
  }
}

// ============================================
//  SEND MESSAGE (UNIFIED)
// ============================================

export async function sendAIMessage(
  messages: ChatMessage[],
  system: string,
  settings?: AISettings,
): Promise<AIResponse> {
  const s = settings || getAISettings()
  
  if (s.mode === 'proxy') {
    return sendViaProxy(messages, system, s)
  } else {
    return sendDirect(messages, system, s)
  }
}

// ============================================
//  PROXY MODE (server-side keys)
// ============================================

async function sendViaProxy(
  messages: ChatMessage[],
  system: string,
  settings: AISettings,
): Promise<AIResponse> {
  const apiConfig = localStorage.getItem('fortuna:api-config')
  if (!apiConfig) throw new Error('API not configured. Set up your backend URL or switch to direct mode.')
  
  const { baseUrl } = JSON.parse(apiConfig)
  const accessToken = localStorage.getItem('fortuna:access-token')
  
  // Include active workspace ID so server can use workspace shared keys
  let workspaceId: number | undefined
  try {
    const wsRaw = localStorage.getItem('fortuna:active-workspace')
    if (wsRaw) workspaceId = JSON.parse(wsRaw).id
  } catch {}
  
  const res = await fetch(`${baseUrl}/advisor.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      system,
      provider: settings.provider,
      model: settings.model,
      max_tokens: 4000,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    }),
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `Proxy error: ${res.status}`)
  }
  
  const data = await res.json()
  const text = data.content
    ?.filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n') || ''
  
  return {
    text,
    provider: data.provider || settings.provider,
    model: data.model || settings.model,
    usage: data.usage,
  }
}

// ============================================
//  DIRECT MODE (browser-side keys)
// ============================================

async function sendDirect(
  messages: ChatMessage[],
  system: string,
  settings: AISettings,
): Promise<AIResponse> {
  const apiKey = settings.clientKeys[settings.provider]
  if (!apiKey) {
    throw new Error(`No API key configured for ${settings.provider}. Add your key in AI Settings.`)
  }
  
  switch (settings.provider) {
    case 'anthropic':
      return directAnthropic(messages, system, settings.model, apiKey)
    case 'openai':
      return directOpenAI(messages, system, settings.model, apiKey)
    case 'gemini':
      return directGemini(messages, system, settings.model, apiKey)
    case 'openrouter':
      return directOpenRouter(messages, system, settings.model, apiKey)
    default:
      throw new Error(`Unknown provider: ${settings.provider}`)
  }
}

// ---- Anthropic Direct ----
async function directAnthropic(messages: ChatMessage[], system: string, model: string, apiKey: string): Promise<AIResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: system || undefined,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Anthropic error: ${res.status}`)
  }
  
  const data = await res.json()
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
  return { text, provider: 'anthropic', model, usage: data.usage }
}

// ---- OpenAI Direct ----
async function directOpenAI(messages: ChatMessage[], system: string, model: string, apiKey: string): Promise<AIResponse> {
  const apiMessages: any[] = []
  if (system) apiMessages.push({ role: 'system', content: system })
  messages.forEach(m => apiMessages.push({ role: m.role, content: m.content }))
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: 4000, messages: apiMessages, temperature: 0.7 }),
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI error: ${res.status}`)
  }
  
  const data = await res.json()
  return { text: data.choices[0]?.message?.content || '', provider: 'openai', model, usage: data.usage }
}

// ---- Gemini Direct ----
async function directGemini(messages: ChatMessage[], system: string, model: string, apiKey: string): Promise<AIResponse> {
  const contents = messages.map(m => {
    let parts: any[] = []
    if (typeof m.content === 'string') {
      parts = [{ text: m.content }]
    } else {
      parts = m.content.map(part => {
        if (part.type === 'text') return { text: part.text }
        if (part.type === 'image_url' && part.image_url) {
          // Gemini expects base64 data without the data:image/jpeg;base64, prefix
          const match = part.image_url.url.match(/^data:(image\/[a-z]+);base64,(.*)$/)
          if (match) {
            return { inlineData: { mimeType: match[1], data: match[2] } }
          }
        }
        return null
      }).filter(Boolean)
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    }
  })
  
  const payload: any = {
    contents,
    generationConfig: { maxOutputTokens: 4000, temperature: 0.7 },
  }
  if (system) {
    payload.systemInstruction = { parts: [{ text: system }] }
  }
  
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  )
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini error: ${res.status}`)
  }
  
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const usage = data.usageMetadata ? {
    input_tokens: data.usageMetadata.promptTokenCount,
    output_tokens: data.usageMetadata.candidatesTokenCount,
  } : undefined
  
  return { text, provider: 'gemini', model, usage }
}

// ---- OpenRouter Direct ----
async function directOpenRouter(messages: ChatMessage[], system: string, model: string, apiKey: string): Promise<AIResponse> {
  const apiMessages: any[] = []
  if (system) apiMessages.push({ role: 'system', content: system })
  messages.forEach(m => apiMessages.push({ role: m.role, content: m.content }))
  
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://fortuna.unlessrx.com',
      'X-Title': 'Fortuna Engine',
    },
    body: JSON.stringify({ model, max_tokens: 4000, messages: apiMessages }),
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenRouter error: ${res.status}`)
  }
  
  const data = await res.json()
  return { text: data.choices[0]?.message?.content || '', provider: 'openrouter', model, usage: data.usage }
}

// ============================================
//  UTILITIES
// ============================================

export function getProviderIcon(id: ProviderId): string {
  const icons: Record<ProviderId, string> = {
    anthropic: '🟠',
    openai: '🟢',
    gemini: '🔵',
    openrouter: '🟣',
  }
  return icons[id] || '⚪'
}

export function getModelDisplayName(model: string): string {
  // Shorten long model names
  return model
    .replace('claude-sonnet-4-20250514', 'Claude Sonnet 4')
    .replace('claude-haiku-4-5-20251001', 'Claude Haiku 4.5')
    .replace('anthropic/claude-sonnet-4', 'Claude Sonnet 4')
    .replace('anthropic/claude-haiku-4', 'Claude Haiku 4')
    .replace('openai/', '')
    .replace('google/', '')
    .replace('deepseek/', '')
    .replace('meta-llama/', '')
    .replace('mistralai/', '')
    .replace('qwen/', '')
    .replace('gemini-2.0-flash-001', 'Gemini 2.0 Flash')
    .replace('gemini-2.0-flash-lite', 'Gemini 2.0 Flash Lite')
    .replace('gemini-2.0-flash', 'Gemini 2.0 Flash')
    .replace('gemini-1.5-pro', 'Gemini 1.5 Pro')
    .replace('gemini-1.5-flash', 'Gemini 1.5 Flash')
    .replace('deepseek-chat-v3-0324', 'DeepSeek V3')
    .replace('llama-4-maverick', 'Llama 4 Maverick')
    .replace('mistral-large-2411', 'Mistral Large')
    .replace('qwen-2.5-72b-instruct', 'Qwen 2.5 72B')
}
