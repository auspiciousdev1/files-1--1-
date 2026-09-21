#!/usr/bin/env python3
"""
Build the unified dataset served from api/.

    python3 build.py

Two generators feed it:
  generators/workday_poms/generate_workday_poms.py   SE21 / NO21 / PT21 / DK21 — invoices with
                                                     Sales Item + Revenue Category on every line,
                                                     POMS orders, trackers, E&Y, Salesforce,
                                                     rule catalogue and answer key
  generators/legacy_de21/                            the original DE21 dataset of this POC
                                                     (23 invoices, 23 orders, 8 seeded mismatches)

The DE21 records are converted into the same schema, given Revenue Categories on
their lines, and its 8 seeded mismatches become DE21 rows of the answer key.
Everything is written to api/ and sql/; the validator and the two UIs read only api/.
"""
from __future__ import annotations

import glob
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(ROOT, "generators")
STAGE = os.path.join(GEN, "workday_poms")
LEGACY = os.path.join(GEN, "legacy_de21", "api")
API = os.path.join(ROOT, "api")
WD = os.path.join(API, "workday")
SQL = os.path.join(ROOT, "sql")


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def dump(p, obj):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def money(x):
    return round(float(x) + 1e-9, 2)


def iso(d: str) -> str:            # legacy dates are dd/mm/yyyy
    dd, mm, yy = d.split("/")
    return f"{yy}-{mm}-{dd}"


# ----------------------------------------------------------------------------
# 1. run the SE21/NO21/PT21/DK21 generator into its staging folder, copy to api/
# ----------------------------------------------------------------------------
os.makedirs(os.path.join(STAGE, "sql"), exist_ok=True)
subprocess.run([sys.executable, os.path.join(STAGE, "generate_workday_poms.py")], check=True, cwd=STAGE)
keep_runs = os.path.join(API, "validation-runs")
tmp_runs = None
if os.path.isdir(keep_runs):
    tmp_runs = os.path.join(ROOT, ".runs-keep")
    shutil.rmtree(tmp_runs, ignore_errors=True)
    shutil.move(keep_runs, tmp_runs)
shutil.rmtree(API, ignore_errors=True)
shutil.copytree(os.path.join(STAGE, "api"), API)
if tmp_runs:
    shutil.move(tmp_runs, keep_runs)
shutil.rmtree(SQL, ignore_errors=True)
shutil.copytree(os.path.join(STAGE, "sql"), SQL)

companies = load(os.path.join(WD, "companies.json"))
customers = load(os.path.join(WD, "customers.json"))
revcats = load(os.path.join(WD, "revenue-categories.json"))
items = load(os.path.join(WD, "sales-items.json"))
inv_headers = load(os.path.join(WD, "customer-invoices.json"))
flat = load(os.path.join(WD, "invoice-lines.json"))
orders = load(os.path.join(API, "poms", "orders.json"))
rules = load(os.path.join(WD, "exception-rules.json"))
expected = load(os.path.join(WD, "expected-results.json"))
index = load(os.path.join(WD, "index.json"))
RC = {r["revenue_category"]: r for r in revcats["data"]}

# ----------------------------------------------------------------------------
# 2. DE21 — company, masters
# ----------------------------------------------------------------------------
DE21 = {"company": "DE21", "company_name": "DE21 Polestar Automotive Germany GmbH", "country": "DE",
        "currency": "EUR", "vat_rate": 19.0, "vat_registration": "DE325417612",
        "statutory_invoicing": "Workday", "market": "Germany",
        "exception_scope": "Generic Workday vs POMS field validation (amount, VAT, VIN, PO, customer, model, orphan records)"}
companies["data"].append(DE21)
companies["count"] = len(companies["data"])

revcats["data"].append({"revenue_category": "3023", "name": "Car Sales - Remarketed", "is_fee": False,
                        "ledger_account": "3023 Revenue - remarketed vehicles",
                        "note": "Used / demo / remarketed vehicle sales (DE21 legacy dataset)."})
