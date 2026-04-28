import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

MOCK_MODE = False
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"Error initializing Supabase: {e}")
        MOCK_MODE = True
else:
    print("Warning: Supabase credentials not found in .env. Entering MOCK MODE.")
    MOCK_MODE = True


# ─────────────────────────────────────────────────────────────────────────────
# GLOBAL COPYRIGHT SCAN — scans ALL records from ALL users.
# Used during /verify to detect if ANY registered owner's image matches.
# Returns the matching record (with its user_id) so the caller can compare.
# ─────────────────────────────────────────────────────────────────────────────
HAMMING_THRESHOLD = 8   # Strict precision: only near-identical images match

def check_duplicate_hash(new_hash: str, threshold: int = HAMMING_THRESHOLD):
    """
    Scans the ENTIRE ownership table for a perceptual hash match.
    Used by /seal to block duplicate uploads globally.
    Returns the matching record or None.
    """
    if MOCK_MODE:
        return None
    try:
        response = supabase.table("ownership").select("*").execute()
        records = response.data or []

        best_match = None
        lowest_distance = 999

        for record in records:
            existing_hash = record.get("phash_value")
            if existing_hash:
                from security import hamming_distance
                try:
                    distance = hamming_distance(new_hash, existing_hash)
                    if distance < lowest_distance:
                        lowest_distance = distance
                        best_match = record
                except Exception:
                    continue

        if best_match and lowest_distance <= threshold:
            print(f"DEBUG: check_duplicate_hash — best distance={lowest_distance}")
            return best_match

    except Exception as e:
        print(f"DNA Search Error: {e}")

    return None


def find_owner_record(new_hash: str, threshold: int = HAMMING_THRESHOLD):
    """
    Scans the ENTIRE ownership table for a perceptual hash match.
    Used by /verify to find who originally sealed this image.
    Returns the matching record (with owner user_id) or None.
    """
    if MOCK_MODE:
        return None
    return check_duplicate_hash(new_hash, threshold)


def save_metadata(owner_id: str, phash: str, transaction_id: str, user_id: str = None):
    """
    Saves ownership metadata to Supabase 'ownership' table.
    Includes user_id (Supabase Auth UUID) for per-user isolation.
    """
    if MOCK_MODE:
        print(f"MOCK: Saved metadata for {owner_id} ({phash}), user_id={user_id}")
        return

    data = {
        "owner_id": owner_id,
        "phash_value": phash,
        "transaction_id": transaction_id,
    }
    if user_id:
        data["user_id"] = user_id

    supabase.table("ownership").insert(data).execute()


def upload_sealed_image(file_path: str, destination_name: str):
    """Uploads the sealed image to Supabase Storage bucket 'sealed-assets'."""
    if MOCK_MODE:
        print(f"MOCK: Uploaded {file_path} to {destination_name}")
        return f"https://mockstorage.com/{destination_name}"

    with open(file_path, "rb") as f:
        supabase.storage.from_("sealed-assets").upload(
            destination_name, f, {"content-type": "image/png"}
        )

    public_url = supabase.storage.from_("sealed-assets").get_public_url(destination_name)
    return public_url
