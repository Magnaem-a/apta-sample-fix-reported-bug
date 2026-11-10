import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"

// Each test file starts its own copy of the app: a fresh in-memory database, loaded from data/seed.json.
const port = 4100 + Math.floor(Math.random() * 800)
const base = "http://localhost:" + port
let app: ChildProcess

before(async () => {
  app = spawn(process.execPath, ["server.ts"], { env: { ...process.env, PORT: String(port), DATA_FILE: ":memory:" }, stdio: "ignore" })
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error("the app didn't start")
})
after(() => app.kill())

test("lists the seeded records", async () => {
  const res = await fetch(base + "/api/deliveries?farmer_id=F-54237")
  assert.equal(res.status, 200)
  const items = await res.json()
  assert.ok(Array.isArray(items) ? items.length > 0 : items.items.length > 0)
})
