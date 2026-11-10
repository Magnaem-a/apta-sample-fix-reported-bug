/** Calls our API. Never throws: a network failure comes back as status 0. */
export async function api(method, path, body) {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let data = null
    try {
      data = await res.json()
    } catch {}
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

/** Creates an element: h("li", { "data-testid": "note-item" }, "text", child). */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === undefined || value === null) continue
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value)
    else el.setAttribute(key, value === true ? "" : String(value))
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child)
  return el
}

export const money = (n) => "$" + Number(n).toFixed(2)
export const when = (iso) => String(iso).replace("T", " ").slice(0, 16) + " UTC"
