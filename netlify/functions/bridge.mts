// Fortuna AI Bridge
// Routes AI requests from any UNLESS platform through centralized infrastructure
// Enables: model switching, fallback chains, usage tracking, cost optimization

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("OK", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Platform, X-Request-Type",
      },
    })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 })
  }

  const startTime = Date.now()

  try {
    const body = await req.json()
    const platform = req.headers.get("X-Platform") || "unknown"
    const requestType = req.headers.get("X-Request-Type") || "general"

    // Model routing table - optimized per platform and use case
    const MODEL_ROUTES: Record<string, { provider: string; model: string; maxTokens: number; fallback?: string }> = {
      "oracle-research": {
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        maxTokens: 4096,
        fallback: "anthropic/claude-3-haiku",
      },
      "oracle-quick": {
        provider: "openrouter",
        model: "anthropic/claude-3-haiku",
        maxTokens: 2048,
      },
      "grant-search": {
        provider: "openrouter",
        model: "arcee-ai/trinity-large-preview:free",
        maxTokens: 2048,
        fallback: "anthropic/claude-3-haiku",
      },
      "clear-analysis": {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        maxTokens: 4096,
      },
      "ple-gato": {
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        maxTokens: 4096,
      },
      "atlas-financial": {
        provider: "openrouter",
        model: "anthropic/claude-3.5-sonnet",
        maxTokens: 8192,
        fallback: "anthropic/claude-3-haiku",
      },
      general: {
        provider: "openrouter",
        model: "anthropic/claude-3-haiku",
        maxTokens: 2048,
      },
    }

    const route = MODEL_ROUTES[requestType] || MODEL_ROUTES["general"]
    const OPENROUTER_KEY = Netlify.env.get("OPENROUTER_API_KEY") || ""
    const ANTHROPIC_KEY = Netlify.env.get("ANTHROPIC_API_KEY") || ""

    async function callModel(provider: string, model: string, maxTokens: number): Promise<Response> {
      if (provider === "openrouter") {
        return fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            "HTTP-Referer": `https://${platform}.netlify.app`,
            "X-Title": `UNLESS-${platform}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: body.messages,
            ...(body.system ? { system: body.system } : {}),
          }),
        })
      } else {
        return fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages: body.messages,
            ...(body.system ? { system: body.system } : {}),
          }),
        })
      }
    }

    let response = await callModel(route.provider, route.model, route.maxTokens)

    // Fallback if primary fails
    if (!response.ok && route.fallback) {
      console.log(`Primary model ${route.model} failed (${response.status}), trying fallback: ${route.fallback}`)
      response = await callModel("openrouter", route.fallback, route.maxTokens)
    }

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI provider error ${response.status}: ${errText.slice(0, 200)}`)
    }

    const result = await response.json()
    const duration = Date.now() - startTime

    return new Response(
      JSON.stringify({
        ...result,
        _fortuna: {
          platform,
          requestType,
          model: route.model,
          provider: route.provider,
          durationMs: duration,
          timestamp: new Date().toISOString(),
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Fortuna-Duration": String(duration),
          "X-Fortuna-Model": route.model,
        },
      }
    )
  } catch (error: any) {
    console.error("Fortuna bridge error:", error)
    return new Response(
      JSON.stringify({ error: error.message, _fortuna: { durationMs: Date.now() - startTime } }),
      { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
    )
  }
}

export const config = {
  path: "/api/bridge",
}
