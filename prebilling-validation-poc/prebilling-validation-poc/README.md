# Pre-billing invoice validation POC

Two mock web apps over one shared dummy dataset:

| Folder | System | Role |
|---|---|---|
| `workday/` | Workday ERP look-alike (Find Open Customer Invoices - OTC + View Customer Invoice) | system under validation |
| `poms/` | Polestar-style Order Management System | source of truth |
| `api/` | Static JSON "API" served by GitHub Pages | data layer |
| `sql/` | MySQL schema + seed with the same data | for when you move off static hosting |

Join key: `workday.sales_order` = `poms.order_no`.

## Deploy on GitHub Pages (2 minutes)

```bash
git init
git add .
git commit -m "Pre-billing validation POC"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then: repo → **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.

URLs after the build finishes:

- `https://<you>.github.io/<repo>/` — landing page
- `https://<you>.github.io/<repo>/workday/` — Workday ERP
- `https://<you>.github.io/<repo>/poms/` — POMS
- `https://<you>.github.io/<repo>/api/invoices.json` — invoice list
- `https://<you>.github.io/<repo>/api/orders/11730100.json` — one order

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

`file://` will not work — the apps fetch JSON, which browsers block on the file protocol.

## Seeded findings

`api/mismatches.json` is the answer key. 8 records are deliberately wrong:
missing invoice, missing order, total amount, VAT amount, VIN, blank PO number,
sold-to customer, and model/model year.

## Regenerate the data

```bash
python3 generate_data.py
```

Edit `MISMATCH_PLAN` in that file to change which records break and how.

## Real database instead of JSON

`sql/schema.sql` + `sql/seed.sql` load the identical data into MySQL. Point a FastAPI
service at it and swap the `API` constant at the top of `workday/app.js` and `poms/app.js`
to your service URL — the UIs need no other change.
