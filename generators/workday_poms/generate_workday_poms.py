#!/usr/bin/env python3
"""
Workday (ERP) + POMS (order management) layer for the billing validation POC.

Adds four Polestar-style legal entities — SE21, NO21, PT21, DK21 — with Workday
customer invoices (header + invoice lines carrying Sales Item and Revenue
Category), the POMS orders they were built from, and the side systems that the
entity-specific exceptions depend on:

    api/workday/…          Workday customer invoices, lines, customers, masters
    api/poms/…             POMS vehicle orders
    api/trackers/…         NGA tracker, factoring tracker, DK21 SharePoint tracker
    api/ey/…               E&Y statutory final invoices (PT21)
    api/salesforce/…       Salesforce accounts (VAT numbers for PT21 extras)
    api/workday/exception-rules.json    the rule catalogue
    api/workday/expected-results.json   answer key: PASS / FAIL / HOLD per invoice

Every scenario in the exception document is present at least once as a passing
case and once as a failing case. The validator in validator/ reads all of this
and writes api/validation-runs/latest.json on an hourly schedule.

Run:  python3 generate_workday_poms.py
"""
from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import uuid

ROOT = os.path.dirname(os.path.abspath(__file__))
API = os.path.join(ROOT, "api")
TODAY = date(2026, 9, 18)
GENERATED = datetime(2026, 9, 18, 7, 0, 0).isoformat() + "Z"


def money(x) -> float:
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def dump(path: str, obj) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def envelope(system, obj_name, rows, **extra):
    return {"source_system": system, "object": obj_name, "count": len(rows),
            "generated_at": GENERATED, **extra, "data": rows}


# =========================================================================== #
# 1. COMPANIES (Workday legal entities)
# =========================================================================== #
COMPANIES = [
    {"company": "SE21", "company_name": "SE21 Polestar Automotive Sweden AB", "country": "SE",
     "currency": "SEK", "vat_rate": 25.0, "vat_registration": "SE559123456701",
     "statutory_invoicing": "Workday", "market": "Sweden",
     "exception_scope": "Related-party revenue category (related-party financing banks)"},
    {"company": "NO21", "company_name": "NO21 Polestar Automotive Norway AS", "country": "NO",
     "currency": "NOK", "vat_rate": 25.0, "vat_registration": "NO923456789MVA",
     "statutory_invoicing": "Workday", "market": "Norway",
     "exception_scope": "NGA customer tracker, fee removal, POMS price match, factoring"},
    {"company": "PT21", "company_name": "PT21 Polestar Automotive Portugal, Unipessoal Lda", "country": "PT",
     "currency": "EUR", "vat_rate": 23.0, "vat_registration": "PT516234567",
     "statutory_invoicing": "E&Y (certified invoicing), mirrored in Workday", "market": "Portugal",
     "exception_scope": "Leasing licence plates, loan bill-to rules, VAT on extras, E&Y matching, gapless numbering"},
    {"company": "DK21", "company_name": "DK21 Polestar Automotive Denmark ApS", "country": "DK",
     "currency": "DKK", "vat_rate": 25.0, "vat_registration": "DK41234567",
     "statutory_invoicing": "Workday", "market": "Denmark",
     "exception_scope": "Customer-specific SharePoint tracker adjustments"},
]
CO = {c["company"]: c for c in COMPANIES}


# =========================================================================== #
# 2. REVENUE CATEGORIES and SALES ITEMS (Workday masters)
# =========================================================================== #
REVENUE_CATEGORIES = [
    {"revenue_category": "3022", "name": "Car Sales - New", "is_fee": False, "ledger_account": "3022 Vehicle revenue"},
    {"revenue_category": "3027", "name": "Extras", "is_fee": False, "ledger_account": "3027 Accessories and services"},
    {"revenue_category": "3030", "name": "Car Sales - Related Party", "is_fee": False, "ledger_account": "3030 Related party vehicle revenue",
     "note": "Mandatory for vehicle (Brand) lines where bill-to or sold-to is a related party."},
    {"revenue_category": "3033", "name": "Discounts Retail", "is_fee": False, "ledger_account": "3033 Sales discounts"},
    {"revenue_category": "3041", "name": "Delivery Fee", "is_fee": True, "ledger_account": "3041 Delivery fees"},
    {"revenue_category": "3042", "name": "Registration Fee", "is_fee": True, "ledger_account": "3042 Registration fees"},
    {"revenue_category": "3043", "name": "Administration Fee", "is_fee": True, "ledger_account": "3043 Admin fees"},
    {"revenue_category": "3055", "name": "Customer Prepayment", "is_fee": False, "ledger_account": "2450 Customer prepayments"},
    {"revenue_category": "9000", "name": "Internal Zero-Value Document", "is_fee": False, "ledger_account": "n/a"},
]
RC = {r["revenue_category"]: r for r in REVENUE_CATEGORIES}

SALES_ITEMS = [
    {"sales_item": "P2-CAR", "name": "Polestar 2 Car", "default_revenue_category": "3022", "item_group": "Vehicle"},
    {"sales_item": "P3-CAR", "name": "Polestar 3 Car", "default_revenue_category": "3022", "item_group": "Vehicle"},
    {"sales_item": "P4-CAR", "name": "Polestar 4 Car", "default_revenue_category": "3022", "item_group": "Vehicle"},
    {"sales_item": "S00001", "name": "S00001 PS4 SUV Connected services plus", "default_revenue_category": "3027", "item_group": "Service"},
    {"sales_item": "S00002", "name": "S00002 Connected services 24 months", "default_revenue_category": "3027", "item_group": "Service"},
    {"sales_item": "DISC-FSP", "name": "Discount FSP retail", "default_revenue_category": "3033", "item_group": "Discount"},
    {"sales_item": "W20-WHEEL", "name": "Winter wheels 20 inch", "default_revenue_category": "3027", "item_group": "Accessory"},
    {"sales_item": "HOME-CHG", "name": "Home charger 11 kW", "default_revenue_category": "3027", "item_group": "Accessory"},
    {"sales_item": "FEE-DEL", "name": "Delivery fee", "default_revenue_category": "3041", "item_group": "Fee"},
    {"sales_item": "FEE-REG", "name": "Registration fee", "default_revenue_category": "3042", "item_group": "Fee"},
    {"sales_item": "FEE-ADM", "name": "Administration fee", "default_revenue_category": "3043", "item_group": "Fee"},
    {"sales_item": "PREPAY", "name": "Customer prepayment", "default_revenue_category": "3055", "item_group": "Prepayment"},
    {"sales_item": "DN-INT", "name": "Delivery note", "default_revenue_category": "9000", "item_group": "Internal"},
    {"sales_item": "SIE-INT", "name": "Sales invoice extra", "default_revenue_category": "9000", "item_group": "Internal"},
]
SI = {s["sales_item"]: s for s in SALES_ITEMS}


# =========================================================================== #
# 3. CUSTOMER MASTER (Workday)
# =========================================================================== #
ADDR_POOL = {
    "SE21": [("Sveavägen 44", "111 34", "Stockholm"), ("Kungsportsavenyen 21", "411 36", "Göteborg"), ("Storgatan 12", "211 42", "Malmö"),
             ("Drottninggatan 7", "753 10", "Uppsala"), ("Hamngatan 3", "582 26", "Linköping"), ("Östra Hamngatan 18", "411 09", "Göteborg"),
             ("Fleminggatan 20", "112 26", "Stockholm")],
    "NO21": [("Karl Johans gate 12", "0154", "Oslo"), ("Bryggen 5", "5003", "Bergen"), ("Munkegata 20", "7013", "Trondheim"),
             ("Kirkegata 14", "4006", "Stavanger"), ("Storgata 60", "9008", "Tromsø"), ("Markens gate 8", "4611", "Kristiansand"),
             ("Dronningens gate 22", "0154", "Oslo"), ("Strandgaten 18", "5013", "Bergen"), ("Prinsens gate 33", "7011", "Trondheim"),
             ("Bogstadveien 11", "0355", "Oslo"), ("Hegdehaugsveien 27", "0352", "Oslo"), ("Rådhusgata 5", "0151", "Oslo")],
    "PT21": [("Avenida da Liberdade 110", "1250-146", "Lisboa"), ("Rua de Santa Catarina 320", "4000-443", "Porto"), ("Avenida da República 25", "1050-186", "Lisboa"),
             ("Rua Júlio Dinis 728", "4050-012", "Porto"), ("Avenida Fontes Pereira de Melo 14", "1050-121", "Lisboa"), ("Rua Dr. Roberto Frias 300", "4200-465", "Porto"),
             ("Avenida Dom Afonso Henriques 1462", "4450-013", "Matosinhos"), ("Rua Castilho 39", "1250-068", "Lisboa"), ("Rua Augusta 78", "1100-053", "Lisboa"),
             ("Praça da Batalha 12", "4000-101", "Porto"), ("Avenida 5 de Outubro 200", "1050-065", "Lisboa"), ("Rua do Comércio 45", "3000-115", "Coimbra"),
             ("Rua da Boavista 88", "4050-107", "Porto"), ("Avenida de Roma 33", "1700-342", "Lisboa"), ("Rua Formosa 250", "4000-249", "Porto"),
             ("Alameda dos Oceanos 60", "1990-207", "Lisboa"), ("Rua Ferreira Borges 27", "3000-180", "Coimbra")],
    "DK21": [("Vesterbrogade 24", "1620", "København V"), ("Nørregade 8", "8000", "Aarhus C"), ("Algade 16", "9000", "Aalborg"),
             ("Østergade 5", "5000", "Odense C")],
}
ADDR_SEQ = {c: 0 for c in CO}


def cust(cid, name, company, ctype, vat=None, **flags):
    street, postal, city = ADDR_POOL[company][ADDR_SEQ[company] % len(ADDR_POOL[company])]
    ADDR_SEQ[company] += 1
    base = {"customer_id": cid, "customer_name": name, "company": company, "customer_type": ctype,
            "country": CO[company]["country"], "vat_number": vat,
            "address": {"street": street, "postal_code": postal, "city": city, "country": CO[company]["country"]},
            "address_text": f"{street}, {postal} {city}, {CO[company]['market']}",
            "contact": None,
            "related_party": False, "nga_customer": False, "leasing_plate_required": False,
            "loan_provider": False, "bank_sold_to_exception": False, "sharepoint_tracker": False}
    base.update(flags)
    return base


