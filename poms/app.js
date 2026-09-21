/* POMS — order management. Static client over ../api/poms (+ ../api/workday for billing document references). */
const API = '../api'
const view = document.getElementById('view')
const cache = new Map()
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
const num = (n, dp = 2) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const title = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const pill = (t, k = '') => `<span class="pill ${k}">${esc(t)}</span>`
const wd = (i) => `<a href="../workday/index.html#/invoice/${encodeURIComponent(i)}" target="_blank" rel="noopener" title="Open in Workday">${esc(i)}</a>`
const orderLink = (n) => `<a href="#/order/${encodeURIComponent(n)}">${esc(n)}</a>`
const statusPill = (s) => pill(title(s), { HANDOVER_COMPLETED: 'ok', DELIVERED: 'ok', AWAITING_HANDOVER: 'warn', DELIVERY_PLANNING: 'warn', IN_PRODUCTION: 'info', PAID: 'ok', UNPAID: 'warn', ON_ACCOUNT: 'acc', FINANCED: 'info', COMPLETED: 'ok', PLANNED: 'warn' }[s] || '')

async function get(p, optional = false) {
  if (cache.has(p)) return cache.get(p)
  const r = await fetch(`${API}/${p}`, { cache: 'no-store' })
  if (!r.ok) { if (optional) return null; throw new Error(`${r.status} ${p}`) }
  const j = await r.json(); cache.set(p, j); return j
}
const card = (h, body, c = '', tools = '') => `<div class="card"><h2>${h}${c ? `<span class="c">${c}</span>` : ''}${tools ? `<span class="tools">${tools}</span>` : ''}</h2>${body}</div>`
const kv = (rows) => `<div class="kv">${rows.map(([l, v]) => `<div><label>${l}</label><div class="v">${v === '' || v == null ? '<span style="color:#b5b0a9">—</span>' : v}</div></div>`).join('')}</div>`
function table(cols, rows) {
  if (!rows.length) return '<div class="empty">No records.</div>'
  return `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
function csv(rows, filename) {
  const cols = Object.keys(rows[0] ?? {})
  const cell = (v) => { const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')], { type: 'text/csv' })); a.download = filename; a.click()
}
window.csv = csv
function nav(active) { document.querySelectorAll('.tabsnav a').forEach((a) => a.classList.toggle('active', a.id === `nav-${active}`)) }

/* -------------------------------- orders ---------------------------------- */
const COLS = [
  { label: 'Order No', key: 'order_number', render: (r) => orderLink(r.order_number) },
  { label: 'Market', key: 'market' }, { label: 'Company', key: 'company' },
  { label: 'Order Type', key: 'order_type', render: (r) => title(r.order_type ?? 'new_car') }, { label: 'Sales Type', key: 'sales_type' }, { label: 'Channel', key: 'sales_channel' },
  { label: 'Customer', key: 'buyer_name' },
  { label: 'Model', key: 'model' }, { label: 'MY', key: 'model_year' }, { label: 'Exterior', key: 'exterior_colour' },
  { label: 'VIN', key: 'vin', render: (r) => `<span class="mono">${esc(r.vin)}</span>` }, { label: 'Licence Plate', key: 'license_plate' },
  { label: 'Financing', key: 'financing_type', render: (r) => title(r.financing_type) }, { label: 'Financing Partner', key: 'financing_partner' },
  { label: 'Order Status', key: 'order_status', render: (r) => statusPill(r.order_status) }, { label: 'Order Date', key: 'order_date' }, { label: 'Handover', key: 'handover_date' },
  { label: 'Total Price', key: 'total_price', num: true, render: (r) => `<b>${num(r.total_price)}</b>` }, { label: 'Ccy', key: 'currency' },
  { label: 'Payment', key: 'payment_status', render: (r) => statusPill(r.payment_status) },
]
const f = { company: 'ALL', status: 'ALL', fin: 'ALL', sales: 'ALL', q: '' }
async function list() {
  nav('orders')
  const o = await get('poms/orders.json')
  const rows = o.data.filter((r) => (f.company === 'ALL' || r.company === f.company) && (f.status === 'ALL' || r.order_status === f.status) && (f.fin === 'ALL' || r.financing_type === f.fin) && (f.sales === 'ALL' || r.sales_type === f.sales) && (!f.q || JSON.stringify(r).toLowerCase().includes(f.q)))
  window.__rows = rows.map(({ options, fees, deliveries, events, workday_invoices, ...r }) => r)
  const opt = (vals, cur, lbl) => `<option value="ALL" ${cur === 'ALL' ? 'selected' : ''}>${lbl}</option>` + vals.map((v) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(title(v))}</option>`).join('')
  const uniq = (k) => [...new Set(o.data.map((r) => r[k]).filter(Boolean))].sort()
  setTimeout(() => {
    const bind = (id, key) => view.querySelector(id).addEventListener('change', (e) => { f[key] = e.target.value; list() })
    bind('#f-co', 'company'); bind('#f-st', 'status'); bind('#f-fin', 'fin'); bind('#f-sales', 'sales')
    view.querySelector('#f-q').addEventListener('input', (e) => { f.q = e.target.value.trim().toLowerCase(); list() })
    view.querySelector('#f-reset').addEventListener('click', () => { Object.assign(f, { company: 'ALL', status: 'ALL', fin: 'ALL', sales: 'ALL', q: '' }); list() })
  }, 0)
  view.innerHTML = `<div class="crumbs">Orders</div><h1>Vehicle Orders</h1><p class="lead">All confirmed vehicle orders across EU markets with configuration, financing, pricing, delivery status and billing document references.</p>
    <div class="filters">
      <div><label>Company / market</label><select id="f-co">${opt(uniq('company'), f.company, 'All markets')}</select></div>
      <div><label>Order status</label><select id="f-st">${opt(uniq('order_status'), f.status, 'All statuses')}</select></div>
      <div><label>Financing</label><select id="f-fin">${opt(uniq('financing_type'), f.fin, 'All financing')}</select></div>
      <div><label>Sales type</label><select id="f-sales">${opt(uniq('sales_type'), f.sales, 'B2B and B2C')}</select></div>
      <div><label>Search</label><input id="f-q" value="${esc(f.q)}" placeholder="Order no, VIN, customer, plate"></div>
      <div><button class="btn" id="f-reset">Reset</button></div>
      <span class="count">${rows.length} of ${o.data.length} orders</span>
    </div>
    ${card('Orders', table(COLS, rows), '', `<button class="btn" onclick="csv(window.__rows,'poms-orders.csv')">Export CSV</button>`)}`
  window.scrollTo(0, 0)
}

