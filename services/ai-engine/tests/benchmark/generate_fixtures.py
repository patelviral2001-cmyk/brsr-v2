"""Generate ~110 synthetic ESG fixtures with ground-truth JSON sidecars.

Run with::

    python -m tests.benchmark.generate_fixtures

Each fixture is a text file (mimicking PDF-to-text or CSV extraction) plus
a ``.json`` sidecar containing the expected metric values.

Categories produced:
  * electricity_bills/  – 30 fixtures (tata, adani, mgvcl, torrent, generic)
  * fuel_records/       – 25 fixtures (CSV-style diesel/petrol invoices)
  * water_bills/        – 15 fixtures (municipal + borewell)
  * hr_files/           – 25 fixtures (employee master + training reports)
  * waste_records/      – 15 fixtures (waste manifests)

Determinism: a fixed RNG seed keeps the fixtures stable so the benchmark
is reproducible.
"""
from __future__ import annotations

import json
import os
import random
from datetime import date, timedelta
from pathlib import Path

BASE = Path(__file__).parent / "fixtures"
RNG = random.Random(20240618)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def comma(n: float) -> str:
    if isinstance(n, int) or float(n).is_integer():
        return f"{int(n):,}"
    return f"{n:,.2f}"


def period_dates(month_idx: int, year: int) -> tuple[date, date]:
    start = date(year, month_idx, 1)
    if month_idx == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, month_idx + 1, 1) - timedelta(days=1)
    return start, end