CUSTOMERS = [
    # ---- SE21 ------------------------------------------------------------
    cust("C-SE-0001", "Nordkredit Bank AB", "SE21", "BANK", "SE556069045401", related_party=True),
    cust("C-SE-0002", "Svea Fordonsbank AB", "SE21", "BANK", "SE556051222801", related_party=True),
    cust("C-SE-0003", "Anna Lindqvist", "SE21", "PRIVATE"),
    cust("C-SE-0004", "Erik Johansson", "SE21", "PRIVATE"),
    cust("C-SE-0005", "Nordic Fleet Solutions AB", "SE21", "CORPORATE", "SE559312345601"),
    cust("C-SE-0006", "Sara Nilsson", "SE21", "PRIVATE"),
    cust("C-SE-0007", "Johan Ek", "SE21", "PRIVATE"),
    # ---- NO21 (NGA list = 9 customers) ------------------------------------
    cust("C-NO-0101", "Fjord Leasing AS", "NO21", "LEASING", "NO912345671MVA", nga_customer=True),
    cust("C-NO-0102", "Nordlys Finans AS", "NO21", "LEASING", "NO912345672MVA", nga_customer=True),
    cust("C-NO-0103", "Viking Fleet AS", "NO21", "LEASING", "NO912345673MVA", nga_customer=True),
    cust("C-NO-0104", "Bergen Bilfinans AS", "NO21", "LEASING", "NO912345674MVA", nga_customer=True),
    cust("C-NO-0105", "Oslo Leasing Partner AS", "NO21", "LEASING", "NO912345675MVA", nga_customer=True),
    cust("C-NO-0106", "Trondheim Auto Finans AS", "NO21", "LEASING", "NO912345676MVA", nga_customer=True),
    cust("C-NO-0107", "Stavanger Fleet Solutions AS", "NO21", "LEASING", "NO912345677MVA", nga_customer=True),
    cust("C-NO-0108", "Tromsø Finans AS", "NO21", "LEASING", "NO912345678MVA", nga_customer=True),
    cust("C-NO-0109", "Kristiansand Leasing AS", "NO21", "LEASING", "NO912345679MVA", nga_customer=True),
    cust("C-NO-0110", "Ingrid Haugen", "NO21", "PRIVATE"),
    cust("C-NO-0111", "Lars Berg", "NO21", "PRIVATE"),
    cust("C-NO-0112", "Nordic Consulting AS", "NO21", "CORPORATE", "NO987654321MVA"),
    # ---- PT21 --------------------------------------------------------------
    cust("C-PT-0201", "Atlântico Renting SA", "PT21", "LEASING", "PT502062468", leasing_plate_required=True),
    cust("C-PT-0202", "Lusoleasing SA", "PT21", "LEASING", "PT503123456", leasing_plate_required=True),
    cust("C-PT-0203", "Iberfrota Leasing Lda", "PT21", "LEASING", "PT504234567", leasing_plate_required=True),
    cust("C-PT-0204", "Rentalis Portugal SA", "PT21", "LEASING", "PT505345678", leasing_plate_required=True),
    cust("C-PT-0205", "Mobilease Portugal Lda", "PT21", "LEASING", "PT506456789", leasing_plate_required=True),
    cust("C-PT-0206", "Banco Meridional SA", "PT21", "BANK", "PT501214534", loan_provider=True, bank_sold_to_exception=True),
    cust("C-PT-0207", "Lusitânia Crédito SA", "PT21", "BANK", "PT507567890", loan_provider=True),
    cust("C-PT-0208", "Crédito Ibérico SA", "PT21", "BANK", "PT508678901", loan_provider=True),
    cust("C-PT-0209", "João Ferreira", "PT21", "PRIVATE", "PT231456789"),
    cust("C-PT-0210", "Maria Santos", "PT21", "PRIVATE", "PT232567890"),
    cust("C-PT-0211", "Pedro Almeida", "PT21", "PRIVATE", "PT233678901"),
    cust("C-PT-0212", "Ana Costa", "PT21", "PRIVATE", "PT234789012"),
    cust("C-PT-0213", "Rui Martins", "PT21", "PRIVATE", "PT235890123"),
    cust("C-PT-0214", "Carla Sousa", "PT21", "PRIVATE", "PT236901234"),
    cust("C-PT-0215", "Tiago Lopes", "PT21", "PRIVATE", "PT237012345"),
    cust("C-PT-0216", "Tejo Logística Lda", "PT21", "CORPORATE", "PT501234567"),
    cust("C-PT-0217", "Douro Consultores Lda", "PT21", "CORPORATE", None),   # VAT missing in Workday
    # ---- DK21 --------------------------------------------------------------
    cust("C-DK-0301", "Øresund Fleet A/S", "DK21", "LEASING", "DK36987654", sharepoint_tracker=True),
    cust("C-DK-0302", "Mette Hansen", "DK21", "PRIVATE"),
    cust("C-DK-0303", "Søren Nielsen", "DK21", "PRIVATE"),
    cust("C-DK-0304", "København Byggeri A/S", "DK21", "CORPORATE", "DK25123456"),
]
CUST = {c["customer_id"]: c for c in CUSTOMERS}
CUST_BY_NAME = {c["customer_name"]: c for c in CUSTOMERS}

# Salesforce accounts — the fallback source for VAT numbers (PT21 extras / prepayments)
SALESFORCE_ACCOUNTS = [
    {"sf_account_id": "001PT00000A1B2C", "account_name": "Douro Consultores Lda", "workday_customer_id": "C-PT-0217",
     "vat_number": "PT509876543", "billing_country": "PT", "owner": "Market Portugal"},
    {"sf_account_id": "001PT00000A1B2D", "account_name": "Tejo Logística Lda", "workday_customer_id": "C-PT-0216",
     "vat_number": "PT501234567", "billing_country": "PT", "owner": "Market Portugal"},
    {"sf_account_id": "001PT00000A1B2E", "account_name": "Atlântico Renting SA", "workday_customer_id": "C-PT-0201",
     "vat_number": "PT502062468", "billing_country": "PT", "owner": "Market Portugal"},
    {"sf_account_id": "001SE00000B7C8D", "account_name": "Nordic Fleet Solutions AB", "workday_customer_id": "C-SE-0005",
     "vat_number": "SE559312345601", "billing_country": "SE", "owner": "Market Sweden"},
]


# =========================================================================== #
# 4. PRICES per market (excl. VAT)
# =========================================================================== #
PRICES = {
    "SE21": {"P2-CAR": 479200, "P4-CAR": 599000, "PAINT": 9600, "S00001": 1680, "S00002": 2990,
             "W20-WHEEL": 18900, "HOME-CHG": 8990, "FEE-DEL": 4990, "FEE-REG": 1490, "FEE-ADM": 995},
    "NO21": {"P2-CAR": 449900, "P4-CAR": 649900, "PAINT": 9900, "S00001": 1590, "S00002": 2790,
             "W20-WHEEL": 17900, "HOME-CHG": 8490, "FEE-DEL": 9900, "FEE-REG": 3290, "FEE-ADM": 1990},
    "PT21": {"P2-CAR": 45900, "P4-CAR": 62900, "PAINT": 990, "S00001": 149, "S00002": 249,
             "W20-WHEEL": 1790, "HOME-CHG": 799, "FEE-DEL": 490, "FEE-REG": 290, "FEE-ADM": 190},
    "DK21": {"P2-CAR": 349995, "P4-CAR": 459995, "PAINT": 7495, "S00001": 1195, "S00002": 1995,
             "W20-WHEEL": 13995, "HOME-CHG": 7995, "FEE-DEL": 3995, "FEE-REG": 1180, "FEE-ADM": 995},
}
MODEL = {"P2-CAR": ("Polestar 2", "P2"), "P3-CAR": ("Polestar 3", "P3"), "P4-CAR": ("Polestar 4", "P4")}
WMI = {"SE21": "YSM", "NO21": "YSM", "PT21": "LPS", "DK21": "YSM"}


def vin(company: str, n: int) -> str:
    """17 characters, unique per order: WMI + fixed VDS + check-ish digit + plant + 7-digit serial."""
    return f"{WMI[company]}KKE2A{'X' if n % 2 else 'L'}S{(n * 7) % 10000000:07d}"


# =========================================================================== #
# 5. POMS ORDERS and WORKDAY INVOICES — built together from one scenario list
# =========================================================================== #
poms_orders: list[dict] = []
invoices: list[dict] = []
expected: list[dict] = []
nga_tracker: list[dict] = []
factoring_tracker: list[dict] = []
dk_tracker: list[dict] = []
ey_final: list[dict] = []

ORDER_SEQ = {"SE21": 11200000, "NO21": 11100000, "PT21": 11300000, "DK21": 11400000}
INV_SEQ = {"SE21": 100200, "NO21": 200300, "PT21": 300400, "DK21": 400500}


def brand_desc(model_item: str, my: int = 2027, suffix: str = "") -> str:
    return f"Brand - Model: {MODEL[model_item][0]} ({my}){suffix}"


FIN_OPTION = {"CASH": "Cash", "PERSONAL_LOAN": "Loan", "LEASING": "Leasing", "COMPANY": "Cash"}
MARKET_CODE = {"SE21": "SE", "NO21": "NO", "PT21": "PT", "DK21": "DK"}


