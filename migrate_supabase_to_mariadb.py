#!/usr/bin/env python3
"""
Idempotent Supabase -> MariaDB migration for SabbPe.
Uses Supabase REST API (PostgREST) to read data, PyMySQL to write to MariaDB.

Required environment variables:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MARIADB_PASSWORD

Optional environment variables:
  MARIADB_HOST=34.47.168.236, MARIADB_PORT=7306
  MARIADB_DATABASE=sabbpeonboarding, MARIADB_USER=sbuser

Install dependencies:
  pip install PyMySQL
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

try:
    import pymysql
    import pymysql.cursors
except ImportError as exc:
    raise SystemExit("Missing dependency. Install with: pip install PyMySQL") from exc


LOG_FILE = "migration_supabase_to_mariadb.log"
BATCH_SIZE = 1000

ALL_TABLES = [
    "app_role", "users", "user_roles", "refresh_tokens",
    "product_catalog", "product_sub_catalog",
    "merchant_profiles", "merchant_bank_details", "merchant_kyc",
    "merchant_persons", "merchant_documents", "merchant_invitations",
    "merchant_agreements", "merchant_sub_products",
    "distributor_profiles", "employee_profiles",
    "transactions", "settlement_history", "rolling_reserve_ledger",
    "chargebacks", "chargeback_history", "distributor_recovery_history",
    "notifications", "application_status_history", "onboarding_audit_log",
    "chat_audio_logs", "document_validations", "support_kyc_actions",
    "tickets", "ticket_messages", "bank_staff",
]

PREFERRED_TABLE_ORDER = [
    "app_role", "users", "user_roles", "refresh_tokens",
    "product_catalog", "product_sub_catalog",
    "merchant_profiles", "merchant_bank_details", "merchant_kyc",
    "merchant_persons", "merchant_documents", "merchant_invitations",
    "merchant_agreements", "merchant_sub_products",
    "distributor_profiles", "employee_profiles",
    "transactions", "settlement_history", "rolling_reserve_ledger",
    "chargebacks", "chargeback_history", "distributor_recovery_history",
    "notifications", "application_status_history", "onboarding_audit_log",
    "chat_audio_logs", "document_validations", "support_kyc_actions",
    "tickets", "ticket_messages", "bank_staff",
]

SSL_CTX = ssl.create_default_context()

COLUMN_MAP: dict[str, dict[str, str]] = {
    "users": {"password": "password_hash", "name": "full_name"},
    "user_roles": {"role": "role_id"},
    "product_sub_catalog": {"sub_product_code": "product_code", "sub_product_name": "product_name", "sub_product_description": "product_description"},
    "transactions": {"txn_id": "transaction_id"},
    "chargeback_history": {"timestamp": "event_timestamp"},
    "notifications": {"read": "is_read"},
    "document_validations": {"merchant_document_id": "document_id", "check_type": "document_type", "merchant_profile_id": "merchant_id", "check_result": "validation_type"},
}

NULL_OVERRIDES: dict[str, dict[str, Any]] = {
    "merchant_invitations": {"merchant_email": ""},
    "tickets": {"module": "general", "priority": "medium"},
    "document_validations": {"document_type": "unknown", "is_valid": 1, "validation_type": "unknown"},
}


def env(name: str, default: str | None = None, required: bool = False) -> str:
    val = os.getenv(name, default)
    if required and not val:
        raise SystemExit(f"Missing required env var: {name}")
    return val or ""


def setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
        ],
    )


def supa_get(base_url: str, api_key: str, table: str, offset: int, limit: int) -> list[dict]:
    url = f"{base_url}/rest/v1/{table}?select=*&offset={offset}&limit={limit}"
    req = urllib.request.Request(url, headers={
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Prefer": "return=representation",
    })
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, context=SSL_CTX, timeout=30)
            return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                return []
            if e.code == 429:
                wait = 2 ** (attempt + 1)
                logging.warning("Rate limited on %s, waiting %ss...", table, wait)
                time.sleep(wait)
                continue
            raise
        except Exception:
            if attempt < 2:
                time.sleep(1)
                continue
            raise
    return []


def supa_count(base_url: str, api_key: str, table: str) -> int:
    url = f"{base_url}/rest/v1/{table}?select=count"
    req = urllib.request.Request(url, headers={
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Prefer": "count=exact",
    })
    try:
        resp = urllib.request.urlopen(req, context=SSL_CTX, timeout=15)
        cr = resp.headers.get("content-range", "")
        if "/" in cr:
            return int(cr.split("/")[1].strip()) if cr.split("/")[1].strip() != "*" else 0
        data = json.loads(resp.read())
        return len(data)
    except Exception:
        return 0


def discover_tables(base_url: str, api_key: str) -> list[str]:
    found = []
    for table in ALL_TABLES:
        try:
            url = f"{base_url}/rest/v1/{table}?select=*&limit=1"
            req = urllib.request.Request(url, headers={
                "apikey": api_key,
                "Authorization": f"Bearer {api_key}",
            })
            resp = urllib.request.urlopen(req, context=SSL_CTX, timeout=10)
            json.loads(resp.read())
            found.append(table)
            logging.debug("Table found: %s", table)
        except Exception:
            logging.debug("Table not accessible: %s", table)
    return found


def maria_connect():
    return pymysql.connect(
        host=env("MARIADB_HOST", "34.47.168.236"),
        port=int(env("MARIADB_PORT", "7306") or 7306),
        database=env("MARIADB_DATABASE", "sabbpeonboarding"),
        user=env("MARIADB_USER", "sbuser"),
        password=env("MARIADB_PASSWORD", required=True),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
    )


def maria_columns(db, table: str) -> dict[str, str]:
    with db.cursor() as cur:
        cur.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema = DATABASE() AND table_name = %s ORDER BY ordinal_position",
            (table,),
        )
        return {row["column_name"]: row["data_type"].lower() for row in cur.fetchall()}


def parse_iso_datetime(value: str) -> str | None:
    """Parse ISO 8601 datetime string with timezone and return MySQL-compatible format."""
    if not value or not isinstance(value, str):
        return None
    try:
        import re
        m = re.match(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:[+-]\d{2}:\d{2}|Z)?$", value)
        if m:
            date_part = m.group(1)
            frac = m.group(2)
            if frac:
                frac = frac[:6].ljust(6, "0")
                return f"{date_part}.{frac}"
            return date_part
        if "T" in value:
            clean = value.replace("Z", "").split("+")[0].split("-0")[-1] if "+" in value else value.replace("Z", "")
            return clean[:26]
        return value
    except Exception:
        return value[:26] if len(value) > 26 else value


def normalize(value: Any, target_type: str) -> Any:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, default=str)
    if isinstance(value, Decimal):
        return value
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, date):
        return value
    if isinstance(value, str) and target_type in {"datetime", "timestamp"}:
        if "T" in value or "Z" in value or "+" in value:
            return parse_iso_datetime(value)
    if target_type in {"json", "longtext", "text"} and not isinstance(value, (str, bytes)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return value


def migrate_table(base_url: str, api_key: str, maria, table: str, dry_run: bool) -> tuple[int, int]:
    columns = maria_columns(maria, table)
    if not columns:
        logging.warning("Skipping %s: not in MariaDB", table)
        return 0, 0

    col_map = COLUMN_MAP.get(table, {})
    null_overrides = NULL_OVERRIDES.get(table, {})
    total = supa_count(base_url, api_key, table)
    if total == 0:
        logging.info("%s: 0 rows", table)
        return 0, 0

    logging.info("%s: %s rows to migrate", table, total)
    inserted = 0
    skipped = 0
    offset = 0

    with maria.cursor() as cur:
        while offset < total:
            rows = supa_get(base_url, api_key, table, offset, BATCH_SIZE)
            if not rows:
                break
            for row in rows:
                mapped_row = {}
                for src_col, val in row.items():
                    dest_col = col_map.get(src_col, src_col)
                    mapped_row[dest_col] = val
                for col, default in null_overrides.items():
                    if col not in mapped_row:
                        mapped_row[col] = default
                shared = [c for c in mapped_row if c in columns]
                if not shared:
                    skipped += 1
                    continue
                vals = []
                for c in shared:
                    v = mapped_row[c]
                    if v is None and c in null_overrides:
                        v = null_overrides[c]
                    vals.append(normalize(v, columns[c]))
                placeholders = ", ".join(["%s"] * len(shared))
                cols = ", ".join(f"`{c}`" for c in shared)
                updates = ", ".join(f"`{c}` = VALUES(`{c}`)" for c in shared if c != "id")
                sql = (
                    f"INSERT INTO `{table}` ({cols}) VALUES ({placeholders}) "
                    f"ON DUPLICATE KEY UPDATE {updates or '`id` = `id`'}"
                )
                if not dry_run:
                    cur.execute(sql, vals)
                inserted += 1
            if not dry_run:
                maria.commit()
            offset += BATCH_SIZE
            logging.info("%s: %s/%s rows", table, min(offset, total), total)

    return inserted, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate Supabase data to MariaDB via REST API.")
    parser.add_argument("--dry-run", action="store_true", help="Read only, do not write.")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument("--tables", nargs="*", help="Migrate only these tables.")
    args = parser.parse_args()

    setup_logging(args.verbose)

    base_url = env("SUPABASE_URL", required=True)
    api_key = env("SUPABASE_SERVICE_ROLE_KEY", required=True)
    base_url = base_url.rstrip("/")

    maria = maria_connect()
    try:
        logging.info("Discovering Supabase tables...")
        source_tables = discover_tables(base_url, api_key)
        logging.info("Found %d tables in Supabase: %s", len(source_tables), ", ".join(source_tables))

        target_tables = set()
        with maria.cursor() as cur:
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()")
            target_tables = {row["table_name"] for row in cur.fetchall()}

        tables_to_migrate = [
            t for t in PREFERRED_TABLE_ORDER
            if t in source_tables and t in target_tables
        ]
        extra = sorted((set(source_tables) & target_tables) - set(tables_to_migrate))
        tables_to_migrate.extend(extra)

        if args.tables:
            tables_to_migrate = [t for t in tables_to_migrate if t in args.tables]

        missing = sorted(set(source_tables) - target_tables)
        for t in missing:
            logging.warning("No MariaDB target for Supabase table: %s", t)

        logging.info("Will migrate %d tables: %s", len(tables_to_migrate), ", ".join(tables_to_migrate))

        with maria.cursor() as cur:
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        maria.commit()

        failures = 0
        total_rows = 0
        for table in tables_to_migrate:
            try:
                inserted, skipped = migrate_table(base_url, api_key, maria, table, args.dry_run)
                total_rows += inserted
                logging.info("%s DONE: inserted=%s skipped=%s", table, inserted, skipped)
            except Exception:
                failures += 1
                maria.rollback()
                logging.exception("%s FAILED", table)

        with maria.cursor() as cur:
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        maria.commit()

        if failures:
            logging.error("Migration completed with %d failure(s). Total rows: %d", failures, total_rows)
            return 1
        logging.info("Migration completed successfully. Total rows migrated: %d", total_rows)
        return 0
    finally:
        maria.close()


if __name__ == "__main__":
    raise SystemExit(main())
