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

def check_duplicate_hash(new_hash: str, threshold: int = 15, trans_id: str = None):
    """Checks Supabase for any existing hash. Gracefully handles missing columns."""
    if MOCK_MODE:
        return None 
    try:
        if trans_id:
            print(f"DEBUG: Found Trans ID in Pixels: {trans_id}. Searching Supabase...")
            db_res = supabase.table("ownership").select("*").eq("transaction_id", trans_id).execute()
            if db_res.data:
                print(f"DEBUG: Match found in DB for Transaction ID {trans_id}")
                return db_res.data[0]
        
        # Fetch all records safely
        response = supabase.table("ownership").select("*").execute()
        records = response.data or []
        
        for record in records:
            # Only check DNA if the record actually has a phash_value
            existing_hash = record.get("phash_value")
            if existing_hash:
                from security import hamming_distance
                try:
                    if hamming_distance(new_hash, existing_hash) < threshold:
                        return record
                except:
                    continue
    except Exception as e:
        print(f"DNA Search Warning (might be missing column): {e}")
        
    return None

def save_metadata(owner_id: str, phash: str, transaction_id: str):
    """Saves ownership metadata to Supabase 'ownership' table."""
    if MOCK_MODE:
        print(f"MOCK: Saved metadata for {owner_id} ({phash})")
        return

    data = {
        "owner_id": owner_id,
        "phash_value": phash,
        "transaction_id": transaction_id
    }
    supabase.table("ownership").insert(data).execute()

def upload_sealed_image(file_path: str, destination_name: str):
    """Uploads the sealed image to Supabase Storage bucket 'sealed-assets'."""
    if MOCK_MODE:
        print(f"MOCK: Uploaded {file_path} to {destination_name}")
        return f"https://mockstorage.com/{destination_name}"

    with open(file_path, "rb") as f:
        # destination_name should be something like 'sealed/abc-123.png'
        # Supabase storage upload
        supabase.storage.from_("sealed-assets").upload(destination_name, f, {"content-type": "image/png"})
    
    # Get public URL
    public_url = supabase.storage.from_("sealed-assets").get_public_url(destination_name)
    return public_url
