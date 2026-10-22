# Pre-billing invoice validation POC — Workday · POMS

Two mock systems over one static JSON API, hostable on GitHub Pages. Five legal entities: **DE21** (the
original dataset of this POC) and **SE21, NO21, PT21, DK21** with the exceptions from the entity document.
Every invoice line carries a **Sales Item** and a **Revenue Category**; every exception is seeded at least
once as a normal case, a passing case and a failing case. All customers, contacts and addresses are
fictional. Validation itself is out of scope here — the systems expose the data and the answer key, and a
separate validation layer reads them.

| Path | What it is |
|---|---|
| `workday/` | **Workday** — *Find Customer Invoices - OTC* (prompt filters: Company, Customer, Invoice Status, Payment Status, Invoice Type, date range), *View Customer Invoice* (Invoice / Additional / Amount Information, tabs: Invoice Lines with Sales Item and Revenue Category, Currency Rate, Tax, Attachments, Notes, Process History), *Customer Invoice Lines - OTC*, *Find Customers*, Revenue Categories, Sales Items |
| `poms/` | **POMS** — order management: filterable order list; order detail with Order, Customer, Vehicle, Financing & payment, Order lines, Price information, Deliveries, Events and Billing documents (Workday references); Customers and Deliveries views |
| `mappings.yaml` | Workday ↔ POMS field mappings and the invoice-type rule (primary key `Sales Order` = `Order No`; Invoice Type → allowed POMS Type / Order Status / Financing Option / Lock State; Customer ↔ Owner fuzzy 85; Company ↔ Market; Total Invoice Amount ↔ Grand Total Price ±0.05 with Payment Receipt / Sales Invoice overrides). The seeded data is built so every branch of this file is exercised |
| `api/` | Static JSON for both systems plus the side systems the exceptions depend on (`api/index.json` lists every endpoint) |
| `sql/` | MySQL schema + seed for the Workday / POMS layer |
| `build.py` | Rebuilds `api/` and `sql/` from the two generators below |
| `generators/workday_poms/generate_workday_poms.py` | SE21 / NO21 / PT21 / DK21 invoices, orders, trackers, rule catalogue and answer key — deterministic; edit the scenario list to add cases |
| `generators/legacy_de21/` | The original DE21 dataset (23 invoices, 23 orders, 8 seeded mismatches), fictionalised; `build.py` converts it into the same schema and adds Revenue Categories to its lines |
| `tools/reference-validator/` | Reference rule implementation used only to prove the seeded data matches the answer key (`python3 tools/reference-validator/validate.py --check` → 72/72). Not part of either system; nothing in the UIs reads it |

## Run it

```bash
python3 -m http.server 8080          # then open http://localhost:8080  (file:// will not work — the apps fetch JSON)
python3 build.py                     # rebuild api/ and sql/ after editing a generator
python3 tools/reference-validator/validate.py --check   # optional: confirm the seeded data matches the answer key
```

Deploy to GitHub Pages (`main` / root, see *Hosting* below).

## Data model (Workday / POMS layer)

```
company (DE21 SE21 NO21 PT21 DK21)
customer ──< customer_invoice ──< invoice_line (sales_item, revenue_category, description, qty, price, extended)
                 │                      revenue_category (3022 3027 3030 3033 · fee categories 3041 3042 3043 · 3055 · 9000)
                 ├── poms_order         (buyer, financing_type, financing_partner, vin, license_plate, base_price, fees, gross, vat, total)
                 ├── nga_tracker        (NO21: required fields, response_status, remove_fees, revised gross / base)
                 ├── factoring_tracker  (NO21: on-account payments captured)
                 ├── dk21_sharepoint_tracker (DK21: required PO ref, agreed price, required description text)
                 ├── ey_final_invoice   (PT21: E&Y number, sequence, date, customer, PO, VIN, amounts)
                 └── salesforce_account (PT21: fallback VAT numbers)
```

Join keys are listed in `api/workday/index.json`.

## Rule catalogue (`api/workday/exception-rules.json`)

The rules below describe the checks the seeded data was built for. They are documented as data for the
external validation layer; the systems themselves do not evaluate them.

