/* Workday customer invoicing — static client over ../api/workday (+ POMS for the Sales Order link).
   Layout variant 3 ("hashed"): label/value pairs are sibling <div>s with the label carried in aria-label
   (two fields show only an icon); every class name is hashed and regenerated on each render; the record
   and list views carry no ids; section headings are role=heading divs; tabs are role=tab divs; worklist
   rows open the invoice on click (no link in the row). Data, routes and behaviour are those of bv-poc. */
const API = '../api'
const view = document.querySelector('main')
const cache = new Map()

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
const num = (n, dp = 2) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const paren = (n, dp = 2) => (Number(n) < 0 ? `(${num(-n, dp)})` : num(n, dp))   // Workday shows negatives in parentheses
const title = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const wdDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const wdMoment = (iso) => (iso ? `${wdDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '')
const link = (route, id, text) => `<a href="#/${route}/${encodeURIComponent(id)}">${esc(text ?? id)}</a>`
const pomsLink = (o) => (o ? `<a href="../poms/index.html#/order/${encodeURIComponent(o)}" target="_blank" rel="noopener" title="Open in POMS">${esc(o)}</a>` : '')
const chip = (t, k = '') => `<span class="${H.chip} ${k ? H[k] : ''}">${esc(t)}</span>`
const statusChip = (s) => chip(title(s), { DRAFT: 'warn', APPROVED: 'ok', PAID: 'ok', UNPAID: '', IN_PROGRESS: 'info' }[s] || '')

async function get(path, optional = false) {
  if (cache.has(path)) return cache.get(path)
  const r = await fetch(`${API}/${path}`, { cache: 'no-store' })
  if (!r.ok) { if (optional) return null; throw new Error(`${r.status} ${path}`) }
  const j = await r.json()
  cache.set(path, j)
  return j
}

/* ------------------ hashed class names, regenerated on every render ------------------ */
const NAMES = ['inner', 'titlebar', 'obj', 'dots', 'ttools', 'band', 'kv', 'amt', 'pair', 'lab', 'val', 'empty', 'icolab', 'cols', 'col', 'sech',
  'closed', 'kvl', 'wt', 'tabwrap', 'taskhead', 'title', 'actions', 'btn', 'primary', 'bdots', 'crumbs', 'report', 'phh', 'panel', 'ph', 'count',
  'ptools', 'pb', 'gridtools', 'on', 'fields', 'two', 'toggle', 'mono', 'prompt', 'row', 'tabs', 'tab', 'active', 'scroll', 'num', 'wrap', 'icon',
  'clickrow', 'lnk', 'toolbar', 'chip', 'warn', 'ok', 'info', 'note', 'hist', 'when', 'gridhost']
const H = {}
let dynStyle = null
function rehash() {
  const used = new Set()
  NAMES.forEach((n) => { let h; do { h = 'x' + Math.random().toString(16).slice(2, 7).padEnd(5, '0') } while (used.has(h)); used.add(h); H[n] = h })
  if (!dynStyle) { dynStyle = document.createElement('style'); document.head.appendChild(dynStyle) }
  dynStyle.textContent = DYN_CSS.replace(/\.\{(\w+)\}/g, (_, n) => { if (!H[n]) throw new Error(`unknown class ${n}`); return '.' + H[n] })
}
// The record / list styling, written against the hashed names (the static style.css only has the chrome)
const DYN_CSS = `
.{inner}{padding:16px 26px 0}
.{titlebar}{background:#6f7378;color:#fff;display:flex;align-items:center;gap:12px;padding:0 22px;height:46px}
.{titlebar} [role=heading]{font-size:17px;font-weight:600;margin:0;color:#fff}
.{obj}{font-size:13px;opacity:.95}
.{dots}{border:1px solid rgba(255,255,255,.6);border-radius:10px;color:#fff;background:none;padding:0 7px;font-weight:700;line-height:16px;cursor:pointer}
.{ttools}{margin-left:auto;display:flex;gap:14px;font-size:15px;opacity:.9}
.{band}{display:flex;gap:40px;padding:14px 22px 8px;border-bottom:1px solid var(--line-soft);background:#fff}
.{kv}{display:flex;flex-direction:column;gap:6px;font-size:12.5px}
.{kv} .{pair}{display:grid;grid-template-columns:110px auto;gap:0 18px}
.{kv} .{lab}{color:var(--muted)}
.{amt}{display:flex;gap:26px;border-left:1px solid var(--line);padding-left:26px}
.{amt} .{lab}{font-size:11.5px;color:var(--muted);margin-bottom:2px}
.{cols}{display:grid;grid-template-columns:repeat(3,1fr);gap:0 28px;padding:6px 22px 4px;background:#fff}
.{sech}{font-size:15px;font-weight:600;margin:14px 0 8px;display:flex;align-items:center;gap:8px;cursor:pointer}
.{sech}:before{content:"⌵";color:var(--wd-blue);font-size:12px}
.{sech}.{closed}:before{content:"›"}
.{sech}.{closed} + .{kvl}{display:none}
.{kvl}{display:flex;flex-direction:column;gap:9px;font-size:12.5px}
.{kvl} .{pair}{display:grid;grid-template-columns:150px 1fr;gap:0 12px}
.{kvl} .{lab}{color:var(--ink)}
.{kvl} .{val}{min-height:16px}
.{val}.{empty}{color:#9aa0a6}
.{icolab}{font-size:13px}
.{wt} div{margin-bottom:3px}
.{tabwrap}{padding:0 22px}
@media (max-width:1100px){.{cols}{grid-template-columns:1fr}}
.{taskhead}{display:flex;align-items:flex-start;gap:14px;margin:4px 0 16px}
.{taskhead} [role=heading]{font-size:22px;font-weight:400;margin:0;color:#1f2933}
.{taskhead} .{obj}{font-size:13px;color:var(--muted);margin-top:3px}
.{actions}{margin-left:auto;display:flex;gap:6px;align-items:center}
.{btn}{border:1px solid var(--line);background:#fff;border-radius:3px;padding:5px 12px;cursor:pointer;color:var(--ink)}
.{btn}:hover{border-color:#aab2bb}
.{btn}.{primary}{background:var(--wd-blue);border-color:var(--wd-blue);color:#fff}
.{btn}.{bdots}{padding:2px 9px;font-weight:700;letter-spacing:1px}
.{crumbs}{font-size:12px;color:var(--muted);margin-bottom:6px}
.{report}{font-size:22px;font-weight:400;margin:4px 0 14px;color:#1f2933}
.{phh}{font-size:14px;font-weight:600;margin:0}
.{panel}{background:var(--paper);border:1px solid var(--line);border-radius:3px;margin-bottom:14px}
.{ph}{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--line-soft);background:#fff}
.{ph} .{count}{font-size:12px;color:var(--muted)}
.{ptools}{margin-left:auto;display:flex;gap:4px}
.{pb}{padding:12px 14px}
.{gridtools} span{display:inline-flex;width:26px;height:24px;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:3px;background:#fff;color:#555;font-size:13px;cursor:pointer}
.{gridtools} span:hover{background:var(--head)}
.{gridtools} span.{on}{background:#e6e8eb}
.{fields}{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px 26px;padding:14px}
.{fields}.{two}{grid-template-columns:repeat(2,minmax(230px,1fr))}
.{fields} .{lab}{display:block;font-size:11.5px;color:var(--muted);margin-bottom:2px}
.{fields} .{val}{font-size:13px;min-height:18px;line-height:1.45}
.{fields} .{val}.{empty}{color:#b0b4ba}
.{toggle}{border:0;background:none;padding:0;cursor:pointer;color:var(--ink);font-weight:600;font-size:13px;display:flex;align-items:center;gap:8px}
.{toggle}:before{content:"▼";font-size:9px;color:var(--muted)}
.{toggle}[aria-expanded="false"]:before{content:"▶"}
.{mono}{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
.{prompt}{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px 22px;padding:12px 14px 14px}
.{prompt} .{lab}{display:block;font-size:11.5px;color:var(--muted);margin-bottom:3px}
.{prompt} select,.{prompt} input{width:100%;height:30px;border:1px solid var(--line);border-radius:3px;padding:0 8px;background:#fff}
.{prompt} .{row}{display:flex;gap:8px;align-items:flex-end;justify-content:flex-end;grid-column:1/-1}
.{prompt} .{row} .{btn}.{primary}{padding:5px 18px}
.{tabs}{display:flex;gap:2px;border-bottom:1px solid var(--line);margin:14px 0 12px}
.{tab}{padding:10px 14px;cursor:pointer;color:#555;border-bottom:2px solid transparent;margin-bottom:-1px;user-select:none}
.{tab}:hover{color:var(--wd-blue)}
.{tab}.{active}{color:var(--wd-blue);border-bottom-color:var(--wd-blue);font-weight:600}
.{scroll}{overflow:auto}
th.{num},td.{num}{text-align:right}
td.{wrap}{white-space:normal;min-width:220px;max-width:380px}
td .{icon}{color:#8a8f97;margin-right:4px;font-size:11px}
.{clickrow}{cursor:pointer}
.{lnk}{color:var(--wd-blue)}
.{clickrow}:hover .{lnk}{text-decoration:underline}
.{toolbar}{display:flex;gap:8px;align-items:center;margin:0 0 10px}
.{toolbar} input{height:30px;border:1px solid var(--line);border-radius:3px;padding:0 10px;min-width:280px}
.{toolbar} .{count}{font-size:12px;color:var(--muted);margin-left:auto}
.{chip}{display:inline-block;font-size:11px;padding:1px 8px;border-radius:9px;background:var(--neutral-bg);color:#444;vertical-align:middle}
.{chip}.{warn}{background:var(--warn-bg);color:var(--warn)}
.{chip}.{ok}{background:var(--ok-bg);color:var(--ok)}
.{chip}.{info}{background:var(--wd-blue-soft);color:var(--wd-blue-dark)}
p.{note}{font-size:12.5px;color:var(--muted);margin:6px 0;line-height:1.55}
.{hist}{list-style:none;margin:0;padding:0}
.{hist} li{display:grid;grid-template-columns:230px 150px 170px 1fr;gap:12px;padding:9px 14px;border-bottom:1px solid var(--line-soft)}
.{hist} li:last-child{border-bottom:0}
.{hist} .{when}{color:var(--muted);font-size:12px}
`

/* ------------------------------ building blocks --------------------------- */
const heading = (level, text, cls = '', attrs = '') => `<div role="heading" aria-level="${level}" class="${cls}" ${attrs}>${text}</div>`
const gridTools = (exportFn) => `<div class="${H.gridtools}"><span title="Export to Excel" onclick="${exportFn}">⇩</span><span title="Filter">▽</span><span title="Chart">▥</span><span title="Column preferences">⚙</span><span title="Expand">⤢</span><span class="${H.on}" title="Grid">▦</span></div>`
const panel = (head, body, count = '', tools = '') =>
  `<div class="${H.panel}"><div class="${H.ph}">${heading(2, head, H.phh)}${count ? `<span class="${H.count}">${count}</span>` : ''}${tools ? `<div class="${H.ptools}">${tools}</div>` : ''}</div>${body}</div>`
const isEmpty = (v) => v === '' || v === null || v === undefined
// A label/value pair: two sibling <div>s. The label text travels in aria-label on the value (or, with a
// test id, on the wrapper). opts.icon replaces the visible label by an icon, so aria-label is the only label.
const pair = (l, v, o = {}) => {
  const lab = o.icon ? `<div class="${H.lab} ${H.icolab}" aria-hidden="true">${o.icon}</div>` : `<div class="${H.lab}">${l}</div>`
  const val = `<div class="${H.val} ${isEmpty(v) ? H.empty : ''}"${o.testid ? '' : ` aria-label="${esc(l)}"`}>${isEmpty(v) ? '(empty)' : v}</div>`
  return `<div class="${H.pair}"${o.testid ? ` data-testid="${o.testid}" aria-label="${esc(l)}"` : ''}>${lab}${val}</div>`
}
const fields = (rows, cls = '') => `<div class="${H.fields} ${cls === 'two' ? H.two : ''}">${rows.map(([l, v]) => pair(l, v)).join('')}</div>`
const kvl = (rows) => `<div class="${H.kvl}">${rows.map(([l, v, o]) => pair(l, v, o)).join('')}</div>`

function table(cols, rows, open) {
  if (!rows.length) return '<div class="empty">No data available.</div>'
  const head = cols.map((c) => `<th class="${c.num ? H.num : ''}">${c.label}</th>`).join('')
  const body = rows.map((r) => `<tr${open ? ` class="${H.clickrow}" role="button" tabindex="0"` : ''}>${cols.map((c) => `<td class="${c.num ? H.num : ''} ${c.wrap ? H.wrap : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')
  return `<div class="${H.scroll}"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}
// Rows rendered with `open` navigate on click or Enter; links inside a row keep their own target
function bindRows(host, rows, open) {
  host.querySelectorAll('tr[role="button"]').forEach((tr, i) => {
    const go = (e) => { if (e.target.closest('a')) return; location.hash = open(rows[i]) }
    tr.addEventListener('click', go)
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e) })
  })
}

function page(crumbs, head, html) {
  view.innerHTML = `<div class="${H.inner}"><div class="${H.crumbs}">${crumbs}</div>${heading(1, head, H.report)}${html}</div>`
  window.scrollTo(0, 0)
}
const home = '<a href="#/">Customer Invoices</a>'

function tabs(defs) {
  const active = H.active
  setTimeout(() => {
    const list = view.querySelector('[role="tablist"]')
    if (!list) return
    const host = list.nextElementSibling
    list.querySelectorAll('[role="tab"]').forEach((b, i) => b.addEventListener('click', () => {
      list.querySelectorAll('[role="tab"]').forEach((x) => { x.classList.remove(active); x.setAttribute('aria-selected', 'false') })
      b.classList.add(active); b.setAttribute('aria-selected', 'true')
      host.innerHTML = defs[i][1]()
    }))
  }, 0)
  return `<div class="${H.tabs}" role="tablist">${defs.map(([l], i) => `<div class="${H.tab} ${i === 0 ? active : ''}" role="tab" tabindex="0" aria-selected="${i === 0}">${l}</div>`).join('')}</div><div role="tabpanel">${defs[0][1]()}</div>`
}

function csvDownload(rows, filename) {
  const cols = Object.keys(rows[0] ?? {})
  const cell = (v) => { const t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
}
window.csvDownload = csvDownload
const ctl = (name) => view.querySelector(`[aria-label="${name}"]`)
const btn = (text) => [...view.querySelectorAll('button')].find((b) => b.textContent.trim() === text)
const filterInput = () => view.querySelector('input[placeholder="Filter results"]')

/* ------------------------- Find Customer Invoices ------------------------- */
const INV_COLS = [
  { label: 'Customer Invoice', key: 'invoice_number', render: (r) => `<span class="${H.lnk}">Customer Invoice: ${esc(r.invoice_number)}</span>` },
  { label: 'Company', key: 'company_name' },
  { label: 'Legal Entity', key: 'legal_entity' },
  { label: 'Customer', key: 'customer', render: (r) => link('customer', r.customer_id ?? r.bill_to_customer_id, r.customer ?? r.bill_to_customer) },
  { label: 'Bill-To Customer', key: 'bill_to_customer' },
  { label: 'Sold-To Customer', key: 'sold_to_customer' },
  { label: 'Invoice Type', key: 'invoice_type' },
  { label: 'Document', key: 'document_kind' },
  { label: 'Invoice Date', key: 'invoice_date', render: (r) => wdDate(r.invoice_date) },
  { label: 'Due Date', key: 'due_date', render: (r) => wdDate(r.due_date) },
  { label: 'Invoice Status', key: 'status', render: (r) => statusChip(r.status) },
  { label: 'Payment Status', key: 'payment_status', render: (r) => title(r.payment_status ?? 'Unpaid') },
  { label: 'Sales Order', key: 'sales_order', render: (r) => pomsLink(r.sales_order ?? r.poms_order_number) },
  { label: 'PO Number', key: 'po_number' },
  { label: 'VIN', key: 'vin', render: (r) => `<span class="${H.mono}">${esc(r.vin ?? '')}</span>` },
  { label: 'Model', key: 'model' },
  { label: 'Net Invoice Amount', key: 'subtotal', num: true, render: (r) => paren(r.subtotal) },
  { label: 'Tax Amount', key: 'tax_amount', num: true, render: (r) => paren(r.tax_amount) },
  { label: 'Total Invoice Amount', key: 'total_amount', num: true, render: (r) => `<b>${paren(r.total_amount)}</b>` },
  { label: 'Amount Due', key: 'amount_due', num: true, render: (r) => paren(r.amount_due ?? r.total_amount) },
  { label: 'Currency', key: 'currency' },
]
const openInvoice = (r) => `#/invoice/${encodeURIComponent(r.invoice_number)}`

const filters = { company: 'ALL', status: 'ALL', payment: 'ALL', type: 'ALL', customer: '', from: '', to: '' }
let promptOpen = true
async function worklist() {
  rehash()
  const [inv, cos] = await Promise.all([get('workday/customer-invoices.json'), get('workday/companies.json')])
  const all = inv.data
  const rows = all.filter((r) =>
    (filters.company === 'ALL' || r.company === filters.company) &&
    (filters.status === 'ALL' || r.status === filters.status) &&
    (filters.payment === 'ALL' || (r.payment_status ?? 'UNPAID') === filters.payment) &&
    (filters.type === 'ALL' || r.invoice_type === filters.type) &&
    (!filters.customer || `${r.customer} ${r.bill_to_customer} ${r.sold_to_customer}`.toLowerCase().includes(filters.customer.toLowerCase())) &&
    (!filters.from || r.invoice_date >= filters.from) && (!filters.to || r.invoice_date <= filters.to))
  const opt = (vals, cur, all = 'All') => `<option value="ALL" ${cur === 'ALL' ? 'selected' : ''}>${all}</option>` + vals.map((v) => `<option value="${esc(v[0])}" ${cur === v[0] ? 'selected' : ''}>${esc(v[1])}</option>`).join('')
  const types = [...new Set(all.map((r) => r.invoice_type).filter(Boolean))].sort()
  window.__rows = rows

  setTimeout(() => {
    const t = view.querySelector('.' + H.toggle), p = view.querySelector('[role="region"]')
    t.addEventListener('click', () => { promptOpen = !promptOpen; t.setAttribute('aria-expanded', String(promptOpen)); p.hidden = !promptOpen })
    btn('OK').addEventListener('click', () => {
      filters.company = ctl('Company').value; filters.status = ctl('Invoice Status').value
      filters.payment = ctl('Payment Status').value; filters.type = ctl('Invoice Type').value
      filters.customer = ctl('Customer').value.trim(); filters.from = ctl('Invoice Date On or After').value; filters.to = ctl('Invoice Date On or Before').value
      worklist()
    })
    btn('Reset').addEventListener('click', () => { Object.assign(filters, { company: 'ALL', status: 'ALL', payment: 'ALL', type: 'ALL', customer: '', from: '', to: '' }); worklist() })
    const grid = view.querySelector('.' + H.gridhost), countEl = view.querySelector('[role="status"]')
    bindRows(grid, rows, openInvoice)
    filterInput().addEventListener('input', (e) => {
      const s = e.target.value.trim().toLowerCase()
      const hit = s ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s)) : rows
      grid.innerHTML = table(INV_COLS, hit, openInvoice)
      bindRows(grid, hit, openInvoice)
      countEl.textContent = `${hit.length} items`
      window.__rows = hit
    })
  }, 0)

  const field = (l, control) => `<div><span class="${H.lab}">${l}</span>${control}</div>`
  page(home, 'Find Customer Invoices - OTC',
    `<div class="${H.panel}"><div class="${H.ph}"><button class="${H.toggle}" aria-expanded="${promptOpen}">Details</button></div>
      <div class="${H.prompt}" role="region" aria-label="Details" ${promptOpen ? '' : 'hidden'}>
        ${field('Company', `<select aria-label="Company">${opt(cos.data.map((c) => [c.company, c.company_name]), filters.company, 'All Companies')}</select>`)}
        ${field('Customer', `<input aria-label="Customer" value="${esc(filters.customer)}" placeholder="Customer name">`)}
        ${field('Invoice Status', `<select aria-label="Invoice Status">${opt([['DRAFT', 'Draft'], ['APPROVED', 'Approved']], filters.status)}</select>`)}
        ${field('Payment Status', `<select aria-label="Payment Status">${opt([['UNPAID', 'Unpaid'], ['PAID', 'Paid']], filters.payment)}</select>`)}
        ${field('Invoice Type', `<select aria-label="Invoice Type">${opt(types.map((t) => [t, t]), filters.type)}</select>`)}
        ${field('Invoice Date On or After', `<input aria-label="Invoice Date On or After" type="date" value="${esc(filters.from)}">`)}
        ${field('Invoice Date On or Before', `<input aria-label="Invoice Date On or Before" type="date" value="${esc(filters.to)}">`)}
        <div class="${H.row}"><button class="${H.btn}">Reset</button><button class="${H.btn} ${H.primary}">OK</button></div>
      </div></div>
    <div class="${H.toolbar}"><input placeholder="Filter results"><span class="${H.count}" role="status">${rows.length} items</span></div>
    ${panel('Customer Invoices', `<div class="${H.gridhost}">${table(INV_COLS, rows, openInvoice)}</div>`, '', gridTools("csvDownload(window.__rows,'customer-invoices.csv')"))}`)
}

/* ---------------------------- View Customer Invoice ----------------------- */
const addr = (a) => (a ? `<span class="${H.icon}">⌖</span><a>${esc(a)}</a>` : '')

async function invoiceDetail(id) {
  rehash()
  const d = (await get(`workday/customer-invoices/${id}.json`)).data
  const order = (d.sales_order || d.poms_order_number) ? (await get(`poms/orders/${d.sales_order || d.poms_order_number}.json`, true))?.data : null
  window.__inv = d.lines
  const amountDue = d.totals.amount_due ?? d.totals.total_amount
  const so = d.sales_order || d.poms_order_number
  const wt = d.worktags || {}

  const info = kvl([
    ['Company', `<a>${esc(d.company_name)}</a>`],
    ['Legal Entity', d.legal_entity ? esc(d.legal_entity) : ''],
    ['Bill-To Customer', link('customer', d.bill_to_customer_id, d.bill_to_customer)],
    ['Sold-To Customer', link('customer', d.sold_to_customer_id, d.sold_to_customer)],
    ['Invoice Number', esc(d.invoice_number)],
    ['Invoice Type', esc(d.invoice_type ?? d.document_kind)],
    // icon-only label: the field name exists only in aria-label
    ['Invoice Date', wdDate(d.invoice_date), { icon: '📅' }],
    ['Bill-To Address', addr(d.bill_to_address)],
    ['Bill-To Contact', d.bill_to_contact ? esc(d.bill_to_contact) : ''],
    ['Delivery Type', esc(d.delivery_type ?? 'Email')],
    ['Delivery Type Origin', esc(d.delivery_type_origin ?? 'Customer')],
    ['Ship-To Customer', `<a>${esc(d.ship_to_customer)}</a>`],
    ['Ship-To Address', addr(d.ship_to_address)],
  ])
  const additional = kvl([
    ['Payment Type', d.payment_type ? esc(d.payment_type) : ''],
    ['Reference Type', esc(d.reference_type ?? 'Standard')],
    ['Payment Terms', esc(d.payment_terms)],
    ['Due Date', wdDate(d.due_date)],
    ['Discount Date', d.discount_date ? wdDate(d.discount_date) : ''],
    ['PO Number', d.po_number ? esc(d.po_number) : ''],
    ['Memo', d.memo ? esc(d.memo) : esc(d.invoice_type ?? '')],
    ['Printed', esc(d.printed ?? 'No')],
    ['Latest Print Date', d.latest_print_date ? wdMoment(d.latest_print_date) : ''],
    ['Worktags', `<div class="${H.wt}"><div><a>Model: ${esc(wt.model ?? d.model)}</a></div><div>Sales Order: ${pomsLink(so)}</div><div><a>Vehicle Identifier Number: <span class="${H.mono}">${esc(wt.vehicle_identifier_number ?? d.vin)}</span></a></div>${d.statutory_invoice_type ? `<div><a>Statutory Invoice Type: ${esc(d.statutory_invoice_type)}</a></div>` : ''}${d.statutory_invoice_number ? `<div><a>Statutory Invoice Number: ${esc(d.statutory_invoice_number)}</a></div>` : ''}</div>`],
  ])
  const amounts = kvl([
    ['Currency', `<a>${esc(d.currency)}</a>`],
    ['Default Tax Code', `<a>${esc(d.tax.tax_code)}</a>`],
    ['Net Invoice Amount', paren(d.totals.subtotal)],
    ['Tax Amount', paren(d.totals.tax_amount)],
    ['Total Invoice Amount', paren(d.totals.total_amount)],
    ['Less Withholding Amount', '0.00'],
    ['Control Total Amount', '0.00'],
    ['Amount Due', paren(amountDue)],
  ])

  const LINE_COLS = [
    { label: 'Line', key: 'line', render: () => `<span class="${H.icon}">🔍</span>` },
    { label: 'Company', key: 'company', render: (r) => `<a>${esc(r.company)}</a>` },
    { label: 'Sales Item', key: 'sales_item_name', render: (r) => `<a>${esc(r.sales_item_name)}</a>` },
    { label: 'Revenue Category', key: 'revenue_category', render: (r) => `<a>${esc(r.revenue_category)} ${esc(r.revenue_category_name)}</a>` },
    { label: 'Line Item Description', key: 'line_item_description', wrap: true },
    { label: 'Quantity', key: 'quantity', num: true },
    { label: 'Unit of Measure', key: 'unit_of_measure' },
    { label: 'Quantity 2', key: 'quantity_2', num: true },
    { label: 'Unit of Measure 2', key: 'unit_of_measure_2' },
    { label: 'Unit Price', key: 'unit_price', num: true, render: (r) => paren(r.unit_price) },
    { label: 'Released on Invoice Lines', key: 'released_on_invoice_lines' },
    { label: 'Extended Amount', key: 'extended_amount', num: true, render: (r) => paren(r.extended_amount) },
    { label: 'Transaction Date', key: 'transaction_date' },
    { label: 'From Date', key: 'from_date' }, { label: 'To Date', key: 'to_date' },
    { label: 'Contract Line', key: 'contract_line' }, { label: 'Deferred Revenue', key: 'deferred_revenue' },
    { label: 'Revenue Recognition Schedule Template', key: 'revenue_recognition_schedule_template' },
    { label: 'Ship-From Address', key: 'ship_from_address' },
    { label: 'Ship-To Customer', key: 'ship_to_customer', render: (r) => (r.ship_to_customer ? `<a>${esc(r.ship_to_customer)}</a>` : '') },
    { label: 'Ship-To Address', key: 'ship_to_address', wrap: true },
    { label: 'Tax Applicability', key: 'tax_applicability', render: () => `<a>${esc(d.tax.tax_code.split(' ')[0])} Sale of Goods Services</a>` },
  ]
  const linesTab = () => panel('Invoice Lines', table(LINE_COLS, d.lines), `${d.lines.length} item${d.lines.length === 1 ? '' : 's'}`, gridTools(`csvDownload(window.__inv,'${esc(d.invoice_number)}-lines.csv')`))
  const fxTab = () => panel('Currency Rate', fields([['Transaction Currency', esc(d.currency)], ['Company Currency', esc(d.currency)], ['Currency Rate', '1.000000'], ['Currency Rate Type', 'Current'], ['Rate Date', wdDate(d.invoice_date)]]))
  const taxTab = () => panel('Tax', table([
    { label: 'Tax Code', key: 'tax_code' }, { label: 'Tax Rate', key: 'rate', num: true, render: (r) => `${num(r.rate, 2)}%` },
    { label: 'Taxable Amount', key: 'taxable', num: true, render: (r) => paren(r.taxable) }, { label: 'Tax Amount', key: 'tax', num: true, render: (r) => paren(r.tax) },
    { label: 'Tax Applicability', key: 'app' }, { label: 'Tax Recoverability', key: 'rec' },
  ], [{ tax_code: d.tax.tax_code, rate: d.tax.tax_rate, taxable: d.tax.taxable_amount, tax: d.tax.tax_amount, app: 'Taxable', rec: '100% Recoverable' }]))
  const attTab = () => panel('Attachments', d.attachments?.length ? table([{ label: 'File', key: 'name' }, { label: 'Category', key: 'type' }, { label: 'Attached To', key: 'attached_to' }], d.attachments) : '<div class="empty">No attachments.</div>')
  const bpTab = () => panel('Business Process', `<ul class="${H.hist}">${(d.process_history ?? []).map((h) => `<li><b>${esc(h.step)}</b><span>${chip(h.status, h.status === 'Awaiting Action' ? 'warn' : h.status === 'Approved' ? 'ok' : '')}</span><span>${esc(h.person)}</span><span class="${H.when}">${wdMoment(h.moment)}${h.comment ? ` · ${esc(h.comment)}` : ''}</span></li>`).join('') || '<li>No history.</li>'}</ul>`)
  const errTab = () => panel('Errors & Warnings', '<div class="empty">No errors or warnings.</div>')
  const printTab = () => panel('Printing Runs', d.latest_print_date ? table([{ label: 'Print Run', key: 'r' }, { label: 'Moment', key: 'm' }, { label: 'Delivery Type', key: 'd' }, { label: 'Status', key: 's' }], [{ r: `PR-${d.invoice_number}`, m: wdMoment(d.latest_print_date), d: d.delivery_type ?? 'Email', s: 'Completed' }]) : '<div class="empty">Not yet printed.</div>')
  const notesTab = () => panel('Notes', `<div class="${H.pb}">${d.memo ? `<p class="${H.note}">${esc(d.memo)}</p>` : `<p class="${H.note}">No notes.</p>`}${d.payment_application ? `<p class="${H.note}">Payment ${esc(d.payment_application.payment_id)} for ${num(d.payment_application.amount)} ${esc(d.currency)} applied as <b>${esc(title(d.payment_application.applied_as))}</b> on ${wdDate(d.payment_application.payment_date)} (${esc(d.payment_application.factoring_partner)}).</p>` : ''}</div>`)

  // the section heading collapses its list
  setTimeout(() => view.querySelectorAll('.' + H.sech).forEach((h) => h.addEventListener('click', () => h.classList.toggle(H.closed))), 0)
  view.innerHTML = `<div class="${H.titlebar}">${heading(1, 'View Customer Invoice')}<span class="${H.obj}">${esc(d.invoice_number)}</span><button class="${H.dots}" title="Related Actions">···</button><div class="${H.ttools}"><span title="Export">⇩</span><span title="PDF">▤</span></div></div>
    <div class="${H.band}">
      <div class="${H.kv}">${pair('Invoice Status', title(d.status), { testid: 'invoice-status' })}${pair('Payment Status', title(d.payment_status ?? 'Unpaid'), { testid: 'payment-status' })}${pair('Finalized Date', d.finalized_date ? wdDate(d.finalized_date) : '(empty)', { testid: 'finalized-date' })}</div>
      <div class="${H.amt}">${pair('Total Invoice Amount', `${paren(d.totals.total_amount)} ${esc(d.currency)}`, { testid: 'total-invoice-amount' })}${pair('Amount Due', `${paren(amountDue)} ${esc(d.currency)}`, { testid: 'amount-due' })}</div>
    </div>
    <div class="${H.cols}">
      <div class="${H.col}">${heading(2, 'Invoice Information', H.sech)}${info}</div>
      <div class="${H.col}">${heading(2, 'Additional Information', H.sech)}${additional}</div>
      <div class="${H.col}">${heading(2, 'Amount Information', H.sech)}${amounts}</div>
    </div>
    <div class="${H.tabwrap}">${tabs([
      ['Invoice Lines', linesTab], ['Currency Rate', fxTab], ['Tax', taxTab], ['Attachments', attTab],
      ['Business Process', bpTab], ['Errors & Warnings', errTab], ['Printing Runs', printTab], ['Notes', notesTab],
    ])}</div>`
  window.scrollTo(0, 0)
}

/* ------------------------------ report: lines ----------------------------- */
function filterable(rows, cols, csvName, exportRows) {
  // toolbar + grid; the filter box re-renders the grid
  setTimeout(() => {
    const host = view.querySelector('.' + H.gridhost), countEl = view.querySelector('[role="status"]')
    filterInput().addEventListener('input', (e) => { const s = e.target.value.trim().toLowerCase(); const hit = s ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s)) : rows; host.innerHTML = table(cols, hit); countEl.textContent = `${hit.length} items` })
  }, 0)
  return [`<div class="${H.toolbar}"><input placeholder="Filter results"><span class="${H.count}" role="status">${rows.length} items</span></div>`, `<div class="${H.gridhost}">${table(cols, rows)}</div>`, gridTools(`csvDownload(${exportRows},'${csvName}')`)]
}

async function flatLines() {
  rehash()
  const payload = await get('workday/invoice-lines.json')
  const rows = payload.data
  const KEEP = ['invoice_number', 'line', 'company', 'invoice_type', 'status', 'customer', 'bill_to_customer', 'sold_to_customer', 'invoice_date', 'sales_item', 'sales_item_name', 'revenue_category', 'revenue_category_name', 'line_item_description', 'quantity', 'unit_of_measure', 'unit_price', 'extended_amount', 'tax_applicability', 'poms_order_number', 'vin', 'po_number', 'currency']
  const LABEL = { poms_order_number: 'Sales Order', vin: 'VIN', po_number: 'PO Number', status: 'Invoice Status' }
  const NUMERIC = /quantity|price|amount/
  const cols = KEEP.map((k) => ({ label: LABEL[k] ?? title(k), key: k, num: NUMERIC.test(k), wrap: k === 'line_item_description',
    render: k === 'invoice_number' ? (r) => link('invoice', r.invoice_number) : k === 'poms_order_number' ? (r) => pomsLink(r.poms_order_number)
      : k === 'invoice_date' ? (r) => wdDate(r.invoice_date) : k === 'status' ? (r) => statusChip(r.status)
      : NUMERIC.test(k) ? (r) => (r[k] == null ? '' : paren(r[k], /quantity/.test(k) ? 0 : 2)) : undefined }))
  window.__lines = rows.map((r) => Object.fromEntries(KEEP.map((k) => [k, r[k]])))
  const [toolbar, grid, tools] = filterable(rows, cols, 'customer-invoice-lines.csv', 'window.__lines')
  page(`${home} › Customer Invoice Lines`, 'Customer Invoice Lines - OTC', `${toolbar}${panel('Customer Invoice Lines', grid, '', tools)}`)
}

/* ------------------------------- masters ---------------------------------- */
const ATTR = [['related_party', 'Related Party'], ['nga_customer', 'NGA Customer'], ['leasing_plate_required', 'Licence Plate Required'], ['loan_provider', 'Loan Provider'], ['bank_sold_to_exception', 'Bank Sold-To Exception'], ['sharepoint_tracker', 'Customer-Specific Tracker']]
const attrChips = (c) => ATTR.filter(([f]) => c[f]).map(([, l]) => chip(l, 'info')).join(' ')
const CCY = { SE21: 'SEK', NO21: 'NOK', PT21: 'EUR', DK21: 'DKK', DE21: 'EUR' }

async function customers() {
  rehash()
  const c = await get('workday/customers.json')
  const cols = [
    { label: 'Customer', key: 'customer_name', render: (r) => link('customer', r.customer_id, r.customer_name) }, { label: 'Customer ID', key: 'customer_id', render: (r) => `<span class="${H.mono}">${esc(r.customer_id)}</span>` },
    { label: 'Company', key: 'company' }, { label: 'Customer Category', key: 'customer_type', render: (r) => title(r.customer_type) },
    { label: 'Primary Address', key: 'address_text', wrap: true }, { label: 'Country', key: 'country' },
    { label: 'Tax ID', key: 'vat_number', render: (r) => (r.vat_number ? esc(r.vat_number) : '') },
    { label: 'Customer Groups', key: 'g', wrap: true, render: attrChips },
  ]
  window.__cust = c.data.map(({ address, ...r }) => r)
  const [toolbar, grid, tools] = filterable(c.data, cols, 'customers.csv', 'window.__cust')
  page(`${home} › Customers`, 'Find Customers', `${toolbar}${panel('Customers', grid, '', tools)}`)
}

async function customerDetail(id) {
  rehash()
  const [c, inv] = await Promise.all([get(`workday/customers/${id}.json`).then((x) => x.data), get('workday/customer-invoices.json')])
  const mine = inv.data.filter((r) => r.bill_to_customer_id === id || r.sold_to_customer_id === id || r.customer_id === id)
  window.__rows = mine
  setTimeout(() => bindRows(view, mine, openInvoice), 0)
  view.innerHTML = `<div class="${H.inner}"><div class="${H.crumbs}">${home} › <a href="#/customers">Customers</a> › ${esc(c.customer_name)}</div>
    <div class="${H.taskhead}"><div class="${H.title}">${heading(1, 'View Customer')}<div class="${H.obj}">Customer: ${esc(c.customer_name)} · ${esc(c.company)}</div></div><div class="${H.actions}"><button class="${H.btn} ${H.bdots}">···</button></div></div>
    ${panel('Customer Information', fields([['Customer Name', esc(c.customer_name)], ['Customer ID', `<span class="${H.mono}">${esc(c.customer_id)}</span>`], ['Company', esc(c.company)], ['Customer Category', title(c.customer_type)],
      ['Primary Address', esc(c.address_text)], ['Country', esc(c.country)], ['Tax ID', c.vat_number ?? ''], ['Customer Groups', attrChips(c) || ''], ['Payment Terms', 'Net 30'], ['Default Currency', esc(CCY[c.company])]]))}
    ${panel('Customer Invoices', table(INV_COLS, mine, openInvoice), `${mine.length} items`, gridTools("csvDownload(window.__rows,'customer-invoices.csv')"))}</div>`
  window.scrollTo(0, 0)
}

async function revcats() {
  rehash()
  const [rc, lines] = await Promise.all([get('workday/revenue-categories.json'), get('workday/invoice-lines.json')])
  const use = {}
  lines.data.forEach((l) => { use[l.revenue_category] = (use[l.revenue_category] || 0) + 1 })
  const cols = [{ label: 'Revenue Category', key: 'revenue_category' }, { label: 'Name', key: 'name' }, { label: 'Ledger Account', key: 'ledger_account' }, { label: 'Fee Category', key: 'is_fee', render: (r) => (r.is_fee ? 'Yes' : 'No') }, { label: 'Invoice Lines', key: 'u', num: true, render: (r) => use[r.revenue_category] || 0 }, { label: 'Description', key: 'note', wrap: true }]
  page(`${home} › Revenue Categories`, 'Maintain Revenue Categories', panel('Revenue Categories', table(cols, rc.data), `${rc.data.length} items`))
}
async function items() {
  rehash()
  const si = await get('workday/sales-items.json')
  page(`${home} › Sales Items`, 'Maintain Sales Items',
    panel('Sales Items', table([{ label: 'Sales Item', key: 'sales_item' }, { label: 'Name', key: 'name' }, { label: 'Sales Item Group', key: 'item_group' }, { label: 'Default Revenue Category', key: 'default_revenue_category' }], si.data), `${si.data.length} items`))
}

/* -------------------------------- routing --------------------------------- */
const ROUTES = { '': worklist, invoice: invoiceDetail, lines: flatLines, customers, customer: customerDetail, revcats, items }
const NAV = [
  ['', '⌂', 'Home'], ['', '▤', 'Accounts Receivable'], ['lines', '☰', 'Invoice Lines'], ['customers', '👤', 'Customers'],
  ['revcats', '⚙', 'Revenue Categories'], ['items', '▦', 'Sales Items'],
]
async function paintNav(active) {
  document.getElementById('nav').innerHTML = NAV.map(([r, i, l], idx) => `<a href="#/${r}" class="${active === r && idx !== 0 ? 'active' : ''}"><span class="i">${i}</span>${l}</a>`).join('') +
    `<span class="sp"></span><a href="../poms/index.html" title="POMS — Order Management"><span class="i">⇄</span>POMS</a><a href="#/"><span class="i">☆</span>Saved</a>`
}
async function route() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [head, ...rest] = raw.split('/')
  const key = ROUTES[head] ? head : ''
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : null
  paintNav({ invoice: '', customer: 'customers' }[head] ?? key)
  view.innerHTML = '<div class="loading">Loading…</div>'
  try { await ROUTES[key](arg) } catch (e) {
    rehash()
    view.innerHTML = `<div class="${H.inner}"><div class="${H.panel}"><div class="${H.pb}"><b>The record could not be found.</b><p class="${H.note}">${esc(e.message)}. <a href="#/">Return to Customer Invoices</a>.</p></div></div></div>`
  }
}
document.getElementById('globalsearch').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  const q = e.target.value.trim()
  if (/^(CI-|DE21-CI)/i.test(q)) location.hash = `#/invoice/${q.toUpperCase()}`
  else if (/^C-/i.test(q)) location.hash = `#/customer/${q.toUpperCase()}`
  else { location.hash = '#/'; setTimeout(() => { const i = filterInput(); if (i) { i.value = q; i.dispatchEvent(new Event('input')) } }, 300) }
})
window.addEventListener('hashchange', route)
route()
