/* POMS — order management console. Static client over ../api/poms (+ ../api/workday for invoicing references). */
const API = '../api'
const view = document.getElementById('view')
const cache = new Map()
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
const num = (n, dp = 2) => (n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const plain = (n) => (n == null || n === '' ? '—' : Number.isInteger(Number(n)) ? String(Number(n)) : String(Math.round(Number(n) * 100) / 100))
const title = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const pill = (t, k = '') => `<span class="pill ${k}">${esc(t)}</span>`
const dash = (v) => (v === null || v === undefined || v === '' ? '<span class="dash">—</span>' : esc(v))
const wd = (i) => `<a href="../workday/index.html#/invoice/${encodeURIComponent(i)}" target="_blank" rel="noopener" title="Open in Workday">${esc(i)}</a>`
const orderLink = (n) => `<a href="#/order/${encodeURIComponent(n)}">${esc(n)}</a>`
const usTs = (iso) => { if (!iso) return '—'; const d = new Date(iso.replace(' UTC', 'Z').replace(' ', 'T')); if (isNaN(d)) return iso; return d.toLocaleString('en-US', { timeZone: 'UTC', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) }
const usTsUtc = (iso) => (iso ? usTs(iso) + ' UTC' : '—')
const STATUS_KIND = { delivered: 'ok', delivery_planning: 'warn', confirmed: 'info', ready_for_delivery: 'info', cancelled: 'bad' }
const statusDot = (s) => `<span class="dot ${STATUS_KIND[String(s).toLowerCase()] ?? ''}"></span>${title(s)}`
const statusPill = (s) => pill(title(s), STATUS_KIND[String(s).toLowerCase()] ?? { paid: 'ok', unpaid: 'warn', on_account: 'acc', financed: 'info', locked: 'ok', unlocked: 'bad', completed: 'ok', planned: 'warn', approved: 'ok', approval_requested: 'warn' }[String(s).toLowerCase()] ?? '')

async function get(p, optional = false) {
  if (cache.has(p)) return cache.get(p)
  const r = await fetch(`${API}/${p}`, { cache: 'no-store' })
  if (!r.ok) { if (optional) return null; throw new Error(`${r.status} ${p}`) }
  const j = await r.json(); cache.set(p, j); return j
}
function nav(active) { document.querySelectorAll('.links a').forEach((a) => a.classList.toggle('active', a.id === `nav-${active}`)) }
function table(cols, rows) {
  if (!rows.length) return '<div class="empty">No records.</div>'
  return `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}
const kvlist = (heading, rows) => `<div class="kvlist">${heading ? `<h3>${heading}</h3>` : ''}${rows.map((r) => r.length === 1 ? `<div class="kvrow"><span class="grp">${r[0]}</span></div>` : `<div class="kvrow"><label>${r[0]}</label><div class="v ${r[2] ?? ''}">${r[1]}</div></div>`).join('')}</div>`
function csv(rows, filename) {
  const cols = Object.keys(rows[0] ?? {})
  const cell = (v) => { const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')], { type: 'text/csv' })); a.download = filename; a.click()
}
window.csv = csv
function tabs(defs) {
  const id = 't' + Math.random().toString(36).slice(2, 7)
  setTimeout(() => {
    const host = document.getElementById(id); if (!host) return
    host.parentElement.querySelectorAll('.tab:not(.dim)').forEach((b) => b.addEventListener('click', () => {
      host.parentElement.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); b.classList.add('active')
      host.innerHTML = defs.find((d) => d[0] === b.dataset.k)[1]()
    }))
  }, 0)
  const dim = ['Discounts', 'Related orders', 'Vista']
  const all = [...defs.map((d) => d[0]), ...dim]
  return `<div class="tabs">${all.map((k, i) => `<button class="tab ${i === 0 ? 'active' : ''} ${dim.includes(k) ? 'dim' : ''}" data-k="${k}">${k}</button>`).join('')}</div><div id="${id}">${defs[0][1]()}</div>`
}

/* -------------------------------- orders ---------------------------------- */
const COLS = [
  { label: 'Order No', key: 'order_no', render: (r) => orderLink(r.order_no ?? r.order_number) },
  { label: 'Type', key: 'type', render: (r) => title(r.type) }, { label: 'Market', key: 'market' },
  { label: 'Status', key: 'order_status', render: (r) => statusDot(r.order_status) },
  { label: 'Lock State', key: 'lock_state', render: (r) => statusPill(r.lock_state) },
  { label: 'Financing Option', key: 'financing_option' },
  { label: 'Owner', key: 'owner', render: (r) => esc(r.owner ?? r.buyer_name) },
  { label: 'Car', key: 'model', render: (r) => `${esc(r.model)} (${r.model_year})` }, { label: 'VIN', key: 'vin', render: (r) => `<span class="mono">${esc(r.vin)}</span>` },
  { label: 'Sales Type', key: 'sales_type' }, { label: 'Sales Channel', key: 'sales_channel' },
  { label: 'Grand Total Price', key: 'grand_total_price', num: true, render: (r) => num(r.grand_total_price ?? r.total_price) },
  { label: 'Currency', key: 'currency' }, { label: 'Handover', key: 'handover_date' },
]
const f = { market: 'ALL', status: 'ALL', fin: 'ALL', type: 'ALL', lock: 'ALL', q: '' }
async function list() {
  nav('orders')
  const o = await get('poms/orders.json')
  const rows = o.data.filter((r) => (f.market === 'ALL' || r.market === f.market) && (f.status === 'ALL' || r.order_status === f.status) && (f.fin === 'ALL' || r.financing_option === f.fin) && (f.type === 'ALL' || r.type === f.type) && (f.lock === 'ALL' || r.lock_state === f.lock) && (!f.q || JSON.stringify(r).toLowerCase().includes(f.q)))
  window.__rows = rows.map(({ options, fees, deliveries, events, workday_invoices, roles, financing, timestamps, ...r }) => ({ ...r, ...Object.fromEntries(Object.entries(financing ?? {}).map(([k, v]) => ['financing_' + k, v])) }))
  const opt = (vals, cur, lbl) => `<option value="ALL" ${cur === 'ALL' ? 'selected' : ''}>${lbl}</option>` + vals.map((v) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(title(v))}</option>`).join('')
  const uniq = (k) => [...new Set(o.data.map((r) => r[k]).filter(Boolean))].sort()
  setTimeout(() => {
    const bind = (id, key) => view.querySelector(id).addEventListener('change', (e) => { f[key] = e.target.value; list() })
    bind('#f-mk', 'market'); bind('#f-st', 'status'); bind('#f-fin', 'fin'); bind('#f-type', 'type'); bind('#f-lock', 'lock')
    view.querySelector('#f-q').addEventListener('input', (e) => { f.q = e.target.value.trim().toLowerCase(); list() })
    view.querySelector('#f-reset').addEventListener('click', () => { Object.assign(f, { market: 'ALL', status: 'ALL', fin: 'ALL', type: 'ALL', lock: 'ALL', q: '' }); list() })
  }, 0)
  view.innerHTML = `<h1>Orders</h1><p class="lead">Confirmed vehicle orders across markets.</p>
    <div class="filters">
      <div><label>Market</label><select id="f-mk">${opt(uniq('market'), f.market, 'All markets')}</select></div>
      <div><label>Type</label><select id="f-type">${opt(uniq('type'), f.type, 'All types')}</select></div>
      <div><label>Status</label><select id="f-st">${opt(uniq('order_status'), f.status, 'All statuses')}</select></div>
      <div><label>Financing option</label><select id="f-fin">${opt(uniq('financing_option'), f.fin, 'All financing')}</select></div>
      <div><label>Lock state</label><select id="f-lock">${opt(uniq('lock_state'), f.lock, 'Any')}</select></div>
      <div><label>Search</label><input id="f-q" value="${esc(f.q)}" placeholder="Order no, VIN, owner"></div>
      <div><button class="btn" id="f-reset">Reset</button> <button class="btn" onclick="csv(window.__rows,'poms-orders.csv')">Export</button></div>
      <span class="count">${rows.length} of ${o.data.length} orders</span>
    </div>
    ${table(COLS, rows)}`
  window.scrollTo(0, 0)
}

/* ----------------------------- order detail ------------------------------- */
async function detail(n) {
  nav('orders')
  const o = (await get(`poms/orders/${n}.json`)).data
  const invs = (await Promise.all((o.workday_invoices ?? []).map((i) => get(`workday/customer-invoices/${i}.json`, true).then((x) => x?.data)))).filter(Boolean)
  const ts = o.timestamps ?? {}
  const fin = o.financing ?? {}
  const car = `${o.model} (${o.model_year})`
  const extras = (o.options ?? []).length ? o.options.map((x) => x.description).join(', ') : 'No extras'

  const overview = () => `<h2 class="sec">Summary</h2>
    <div class="sum">
      <div class="row"><div class="t">Products</div><div><div class="cell"><label>Car</label><div class="v">${esc(car)}<span class="arrow">→</span></div></div></div><div><div class="cell"><label>Extras</label><div class="v">${esc(extras)}</div></div></div></div>
      <div class="row"><div class="t">Timeline</div>
        <div><div class="cell"><label>Created at</label><div class="v">${usTs(ts.created_at)}</div></div><div class="cell"><label>Locked at</label><div class="v">${usTs(ts.locked_at ?? o.locked_at)}</div></div><div class="cell"><label>Last updated</label><div class="v">${usTs(ts.updated_at ?? o.poms_last_updated)}</div></div></div>
        <div><div class="cell"><label>Confirmed at</label><div class="v">${usTs(ts.confirmed_at)}</div></div><div class="cell"><label>Handover completed at</label><div class="v">${usTs(ts.handover_completed_at)}</div></div></div></div>
      <div class="row"><div class="t">Sales Process</div><div><div class="cell"><label>Sales channel</label><div class="v">${esc(o.sales_channel)}</div></div><div class="cell"><label>Is SME order</label><div class="v">${o.is_sme_order ? 'Yes' : 'No'}</div></div></div><div><div class="cell"><label>Sales type</label><div class="v">${esc(o.sales_type)}</div></div></div></div>
      <div class="row"><div class="t">Roles</div><div><div class="cell"><label>Orderer</label><div class="v">${esc(o.roles?.orderer ?? o.buyer_contact ?? o.buyer_name)}</div></div><div class="cell"><label>Owner</label><div class="v">${esc(o.roles?.owner ?? o.owner ?? o.buyer_name)}</div></div></div><div><div class="cell"><label>Buyer</label><div class="v">${esc(o.roles?.buyer ?? o.buyer_name)}</div></div><div class="cell"><label>Buyer address</label><div class="v">${esc(o.buyer_address ?? '')}</div></div></div></div>
    </div>
    <h2 class="sec" style="margin-top:28px">Details</h2>
    ${kvlist('', [
      ['Order No', esc(o.order_no ?? o.order_number), 'hl'], ['Order Type', esc(o.type), 'hl'], ['Sales Channel', esc(o.sales_channel), 'hl'],
      ['Order To Delivery Flow', dash(o.order_to_delivery_flow), 'hl'], ['Logistic Flow', dash(o.logistic_flow)],
      ['Order Status', esc(o.order_status), 'hl'], ['Communicated Delivery Status', dash(o.communicated_delivery_status), 'hl'],
      ['Extras status', dash(o.extras_status), 'hl'], ['Protection status', dash(o.protection_status), 'hl'],
      ['Market', esc(o.market), 'hl'], ['Is SME Order', o.is_sme_order ? '✔' : '<span style="color:#d33">⊗</span>'], ['Sales Type', esc(o.sales_type), 'hl'],
      ['Configuration ID', `<span class="mono">${esc(o.configuration_id)}</span>`], ['Car', `<b>${esc(car)}</b>`], ['VIN', `<span class="mono">${esc(o.vin)}</span>`], ['Licence Plate', dash(o.license_plate)],
      ['Cycle State', dash(o.cycle_state), 'hl'],
      ['Timestamps'],
      ['Created At', usTsUtc(ts.created_at), 'hl'], ['Updated At', usTsUtc(ts.updated_at ?? o.poms_last_updated), 'hl'], ['Confirmed at', usTsUtc(ts.confirmed_at), 'hl'],
      ['CSL Accepted At', dash(null)], ['Terms And Conditions Accepted At', dash(null)],
      ['Lock'],
      ['Lock State', esc(o.lock_state), 'hl'], ['Unlock Reason', dash(o.unlock_reason)], ['Manually Unlocked Reason', dash(o.manually_unlocked_reason)],
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
  const eventsTab = () => `<ul class="timeline">${(o.events ?? []).map((e) => `<li><span class="when">${esc(e.timestamp)}</span><span>${title(e.event)}</span></li>`).join('') || '<li class="empty">No events.</li>'}</ul>`

  view.innerHTML = `<h1>Order ${esc(o.order_no ?? o.order_number)}</h1><div class="idline">ID: ${esc(o.id ?? '')}</div>
    <div class="headgrid">
      <div><label>Configuration ID</label><div class="v mono">${esc(o.configuration_id ?? '')}</div></div>
      <div><label>Type</label><div class="v">${esc(title(o.type))}</div></div>
      <div><label>Market</label><div class="v">${esc(o.market)}</div></div>
      <div><label>Status</label><div class="v">${statusDot(o.order_status)}</div></div>
    </div>
    ${tabs([['Overview', overview], ['Order lines', linesTab], ['Deliveries', deliveriesTab], ['Pricing', pricingTab], ['Financing', financingTab], ['Invoicing', invoicingTab], ['Events', eventsTab]])}`
  window.scrollTo(0, 0)
}

/* ------------------------------- customers -------------------------------- */
async function customers() {
  nav('customers')
  const o = await get('poms/orders.json')
  const by = new Map()
  o.data.forEach((r) => { const k = r.owner_customer_id ?? r.buyer_customer_id; const c = by.get(k) ?? { id: k, name: r.owner ?? r.buyer_name, address: r.buyer_address, market: r.market, sales_type: r.sales_type, orders: 0, total: 0, currency: r.currency }; c.orders++; c.total += (r.grand_total_price ?? r.total_price); by.set(k, c) })
  const rows = [...by.values()].sort((a, b) => a.market.localeCompare(b.market) || a.name.localeCompare(b.name))
  view.innerHTML = `<h1>Customers</h1><p class="lead">Owners across markets, derived from confirmed orders.</p>
    ${table([{ label: 'Owner', key: 'name' }, { label: 'Customer ID', key: 'id', render: (r) => `<span class="mono">${esc(r.id)}</span>` }, { label: 'Market', key: 'market' }, { label: 'Sales type', key: 'sales_type' }, { label: 'Address', key: 'address' }, { label: 'Orders', key: 'orders', num: true }, { label: 'Order value', key: 'total', num: true, render: (r) => `${num(r.total)} ${esc(r.currency)}` }], rows)}`
}

/* ------------------------------- deliveries ------------------------------- */
async function deliveries() {
  nav('deliveries')
  const o = await get('poms/orders.json')
  const rows = o.data.flatMap((r) => (r.deliveries ?? []).map((d) => ({ ...d, order_no: r.order_no ?? r.order_number, market: r.market, owner: r.owner ?? r.buyer_name, car: `${r.model} (${r.model_year})`, vin: r.vin }))).sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
  view.innerHTML = `<h1>Deliveries</h1><p class="lead">Planned and completed handovers by delivery hub.</p>
    ${table([{ label: 'Delivery', key: 'delivery_id' }, { label: 'Order No', key: 'order_no', render: (r) => orderLink(r.order_no) }, { label: 'Market', key: 'market' }, { label: 'Owner', key: 'owner' }, { label: 'Car', key: 'car' }, { label: 'VIN', key: 'vin', render: (r) => `<span class="mono">${esc(r.vin)}</span>` }, { label: 'Planned date', key: 'planned_date' }, { label: 'Location', key: 'location' }, { label: 'Status', key: 'status', render: (r) => statusPill(r.status) }], rows)}`
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
