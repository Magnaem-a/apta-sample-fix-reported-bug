import { api, h, money } from "/static/lib.js"

const owner = decodeURIComponent(location.pathname.split("/").pop())
const COLS = ["delivery_id","farmer_id","crop","paid_usd","payment_status","delivered_at"]
const AMOUNT = "paid_usd"
const rows = document.getElementById("rows")
const total = document.querySelector('[data-testid="owner-total"]')
const select = document.getElementById("item")
const error = document.getElementById("edit-error")

async function load() {
  const res = await api("GET", "/api/deliveries?farmer_id=" + encodeURIComponent(owner))
  if (!res.ok) return (error.textContent = "The deliveries couldn't be loaded. Refresh to try again.")
  const items = res.data.items
  total.textContent = money(res.data.total_usd)
  rows.replaceChildren(...items.map((i) => h("tr", { "data-testid": "item-row" }, ...COLS.map((c) => h("td", {}, c === AMOUNT ? money(i[c]) : String(i[c]))))))
  select.replaceChildren(...items.map((i) => h("option", { value: i.delivery_id }, i.delivery_id + " (" + money(i[AMOUNT]) + ")")))
}

document.getElementById("correct").addEventListener("submit", async (event) => {
  event.preventDefault()
  const amount = Number(document.getElementById("amount").value.replace(/[$,\s]/g, ""))
  if (!Number.isFinite(amount) || amount < 0) return (error.textContent = "Enter an amount in dollars, such as 12.50.")
  const res = await api("PATCH", "/api/deliveries/" + encodeURIComponent(select.value), { amount })
  error.textContent = res.ok ? "" : res.data?.error?.message ?? "The amount wasn't saved. Try again."
  await load()
})

load()