def poms_order(company, buyer_id, model_item, colour="Snow", financing="CASH", partner_id=None,
               plate=None, options=(), fees=(), discount=0.0, payment_status="PAID",
               handover_offset=-6, order_offset=-40, price_override=None,
               poms_type=None, order_status=None, financing_option=None, lock_state="locked",
               unlock_reason=None, upfront_payment=0.0, owner_id=None, owner_name=None, final_payment_amount=None):
    ORDER_SEQ[company] += 1
    n = ORDER_SEQ[company]
    p = PRICES[company]
    base = price_override if price_override is not None else p[model_item]
    opt_rows = [{"option_code": o, "description": SI[o]["name"], "amount": money(p[o])} for o in options]
    fee_rows = [{"fee_code": f, "description": SI[f]["name"], "amount": money(p[f])} for f in fees]
    paint = money(p["PAINT"]) if colour not in ("Snow",) else 0.0    # Snow is the no-cost colour
    taxable = money(base + paint + sum(r["amount"] for r in opt_rows) + sum(r["amount"] for r in fee_rows) - discount)
    rate = CO[company]["vat_rate"]
    vat = money(taxable * rate / 100)
    buyer = CUST[buyer_id]
    partner = CUST[partner_id] if partner_id else None
    owner = CUST[owner_id] if owner_id else buyer
    if poms_type is None:
        poms_type = "Fleet" if (buyer["customer_type"] == "CORPORATE" and financing == "COMPANY") else "Order"
    if order_status is None:
        order_status = "delivered" if handover_offset <= 0 else "delivery_planning"
    fin_opt = financing_option or FIN_OPTION.get(financing, financing.title())
    vat_f = 1 + CO[company]["vat_rate"] / 100
    order = {
        "order_number": str(n), "order_no": str(n), "id": 700000 + (n % 100000),
        "configuration_id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"poms-config-{n}")),
        "market": MARKET_CODE[company], "market_name": CO[company]["market"], "company": company,
        "type": poms_type, "order_status": order_status, "financing_option": fin_opt,
        "lock_state": lock_state,
        "locked_at": (TODAY + timedelta(days=order_offset + 3)).isoformat() + "T11:06:00Z" if lock_state == "locked" or unlock_reason else None,
        "unlock_reason": None if lock_state == "locked" else (unlock_reason or "manual"),
        "manually_unlocked_reason": None if lock_state == "locked" else unlock_reason,
        "manually_unlocked_note": None if lock_state == "locked" else "financial split needs to be adjusted",
        "owner": owner_name or owner["customer_name"], "owner_customer_id": owner["customer_id"],
        "roles": {"orderer": buyer["customer_name"], "buyer": buyer["customer_name"], "owner": owner_name or owner["customer_name"]},
        "is_sme_order": False, "cycle_state": "new", "order_to_delivery_flow": "level_1", "logistic_flow": None,
        "communicated_delivery_status": "Delivered" if order_status == "delivered" else "Before delivery",
        "extras_status": "extras_added" if options else "no_extras_added", "protection_status": "no_protection_added",
        "vin": vin(company, n), "model": MODEL[model_item][0], "model_code": MODEL[model_item][1],
        "model_year": 2027, "exterior_colour": colour,
        "buyer_customer_id": buyer_id, "buyer_name": buyer["customer_name"], "buyer_address": buyer["address_text"],
        "order_type": "new_car", "sales_type": "B2C" if buyer["customer_type"] == "PRIVATE" else "B2B",
        "sales_channel": "Online" if buyer["customer_type"] == "PRIVATE" else "Fleet & Business",
        "financing_type": financing,
        "financing_partner_id": partner_id, "financing_partner": partner["customer_name"] if partner else None,
        "license_plate": plate,
        "order_date": (TODAY + timedelta(days=order_offset)).isoformat(),
        "handover_date": (TODAY + timedelta(days=handover_offset)).isoformat(),
        "currency": CO[company]["currency"],
        "base_price": money(base), "paint_amount": paint, "options": opt_rows, "fees": fee_rows,
        "discount_amount": money(discount),
        "gross_taxable_amount": taxable, "vat_rate": rate, "vat_amount": vat,
        "total_price": money(taxable + vat),
        "grand_total_price": money(taxable + vat), "grand_total_vat": vat, "grand_total_tax": 0.0, "grand_total_car_fiscal": None,
        "car_total_price": money((base + paint - discount) * vat_f), "car_total_vat": money((base + paint - discount) * (vat_f - 1)), "car_total_tax": 0.0,
        "extras_total_price": money(sum(r["amount"] for r in opt_rows) * vat_f), "extras_total_vat": money(sum(r["amount"] for r in opt_rows) * (vat_f - 1)),
        "delivery_total_price": money(sum(r["amount"] for r in fee_rows) * vat_f), "delivery_total_vat": money(sum(r["amount"] for r in fee_rows) * (vat_f - 1)),
        "assurances_total_price": 0.0, "assurances_total_vat": 0.0,
        "upfront_payment": money(upfront_payment),
        # customer's own payment at handover: the balance for cash deals, nothing when a bank / lessor finances the car
        "final_payment_amount": money(final_payment_amount if final_payment_amount is not None else (taxable + vat - upfront_payment if fin_opt == "Cash" else 0.0)),
        "down_payment_to_pay": money(upfront_payment), "paid_down_payment": money(upfront_payment), "deposit_to_pay": 0.0,
        "financing": {
            "status": None if fin_opt == "Cash" else ("approved" if handover_offset <= 0 else "approval_requested"),
            "financed_amount": None if fin_opt == "Cash" else money(taxable + vat - upfront_payment),
            "currency": CO[company]["currency"],
            "loan_provider_name": partner["customer_name"] if partner else None,
            "loan_provider_salesforce_id": ("001" + partner["customer_id"].replace("-", "") + "AB") if partner else None,
            "external_reference_number": None,
        },
        "payment_status": (payment_status if payment_status != "PAID" or financing not in ("PERSONAL_LOAN", "LEASING")
                           else "FINANCED"),
        "poms_last_updated": (TODAY - timedelta(days=1)).isoformat() + "T18:40:00Z",
    }
    hub = {"SE21": "Göteborg Delivery Hub", "NO21": "Oslo Delivery Hub", "PT21": "Lisboa Delivery Hub", "DK21": "København Delivery Hub"}[company]
    order["deliveries"] = [{"delivery_id": f"DLV-{n}", "planned_date": order["handover_date"], "location": hub,
                            "status": "completed" if handover_offset <= 0 else "planned"}]
    od = TODAY + timedelta(days=order_offset)
    order["events"] = [{"timestamp": od.isoformat() + " 10:12 UTC", "event": "order_created"},
                       {"timestamp": od.isoformat() + " 10:14 UTC", "event": "order_confirmed"},
                       {"timestamp": (od + timedelta(days=2)).isoformat() + " 08:30 UTC", "event": "payment_" + ("financing_approved" if financing != "CASH" else "received")},
                       {"timestamp": (TODAY + timedelta(days=handover_offset - 7)).isoformat() + " 09:00 UTC", "event": "delivery_planning_started"}]
    if order["lock_state"] == "locked" or unlock_reason:
        order["events"].append({"timestamp": (od + timedelta(days=3)).isoformat() + " 11:06 UTC", "event": "order_locked"})
    if unlock_reason:
        order["events"].append({"timestamp": (od + timedelta(days=9)).isoformat() + " 15:40 UTC", "event": "order_manually_unlocked"})
    if handover_offset <= 0:
        order["events"].append({"timestamp": order["handover_date"] + " 14:00 UTC", "event": "handover_completed"})
    order["events"].sort(key=lambda e: e["timestamp"])
    order["timestamps"] = {"created_at": od.isoformat() + "T10:12:00Z", "confirmed_at": od.isoformat() + "T10:14:00Z",
                           "locked_at": order["locked_at"],
                           "handover_completed_at": (order["handover_date"] + "T14:00:00Z") if handover_offset <= 0 else None,
                           "updated_at": order["poms_last_updated"]}
    poms_orders.append(order)
    return order


def line(sales_item, rc, desc, qty, unit_price, extended=None):
    return {"sales_item": sales_item, "revenue_category": rc, "description": desc,
            "quantity": qty, "unit_price": money(unit_price),
            "extended": money(extended if extended is not None else qty * unit_price)}


LOAN_FAMILY = {"Loan", "Personal Loan", "Loanballoon", "OperationalLoan"}
LEASE_FAMILY = {"Lease", "Leasing", "Personal Leasing", "OperationalLease"}


def default_invoice_type(order, bill_to_customer, document_kind):
    """Workday invoice type the billing desk would pick for this order state (see mappings.yaml)."""
    kind = document_kind.lower()
    if "prepay" in kind or "payment receipt" in kind:
        return "Payment Receipt"
    if "credit" in kind:
        return "Credit Note"
    if "delivery note" in kind:
        return "Delivery Note"
    if not order:
        return "Sales Invoice"
    before = order["order_status"] != "delivered"
    if order["type"] in ("Fleet", "Preconfigured Fleet"):
        return "Fleet Invoice Before Handover" if before else "Sales Invoice Fleet"
    fin = order["financing_option"]
    if fin == "Cash":
        return "Early Invoice"
    if bill_to_customer["customer_type"] == "BANK":
        return "Bank Invoice Before Handover" if before else "Sales Invoice Bank"
    if bill_to_customer["customer_type"] == "LEASING" and fin in LEASE_FAMILY:
        return "FSP Invoice Before Handover" if before else "Sales Invoice FSP"
    return "Sales Invoice"


def invoice(company, order, bill_to, sold_to, lines, *, status="DRAFT", invoice_offset=-2,
            po_number=None, statutory_type=None, statutory_number=None, vat_number="AUTO",
            tax_override=None, memo="", payment_application=None, vin_override=None,
            attachments=(), document_kind="Customer Invoice", scenario=None, expected_status="PASS",
            expected_findings=(), remediation=None, invoice_type=None, currency=None):
    INV_SEQ[company] += 1
    number = f"CI-{company}-{INV_SEQ[company]}"
    co = CO[company]
    inv_date = TODAY + timedelta(days=invoice_offset)
    bt, st = CUST[bill_to], CUST[sold_to]
    inv_type = invoice_type or default_invoice_type(order, bt, document_kind)
    ccy = currency or co["currency"]
    rows = []
    for i, l in enumerate(lines, start=1):
        rows.append({
            "line": i, "company": co["company_name"],
            "sales_item": l["sales_item"], "sales_item_name": SI[l["sales_item"]]["name"],
            "revenue_category": l["revenue_category"], "revenue_category_name": RC[l["revenue_category"]]["name"],
            "line_item_description": l["description"],
            "quantity": l["quantity"], "unit_of_measure": "Each", "quantity_2": 0, "unit_of_measure_2": None,
            "unit_price": l["unit_price"], "extended_amount": l["extended"],
            "released_on_invoice_lines": None,
            "transaction_date": None, "from_date": None, "to_date": None, "contract_line": None, "deferred_revenue": None,
            "revenue_recognition_schedule_template": None,
            "ship_from_address": None, "ship_to_customer": st["customer_name"], "ship_to_address": st["address_text"],
            "tax_applicability": "Taxable" if l["revenue_category"] not in ("9000",) else "Non-taxable",
        })
    subtotal = money(sum(r["extended_amount"] for r in rows))
    taxable = money(sum(r["extended_amount"] for r in rows if r["tax_applicability"] == "Taxable"))
    tax_amount = money(tax_override if tax_override is not None else taxable * co["vat_rate"] / 100)
    total = money(subtotal + tax_amount)
    inv = {
        "invoice_number": number, "document_kind": document_kind, "company": company,
        "company_name": co["company_name"], "status": status,
        "invoice_date": inv_date.isoformat(), "due_date": (inv_date + timedelta(days=30)).isoformat(),
        "payment_terms": "Net 30", "invoice_type": inv_type,
        "finalized_date": inv_date.isoformat() if status == "APPROVED" else None,
        "delivery_type": "Email", "delivery_type_origin": "Customer", "reference_type": "Standard", "discount_date": None,
        "latest_print_date": (inv_date.isoformat() + "T17:51:00Z") if status == "APPROVED" else None,
        "customer": bt["customer_name"], "customer_id": bill_to,
        "bill_to_customer_id": bill_to, "bill_to_customer": bt["customer_name"], "bill_to_address": bt["address_text"],
        "bill_to_contact": None,
        "sold_to_customer_id": sold_to, "sold_to_customer": st["customer_name"],
        "ship_to_customer": st["customer_name"], "ship_to_address": st["address_text"],
        "payment_status": "UNPAID", "payment_type": None, "printed": "Yes" if status == "APPROVED" else "No",
        "customer_vat_number": (bt["vat_number"] if vat_number == "AUTO" else vat_number),
        "currency": ccy, "po_number": po_number,
        "vin": vin_override or order["vin"] if order else vin_override,
        "poms_order_number": order["order_number"] if order else None,
        "sales_order": order["order_number"] if order else None,
        "worktags": {"model": (order["model"] + " " + str(order["model_year"])) if order else None,
                     "sales_order": order["order_number"] if order else None,
                     "vehicle_identifier_number": vin_override or (order["vin"] if order else None)},
        "model": order["model"] if order else None,
        "statutory_invoice_type": statutory_type, "statutory_invoice_number": statutory_number,
        "memo": memo,
        "payment_application": payment_application,
        "attachments": list(attachments),
        "lines": rows,
        "tax": {"tax_code": f"{co['country']} {int(co['vat_rate'])}% VAT ({int(co['vat_rate'])}%)", "tax_rate": co["vat_rate"],
                "taxable_amount": taxable, "tax_amount": tax_amount},
        "totals": {"subtotal": subtotal, "tax_amount": tax_amount, "total_amount": total, "amount_due": total, "currency": ccy},
        "process_history": [
            {"step": "Customer Invoice Event", "status": "Step Completed", "person": "BPO O2C Billing Desk", "moment": (inv_date - timedelta(days=1)).isoformat() + "T09:15:00Z", "comment": "Created from POMS order " + (order["order_number"] if order else "")},
            {"step": "Review Customer Invoice", "status": "Awaiting Action" if status == "DRAFT" else "Step Completed", "person": "Billing Specialist", "moment": (inv_date - timedelta(days=1)).isoformat() + "T16:02:00Z", "comment": ""},
        ] + ([{"step": "Approval by Finance Manager", "status": "Approved", "person": "Finance Manager", "moment": inv_date.isoformat() + "T10:30:00Z", "comment": ""}] if status == "APPROVED" else []),
        "created_by": "BPO O2C Billing Desk", "created_on": (inv_date - timedelta(days=1)).isoformat() + "T09:15:00Z",
        "last_updated": (inv_date - timedelta(days=1)).isoformat() + "T16:02:00Z",
    }
    invoices.append(inv)
    expected.append({"invoice_number": number, "company": company, "scenario": scenario,
                     "expected_status": expected_status, "expected_findings": list(expected_findings),
                     "remediation": remediation})
    return inv