revcats["data"].sort(key=lambda r: r["revenue_category"])
revcats["count"] = len(revcats["data"])
RC = {r["revenue_category"]: r for r in revcats["data"]}

NEW_ITEMS = [
    {"sales_item": "DLV-HANDLING", "name": "Delivery & handling", "default_revenue_category": "3027", "item_group": "Extras"},
    {"sales_item": "REG-DE", "name": "Registration services", "default_revenue_category": "3027", "item_group": "Extras"},
]
items["data"].extend(NEW_ITEMS)
items["count"] = len(items["data"])
SI = {s["sales_item"]: s for s in items["data"]}

leg_inv = [load(p)["data"] for p in sorted(glob.glob(os.path.join(LEGACY, "invoices", "*.json")))]
leg_ord = [load(p)["data"] for p in sorted(glob.glob(os.path.join(LEGACY, "orders", "*.json")))]
mismatches = load(os.path.join(LEGACY, "mismatches.json"))["data"]

# customers: one per distinct (customer_id, name) seen on invoices or orders
seen = {}
for i in leg_inv:
    seen.setdefault(i["customer_id"], i["bill_to_customer"])
for o in leg_ord:
    seen.setdefault(o["orderer"]["customer_id"], o["orderer"]["company"])
seen.setdefault("DE21-INTERNAL", "Polestar Automotive Germany GmbH")
for cid, name in seen.items():
    customers["data"].append({"customer_id": cid, "customer_name": name, "company": "DE21",
                              "customer_type": "LEASING" if any(k in name for k in ("Lease", "Ayvens", "Athlon", "Vive", "FINN", "Sixt")) else "CORPORATE",
                              "country": "DE", "vat_number": None, "related_party": name.startswith("Polestar"),
                              "nga_customer": False, "leasing_plate_required": False, "loan_provider": False,
                              "bpi_exception": False, "sharepoint_tracker": False})
customers["count"] = len(customers["data"])
for c in customers["data"]:
    if c["company"] == "DE21":
        dump(os.path.join(WD, "customers", f"{c['customer_id']}.json"), {"source_system": "Workday", "data": c})
CUST_BY_NAME = {c["customer_name"]: c["customer_id"] for c in customers["data"] if c["company"] == "DE21"}

# ----------------------------------------------------------------------------
# 3. DE21 — POMS orders into the unified order schema
# ----------------------------------------------------------------------------
FIN = {"Cash": "CASH", "Leasing": "LEASING", "Financing": "LOAN"}
new_orders = []
for o in leg_ord:
    p = o["price_information"]
    vat_rate = 19.0
    gross_incl = money(p["grand_total_price"])
    vat = money(p["grand_total_vat"])
    net = money(gross_incl - vat)
    car_net = money(p["car_total_price"] / (1 + vat_rate / 100))
    opts = [{"option_code": "PLUS-PACK", "description": l["item"], "amount": money(l["amount_incl_vat"] / (1 + vat_rate / 100))}
            for l in o["order_lines"] if not l["item"].startswith("Polestar")]
    inv_nos = [i["invoice_number"] for i in leg_inv if i["sales_order"] == o["order_no"]]
    new_orders.append({
        "order_number": o["order_no"], "market": "Germany", "company": "DE21",
        "vin": o["car"]["vin"], "model": o["car"]["model"], "model_code": "P" + o["car"]["model"][-1],
        "model_year": o["car"]["model_year"], "exterior_colour": o["car"]["colour"],
        "buyer_customer_id": o["orderer"]["customer_id"], "buyer_name": o["orderer"]["company"],
        "buyer_contact": f"{o['orderer']['first_name']} {o['orderer']['last_name']}",
        "financing_type": FIN.get(o["financing_option"], o["financing_option"].upper()),
        "financing_partner_id": None, "financing_partner": None, "license_plate": None,
        "order_type": o["order_type"], "sales_type": o["sales_type"], "sales_channel": o["sales_channel"],
        "order_date": o["created_at_iso"][:10],
        "handover_date": (o["deliveries"][0]["planned_date"] if o.get("deliveries") else None),
        "order_status": o["order_status"].upper(), "currency": "EUR",
        "base_price": car_net, "paint_amount": 0.0, "options": opts, "fees": [], "discount_amount": 0.0,
        "gross_taxable_amount": net, "vat_rate": vat_rate, "vat_amount": vat, "total_price": gross_incl,
        "payment_status": "UNPAID", "poms_last_updated": o["updated_at"],
        "workday_invoices": inv_nos,
    })