/* ----------------------------- order detail ------------------------------- */
async function detail(n) {
  nav('orders')
  const o = (await get(`poms/orders/${n}.json`)).data
  const invs = await Promise.all((o.workday_invoices ?? []).map((i) => get(`workday/customer-invoices/${i}.json`, true).then((x) => x?.data)))
  const lines = [{ item: `${o.model} MY${o.model_year} — base vehicle`, code: o.model_code, amount: o.base_price, kind: 'Vehicle' },
    ...(o.paint_amount ? [{ item: `Exterior colour ${o.exterior_colour}`, code: 'PAINT', amount: o.paint_amount, kind: 'Configuration' }] : [{ item: `Exterior colour ${o.exterior_colour}`, code: 'PAINT', amount: 0, kind: 'Configuration' }]),
    ...(o.options ?? []).map((x) => ({ item: x.description, code: x.option_code, amount: x.amount, kind: 'Option' })),
    ...(o.fees ?? []).map((x) => ({ item: x.description, code: x.fee_code, amount: x.amount, kind: 'Fee' })),
    ...(o.discount_amount ? [{ item: 'Discount', code: 'DISC', amount: -o.discount_amount, kind: 'Discount' }] : [])].map((l, i) => ({ line: i + 1, ...l }))
  const price = `<div class="price"><span>Base price</span><span>${num(o.base_price)}</span><span>Configuration</span><span>${num(o.paint_amount)}</span>
    <span>Options</span><span>${num((o.options ?? []).reduce((s, x) => s + x.amount, 0))}</span><span>Fees</span><span>${num((o.fees ?? []).reduce((s, x) => s + x.amount, 0))}</span>
    ${o.discount_amount ? `<span>Discount</span><span>(${num(o.discount_amount)})</span>` : ''}
    <span class="t">Gross taxable amount</span><span class="t">${num(o.gross_taxable_amount)}</span><span>VAT ${num(o.vat_rate, 0)}%</span><span>${num(o.vat_amount)}</span>
    <span class="t">Total price</span><span class="t">${num(o.total_price)} ${esc(o.currency)}</span></div>`
  view.innerHTML = `<div class="crumbs"><a href="#/">Orders</a> › ${esc(o.order_number)}</div>
    <div class="head"><div><h1>Order ${esc(o.order_number)}</h1><p class="lead">${esc(o.model)} MY${o.model_year} · ${esc(o.buyer_name)} · ${esc(o.market)} · ${statusPill(o.order_status)}</p></div>
      <div class="actions"><button class="btn">Order documents</button><button class="btn">Change request</button><button class="btn primary">Actions ▾</button></div></div>
    <div class="grid2">
      ${card('Order', kv([['Order number', `<b>${esc(o.order_number)}</b>`], ['Company / market', `${esc(o.company)} · ${esc(o.market)}`], ['Order type', title(o.order_type ?? 'new_car')], ['Sales type', o.sales_type ?? ''], ['Sales channel', o.sales_channel ?? ''],
        ['Order status', statusPill(o.order_status)], ['Order date', esc(o.order_date)], ['Planned handover', esc(o.handover_date)], ['Last updated', esc(o.poms_last_updated)]]))}
      ${card('Customer', kv([['Customer', `<b>${esc(o.buyer_name)}</b>`], ['Customer ID', `<span class="mono">${esc(o.buyer_customer_id)}</span>`], ['Contact', o.buyer_contact ?? ''], ['Address', o.buyer_address ?? '']]))}
      ${card('Vehicle', kv([['Model', `${esc(o.model)} (${esc(o.model_code)})`], ['Model year', o.model_year], ['Exterior colour', esc(o.exterior_colour)], ['VIN', `<span class="mono">${esc(o.vin)}</span>`], ['Licence plate', o.license_plate ? `<b>${esc(o.license_plate)}</b>` : '']]))}
      ${card('Financing & payment', kv([['Financing', title(o.financing_type)], ['Financing partner', o.financing_partner ? `${esc(o.financing_partner)} <span class="mono">${esc(o.financing_partner_id)}</span>` : ''], ['Payment status', statusPill(o.payment_status)], ['Currency', esc(o.currency)]]))}
    </div>
    <div class="grid2">
      ${card('Order lines', table([{ label: '#', key: 'line' }, { label: 'Item', key: 'item' }, { label: 'Code', key: 'code', render: (r) => `<span class="mono">${esc(r.code)}</span>` }, { label: 'Type', key: 'kind', render: (r) => pill(r.kind, r.kind === 'Fee' ? 'warn' : '') }, { label: 'Amount excl. VAT', key: 'amount', num: true, render: (r) => (r.amount < 0 ? `(${num(-r.amount)})` : num(r.amount)) }], lines), `${lines.length} lines`)}
      ${card('Price information', price)}
    </div>
    <div class="grid2">
      ${card('Deliveries', table([{ label: 'Delivery', key: 'delivery_id' }, { label: 'Planned date', key: 'planned_date' }, { label: 'Location', key: 'location' }, { label: 'Status', key: 'status', render: (r) => statusPill(r.status.toUpperCase()) }], o.deliveries ?? []))}
      ${card('Events', `<ul class="timeline">${(o.events ?? []).map((e) => `<li><span class="when">${esc(e.timestamp)}</span><span>${title(e.event)}</span></li>`).join('') || '<li class="empty">No events.</li>'}</ul>`)}
    </div>
    ${card('Billing documents (Workday)', invs.filter(Boolean).length ? table([{ label: 'Customer Invoice', key: 'invoice_number', render: (r) => wd(r.invoice_number) }, { label: 'Type', key: 'invoice_type' }, { label: 'Status', key: 'status', render: (r) => statusPill(r.status) }, { label: 'Bill-To', key: 'bill_to_customer' }, { label: 'Invoice date', key: 'invoice_date' }, { label: 'Net', key: 'n', num: true, render: (r) => num(r.totals.subtotal) }, { label: 'Tax', key: 't', num: true, render: (r) => num(r.totals.tax_amount) }, { label: 'Total', key: 'tt', num: true, render: (r) => `<b>${num(r.totals.total_amount)}</b> ${esc(r.currency)}` }], invs.filter(Boolean)) : '<div class="empty">No billing document issued yet.</div>')}`
  window.scrollTo(0, 0)
}

