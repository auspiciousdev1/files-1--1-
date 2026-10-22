/* POMS — order management console. Static client over ../api/poms (+ ../api/workday for invoicing references).
   Layout variant 3 ("hashed"): label/value pairs are sibling <div>s with the label carried in aria-label
   (one field shows only an icon); every class name is hashed and regenerated on each render; the views carry
   no ids; headings are role=heading divs; tabs are role=tab divs. Data, routes and behaviour are those of bv-poc. */
const API = '../api'
const view = document.querySelector('main')
const cache = new Map()
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
const num = (n, dp = 2) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const plain = (n) => (n == null || n === '' ? '—' : Number.isInteger(Number(n)) ? String(Number(n)) : String(Math.round(Number(n) * 100) / 100))
const title = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const pill = (t, k = '') => `<span class="${H.pill} ${k ? H[k] : ''}">${esc(t)}</span>`
const dash = (v) => (v === null || v === undefined || v === '' ? `<span class="${H.dash}">—</span>` : esc(v))
const wd = (i) => `<a href="../workday/index.html#/invoice/${encodeURIComponent(i)}" target="_blank" rel="noopener" title="Open in Workday">${esc(i)}</a>`
const orderLink = (n) => `<a href="#/order/${encodeURIComponent(n)}">${esc(n)}</a>`
const usTs = (iso) => { if (!iso) return '—'; const d = new Date(iso.replace(' UTC', 'Z').replace(' ', 'T')); if (isNaN(d)) return iso; return d.toLocaleString('en-US', { timeZone: 'UTC', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) }
const usTsUtc = (iso) => (iso ? usTs(iso) + ' UTC' : '—')
const STATUS_KIND = { delivered: 'ok', delivery_planning: 'warn', confirmed: 'info', ready_for_delivery: 'info', cancelled: 'bad' }
const statusDot = (s) => { const k = STATUS_KIND[String(s).toLowerCase()]; return `<span class="${H.dot} ${k ? H[k] : ''}"></span>${title(s)}` }
const statusPill = (s) => statusPillKind(s)
const statusPillKind = (s) => pill(title(s), STATUS_KIND[String(s).toLowerCase()] ?? { paid: 'ok', unpaid: 'warn', on_account: 'acc', financed: 'info', locked: 'ok', unlocked: 'bad', completed: 'ok', planned: 'warn', approved: 'ok', approval_requested: 'warn' }[String(s).toLowerCase()] ?? '')

async function get(p, optional = false) {
  if (cache.has(p)) return cache.get(p)
  const r = await fetch(`${API}/${p}`, { cache: 'no-store' })
  if (!r.ok) { if (optional) return null; throw new Error(`${r.status} ${p}`) }
  const j = await r.json(); cache.set(p, j); return j
}
function nav(active) { document.querySelectorAll('.links a').forEach((a) => a.classList.toggle('active', a.id === `nav-${active}`)) }

/* ------------------ hashed class names, regenerated on every render ------------------ */
const NAMES = ['h1', 'idline', 'lead', 'headgrid', 'pair', 'lab', 'val', 'icolab', 'hl', 'dash', 'mono', 'dot', 'ok', 'warn', 'info', 'bad', 'acc', 'pill',
  'tabs', 'tab', 'active', 'dim', 'sec', 'sum', 'row', 't', 'kvlist', 'kvh', 'kvrow', 'grp', 'filters', 'count', 'btn', 'scroll', 'num', 'timeline', 'when', 'arrow']
const H = {}
let dynStyle = null
function rehash() {
  const used = new Set()
  NAMES.forEach((n) => { let h; do { h = 'x' + Math.random().toString(16).slice(2, 7).padEnd(5, '0') } while (used.has(h)); used.add(h); H[n] = h })
  if (!dynStyle) { dynStyle = document.createElement('style'); document.head.appendChild(dynStyle) }
  dynStyle.textContent = DYN_CSS.replace(/\.\{(\w+)\}/g, (_, n) => { if (!H[n]) throw new Error(`unknown class ${n}`); return '.' + H[n] })
}
const DYN_CSS = `
.{h1}{font-size:28px;font-weight:500;margin:6px 0 2px;letter-spacing:-.01em}
.{idline}{color:var(--muted);font-size:12.5px;margin-bottom:22px}
.{lead}{color:var(--muted);margin:0 0 14px}
.{headgrid}{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-bottom:22px}
.{lab}{display:block;color:var(--muted);font-size:12px;margin-bottom:3px}
.{headgrid} .{val},.{sum} .{val}{font-size:13.5px}
.{icolab}{font-size:13px}
.{dot}{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);margin-right:6px;vertical-align:1px}
.{dot}.{warn}{background:var(--warn)}.{dot}.{info}{background:var(--info)}.{dot}.{bad}{background:var(--bad)}
.{tabs}{display:flex;gap:22px;border-bottom:1px solid var(--line-soft);margin:0 0 26px}
.{tab}{padding:0 0 9px;color:#bdbdbd;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;user-select:none}
.{tab}.{active}{color:#fff;border-bottom-color:var(--accent)}
.{tab}.{dim}{color:#555;cursor:default}
.{sec}{font-size:22px;font-weight:500;margin:0 0 6px}
.{sum}{border-top:1px solid var(--line)}
.{sum} .{row}{display:grid;grid-template-columns:200px 1fr 1fr;gap:16px 28px;padding:26px 0;border-bottom:1px solid var(--line-soft)}
.{sum} .{t}{font-size:16px;font-weight:500}
.{sum} .{pair}{margin-bottom:22px}
.{sum} .{pair}:last-child{margin-bottom:0}
.{arrow}{color:var(--accent);margin-left:6px}
.{kvlist}{background:#fff;color:#1f2933;border-radius:4px;margin:12px 0 26px;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.{kvh}{margin:0;padding:12px 16px;font-size:14px;font-weight:600;border-bottom:1px solid #e6e8eb;color:#1f2933}
.{kvrow}{display:grid;grid-template-columns:400px 1fr;padding:10px 16px;border-bottom:1px solid #eef0f2;font-size:12.5px}
.{kvrow}:last-child{border-bottom:0}
.{kvrow} .{lab}{color:#3c72c9;margin:0;font-size:12.5px}
.{kvrow} .{val}{color:#1f2933}
.{kvrow} .{val}.{hl}{color:#3c72c9}
.{kvrow} .{grp}{grid-column:1/-1;font-size:11px;letter-spacing:.06em;color:#3c72c9;text-transform:uppercase;font-weight:600;padding-top:4px}
.{pill}{display:inline-block;font-size:11px;padding:2px 9px;border-radius:10px;background:var(--pill);color:#ddd}
.{pill}.{ok}{color:var(--ok)}.{pill}.{warn}{color:var(--warn)}.{pill}.{info}{color:var(--info)}.{pill}.{bad}{color:var(--bad)}.{pill}.{acc}{color:var(--accent)}
.{mono}{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.{filters}{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end;margin:0 0 16px}
.{filters} .{lab}{display:block;font-size:11px;color:var(--muted);margin-bottom:4px}
.{filters} select,.{filters} input{height:32px;border:1px solid var(--line);border-radius:6px;padding:0 10px;background:#111;color:#fff;min-width:160px}
.{filters} .{count}{margin-left:auto;color:var(--muted);font-size:12px;padding-bottom:8px}
.{btn}{border:1px solid var(--line);background:#111;color:#fff;border-radius:6px;padding:6px 12px;cursor:pointer}
.{scroll}{overflow:auto}
th.{num},td.{num}{text-align:right}
.{timeline}{list-style:none;margin:0;padding:0}
.{timeline} li{display:grid;grid-template-columns:190px 1fr;gap:14px;padding:9px 0;border-bottom:1px solid var(--line-soft)}
.{timeline} .{when}{color:var(--muted);font-size:12px}
@media (max-width:1000px){.{headgrid}{grid-template-columns:1fr 1fr}.{sum} .{row}{grid-template-columns:1fr}.{kvrow}{grid-template-columns:1fr 1fr}}
`

/* ------------------------------ building blocks --------------------------- */
const heading = (level, text, cls = '', attrs = '') => `<div role="heading" aria-level="${level}" class="${cls}" ${attrs}>${text}</div>`
// A label/value pair as two sibling <div>s; the label travels in aria-label on the value.
// opts.icon replaces the visible label by an icon, so aria-label is the only label. wrap=false
// leaves out the wrapper (the kvrow grid places the two divs itself).
const pairInner = (l, v, cls = '', o = {}) => `${o.icon ? `<div class="${H.lab} ${H.icolab}" aria-hidden="true">${o.icon}</div>` : `<div class="${H.lab}">${l}</div>`}<div class="${H.val} ${cls ? H[cls] : ''}" aria-label="${esc(l)}">${v}</div>`
const pair = (l, v, cls = '', o = {}) => `<div class="${H.pair}">${pairInner(l, v, cls, o)}</div>`
function table(cols, rows) {
  if (!rows.length) return '<div class="empty">No records.</div>'
  return `<div class="${H.scroll}"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? H.num : ''}">${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? H.num : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
const kvlist = (head, rows) => `<div class="${H.kvlist}">${head ? heading(3, head, H.kvh) : ''}${rows.map((r) => r.length === 1 ? `<div class="${H.kvrow}"><span class="${H.grp}">${r[0]}</span></div>` : `<div class="${H.kvrow}">${pairInner(r[0], r[1], r[2] ?? '', r[3] ?? {})}</div>`).join('')}</div>`
function csv(rows, filename) {
  const cols = Object.keys(rows[0] ?? {})
  const cell = (v) => { const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')], { type: 'text/csv' })); a.download = filename; a.click()
}
window.csv = csv
function tabs(defs) {
  const dim = ['Discounts', 'Related orders', 'Vista']
  const all = [...defs.map((d) => d[0]), ...dim]
  const active = H.active
  setTimeout(() => {
    const list = view.querySelector('[role="tablist"]'); if (!list) return
    const host = list.nextElementSibling
    list.querySelectorAll('[role="tab"]:not([aria-disabled="true"])').forEach((b) => b.addEventListener('click', () => {
      list.querySelectorAll('[role="tab"]').forEach((x) => { x.classList.remove(active); x.setAttribute('aria-selected', 'false') })
      b.classList.add(active); b.setAttribute('aria-selected', 'true')
      host.innerHTML = defs.find((d) => d[0] === b.textContent.trim())[1]()
    }))
  }, 0)
  return `<div class="${H.tabs}" role="tablist">${all.map((k, i) => `<div class="${H.tab} ${i === 0 ? active : ''} ${dim.includes(k) ? H.dim : ''}" role="tab" tabindex="${dim.includes(k) ? -1 : 0}" aria-selected="${i === 0}"${dim.includes(k) ? ' aria-disabled="true"' : ''}>${k}</div>`).join('')}</div><div role="tabpanel">${defs[0][1]()}</div>`
}
const ctl = (name) => view.querySelector(`[aria-label="${name}"]`)
const btn = (text) => [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === text)

/* -------------------------------- orders ---------------------------------- */
const COLS = [
  { label: 'Order No', key: 'order_no', render: (r) => orderLink(r.order_no ?? r.order_number) },
  { label: 'Type', key: 'type', render: (r) => title(r.type) }, { label: 'Market', key: 'market' },
  { label: 'Status', key: 'order_status', render: (r) => statusDot(r.order_status) },
  { label: 'Lock State', key: 'lock_state', render: (r) => statusPill(r.lock_state) },
  { label: 'Financing Option', key: 'financing_option' },
  { label: 'Owner', key: 'owner', render: (r) => esc(r.owner ?? r.buyer_name) },
  { label: 'Car', key: 'model', render: (r) => `${esc(r.model)} (${r.model_year})` }, { label: 'VIN', key: 'vin', render: (r) => `<span class="${H.mono}">${esc(r.vin)}</span>` },
  { label: 'Sales Type', key: 'sales_type' }, { label: 'Sales Channel', key: 'sales_channel' },
  { label: 'Grand Total Price', key: 'grand_total_price', num: true, render: (r) => num(r.grand_total_price ?? r.total_price) },
  { label: 'Currency', key: 'currency' }, { label: 'Handover', key: 'handover_date' },
]
const f = { market: 'ALL', status: 'ALL', fin: 'ALL', type: 'ALL', lock: 'ALL', q: '' }
let searchCaret = null // caret position to restore in the search box after a redraw
async function list() {
  rehash()
  nav('orders')
  const o = await get('poms/orders.json')
  const q = f.q.trim().toLowerCase()
  const rows = o.data.filter((r) => (f.market === 'ALL' || r.market === f.market) && (f.status === 'ALL' || r.order_status === f.status) && (f.fin === 'ALL' || r.financing_option === f.fin) && (f.type === 'ALL' || r.type === f.type) && (f.lock === 'ALL' || r.lock_state === f.lock) && (!q || JSON.stringify(r).toLowerCase().includes(q)))
  window.__rows = rows.map(({ options, fees, deliveries, events, workday_invoices, roles, financing, timestamps, ...r }) => ({ ...r, ...Object.fromEntries(Object.entries(financing ?? {}).map(([k, v]) => ['financing_' + k, v])) }))
  const opt = (vals, cur, lbl) => `<option value="ALL" ${cur === 'ALL' ? 'selected' : ''}>${lbl}</option>` + vals.map((v) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(title(v))}</option>`).join('')
  const uniq = (k) => [...new Set(o.data.map((r) => r[k]).filter(Boolean))].sort()
  setTimeout(() => {
    const bind = (name, key) => ctl(name).addEventListener('change', (e) => { f[key] = e.target.value; list() })
    bind('Market', 'market'); bind('Status', 'status'); bind('Financing option', 'fin'); bind('Type', 'type'); bind('Lock state', 'lock')
    const search = ctl('Search')
    search.addEventListener('input', (e) => { f.q = e.target.value; searchCaret = e.target.selectionStart; list() })
    // The list redraws on every keystroke; keep typing in the new search box
    if (searchCaret !== null) { search.focus(); search.setSelectionRange(searchCaret, searchCaret); searchCaret = null }
    btn('Reset').addEventListener('click', () => { Object.assign(f, { market: 'ALL', status: 'ALL', fin: 'ALL', type: 'ALL', lock: 'ALL', q: '' }); list() })
  }, 0)
  const field = (l, control) => `<div><span class="${H.lab}">${l}</span>${control}</div>`
  view.innerHTML = `${heading(1, 'Orders', H.h1)}<p class="${H.lead}">Confirmed vehicle orders across markets.</p>
    <div class="${H.filters}">
      ${field('Market', `<select aria-label="Market">${opt(uniq('market'), f.market, 'All markets')}</select>`)}
      ${field('Type', `<select aria-label="Type">${opt(uniq('type'), f.type, 'All types')}</select>`)}
      ${field('Status', `<select aria-label="Status">${opt(uniq('order_status'), f.status, 'All statuses')}</select>`)}
      ${field('Financing option', `<select aria-label="Financing option">${opt(uniq('financing_option'), f.fin, 'All financing')}</select>`)}
      ${field('Lock state', `<select aria-label="Lock state">${opt(uniq('lock_state'), f.lock, 'Any')}</select>`)}
      ${field('Search', `<input aria-label="Search" value="${esc(f.q)}" placeholder="Order no, VIN, owner">`)}
      <div><button class="${H.btn}">Reset</button> <button class="${H.btn}" onclick="csv(window.__rows,'poms-orders.csv')">Export</button></div>
      <span class="${H.count}" role="status">${rows.length} of ${o.data.length} orders</span>
    </div>
    ${table(COLS, rows)}`
  window.scrollTo(0, 0)
}