orders["data"].extend(new_orders)
orders["count"] = len(orders["data"])
for o in new_orders:
    dump(os.path.join(API, "poms", "orders", f"{o['order_number']}.json"), {"source_system": "POMS", "data": o})
ORD = {o["order_number"]: o for o in orders["data"]}

# ----------------------------------------------------------------------------
# 4. DE21 — Workday invoices into the unified invoice schema (+ Revenue Category)
# ----------------------------------------------------------------------------
def rc_for(item: str, order_type: str | None) -> str:
    if item == "Vehicle sale":
        return "3023" if order_type == "remarketed" else "3022"
    return "3027"


def si_for(item: str, model: str) -> str:
    if item == "Vehicle sale":
        return {"2": "P2-CAR", "3": "P3-CAR", "4": "P4-CAR"}.get(model.replace("Polestar ", "")[:1], "P2-CAR")
    return {"Delivery & handling": "DLV-HANDLING", "Registration services": "REG-DE"}.get(item, "SIE-INT")


new_invoices = []
for i in leg_inv:
    order = ORD.get(i["sales_order"])
    rows = []
    for l in i["invoice_lines"]:
        si = si_for(l["item"], i["model"])
        rc = rc_for(l["item"], order["order_type"] if order else None)
        rows.append({"line": l["line"], "company": DE21["company_name"],
                     "sales_item": si, "sales_item_name": SI[si]["name"] if si in SI else l["item"],
                     "revenue_category": rc, "revenue_category_name": RC[rc]["name"],
                     "line_item_description": l["description"],
                     "quantity": l["quantity"], "unit_of_measure": "Each", "quantity_2": 0, "unit_of_measure_2": None,
                     "unit_price": money(l["unit_price"]), "extended_amount": money(l["extended_amount"]),
                     "released_on_invoice_lines": None, "tax_applicability": "Taxable", "tax_code": l["tax_code"]})
    tax_rate = 0.0 if "0%" in i["default_tax_code"] else 19.0
    subtotal = money(i["net_invoice_amount"])
    inv = {
        "invoice_number": i["invoice_number"], "document_kind": "Customer Invoice", "invoice_type": i["invoice_type"],
        "company": "DE21", "company_name": DE21["company_name"], "status": i["status"].upper(),
        "payment_status": i["payment_status"].upper(),
        "invoice_date": iso(i["invoice_date"]), "due_date": iso(i["due_date"]), "payment_terms": i["payment_terms"],
        "bill_to_customer_id": CUST_BY_NAME.get(i["bill_to_customer"], i["customer_id"]), "bill_to_customer": i["bill_to_customer"],
        "sold_to_customer_id": CUST_BY_NAME.get(i["sold_to_customer"], i["customer_id"]), "sold_to_customer": i["sold_to_customer"],
        "ship_to_customer": i["ship_to_customer"], "bill_to_address": i["bill_to_address"],
        "customer_vat_number": None, "currency": "EUR", "po_number": i["po_number"] or None,
        "vin": i["vehicle_identifier_number"], "poms_order_number": i["sales_order"], "model": i["model"],
        "worktags": i["worktags"], "statutory_invoice_type": None, "statutory_invoice_number": None,
        "memo": i["memo"], "payment_application": None, "attachments": [],
        "lines": rows,
        "tax": {"tax_code": i["default_tax_code"], "tax_rate": tax_rate, "taxable_amount": subtotal, "tax_amount": money(i["tax_amount"])},
        "totals": {"subtotal": subtotal, "tax_amount": money(i["tax_amount"]), "total_amount": money(i["total_invoice_amount"]), "currency": "EUR"},
        "created_by": "BPO O2C Billing Desk", "created_on": iso(i["invoice_date"]) + "T08:30:00Z",
        "last_updated": iso(i["invoice_date"]) + "T08:30:00Z",
    }
    new_invoices.append(inv)


