// Fortuna Ecosystem Health Check
// Returns status of all UNLESS platforms for the command center

const PLATFORMS = [
  { id: "oracle", name: "ORACLE Intelligence", url: "https://oracle-intelligence.netlify.app" },
  { id: "grant-platform", name: "Grant Platform", url: "https://grant-platform-unless.netlify.app" },
  { id: "clear", name: "CLEAR Platform", url: "https://clear-platform.netlify.app" },
  { id: "ple", name: "Post-Labor Economics", url: "https://postlaboreconomics.netlify.app" },
  { id: "fortuna", name: "Fortuna Engine", url: "https://fortuna-engine.netlify.app" },
  { id: "lvn", name: "Latent Value Network", url: "https://latent-value-network.netlify.app" },
  { id: "atlas", name: "ATLAS Platform", url: "https://unless-atlas-platform.netlify.app" },
  { id: "command", name: "Command Center", url: "https://unless-command-center.netlify.app" },
]

export default async (req: Request) => {
  const results = await Promise.allSettled(
    PLATFORMS.map(async (p) => {
      const start = Date.now()
      try {
        const res = await fetch(p.url, { method: "HEAD", signal: AbortSignal.timeout(5000) })
        return { ...p, status: res.ok ? "up" : "degraded", code: res.status, latencyMs: Date.now() - start }
      } catch (e: any) {
        return { ...p, status: "down", error: e.message, latencyMs: Date.now() - start }
      }
    })
  )

  const platforms = results.map((r) => (r.status === "fulfilled" ? r.value : { status: "error" }))
  const upCount = platforms.filter((p: any) => p.status === "up").length

  return new Response(
    JSON.stringify({
      ecosystem: "UNLESS",
      timestamp: new Date().toISOString(),
      summary: { total: PLATFORMS.length, up: upCount, degraded: platforms.filter((p: any) => p.status === "degraded").length, down: PLATFORMS.length - upCount },
      platforms,
    }),
    { status: 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } }
  )
}

export const config = { path: "/api/ecosystem" }
