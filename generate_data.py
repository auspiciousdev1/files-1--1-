#!/usr/bin/env python3
"""
Generates the shared dummy dataset for the pre-billing validation POC.

Outputs:
  api/invoices.json            -> Workday ERP invoice list (grid)
  api/invoices/<id>.json       -> Workday ERP invoice detail
  api/orders.json              -> POMS order list
  api/orders/<id>.json         -> POMS order detail
  api/mismatches.json          -> answer key (expected validation findings)
  sql/schema.sql, sql/seed.sql -> MySQL equivalent, if you later move off static hosting

POMS is the source of truth. Workday values are deliberately broken on a few
records so the validation POC has something to catch.
"""
import json
import os
import random
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

random.seed(20260812)
ROOT = os.path.dirname(os.path.abspath(__file__))

CUSTOMERS = [
    ("FINN GmbH", "0014J00000TJ7kxQAD", "Prinzregentenplatz 9 81675 München Germany", "finn.com"),
    ("ViveLaCar GmbH", "0014J00000TK2mAQAT", "Königstraße 27 70173 Stuttgart Germany", "vivelacar.com"),
    ("Sixt SE", "0014J00000TL9pQQAV", "Zugspitzstraße 1 82049 Pullach Germany", "sixt.de"),
    ("LeasePlan Deutschland GmbH", "0014J00000TM4rXQAT", "Hellersbergstraße 10b 41460 Neuss Germany", "leaseplan.de"),
    ("Ayvens Germany GmbH", "0014J00000TN8kLQAV", "Nedderfeld 95 22529 Hamburg Germany", "ayvens.com"),
    ("Athlon Germany GmbH", "0014J00000TP1nDQAT", "Herriotstraße 1 60528 Frankfurt Germany", "athlon.com"),
]

ORDERERS = [
    ("Tim", "Hartdegen"), ("Lena", "Brandt"), ("Marco", "Seiler"), ("Anja", "Köhler"),
    ("Jonas", "Weidmann"), ("Sofia", "Lindqvist"), ("Peter", "Ahlgren"), ("Nadia", "Rustam"),
    ("Felix", "Wagner"), ("Clara", "Neumann"), ("Ravi", "Menon"), ("Erik", "Sundberg"),
]

MODELS = [("Polestar 2", 2025), ("Polestar 3", 2025), ("Polestar 4", 2025), ("Polestar 4", 2026)]
ORDER_TYPES = ["remarketed", "new_car", "remarketed", "new_car", "demo"]
SALES_CHANNELS = ["In Store Retail", "Online Retail", "Fleet Direct"]
DELIVERY_FLOWS = ["level_1", "level_2", "level_3"]
ORDER_STATUSES = ["delivery_planning", "confirmed", "in_production", "ready_for_delivery"]
COMM_STATUS = {
    "delivery_planning": "Vor der Auslieferung",
    "confirmed": "Bestellung bestätigt",
    "in_production": "In Produktion",
    "ready_for_delivery": "Bereit zur Auslieferung",
}
FIN_OPTIONS = ["Cash", "Leasing", "Financing"]

VIN_PREFIX = "YSM4ZPBA1SF40"


def money(x):
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def hexid(n):
    return "".join(random.choice("0123456789abcdef") for _ in range(n))


def uuid_like():
    return f"{hexid(8)}-{hexid(4)}-{hexid(4)}-{hexid(4)}-{hexid(12)}"


# --- mismatch plan (index -> kind) --------------------------------------------
MISMATCH_PLAN = {
    2: "total_amount",        # Workday total != POMS grand total price
    5: "vat_amount",          # wrong tax code applied in Workday -> VAT off
    8: "vin",                 # VIN typo in Workday
    11: "missing_in_poms",    # invoice exists in Workday, no order in POMS
    14: "po_number_missing",  # PO number blank in Workday
    17: "customer_mismatch",  # sold-to in Workday != orderer company in POMS
    20: "model_mismatch",     # model/model year differ
    22: "missing_in_workday", # order exists in POMS, no invoice in Workday
}

N = 24
invoices, orders, mismatches = [], [], []

base_date = datetime(2026, 8, 3, 15, 9)

