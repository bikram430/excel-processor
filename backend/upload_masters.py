"""
One-time script to upload the password-protected master recipe files
to Supabase Storage bucket  'master-recipes'.

Run once:
    cd backend
    python upload_masters.py

The bucket is created automatically if it does not exist.
Files are upserted so re-running is safe.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL        = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
RECIPE_AUTOMATION_DIR = Path(
    os.environ.get("RECIPE_AUTOMATION_DIR", r"C:\Users\bikra\Downloads\RecipeAutomation")
)
BUCKET = "master-recipes"

MASTER_FILES = [
    "Recipes/KETTLEANDBLENDTECH.xlsx",   # password: NPD04
    "Recipes/SOUP.xlsx",                  # password: NPD06
    "Recipes/SAUCE.xlsx",                 # password: NPD05
    "Recipes/PASTRY.xlsx",               # password: NPD11
    "Recipes/MARINATION.xlsx",           # password: NPD10  (was NPD07 before 2026-02)
    "Recipes/WOK.xlsx",                  # password: NPD12
    "Recipes/RICE.xlsx",                 # password: NPD09
    "Recipes/CQC.xlsx",                  # password: NPD01
]

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def ensure_bucket() -> None:
    """Create the bucket if it doesn't already exist."""
    existing = [b.name for b in sb.storage.list_buckets()]
    if BUCKET not in existing:
        sb.storage.create_bucket(BUCKET, options={"public": False})
        print(f"  Created bucket: {BUCKET}")
    else:
        print(f"  Bucket already exists: {BUCKET}")


def upload_file(rel_path: str) -> None:
    local = RECIPE_AUTOMATION_DIR / rel_path
    if not local.exists():
        print(f"  SKIP  {rel_path}  (file not found at {local})")
        return

    with open(local, "rb") as fh:
        data = fh.read()

    storage_path = rel_path  # e.g. Recipes/KETTLEANDBLENDTECH.xlsx
    sb.storage.from_(BUCKET).upload(
        storage_path,
        data,
        {
            "content-type": (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
            "upsert": "true",
        },
    )
    size_kb = len(data) / 1024
    print(f"  OK    {storage_path}  ({size_kb:.1f} KB)")


def main() -> None:
    print(f"Supabase project : {SUPABASE_URL}")
    print(f"Local source     : {RECIPE_AUTOMATION_DIR}")
    print()

    print("Checking bucket...")
    ensure_bucket()
    print()

    print("Uploading master recipe files...")
    for rel in MASTER_FILES:
        upload_file(rel)

    print()
    print("Done.")


if __name__ == "__main__":
    main()
