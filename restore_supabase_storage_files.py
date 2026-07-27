#!/usr/bin/env python3
"""
Recover merchant-uploaded files from Supabase Storage into the local
backend-spring/uploads directory.

Context: merchant_documents.file_path (and a few sibling columns on
merchant_kyc / merchant_profiles) still hold the old Supabase Storage
object keys, e.g. "<merchant_id>/pan-cards_169...jpg". Those rows were
migrated into MariaDB by migrate_supabase_to_mariadb.py, but the actual
binary files were never copied out of Supabase Storage, so the Spring
backend's static /uploads/** handler 404s/403s on them today. Anything
newly uploaded through the local backend already lives under
backend-spring/uploads/ (path stored as "/uploads/<uuid>.ext") and is
left untouched.

This script is idempotent: it skips any object whose local file already
exists, so re-running only fetches what's still missing.

Required environment variables:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MARIADB_PASSWORD
  (all fall back to the values already used by sync_to_supabase.py /
  application.yml in this repo if unset)

Install dependencies:
  pip install PyMySQL
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

try:
    import pymysql
except ImportError as exc:
    raise SystemExit("Missing dependency. Install with: pip install PyMySQL") from exc

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://grbbtgfvgwxtkgxtakug.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyYmJ0Z2Z2Z3d4dGtneHRha3VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzE2MTA2NywiZXhwIjoyMDcyNzM3MDY3fQ.2p5X36snvOo90_37wztsZyt89vhsj-jg1LpE-4W8NnY",
)
BUCKET = "merchant-documents"

MARIADB_HOST = os.environ.get("MARIADB_HOST", "34.47.168.236")
MARIADB_PORT = int(os.environ.get("MARIADB_PORT", "7306"))
MARIADB_DATABASE = os.environ.get("MARIADB_DATABASE", "sabbpeonboarding")
MARIADB_USER = os.environ.get("MARIADB_USER", "sbuser")
MARIADB_PASSWORD = os.environ.get("MARIADB_PASSWORD", "KMmTKeK7yh77odw51gK12f")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", os.path.join(SCRIPT_DIR, "backend-spring", "uploads"))

# (table, column) pairs known to hold Supabase Storage object keys.
SOURCE_COLUMNS = [
    ("merchant_documents", "file_path"),
    ("merchant_kyc", "video_kyc_file_path"),
    ("merchant_kyc", "selfie_file_path"),
    ("merchant_profiles", "cpv_video_path"),
    ("merchant_profiles", "cancelled_cheque_url"),
    ("merchant_profiles", "pan_card_url"),
    ("merchant_profiles", "aadhaar_card_url"),
    ("merchant_profiles", "business_proof_url"),
]

PUBLIC_URL_PREFIXES = [
    f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/",
    f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout), logging.FileHandler("restore_supabase_storage_files.log")],
)
log = logging.getLogger(__name__)


def to_object_key(raw_value: str) -> str | None:
    """Normalize a stored path/URL to a Supabase Storage object key, or None if not recoverable here."""
    value = raw_value.strip()
    if not value:
        return None
    if value.startswith("/uploads/") or value.startswith("uploads/"):
        return None  # already served locally by the current backend
    for prefix in PUBLIC_URL_PREFIXES:
        if value.startswith(prefix):
            return urllib.parse.unquote(value[len(prefix):])
    if value.startswith("http"):
        return None  # some other external URL we don't know how to map
    return value  # bare bucket-relative key, e.g. "<merchantId>/pan-cards_....pdf"


def fetch_distinct_object_keys(conn) -> dict[str, list[tuple[str, str]]]:
    """object_key -> list of (table, column) it came from, for logging only."""
    keys: dict[str, list[tuple[str, str]]] = {}
    with conn.cursor() as cur:
        for table, column in SOURCE_COLUMNS:
            cur.execute(f"SELECT DISTINCT `{column}` FROM `{table}` WHERE `{column}` IS NOT NULL AND `{column}` <> ''")
            for (raw_value,) in cur.fetchall():
                object_key = to_object_key(raw_value)
                if object_key:
                    keys.setdefault(object_key, []).append((table, column))
    return keys


def download_object(object_key: str) -> bytes:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{urllib.parse.quote(object_key)}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="List what would be downloaded without writing files")
    args = parser.parse_args()

    conn = pymysql.connect(
        host=MARIADB_HOST, port=MARIADB_PORT, user=MARIADB_USER,
        password=MARIADB_PASSWORD, database=MARIADB_DATABASE, connect_timeout=15,
    )
    try:
        object_keys = fetch_distinct_object_keys(conn)
    finally:
        conn.close()

    log.info("Found %d distinct recoverable object keys across %s", len(object_keys), SOURCE_COLUMNS)

    already_local = downloaded = missing_in_supabase = errors = 0
    missing_log: list[str] = []
    error_log: list[str] = []

    for object_key in sorted(object_keys):
        local_path = os.path.join(UPLOAD_DIR, *object_key.split("/"))
        if os.path.exists(local_path):
            already_local += 1
            continue

        if args.dry_run:
            log.info("[dry-run] would fetch: %s", object_key)
            continue

        try:
            data = download_object(object_key)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                missing_in_supabase += 1
                missing_log.append(object_key)
                log.warning("Not found in Supabase Storage: %s", object_key)
            else:
                errors += 1
                error_log.append(f"{object_key} -> HTTP {exc.code}")
                log.error("HTTP %s fetching %s", exc.code, object_key)
            continue
        except Exception as exc:  # noqa: BLE001
            errors += 1
            error_log.append(f"{object_key} -> {exc}")
            log.error("Error fetching %s: %s", object_key, exc)
            continue

        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)
        downloaded += 1
        log.info("Recovered: %s (%d bytes)", object_key, len(data))

    log.info(
        "Done. already_local=%d downloaded=%d missing_in_supabase=%d errors=%d",
        already_local, downloaded, missing_in_supabase, errors,
    )
    if missing_log:
        log.info("Missing objects (not recoverable, file gone from Supabase too):\n%s", "\n".join(missing_log))
    if error_log:
        log.info("Errors:\n%s", "\n".join(error_log))


if __name__ == "__main__":
    main()
