/* Workday customer invoicing — static client over ../api/workday (+ POMS for the Sales Order link). */
const API = '../api'
const view = document.getElementById('view')
const cache = new Map()

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]))
const num = (n, dp = 2) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }))
const paren = (n, dp = 2) => (Number(n) < 0 ? `(${num(-n, dp)})` : num(n, dp))   // Workday shows negatives in parentheses
const title = (s) => String(s ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const wdDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const wdMoment = (iso) => (iso ? `${wdDate(iso.slice(0, 10))} ${iso.slice(11, 16)}` : '')
const link = (route, id, text) => `<a href="#/${route}/${encodeURIComponent(id)}">${esc(text ?? id)}</a>`
const pomsLink = (o) => (o ? `<a href="../poms/index.html#/order/${encodeURIComponent(o)}" target="_blank" rel="noopener" title="Open in POMS">${esc(o)}</a>` : '')
const chip = (t, k = '') => `<span class="chip ${k}">${esc(t)}</span>`
const statusChip = (s) => chip(title(s), { DRAFT: 'warn', APPROVED: 'ok', PAID: 'ok', UNPAID: '', IN_PROGRESS: 'info' }[s] || '')

async function get(path, optional = false) {
  if (cache.has(path)) return cache.get(path)
  const r = await fetch(`${API}/${path}`, { cache: 'no-store' })
  if (!r.ok) { if (optional) return null; throw new Error(`${r.status} ${path}`) }
  const j = await r.json()
  cache.set(path, j)
  return j
}

/* ------------------------------ building blocks --------------------------- */
const gridTools = (exportFn) => `<div class="gridtools"><span title="Export to Excel" onclick="${exportFn}">⇩</span><span title="Filter">▽</span><span title="Chart">▥</span><span title="Column preferences">⚙</span><span title="Expand">⤢</span><span class="on" title="Grid">▦</span></div>`
const panel = (heading, body, count = '', tools = '') =>
  `<div class="panel"><div class="ph"><h2>${heading}</h2>${count ? `<span class="count">${count}</span>` : ''}${tools ? `<div class="tools">${tools}</div>` : ''}</div>${body}</div>`
const isEmpty = (v) => v === '' || v === null || v === undefined
const fields = (rows, cls = '') => `<div class="fields ${cls}">${rows.map(([l, v]) => `<div class="field"><label>${l}</label><div class="v ${isEmpty(v) ? 'empty' : ''}">${isEmpty(v) ? '(empty)' : v}</div></div>`).join('')}</div>`

function table(cols, rows) {
  if (!rows.length) return '<div class="empty">No data available.</div>'
  const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.label}</th>`).join('')
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

function page(crumbs, heading, html) {
  view.innerHTML = `<div class="inner"><div class="crumbs">${crumbs}</div><h1 class="report">${heading}</h1>${html}</div>`
  window.scrollTo(0, 0)
}
const home = '<a href="#/">Customer Invoices</a>'

function tabs(defs) {
  const id = 't' + Math.random().toString(36).slice(2, 7)
  setTimeout(() => {
    const host = document.getElementById(id)
    if (!host) return
    host.parentElement.querySelectorAll('.tab').forEach((b, i) => b.addEventListener('click', () => {
      host.parentElement.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      host.innerHTML = defs[i][1]()
    }))
  }, 0)
  return `<div class="tabs">${defs.map(([l], i) => `<button class="tab ${i === 0 ? 'active' : ''}">${l}</button>`).join('')}</div><div id="${id}">${defs[0][1]()}</div>`
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

/* ------------------------- Find Customer Invoices ------------------------- */
const INV_COLS = [
  { label: 'Customer Invoice', key: 'invoice_number', render: (r) => link('invoice', r.invoice_number, `Customer Invoice: ${r.invoice_number}`) },
  { label: 'Company', key: 'company_name' },
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
  { label: 'VIN', key: 'vin', render: (r) => `<span class="mono">${esc(r.vin ?? '')}</span>` },
  { label: 'Model', key: 'model' },
  { label: 'Net Invoice Amount', key: 'subtotal', num: true, render: (r) => paren(r.subtotal) },
  { label: 'Tax Amount', key: 'tax_amount', num: true, render: (r) => paren(r.tax_amount) },
  { label: 'Total Invoice Amount', key: 'total_amount', num: true, render: (r) => `<b>${paren(r.total_amount)}</b>` },
  { label: 'Amount Due', key: 'amount_due', num: true, render: (r) => paren(r.amount_due ?? r.total_amount) },
  { label: 'Currency', key: 'currency' },
]

const filters = { company: 'ALL', status: 'ALL', payment: 'ALL', type: 'ALL', customer: '', from: '', to: '' }
let promptOpen = true
async function worklist() {
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
    const t = view.querySelector('.section-toggle'), p = view.querySelector('#prompt')
    t.addEventListener('click', () => { promptOpen = !promptOpen; t.setAttribute('aria-expanded', String(promptOpen)); p.hidden = !promptOpen })
    view.querySelector('#applyBtn').addEventListener('click', () => {
      filters.company = view.querySelector('#f-co').value; filters.status = view.querySelector('#f-st').value
      filters.payment = view.querySelector('#f-pay').value; filters.type = view.querySelector('#f-type').value
      filters.customer = view.querySelector('#f-cust').value.trim(); filters.from = view.querySelector('#f-from').value; filters.to = view.querySelector('#f-to').value
      worklist()
    })
    view.querySelector('#resetBtn').addEventListener('click', () => { Object.assign(filters, { company: 'ALL', status: 'ALL', payment: 'ALL', type: 'ALL', customer: '', from: '', to: '' }); worklist() })
    const q = view.querySelector('#quick')
    q.addEventListener('input', () => {
      const s = q.value.trim().toLowerCase()
      const hit = s ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s)) : rows
      view.querySelector('#grid').innerHTML = table(INV_COLS, hit)
      view.querySelector('#gridcount').textContent = `${hit.length} items`
      window.__rows = hit
    })
  }, 0)

  page(home, 'Find Customer Invoices - OTC',
    `<div class="panel"><div class="ph"><button class="section-toggle" aria-expanded="${promptOpen}">Details</button></div>
      <div id="prompt" class="prompt" ${promptOpen ? '' : 'hidden'}>
        <div><label>Company</label><select id="f-co">${opt(cos.data.map((c) => [c.company, c.company_name]), filters.company, 'All Companies')}</select></div>
        <div><label>Customer</label><input id="f-cust" value="${esc(filters.customer)}" placeholder="Customer name"></div>
        <div><label>Invoice Status</label><select id="f-st">${opt([['DRAFT', 'Draft'], ['APPROVED', 'Approved']], filters.status)}</select></div>
        <div><label>Payment Status</label><select id="f-pay">${opt([['UNPAID', 'Unpaid'], ['PAID', 'Paid']], filters.payment)}</select></div>
        <div><label>Invoice Type</label><select id="f-type">${opt(types.map((t) => [t, t]), filters.type)}</select></div>
        <div><label>Invoice Date On or After</label><input id="f-from" type="date" value="${esc(filters.from)}"></div>
        <div><label>Invoice Date On or Before</label><input id="f-to" type="date" value="${esc(filters.to)}"></div>
        <div class="row"><button class="btn" id="resetBtn">Reset</button><button class="btn primary" id="applyBtn">OK</button></div>
      </div></div>
    <div class="toolbar"><input id="quick" placeholder="Filter results"><span class="count" id="gridcount">${rows.length} items</span></div>
    ${panel('Customer Invoices', `<div id="grid">${table(INV_COLS, rows)}</div>`, '', gridTools("csvDownload(window.__rows,'customer-invoices.csv')"))}`)
}

/* ---------------------------- View Customer Invoice ----------------------- */
const kvl = (rows) => `<div class="kvl">${rows.map(([l, v]) => `<label>${l}</label><div class="v ${isEmpty(v) ? 'empty' : ''}">${isEmpty(v) ? '(empty)' : v}</div>`).join('')}</div>`
const addr = (a) => (a ? `<span class="icon">⌖</span><a>${esc(a)}</a>` : '')

async function invoiceDetail(id) {
  const d = (await get(`workday/customer-invoices/${id}.json`)).data
  const order = (d.sales_order || d.poms_order_number) ? (await get(`poms/orders/${d.sales_order || d.poms_order_number}.json`, true))?.data : null
  window.__inv = d.lines
  const amountDue = d.totals.amount_due ?? d.totals.total_amount
  const so = d.sales_order || d.poms_order_number
  const wt = d.worktags || {}

  const info = kvl([
    ['Company', `<a>${esc(d.company_name)}</a>`],
    ['Bill-To Customer', link('customer', d.bill_to_customer_id, d.bill_to_customer)],
    ['Sold-To Customer', link('customer', d.sold_to_customer_id, d.sold_to_customer)],
    ['Invoice Number', esc(d.invoice_number)],
    ['Invoice Type', esc(d.invoice_type ?? d.document_kind)],
    ['Invoice Date', wdDate(d.invoice_date)],
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
    ['Worktags', `<div class="wt"><div><a>Model: ${esc(wt.model ?? d.model)}</a></div><div>Sales Order: ${pomsLink(so)}</div><div><a>Vehicle Identifier Number: <span class="mono">${esc(wt.vehicle_identifier_number ?? d.vin)}</span></a></div>${d.statutory_invoice_type ? `<div><a>Statutory Invoice Type: ${esc(d.statutory_invoice_type)}</a></div>` : ''}${d.statutory_invoice_number ? `<div><a>Statutory Invoice Number: ${esc(d.statutory_invoice_number)}</a></div>` : ''}</div>`],
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
    { label: 'Line', key: 'line', render: (r) => `<span class="icon">🔍</span>` },
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
    { label: 'Tax Applicability', key: 'tax_applicability', render: (r) => `<a>${esc(d.tax.tax_code.split(' ')[0])} Sale of Goods Services</a>` },
  ]
  const linesTab = () => panel('Invoice Lines', table(LINE_COLS, d.lines), `${d.lines.length} item${d.lines.length === 1 ? '' : 's'}`, gridTools(`csvDownload(window.__inv,'${esc(d.invoice_number)}-lines.csv')`))
  const fxTab = () => panel('Currency Rate', fields([['Transaction Currency', esc(d.currency)], ['Company Currency', esc(d.currency)], ['Currency Rate', '1.000000'], ['Currency Rate Type', 'Current'], ['Rate Date', wdDate(d.invoice_date)]]))
  const taxTab = () => panel('Tax', table([
    { label: 'Tax Code', key: 'tax_code' }, { label: 'Tax Rate', key: 'rate', num: true, render: (r) => `${num(r.rate, 2)}%` },
    { label: 'Taxable Amount', key: 'taxable', num: true, render: (r) => paren(r.taxable) }, { label: 'Tax Amount', key: 'tax', num: true, render: (r) => paren(r.tax) },
    { label: 'Tax Applicability', key: 'app' }, { label: 'Tax Recoverability', key: 'rec' },
  ], [{ tax_code: d.tax.tax_code, rate: d.tax.tax_rate, taxable: d.tax.taxable_amount, tax: d.tax.tax_amount, app: 'Taxable', rec: '100% Recoverable' }]))
  const attTab = () => panel('Attachments', d.attachments?.length ? table([{ label: 'File', key: 'name' }, { label: 'Category', key: 'type' }, { label: 'Attached To', key: 'attached_to' }], d.attachments) : '<div class="empty">No attachments.</div>')
  const bpTab = () => panel('Business Process', `<ul class="hist">${(d.process_history ?? []).map((h) => `<li><b>${esc(h.step)}</b><span>${chip(h.status, h.status === 'Awaiting Action' ? 'warn' : h.status === 'Approved' ? 'ok' : '')}</span><span>${esc(h.person)}</span><span class="when">${wdMoment(h.moment)}${h.comment ? ` · ${esc(h.comment)}` : ''}</span></li>`).join('') || '<li>No history.</li>'}</ul>`)
  const errTab = () => panel('Errors & Warnings', '<div class="empty">No errors or warnings.</div>')
  const printTab = () => panel('Printing Runs', d.latest_print_date ? table([{ label: 'Print Run', key: 'r' }, { label: 'Moment', key: 'm' }, { label: 'Delivery Type', key: 'd' }, { label: 'Status', key: 's' }], [{ r: `PR-${d.invoice_number}`, m: wdMoment(d.latest_print_date), d: d.delivery_type ?? 'Email', s: 'Completed' }]) : '<div class="empty">Not yet printed.</div>')
  const notesTab = () => panel('Notes', `<div class="pb">${d.memo ? `<p class="note">${esc(d.memo)}</p>` : '<p class="note">No notes.</p>'}${d.payment_application ? `<p class="note">Payment ${esc(d.payment_application.payment_id)} for ${num(d.payment_application.amount)} ${esc(d.currency)} applied as <b>${esc(title(d.payment_application.applied_as))}</b> on ${wdDate(d.payment_application.payment_date)} (${esc(d.payment_application.factoring_partner)}).</p>` : ''}</div>`)

  setTimeout(() => view.querySelectorAll('.threecol h2').forEach((h) => h.addEventListener('click', () => h.classList.toggle('closed'))), 0)
  view.innerHTML = `<div class="titlebar"><h1>View Customer Invoice</h1><span class="obj">${esc(d.invoice_number)}</span><button class="dots" title="Related Actions">···</button><div class="tools"><span title="Export">⇩</span><span title="PDF">▤</span></div></div>
    <div class="statusband">
      <div class="kv"><label>Invoice Status</label><span>${title(d.status)}</span><label>Payment Status</label><span>${title(d.payment_status ?? 'Unpaid')}</span><label>Finalized Date</label><span>${d.finalized_date ? wdDate(d.finalized_date) : '(empty)'}</span></div>
      <div class="amt"><div><label>Total Invoice Amount</label>${paren(d.totals.total_amount)} ${esc(d.currency)}</div><div><label>Amount Due</label>${paren(amountDue)} ${esc(d.currency)}</div></div>
    </div>
    <div class="threecol">
      <div class="col"><h2>Invoice Information</h2>${info}</div>
      <div class="col"><h2>Additional Information</h2>${additional}</div>
      <div class="col"><h2>Amount Information</h2>${amounts}</div>
    </div>
    <div class="tabwrap">${tabs([
      ['Invoice Lines', linesTab], ['Currency Rate', fxTab], ['Tax', taxTab], ['Attachments', attTab],
      ['Business Process', bpTab], ['Errors & Warnings', errTab], ['Printing Runs', printTab], ['Notes', notesTab],
    ])}</div>`
  window.scrollTo(0, 0)
}

/* ------------------------------ report: lines ----------------------------- */
async function flatLines() {
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
  const id = 'q' + Math.random().toString(36).slice(2, 6)
  setTimeout(() => {
    const i = document.getElementById(id)
    i.addEventListener('input', () => { const s = i.value.trim().toLowerCase(); const hit = s ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s)) : rows; document.getElementById(id + 't').innerHTML = table(cols, hit); document.getElementById(id + 'c').textContent = `${hit.length} items` })
  }, 0)
  page(`${home} › Customer Invoice Lines`, 'Customer Invoice Lines - OTC',
    `<div class="toolbar"><input id="${id}" placeholder="Filter results"><span class="count" id="${id}c">${rows.length} items</span></div>
    ${panel('Customer Invoice Lines', `<div id="${id}t">${table(cols, rows)}</div>`, '', gridTools("csvDownload(window.__lines,'customer-invoice-lines.csv')"))}`)
}

/* ------------------------------- masters ---------------------------------- */
const ATTR = [['related_party', 'Related Party'], ['nga_customer', 'NGA Customer'], ['leasing_plate_required', 'Licence Plate Required'], ['loan_provider', 'Loan Provider'], ['bank_sold_to_exception', 'Bank Sold-To Exception'], ['sharepoint_tracker', 'Customer-Specific Tracker']]
const attrChips = (c) => ATTR.filter(([f]) => c[f]).map(([, l]) => chip(l, 'info')).join(' ')
const CCY = { SE21: 'SEK', NO21: 'NOK', PT21: 'EUR', DK21: 'DKK', DE21: 'EUR' }

async function customers() {
  const c = await get('workday/customers.json')
  const cols = [
    { label: 'Customer', key: 'customer_name', render: (r) => link('customer', r.customer_id, r.customer_name) }, { label: 'Customer ID', key: 'customer_id', render: (r) => `<span class="mono">${esc(r.customer_id)}</span>` },
    { label: 'Company', key: 'company' }, { label: 'Customer Category', key: 'customer_type', render: (r) => title(r.customer_type) },
    { label: 'Primary Address', key: 'address_text', wrap: true }, { label: 'Country', key: 'country' },
    { label: 'Tax ID', key: 'vat_number', render: (r) => (r.vat_number ? esc(r.vat_number) : '') },
    { label: 'Customer Groups', key: 'g', wrap: true, render: attrChips },
  ]
  const id = 'q' + Math.random().toString(36).slice(2, 6)
  setTimeout(() => {
    const i = document.getElementById(id)
    i.addEventListener('input', () => { const s = i.value.trim().toLowerCase(); const hit = s ? c.data.filter((r) => JSON.stringify(r).toLowerCase().includes(s)) : c.data; document.getElementById(id + 't').innerHTML = table(cols, hit); document.getElementById(id + 'c').textContent = `${hit.length} items` })
  }, 0)
  page(`${home} › Customers`, 'Find Customers',
    `<div class="toolbar"><input id="${id}" placeholder="Filter results"><span class="count" id="${id}c">${c.data.length} items</span></div>
    ${panel('Customers', `<div id="${id}t">${table(cols, c.data)}</div>`, '', gridTools("csvDownload(window.__cust,'customers.csv')"))}`)
  window.__cust = c.data.map(({ address, ...r }) => r)
}

async function customerDetail(id) {
  const [c, inv] = await Promise.all([get(`workday/customers/${id}.json`).then((x) => x.data), get('workday/customer-invoices.json')])
  const mine = inv.data.filter((r) => r.bill_to_customer_id === id || r.sold_to_customer_id === id || r.customer_id === id)
  window.__rows = mine
  view.innerHTML = `<div class="inner"><div class="crumbs">${home} › <a href="#/customers">Customers</a> › ${esc(c.customer_name)}</div>
    <div class="taskhead"><div class="title"><h1>View Customer</h1><div class="obj">Customer: ${esc(c.customer_name)} · ${esc(c.company)}</div></div><div class="actions"><button class="btn dots">···</button></div></div>
    ${panel('Customer Information', fields([['Customer Name', esc(c.customer_name)], ['Customer ID', `<span class="mono">${esc(c.customer_id)}</span>`], ['Company', esc(c.company)], ['Customer Category', title(c.customer_type)],
      ['Primary Address', esc(c.address_text)], ['Country', esc(c.country)], ['Tax ID', c.vat_number ?? ''], ['Customer Groups', attrChips(c) || ''], ['Payment Terms', 'Net 30'], ['Default Currency', esc(CCY[c.company])]]))}
    ${panel('Customer Invoices', table(INV_COLS, mine), `${mine.length} items`, gridTools("csvDownload(window.__rows,'customer-invoices.csv')"))}</div>`
  window.scrollTo(0, 0)
}

async function revcats() {
  const [rc, lines] = await Promise.all([get('workday/revenue-categories.json'), get('workday/invoice-lines.json')])
  const use = {}
  lines.data.forEach((l) => { use[l.revenue_category] = (use[l.revenue_category] || 0) + 1 })
  const cols = [{ label: 'Revenue Category', key: 'revenue_category' }, { label: 'Name', key: 'name' }, { label: 'Ledger Account', key: 'ledger_account' }, { label: 'Fee Category', key: 'is_fee', render: (r) => (r.is_fee ? 'Yes' : 'No') }, { label: 'Invoice Lines', key: 'u', num: true, render: (r) => use[r.revenue_category] || 0 }, { label: 'Description', key: 'note', wrap: true }]
  page(`${home} › Revenue Categories`, 'Maintain Revenue Categories', panel('Revenue Categories', table(cols, rc.data), `${rc.data.length} items`))
}
async function items() {
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
    view.innerHTML = `<div class="inner"><div class="panel"><div class="pb"><b>The record could not be found.</b><p class="note">${esc(e.message)}. <a href="#/">Return to Customer Invoices</a>.</p></div></div></div>`
  }
}
document.getElementById('globalsearch').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return
  const q = e.target.value.trim()
  if (/^(CI-|DE21-CI)/i.test(q)) location.hash = `#/invoice/${q.toUpperCase()}`
  else if (/^C-/i.test(q)) location.hash = `#/customer/${q.toUpperCase()}`
  else { location.hash = '#/'; setTimeout(() => { const i = view.querySelector('#quick'); if (i) { i.value = q; i.dispatchEvent(new Event('input')) } }, 300) }
})
window.addEventListener('hashchange', route)
route()
