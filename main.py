from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
import cv2
import numpy as np
import os
import uuid
import shutil
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from security import get_phash, apply_seal, verify_seal, hamming_distance
from supabase_config import check_duplicate_hash, save_metadata, upload_sealed_image, supabase, MOCK_MODE
from PIL import Image
import io
import imagehash

app = FastAPI(title="Digital Watermarking Service")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the exact origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve Frontend (Static Files)
app.mount("/static", StaticFiles(directory="."), name="static")

# Secret key for sealing - should be moved to env/vault
PRIVATE_KEY = os.getenv("OWNERSHIP_PRIVATE_KEY", "SUPER_SECRET_KEY_123")

@app.get("/")
async def read_index():
    return FileResponse("index.html")

@app.post("/seal")
async def seal_ownership(owner_id: str, file: UploadFile = File(...)):
    """
    1. Generates phash.
    2. Checks for duplicates in Firestore.
    3. If unique, applies seal.
    4. Saves metadata and sealed file to Firebase.
    """
    # Read file content
    contents = await file.read()
    
    # 1. Generate Perceptual Hash
    try:
        current_phash = get_phash(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    # 2. Check for Duplicates (Hamming Distance < 5)
    duplicate = check_duplicate_hash(current_phash)
    if duplicate:
        return JSONResponse(
            status_code=409,
            content={
                "status": "Already Claimed",
                "owner_id": duplicate.get("owner_id"),
                "timestamp": str(duplicate.get("timestamp"))
            }
        )

    # 3. Apply AES-256-GCM Seal (Impenetrable Encryption)
    nparr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    sealed_package = apply_seal(img, PRIVATE_KEY)
    
    # 4. Save Metadata & Signed Hash
    from security import get_integrity_hmac
    record_signature = get_integrity_hmac(current_phash, owner_id, PRIVATE_KEY)
    
    transaction_id = str(uuid.uuid4())
    temp_path = f"temp_{transaction_id}.sealed"
    
    with open(temp_path, "wb") as f:
        f.write(sealed_package)

    try:
        # Upload to Storage
        storage_url = upload_sealed_image(temp_path, f"sealed/{transaction_id}.sealed")
        
        # Save Metadata with Integrity Signature
        if not MOCK_MODE:
            supabase.table("ownership").insert({
                "owner_id": owner_id,
                "phash_value": current_phash,
                "transaction_id": transaction_id,
                "integrity_sig": record_signature
            }).execute()
        
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

    return {
        "status": "Impenetrably Sealed",
        "transaction_id": transaction_id,
        "pHash": current_phash,
        "storage_url": storage_url
    }

@app.post("/verify")
async def verify_ownership(file: UploadFile = File(...)):
    """
    1. Decrypts using AES-256-GCM (Tamper detection).
    2. Re-calculates pHash.
    3. Verifies against DB and HMAC integrity signature.
    """
    sealed_package = await file.read()
    
    try:
        from security import verify_seal, get_integrity_hmac
        recovered_img = verify_seal(sealed_package, PRIVATE_KEY)
    except Exception:
        return JSONResponse(
            status_code=401,
            content={"status": "Tampered", "message": "Package decryption failed - Invalid Key or Corrupted Data"}
        )

    # 1. Generate pHash of recovered image
    recovered_pil = Image.fromarray(cv2.cvtColor(recovered_img, cv2.COLOR_BGR2RGB))
    recovered_hash = str(imagehash.phash(recovered_pil))
    
    if MOCK_MODE:
        return {
            "status": "Verified (Simulation)",
            "owner_id": "MOCK_OWNER",
            "transaction_id": "MOCK_TXN_123"
        }

    # 2. Check DB
    response = supabase.table("ownership").select("*").eq("phash_value", recovered_hash).limit(1).execute()
    records = response.data
    
    if not records:
        return JSONResponse(
            status_code=404,
            content={"status": "Unregistered", "message": "No matching fingerprint in database."}
        )

    record = records[0]
    
    # 3. Cryptographic Proof of Database Integrity
    stored_sig = record.get("integrity_sig")
    expected_sig = get_integrity_hmac(recovered_hash, record.get("owner_id"), PRIVATE_KEY)
    
    if stored_sig and stored_sig != expected_sig:
         return JSONResponse(
            status_code=403,
            content={"status": "Integrity Breach", "message": "The database record for this asset has been modified/penetrated."}
        )

    # 4. Generate POV Frames for Secure Viewing
    from security import generate_pov_frames
    import base64
    
    frame_a, frame_b = generate_pov_frames(recovered_img)
    _, buffer_a = cv2.imencode('.png', frame_a)
    _, buffer_b = cv2.imencode('.png', frame_b)
    
    b64_a = base64.b64encode(buffer_a).decode('utf-8')
    b64_b = base64.b64encode(buffer_b).decode('utf-8')

    return {
        "status": "Verified & Authentic",
        "owner_id": record.get("owner_id"),
        "transaction_id": record.get("transaction_id"),
        "pov_frames": {
            "a": f"data:image/png;base64,{b64_a}",
            "b": f"data:image/png;base64,{b64_b}"
        }
    }


# Helper to serve root files (CSS, JS, Images)
@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    # List of allowed static files in root to avoid serving sensitive files
    allowed_extensions = (".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico")
    if any(file_path.endswith(ext) for ext in allowed_extensions):
        if os.path.exists(file_path):
            return FileResponse(file_path)
    # If not a static file or doesn't exist, let FastAPI handle other routes
    raise HTTPException(status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