# --------------------------------------------------------------------------- #
# SE21 — related party revenue category
# --------------------------------------------------------------------------- #
P = PRICES["SE21"]
o = poms_order("SE21", "C-SE-0003", "P2-CAR", options=("S00001",))
invoice("SE21", o, "C-SE-0003", "C-SE-0003", [
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
    line("P2-CAR", "3022", "Snow", 1, 0),
    line("S00001", "3027", "24 månaders förlängning av uppkopplade tjänster plus", 1, P["S00001"]),
], scenario="SE21 normal: private cash buyer, bill-to = sold-to, no related party",
   expected_status="PASS")

o = poms_order("SE21", "C-SE-0004", "P2-CAR", colour="Midnight", financing="PERSONAL_LOAN",
               partner_id="C-SE-0001", discount=12000)
invoice("SE21", o, "C-SE-0001", "C-SE-0004", [
    line("P2-CAR", "3030", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
    line("P2-CAR", "3022", "Midnight", 1, P["PAINT"]),
    line("DISC-FSP", "3033", "FSP-SE-PS2-MY27-CY26", 1, -12000),
], scenario="SE21 exception PASS: bill-to Nordkredit Bank AB (related party), Brand line already on 3030",
   expected_status="PASS")

o = poms_order("SE21", "C-SE-0006", "P2-CAR", financing="PERSONAL_LOAN", partner_id="C-SE-0002",
               options=("S00001",), discount=15000)
invoice("SE21", o, "C-SE-0002", "C-SE-0006", [
    line("S00001", "3027", "24 månaders förlängning av uppkopplade tjänster plus", 1, P["S00001"]),
    line("DISC-FSP", "3033", "FSP-SE-PS2-MY27-CY26", 1, -15000),
    line("P2-CAR", "3022", "Snow", 1, 0),
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
], scenario="SE21 exception FAIL: bill-to Svea Fordonsbank AB (related party), Brand line left on 3022 (the screenshot case)",
   expected_status="FAIL", expected_findings=["SE21-001"],
   remediation="Change revenue category on line 4 from 3022 to 3030 (related party).")

o = poms_order("SE21", "C-SE-0001", "P4-CAR", colour="Storm", financing="LEASING")
invoice("SE21", o, "C-SE-0001", "C-SE-0001", [
    line("P4-CAR", "3027", brand_desc("P4-CAR"), 1, P["P4-CAR"]),
    line("P4-CAR", "3022", "Storm", 1, P["PAINT"]),
], scenario="SE21 exception FAIL: Nordkredit Bank AB (related party) is sold-to, Brand line on 3027",
   expected_status="FAIL", expected_findings=["SE21-001"],
   remediation="Change revenue category on line 1 from 3027 to 3030 (related party).")

o = poms_order("SE21", "C-SE-0005", "P4-CAR", colour="Snow", financing="COMPANY", options=("W20-WHEEL",))
invoice("SE21", o, "C-SE-0005", "C-SE-0005", [
    line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"]),
    line("W20-WHEEL", "3027", "Vinterhjul 20 tum", 1, P["W20-WHEEL"]),
], po_number="NFS-2026-0912",
   scenario="SE21 normal: corporate fleet buyer with PO", expected_status="PASS")

o = poms_order("SE21", "C-SE-0007", "P2-CAR", colour="Snow")
invoice("SE21", o, "C-SE-0007", "C-SE-0007", [
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"], extended=497200),   # keyed wrong
    line("P2-CAR", "3022", "Snow", 1, 0),
], scenario="SE21 generic FAIL: extended amount does not equal quantity × unit price",
   expected_status="FAIL", expected_findings=["GEN-001", "GEN-002"],
   remediation="Correct extended amount on line 1 to 479,200.00; total then agrees with POMS.")

# --------------------------------------------------------------------------- #
# NO21 — NGA tracker, fee removal, POMS match, factoring
# --------------------------------------------------------------------------- #
P = PRICES["NO21"]
NO_FEES = ("FEE-DEL", "FEE-REG")


def nga_row(inv, order, *, response, remove_fees=None, revised_gross=None, revised_base=None,
            missing_fields=(), submitted_offset=-3):
    row = {
        "tracker_id": f"NGA-{len(nga_tracker) + 1:04d}",
        "invoice_number": inv["invoice_number"], "customer_id": inv["bill_to_customer_id"],
        "customer_name": inv["bill_to_customer"], "model_number": order["model_code"],
        "total_invoice_price": inv["totals"]["total_amount"],
        "gross_taxable_amount": inv["tax"]["taxable_amount"], "base_price": order["base_price"],
        "poms_order_number": order["order_number"],
        "submitted_on": (TODAY + timedelta(days=submitted_offset)).isoformat(),
        "submitted_by": "BPO O2C Billing Desk",
        "response_status": response,
        "response_on": (TODAY + timedelta(days=submitted_offset + 1)).isoformat() if response == "RESPONDED" else None,
        "remove_fees": remove_fees, "revised_gross_amount": revised_gross, "revised_base_price": revised_base,
        "comments": ("Fees not chargeable under NGA framework agreement; remove and recalculate VAT." if remove_fees
                     else "Fees confirmed chargeable." if remove_fees is False else "Awaiting NGA team review."),
    }
    for f in missing_fields:
        row[f] = None
    nga_tracker.append(row)
    return row


def fee_lines(company):
    p = PRICES[company]
    return [line("FEE-DEL", "3041", "Leveringsgebyr", 1, p["FEE-DEL"]),
            line("FEE-REG", "3042", "Registreringsavgift", 1, p["FEE-REG"])]


# N1 normal
o_n1 = o = poms_order("NO21", "C-NO-0110", "P2-CAR", fees=NO_FEES)
invoice("NO21", o, "C-NO-0110", "C-NO-0110",
        [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Snow", 1, 0)] + fee_lines("NO21"),
        scenario="NO21 normal: private buyer, not NGA, fees chargeable, matches POMS", expected_status="PASS")

# N2 NGA pass — fees removed, gross/base revised, tax recalculated
o_n2 = o = poms_order("NO21", "C-NO-0101", "P2-CAR", financing="LEASING", fees=NO_FEES)
inv = invoice("NO21", o, "C-NO-0101", "C-NO-0101",
              [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Snow", 1, 0)],
              scenario="NO21 NGA PASS: tracker says remove fees; fees removed, gross and base revised, VAT recalculated",
              expected_status="PASS")
nga_row(inv, o, response="RESPONDED", remove_fees=True, revised_gross=P["P2-CAR"], revised_base=P["P2-CAR"])

# N3 NGA fail — fee lines still present after instruction to remove
o = poms_order("NO21", "C-NO-0102", "P4-CAR", colour="Storm", financing="LEASING", fees=NO_FEES)
inv = invoice("NO21", o, "C-NO-0102", "C-NO-0102",
              [line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"]), line("P4-CAR", "3022", "Storm", 1, P["PAINT"])] + fee_lines("NO21"),
              scenario="NO21 NGA FAIL: tracker says remove fees but fee lines are still on the draft",
              expected_status="FAIL", expected_findings=["NO21-003", "NO21-004"],
              remediation="Remove lines 3 and 4 (fees), set gross to revised 659,800.00, recalculate VAT, then submit.")
nga_row(inv, o, response="RESPONDED", remove_fees=True, revised_gross=P["P4-CAR"] + P["PAINT"], revised_base=P["P4-CAR"])

# N4 NGA fail — no tracker row at all
o = poms_order("NO21", "C-NO-0103", "P2-CAR", financing="LEASING", fees=NO_FEES)
invoice("NO21", o, "C-NO-0103", "C-NO-0103",
        [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Snow", 1, 0)] + fee_lines("NO21"),
        scenario="NO21 NGA FAIL: NGA customer but invoice never captured in the NGA tracker",
        expected_status="FAIL", expected_findings=["NO21-001"],
        remediation="Capture invoice number, customer ID, model, total, gross and base price in the NGA tracker.")

# N5 NGA hold — tracker response pending
o = poms_order("NO21", "C-NO-0104", "P2-CAR", colour="Midnight", financing="LEASING", fees=NO_FEES)
inv = invoice("NO21", o, "C-NO-0104", "C-NO-0104",
              [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Midnight", 1, P["PAINT"])] + fee_lines("NO21"),
              scenario="NO21 NGA HOLD: tracker submitted, NGA team response still pending",
              expected_status="HOLD", expected_findings=["NO21-002"],
              remediation="Wait for NGA team response (fees decision, revised gross, revised base) before processing.")
nga_row(inv, o, response="PENDING", submitted_offset=-1)

# N6 NGA fail — fees removed and gross revised but VAT not recalculated
o = poms_order("NO21", "C-NO-0105", "P2-CAR", financing="LEASING", fees=NO_FEES)
old_gross = P["P2-CAR"] + P["FEE-DEL"] + P["FEE-REG"]
inv = invoice("NO21", o, "C-NO-0105", "C-NO-0105",
              [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Snow", 1, 0)],
              tax_override=old_gross * 0.25,
              scenario="NO21 NGA FAIL: fees removed and gross revised but VAT still calculated on the old gross",
              expected_status="FAIL", expected_findings=["NO21-005"],
              remediation="Recalculate VAT: 25% of 449,900.00 = 112,475.00 (draft shows 115,772.50).")
nga_row(inv, o, response="RESPONDED", remove_fees=True, revised_gross=P["P2-CAR"], revised_base=P["P2-CAR"])

# N7 POMS mismatch — unit price differs from POMS
o = poms_order("NO21", "C-NO-0111", "P2-CAR", fees=NO_FEES)
invoice("NO21", o, "C-NO-0111", "C-NO-0111",
        [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"] + 10000), line("P2-CAR", "3022", "Snow", 1, 0)] + fee_lines("NO21"),
        scenario="NO21 FAIL: Workday vehicle price 459,900 vs POMS 449,900 (manual amendment needed)",
        expected_status="FAIL", expected_findings=["GEN-002"],
        remediation="Amend line 1 unit price to the POMS base price 449,900.00.")

# N8 factoring — On Account payment not captured in factoring tracker
o = poms_order("NO21", "C-NO-0112", "P4-CAR", colour="Snow", financing="COMPANY", fees=NO_FEES, payment_status="ON_ACCOUNT")
inv = invoice("NO21", o, "C-NO-0112", "C-NO-0112",
              [line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"])] + fee_lines("NO21"),
              po_number="NC-PO-4471",
              payment_application={"payment_id": "PAY-NO-88213", "amount": 200000.0, "applied_as": "ON_ACCOUNT",
                                   "payment_date": (TODAY - timedelta(days=4)).isoformat(),
                                   "factoring_partner": "Nordic Factoring AS"},
              scenario="NO21 FAIL: payment recorded On Account but missing from the factoring tracker (processing delay)",
              expected_status="FAIL", expected_findings=["NO21-007"],
              remediation="Log PAY-NO-88213 (200,000.00 NOK) in the factoring tracker and re-apply against the invoice.")

# N9 NGA pass — fees confirmed chargeable, kept
o = poms_order("NO21", "C-NO-0106", "P2-CAR", financing="LEASING", fees=NO_FEES)
inv = invoice("NO21", o, "C-NO-0106", "C-NO-0106",
              [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Snow", 1, 0)] + fee_lines("NO21"),
              scenario="NO21 NGA PASS: tracker confirms fees are chargeable; fee lines retained, amounts unchanged",
              expected_status="PASS")
nga_row(inv, o, response="RESPONDED", remove_fees=False, revised_gross=old_gross, revised_base=P["P2-CAR"])

# N10 NGA fail — tracker row incomplete (model and base price missing)
o = poms_order("NO21", "C-NO-0107", "P4-CAR", financing="LEASING", fees=NO_FEES)
inv = invoice("NO21", o, "C-NO-0107", "C-NO-0107",
              [line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"])] + fee_lines("NO21"),
              scenario="NO21 NGA FAIL: tracker row exists but Model Number and Base Price were not captured",
              expected_status="FAIL", expected_findings=["NO21-001"],
              remediation="Complete the tracker row: model_number = P4, base_price = 649,900.00.")
nga_row(inv, o, response="PENDING", missing_fields=("model_number", "base_price"), submitted_offset=-1)

# Factoring tracker: the payments that WERE captured (so N8's omission is visible)
factoring_tracker.extend([
    {"factoring_id": "FT-2026-0912", "payment_id": "PAY-NO-88190", "poms_order_number": o_n1["order_number"],
     "invoice_number": None, "customer_name": "Ingrid Haugen", "amount": 578862.50, "currency": "NOK",
     "payment_date": (TODAY - timedelta(days=5)).isoformat(), "factoring_partner": "Nordic Factoring AS",
     "captured_on": (TODAY - timedelta(days=5)).isoformat(), "status": "SETTLED"},
    {"factoring_id": "FT-2026-0913", "payment_id": "PAY-NO-88201", "poms_order_number": o_n2["order_number"],
     "invoice_number": None, "customer_name": "Fjord Leasing AS", "amount": 562375.00, "currency": "NOK",
     "payment_date": (TODAY - timedelta(days=3)).isoformat(), "factoring_partner": "Nordic Factoring AS",
     "captured_on": (TODAY - timedelta(days=3)).isoformat(), "status": "SETTLED"},
])

# --------------------------------------------------------------------------- #
# PT21 — leasing plates, loan bill-to rules, VAT on extras, E&Y matching, gapless numbering
# --------------------------------------------------------------------------- #
P = PRICES["PT21"]
EY_INV = "PRT Invoice - EY – Portugal"
EY_CN = "PRT Credit note - EY – Portugal"
ey_seq = {EY_INV: 240116, EY_CN: 2400030}


def ey(inv, *, amount_excl=None, total=None, inv_date=None, customer=None, po=None, sequence_gap=0):
    """Record the E&Y final invoice for a Workday invoice; overrides create mismatches."""
    stype = inv["statutory_invoice_type"]
    ey_seq[stype] += 1 + sequence_gap
    number = f"PT{ey_seq[stype]}"
    row = {
        "ey_invoice_number": number, "statutory_invoice_type": stype, "sequence": ey_seq[stype],
        "invoice_date": inv_date or inv["invoice_date"], "customer_name": customer or inv["bill_to_customer"],
        "po_number": po if po is not None else inv["po_number"], "vin": inv["vin"],
        "amount_excl_vat": money(amount_excl if amount_excl is not None else inv["totals"]["subtotal"]),
        "total_amount": money(total if total is not None else inv["totals"]["total_amount"]),
        "currency": "EUR", "workday_invoice_number": inv["invoice_number"],
        "issued_on": inv["invoice_date"], "approved_by": "Margarida (Market Portugal)",
        "pdf": f"docs/ey/{number}.pdf",
    }
    ey_final.append(row)
    return number


def pt_car(model_item, plate=None):
    return brand_desc(model_item, suffix=f" - Matrícula {plate}" if plate else "")


# P1 normal cash
o_p1 = o = poms_order("PT21", "C-PT-0209", "P2-CAR")
inv = invoice("PT21", o, "C-PT-0209", "C-PT-0209", [line("P2-CAR", "3022", pt_car("P2-CAR"), 1, P["P2-CAR"])],
              statutory_type=EY_INV, status="DRAFT",
              scenario="PT21 normal: private cash buyer; E&Y final invoice matches on date, amount, name, PO",
              expected_status="PASS")
inv["statutory_invoice_number"] = ey(inv)
inv["attachments"].append({"name": f"{inv['statutory_invoice_number']}.pdf", "type": "E&Y final invoice", "attached_to": "PO"})

# P2 leasing pass — plate present and matches POMS
o = poms_order("PT21", "C-PT-0201", "P2-CAR", financing="LEASING", plate="AF-23-XR")
inv = invoice("PT21", o, "C-PT-0201", "C-PT-0201", [line("P2-CAR", "3022", pt_car("P2-CAR", "AF-23-XR"), 1, P["P2-CAR"])],
              po_number="LP-PT-77812", statutory_type=EY_INV,
              scenario="PT21 leasing PASS: Atlântico Renting, licence plate from POMS present in the line description",
              expected_status="PASS")
inv["statutory_invoice_number"] = ey(inv)

# P3 leasing fail — plate missing
o = poms_order("PT21", "C-PT-0202", "P4-CAR", colour="Storm", financing="LEASING", plate="BH-44-LQ")
inv = invoice("PT21", o, "C-PT-0202", "C-PT-0202",
              [line("P4-CAR", "3022", pt_car("P4-CAR"), 1, P["P4-CAR"]), line("P4-CAR", "3022", "Storm", 1, P["PAINT"])],
              po_number="ARV-2026-3310", statutory_type=EY_INV,
              scenario="PT21 leasing FAIL: Lusoleasing, licence plate BH-44-LQ missing from the description",
              expected_status="FAIL", expected_findings=["PT21-001"],
              remediation="Append ' - Matrícula BH-44-LQ' (from POMS) to the vehicle line description.")
inv["statutory_invoice_number"] = ey(inv)

# P4 leasing fail — plate differs from POMS
o_p4 = o = poms_order("PT21", "C-PT-0205", "P2-CAR", financing="LEASING", plate="CJ-01-MN")
inv = invoice("PT21", o, "C-PT-0205", "C-PT-0205", [line("P2-CAR", "3022", pt_car("P2-CAR", "CJ-10-MN"), 1, P["P2-CAR"])],
              po_number="KIN-PT-0091", statutory_type=EY_INV,
              scenario="PT21 leasing FAIL: Mobilease, plate on invoice CJ-10-MN, POMS has CJ-01-MN",
              expected_status="FAIL", expected_findings=["PT21-001"],
              remediation="Correct the plate in the description to CJ-01-MN as recorded in POMS.")
inv["statutory_invoice_number"] = ey(inv)

# P5 personal loan pass — bill-to = sold-to = buyer
o = poms_order("PT21", "C-PT-0210", "P2-CAR", financing="PERSONAL_LOAN", partner_id="C-PT-0207")
inv = invoice("PT21", o, "C-PT-0210", "C-PT-0210", [line("P2-CAR", "3022", pt_car("P2-CAR"), 1, P["P2-CAR"])],
              statutory_type=EY_INV,
              scenario="PT21 personal loan PASS: Lusitânia Crédito finances; bill-to changed to buyer so bill-to = sold-to = buyer",
              expected_status="PASS")
inv["statutory_invoice_number"] = ey(inv)

# P6 personal loan fail — bill-to still the lender
o = poms_order("PT21", "C-PT-0211", "P4-CAR", financing="PERSONAL_LOAN", partner_id="C-PT-0208")
inv = invoice("PT21", o, "C-PT-0208", "C-PT-0211", [line("P4-CAR", "3022", pt_car("P4-CAR"), 1, P["P4-CAR"])],
              statutory_type=EY_INV,
              scenario="PT21 personal loan FAIL: bill-to still Crédito Ibérico SA instead of the buyer",
              expected_status="FAIL", expected_findings=["PT21-002"],
              remediation="Change Bill-To from Crédito Ibérico SA to Pedro Almeida (Bill-To = Sold-To = Buyer).")
inv["statutory_invoice_number"] = ey(inv)

# P7 bank sold-to exception pass — order 11300007 as in the exception document
o = poms_order("PT21", "C-PT-0212", "P2-CAR", colour="Midnight", financing="PERSONAL_LOAN", partner_id="C-PT-0206")
inv = invoice("PT21", o, "C-PT-0206", "C-PT-0206",
              [line("P2-CAR", "3022", pt_car("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Midnight", 1, P["PAINT"])],
              statutory_type=EY_INV,
              scenario="PT21 bank exception PASS: sold-to changed to Banco Meridional SA so bill-to = sold-to = loan provider",
              expected_status="PASS")
inv["statutory_invoice_number"] = ey(inv)

# P8 bank sold-to exception fail — sold-to left as the buyer
o = poms_order("PT21", "C-PT-0213", "P2-CAR", financing="PERSONAL_LOAN", partner_id="C-PT-0206")
inv = invoice("PT21", o, "C-PT-0206", "C-PT-0213", [line("P2-CAR", "3022", pt_car("P2-CAR"), 1, P["P2-CAR"])],
              statutory_type=EY_INV,
              scenario="PT21 bank exception FAIL: sold-to is still the buyer Rui Martins",
              expected_status="FAIL", expected_findings=["PT21-003"],
              remediation="Change Sold-To from Rui Martins to Banco Meridional SA.")
inv["statutory_invoice_number"] = ey(inv)

# P9 extras prepayment — VAT number missing in Workday, present in Salesforce
o = poms_order("PT21", "C-PT-0217", "P4-CAR", financing="COMPANY", handover_offset=+21, poms_type="Preconfigured Fleet", final_payment_amount=6150.00)
inv = invoice("PT21", o, "C-PT-0217", "C-PT-0217", [line("PREPAY", "3055", "Sinal / pré-pagamento Polestar 4", 1, 5000)],
              vat_number=None, statutory_type=EY_INV, document_kind="Sales Invoice Extra (prepayment)",
              scenario="PT21 prepayment FAIL: customer VAT number blank on the draft; Salesforce holds PT509876543",
              expected_status="FAIL", expected_findings=["PT21-004"],
              remediation="Populate customer VAT number PT509876543 from Salesforce account 001PT00000A1B2C.")
inv["statutory_invoice_number"] = ey(inv)

# P10 extras prepayment pass
o = poms_order("PT21", "C-PT-0216", "P2-CAR", financing="COMPANY", handover_offset=+14, poms_type="Preconfigured Fleet", final_payment_amount=3690.00)
inv = invoice("PT21", o, "C-PT-0216", "C-PT-0216", [line("PREPAY", "3055", "Sinal / pré-pagamento Polestar 2", 1, 3000)],
              statutory_type=EY_INV, document_kind="Sales Invoice Extra (prepayment)",
              scenario="PT21 prepayment PASS: VAT number populated",
              expected_status="PASS")
inv["statutory_invoice_number"] = ey(inv)

# P11 E&Y fail — amount differs
o = poms_order("PT21", "C-PT-0204", "P2-CAR", financing="LEASING", plate="DK-18-PR")
inv = invoice("PT21", o, "C-PT-0204", "C-PT-0204", [line("P2-CAR", "3022", pt_car("P2-CAR", "DK-18-PR"), 1, P["P2-CAR"])],
              po_number="LOC-PO-2026-207", statutory_type=EY_INV,
              scenario="PT21 E&Y FAIL: E&Y final invoice amount 47,900.00 excl. VAT vs Workday 45,900.00",
              expected_status="FAIL", expected_findings=["PT21-005"],
              remediation="E&Y error before Workday approval: mirror the E&Y invoice or request E&Y to reissue; do not approve.")
inv["statutory_invoice_number"] = ey(inv, amount_excl=47900, total=money(47900 * 1.23))

# P12 E&Y fail — date differs
o = poms_order("PT21", "C-PT-0203", "P4-CAR", financing="LEASING", plate="EL-90-TA")
inv = invoice("PT21", o, "C-PT-0203", "C-PT-0203", [line("P4-CAR", "3022", pt_car("P4-CAR", "EL-90-TA"), 1, P["P4-CAR"])],
              po_number="LSY-4402", statutory_type=EY_INV,
              scenario="PT21 E&Y FAIL: invoice date in Workday differs from the E&Y final invoice date",
              expected_status="FAIL", expected_findings=["PT21-005"],
              remediation="Update the Workday invoice date to the exact E&Y date.")
inv["statutory_invoice_number"] = ey(inv, inv_date=(TODAY - timedelta(days=4)).isoformat())

# P13 gapless fail — Workday statutory number does not match the E&Y sequence
o = poms_order("PT21", "C-PT-0214", "P2-CAR")
inv = invoice("PT21", o, "C-PT-0214", "C-PT-0214", [line("P2-CAR", "3022", pt_car("P2-CAR"), 1, P["P2-CAR"])],
              statutory_type=EY_INV,
              scenario="PT21 gapless FAIL: Workday statutory number is one ahead of the E&Y number for this invoice",
              expected_status="FAIL", expected_findings=["PT21-006"],
              remediation="Set statutory invoice number to the E&Y number; approve strictly in E&Y sequence.")
real = ey(inv)
inv["statutory_invoice_number"] = f"PT{int(real[2:]) + 1}"

# P14 gapless fail — approved in Workday but no E&Y final invoice received
o = poms_order("PT21", "C-PT-0215", "P2-CAR")
inv = invoice("PT21", o, "C-PT-0215", "C-PT-0215", [line("P2-CAR", "3022", pt_car("P2-CAR"), 1, P["P2-CAR"])],
              statutory_type=EY_INV, status="APPROVED", statutory_number="PT240130",
              scenario="PT21 gapless FAIL: approved in Workday before the E&Y final invoice was received",
              expected_status="FAIL", expected_findings=["PT21-006"],
              remediation="Cancel approval; wait for the E&Y final invoice, then approve in sequence.")

# P15 delivery note — zero value, excluded from E&Y report
inv = invoice("PT21", o_p1, "C-PT-0209", "C-PT-0209", [line("DN-INT", "9000", "Guia de remessa - Polestar 2", 1, 0)],
              document_kind="Delivery Note", vat_number="AUTO",
              scenario="PT21 delivery note PASS: zero-value internal document, excluded from the daily E&Y report",
              expected_status="PASS")

# P16 credit note — matches E&Y, memo per process
o = o_p4   # Mobilease order re-billed
inv = invoice("PT21", o, "C-PT-0205", "C-PT-0205", [line("P2-CAR", "3022", pt_car("P2-CAR", "CJ-01-MN"), 1, -P["P2-CAR"])],
              po_number="KIN-PT-0091", statutory_type=EY_CN, document_kind="Credit Note",
              memo="Manual credit and rebill due to E&Y error.",
              scenario="PT21 credit note PASS: matches E&Y credit note; reason noted; kept in draft",
              expected_status="PASS")
inv["statutory_invoice_number"] = ey(inv)

# --------------------------------------------------------------------------- #
# DK21 — customer-specific SharePoint tracker
# --------------------------------------------------------------------------- #
P = PRICES["DK21"]

# D1 normal
o = poms_order("DK21", "C-DK-0302", "P2-CAR")
invoice("DK21", o, "C-DK-0302", "C-DK-0302", [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Snow", 1, 0)],
        scenario="DK21 normal: private cash buyer", expected_status="PASS")


def dk_row(order, po_ref, agreed_price, cc_text):
    dk_tracker.append({
        "tracker_id": f"DK-SP-{len(dk_tracker) + 1:03d}", "customer_id": "C-DK-0301", "customer_name": "Øresund Fleet A/S",
        "poms_order_number": order["order_number"], "vin": order["vin"],
        "required_po_reference": po_ref, "agreed_unit_price": money(agreed_price),
        "required_description_text": cc_text,
        "uploaded_by": "Sales Denmark", "uploaded_on": (TODAY - timedelta(days=2)).isoformat(),
        "sharepoint_url": f"https://polestar.sharepoint.com/sites/DK21-Billing/Tracker/{order['order_number']}",
    })


# D2 tracker pass — draft adjusted per tracker
o = poms_order("DK21", "C-DK-0301", "P2-CAR", financing="LEASING", price_override=329995)
dk_row(o, "OF-PO-2026-118", 329995, "CC-4410 Sales Fleet")
invoice("DK21", o, "C-DK-0301", "C-DK-0301",
        [line("P2-CAR", "3022", brand_desc("P2-CAR", suffix=" - CC-4410 Sales Fleet"), 1, 329995), line("P2-CAR", "3022", "Snow", 1, 0)],
        po_number="OF-PO-2026-118",
        scenario="DK21 tracker PASS: PO reference, agreed fleet price and cost-centre text all applied from SharePoint tracker",
        expected_status="PASS")

# D3 tracker fail — nothing applied
o = poms_order("DK21", "C-DK-0301", "P4-CAR", colour="Storm", financing="LEASING", price_override=429995)
dk_row(o, "OF-PO-2026-121", 429995, "CC-4410 Sales Fleet")
invoice("DK21", o, "C-DK-0301", "C-DK-0301",
        [line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"]), line("P4-CAR", "3022", "Storm", 1, P["PAINT"])],
        scenario="DK21 tracker FAIL: list price billed, PO reference missing, cost-centre text missing",
        expected_status="FAIL", expected_findings=["DK21-001", "GEN-002"],
        remediation="Apply tracker DK-SP-002: PO OF-PO-2026-121, unit price 429,995.00, add 'CC-4410 Sales Fleet' to line 1.")

# D4 normal corporate
o = poms_order("DK21", "C-DK-0304", "P4-CAR", financing="COMPANY", options=("HOME-CHG",))
invoice("DK21", o, "C-DK-0304", "C-DK-0304",
        [line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"]), line("HOME-CHG", "3027", "Hjemmelader 11 kW", 1, P["HOME-CHG"])],
        po_number="KB-2026-0554",
        scenario="DK21 normal: corporate buyer with accessory line", expected_status="PASS")

# D5 generic fail — VIN differs from POMS
o = poms_order("DK21", "C-DK-0303", "P2-CAR", colour="Midnight")
invoice("DK21", o, "C-DK-0303", "C-DK-0303",
        [line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]), line("P2-CAR", "3022", "Midnight", 1, P["PAINT"])],
        vin_override=o["vin"][:-3] + "999",
        scenario="DK21 generic FAIL: VIN on the invoice does not match the POMS order",
        expected_status="FAIL", expected_findings=["GEN-003"],
        remediation=f"Correct VIN to {o['vin']} from POMS order {o['order_number']}.")

# --------------------------------------------------------------------------- #
# Workday ↔ POMS mapping rules (mappings.yaml): invoice type vs order state,
# customer vs owner, company vs market, currency, total vs grand total
# --------------------------------------------------------------------------- #
P = PRICES["SE21"]
# M1 PASS — Bank Invoice Before Handover: order confirmed, Personal Loan, bank is bill-to, locked
o = poms_order("SE21", "C-SE-0004", "P2-CAR", colour="Storm", financing="PERSONAL_LOAN", partner_id="C-SE-0001",
               financing_option="Personal Loan", order_status="confirmed", handover_offset=+12)
invoice("SE21", o, "C-SE-0001", "C-SE-0004", [
    line("P2-CAR", "3030", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
    line("P2-CAR", "3030", "Storm", 1, P["PAINT"]),
], invoice_type="Bank Invoice Before Handover",
   scenario="MAP PASS: Bank Invoice Before Handover on a confirmed, locked Personal Loan order billed to the bank",
   expected_status="PASS")

# M2 FAIL — Sales Invoice Bank issued on a Personal Loan order (only Bank Invoice Before Handover allows Personal Loan)
o = poms_order("SE21", "C-SE-0003", "P4-CAR", financing="PERSONAL_LOAN", partner_id="C-SE-0002", financing_option="Personal Loan")
invoice("SE21", o, "C-SE-0002", "C-SE-0003", [
    line("P4-CAR", "3030", brand_desc("P4-CAR"), 1, P["P4-CAR"]),
    line("P4-CAR", "3030", "Snow", 1, 0),
], invoice_type="Sales Invoice Bank",
   scenario="MAP FAIL: invoice type Sales Invoice Bank but POMS financing option is Personal Loan (not an allowed combination)",
   expected_status="FAIL", expected_findings=["MAP-001"],
   remediation="Re-type as Bank Invoice Before Handover or correct the POMS financing option to Loan.")

# M3 PASS — Sales Invoice to the buyer with the upfront payment deducted (fallback: grand total − upfront)
o = poms_order("SE21", "C-SE-0007", "P2-CAR", colour="Midnight", financing="PERSONAL_LOAN", partner_id="C-SE-0001", upfront_payment=25000)
invoice("SE21", o, "C-SE-0007", "C-SE-0007", [
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
    line("P2-CAR", "3022", "Midnight", 1, P["PAINT"]),
    line("PREPAY", "3055", "Avgår: erlagd handpenning", 1, -20000),
], invoice_type="Sales Invoice",
   scenario="MAP PASS: Sales Invoice equals POMS grand total minus the upfront payment (fallback subtract_first_positive)",
   expected_status="PASS")

# M4 FAIL — invoice currency keyed as SEK on a NOK order
P = PRICES["NO21"]
o = poms_order("NO21", "C-NO-0110", "P2-CAR", colour="Storm", fees=NO_FEES)
invoice("NO21", o, "C-NO-0110", "C-NO-0110", [
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
    line("P2-CAR", "3022", "Storm", 1, P["PAINT"]),
    line("FEE-DEL", "3041", "Leveringsgebyr", 1, P["FEE-DEL"]),
    line("FEE-REG", "3042", "Registreringsavgift", 1, P["FEE-REG"]),
], currency="SEK",
   scenario="MAP FAIL: Workday invoice currency SEK, POMS order currency NOK",
   expected_status="FAIL", expected_findings=["MAP-004"],
   remediation="Change the invoice currency to NOK.")

# M5 FAIL — order manually unlocked in POMS (changing financing method); no invoice may be issued
o = poms_order("NO21", "C-NO-0111", "P4-CAR", financing="PERSONAL_LOAN", partner_id=None, lock_state="unlocked",
               unlock_reason="Changing financing method", fees=NO_FEES)
invoice("NO21", o, "C-NO-0111", "C-NO-0111", [
    line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"]),
    line("P4-CAR", "3022", "Snow", 1, 0),
    line("FEE-DEL", "3041", "Leveringsgebyr", 1, P["FEE-DEL"]),
    line("FEE-REG", "3042", "Registreringsavgift", 1, P["FEE-REG"]),
], invoice_type="Sales Invoice",
   scenario="MAP FAIL: POMS order lock state is unlocked (manually unlocked — changing financing method)",
   expected_status="FAIL", expected_findings=["MAP-001"],
   remediation="Hold the draft until the order is locked again in POMS, then re-check the financing option.")

# M6 PASS — customer name differs only in legal-form spelling (fuzzy ≥ 85)
o = poms_order("NO21", "C-NO-0112", "P2-CAR", financing="COMPANY", fees=NO_FEES, owner_name="Nordic Consulting A/S")
invoice("NO21", o, "C-NO-0112", "C-NO-0112", [
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
    line("P2-CAR", "3022", "Snow", 1, 0),
    line("FEE-DEL", "3041", "Leveringsgebyr", 1, P["FEE-DEL"]),
    line("FEE-REG", "3042", "Registreringsavgift", 1, P["FEE-REG"]),
], po_number="NC-2026-118",
   scenario="MAP PASS: Workday customer 'Nordic Consulting AS' vs POMS owner 'Nordic Consulting A/S' — fuzzy match above threshold",
   expected_status="PASS")

# M7 FAIL — wrong sales order keyed: customer does not match the POMS owner
P = PRICES["PT21"]
o = poms_order("PT21", "C-PT-0203", "P2-CAR", financing="LEASING", plate="FM-27-QP")
inv = invoice("PT21", o, "C-PT-0204", "C-PT-0204", [line("P2-CAR", "3022", pt_car("P2-CAR", "FM-27-QP"), 1, P["P2-CAR"])],
              statutory_type=EY_INV,
              scenario="MAP FAIL: Workday customer Rentalis Portugal SA but POMS owner of the referenced order is Iberfrota Leasing Lda",
              expected_status="FAIL", expected_findings=["MAP-002"],
              remediation="Correct the Sales Order reference (or the Bill-To / Sold-To customer) so the invoice points at the right POMS order.")
inv["statutory_invoice_number"] = ey(inv)

# M8 PASS — Payment Receipt equals POMS final payment amount
o = poms_order("PT21", "C-PT-0209", "P2-CAR", poms_type="Preconfigured", upfront_payment=2500)
invoice("PT21", o, "C-PT-0209", "C-PT-0209", [line("PREPAY", "3055", "Recibo de pagamento final Polestar 2", 1, money(o["final_payment_amount"] / 1.23))],
        document_kind="Payment Receipt", statutory_type=EY_INV,
        scenario="MAP PASS: Payment Receipt total equals POMS Final Payment Amount (field override)",
        expected_status="PASS")

# M9 FAIL — Payment Receipt raised for the grand total although a deposit was already paid
o = poms_order("PT21", "C-PT-0210", "P2-CAR", colour="Midnight", poms_type="Preconfigured", upfront_payment=2500)
invoice("PT21", o, "C-PT-0210", "C-PT-0210", [line("PREPAY", "3055", "Recibo de pagamento final Polestar 2", 1, money(o["grand_total_price"] / 1.23))],
        document_kind="Payment Receipt", statutory_type=EY_INV,
        scenario="MAP FAIL: Payment Receipt total equals the grand total; POMS Final Payment Amount is lower because 2,500 was paid upfront",
        expected_status="FAIL", expected_findings=["GEN-002"],
        remediation="Reduce the receipt to the POMS Final Payment Amount.")

# M10 FAIL — DK21 invoice references a Swedish POMS order (company ≠ market, currency ≠)
P = PRICES["DK21"]
o_se = poms_order("SE21", "C-SE-0006", "P2-CAR", options=("HOME-CHG",))
invoice("DK21", o_se, "C-DK-0303", "C-DK-0303", [
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, PRICES["SE21"]["P2-CAR"]),
    line("P2-CAR", "3022", "Snow", 1, 0),
    line("HOME-CHG", "3027", "Hjemmelader", 1, PRICES["SE21"]["HOME-CHG"]),
], scenario="MAP FAIL: DK21 invoice points at a POMS order in market SE — company/market and currency both disagree",
   expected_status="FAIL", expected_findings=["MAP-002", "MAP-003", "MAP-004"],
   remediation="Correct the Sales Order reference to the Danish POMS order.")

# M11 FAIL — Sales Invoice Fleet on a private B2C order (POMS type Order, not Fleet)
o = poms_order("DK21", "C-DK-0302", "P4-CAR", colour="Storm")
invoice("DK21", o, "C-DK-0302", "C-DK-0302", [
    line("P4-CAR", "3022", brand_desc("P4-CAR"), 1, P["P4-CAR"]),
    line("P4-CAR", "3022", "Storm", 1, P["PAINT"]),
], invoice_type="Sales Invoice Fleet",
   scenario="MAP FAIL: invoice type Sales Invoice Fleet but the POMS order type is Order (private cash buyer) — should be Early Invoice",
   expected_status="FAIL", expected_findings=["MAP-001"],
   remediation="Change the invoice type to Early Invoice.")

# M12 PASS — rounding difference inside the 0.05 tolerance
o = poms_order("DK21", "C-DK-0304", "P2-CAR", financing="COMPANY", options=("S00002",))
invoice("DK21", o, "C-DK-0304", "C-DK-0304", [
    line("P2-CAR", "3022", brand_desc("P2-CAR"), 1, P["P2-CAR"]),
    line("P2-CAR", "3022", "Snow", 1, 0),
    line("S00002", "3027", "Servicepakke 3 år", 1, P["S00002"] + 0.02, extended=P["S00002"] + 0.02),
], po_number="KB-PO-2026-441",
   scenario="MAP PASS: Sales Invoice Fleet total differs from the POMS grand total by 0.03 — inside the 0.05 tolerance",
   expected_status="PASS")

# Link invoices back onto POMS orders
inv_by_order = {}
for i in invoices:
    inv_by_order.setdefault(i["poms_order_number"], []).append(i["invoice_number"])
for o in poms_orders:
    o["workday_invoices"] = inv_by_order.get(o["order_number"], [])


# =========================================================================== #
# 6. RULE CATALOGUE
# =========================================================================== #
RULES = [
    {"rule_id": "GEN-001", "company": "ALL", "name": "Line arithmetic", "severity": "critical",
     "condition": "Every invoice line", "check": "extended_amount = quantity × unit_price",
     "source": "Workday invoice line", "outcome_on_fail": "FAIL"},
    {"rule_id": "GEN-002", "company": "ALL", "name": "Workday vs POMS value match", "severity": "critical",
     "condition": "Invoice references a POMS order (Sales Order = Order No)", "check": "Order exists in POMS and Total Invoice Amount matches the POMS amount within a 0.05 tolerance: Grand Total Price by default; Final Payment Amount for Payment Receipt; for Sales Invoice / Sales Invoice Bank, Grand Total Price minus the first positive of Final Payment Amount / Upfront Payment is accepted as a fallback. Skipped for delivery notes and credit notes, and superseded by NO21-004 once an NGA tracker response exists",
     "source": "POMS order (mappings.yaml: Total Invoice Amount ↔ Grand Total Price)", "outcome_on_fail": "FAIL"},
    {"rule_id": "MAP-001", "company": "ALL", "name": "Invoice type vs POMS order state", "severity": "critical",
     "condition": "Workday Invoice Type is one of the mapped types (Early Invoice, Sales Invoice, Sales Invoice Bank, Sales Invoice FSP, Sales Invoice Fleet, Fleet / FSP / Bank Invoice Before Handover, Payment Receipt)",
     "check": "POMS Type, Order Status, Financing Option and Lock State are all in the allowed list for that invoice type (mappings.yaml invoice_type_rule)",
     "source": "POMS order", "outcome_on_fail": "FAIL"},
    {"rule_id": "MAP-002", "company": "ALL", "name": "Customer vs POMS owner", "severity": "high",
     "condition": "Invoice references a POMS order", "check": "Workday Customer fuzzy-matches POMS Owner (token ratio ≥ 85)",
     "source": "POMS order roles", "outcome_on_fail": "FAIL"},
    {"rule_id": "MAP-003", "company": "ALL", "name": "Company vs POMS market", "severity": "high",
     "condition": "Invoice references a POMS order", "check": "Workday Company country prefix equals the POMS Market code (SE21 ↔ SE, NL-BE style codes accepted)",
     "source": "POMS order", "outcome_on_fail": "FAIL"},
    {"rule_id": "MAP-004", "company": "ALL", "name": "Currency", "severity": "high",
     "condition": "Invoice references a POMS order", "check": "Workday invoice currency equals POMS order currency",
     "source": "POMS order", "outcome_on_fail": "FAIL"},
    {"rule_id": "GEN-003", "company": "ALL", "name": "VIN match", "severity": "high",
     "condition": "Invoice references a POMS order", "check": "Invoice VIN equals POMS VIN",
     "source": "POMS order", "outcome_on_fail": "FAIL"},
    {"rule_id": "SE21-001", "company": "SE21", "name": "Related party revenue category", "severity": "high",
     "condition": "Bill-To or Sold-To is a related-party financing bank (customer.related_party = true) AND line description contains 'Brand'",
     "check": "Line revenue_category = 3030", "source": "Workday customer master + invoice line",
     "outcome_on_fail": "FAIL", "remediation": "Manually correct the revenue category to 3030."},
    {"rule_id": "NO21-001", "company": "NO21", "name": "NGA tracker captured", "severity": "high",
     "condition": "Bill-To customer.nga_customer = true",
     "check": "A tracker row exists for the invoice with invoice_number, customer_id, model_number, total_invoice_price, gross_taxable_amount and base_price populated",
     "source": "NGA tracker", "outcome_on_fail": "FAIL"},
    {"rule_id": "NO21-002", "company": "NO21", "name": "NGA response received", "severity": "high",
     "condition": "NGA customer with a tracker row", "check": "tracker.response_status = RESPONDED",
     "source": "NGA tracker", "outcome_on_fail": "HOLD"},
    {"rule_id": "NO21-003", "company": "NO21", "name": "Fee lines removed when instructed", "severity": "critical",
     "condition": "tracker.remove_fees = true", "check": "No line whose revenue category is a fee category (3041, 3042, 3043)",
     "source": "NGA tracker + revenue category master", "outcome_on_fail": "FAIL"},
    {"rule_id": "NO21-004", "company": "NO21", "name": "Revised gross and base applied", "severity": "critical",
     "condition": "NGA tracker responded", "check": "Invoice taxable amount = revised_gross_amount; vehicle line unit price = revised_base_price",
     "source": "NGA tracker", "outcome_on_fail": "FAIL"},
    {"rule_id": "NO21-005", "company": "NO21", "name": "VAT recalculated after amendment", "severity": "critical",
     "condition": "Every NO21 invoice", "check": "tax_amount = taxable_amount × 25%", "source": "Workday tax", "outcome_on_fail": "FAIL"},
    {"rule_id": "NO21-007", "company": "NO21", "name": "Factoring payment captured", "severity": "medium",
     "condition": "A payment is applied to the invoice as ON_ACCOUNT", "check": "payment_id exists in the factoring tracker",
     "source": "Factoring tracker", "outcome_on_fail": "FAIL"},
    {"rule_id": "PT21-001", "company": "PT21", "name": "Leasing licence plate", "severity": "high",
     "condition": "Bill-To is a leasing company that requires the licence plate (customer.leasing_plate_required = true)",
     "check": "Vehicle line description contains the POMS license_plate", "source": "POMS order", "outcome_on_fail": "FAIL"},
    {"rule_id": "PT21-002", "company": "PT21", "name": "Personal loan bill-to", "severity": "high",
     "condition": "POMS financing_type = PERSONAL_LOAN and the partner is not flagged bank_sold_to_exception",
     "check": "Bill-To = Sold-To = buyer", "source": "POMS order", "outcome_on_fail": "FAIL"},
    {"rule_id": "PT21-003", "company": "PT21", "name": "Bank sold-to exception", "severity": "high",
     "condition": "POMS financing partner is flagged bank_sold_to_exception", "check": "Bill-To = Sold-To = the loan provider",
     "source": "POMS order", "outcome_on_fail": "FAIL"},
    {"rule_id": "PT21-004", "company": "PT21", "name": "VAT number on extras / prepayment", "severity": "medium",
     "condition": "document_kind is Sales Invoice Extra or prepayment", "check": "customer_vat_number populated (fallback source: Salesforce)",
     "source": "Workday + Salesforce", "outcome_on_fail": "FAIL"},
    {"rule_id": "PT21-005", "company": "PT21", "name": "E&Y final invoice match", "severity": "critical",
     "condition": "An E&Y final invoice exists for the Workday invoice",
     "check": "invoice_date, customer name, PO number, VIN, amount excl. VAT and total all equal",
     "source": "E&Y final invoices", "outcome_on_fail": "FAIL"},
    {"rule_id": "PT21-006", "company": "PT21", "name": "Gapless numbering and approval order", "severity": "critical",
     "condition": "Statutory invoice types PRT Invoice / Credit note - EY",
     "check": "Workday statutory number equals the E&Y number; an APPROVED invoice must have an E&Y final invoice",
     "source": "E&Y final invoices", "outcome_on_fail": "FAIL"},
    {"rule_id": "PT21-007", "company": "PT21", "name": "Exclude internal zero-value documents", "severity": "info",
     "condition": "Delivery Note or Sales Invoice Extra with zero value", "check": "Flag as excluded from the daily E&Y report",
     "source": "Workday", "outcome_on_fail": "INFO"},
    {"rule_id": "DK21-001", "company": "DK21", "name": "SharePoint tracker adjustments applied", "severity": "high",
     "condition": "Bill-To customer.sharepoint_tracker = true and a tracker row exists for the POMS order",
     "check": "po_number = required_po_reference; vehicle unit price = agreed_unit_price; description contains required_description_text",
     "source": "DK21 SharePoint tracker", "outcome_on_fail": "FAIL"},
]


# =========================================================================== #
# 7. EMIT
# =========================================================================== #
WD = os.path.join(API, "workday")
dump(os.path.join(WD, "companies.json"), envelope("Workday", "Company", COMPANIES))
dump(os.path.join(WD, "revenue-categories.json"), envelope("Workday", "Revenue Category", REVENUE_CATEGORIES))
dump(os.path.join(WD, "sales-items.json"), envelope("Workday", "Sales Item", SALES_ITEMS))
dump(os.path.join(WD, "customers.json"), envelope("Workday", "Customer", CUSTOMERS))
for c in CUSTOMERS:
    dump(os.path.join(WD, "customers", f"{c['customer_id']}.json"), {"source_system": "Workday", "data": c})


def header_row(i: dict) -> dict:
    h = {k: v for k, v in i.items() if k not in ("lines", "tax", "totals", "attachments", "payment_application", "process_history")}
    h.update({
        "line_count": len(i["lines"]), "taxable_amount": i["tax"]["taxable_amount"],
        "tax_rate": i["tax"]["tax_rate"], "tax_amount": i["tax"]["tax_amount"],
        "subtotal": i["totals"]["subtotal"], "total_amount": i["totals"]["total_amount"], "amount_due": i["totals"].get("amount_due", i["totals"]["total_amount"]),
        "has_fee_lines": any(RC[l["revenue_category"]]["is_fee"] for l in i["lines"]),
        "payment_applied_as": i["payment_application"]["applied_as"] if i["payment_application"] else None,
    })
    return h


dump(os.path.join(WD, "customer-invoices.json"), envelope("Workday", "Customer Invoice", [header_row(i) for i in invoices],
     note="Header rows. Detail with invoice lines at api/workday/customer-invoices/{invoice_number}.json"))
for i in invoices:
    dump(os.path.join(WD, "customer-invoices", f"{i['invoice_number']}.json"), {"source_system": "Workday", "data": i})

flat = []
for i in invoices:
    h = header_row(i)
    for l in i["lines"]:
        flat.append({**{k: v for k, v in h.items() if k != "line_count"}, **{("line_company" if k == "company" else k): v for k, v in l.items()}})
dump(os.path.join(WD, "invoice-lines.json"), envelope("Workday", "Customer Invoice Line (flat)", flat,
     note="One row per invoice line with the header denormalised on it. Revenue Category and Sales Item are on every row."))

dump(os.path.join(API, "poms", "orders.json"), envelope("POMS", "Vehicle Order", poms_orders))
for o in poms_orders:
    dump(os.path.join(API, "poms", "orders", f"{o['order_number']}.json"), {"source_system": "POMS", "data": o})

dump(os.path.join(API, "trackers", "nga-tracker.json"), envelope("NGA tracker (Excel on SharePoint)", "NGA tracker row", nga_tracker))
dump(os.path.join(API, "trackers", "factoring-tracker.json"), envelope("Factoring tracker", "Factoring payment", factoring_tracker))
dump(os.path.join(API, "trackers", "dk21-sharepoint-tracker.json"), envelope("DK21 SharePoint tracker", "Customer adjustment", dk_tracker))
dump(os.path.join(API, "ey", "final-invoices.json"), envelope("E&Y certified invoicing (Portugal)", "Final invoice", ey_final,
     sequences={"PRT Invoice - EY – Portugal": "PT240001…", "PRT Credit note - EY – Portugal": "PT2400001…",
                "PRT Credit note Retrobonus - EY – Portugal": "PT2500001…"}))
dump(os.path.join(API, "salesforce", "accounts.json"), envelope("Salesforce", "Account", SALESFORCE_ACCOUNTS))
dump(os.path.join(WD, "exception-rules.json"), envelope("Validation rule catalogue", "Rule", RULES))
dump(os.path.join(WD, "expected-results.json"), envelope("Answer key", "Expected validation result", expected,
     summary={s: sum(1 for e in expected if e["expected_status"] == s) for s in ("PASS", "FAIL", "HOLD")}))

dump(os.path.join(WD, "index.json"), {
    "system": "Workday + POMS layer for the billing validation POC",
    "generated_at": GENERATED,
    "companies": [c["company"] for c in COMPANIES],
    "endpoints": {
        "companies": "api/workday/companies.json",
        "customers": "api/workday/customers.json",
        "customer_detail": "api/workday/customers/{customer_id}.json",
        "revenue_categories": "api/workday/revenue-categories.json",
        "sales_items": "api/workday/sales-items.json",
        "customer_invoices": "api/workday/customer-invoices.json",
        "customer_invoice_detail": "api/workday/customer-invoices/{invoice_number}.json",
        "invoice_lines_flat": "api/workday/invoice-lines.json",
        "poms_orders": "api/poms/orders.json",
        "poms_order_detail": "api/poms/orders/{order_number}.json",
        "nga_tracker": "api/trackers/nga-tracker.json",
        "factoring_tracker": "api/trackers/factoring-tracker.json",
        "dk21_sharepoint_tracker": "api/trackers/dk21-sharepoint-tracker.json",
        "ey_final_invoices": "api/ey/final-invoices.json",
        "salesforce_accounts": "api/salesforce/accounts.json",
        "exception_rules": "api/workday/exception-rules.json",
        "expected_results": "api/workday/expected-results.json",
        "validation_latest_run": "api/validation-runs/latest.json",
        "validation_history": "api/validation-runs/history.json",
    },
    "join_keys": {
        "invoice_to_poms": "customer_invoice.poms_order_number = poms_order.order_number",
        "invoice_to_customer": "customer_invoice.bill_to_customer_id / sold_to_customer_id = customer.customer_id",
        "line_to_revenue_category": "invoice_line.revenue_category = revenue_category.revenue_category",
        "invoice_to_nga": "nga_tracker.invoice_number = customer_invoice.invoice_number",
        "invoice_to_ey": "ey_final_invoice.workday_invoice_number = customer_invoice.invoice_number",
        "order_to_dk_tracker": "dk21_tracker.poms_order_number = poms_order.order_number",
        "payment_to_factoring": "factoring_tracker.payment_id = customer_invoice.payment_application.payment_id",
    },
    "counts": {"customer_invoices": len(invoices), "invoice_lines": len(flat), "poms_orders": len(poms_orders),
               "customers": len(CUSTOMERS), "rules": len(RULES),
               "expected": {s: sum(1 for e in expected if e["expected_status"] == s) for s in ("PASS", "FAIL", "HOLD")}},
})

# ----------------------------------------------------------------------- SQL
def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, dict)):
        v = json.dumps(v, ensure_ascii=False)
    return "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"


def sqltype(v):
    if isinstance(v, bool):
        return "TINYINT(1)"
    if isinstance(v, int):
        return "BIGINT"
    if isinstance(v, float):
        return "DECIMAL(16,2)"
    if isinstance(v, (list, dict)):
        return "JSON"
    return "VARCHAR(255)"


def table_sql(name, rows, pk):
    cols = {}
    for r in rows:
        for k, v in r.items():
            if k not in cols or (cols[k] == "VARCHAR(255)" and v is not None):
                cols[k] = sqltype(v) if v is not None else cols.get(k, "VARCHAR(255)")
    ddl = f"CREATE TABLE {name} (\n  " + ",\n  ".join(f"`{k}` {t}" for k, t in cols.items()) + f",\n  PRIMARY KEY (`{pk}`)\n);\n"
    ins = "".join(f"INSERT INTO {name} ({', '.join('`' + k + '`' for k in r)}) VALUES ({', '.join(q(v) for v in r.values())});\n" for r in rows)
    return ddl, ins


ddl_all, ins_all = ["-- Workday + POMS layer — schema (MySQL 8)\n"], ["-- Workday + POMS layer — seed\n"]
wd_lines_sql = [{"invoice_number": i["invoice_number"], "line": l["line"], "line_key": f"{i['invoice_number']}-{l['line']}", **{k: v for k, v in l.items() if k != "line"}} for i in invoices for l in i["lines"]]
for name, rows, pk in [
    ("wd_company", COMPANIES, "company"), ("wd_revenue_category", REVENUE_CATEGORIES, "revenue_category"),
    ("wd_sales_item", SALES_ITEMS, "sales_item"), ("wd_customer", CUSTOMERS, "customer_id"),
    ("wd_customer_invoice", [header_row(i) for i in invoices], "invoice_number"),
    ("wd_customer_invoice_line", wd_lines_sql, "line_key"),
    ("poms_order", [{**{k: v for k, v in o.items()}} for o in poms_orders], "order_number"),
    ("nga_tracker", nga_tracker, "tracker_id"), ("factoring_tracker", factoring_tracker, "factoring_id"),
    ("dk21_sharepoint_tracker", dk_tracker, "tracker_id"), ("ey_final_invoice", ey_final, "ey_invoice_number"),
    ("sf_account", SALESFORCE_ACCOUNTS, "sf_account_id"), ("validation_rule", RULES, "rule_id"),
    ("expected_result", expected, "invoice_number"),
]:
    d, s = table_sql(name, rows, pk)
    ddl_all.append(d)
    ins_all.append(s)
with open(os.path.join(ROOT, "sql", "workday_poms_schema.sql"), "w", encoding="utf-8") as f:
    f.write("\n".join(ddl_all))
with open(os.path.join(ROOT, "sql", "workday_poms_seed.sql"), "w", encoding="utf-8") as f:
    f.write("".join(ins_all))

print(f"invoices={len(invoices)} lines={len(flat)} poms={len(poms_orders)} nga={len(nga_tracker)} ey={len(ey_final)} dk={len(dk_tracker)}")
print("expected:", {s: sum(1 for e in expected if e['expected_status'] == s) for s in ('PASS', 'FAIL', 'HOLD')})
