const API = '../api';
const view = document.getElementById('view');

const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const num = n => (n === null || n === undefined ? '—' :
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n));
const dash = v => (v === null || v === undefined || v === '' ? '<span class="v dash">—</span>' : null);

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/* ---------------------------------- list ---------------------------------- */
let all = [];

async function renderList() {
  document.title = 'POMS — Orders';
  view.innerHTML = '<div class="dark"><div class="loading">Loading orders…</div></div>';
  all = (await getJSON(`${API}/orders.json`)).data;

  view.innerHTML = '';
  view.appendChild(document.getElementById('tpl-list').content.cloneNode(true));
  view.querySelector('.banner-close').addEventListener('click', e => e.target.closest('.banner').remove());

  const search = view.querySelector('#search');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  search.value = params.get('q') || '';
  search.addEventListener('input', () => paint(search.value.trim().toLowerCase()));
  paint(search.value.trim().toLowerCase());
}

function paint(q) {
  const list = q ? all.filter(o => JSON.stringify(o).toLowerCase().includes(q)) : all;
  view.querySelector('#ordersHeading').textContent = `Orders (${list.length})`;
  view.querySelector('.orders tbody').innerHTML = list.map(o => `
    <tr>
      <td><a href="#/order/${encodeURIComponent(o.order_no)}">${esc(o.order_no)}</a></td>
      <td>${esc(o.order_type.replace(/_/g, ' '))}</td>
      <td><span class="dot">&#9679;</span><span class="status">${esc(o.delivery_status_label)}</span></td>
      <td>${esc(o.market)}</td>
      <td>${esc(o.created_at.replace(' UTC', ''))}</td>
      <td>${esc(o.model)}</td>
      <td>${esc(o.model_year)}</td>
      <td>${esc(o.vin)}</td>
      <td>${esc(o.financing_option)}</td>
      <td>${esc(o.company)}</td>
      <td>${esc(o.first_name)}</td>
      <td>${esc(o.last_name)}</td>
      <td>${esc(o.email)}</td>
      <td><a class="go" href="#/order/${encodeURIComponent(o.order_no)}">&#8594;</a></td>
    </tr>`).join('') ||
    `<tr><td colspan="14" style="color:#999;padding:26px 12px">No orders match that search. Clear the box to see all orders.</td></tr>`;
}