for i in range(N):
    kind = MISMATCH_PLAN.get(i)

    order_no = str(11730100 + i * 7)
    invoice_no = f"DE21-CI0585{44 + i:02d}"
    vin = f"{VIN_PREFIX}{7139 + i * 13}"
    cust_name, cust_id, cust_addr, domain = CUSTOMERS[i % len(CUSTOMERS)]
    first, last = ORDERERS[i % len(ORDERERS)]
    model, model_year = MODELS[i % len(MODELS)]
    order_type = ORDER_TYPES[i % len(ORDER_TYPES)]
    order_status = ORDER_STATUSES[i % len(ORDER_STATUSES)]
    fin = FIN_OPTIONS[i % len(FIN_OPTIONS)]

    created = base_date - timedelta(days=i, hours=(i * 3) % 20, minutes=(i * 11) % 59)
    confirmed = created
    updated = created + timedelta(hours=17)
    invoice_date = (created + timedelta(days=0)).date()
    due_date = invoice_date + timedelta(days=6)

    # ---- POMS price (source of truth) ----
    gross = money(31000 + (i * 1737.55) % 41000)
    vat = money(gross - gross / 1.19)
    net = money(gross - vat)
    extras_gross = money(0 if i % 3 else 890.00)
    car_gross = money(gross - extras_gross)
    car_vat = money(car_gross - car_gross / 1.19)

    # ---- Workday mirror (may be corrupted) ----
    w_total = gross
    w_tax = vat
    w_net = net
    w_vin = vin
    w_po = order_no
    w_customer = cust_name
    w_cust_id = cust_id
    w_model = f"{model} ({model_year})"
    tax_code = "DEU 19% VAT (19%)"

    if kind == "total_amount":
        w_total = money(gross - 1500.00)
        w_net = money(w_total - w_tax)
    elif kind == "vat_amount":
        tax_code = "DEU 0% VAT Intra-EU (0%)"
        w_tax = 0.00
        w_net = w_total
    elif kind == "vin":
        w_vin = vin[:-2] + ("00" if not vin.endswith("00") else "11")
    elif kind == "po_number_missing":
        w_po = ""
    elif kind == "customer_mismatch":
        w_customer, w_cust_id = "Polestar Automotive Germany GmbH", "0014J00000TQ0zzQAB"
    elif kind == "model_mismatch":
        w_model = "Polestar 2 (2024)"

    # ---------- POMS order record ----------
    if kind != "missing_in_poms":
        order = {
            "order_no": order_no,
            "order_type": order_type,
            "sales_channel": SALES_CHANNELS[i % 3],
            "order_to_delivery_flow": DELIVERY_FLOWS[i % 3],
            "logistic_flow": None,
            "order_status": order_status,
            "communicated_delivery_status": COMM_STATUS[order_status],
            "delivery_status_label": order_status.replace("_", " ").title(),
            "extras_status": "no_extras_added" if extras_gross == 0 else "extras_added",
            "protection_status": "no_protection_added",
            "market": "DE",
            "is_sme_order": False,
            "sales_type": "B2B",
            "configuration_id": uuid_like(),
            "session_id": uuid_like(),
            "car": {
                "model": model,
                "model_year": model_year,
                "display": f"{model} ({model_year})",
                "vin": vin,
                "colour": ["Snow", "Space", "Magnesium", "Thunder"][i % 4],
                "interior": ["Charcoal", "Zinc", "Barley"][i % 3],
            },
            "orderer": {
                "first_name": first,
                "last_name": last,
                "email": f"{first.lower()}.{last.lower()}@{domain}",
                "company": cust_name,
                "customer_id": cust_id,
                "address": cust_addr,
            },
            "financing_option": fin,
            "created_at": created.strftime("%m/%d/%Y, %I:%M %p UTC"),
            "updated_at": updated.strftime("%m/%d/%Y, %I:%M %p UTC"),
            "confirmed_at": confirmed.strftime("%m/%d/%Y, %I:%M %p UTC"),
            "csl_accepted_at": None,
            "terms_and_conditions_accepted_at": None,
            "created_at_iso": created.isoformat() + "Z",
            "price_information": {
                "currency": "EUR",
                "grand_total_price": gross,
                "grand_total_vat": vat,
                "grand_total_tax": 0,
                "grand_total_car_fiscal": None,
                "car_total_price": car_gross,
                "car_total_vat": car_vat,
                "car_total_tax": 0,
                "car_total_incentive_label": None,
                "car_total_incentive_value": None,
                "car_total_incentive_excl_vat_label": None,
                "car_total_incentive_excl_vat_value": None,
                "extras_total_price": extras_gross,
                "extras_total_vat": money(extras_gross - extras_gross / 1.19) if extras_gross else 0,
            },
            "order_lines": [
                {"line": 1, "item": f"{model} {model_year}", "qty": 1,
                 "unit_price_incl_vat": car_gross, "vat_rate": "19%", "amount_incl_vat": car_gross},
            ] + ([{"line": 2, "item": "Plus Pack", "qty": 1, "unit_price_incl_vat": extras_gross,
                   "vat_rate": "19%", "amount_incl_vat": extras_gross}] if extras_gross else []),
            "deliveries": [
                {"delivery_id": f"DLV-{order_no}", "planned_date": (created + timedelta(days=21)).strftime("%Y-%m-%d"),
                 "location": ["München", "Hamburg", "Berlin", "Frankfurt"][i % 4], "status": "planned"}
            ],
            "events": [
                {"timestamp": created.strftime("%Y-%m-%d %H:%M UTC"), "event": "order_created"},
                {"timestamp": confirmed.strftime("%Y-%m-%d %H:%M UTC"), "event": "order_confirmed"},
                {"timestamp": updated.strftime("%Y-%m-%d %H:%M UTC"), "event": "delivery_planning_started"},
            ],
        }
        orders.append(order)

    # ---------- Workday invoice record ----------
    if kind != "missing_in_workday":
        line_net_car = money(w_net * 0.92)
        line_net_del = money(w_net * 0.05)
        line_net_reg = money(w_net - line_net_car - line_net_del)
        invoice = {
            "invoice_number": invoice_no,
            "invoice_type": "Early Invoice" if i % 2 == 0 else "Final Invoice",
            "status": "Draft" if i % 3 else "Approved",
            "payment_status": "Unpaid",
            "company": "DE21 Polestar Automotive Germany GmbH",
            "customer": w_customer,
            "customer_id": w_cust_id,
            "bill_to_customer": w_customer,
            "sold_to_customer": w_customer,
            "bill_to_address": cust_addr,
            "ship_to_customer": w_customer,
            "ship_to_address": cust_addr,
            "bill_to_contact": None,
            "sales_order": order_no,
            "po_number": w_po,
            "vehicle_identifier_number": w_vin,
            "model": w_model,
            "invoice_date": invoice_date.strftime("%d/%m/%Y"),
            "due_date": due_date.strftime("%d/%m/%Y"),
            "discount_date": None,
            "payment_terms": "Net 6 days",
            "payment_type": None,
            "printed": "No",
            "memo": f"Prel. delivery date: {(created + timedelta(days=21)).strftime('%Y-%m-%d')}",
            "worktag_invoice_type": "Payment - Early Invoice, Bank & FSP Inv before HO",
            "worktags": {
                "invoice_type": "Payment - Early Invoice, Bank & FSP Inv before HO",
                "model": f"Polestar {w_model.split()[1]}U",
                "sales_order": order_no,
                "vehicle_identifier_number": w_vin,
            },
            "currency": "EUR",
            "default_tax_code": tax_code,
            "net_invoice_amount": w_net,
            "tax_amount": w_tax,
            "total_invoice_amount": w_total,
            "less_withholding_amount": 0.00,
            "control_total_amount": 0.00,
            "amount_due": w_total,
            "invoice_lines": [
                {"line": 1, "item": "Vehicle sale", "description": w_model, "quantity": 1,
                 "unit_price": line_net_car, "tax_code": tax_code, "extended_amount": line_net_car},
                {"line": 2, "item": "Delivery & handling", "description": "Transport to retail location",
                 "quantity": 1, "unit_price": line_net_del, "tax_code": tax_code, "extended_amount": line_net_del},
                {"line": 3, "item": "Registration services", "description": "Vehicle registration DE",
                 "quantity": 1, "unit_price": line_net_reg, "tax_code": tax_code, "extended_amount": line_net_reg},
            ],
        }
        invoices.append(invoice)

    if kind:
        mismatches.append({
            "invoice_number": invoice_no if kind != "missing_in_workday" else None,
            "order_no": order_no if kind != "missing_in_poms" else None,
            "finding": kind,
            "description": {
                "total_amount": "Workday total invoice amount is lower than the POMS grand total price.",
                "vat_amount": "Workday applied a 0% tax code; POMS expects 19% VAT.",
                "vin": "VIN on the Workday invoice does not match the VIN on the POMS order.",
                "missing_in_poms": "Invoice exists in Workday but no matching order exists in POMS.",
                "po_number_missing": "PO number is blank on the Workday invoice.",
                "customer_mismatch": "Sold-to customer in Workday differs from the ordering company in POMS.",
                "model_mismatch": "Model / model year on the invoice differs from the ordered car.",
                "missing_in_workday": "Order exists in POMS but has not been invoiced in Workday.",
            }[kind],
            "severity": "high" if kind in ("total_amount", "vat_amount", "missing_in_workday", "missing_in_poms") else "medium",
        })