def header_row(i: dict) -> dict:
    h = {k: v for k, v in i.items() if k not in ("lines", "tax", "totals", "attachments", "payment_application", "worktags")}
    h.update({"line_count": len(i["lines"]), "taxable_amount": i["tax"]["taxable_amount"], "tax_rate": i["tax"]["tax_rate"],
              "tax_amount": i["tax"]["tax_amount"], "subtotal": i["totals"]["subtotal"], "total_amount": i["totals"]["total_amount"],
              "has_fee_lines": any(RC[l["revenue_category"]]["is_fee"] for l in i["lines"]), "payment_applied_as": None})
    return h


for inv in new_invoices:
    dump(os.path.join(WD, "customer-invoices", f"{inv['invoice_number']}.json"), {"source_system": "Workday", "data": inv})
    h = header_row(inv)
    inv_headers["data"].append(h)
    for l in inv["lines"]:
        flat["data"].append({**{k: v for k, v in h.items() if k != "line_count"}, **{("line_company" if k == "company" else k): v for k, v in l.items()}})
inv_headers["count"] = len(inv_headers["data"])
flat["count"] = len(flat["data"])

# ----------------------------------------------------------------------------
# 5. DE21 — rules and answer key (from the 8 seeded mismatches)
# ----------------------------------------------------------------------------
DE_RULES = [
    {"rule_id": "DE21-001", "company": "DE21", "name": "VAT rate agrees with POMS", "severity": "high",
     "condition": "Invoice references a POMS order", "check": "Workday tax rate / tax amount equals the VAT rate and VAT amount on the POMS order",
     "source": "POMS order", "outcome_on_fail": "FAIL", "remediation": "Change the tax code to the POMS VAT rate and recalculate tax."},
    {"rule_id": "DE21-002", "company": "DE21", "name": "PO number present", "severity": "medium",
     "condition": "B2B customer invoice", "check": "po_number is populated (DE21 B2B customers require the PO / order reference on the invoice)",
     "source": "Workday invoice header", "outcome_on_fail": "FAIL", "remediation": "Populate the PO number from the POMS order."},
    {"rule_id": "DE21-003", "company": "DE21", "name": "Sold-To matches POMS buyer", "severity": "high",
     "condition": "Invoice references a POMS order", "check": "sold_to_customer equals the ordering company in POMS",
     "source": "POMS order", "outcome_on_fail": "FAIL", "remediation": "Correct Sold-To (and Bill-To) to the POMS buyer."},
    {"rule_id": "DE21-004", "company": "DE21", "name": "Model / model year matches POMS", "severity": "medium",
     "condition": "Invoice references a POMS order", "check": "Invoice model incl. model year equals the ordered car",
     "source": "POMS order", "outcome_on_fail": "FAIL", "remediation": "Correct the model worktag and vehicle line description."},
    {"rule_id": "GEN-004", "company": "ALL", "name": "POMS order invoiced", "severity": "medium",
     "condition": "Every non-cancelled POMS order past handover planning", "check": "At least one Workday invoice references the order (reported at run level, not per invoice)",
     "source": "POMS order", "outcome_on_fail": "INFO"},
]
rules["data"].extend(DE_RULES)
rules["count"] = len(rules["data"])

