#!/usr/bin/env python3
"""
Quick sync: MariaDB -> Supabase REST API.
Run after testing to see all changes in Supabase dashboard.

Usage:
  python sync_to_supabase.py                    # sync all tables
  python sync_to_supabase.py --tables users merchant_profiles  # sync specific tables
"""

import argparse
import json
import logging
import os
import sys
import urllib.request
import urllib.error
import ssl
import time
from typing import Any

try:
    import pymysql
    import pymysql.cursors
except ImportError:
    raise SystemExit("pip install PyMySQL")

SUPABASE_URL = "https://grbbtgfvgwxtkgxtakug.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyYmJ0Z2Z2Z3d4dGtneHRha3VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzE2MTA2NywiZXhwIjoyMDcyNzM3MDY3fQ.2p5X36snvOo90_37wztsZyt89vhsj-jg1LpE-4W8NnY"

SSL_CTX = ssl.create_default_context()

TABLES = [
    "users", "user_roles", "product_catalog", "product_sub_catalog",
    "merchant_profiles", "merchant_bank_details", "merchant_kyc",
    "merchant_persons", "merchant_documents", "merchant_invitations",
    "merchant_agreements", "merchant_sub_products",
    "distributor_profiles", "employee_profiles",
    "transactions", "settlement_history", "rolling_reserve_ledger",
    "chargebacks", "chargeback_history", "distributor_recovery_history",
    "notifications", "application_status_history",
    "document_validations", "support_kyc_actions",
    "tickets", "ticket_messages",
]

COLUMN_MAP = {
    "users": {"password_hash": "password", "full_name": "name"},
    "user_roles": {"role_id": "role"},
    "product_sub_catalog": {"product_code": "sub_product_code", "product_name": "sub_product_name", "product_description": "sub_product_description"},
    "transactions": {"transaction_id": "txn_id"},
    "chargeback_history": {"event_timestamp": "timestamp"},
    "notifications": {"is_read": "read"},
    "document_validations": {"document_id": "merchant_document_id", "document_type": "check_type", "merchant_id": "merchant_profile_id", "validation_type": "check_result"},
}

REVERSE_NULL_OVERRIDES = {
    "merchant_invitations": {"merchant_email"},
    "tickets": {"module", "priority"},
    "document_validations": {"is_valid"},
}

# Supabase enum constraints - only allow these values
SUPA_ENUM_FILTERS = {
    "merchant_profiles": {
        "onboarding_status": {"agreement_pending", "agreement_signed", "approved", "cpv_pending", "cpv_verified", "in_progress", "pending", "pending_bank_approval", "rejected", "submitted"},
    },
    "user_roles": {
        "role": {"admin", "distributor", "employee", "merchant"},
    },
}


def get_supa_columns(table: str) -> list[str]:
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=*&limit=1"
    req = urllib.request.Request(url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
    try:
        resp = urllib.request.urlopen(req, context=SSL_CTX, timeout=10)
        data = json.loads(resp.read())
        return list(data[0].keys()) if data else []
    except Exception:
        return []


def supa_upsert(table: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    batch_size = 50
    inserted = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        body = json.dumps(batch, default=str).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        })
        try:
            resp = urllib.request.urlopen(req, context=SSL_CTX, timeout=30)
            inserted += len(batch)
        except urllib.error.HTTPError as e:
            err = e.read().decode()
            logging.error("Upsert %s batch %d failed: %s - %s", table, i//batch_size, e.code, err[:200])
        time.sleep(0.1)
    return inserted


def sync_table(maria, table: str) -> int:
    col_map = COLUMN_MAP.get(table, {})
    null_ignores = REVERSE_NULL_OVERRIDES.get(table, set())
    enum_filters = SUPA_ENUM_FILTERS.get(table, {})

    # Get Supabase columns to filter
    supa_cols = get_supa_columns(table)
    if not supa_cols:
        logging.warning("%s: could not detect Supabase columns, trying with all MariaDB columns", table)

    cur = maria.cursor(pymysql.cursors.DictCursor)
    cur.execute(f"SELECT * FROM `{table}`")
    rows = cur.fetchall()
    cur.close()

    if not rows:
        logging.info("%s: 0 rows in MariaDB, skipping", table)
        return 0

    # Map column names back to Supabase format, filter to Supabase columns only
    supa_rows = []
    skipped = 0
    for row in rows:
        mapped = {}
        skip = False
        for maria_col, val in row.items():
            supa_col = col_map.get(maria_col, maria_col)
            if supa_cols and supa_col not in supa_cols:
                continue
            if supa_col in null_ignores and val is None:
                continue
            if val is None:
                continue
            # Check enum constraints
            if supa_col in enum_filters:
                if val not in enum_filters[supa_col]:
                    skip = True
                    break
            # Parse JSON strings to proper JSON for Supabase
            if isinstance(val, str) and val.startswith('[') and supa_col in ('selected_products', 'transaction_refs', 'recovery_steps', 'metadata'):
                try:
                    val = json.loads(val)
                except (json.JSONDecodeError, ValueError):
                    pass
            mapped[supa_col] = val
        if skip:
            skipped += 1
            continue
        supa_rows.append(mapped)

    # Ensure all rows have same keys
    if supa_rows:
        all_keys = set()
        for r in supa_rows:
            all_keys.update(r.keys())
        for r in supa_rows:
            for k in all_keys:
                if k not in r:
                    r[k] = None

    count = supa_upsert(table, supa_rows)
    logging.info("%s: synced %d rows to Supabase (skipped %d)", table, count, skipped)
    return count


def main():
    parser = argparse.ArgumentParser(description="Sync MariaDB data to Supabase REST API")
    parser.add_argument("--tables", nargs="*", help="Sync only these tables")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                       format="%(asctime)s %(levelname)s %(message)s")

    maria = pymysql.connect(
        host="34.47.168.236", port=7306, database="sabbpeonboarding",
        user="sbuser", password="KMmTKeK7yh77odw51gK12f",
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
    )

    tables = args.tables if args.tables else TABLES
    total = 0
    for table in tables:
        try:
            count = sync_table(maria, table)
            total += count
        except Exception as e:
            logging.error("%s: FAILED - %s", table, e)

    maria.close()
    logging.info("Sync complete. Total rows synced: %d", total)
    return 0


if __name__ == "__main__":
    sys.exit(main())
