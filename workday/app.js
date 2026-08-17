const API = '../api';
const view = document.getElementById('view');
const titleEl = document.getElementById('pageTitle');
const subtitleEl = document.getElementById('pageSubtitle');

const money = (n, c = 'EUR') =>
  n === null || n === undefined ? '' :
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const empty = '<span class="val empty">(empty)</span>';

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/* ---------------------------------- list ---------------------------------- */
let rows = [];

async function renderList() {
  titleEl.textContent = 'Find Open Customer Invoices - OTC';
  subtitleEl.textContent = '';
  view.innerHTML = '<div class="loading">Loading invoices…</div>';
  const payload = await getJSON(`${API}/invoices.json`);
  rows = payload.data;

  view.innerHTML = '';
  view.appendChild(document.getElementById('tpl-list').content.cloneNode(true));

  const toggle = view.querySelector('.section-toggle');
  const panel = view.querySelector('.details-panel');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    panel.hidden = open;
  });

  const filter = view.querySelector('#quickFilter');
  filter.addEventListener('input', () => paintRows(filter.value.trim().toLowerCase()));
  paintRows('');
}

function paintRows(q) {
  const tbody = view.querySelector('#invoiceGrid tbody');
  const list = q
    ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(q))
    : rows;
  document.getElementById('itemCount').textContent = `${list.length} of ${rows.length} items`;
  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${esc(r.invoice_number)}</td>
      <td><a href="#/invoice/${encodeURIComponent(r.invoice_number)}">Customer Invoice: ${esc(r.invoice_number)}</a></td>
      <td>${esc(r.invoice_type)}</td>
      <td>${esc(r.status)}</td>
      <td><a href="#/invoice/${encodeURIComponent(r.invoice_number)}">${esc(r.customer)}</a></td>
      <td>${esc(r.customer_id)}</td>
      <td><a href="#/invoice/${encodeURIComponent(r.invoice_number)}">${esc(r.sales_order)}</a></td>
      <td><a href="#/invoice/${encodeURIComponent(r.invoice_number)}">${esc(r.vehicle_identifier_number)}</a></td>
      <td class="wrap"><a href="#/invoice/${encodeURIComponent(r.invoice_number)}">${esc(r.worktag_invoice_type)}</a></td>
      <td>${esc(r.payment_terms)}</td>
      <td class="wrap">${esc(r.memo)}</td>
      <td class="num">${money(r.total_invoice_amount)}</td>
      <td class="num">${money(r.tax_amount)}</td>
      <td>${esc(r.currency)}</td>
      <td>${esc(r.invoice_date)}</td>
      <td>${esc(r.due_date)}</td>
    </tr>`).join('');
}

/* --------------------------------- detail --------------------------------- */
async function renderDetail(id) {
  titleEl.textContent = 'View Customer Invoice';
  subtitleEl.textContent = id;
  view.innerHTML = '<div class="loading">Loading invoice…</div>';
  let d;
  try {
    d = (await getJSON(`${API}/invoices/${encodeURIComponent(id)}.json`)).data;
  } catch {
    view.innerHTML = `<div class="error">No customer invoice found for ${esc(id)}. <a href="#/">Back to the invoice list</a></div>`;
    return;
  }

  const f = (label, val, cls = '') =>
    `<div class="field"><label>${label}</label><div class="val ${cls}">${val ?? empty}</div></div>`;
  const link = v => (v ? `<span class="link">${esc(v)}</span>` : null);
  const plain = v => (v ? esc(v) : null);

  view.innerHTML = `
    <a class="back-link" href="#/">&#8249; Find Open Customer Invoices - OTC</a>
    <div class="status-strip">
      <div><label>Invoice Status</label><strong>${esc(d.status)}</strong></div>
      <div><label>Total Invoice Amount</label><strong>${money(d.total_invoice_amount)}&nbsp;${esc(d.currency)}</strong></div>
      <div><label>Amount Due</label><strong>${money(d.amount_due)}&nbsp;${esc(d.currency)}</strong></div>
      <div><label>Payment Status</label><strong>${esc(d.payment_status)}</strong></div>
    </div>

    <div class="cols">
      <div class="col">
        <h3><span class="chev">&#9662;</span> Invoice Information</h3>
        ${f('Company', link(d.company))}
        ${f('Bill-To Customer', link(d.bill_to_customer))}
        ${f('Sold-To Customer', link(d.sold_to_customer))}
        ${f('Invoice Number', plain(d.invoice_number))}
        ${f('Invoice Type', plain(d.invoice_type))}
        ${f('Invoice Date', plain(d.invoice_date))}
        ${f('Bill-To Address', `<span class="pin link">${esc(d.bill_to_address)}</span>`)}
        ${f('Bill-To Contact', plain(d.bill_to_contact))}
        ${f('Ship-To Customer', link(d.ship_to_customer))}
        ${f('Ship-To Address', `<span class="pin link">${esc(d.ship_to_address)}</span>`)}
      </div>

      <div class="col">
        <h3><span class="chev">&#9662;</span> Additional Information</h3>
        ${f('Payment Type', plain(d.payment_type))}
        ${f('Payment Terms', plain(d.payment_terms))}
        ${f('Due Date', plain(d.due_date))}
        ${f('Discount Date', plain(d.discount_date))}
        ${f('PO Number', d.po_number ? `<span class="link">${esc(d.po_number)}</span>` : null)}
        ${f('Memo', plain(d.memo))}
        ${f('Printed', plain(d.printed))}
        ${f('Worktags', `
          <div class="link">Invoice type: ${esc(d.worktags.invoice_type)}</div>
          <div class="link">Model: ${esc(d.worktags.model)}</div>
          <div class="link">Sales Order: ${esc(d.worktags.sales_order)}</div>
          <div class="link">Vehicle Identifier Number: ${esc(d.worktags.vehicle_identifier_number)}</div>`)}
      </div>

      <div class="col">
        <h3><span class="chev">&#9662;</span> Amount Information</h3>
        ${f('Currency', link(d.currency))}
        ${f('Default Tax Code', link(d.default_tax_code))}
        ${f('Net Invoice Amount', money(d.net_invoice_amount))}
        ${f('Tax Amount', money(d.tax_amount))}
        ${f('Total Invoice Amount', money(d.total_invoice_amount))}
        ${f('Less Withholding Amount', money(d.less_withholding_amount))}
        ${f('Control Total Amount', money(d.control_total_amount))}
        ${f('Amount Due', money(d.amount_due))}
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="lines">Invoice Lines</button>
      <button class="tab" data-tab="rate">Currency Rate</button>
      <button class="tab" data-tab="tax">Tax</button>
      <button class="tab" data-tab="att">Attachments</button>
    </div>
    <div class="tab-body" id="tabBody"></div>
  `;

  const tabs = {
    lines: () => `
      <div class="item-count">Invoice Lines ${d.invoice_lines.length} items</div>
      <div class="grid-scroll" style="margin-top:6px">
        <table class="wd-grid">
          <thead><tr><th>Line</th><th>Item</th><th>Description</th><th class="num">Quantity</th>
          <th class="num">Unit Price</th><th>Tax Code</th><th class="num">Extended Amount</th></tr></thead>
          <tbody>${d.invoice_lines.map(l => `
            <tr><td>${l.line}</td><td><a>${esc(l.item)}</a></td><td>${esc(l.description)}</td>
            <td class="num">${l.quantity}</td><td class="num">${money(l.unit_price)}</td>
            <td><a>${esc(l.tax_code)}</a></td><td class="num">${money(l.extended_amount)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>`,
    rate: () => `<div class="detail-grid"><div><label>Currency Rate Type</label><span>Current</span></div>
      <div><label>Currency Rate</label><span>1.000000</span></div>
      <div><label>Company Currency</label><span class="link">${esc(d.currency)}</span></div></div>`,
    tax: () => `<div class="grid-scroll"><table class="wd-grid">
      <thead><tr><th>Tax Code</th><th class="num">Taxable Amount</th><th class="num">Tax Rate</th><th class="num">Tax Amount</th></tr></thead>
      <tbody><tr><td><a>${esc(d.default_tax_code)}</a></td><td class="num">${money(d.net_invoice_amount)}</td>
      <td class="num">${d.tax_amount ? '19.00%' : '0.00%'}</td><td class="num">${money(d.tax_amount)}</td></tr></tbody>
      </table></div>`,
    att: () => `<div class="loading">No attachments.</div>`,
  };

  const body = view.querySelector('#tabBody');
  body.innerHTML = tabs.lines();
  view.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    view.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    body.innerHTML = tabs[btn.dataset.tab]();
  }));
}

/* --------------------------------- router --------------------------------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('invoice/')) renderDetail(decodeURIComponent(h.slice('invoice/'.length)));
  else renderList().catch(e => { view.innerHTML = `<div class="error">Could not load the invoice list: ${esc(e.message)}</div>`; });
}
window.addEventListener('hashchange', route);
route();