/* ----------------------------- order detail ------------------------------- */
async function detail(n) {
  rehash()
  nav('orders')
  const o = (await get(`poms/orders/${n}.json`)).data
  const invs = (await Promise.all((o.workday_invoices ?? []).map((i) => get(`workday/customer-invoices/${i}.json`, true).then((x) => x?.data)))).filter(Boolean)
  const ts = o.timestamps ?? {}
  const fin = o.financing ?? {}
  const car = `${o.model} (${o.model_year})`
  const extras = (o.options ?? []).length ? o.options.map((x) => x.description).join(', ') : 'No extras'

  const overview = () => `${heading(2, 'Summary', H.sec)}
    <div class="${H.sum}">
      <div class="${H.row}"><div class="${H.t}">Products</div><div>${pair('Car', `${esc(car)}<span class="${H.arrow}">→</span>`)}</div><div>${pair('Extras', esc(extras))}</div></div>
      <div class="${H.row}"><div class="${H.t}">Timeline</div>
        <div>${pair('Created at', usTs(ts.created_at))}${pair('Locked at', usTs(ts.locked_at ?? o.locked_at))}${pair('Last updated', usTs(ts.updated_at ?? o.poms_last_updated))}</div>
        <div>${pair('Confirmed at', usTs(ts.confirmed_at))}${pair('Handover completed at', usTs(ts.handover_completed_at))}</div></div>
      <div class="${H.row}"><div class="${H.t}">Sales Process</div><div>${pair('Sales channel', esc(o.sales_channel))}${pair('Is SME order', o.is_sme_order ? 'Yes' : 'No')}</div><div>${pair('Sales type', esc(o.sales_type))}</div></div>
      <div class="${H.row}"><div class="${H.t}">Roles</div><div>${pair('Orderer', esc(o.roles?.orderer ?? o.buyer_contact ?? o.buyer_name))}${pair('Owner', esc(o.roles?.owner ?? o.owner ?? o.buyer_name))}</div><div>${pair('Buyer', esc(o.roles?.buyer ?? o.buyer_name))}${pair('Buyer address', esc(o.buyer_address ?? ''))}</div></div>
    </div>
    ${heading(2, 'Details', H.sec, 'style="margin-top:28px"')}
    ${kvlist('', [
      ['Order No', esc(o.order_no ?? o.order_number), 'hl'], ['Order Type', esc(o.type), 'hl'], ['Sales Channel', esc(o.sales_channel), 'hl'],
      ['Order To Delivery Flow', dash(o.order_to_delivery_flow), 'hl'], ['Logistic Flow', dash(o.logistic_flow)],
      ['Order Status', esc(o.order_status), 'hl'], ['Communicated Delivery Status', dash(o.communicated_delivery_status), 'hl'],
      ['Extras status', dash(o.extras_status), 'hl'], ['Protection status', dash(o.protection_status), 'hl'],
      ['Market', esc(o.market), 'hl'], ['Is SME Order', o.is_sme_order ? '✔' : '<span style="color:#d33">⊗</span>'], ['Sales Type', esc(o.sales_type), 'hl'],
      ['Configuration ID', `<span class="${H.mono}">${esc(o.configuration_id)}</span>`], ['Car', `<b>${esc(car)}</b>`], ['VIN', `<span class="${H.mono}">${esc(o.vin)}</span>`], ['Licence Plate', dash(o.license_plate)],
      ['Cycle State', dash(o.cycle_state), 'hl'],
      ['Timestamps'],
      ['Created At', usTsUtc(ts.created_at), 'hl'], ['Updated At', usTsUtc(ts.updated_at ?? o.poms_last_updated), 'hl'], ['Confirmed at', usTsUtc(ts.confirmed_at), 'hl'],
      ['CSL Accepted At', dash(null)], ['Terms And Conditions Accepted At', dash(null)],
      ['Lock'],
      // icon-only label: the field name exists only in aria-label
      ['Lock State', esc(o.lock_state), 'hl', { icon: '🔒' }], ['Unlock Reason', dash(o.unlock_reason)], ['Manually Unlocked Reason', dash(o.manually_unlocked_reason)],
      ['Manually Unlocked Note', dash(o.manually_unlocked_note), o.manually_unlocked_note ? 'hl' : ''], ['Locked At', usTsUtc(o.locked_at), 'hl'],
    ])}`

  const linesTab = () => {
    const rows = [{ item: `${o.model} ${o.model_year}`, kind: 'Car', qty: 1, excl: o.base_price, incl: o.car_total_price - (o.paint_amount ? o.paint_amount * (1 + o.vat_rate / 100) : 0) },
      ...(o.paint_amount ? [{ item: `Exterior ${o.exterior_colour}`, kind: 'Configuration', qty: 1, excl: o.paint_amount, incl: o.paint_amount * (1 + o.vat_rate / 100) }] : []),
      ...(o.options ?? []).map((x) => ({ item: x.description, kind: 'Extra', qty: 1, excl: x.amount, incl: x.amount * (1 + o.vat_rate / 100) })),
      ...(o.fees ?? []).map((x) => ({ item: x.description, kind: 'Delivery / fee', qty: 1, excl: x.amount, incl: x.amount * (1 + o.vat_rate / 100) })),
      ...(o.discount_amount ? [{ item: 'Discount', kind: 'Discount', qty: 1, excl: -o.discount_amount, incl: -o.discount_amount * (1 + o.vat_rate / 100) }] : [])]
    return table([{ label: 'Item', key: 'item' }, { label: 'Kind', key: 'kind', render: (r) => pill(r.kind) }, { label: 'Qty', key: 'qty', num: true }, { label: 'VAT rate', key: 'v', render: () => `${num(o.vat_rate, 0)}%` }, { label: 'Amount excl. VAT', key: 'excl', num: true, render: (r) => num(r.excl) }, { label: 'Amount incl. VAT', key: 'incl', num: true, render: (r) => num(r.incl) }], rows)
  }
  const deliveriesTab = () => table([{ label: 'Delivery', key: 'delivery_id' }, { label: 'Planned date', key: 'planned_date' }, { label: 'Location', key: 'location' }, { label: 'Status', key: 'status', render: (r) => statusPill(r.status) }], o.deliveries ?? [])
  const pricingTab = () => kvlist('Price information', [
    ['Currency', esc(o.currency), 'hl'],
    ['Grand Total Price', plain(o.grand_total_price ?? o.total_price), 'hl'], ['Grand Total Vat', plain(o.grand_total_vat ?? o.vat_amount), 'hl'], ['Grand Total Tax', plain(o.grand_total_tax ?? 0), 'hl'], ['Grand Total Car Fiscal', dash(o.grand_total_car_fiscal)],
    ['Car Total Price', plain(o.car_total_price), 'hl'], ['Car Total Vat', plain(o.car_total_vat), 'hl'], ['Car Total Tax', plain(o.car_total_tax ?? 0), 'hl'],
    ['Car Total Incentive Label', dash(null)], ['Car Total Incentive Value', dash(null)], ['Car Total Incentive Excl Vat Label', dash(null)], ['Car Total Incentive Excl Vat Value', dash(null)],
    ['Extras Total Price', plain(o.extras_total_price ?? 0), 'hl'], ['Extras Total Vat', plain(o.extras_total_vat ?? 0), 'hl'],
    ['Delivery Total Price', plain(o.delivery_total_price ?? 0), 'hl'], ['Delivery Total Vat', plain(o.delivery_total_vat ?? 0), 'hl'],
    ['Assurances Total Price', plain(o.assurances_total_price ?? 0), 'hl'], ['Assurances Total Vat', plain(o.assurances_total_vat ?? 0), 'hl'],
    ['Discount', plain(o.discount_amount ?? 0)],
    ['Payments'],
    ['Upfront Payment', plain(o.upfront_payment ?? 0), 'hl'], ['Final Payment Amount', plain(o.final_payment_amount), 'hl'],
    ['Down Payment To Pay', plain(o.down_payment_to_pay ?? 0), 'hl'], ['Paid Down Payment', plain(o.paid_down_payment ?? 0), 'hl'], ['Deposit To Pay', plain(o.deposit_to_pay ?? 0), 'hl'],
  ])
  const financingTab = () => kvlist('Financing', [
    ['Financing Option', `<b>${esc(o.financing_option)}</b>`], ['Currency', esc(fin.currency ?? o.currency), 'hl'],
    ['Down Payment To Pay', plain(o.down_payment_to_pay ?? 0), 'hl'], ['Paid Down Payment', plain(o.paid_down_payment ?? 0), 'hl'], ['Deposit To Pay', plain(o.deposit_to_pay ?? 0), 'hl'],
    ['Status', dash(fin.status), 'hl'], ['Financed Amount', fin.financed_amount == null ? dash(null) : plain(fin.financed_amount), 'hl'],
    ['Loan Provider Name', dash(fin.loan_provider_name), 'hl'], ['Loan Provider SalesforceId', dash(fin.loan_provider_salesforce_id)], ['External Reference Number', dash(fin.external_reference_number)],
    ['Payment status', statusPill(o.payment_status)],
  ])
  const invoicingTab = () => invs.length
    ? table([{ label: 'Customer Invoice', key: 'invoice_number', render: (r) => wd(r.invoice_number) }, { label: 'Invoice Type', key: 'invoice_type' }, { label: 'Company', key: 'company' }, { label: 'Status', key: 'status', render: (r) => statusPill(r.status) },
        { label: 'Customer', key: 'customer', render: (r) => esc(r.customer ?? r.bill_to_customer) }, { label: 'Bill-To', key: 'bill_to_customer' }, { label: 'Invoice date', key: 'invoice_date' },
        { label: 'Net', key: 'n', num: true, render: (r) => num(r.totals.subtotal) }, { label: 'Tax', key: 't', num: true, render: (r) => num(r.totals.tax_amount) }, { label: 'Total Invoice Amount', key: 'tt', num: true, render: (r) => `<b>${num(r.totals.total_amount)}</b>` }, { label: 'Currency', key: 'currency' }], invs)
    : '<div class="empty">No invoicing documents referenced yet.</div>'
  const eventsTab = () => `<ul class="${H.timeline}">${(o.events ?? []).map((e) => `<li><span class="${H.when}">${esc(e.timestamp)}</span><span>${title(e.event)}</span></li>`).join('') || '<li class="empty">No events.</li>'}</ul>`

  view.innerHTML = `${heading(1, `Order ${esc(o.order_no ?? o.order_number)}`, H.h1)}<div class="${H.idline}">ID: ${esc(o.id ?? '')}</div>
    <div class="${H.headgrid}">
      ${pair('Configuration ID', esc(o.configuration_id ?? ''), 'mono')}
      ${pair('Type', esc(title(o.type)))}
      ${pair('Market', esc(o.market))}
      ${pair('Status', statusDot(o.order_status))}
    </div>
    ${tabs([['Overview', overview], ['Order lines', linesTab], ['Deliveries', deliveriesTab], ['Pricing', pricingTab], ['Financing', financingTab], ['Invoicing', invoicingTab], ['Events', eventsTab]])}`
  window.scrollTo(0, 0)
}

