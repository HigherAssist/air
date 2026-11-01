"""
Backfill first_name / last_name for all candidates from raw_data->>'name'.
Loxo does not return separate first_name/last_name fields — only a combined 'name'.
Run once after discovering all candidates have null names.
"""
import sys
import os

sys.path.insert(0, "/app")

import ssl
from sqlalchemy import create_engine, text

DATABASE_URL_SYNC = os.environ["DATABASE_URL_SYNC"]

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

engine = create_engine(DATABASE_URL_SYNC, connect_args={"sslmode": "require"})


def split_name(full: str):
    """Split 'DUSTIN VARCOE' → ('Dustin', 'Varcoe')"""
    full = (full or "").strip()
    if not full:
        return None, None
    parts = full.split(" ", 1)
    first = parts[0].capitalize()
    last = parts[1].title() if len(parts) > 1 else None
    return first, last


with engine.connect() as conn:
    # Count how many need updating
    result = conn.execute(
        text("SELECT COUNT(*) FROM candidates WHERE first_name IS NULL AND raw_data->>'name' IS NOT NULL")
    )
    count = result.scalar()
    print(f"Candidates needing name backfill: {count}")

    if count == 0:
        print("Nothing to do.")
        sys.exit(0)

    # Fetch all candidates with null name but raw_data present
    rows = conn.execute(
        text("SELECT id, raw_data->>'name' AS full_name FROM candidates WHERE first_name IS NULL AND raw_data->>'name' IS NOT NULL")
    ).fetchall()

    updated = 0
    for row in rows:
        cid, full_name = row.id, row.full_name
        first, last = split_name(full_name)
        conn.execute(
            text("UPDATE candidates SET first_name = :first, last_name = :last WHERE id = :id"),
            {"first": first, "last": last, "id": cid},
        )
        updated += 1

    conn.commit()
    print(f"Updated {updated} candidates with name data.")

    # Verify
    result = conn.execute(text("SELECT COUNT(*) FROM candidates WHERE first_name IS NOT NULL"))
    named = result.scalar()
    result = conn.execute(text("SELECT COUNT(*) FROM candidates"))
    total = result.scalar()
    print(f"Named candidates: {named}/{total}")

    # Sample
    sample = conn.execute(
        text("SELECT id, first_name, last_name, current_title FROM candidates WHERE first_name IS NOT NULL LIMIT 5")
    ).fetchall()
    print("\nSample after backfill:")
    for r in sample:
        print(f"  {r.id}: {r.first_name} {r.last_name} — {r.current_title}")
