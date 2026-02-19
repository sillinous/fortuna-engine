export default async (req: Request) => {
  const url = new URL(req.url)
  const action = url.searchParams.get("action") || "health"

  return new Response(JSON.stringify({
    status: "ok",
    action,
    version: "2.0.0-netlify",
    platform: "netlify-functions",
    timestamp: new Date().toISOString(),
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export const config = {
  path: "/api/core.php",
}