# ---------------------------- write JSON API ---------------------------------
api = os.path.join(ROOT, "api")
os.makedirs(os.path.join(api, "invoices"), exist_ok=True)
os.makedirs(os.path.join(api, "orders"), exist_ok=True)


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


grid_fields = ["invoice_number", "invoice_type", "status", "customer", "customer_id", "sales_order",
               "vehicle_identifier_number", "worktag_invoice_type", "payment_terms", "memo",
               "total_invoice_amount", "tax_amount", "currency", "invoice_date", "due_date"]

dump(os.path.join(api, "invoices.json"), {
    "source_system": "Workday ERP",
    "object": "Customer Invoice",
    "count": len(invoices),
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "data": [{k: inv[k] for k in grid_fields} for inv in invoices],
})
for inv in invoices:
    dump(os.path.join(api, "invoices", f"{inv['invoice_number']}.json"),
         {"source_system": "Workday ERP", "object": "Customer Invoice", "data": inv})

order_grid = ["order_no", "order_type", "delivery_status_label", "order_status", "market", "created_at",
              "financing_option", "created_at_iso"]
dump(os.path.join(api, "orders.json"), {
    "source_system": "POMS",
    "object": "Order",
    "count": len(orders),
    "generated_at": datetime.utcnow().isoformat() + "Z",
    "data": [
        dict({k: o[k] for k in order_grid},
             model=o["car"]["model"], model_year=o["car"]["model_year"], vin=o["car"]["vin"],
             first_name=o["orderer"]["first_name"], last_name=o["orderer"]["last_name"],
             email=o["orderer"]["email"], company=o["orderer"]["company"],
             grand_total_price=o["price_information"]["grand_total_price"],
             grand_total_vat=o["price_information"]["grand_total_vat"])
        for o in orders
    ],
})
for o in orders:
    dump(os.path.join(api, "orders", f"{o['order_no']}.json"),
         {"source_system": "POMS", "object": "Order", "data": o})