/* ------------------------------- customers -------------------------------- */
async function customers() {
  nav('customers')
  const o = await get('poms/orders.json')
  const by = new Map()
  o.data.forEach((r) => { const c = by.get(r.buyer_customer_id) ?? { id: r.buyer_customer_id, name: r.buyer_name, address: r.buyer_address, company: r.company, sales_type: r.sales_type, orders: 0, vehicles: [], total: 0, currency: r.currency }; c.orders++; c.vehicles.push(r.model); c.total += r.total_price; by.set(r.buyer_customer_id, c) })
  const rows = [...by.values()].sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name))
  view.innerHTML = `<div class="crumbs">Customers</div><h1>Customers</h1><p class="lead">Ordering parties across markets, derived from confirmed orders.</p>
    ${card('Customers', table([{ label: 'Customer', key: 'name' }, { label: 'Customer ID', key: 'id', render: (r) => `<span class="mono">${esc(r.id)}</span>` }, { label: 'Company', key: 'company' }, { label: 'Sales type', key: 'sales_type' }, { label: 'Address', key: 'address' }, { label: 'Orders', key: 'orders', num: true }, { label: 'Models', key: 'v', render: (r) => [...new Set(r.vehicles)].join(', ') }, { label: 'Order value', key: 'total', num: true, render: (r) => `${num(r.total)} ${esc(r.currency)}` }], rows), `${rows.length} customers`)}`
}

