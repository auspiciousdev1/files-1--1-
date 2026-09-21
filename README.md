# Pre-billing invoice validation POC — Workday · POMS · hourly validator

Two mock systems over one static JSON API (hostable on GitHub Pages) plus a rule-based validator that
runs every hour. Five legal entities: **DE21** (the original dataset of this POC) and **SE21, NO21, PT21,
DK21** with the exceptions from the entity document. Every invoice line carries a **Sales Item** and a
**Revenue Category**; every exception is seeded at least once as a normal case, a passing case and a
failing case.

| Path | What it is |
|---|---|
| `workday/` | **Workday** — Find Customer Invoices worklist (company and PASS / FAIL / HOLD filters), View Customer Invoice with the *Invoice Lines* tab (Sales Item, Revenue Category, Line Item Description, Quantity, UoM, Unit Price, Extended Amount), Tax, Attachments, Notes, **Validation** tab (finding → expected / actual / fix, flagged cells highlighted) and *Related systems*; customers, revenue categories, sales items, trackers, rules and the **Hourly validation monitor** (`#/monitor`) |
| `poms/` | **POMS** — the order management system the invoice must agree with (buyer, financing partner, VIN, licence plate, base price, fees, gross taxable, VAT, total), linked to its Workday invoices |
| `validator/` | `rules.py` (one function per exception), `validate.py` (one run → `api/validation-runs/latest.json`), `scheduler.py` (hourly loop) |
| `.github/workflows/hourly-validation.yml` | Cron `0 * * * *` — runs the validator on GitHub and commits the results so the hosted UI updates |
| `build.py` | Rebuilds `api/` and `sql/` from the two generators below |
| `generators/workday_poms/generate_workday_poms.py` | SE21 / NO21 / PT21 / DK21 invoices, orders, trackers, rule catalogue and answer key — deterministic; edit the scenario list to add cases |
| `generators/legacy_de21/` | The original DE21 dataset (23 invoices, 23 orders, 8 seeded mismatches) — converted by `build.py` into the same schema, with Revenue Categories added to its lines |
| `api/` | Static JSON for everything above (`api/index.json` lists every endpoint) |
| `sql/` | MySQL schema + seed for the Workday / POMS layer |

## Run it

```bash
python3 -m http.server 8080          # then open http://localhost:8080  (file:// will not work — the apps fetch JSON)
python3 validator/validate.py --check   # one validation run, graded against the answer key
python3 validator/scheduler.py          # run now, then at the top of every hour
python3 validator/scheduler.py --interval 5   # demo pace
```

Rebuild the data after editing a generator with `python3 build.py`.

Deploy to GitHub Pages (`main` / root, see *Hosting* below). Enable Actions and the hourly workflow keeps
`api/validation-runs/` current; the Workday UI reads `latest.json` on every page load, so the *Validation*
column, the per-invoice *Validation* tab and the monitor page always show the most recent run.

To validate a hosted copy from anywhere: `python3 validator/validate.py --base-url https://<you>.github.io/<repo>`.

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

## Rules (from the entity exception notes)

| Rule | Company | Name | Severity | On fail |
|---|---|---|---|---|
| `GEN-001` | ALL | Line arithmetic | critical | FAIL |
| `GEN-002` | ALL | Workday vs POMS value match | critical | FAIL |
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
| `PT21-003` | PT21 | Banco BPI exception | high | FAIL |
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

GEN rules run for every company. GEN-002 compares the Workday subtotal (excl. VAT) with the POMS gross
taxable amount; it is skipped for prepayments, delivery notes and credit notes, and superseded by NO21-004
once the NGA team has revised the amounts. HOLD means the invoice cannot proceed until an external
input arrives (NGA response) — it is neither a data error nor a pass.

## Seeded scenarios (answer key: `api/workday/expected-results.json`)

32 PASS · 27 FAIL · 1 HOLD across 60 invoices. Every exception appears at least once passing and once failing.