/* ------------------------------- customers -------------------------------- */
async function customers() {
  rehash()
  nav('customers')
  const o = await get('poms/orders.json')
  const by = new Map()
  o.data.forEach((r) => { const k = r.owner_customer_id ?? r.buyer_customer_id; const c = by.get(k) ?? { id: k, name: r.owner ?? r.buyer_name, address: r.buyer_address, market: r.market, sales_type: r.sales_type, orders: 0, total: 0, currency: r.currency }; c.orders++; c.total += (r.grand_total_price ?? r.total_price); by.set(k, c) })
  const rows = [...by.values()].sort((a, b) => a.market.localeCompare(b.market) || a.name.localeCompare(b.name))
  view.innerHTML = `${heading(1, 'Customers', H.h1)}<p class="${H.lead}">Owners across markets, derived from confirmed orders.</p>
    ${table([{ label: 'Owner', key: 'name' }, { label: 'Customer ID', key: 'id', render: (r) => `<span class="${H.mono}">${esc(r.id)}</span>` }, { label: 'Market', key: 'market' }, { label: 'Sales type', key: 'sales_type' }, { label: 'Address', key: 'address' }, { label: 'Orders', key: 'orders', num: true }, { label: 'Order value', key: 'total', num: true, render: (r) => `${num(r.total)} ${esc(r.currency)}` }], rows)}`
}