dump(os.path.join(api, "mismatches.json"), {
    "note": "Answer key for the POC. POMS is the source of truth.",
    "count": len(mismatches),
    "data": mismatches,
})

dump(os.path.join(api, "index.json"), {
    "poc": "Pre-billing invoice field validation",
    "source_of_truth": "POMS",
    "endpoints": {
        "workday_invoice_list": "api/invoices.json",
        "workday_invoice_detail": "api/invoices/{invoice_number}.json",
        "poms_order_list": "api/orders.json",
        "poms_order_detail": "api/orders/{order_no}.json",
        "expected_findings": "api/mismatches.json",
    },
    "join_key": "workday.sales_order == poms.order_no",
    "counts": {"invoices": len(invoices), "orders": len(orders), "seeded_findings": len(mismatches)},
})

# ---------------------------- MySQL equivalent -------------------------------
sql_dir = os.path.join(ROOT, "sql")
os.makedirs(sql_dir, exist_ok=True)

schema = """-- Optional: same dummy data in MySQL, for when you outgrow static hosting.
CREATE DATABASE IF NOT EXISTS prebilling_poc CHARACTER SET utf8mb4;
USE prebilling_poc;

DROP TABLE IF EXISTS wd_invoice_line, wd_invoice, poms_order_line, poms_order;

CREATE TABLE poms_order (
  order_no                VARCHAR(20) PRIMARY KEY,
  order_type              VARCHAR(30),
  sales_channel           VARCHAR(40),
  order_status            VARCHAR(40),
  market                  CHAR(2),
  sales_type              VARCHAR(10),
  model                   VARCHAR(40),
  model_year              SMALLINT,
  vin                     VARCHAR(20),
  orderer_company         VARCHAR(80),
  orderer_email           VARCHAR(120),
  customer_id             VARCHAR(30),
  financing_option        VARCHAR(20),
  currency                CHAR(3),
  grand_total_price       DECIMAL(12,2),
  grand_total_vat         DECIMAL(12,2),
  car_total_price         DECIMAL(12,2),
  extras_total_price      DECIMAL(12,2),
  created_at              DATETIME,
  confirmed_at            DATETIME
);

CREATE TABLE wd_invoice (
  invoice_number          VARCHAR(30) PRIMARY KEY,
  invoice_type            VARCHAR(30),
  status                  VARCHAR(20),
  company                 VARCHAR(80),
  customer                VARCHAR(80),
  customer_id             VARCHAR(30),
  sales_order             VARCHAR(20),
  po_number               VARCHAR(20),
  vin                     VARCHAR(20),
  model                   VARCHAR(40),
  invoice_date            DATE,
  due_date                DATE,
  payment_terms           VARCHAR(30),
  currency                CHAR(3),
  default_tax_code        VARCHAR(40),
  net_invoice_amount      DECIMAL(12,2),
  tax_amount              DECIMAL(12,2),
  total_invoice_amount    DECIMAL(12,2),
  amount_due              DECIMAL(12,2),
  memo                    VARCHAR(120),
  INDEX idx_sales_order (sales_order)
);

CREATE TABLE wd_invoice_line (
  invoice_number  VARCHAR(30),
  line_no         INT,
  item            VARCHAR(60),
  description     VARCHAR(80),
  quantity        INT,
  unit_price      DECIMAL(12,2),
  tax_code        VARCHAR(40),
  extended_amount DECIMAL(12,2),
  PRIMARY KEY (invoice_number, line_no)
);

CREATE TABLE poms_order_line (
  order_no        VARCHAR(20),
  line_no         INT,
  item            VARCHAR(60),
  qty             INT,
  amount_incl_vat DECIMAL(12,2),
  PRIMARY KEY (order_no, line_no)
);
"""
with open(os.path.join(sql_dir, "schema.sql"), "w") as f:
    f.write(schema)


