"""Idempotent seed data for the CRM. Run: cd /app/backend && python seed.py"""

import asyncio
import random
from datetime import datetime, timedelta, timezone

from lib.auth import hash_password
from lib.db import client, db

random.seed(7)
NOW = datetime.now(timezone.utc)
TODAY = NOW.date()

CITIES = [("Jakarta", "DKI Jakarta"), ("Surabaya", "Jawa Timur"), ("Bandung", "Jawa Barat"),
          ("Medan", "Sumatera Utara"), ("Semarang", "Jawa Tengah"), ("Makassar", "Sulawesi Selatan")]
INDUSTRIES = ["Manufaktur", "Oil & Gas", "Pertambangan", "Otomotif", "FMCG", "Telekomunikasi", "Konstruksi"]
SOURCES = ["Referral", "Website", "Pameran", "Cold Call", "Partner"]
COMPANIES = [
    "PT Anugerah Teknik Nusantara", "PT Baja Mandiri Sejahtera", "PT Cakrawala Energi", "PT Delta Mesin Presisi",
    "PT Emerald Industrial", "PT Fajar Otomasi Indonesia", "PT Garuda Metalindo Jaya", "PT Harapan Sentosa Kimia",
    "PT Indo Prima Kabel", "PT Jaya Konstruksi Utama", "PT Karya Logam Perkasa", "PT Lintas Nusa Telekom",
    "PT Mega Sarana Pangan", "PT Nusantara Mining Tools", "PT Optima Daya Listrik", "PT Pertiwi Agro Industri",
    "PT Quantum Elektronika", "PT Rajawali Truck Parts", "PT Sinar Baja Elektrik", "PT Tirta Investama Mandiri",
]
PIC = ["Budi Santoso", "Siti Nurhaliza", "Agus Wijaya", "Dewi Lestari", "Rudi Hartono", "Maya Puspita",
       "Hendra Gunawan", "Rina Marlina", "Yusuf Ibrahim", "Lina Kusuma"]
PRODUCT_DEFS = [
    ("Industrial PC Fanless", "Advantech", "Computing", "Unit", 24500000),
    ("PLC Modular CPU", "Siemens", "Automation", "Unit", 18750000),
    ("HMI Touch Panel 10\"", "Omron", "Automation", "Unit", 9800000),
    ("Servo Motor 750W", "Mitsubishi", "Motion", "Unit", 12400000),
    ("Inverter VFD 5.5kW", "Schneider", "Drives", "Unit", 8600000),
    ("Proximity Sensor M18", "Autonics", "Sensor", "Pcs", 450000),
    ("Safety Light Curtain", "Keyence", "Safety", "Set", 27500000),
    ("Industrial Switch 8 Port", "Moxa", "Networking", "Unit", 6350000),
    ("Barcode Scanner Fixed", "Cognex", "Vision", "Unit", 31200000),
    ("Thermal Camera Module", "FLIR", "Vision", "Unit", 42800000),
    ("Rotary Encoder 1024PPR", "Autonics", "Sensor", "Pcs", 1850000),
    ("Pneumatic Cylinder 50mm", "SMC", "Pneumatic", "Pcs", 2350000),
    ("Solenoid Valve 5/2", "Festo", "Pneumatic", "Pcs", 1275000),
    ("Power Supply 24V 10A", "Mean Well", "Power", "Unit", 1650000),
    ("Circuit Breaker 3P 100A", "ABB", "Electrical", "Unit", 3450000),
    ("Contactor 40A", "Schneider", "Electrical", "Pcs", 1120000),
    ("Temperature Controller", "Omron", "Instrument", "Unit", 2780000),
    ("Flow Meter Electromagnetic", "Endress+Hauser", "Instrument", "Unit", 56000000),
    ("Pressure Transmitter", "Yokogawa", "Instrument", "Unit", 14300000),
    ("Load Cell 500kg", "Zemic", "Instrument", "Pcs", 4200000),
    ("Gearbox Helical Ratio 20", "Bonfiglioli", "Motion", "Unit", 16500000),
    ("Linear Guide Rail 1m", "THK", "Motion", "Pcs", 5400000),
    ("Industrial Robot Arm 6 Axis", "Fanuc", "Robotics", "Unit", 385000000),
    ("Conveyor Belt PVC 10m", "Habasit", "Material Handling", "Roll", 9250000),
    ("Vacuum Pump 2.2kW", "Busch", "Pneumatic", "Unit", 21700000),
    ("Chiller Unit 5TR", "Daikin", "HVAC", "Unit", 78500000),
    ("UPS Online 10kVA", "APC", "Power", "Unit", 43900000),
    ("Cable Tray Galvanis 3m", "Interack", "Electrical", "Pcs", 780000),
    ("Panel Enclosure IP66", "Rittal", "Electrical", "Unit", 6800000),
    ("Ultrasonic Level Sensor", "Siemens", "Instrument", "Unit", 19400000),
]
SUPPLIERS = ["PT Sumber Teknik Global", "PT Distributor Otomasi Prima", "Asia Pacific Automation Ltd",
             "PT Mitra Industri Sejahtera", "Nippon Trading Co."]