/* --------------------------------- detail --------------------------------- */
async function renderDetail(id) {
  document.title = `POMS — Order ${id}`;
  view.innerHTML = '<div class="light"><div class="loading">Loading order…</div></div>';
  let d;
  try {
    d = (await getJSON(`${API}/orders/${encodeURIComponent(id)}.json`)).data;
  } catch {
    view.innerHTML = `<div class="light"><div class="error">No order ${esc(id)} exists in POMS. <a href="#/">Back to orders</a></div></div>`;
    return;
  }

  const row = (label, value, cls = '') =>
    `<div class="row"><label>${label}</label>${dash(value) || `<div class="v ${cls}">${value}</div>`}</div>`;
  const p = d.price_information;

  const overview = `
    ${row('Order No', esc(d.order_no))}
    ${row('Order Type', esc(d.order_type))}
    ${row('Sales Channel', esc(d.sales_channel))}
    ${row('Order To Delivery Flow', esc(d.order_to_delivery_flow))}
    ${row('Logistic Flow', d.logistic_flow)}
    ${row('Order Status', esc(d.order_status))}
    ${row('Communicated Delivery Status', esc(d.communicated_delivery_status))}
    ${row('Extras status', esc(d.extras_status))}
    ${row('Protection status', esc(d.protection_status))}
    ${row('Market', esc(d.market))}
    ${row('Is SME Order', d.is_sme_order ? '&#10004;' : '<span class="no">&#10006;</span>')}
    ${row('Sales Type', esc(d.sales_type))}
    ${row('Configuration ID', esc(d.configuration_id), 'mono')}
    ${row('Session ID', esc(d.session_id), 'mono')}
    ${row('Car', esc(d.car.display), 'strong')}
    ${row('VIN', esc(d.car.vin), 'mono')}
    ${row('Colour', esc(d.car.colour))}
    ${row('Interior', esc(d.car.interior))}
    ${row('Orderer', `${esc(d.orderer.first_name)} ${esc(d.orderer.last_name)}`)}
    ${row('Orderer Email', esc(d.orderer.email))}
    ${row('Company', esc(d.orderer.company))}
    ${row('Customer ID', esc(d.orderer.customer_id), 'mono')}
    ${row('Financing Option', esc(d.financing_option))}
    ${row('Created At', esc(d.created_at))}
    ${row('Updated At', esc(d.updated_at))}
    ${row('Confirmed at', esc(d.confirmed_at))}
    ${row('CSL Accepted At', d.csl_accepted_at)}
    ${row('Terms And Conditions Accepted At', d.terms_and_conditions_accepted_at)}
    <div class="section">PRICE INFORMATION</div>
    ${row('Currency', esc(p.currency))}
    ${row('Grand Total Price', num(p.grand_total_price))}
    ${row('Grand Total Vat', num(p.grand_total_vat))}
    ${row('Grand Total Tax', p.grand_total_tax)}
    ${row('Grand Total Car Fiscal', p.grand_total_car_fiscal)}
    ${row('Car Total Price', num(p.car_total_price))}
    ${row('Car Total Vat', num(p.car_total_vat))}
    ${row('Car Total Tax', p.car_total_tax)}
    ${row('Car Total Incentive Label', p.car_total_incentive_label)}
    ${row('Car Total Incentive Value', p.car_total_incentive_value)}
    ${row('Car Total Incentive Excl Vat Label', p.car_total_incentive_excl_vat_label)}
    ${row('Car Total Incentive Excl Vat Value', p.car_total_incentive_excl_vat_value)}
    ${row('Extras Total Price', p.extras_total_price)}
    ${row('Extras Total Vat', p.extras_total_vat)}
  `;

  const lines = `
    <table class="ltable">
      <thead><tr><th>Line</th><th>Item</th><th class="num">Qty</th>
      <th class="num">Unit price incl. VAT</th><th>VAT rate</th><th class="num">Amount incl. VAT</th></tr></thead>
      <tbody>${d.order_lines.map(l => `<tr><td>${l.line}</td><td>${esc(l.item)}</td>
        <td class="num">${l.qty}</td><td class="num">${num(l.unit_price_incl_vat)}</td>
        <td>${esc(l.vat_rate)}</td><td class="num">${num(l.amount_incl_vat)}</td></tr>`).join('')}</tbody>
    </table>`;

  const deliveries = `
    <table class="ltable">
      <thead><tr><th>Delivery ID</th><th>Planned date</th><th>Location</th><th>Status</th></tr></thead>
      <tbody>${d.deliveries.map(x => `<tr><td>${esc(x.delivery_id)}</td><td>${esc(x.planned_date)}</td>
        <td>${esc(x.location)}</td><td>${esc(x.status)}</td></tr>`).join('')}</tbody>
    </table>`;

  const events = `
    <table class="ltable">
      <thead><tr><th>Timestamp</th><th>Event</th></tr></thead>
      <tbody>${d.events.map(e => `<tr><td>${esc(e.timestamp)}</td><td>${esc(e.event)}</td></tr>`).join('')}</tbody>
    </table>`;

  view.innerHTML = `
    <div class="light">
      <a class="back" href="#/">&#8592; All orders</a>
      <div class="detail-head">
        <h2>Order ${esc(d.order_no)}</h2>
        <div class="actions"><span>&#8943;</span><span>&#9998;</span></div>
      </div>
      <div class="tabs">
        <button class="tab active" data-t="0">Overview</button>
        <button class="tab" data-t="1">Order Lines</button>
        <button class="tab" data-t="2">Deliveries</button>
        <button class="tab" data-t="3">Events</button>
      </div>
      <div class="rows" id="tabBody">${overview}</div>
    </div>`;

  const bodies = [overview, lines, deliveries, events];
  const body = view.querySelector('#tabBody');
  view.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    view.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    body.innerHTML = bodies[+b.dataset.t];
  }));
}

/* --------------------------------- router --------------------------------- */
function route() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (h.startsWith('order/')) renderDetail(decodeURIComponent(h.slice('order/'.length)));
  else renderList().catch(e => {
    view.innerHTML = `<div class="dark"><div class="loading">Could not load orders: ${esc(e.message)}</div></div>`;
  });
}
window.addEventListener('hashchange', route);
route();