MAP = {"total_amount": ("FAIL", ["GEN-002"], "Workday total lower than POMS grand total — net value disagrees with POMS."),
       "vat_amount": ("FAIL", ["DE21-001", "GEN-002"], "0% intra-EU tax code applied; POMS expects 19% VAT (net grossed up to the incl.-VAT price)."),
       "vin": ("FAIL", ["GEN-003"], "VIN on the invoice differs from the POMS order."),
       "missing_in_poms": ("FAIL", ["GEN-002"], "Invoice references an order number that does not exist in POMS."),
       "po_number_missing": ("FAIL", ["DE21-002"], "PO number blank on a B2B invoice."),
       "customer_mismatch": ("FAIL", ["DE21-003"], "Sold-To customer differs from the POMS ordering company."),
       "model_mismatch": ("FAIL", ["DE21-004"], "Model year on the invoice differs from the ordered car.")}
mm_by_inv = {m["invoice_number"]: m for m in mismatches if m["invoice_number"]}
for inv in new_invoices:
    m = mm_by_inv.get(inv["invoice_number"])
    if m:
        st, fnd, sc = MAP[m["finding"]]
        expected["data"].append({"invoice_number": inv["invoice_number"], "company": "DE21", "scenario": f"DE21 — {sc}",
                                 "expected_status": st, "expected_findings": fnd, "remediation": m["description"]})
    else:
        expected["data"].append({"invoice_number": inv["invoice_number"], "company": "DE21",
                                 "scenario": f"DE21 — normal {inv['invoice_type'].lower()}, agrees with POMS on every field",
                                 "expected_status": "PASS", "expected_findings": [], "remediation": None})
expected["count"] = len(expected["data"])
expected["summary"] = {s: sum(1 for e in expected["data"] if e["expected_status"] == s) for s in ("PASS", "FAIL", "HOLD")}
expected["orders_without_invoice"] = [m["order_no"] for m in mismatches if m["finding"] == "missing_in_workday"]

# ----------------------------------------------------------------------------
# 6. write everything back
# ----------------------------------------------------------------------------
dump(os.path.join(WD, "companies.json"), companies)
dump(os.path.join(WD, "customers.json"), customers)
dump(os.path.join(WD, "revenue-categories.json"), revcats)
dump(os.path.join(WD, "sales-items.json"), items)
dump(os.path.join(WD, "customer-invoices.json"), inv_headers)
dump(os.path.join(WD, "invoice-lines.json"), flat)
dump(os.path.join(API, "poms", "orders.json"), orders)
dump(os.path.join(WD, "exception-rules.json"), rules)
dump(os.path.join(WD, "expected-results.json"), expected)

# legacy answer key stays where the first version of the POC put it
dump(os.path.join(API, "mismatches.json"), {"note": "Legacy DE21 answer key from the first version of this POC. Superseded by api/workday/expected-results.json, which covers every company.",
                                             "count": len(mismatches), "data": mismatches})

index["system"] = "Workday + POMS billing validation POC (DE21, SE21, NO21, PT21, DK21)"
index["companies"] = [c["company"] for c in companies["data"]]
index["endpoints"]["legacy_de21_mismatches"] = "api/mismatches.json"
index["counts"] = {"customer_invoices": len(inv_headers["data"]), "invoice_lines": len(flat["data"]), "poms_orders": len(orders["data"]),
                   "customers": len(customers["data"]), "rules": len(rules["data"]), "expected": expected["summary"]}
dump(os.path.join(WD, "index.json"), index)
dump(os.path.join(API, "index.json"), index)

print(f"api/ built: {len(inv_headers['data'])} invoices, {len(flat['data'])} lines, {len(orders['data'])} orders, "
      f"{len(customers['data'])} customers, {len(rules['data'])} rules, answer key {expected['summary']}")