| Rule | Company | Name | Severity | On fail |
|---|---|---|---|---|
| `GEN-001` | ALL | Line arithmetic | critical | FAIL |
| `GEN-002` | ALL | Total Invoice Amount vs POMS Grand Total Price (±0.05; Payment Receipt → Final Payment Amount; Sales Invoice / Sales Invoice Bank fallback Grand Total − first positive of Final Payment Amount, Upfront Payment) | critical | FAIL |
| `MAP-001` | ALL | Invoice Type vs POMS Type / Order Status / Financing Option / Lock State (`mappings.yaml` invoice_type_rule) | critical | FAIL |
| `MAP-002` | ALL | Customer vs POMS Owner (fuzzy ≥ 85; the order's loan provider is also accepted for bank-billed invoices) | high | FAIL |
| `MAP-003` | ALL | Company vs POMS Market (SE21 ↔ SE) | high | FAIL |
| `MAP-004` | ALL | Currency | high | FAIL |
| `GEN-003` | ALL | VIN match | high | FAIL |
| `SE21-001` | SE21 | Related party revenue category | high | FAIL |
| `NO21-001` | NO21 | NGA tracker captured | high | FAIL |
| `NO21-002` | NO21 | NGA response received | high | HOLD |
| `NO21-003` | NO21 | Fee lines removed when instructed | critical | FAIL |
| `NO21-004` | NO21 | Revised gross and base applied | critical | FAIL |
| `NO21-005` | NO21 | VAT recalculated after amendment | critical | FAIL |
| `NO21-007` | NO21 | Factoring payment captured | medium | FAIL |
| `PT21-001` | PT21 | Leasing licence plate | high | FAIL |
| `PT21-002` | PT21 | Personal loan bill-to | high | FAIL |
| `PT21-003` | PT21 | Bank sold-to exception | high | FAIL |
| `PT21-004` | PT21 | VAT number on extras / prepayment | medium | FAIL |
| `PT21-005` | PT21 | E&Y final invoice match | critical | FAIL |
| `PT21-006` | PT21 | Gapless numbering and approval order | critical | FAIL |
| `PT21-007` | PT21 | Exclude internal zero-value documents | info | INFO |
| `DK21-001` | DK21 | SharePoint tracker adjustments applied | high | FAIL |
| `DE21-001` | DE21 | VAT rate agrees with POMS | high | FAIL |
| `DE21-002` | DE21 | PO number present | medium | FAIL |
| `DE21-003` | DE21 | Sold-To matches POMS buyer | high | FAIL |
| `DE21-004` | DE21 | Model / model year matches POMS | medium | FAIL |
| `GEN-004` | ALL | POMS order invoiced (run level: orders with no Workday invoice) | medium | INFO |

GEN and MAP rules run for every company. GEN-002 follows `mappings.yaml`: Total Invoice Amount (incl. VAT)
against the POMS amount for that invoice type within 0.05; it is skipped for delivery notes and credit notes,
and superseded by NO21-004 once the NGA team has revised the amounts. MAP-001 only fires for invoice types
listed in `mappings.yaml` (Delivery Note and Credit Note are outside the rule). HOLD means the invoice cannot proceed until an external
input arrives (NGA response) — it is neither a data error nor a pass.

## Seeded scenarios (answer key: `api/workday/expected-results.json`)

37 PASS · 34 FAIL · 1 HOLD across 72 invoices. Every exception appears at least once passing and once failing.

**DE21** (23 invoices, `DE21-CI058544 … 058567`): 16 pass; the 7 seeded defects of the original POC are
`058546` total lower than POMS (GEN-002), `058549` 0 % tax code (DE21-001 + GEN-002), `058552` VIN (GEN-003),
`058555` order missing in POMS (GEN-002), `058558` PO blank (DE21-002), `058561` sold-to ≠ POMS buyer (DE21-003),
`058564` model year (DE21-004).

**Mapping-rule scenarios** (12 invoices): `CI-SE21-100207` Bank Invoice Before Handover on a confirmed Personal Loan order (PASS) ·
`100208` Sales Invoice Bank on a Personal Loan order (FAIL MAP-001) · `100209` Sales Invoice = Grand Total − Upfront Payment (PASS, fallback) ·
`CI-NO21-200311` currency SEK vs NOK (FAIL MAP-004) · `200312` order manually unlocked (FAIL MAP-001) · `200313` "Nordic Consulting AS" vs
"Nordic Consulting A/S" (PASS, fuzzy) · `CI-PT21-300417` customer ≠ owner (FAIL MAP-002) · `300418` Payment Receipt = Final Payment Amount (PASS) ·
`300419` Payment Receipt = grand total although 2,500 paid upfront (FAIL GEN-002) · `CI-DK21-400506` DK21 invoice on a Swedish order
(FAIL MAP-002/003/004) · `400507` Sales Invoice Fleet on a B2C order (FAIL MAP-001) · `400508` 0.03 rounding difference (PASS, tolerance). POMS order `11730254` has no Workday invoice and is reported at run level (GEN-004).

| Invoice | Expected | Rules | Scenario |
|---|---|---|---|
| `CI-SE21-100201` | PASS | — | SE21 normal: private cash buyer, bill-to = sold-to, no related party |
| `CI-SE21-100202` | PASS | — | SE21 exception PASS: bill-to Nordkredit Bank AB, Brand line already on 3030 |
| `CI-SE21-100203` | FAIL | SE21-001 | SE21 exception FAIL: bill-to Svea Fordonsbank AB, Brand line left on 3022 (the screenshot case) |
| `CI-SE21-100204` | FAIL | SE21-001 | SE21 exception FAIL: Nordkredit Bank AB is sold-to, Brand line on 3027 |
| `CI-SE21-100205` | PASS | — | SE21 normal: corporate fleet buyer with PO |
| `CI-SE21-100206` | FAIL | GEN-001, GEN-002 | SE21 generic FAIL: extended amount does not equal quantity × unit price |
| `CI-NO21-200301` | PASS | — | NO21 normal: private buyer, not NGA, fees chargeable, matches POMS |
| `CI-NO21-200302` | PASS | — | NO21 NGA PASS: tracker says remove fees; fees removed, gross and base revised, VAT recalculated |
| `CI-NO21-200303` | FAIL | NO21-003, NO21-004 | NO21 NGA FAIL: tracker says remove fees but fee lines are still on the draft |
| `CI-NO21-200304` | FAIL | NO21-001 | NO21 NGA FAIL: NGA customer but invoice never captured in the NGA tracker |
| `CI-NO21-200305` | HOLD | NO21-002 | NO21 NGA HOLD: tracker submitted, NGA team response still pending |
| `CI-NO21-200306` | FAIL | NO21-005 | NO21 NGA FAIL: fees removed and gross revised but VAT still calculated on the old gross |
| `CI-NO21-200307` | FAIL | GEN-002 | NO21 FAIL: Workday vehicle price 459,900 vs POMS 449,900 (manual amendment needed) |
| `CI-NO21-200308` | FAIL | NO21-007 | NO21 FAIL: payment recorded On Account but missing from the factoring tracker (processing delay) |
| `CI-NO21-200309` | PASS | — | NO21 NGA PASS: tracker confirms fees are chargeable; fee lines retained, amounts unchanged |
| `CI-NO21-200310` | FAIL | NO21-001 | NO21 NGA FAIL: tracker row exists but Model Number and Base Price were not captured |
| `CI-PT21-300401` | PASS | — | PT21 normal: private cash buyer; E&Y final invoice matches on date, amount, name, PO |
| `CI-PT21-300402` | PASS | — | PT21 leasing PASS: Atlântico Renting, licence plate from POMS present in the line description |
| `CI-PT21-300403` | FAIL | PT21-001 | PT21 leasing FAIL: Lusoleasing, licence plate BH-44-LQ missing from the description |
| `CI-PT21-300404` | FAIL | PT21-001 | PT21 leasing FAIL: Mobilease, plate on invoice CJ-10-MN, POMS has CJ-01-MN |
| `CI-PT21-300405` | PASS | — | PT21 personal loan PASS: Lusitânia Crédito finances; bill-to changed to buyer so bill-to = sold-to = buyer |
| `CI-PT21-300406` | FAIL | PT21-002 | PT21 personal loan FAIL: bill-to still Crédito Ibérico SA instead of the buyer |
| `CI-PT21-300407` | PASS | — | PT21 bank exception PASS: sold-to changed to Banco Meridional SA so bill-to = sold-to = loan provider |
| `CI-PT21-300408` | FAIL | PT21-003 | PT21 bank exception FAIL: sold-to is still the buyer Rui Martins |
| `CI-PT21-300409` | FAIL | PT21-004 | PT21 prepayment FAIL: customer VAT number blank on the draft; Salesforce holds PT509876543 |
| `CI-PT21-300410` | PASS | — | PT21 prepayment PASS: VAT number populated |
| `CI-PT21-300411` | FAIL | PT21-005 | PT21 E&Y FAIL: E&Y final invoice amount 47,900.00 excl. VAT vs Workday 45,900.00 |
| `CI-PT21-300412` | FAIL | PT21-005 | PT21 E&Y FAIL: invoice date in Workday differs from the E&Y final invoice date |
| `CI-PT21-300413` | FAIL | PT21-006 | PT21 gapless FAIL: Workday statutory number is one ahead of the E&Y number for this invoice |
| `CI-PT21-300414` | FAIL | PT21-006 | PT21 gapless FAIL: approved in Workday before the E&Y final invoice was received |
| `CI-PT21-300415` | PASS | — | PT21 delivery note PASS: zero-value internal document, excluded from the daily E&Y report |
| `CI-PT21-300416` | PASS | — | PT21 credit note PASS: matches E&Y credit note; reason noted; kept in draft |
| `CI-DK21-400501` | PASS | — | DK21 normal: private cash buyer |
| `CI-DK21-400502` | PASS | — | DK21 tracker PASS: PO reference, agreed fleet price and cost-centre text all applied from SharePoint tracker |
| `CI-DK21-400503` | FAIL | DK21-001, GEN-002 | DK21 tracker FAIL: list price billed, PO reference missing, cost-centre text missing |
| `CI-DK21-400504` | PASS | — | DK21 normal: corporate buyer with accessory line |
| `CI-DK21-400505` | FAIL | GEN-003 | DK21 generic FAIL: VIN on the invoice does not match the POMS order |

`tools/reference-validator/validate.py --check` confirms the seeded data reproduces this table (72/72).

## Layout variant 5 — text noise and ARIA grids (branch `variant/5-noise-grid`)

A scraper test fixture: the same `label` + `.v` markup, data, routes, filters and answer key as `bv-poc`, with noise
on every label and a different kind of results grid. Only `workday/`, `poms/`, this README and the landing-page
banner differ from `bv-poc`; nothing under `api/`, `generators/`, `build.py` or `sql/` changes.

| Aspect | `bv-poc` | this branch |
|---|---|---|
| Field labels (both apps) | `Total Invoice Amount` | a trailing colon, a case style chosen by a hash of the label (upper / lower / as-is) and, for about a third of the labels, an icon in a `span.ico[aria-hidden=true]` before the text: `🏷️TOTAL INVOICE AMOUNT:`, `currency:`. The same label always renders the same way |
| Workday grids (worklist, invoice lines, customers, revenue categories, sales items, tax…) | `table` with `thead th` / `tbody td` | `div[role=grid]` → `[role=rowgroup]` → `[role=row]` of `[role=columnheader]` / `[role=gridcell]`, styled with CSS `display:table`; the `#grid` host id, the column texts and the invoice link in the first cell are unchanged |
| Worklist filter box | placeholder `Filter results` | placeholder `Search invoices…` (same `#quick` id) |
| Worktags | `Model: Polestar 2 2027`, `Sales Order: 11200003` … as text lines | chips: `span.wtchip > span.k` (name) + `span.val` (value), no `Name: value` text pattern; the Sales Order chip still links to POMS |
| Not found | Workday: "The record could not be found."; POMS: "Record not found." | Workday: "Nothing to show for &lt;key&gt;."; empty grids: "Nothing to show."; POMS: "No order matches &lt;key&gt;." (the key stays in the text; the `.empty` card is kept) |
| Hidden duplicates | — | the invoice page ends with `div.printcopy[hidden]`: a second, `display:none` copy of Invoice / Additional / Amount Information with every label and value |
| POMS tables | unchanged | unchanged |

What it exercises in a learner: label normalisation (colon, case, aria-hidden decorations), ARIA-grid lookup with
the open control resolved from the live column headers, learning the not-found signature from a negative sample
with the key templated out, a key field that is no longer a `Name: value` text, and value-first search that must
skip elements without a box. The current `src/sites/poc/workday.yaml` fails on `placeholder: Filter results`,
`rows: #grid tbody tr`, the `Revenue Category` lines table and the worktag parser; its labels no longer equal the
on-page text on either app.

## Hosting on GitHub Pages

1. `git init -b main && git add . && git commit -m "POC"` in this folder (`index.html` must be at the repo root).
2. `git remote add origin https://github.com/<you>/<repo>.git && git push -u origin main`
   (if the repo already has a README: `git pull origin main --allow-unrelated-histories --no-edit` first, or `git push --force`).
3. Repo → **Settings → Pages** → *Deploy from a branch* → `main` / **`/ (root)`** → Save. Do **not** pick `/docs`.
4. Wait for the *pages build and deployment* action to go green, then open `https://<you>.github.io/<repo>/`.

Nothing in the site uses absolute URLs, so it works at any repo name or custom domain. `.nojekyll` keeps
GitHub from running Jekyll over the folders.
