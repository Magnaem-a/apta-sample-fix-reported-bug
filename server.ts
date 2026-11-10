import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "./lib/db.ts"
import { escape, fail, json, page, route, serve, site } from "./lib/http.ts"

type Item = Record<string, string | number>

site("Sixfield Grain Traders")

db.exec("CREATE TABLE deliveries (delivery_id TEXT PRIMARY KEY, farmer_id TEXT NOT NULL, crop TEXT NOT NULL, paid_usd REAL NOT NULL, payment_status TEXT NOT NULL, delivered_at TEXT NOT NULL)")
const seed = JSON.parse(readFileSync(join(import.meta.dirname, "data", "seed.json"), "utf8")) as Record<string, string | number>[]
const insertItem = db.prepare("INSERT INTO deliveries (delivery_id, farmer_id, crop, paid_usd, payment_status, delivered_at) VALUES (?, ?, ?, ?, ?, ?)")
for (const r of seed) insertItem.run(r.delivery_id, r.farmer_id, r.crop, r.paid_usd, r.payment_status, r.delivered_at)


const findItem = (id: string) => db.prepare("SELECT * FROM deliveries WHERE delivery_id = ?").get(id) as Item | undefined
const money = (n: unknown) => "$" + Number(n).toFixed(2)

function itemRow(i: Item): string {
  return "<tr><td><a href=\"/deliveries/" + encodeURIComponent(String(i.delivery_id)) + "\">" + escape(i.delivery_id) + "</a></td>" +
    "<td>" + escape(i.farmer_id) + "</td>" +
    "<td>" + escape(i.crop) + "</td>" +
    "<td>" + escape(money(i.paid_usd)) + "</td>" +
    "<td>" + escape(i.payment_status) + "</td>" +
    "<td>" + escape(i.delivered_at) + "</td>" + "</tr>"
}

const TABLE_HEAD = "<tr><th scope=\"col\">Delivery id</th><th scope=\"col\">Farmer id</th><th scope=\"col\">Crop</th><th scope=\"col\">Paid ($)</th><th scope=\"col\">Payment status</th><th scope=\"col\">Delivered at</th></tr>"

route("GET", "/", () => {
  const items = db.prepare("SELECT * FROM deliveries ORDER BY delivered_at DESC").all() as Item[]
  return page("Deliveries", '<div class="table-wrap"><table><thead>' + TABLE_HEAD + "</thead><tbody>" + items.map(itemRow).join("") + "</tbody></table></div>")
})



route("GET", "/api/deliveries/:id", (req) => {
  const item = findItem(req.params.id)
  return item ? json(200, item) : fail(404, "not_found", "There's no delivery with that id.")
})

route("GET", "/deliveries/:id", (req) => {
  const item = findItem(req.params.id)
  if (!item) return page("Delivery not found", "<p>There's no delivery with that id.</p>", undefined, 404)
  const id = escape(item.delivery_id)
  const fields = "<dl>" + "<dt>Delivery id</dt><dd>" + escape(item.delivery_id) + "</dd>" +
    "<dt>Farmer id</dt><dd>" + escape(item.farmer_id) + "</dd>" +
    "<dt>Crop</dt><dd>" + escape(item.crop) + "</dd>" +
    "<dt>Paid ($)</dt><dd>" + escape(money(item.paid_usd)) + "</dd>" +
    "<dt>Payment status</dt><dd>" + escape(item.payment_status) + "</dd>" +
    "<dt>Delivered at</dt><dd>" + escape(item.delivered_at) + "</dd>" + "</dl>"
  return page("Delivery" + " " + id, '<p><a href="/">All deliveries</a></p>' + fields)
})

const COUNTED = "paid"
const PROBLEM = "held"
const totalFor = (owner: string) => (db.prepare("SELECT COALESCE(ROUND(SUM(paid_usd), 2), 0) AS total FROM deliveries WHERE payment_status = ? AND farmer_id = ?").get(COUNTED, owner) as { total: number }).total

route("GET", "/api/deliveries", (req) => {
  const owner = req.query.get("farmer_id")
  if (!owner) return fail(400, "owner_required", "Add ?farmer_id= to say whose deliveries to list.")
  const items = db.prepare("SELECT * FROM deliveries WHERE farmer_id = ? ORDER BY delivered_at DESC").all(owner) as Item[]
  return json(200, { items, total_usd: totalFor(owner) })
})

route("PATCH", "/api/deliveries/:id", (req) => {
  const item = findItem(req.params.id)
  if (!item) return fail(404, "not_found", "There's no delivery with that id.")
  const amount = (req.body as { amount?: unknown } | undefined)?.amount
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return fail(400, "bad_amount", "amount must be a number of dollars, 0 or more.")
  db.prepare("UPDATE deliveries SET paid_usd = ? WHERE delivery_id = ?").run(Math.round(amount * 100) / 100, req.params.id)
  return json(200, findItem(req.params.id))
})

route("GET", "/farmers/:owner", (req) => {
  const owner = escape(req.params.owner)
  return page("Farmer" + " " + owner, '<p class="muted">Deliveries for this farmer. The total counts deliveries marked ' + COUNTED + ' only.</p>' +
    '<p>Total ' + COUNTED + ': <strong data-testid="owner-total" aria-live="polite"></strong></p>' +
    '<div class="table-wrap"><table><thead>' + TABLE_HEAD + '</thead><tbody id="rows"></tbody></table></div>' +
    '<form id="correct" class="card" novalidate><h2>Correct an amount</h2>' +
    '<label for="item">Delivery</label><select id="item" data-testid="edit-item"></select>' +
    '<label for="amount">Correct amount in dollars</label><input id="amount" inputmode="decimal" data-testid="edit-amount">' +
    '<p id="edit-error" class="error" role="alert"></p><button type="submit" data-testid="edit-save">Save amount</button></form>', "owner.js")
})

serve()
