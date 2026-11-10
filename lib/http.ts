import { createServer } from "node:http"
import type { IncomingHttpHeaders } from "node:http"
import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join, normalize } from "node:path"

export type Request = {
  method: string
  path: string
  query: URLSearchParams
  params: Record<string, string>
  headers: IncomingHttpHeaders
  cookies: Record<string, string>
  body: unknown
}
export type Reply = { status: number; json?: unknown; html?: string; headers?: Record<string, string> }
export type Handler = (req: Request) => Reply | Promise<Reply>

type Route = { method: string; parts: string[]; handler: Handler }
const routes: Route[] = []
let siteName = "App"

/** The name shown in every page header. */
export function site(name: string) {
  siteName = name
}

/** Adds a route. ":name" in the path is a parameter, for example "/orders/:id". */
export function route(method: string, path: string, handler: Handler) {
  routes.push({ method, parts: path.split("/").filter(Boolean), handler })
}

function match(parts: string[], path: string[]): Record<string, string> | undefined {
  if (parts.length !== path.length) return undefined
  const params: Record<string, string> = {}
  for (const [i, part] of parts.entries()) {
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(path[i])
    else if (part !== path[i]) return undefined
  }
  return params
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): Reply => ({ status, json: body, headers })
export const fail = (status: number, code: string, message: string): Reply => json(status, { error: { code, message } })
export const redirect = (to: string, headers: Record<string, string> = {}): Reply => ({ status: 303, headers: { location: to, ...headers } })

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
export const escape = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c])

/** A whole HTML page: header, main (with its h1) and an optional module script from public/. */
export function page(title: string, main: string, script?: string, status = 200): Reply {
  const html = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>" + escape(title) + " | " + escape(siteName) + "</title>",
    '<link rel="stylesheet" href="/static/app.css">',
    "</head>",
    "<body>",
    '<header class="top"><a href="/">' + escape(siteName) + "</a></header>",
    "<main>",
    "<h1>" + escape(title) + "</h1>",
    main,
    "</main>",
    script ? '<script type="module" src="/static/' + script + '"></script>' : "",
    "</body>",
    "</html>",
  ].join("\n")
  return { status, html }
}

const TYPES: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" }
const PUBLIC = join(import.meta.dirname, "..", "public")

function staticFile(path: string): Reply | undefined {
  const file = normalize(join(PUBLIC, path.slice("/static/".length)))
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) return undefined
  return { status: 200, html: readFileSync(file, "utf8"), headers: { "content-type": TYPES[extname(file)] ?? "text/plain" } }
}

function cookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=")
    if (at > 0) out[part.slice(0, at).trim()] = decodeURIComponent(part.slice(at + 1).trim())
  }
  return out
}

function parseBody(text: string, type: string | undefined): unknown {
  if (!text) return undefined
  if (type?.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text))
  return JSON.parse(text)
}

export function serve(port = Number(process.env.PORT ?? 3000)) {
  const server = createServer((incoming, res) => {
    const chunks: Buffer[] = []
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk))
    incoming.on("end", async () => {
      const url = new URL(incoming.url ?? "/", "http://localhost")
      const isApi = url.pathname.startsWith("/api/")
      let reply: Reply | undefined
      try {
        const req: Request = {
          method: incoming.method ?? "GET",
          path: url.pathname,
          query: url.searchParams,
          params: {},
          headers: incoming.headers,
          cookies: cookies(incoming.headers.cookie),
          body: undefined,
        }
        try {
          req.body = parseBody(Buffer.concat(chunks).toString("utf8"), incoming.headers["content-type"])
        } catch {
          reply = fail(400, "bad_json", "The request body isn't valid JSON.")
        }
        if (!reply && req.method === "GET" && req.path.startsWith("/static/")) reply = staticFile(req.path)
        if (!reply) {
          const path = req.path.split("/").filter(Boolean)
          const hit = routes.find((r) => r.method === req.method && match(r.parts, path))
          if (hit) {
            req.params = match(hit.parts, path) ?? {}
            reply = await hit.handler(req)
          }
        }
        reply ??= isApi ? fail(404, "not_found", "There's nothing at this path.") : page("Page not found", "<p>There's nothing at this address.</p>", undefined, 404)
      } catch (e) {
        console.error(incoming.method, url.pathname, "failed:", e)
        reply = isApi ? fail(500, "server_error", "Something went wrong on our side.") : page("Something went wrong", "<p>Please try again.</p>", undefined, 500)
      }
      const headers: Record<string, string> = { ...reply.headers }
      if (reply.json !== undefined) headers["content-type"] = "application/json"
      else if (reply.html !== undefined) headers["content-type"] ??= "text/html; charset=utf-8"
      res.writeHead(reply.status, headers)
      res.end(reply.json !== undefined ? JSON.stringify(reply.json) : reply.html)
    })
  })
  server.listen(port, () => console.log("listening on port " + port))
  return server
}

route("GET", "/health", () => json(200, { ok: true }))
