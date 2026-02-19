/**
 * Fortuna Engine — Core API (Health Check)
 */

import type { Config } from "@netlify/functions"

export default async (req: Request) => {
  const url = new URL(req.url)
  const action = url.searchParams.get("action") || "health"

  if (action === "health" || action === "ping") {
    return new Response(JSON.stringify({
      status: "ok",
      version: "2.0.0-netlify",
      platform: "netlify-functions",
      storage: "netlify-blobs",
      timestamp: new Date().toISOString(),
    }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ error: true, message: `Unknown action: ${action}` }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  })
}

export const config: Config = {
  path: "/api/core.php",
}
