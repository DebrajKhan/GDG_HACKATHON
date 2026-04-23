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

def check_duplicate_hash(new_hash: str, threshold: int = 25):
    """
    ULTIMATE DNA SCANNER:
    Finds the most similar record in the entire vault.
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
                except:
                    continue
        
        # Only return if it's within our "Fuzzy" threshold
        if best_match and lowest_distance < threshold:
            print(f"DEBUG: Found Best Match with distance {lowest_distance}")
            return best_match
            
    except Exception as e:
        print(f"DNA Search Error: {e}")
        
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