/* ------------------------------- deliveries ------------------------------- */
async function deliveries() {
  nav('deliveries')
  const o = await get('poms/orders.json')
  const rows = o.data.flatMap((r) => (r.deliveries ?? []).map((d) => ({ ...d, order_number: r.order_number, company: r.company, buyer_name: r.buyer_name, model: r.model, vin: r.vin }))).sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
  view.innerHTML = `<div class="crumbs">Deliveries</div><h1>Deliveries</h1><p class="lead">Planned and completed handovers by delivery hub.</p>
    ${card('Deliveries', table([{ label: 'Delivery', key: 'delivery_id' }, { label: 'Order No', key: 'order_number', render: (r) => orderLink(r.order_number) }, { label: 'Company', key: 'company' }, { label: 'Customer', key: 'buyer_name' }, { label: 'Model', key: 'model' }, { label: 'VIN', key: 'vin', render: (r) => `<span class="mono">${esc(r.vin)}</span>` }, { label: 'Planned date', key: 'planned_date' }, { label: 'Location', key: 'location' }, { label: 'Status', key: 'status', render: (r) => statusPill(String(r.status).toUpperCase()) }], rows), `${rows.length} deliveries`)}`
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
  } catch (e) { view.innerHTML = `<div class="card"><div class="empty"><b>Record not found.</b> ${esc(e.message)} — <a href="#/">back to orders</a></div></div>` }
}
document.getElementById('gs').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  const q = e.target.value.trim()
  if (/^\d{8}$/.test(q)) location.hash = `#/order/${q}`
  else { f.q = q.toLowerCase(); location.hash = '#/'; list() }
})
window.addEventListener('hashchange', route); route()