def q(v):
    if v is None or v == "":
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def to_dt(s):
    return datetime.strptime(s, "%m/%d/%Y, %I:%M %p UTC").strftime("%Y-%m-%d %H:%M:%S")


def to_d(s):
    return datetime.strptime(s, "%d/%m/%Y").strftime("%Y-%m-%d")


rows = ["USE prebilling_poc;", ""]
for o in orders:
    p = o["price_information"]
    rows.append(
        "INSERT INTO poms_order VALUES (" + ", ".join(map(q, [
            o["order_no"], o["order_type"], o["sales_channel"], o["order_status"], o["market"], o["sales_type"],
            o["car"]["model"], o["car"]["model_year"], o["car"]["vin"], o["orderer"]["company"],
            o["orderer"]["email"], o["orderer"]["customer_id"], o["financing_option"], p["currency"],
            p["grand_total_price"], p["grand_total_vat"], p["car_total_price"], p["extras_total_price"],
            to_dt(o["created_at"]), to_dt(o["confirmed_at"]),
        ])) + ");")
    for ln in o["order_lines"]:
        rows.append("INSERT INTO poms_order_line VALUES (" + ", ".join(map(q, [
            o["order_no"], ln["line"], ln["item"], ln["qty"], ln["amount_incl_vat"]])) + ");")
rows.append("")
for inv in invoices:
    rows.append("INSERT INTO wd_invoice VALUES (" + ", ".join(map(q, [
        inv["invoice_number"], inv["invoice_type"], inv["status"], inv["company"], inv["customer"],
        inv["customer_id"], inv["sales_order"], inv["po_number"], inv["vehicle_identifier_number"],
        inv["model"], to_d(inv["invoice_date"]), to_d(inv["due_date"]), inv["payment_terms"], inv["currency"],
        inv["default_tax_code"], inv["net_invoice_amount"], inv["tax_amount"], inv["total_invoice_amount"],
        inv["amount_due"], inv["memo"],
    ])) + ");")
    for ln in inv["invoice_lines"]:
        rows.append("INSERT INTO wd_invoice_line VALUES (" + ", ".join(map(q, [
            inv["invoice_number"], ln["line"], ln["item"], ln["description"], ln["quantity"],
            ln["unit_price"], ln["tax_code"], ln["extended_amount"]])) + ");")

with open(os.path.join(sql_dir, "seed.sql"), "w") as f:
    f.write("\n".join(rows) + "\n")

print(f"invoices: {len(invoices)}  orders: {len(orders)}  seeded findings: {len(mismatches)}")
