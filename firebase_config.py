import firebase_admin
from firebase_admin import credentials, firestore, storage
import os
from dotenv import load_dotenv

load_dotenv()

# Path to service account key file from environment variable
cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json")

MOCK_MODE = False
db = None
bucket = None

if os.path.exists(cred_path):
    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'storageBucket': os.getenv("FIREBASE_STORAGE_BUCKET")
        })
        db = firestore.client()
        bucket = storage.bucket()
    except Exception as e:
        print(f"Error initializing Firebase: {e}")
        MOCK_MODE = True
else:
    print(f"Warning: Firebase credentials not found at {cred_path}. Entering MOCK MODE.")
    MOCK_MODE = True

def check_duplicate_hash(new_hash: str, threshold: int = 5):
    """Checks Firestore for any existing hash with Hamming Distance < threshold."""
    if MOCK_MODE:
        return None 
    
    docs = db.collection("ownership").stream()
    for doc in docs:
        existing_hash = doc.to_dict().get("pHash_value")
        if existing_hash:
            from security import hamming_distance
            if hamming_distance(new_hash, existing_hash) < threshold:
                return doc.to_dict()
    return None

def save_metadata(owner_id: str, phash: str, transaction_id: str):
    """Saves ownership metadata to Firestore."""
    if MOCK_MODE:
        print(f"MOCK: Saved metadata for {owner_id} ({phash})")
        return

    data = {
        "owner_id": owner_id,
        "pHash_value": phash,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "transaction_id": transaction_id
    }
    db.collection("ownership").document(transaction_id).set(data)

def upload_sealed_image(file_path: str, destination_name: str):
    """Uploads the sealed image to Firebase Storage."""
    if MOCK_MODE:
        print(f"MOCK: Uploaded {file_path} to {destination_name}")
        return f"https://mockstorage.com/{destination_name}"

    blob = bucket.blob(destination_name)
    blob.upload_from_filename(file_path)
    return blob.public_url