ACT_TYPES = ["Call", "WhatsApp", "Email", "Meeting", "Visit", "Presentation", "Follow Up", "Other"]
STAGES = ["Lead", "Qualification", "Proposal", "Negotiation", "Won", "Lost"]
PROB = {"Lead": 10, "Qualification": 25, "Proposal": 50, "Negotiation": 75, "Won": 100, "Lost": 0}
MON_STATUS = ["Waiting Order", "Processing", "Indent", "Ready Stock", "Delivery", "Completed"]


def d(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


async def reset() -> None:
    for coll in ["users", "customers", "products", "opportunities", "quotations",
                 "purchase_orders", "order_monitoring", "activities", "audit_logs", "counters"]:
        await db[coll].delete_many({})


async def seed() -> None:
    await reset()
    pw = hash_password("Password123")

    # --- Users -------------------------------------------------------------
    admin = {"user_id": "USR-0001", "name": "Aripin Nugroho", "email": "admin@crm.co.id",
             "role": "SUPER_ADMIN", "manager_id": None, "manager_name": None, "phone": "0811000001"}
    manager = {"user_id": "USR-0002", "name": "Bambang Setiawan", "email": "manager@crm.co.id",
               "role": "SALES_MANAGER", "manager_id": "USR-0001", "manager_name": admin["name"],
               "phone": "0811000002"}
    sales_names = ["Ahmad Ihwal Fadilah", "Citra Ayu Wulandari", "Dimas Prayoga",
                   "Eka Fitriani", "Fajar Ramadhan"]
    sales_users = [
        {"user_id": f"USR-000{i + 3}", "name": n, "email": f"sales{i + 1}@crm.co.id", "role": "SALES",
         "manager_id": "USR-0002", "manager_name": manager["name"], "phone": f"08110000{i + 3:02d}"}
        for i, n in enumerate(sales_names)
    ]
    all_users = [admin, manager] + sales_users
    await db.users.insert_many([
        {**u, "password_hash": pw, "status": "Active", "must_change_password": False,
         "last_login": None, "created_date": NOW, "updated_date": NOW}
        for u in all_users
    ])
    await db.counters.update_one({"_id": "USR"}, {"$set": {"seq": len(all_users)}}, upsert=True)

    # --- Products ----------------------------------------------------------
    products = []
    for i, (name, brand, cat, unit, price) in enumerate(PRODUCT_DEFS, start=1):
        pid = f"PRD-{i:04d}"
        products.append({
            "product_id": pid, "product_code": f"SKU-{brand[:3].upper()}-{i:03d}", "product_name": name,
            "brand": brand, "category": cat, "description": f"{name} ({brand}) untuk aplikasi industri.",
            "unit": unit, "default_price": price, "supplier": SUPPLIERS[i % len(SUPPLIERS)],
            "distributor": SUPPLIERS[(i + 2) % len(SUPPLIERS)], "status": "Active",
            "created_date": NOW, "updated_date": NOW,
        })
    await db.products.insert_many([dict(p) for p in products])
    await db.counters.update_one({"_id": "PRD"}, {"$set": {"seq": len(products)}}, upsert=True)

    # --- Customers ---------------------------------------------------------
    customers = []
    for i, company in enumerate(COMPANIES, start=1):
        s = sales_users[i % len(sales_users)]
        city, prov = CITIES[i % len(CITIES)]
        customers.append({
            "customer_id": f"CUS-{i:04d}", "customer_name": company, "company": company,
            "industry": INDUSTRIES[i % len(INDUSTRIES)], "address": f"Jl. Industri Raya No. {i * 7}",
            "city": city, "province": prov, "phone": f"021-55{i:04d}",
            "email": f"purchasing{i}@{company.split()[1].lower()}.co.id",
            "pic_name": PIC[i % len(PIC)], "pic_position": "Purchasing Manager",
            "source": SOURCES[i % len(SOURCES)], "sales_id": s["user_id"], "sales_name": s["name"],
            "status": "Active", "notes": "Customer korporat aktif.",
            "created_date": NOW - timedelta(days=120 - i * 3), "updated_date": NOW,
        })
    await db.customers.insert_many([dict(c) for c in customers])
    await db.counters.update_one({"_id": "CUS"}, {"$set": {"seq": len(customers)}}, upsert=True)

    # --- Opportunities -----------------------------------------------------
    opportunities = []
    for i in range(1, 21):
        c = customers[i % len(customers)]
        stage = STAGES[i % len(STAGES)]
        value = float(random.choice([85, 125, 240, 380, 560, 720, 940]) * 1_000_000)
        prob = PROB[stage]
        opportunities.append({
            "opportunity_id": f"OPP-{i:04d}",
            "opportunity_name": f"Proyek Otomasi Line {i} - {c['company'].split()[1]}",
            "customer_id": c["customer_id"], "customer_name": c["customer_name"],
            "sales_id": c["sales_id"], "sales_name": c["sales_name"], "value": value,
            "probability": prob, "weighted_value": round(value * prob / 100, 2), "stage": stage,
            "expected_close_date": d(random.randint(-10, 75)), "source": SOURCES[i % len(SOURCES)],
            "notes": "Kebutuhan upgrade mesin produksi.",
            "created_date": NOW - timedelta(days=90 - i * 2), "updated_date": NOW,
        })
    await db.opportunities.insert_many([dict(o) for o in opportunities])
    await db.counters.update_one({"_id": "OPP"}, {"$set": {"seq": len(opportunities)}}, upsert=True)

    # --- Quotations --------------------------------------------------------
    year = TODAY.year
    quotations = []
    qt_statuses = ["Draft", "Sent", "Negotiation", "Approved", "Rejected", "Expired"]
    for i in range(1, 21):
        opp = opportunities[i % len(opportunities)]
        items = []
        subtotal = 0.0
        for k in range(random.randint(2, 4)):
            p = products[(i * 3 + k) % len(products)]
            qty = float(random.randint(1, 8))
            line = round(qty * p["default_price"], 2)
            subtotal += line
            items.append({
                "quotation_item_id": f"QTI-{k + 1:03d}", "product_id": p["product_id"],
                "description": p["product_name"], "qty": qty, "unit": p["unit"],
                "unit_price": p["default_price"], "discount": 0, "subtotal": line,
            })
        discount = round(subtotal * 0.02, 2)
        tax = round((subtotal - discount) * 0.11, 2)
        quotations.append({
            "quotation_id": f"QTN-{i:04d}", "quotation_number": f"QT-{year}-{i:04d}",
            "quotation_date": d(-random.randint(5, 60)), "customer_id": opp["customer_id"],
            "customer_name": opp["customer_name"], "opportunity_id": opp["opportunity_id"],
            "sales_id": opp["sales_id"], "sales_name": opp["sales_name"],
            "validity_date": d(random.randint(5, 40)), "payment_term": "30 hari setelah invoice",
            "delivery_term": "4-6 minggu setelah PO", "notes": "Harga belum termasuk instalasi.",
            "items": items, "subtotal": round(subtotal, 2), "discount": discount,
            "tax_percent": 11, "tax": tax, "grand_total": round(subtotal - discount + tax, 2),
            "status": "Converted" if i <= 10 else qt_statuses[i % len(qt_statuses)],
            "created_date": NOW - timedelta(days=70 - i * 2), "updated_date": NOW,
        })
    await db.quotations.insert_many([dict(q) for q in quotations])
    await db.counters.update_one({"_id": "QTN"}, {"$set": {"seq": len(quotations)}}, upsert=True)
    await db.counters.update_one({"_id": f"QT-{year}"}, {"$set": {"seq": len(quotations)}}, upsert=True)

    # --- Purchase Orders (converted from the first 10 quotations) ----------
    pos = []
    po_statuses = ["Received", "Confirmed", "Processing", "Completed", "Draft"]
    for i in range(1, 11):
        qt = quotations[i - 1]
        po_items = [{
            "po_item_id": f"POI-{k + 1:03d}", "product_id": it["product_id"],
            "description": it["description"], "qty": it["qty"], "unit": it["unit"],
            "unit_price": it["unit_price"], "subtotal": it["subtotal"],
        } for k, it in enumerate(qt["items"])]
        pos.append({
            "po_id": f"POR-{i:04d}", "po_number": f"PO-{year}-{i:04d}", "po_date": d(-random.randint(1, 40)),
            "customer_id": qt["customer_id"], "customer_name": qt["customer_name"],
            "quotation_id": qt["quotation_id"], "quotation_number": qt["quotation_number"],
            "sales_id": qt["sales_id"], "sales_name": qt["sales_name"], "po_value": qt["grand_total"],
            "delivery_address": "Gudang Pusat, Kawasan Industri MM2100",
            "payment_term": qt["payment_term"], "notes": f"Dikonversi dari {qt['quotation_number']}",
            "status": po_statuses[i % len(po_statuses)], "items": po_items, "document_name": None,
            "created_date": NOW - timedelta(days=40 - i * 2), "updated_date": NOW,
        })
    await db.purchase_orders.insert_many([dict(p) for p in pos])
    await db.counters.update_one({"_id": "POR"}, {"$set": {"seq": len(pos)}}, upsert=True)
    await db.counters.update_one({"_id": f"PO-{year}"}, {"$set": {"seq": len(pos)}}, upsert=True)

    # --- Order Monitoring (mixed ETA so On Time / Due Soon / Overdue all show) ---
    monitoring = []
    eta_offsets = [-12, -5, -2, 1, 2, 3, 9, 18, 27, 40]
    for i in range(1, 11):
        po = pos[(i - 1) % len(pos)]
        it = po["items"][0]
        status = MON_STATUS[i % len(MON_STATUS)]
        monitoring.append({
            "monitoring_id": f"MON-{i:04d}", "po_id": po["po_id"], "po_number": po["po_number"],
            "customer_id": po["customer_id"], "customer_name": po["customer_name"],
            "sales_id": po["sales_id"], "sales_name": po["sales_name"],
            "product_id": it["product_id"], "product_name": it["description"], "qty": it["qty"],
            "status": status, "supplier": SUPPLIERS[i % len(SUPPLIERS)],
            "distributor": SUPPLIERS[(i + 1) % len(SUPPLIERS)], "eta": d(eta_offsets[i - 1]),
            "actual_delivery_date": d(eta_offsets[i - 1]) if status == "Completed" else None,
            "notes": "Menunggu konfirmasi pengiriman dari principal.",
            "last_update": NOW, "created_date": NOW - timedelta(days=30 - i), "updated_date": NOW,
        })
    await db.order_monitoring.insert_many([dict(m) for m in monitoring])
    await db.counters.update_one({"_id": "MON"}, {"$set": {"seq": len(monitoring)}}, upsert=True)

    # --- Activities --------------------------------------------------------
    activities = []
    for i in range(1, 51):
        c = customers[i % len(customers)]
        if i % 4 == 0:
            adate, follow, status = d(0), d(random.randint(2, 10)), "Open"
        elif i % 4 == 1:
            adate, follow, status = d(-random.randint(3, 20)), d(-random.randint(1, 8)), "Open"
        elif i % 4 == 2:
            adate, follow, status = d(-random.randint(1, 30)), None, "Completed"
        else:
            adate, follow, status = d(-random.randint(0, 5)), d(random.randint(1, 14)), "Open"
        activities.append({
            "activity_id": f"ACT-{i:04d}", "sales_id": c["sales_id"], "sales_name": c["sales_name"],
            "customer_id": c["customer_id"], "customer_name": c["customer_name"],
            "opportunity_id": opportunities[i % len(opportunities)]["opportunity_id"],
            "activity_type": ACT_TYPES[i % len(ACT_TYPES)], "activity_date": adate,
            "subject": f"Follow up penawaran {c['company'].split()[1]} #{i}",
            "description": "Diskusi spesifikasi teknis dan skema pembayaran.",
            "next_followup": follow, "status": status,
            "created_date": NOW - timedelta(days=50 - i), "updated_date": NOW,
        })
    await db.activities.insert_many([dict(a) for a in activities])
    await db.counters.update_one({"_id": "ACT"}, {"$set": {"seq": len(activities)}}, upsert=True)

    # --- Audit log ---------------------------------------------------------
    logs = []
    for i, po in enumerate(pos[:6], start=1):
        logs.append({
            "user_id": admin["user_id"], "user_name": admin["name"], "action": "UPDATE",
            "module": "PO", "record_id": po["po_number"],
            "old_value": "Status: Processing", "new_value": f"Status: {po['status']}",
            "timestamp": NOW - timedelta(hours=i * 5),
        })
    for i, q in enumerate(quotations[:6], start=1):
        logs.append({
            "user_id": q["sales_id"], "user_name": q["sales_name"], "action": "CREATE",
            "module": "Quotation", "record_id": q["quotation_number"],
            "old_value": None, "new_value": str(q["grand_total"]),
            "timestamp": NOW - timedelta(hours=i * 9),
        })
    await db.audit_logs.insert_many(logs)

    print("Seed selesai:")
    for coll in ["users", "customers", "products", "opportunities", "quotations",
                 "purchase_orders", "order_monitoring", "activities", "audit_logs"]:
        print(f"  {coll}: {await db[coll].count_documents({})}")


if __name__ == "__main__":
    try:
        asyncio.run(seed())
    finally:
        client.close()