def write_pair(path: Path, content: str, gt: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    gt_path = path.with_suffix(".json")
    gt_path.write_text(json.dumps(gt, indent=2, default=str), encoding="utf-8")


# ---------------------------------------------------------------------------
# Electricity bills
# ---------------------------------------------------------------------------

TATA_TEMPLATE = """\
TATA POWER COMPANY LIMITED — MUMBAI
Distribution Licence: MERC / Mumbai
GSTIN: 27AAACT0054A1Z5
================================================================

Consumer Name : {consumer}
Consumer No.  : {consumer_no}
Service No.   : {service_no}
Connected Load: {load} kW
Tariff Category: LTMD-IV (Commercial)

Billing Period: 01 {m_start} {yr} to {d_end} {m_end} {yr}
Bill Date     : 05 {m_next} {yr_next}
Due Date      : 25 {m_next} {yr_next}

ENERGY CONSUMPTION SUMMARY
- Previous Reading : {prev:,} kWh
- Current Reading  : {cur:,} kWh
- Total Units Consumed: {units:,} kWh
- Power Factor     : {pf:.2f}
- Maximum Demand   : {md:.1f} kVA

TARIFF CALCULATION
Energy charges  : Rs {ec:,.2f}
Fixed charges   : Rs {fc:,.2f}
Fuel adjustment : Rs {fa:,.2f}
Electricity duty: Rs {ed:,.2f}
Total amount due: Rs {total:,.2f}
"""


def make_tata(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.choice([4, 5, 6, 7, 8, 9, 10, 11])
    units = RNG.randint(15000, 60000)
    prev = RNG.randint(100_000, 800_000)
    cur = prev + units
    pf = RNG.uniform(0.93, 0.99)
    md = RNG.uniform(60.0, 220.0)
    ec = units * RNG.uniform(7.5, 9.2)
    fc = RNG.uniform(5000, 20000)
    fa = ec * RNG.uniform(0.05, 0.18)
    ed = (ec + fa) * 0.16
    total = ec + fc + fa + ed
    next_m = month + 1 if month < 12 else 1
    next_y = year if month < 12 else year + 1
    start, end = period_dates(month, year)
    body = TATA_TEMPLATE.format(
        consumer=f"ACME INDUSTRIES PVT LTD UNIT {idx}",
        consumer_no=f"90000{idx:05d}",
        service_no=f"S-{RNG.randint(10000, 99999)}",
        load=RNG.choice([100, 150, 200, 250, 350, 500]),
        m_start=MONTHS[month - 1], yr=year,
        d_end=end.day, m_end=MONTHS[month - 1],
        m_next=MONTHS[next_m - 1], yr_next=next_y,
        prev=prev, cur=cur, units=units, pf=pf, md=md,
        ec=ec, fc=fc, fa=fa, ed=ed, total=total,
    )
    gt = {
        "doc_type": "UTILITY_BILL",
        "fields": {
            "electricity_kwh": units,
            "period_start": str(start),
            "period_end": str(end),
        },
    }
    return body, gt


ADANI_TEMPLATE = """\
ADANI ELECTRICITY MUMBAI LIMITED
A unit of Adani Transmission Limited
================================================================
Bill For      : {consumer}
Consumer No.  : {consumer_no}
Cycle         : {cycle}
Billing Month : {month} {year}
Energy Consumed (kWh): {units:,}
Power Factor  : {pf:.2f}
Sanctioned Load: {load} kW
Demand (kVA)  : {md:.0f}
Tariff Category: LTMD - HT Industrial
Energy Charges (Rs): {ec:,.2f}
Net Amount Payable (Rs): {total:,.2f}
"""


def make_adani(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    units = RNG.randint(20000, 80000)
    pf = RNG.uniform(0.90, 0.99)
    md = RNG.uniform(80, 260)
    ec = units * RNG.uniform(8.0, 10.5)
    total = ec * RNG.uniform(1.18, 1.28)
    start, end = period_dates(month, year)
    body = ADANI_TEMPLATE.format(
        consumer=f"BLUE STAR MANUFACTURING UNIT-{idx}",
        consumer_no=f"15000{idx:05d}",
        cycle=f"C{RNG.randint(1, 12)}",
        month=MONTHS[month - 1], year=year, units=units, pf=pf,
        load=RNG.choice([200, 300, 500, 750]), md=md, ec=ec, total=total,
    )
    gt = {
        "doc_type": "UTILITY_BILL",
        "fields": {
            "electricity_kwh": units,
            "period_start": str(start),
            "period_end": str(end),
        },
    }
    return body, gt


MGVCL_TEMPLATE = """\
MADHYA GUJARAT VIJ COMPANY LIMITED (MGVCL)
================================================================
Consumer Name : {consumer}
Consumer Number: {consumer_no}
Service Connection: HT-{conn}
Reading Period: {p_start} to {p_end}
Units Consumed: {units:,} kWh
Sanctioned Demand: {load} kVA
Recorded Demand : {md:.1f} kVA
Energy charges  : Rs. {ec:,.2f}
Electricity Duty: Rs. {ed:,.2f}
Total Payable   : Rs. {total:,.2f}
"""


def make_mgvcl(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    units = RNG.randint(8000, 50000)
    md = RNG.uniform(50, 200)
    ec = units * RNG.uniform(6.5, 8.5)
    ed = ec * 0.20
    total = ec + ed
    start, end = period_dates(month, year)
    body = MGVCL_TEMPLATE.format(
        consumer=f"VADODARA POLYMERS PVT LTD {idx}",
        consumer_no=f"GUJ{idx:06d}",
        conn=RNG.randint(1000, 9999),
        p_start=f"{start.day} {MONTHS[month - 1][:3]} {year}",
        p_end=f"{end.day} {MONTHS[month - 1][:3]} {year}",
        units=units,
        load=RNG.choice([100, 150, 250, 400]),
        md=md, ec=ec, ed=ed, total=total,
    )
    gt = {
        "doc_type": "UTILITY_BILL",
        "fields": {
            "electricity_kwh": units,
            "period_start": str(start),
            "period_end": str(end),
        },
    }
    return body, gt


TORRENT_TEMPLATE = """\
TORRENT POWER LTD — AHMEDABAD DISTRIBUTION
================================================================
Customer: {consumer}
A/c Number: {acct}
Billing Period: {p_start} - {p_end}
Total Units Consumed: {units:,} kWh
Sanctioned Load: {load} kW
Avg. Power Factor: {pf:.3f}
Bill Amount (INR): {total:,.2f}
"""


def make_torrent(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    units = RNG.randint(5000, 40000)
    pf = RNG.uniform(0.92, 0.99)
    total = units * RNG.uniform(8, 11)
    start, end = period_dates(month, year)
    body = TORRENT_TEMPLATE.format(
        consumer=f"AMBA TEXTILES UNIT {idx}",
        acct=f"TOR-{RNG.randint(10000, 99999)}",
        p_start=f"{start.day}-{MONTHS[month - 1][:3]}-{year}",
        p_end=f"{end.day}-{MONTHS[month - 1][:3]}-{year}",
        units=units,
        load=RNG.choice([75, 150, 300, 450]),
        pf=pf, total=total,
    )
    gt = {
        "doc_type": "UTILITY_BILL",
        "fields": {
            "electricity_kwh": units,
            "period_start": str(start),
            "period_end": str(end),
        },
    }
    return body, gt


GENERIC_TEMPLATE = """\
{utility_name}
TAX INVOICE / ELECTRICITY BILL
================================================================
Consumer: {consumer}
Connection Number: {acct}
Billing Period: {p_start} to {p_end}

Total Units Consumed: {units:,} kWh
Sanctioned Load: {load} kW
Maximum Demand Recorded: {md:.1f} kVA
Power Factor: {pf:.2f}

Energy Charges: INR {ec:,.2f}
Fixed Charges: INR {fc:,.2f}
Total Amount Due: INR {total:,.2f}
"""

GENERIC_UTILITIES = [
    "BSES RAJDHANI POWER LTD",
    "CESC LIMITED",
    "MAHADISCOM (MSEDCL)",
    "NDPL — TATA POWER DELHI DISTRIBUTION",
    "JAIPUR VIDYUT VITRAN NIGAM LTD (JVVNL)",
    "DAKSHIN HARYANA BIJLI VITRAN NIGAM (DHBVN)",
    "TANGEDCO — TAMIL NADU GENERATION & DISTRIBUTION",
    "PASCHIM GUJARAT VIJ COMPANY (PGVCL)",
    "UTTAR PRADESH POWER CORPORATION LTD (UPPCL)",
    "BANGALORE ELECTRICITY SUPPLY COMPANY (BESCOM)",
]


def make_generic(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    units = RNG.randint(2000, 90000)
    pf = RNG.uniform(0.88, 0.99)
    md = RNG.uniform(30, 300)
    ec = units * RNG.uniform(6, 12)
    fc = RNG.uniform(3000, 30000)
    total = ec + fc
    start, end = period_dates(month, year)
    body = GENERIC_TEMPLATE.format(
        utility_name=GENERIC_UTILITIES[idx % len(GENERIC_UTILITIES)],
        consumer=f"INDUSTRIAL CUSTOMER {idx:03d}",
        acct=f"GEN-{RNG.randint(100000, 999999)}",
        p_start=f"{start.day}-{MONTHS[month - 1][:3]}-{year}",
        p_end=f"{end.day}-{MONTHS[month - 1][:3]}-{year}",
        units=units,
        load=RNG.choice([50, 100, 200, 400, 600, 800]),
        pf=pf, md=md, ec=ec, fc=fc, total=total,
    )
    gt = {
        "doc_type": "UTILITY_BILL",
        "fields": {
            "electricity_kwh": units,
            "period_start": str(start),
            "period_end": str(end),
        },
    }
    return body, gt


def write_electricity_bills() -> int:
    n = 0
    for i in range(5):
        body, gt = make_tata(i + 1)
        write_pair(BASE / "electricity_bills" / f"tata_power_mumbai_{i+1:02d}.txt", body, gt)
        n += 1
    for i in range(5):
        body, gt = make_adani(i + 1)
        write_pair(BASE / "electricity_bills" / f"adani_electricity_{i+1:02d}.txt", body, gt)
        n += 1
    for i in range(5):
        body, gt = make_mgvcl(i + 1)
        write_pair(BASE / "electricity_bills" / f"mgvcl_{i+1:02d}.txt", body, gt)
        n += 1
    for i in range(5):
        body, gt = make_torrent(i + 1)
        write_pair(BASE / "electricity_bills" / f"torrent_power_{i+1:02d}.txt", body, gt)
        n += 1
    for i in range(10):
        body, gt = make_generic(i + 1)
        write_pair(BASE / "electricity_bills" / f"generic_industrial_{i+1:02d}.txt", body, gt)
        n += 1
    return n


# ---------------------------------------------------------------------------
# Fuel records (CSV-style diesel invoices)
# ---------------------------------------------------------------------------

FUEL_TEMPLATE_CSV = """\
INDIAN OIL CORPORATION LTD - INDUSTRIAL FUEL SUPPLY DIVISION
Customer: {consumer}
Customer Code: {code}
Invoice Period: {p_start} to {p_end}

Invoice No,Product,Quantity (litres),Rate (INR/L),Amount (INR),Density,Tank
{rows}

Total diesel (HSD) consumed: {qty:,} litres
GST @ 5%: {gst:,.2f}
Total Amount: {total:,.2f}
"""


def make_fuel(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    product = RNG.choice(["HSD - High Speed Diesel", "Diesel"])
    qty_total = 0.0
    rows = []
    for r in range(RNG.randint(3, 7)):
        q = RNG.randint(500, 5000)
        rate = RNG.uniform(86, 96)
        amt = q * rate
        rows.append(
            f"INV{idx:03d}{r:02d},{product},{q},{rate:.2f},{amt:.2f},0.832,T{RNG.randint(1, 9)}"
        )
        qty_total += q
    gst = qty_total * 90 * 0.05
    total = qty_total * 90 + gst
    start, end = period_dates(month, year)
    body = FUEL_TEMPLATE_CSV.format(
        consumer=f"ACME LOGISTICS - DEPOT {idx}",
        code=f"IOC-{RNG.randint(1000, 9999)}",
        p_start=str(start),
        p_end=str(end),
        rows="\n".join(rows),
        qty=int(qty_total),
        gst=gst,
        total=total,
    )
    gt = {
        "doc_type": "FUEL_INVOICE",
        "fields": {
            "diesel_l": int(qty_total),
            "period_start": str(start),
            "period_end": str(end),
        },
    }
    return body, gt


PETROL_TEMPLATE = """\
HINDUSTAN PETROLEUM CORPORATION LTD
FLEET CARD STATEMENT
Customer: {consumer}
Card No.: {card}
Statement Period: {p_start} to {p_end}

Date,Vehicle,Product,Litres,Rate,Amount
{rows}

Total Petrol (MS) Consumed: {qty:,} litres
Total Diesel Consumed: {dqty:,} litres
"""


def make_petrol(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    pqty = 0
    dqty = 0
    rows = []
    for r in range(RNG.randint(5, 12)):
        product = RNG.choice(["MS (Petrol)", "HSD (Diesel)"])
        q = RNG.randint(20, 150)
        rate = RNG.uniform(95, 110) if "MS" in product else RNG.uniform(86, 96)
        rows.append(
            f"{year}-{month:02d}-{RNG.randint(1, 28):02d},V{RNG.randint(1, 99):02d},{product},{q},{rate:.2f},{q*rate:.2f}"
        )
        if "MS" in product:
            pqty += q
        else:
            dqty += q
    start, end = period_dates(month, year)
    body = PETROL_TEMPLATE.format(
        consumer=f"FLEET OPERATIONS UNIT {idx}",
        card=f"HPCL{RNG.randint(10000, 99999)}",
        p_start=str(start), p_end=str(end),
        rows="\n".join(rows), qty=pqty, dqty=dqty,
    )
    fields: dict = {
        "petrol_l": pqty,
        "diesel_l": dqty,
        "period_start": str(start),
        "period_end": str(end),
    }
    gt = {"doc_type": "FUEL_INVOICE", "fields": fields}
    return body, gt


def write_fuel_records() -> int:
    n = 0
    for i in range(15):
        body, gt = make_fuel(i + 1)
        write_pair(BASE / "fuel_records" / f"diesel_invoice_{i+1:02d}.txt", body, gt)
        n += 1
    for i in range(10):
        body, gt = make_petrol(i + 1)
        write_pair(BASE / "fuel_records" / f"petrol_fleet_{i+1:02d}.txt", body, gt)
        n += 1
    return n


# ---------------------------------------------------------------------------
# Water bills
# ---------------------------------------------------------------------------

MUNI_WATER = """\
MUNICIPAL WATER SUPPLY DEPARTMENT
{municipality}
================================================================
Consumer: {consumer}
Connection No: {conn}
Billing Period: {p_start} - {p_end}

Previous Reading: {prev:,} kL
Current Reading : {cur:,} kL
Total water withdrawn: {kl:,} kL
Source: Third Party (Municipal Supply)

Water Charges: INR {wc:,.2f}
Sewerage Charges: INR {sc:,.2f}
Amount Payable: INR {total:,.2f}
"""

BORE_WATER = """\
BOREWELL EXTRACTION RECORD
Facility: {facility}
Permit No.: {permit}
Period: {p_start} to {p_end}

Source: Groundwater (Borewell)
Total water withdrawn — Groundwater: {kl:,} kL
Total water discharged: {dis:,} kL
Total water recycled: {rec:,} kL
"""


def make_water(idx: int, kind: str) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    kl = RNG.randint(500, 10000)
    start, end = period_dates(month, year)
    if kind == "muni":
        prev = RNG.randint(50000, 300000)
        cur = prev + kl
        wc = kl * RNG.uniform(15, 35)
        sc = wc * 0.5
        total = wc + sc
        body = MUNI_WATER.format(
            municipality=RNG.choice([
                "Brihanmumbai Municipal Corporation",
                "Pune Municipal Corporation",
                "Surat Municipal Corporation",
                "Bengaluru Water Supply",
            ]),
            consumer=f"INDUSTRIAL CUSTOMER {idx:03d}",
            conn=f"W-{RNG.randint(10000, 99999)}",
            p_start=str(start), p_end=str(end),
            prev=prev, cur=cur, kl=kl, wc=wc, sc=sc, total=total,
        )
        gt = {
            "doc_type": "WATER_BILL",
            "fields": {
                "water_withdrawn_third_party_kl": kl,
                "water_withdrawn_total_kl": kl,
                "period_start": str(start),
                "period_end": str(end),
            },
        }
    else:
        dis = int(kl * RNG.uniform(0.4, 0.7))
        rec = int(kl * RNG.uniform(0.15, 0.45))
        body = BORE_WATER.format(
            facility=f"PLANT {idx}",
            permit=f"CGWA/PER/{RNG.randint(1000, 9999)}",
            p_start=str(start), p_end=str(end),
            kl=kl, dis=dis, rec=rec,
        )
        gt = {
            "doc_type": "WATER_BILL",
            "fields": {
                "water_withdrawn_groundwater_kl": kl,
                "water_discharged_kl": dis,
                "water_recycled_kl": rec,
                "period_start": str(start),
                "period_end": str(end),
            },
        }
    return body, gt


def write_water_bills() -> int:
    n = 0
    for i in range(8):
        body, gt = make_water(i + 1, "muni")
        write_pair(BASE / "water_bills" / f"municipal_{i+1:02d}.txt", body, gt)
        n += 1
    for i in range(7):
        body, gt = make_water(i + 1, "bore")
        write_pair(BASE / "water_bills" / f"borewell_{i+1:02d}.txt", body, gt)
        n += 1
    return n


# ---------------------------------------------------------------------------
# HR files
# ---------------------------------------------------------------------------

HR_TEMPLATE = """\
EMPLOYEE MASTER REPORT - FY{year_label}
Organisation: {org}
Generated: {gen_date}
================================================================

Total Employees: {total}
Male Employees: {male}
Female Employees: {female}
Permanent Employees: {permanent}
Contract Workers: {contract}
Trainees: {trainees}
Persons with Disabilities: {pwd}

Women in Management (%): {wim:.1f}%
Attrition Rate (%): {atr:.1f}%

Employee ID, Name, Gender, Designation, DOJ
{emp_rows}
"""


def make_hr(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    total = RNG.randint(80, 1200)
    female = int(total * RNG.uniform(0.18, 0.42))
    male = total - female - RNG.randint(0, 4)
    permanent = int(total * RNG.uniform(0.7, 0.95))
    contract = RNG.randint(20, 200)
    trainees = RNG.randint(0, 40)
    pwd = RNG.randint(0, int(total * 0.04))
    wim = RNG.uniform(8.0, 32.0)
    atr = RNG.uniform(5.0, 22.0)
    emp_rows = []
    for r in range(8):
        emp_rows.append(
            f"E{RNG.randint(1000, 9999)},Employee {r+1},{RNG.choice(['M', 'F'])},"
            f"{RNG.choice(['Engineer', 'Manager', 'Analyst', 'Technician'])},"
            f"{year - RNG.randint(0, 8)}-{RNG.randint(1, 12):02d}-{RNG.randint(1, 28):02d}"
        )
    body = HR_TEMPLATE.format(
        year_label=f"{year}-{(year+1) % 100:02d}",
        org=f"TECHNOCORE INDUSTRIES UNIT {idx}",
        gen_date=f"{year}-06-30",
        total=total, male=male, female=female, permanent=permanent,
        contract=contract, trainees=trainees, pwd=pwd,
        wim=wim, atr=atr,
        emp_rows="\n".join(emp_rows),
    )
    gt = {
        "doc_type": "HR_HEADCOUNT_SHEET",
        "fields": {
            "employee_count_total": total,
            "employee_count_male": male,
            "employee_count_female": female,
            "employee_count_permanent": permanent,
            "contract_workers_count": contract,
            "trainees_count": trainees,
            "employee_count_pwd": pwd,
        },
    }
    return body, gt


TRAINING_TEMPLATE = """\
TRAINING & DEVELOPMENT REPORT
Period: {p_start} to {p_end}
Organisation: {org}
================================================================

Total training hours: {total_hours:,}
Health & Safety training hours: {hs_hours:,}
Skill upgrade training hours: {su_hours:,}
Human Rights training hours: {hr_hours:,}
Training coverage (%): {coverage:.1f}%
"""


def make_training(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    total = RNG.randint(2000, 50000)
    hs = int(total * RNG.uniform(0.15, 0.35))
    su = int(total * RNG.uniform(0.35, 0.55))
    hr = int(total * RNG.uniform(0.05, 0.20))
    coverage = RNG.uniform(45, 95)
    start = date(year, 4, 1)
    end = date(year + 1, 3, 31)
    body = TRAINING_TEMPLATE.format(
        p_start=str(start), p_end=str(end),
        org=f"TECHNOCORE INDUSTRIES UNIT {idx}",
        total_hours=total, hs_hours=hs, su_hours=su, hr_hours=hr,
        coverage=coverage,
    )
    gt = {
        "doc_type": "HR_HEADCOUNT_SHEET",
        "fields": {
            "training_hours_total": total,
            "training_hours_health_safety": hs,
            "training_hours_skill_upgrade": su,
            "training_hours_human_rights": hr,
        },
    }
    return body, gt


def write_hr_files() -> int:
    n = 0
    for i in range(15):
        body, gt = make_hr(i + 1)
        write_pair(BASE / "hr_files" / f"employee_master_{i+1:02d}.txt", body, gt)
        n += 1
    for i in range(10):
        body, gt = make_training(i + 1)
        write_pair(BASE / "hr_files" / f"training_report_{i+1:02d}.txt", body, gt)
        n += 1
    return n


# ---------------------------------------------------------------------------
# Waste records
# ---------------------------------------------------------------------------

WASTE_TEMPLATE = """\
HAZARDOUS WASTE MANIFEST — FORM 10
{tsdf}
================================================================
Generator Facility: {facility}
Waste Generator CIN: {cin}
Manifest Period: {p_start} to {p_end}

Waste Category, Quantity (kg), Disposal Method
Hazardous waste, {hw}, Incineration
Non-hazardous waste, {nh}, Landfill
E-waste, {ew}, Recycling
Plastic waste, {pw}, Recycling
Battery waste, {bw}, Recycling

Total Hazardous waste: {hw} kg
Total Non-hazardous waste: {nh} kg
Waste recycled: {wr} kg
Waste sent to landfill: {wl} kg
Waste sent to incineration: {wi} kg
"""


def make_waste(idx: int) -> tuple[str, dict]:
    year = RNG.choice([2024, 2025])
    month = RNG.randint(1, 12)
    hw = RNG.randint(200, 8000)
    nh = RNG.randint(500, 25000)
    ew = RNG.randint(20, 400)
    pw = RNG.randint(50, 1000)
    bw = RNG.randint(10, 200)
    wr = ew + pw + bw + int(nh * RNG.uniform(0.1, 0.4))
    wl = int((nh - wr) * RNG.uniform(0.3, 0.6))
    wi = hw
    start, end = period_dates(month, year)
    body = WASTE_TEMPLATE.format(
        tsdf=RNG.choice([
            "Mumbai Waste Management Ltd",
            "Gujarat Pollution Control Board TSDF",
            "Ramky Enviro Engineers",
            "EcoCare Industrial Services",
        ]),
        facility=f"PLANT {idx}",
        cin=f"U24290MH2002PLC{RNG.randint(100000, 999999)}",
        p_start=str(start), p_end=str(end),
        hw=hw, nh=nh, ew=ew, pw=pw, bw=bw,
        wr=wr, wl=wl, wi=wi,
    )
    gt = {
        "doc_type": "WASTE_MANIFEST",
        "fields": {
            "waste_hazardous_kg": hw,
            "waste_non_hazardous_kg": nh,
            "e_waste_kg": ew,
            "plastic_waste_kg": pw,
            "battery_waste_kg": bw,
            "waste_recycled_kg": wr,
            "waste_to_landfill_kg": wl,
            "waste_to_incineration_kg": wi,
            "period_start": str(start),
            "period_end": str(end),
        },
    }
    return body, gt


def write_waste_records() -> int:
    n = 0
    for i in range(15):
        body, gt = make_waste(i + 1)
        write_pair(BASE / "waste_records" / f"waste_manifest_{i+1:02d}.txt", body, gt)
        n += 1
    return n


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    BASE.mkdir(parents=True, exist_ok=True)
    counts = {
        "electricity_bills": write_electricity_bills(),
        "fuel_records": write_fuel_records(),
        "water_bills": write_water_bills(),
        "hr_files": write_hr_files(),
        "waste_records": write_waste_records(),
    }
    total = sum(counts.values())
    print(f"Generated {total} fixtures:")
    for k, v in counts.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