/* ------------------------------- deliveries ------------------------------- */
async function deliveries() {
  rehash()
  nav('deliveries')
  const o = await get('poms/orders.json')
  const rows = o.data.flatMap((r) => (r.deliveries ?? []).map((d) => ({ ...d, order_no: r.order_no ?? r.order_number, market: r.market, owner: r.owner ?? r.buyer_name, car: `${r.model} (${r.model_year})`, vin: r.vin }))).sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
  view.innerHTML = `${heading(1, 'Deliveries', H.h1)}<p class="${H.lead}">Planned and completed handovers by delivery hub.</p>
    ${table([{ label: 'Delivery', key: 'delivery_id' }, { label: 'Order No', key: 'order_no', render: (r) => orderLink(r.order_no) }, { label: 'Market', key: 'market' }, { label: 'Owner', key: 'owner' }, { label: 'Car', key: 'car' }, { label: 'VIN', key: 'vin', render: (r) => `<span class="${H.mono}">${esc(r.vin)}</span>` }, { label: 'Planned date', key: 'planned_date' }, { label: 'Location', key: 'location' }, { label: 'Status', key: 'status', render: (r) => statusPill(r.status) }], rows)}`
}

/* -------------------------------- routing --------------------------------- */
async function route() {
  const [head, arg] = location.hash.replace(/^#\/?/, '').split('/')
  view.innerHTML = '<div class="loading">Loading…</div>'
  try {
    if (head === 'order' && arg) await detail(decodeURIComponent(arg))
    else if (head === 'customers') await customers()
    else if (head === 'deliveries') await deliveries()
    else await list()
  } catch (e) { view.innerHTML = `<div class="empty"><b>Record not found.</b> ${esc(e.message)} — <a href="#/">back to orders</a></div>` }
}
document.getElementById('gs').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  const q = e.target.value.trim()
  if (/^\d{8}$/.test(q)) location.hash = `#/order/${q}`
  else { f.q = q.toLowerCase(); if (location.hash && location.hash !== '#/') location.hash = '#/'; else list() }
})
window.addEventListener('hashchange', route); route()