**DE21** (23 invoices, `DE21-CI058544 … 058567`): 16 pass; the 7 seeded defects of the original POC are
`058546` total lower than POMS (GEN-002), `058549` 0 % tax code (DE21-001 + GEN-002), `058552` VIN (GEN-003),
`058555` order missing in POMS (GEN-002), `058558` PO blank (DE21-002), `058561` sold-to ≠ POMS buyer (DE21-003),
`058564` model year (DE21-004). POMS order `11730254` has no Workday invoice and is reported at run level (GEN-004).

| Invoice | Expected | Rules | Scenario |
|---|---|---|---|
| `CI-SE21-100201` | PASS | — | SE21 normal: private cash buyer, bill-to = sold-to, no related party |
| `CI-SE21-100202` | PASS | — | SE21 exception PASS: bill-to Ziklo Bank, Brand line already on 3030 |
| `CI-SE21-100203` | FAIL | SE21-001 | SE21 exception FAIL: bill-to Volvo Bank, Brand line left on 3022 (the screenshot case) |
| `CI-SE21-100204` | FAIL | SE21-001 | SE21 exception FAIL: Ziklo Bank is sold-to, Brand line on 3027 |
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
| `CI-PT21-300402` | PASS | — | PT21 leasing PASS: LeasePlan, licence plate from POMS present in the line description |
| `CI-PT21-300403` | FAIL | PT21-001 | PT21 leasing FAIL: Arval, licence plate BH-44-LQ missing from the description |
| `CI-PT21-300404` | FAIL | PT21-001 | PT21 leasing FAIL: Kinto, plate on invoice CJ-10-MN, POMS has CJ-01-MN |
| `CI-PT21-300405` | PASS | — | PT21 personal loan PASS: Lusitânia Crédito finances; bill-to changed to buyer so bill-to = sold-to = buyer |
| `CI-PT21-300406` | FAIL | PT21-002 | PT21 personal loan FAIL: bill-to still Crédito Ibérico SA instead of the buyer |
| `CI-PT21-300407` | PASS | — | PT21 Banco BPI PASS: sold-to changed to Banco BPI SA so bill-to = sold-to = loan provider |
| `CI-PT21-300408` | FAIL | PT21-003 | PT21 Banco BPI FAIL: sold-to is still the buyer Rui Martins |
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

`validate.py --check` grades the validator against this table (currently 60/60, orphan orders OK).

## Validation run shape

`api/validation-runs/latest.json`: `run_id`, `started_at`, `schedule.next_run_at`, `summary {PASS, FAIL, HOLD}`,
`by_company`, `by_rule`, and `results[]` — one row per invoice with `status`, `rules_failed[]` and
`findings[]` (`rule_id`, `severity`, `outcome`, `field`, `expected`, `actual`, `message`, `remediation`, `line`).
The Workday invoice screen highlights the exact cell a finding points at (the yellow Revenue Category cell
on `CI-SE21-100203` is the screenshot case).


## Hosting on GitHub Pages

1. `git init -b main && git add . && git commit -m "POC"` in this folder (`index.html` must be at the repo root).
2. `git remote add origin https://github.com/<you>/<repo>.git && git push -u origin main`
   (if the repo already has a README: `git pull origin main --allow-unrelated-histories --no-edit` first, or `git push --force`).
3. Repo → **Settings → Pages** → *Deploy from a branch* → `main` / **`/ (root)`** → Save. Do **not** pick `/docs`.
4. Wait for the *pages build and deployment* action to go green, then open `https://<you>.github.io/<repo>/`.
5. **Settings → Actions → General → Workflow permissions → Read and write**, then Actions → *Hourly ERP validation* →
   *Run workflow*. Results are committed to `api/validation-runs/` and the monitor page updates on the next deploy.

Nothing in the site uses absolute URLs, so it works at any repo name or custom domain. `.nojekyll` keeps
GitHub from running Jekyll over the folders.
