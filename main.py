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

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi import Request

app = FastAPI(title="Digital Watermarking Service")

# GLOBAL SAFETY NET: Catch every single error and force it to be JSON
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"status": "Error", "error": f"Global Server Crash: {str(exc)}"}
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "Error", "error": str(exc.detail)}
    )

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
    try:
        # Read file content
        try:
            contents = await file.read()
        except Exception as e:
            return JSONResponse(status_code=400, content={"status": "Error", "error": f"Failed to read upload: {str(e)}"})
        
        # 3. Apply AES-256-GCM Seal
        try:
            print(f"DEBUG: Starting AES Seal for {owner_id}")
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                 raise Exception("Failed to decode image. Please ensure you are uploading a valid image file.")

            sealed_package = apply_seal(img, PRIVATE_KEY)
            
            # NOW GENERATE DNA FROM THE SEALED PACKAGE
            current_phash = get_phash(sealed_package)
            print(f"DEBUG: Generated Sealed DNA: {current_phash}")

            # 2. Check for Duplicates (Now checking against sealed DNA)
            duplicate = check_duplicate_hash(current_phash)
            if duplicate:
                return JSONResponse(
                    status_code=409,
                    content={
                        "status": "Already Claimed",
                        "error": f"This asset was already claimed by {duplicate.get('owner_id')} on {str(duplicate.get('created_at'))}"
                    }
                )

            # 4. Save Metadata & Signed Hash
            from security import get_integrity_hmac
            record_signature = get_integrity_hmac(current_phash, owner_id, PRIVATE_KEY)
            
            transaction_id = str(uuid.uuid4())
            temp_path = f"temp_{transaction_id}.jpg"
            
            with open(temp_path, "wb") as f:
                f.write(sealed_package)
            print(f"DEBUG: Temp file created at {temp_path}")
        except Exception as e:
             print(f"DEBUG: Sealing Error: {str(e)}")
             return JSONResponse(status_code=500, content={"status": "Error", "error": f"Image Processing Error: {str(e)}"})

        try:
            # Upload to Storage
            print(f"DEBUG: Uploading to Supabase Storage...")
            storage_url = upload_sealed_image(temp_path, f"sealed/{transaction_id}.jpg")
            print(f"DEBUG: Upload successful. URL: {storage_url}")
            
            # Save Metadata with Integrity Signature
            if not MOCK_MODE:
                supabase.table("ownership").insert({
                    "owner_id": owner_id,
                    "phash_value": current_phash,
                    "transaction_id": transaction_id,
                    "integrity_sig": record_signature
                }).execute()
            
        except Exception as e:
            print(f"DEBUG: Storage/DB Error: {str(e)}")
            raise Exception(f"Database/Storage Error: {str(e)}")
            
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        return {
            "status": "Impenetrably Sealed",
            "transaction_id": transaction_id,
            "pHash": current_phash,
            "sealed_url": str(storage_url)
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": str(e)}
        )

@app.get("/library")
async def get_library():
    """Fetches all ownership records from Supabase."""
    if MOCK_MODE:
        return []
    try:
        response = supabase.table("ownership").select("*").order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": f"Library Fetch Failed: {str(e)}"}
        )

@app.post("/verify")
async def verify_ownership(file: UploadFile = File(...)):
    """
    1. Generates Digital DNA (pHash).
    2. Verifies against the Vault Database.
    """
    try:
        contents = await file.read()
        
        # 1. Digital DNA (pHash) verification
        try:
            current_phash = get_phash(contents)
            print(f"DEBUG: Verifying DNA Hash: {current_phash}")
            duplicate = check_duplicate_hash(current_phash)
            
            if duplicate:
                return {
                    "status": "Verified via DNA",
                    "owner_id": duplicate.get("owner_id"),
                    "timestamp": str(duplicate.get("created_at")),
                    "phash": current_phash,
                    "method": "Perceptual Hashing (Digital DNA)"
                }
        except Exception as e:
            print(f"DNA Verification Error: {e}")

        return JSONResponse(
            status_code=404,
            content={
                "status": "Not Found", 
                "error": "No ownership record found for this asset in the Vault.",
                "phash": current_phash
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": f"Verification Failure: {str(e)}"}
        )

# AI Chatbot Setup
import google.generativeai as genai
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash')
else:
    print("Warning: GEMINI_API_KEY not found. Chatbot will be disabled.")

@app.post("/chat")
async def chat_with_ai(request: Request):
    """AI Security Assistant endpoint."""
    try:
        data = await request.json()
        user_message = data.get("message", "")
        
        if not GEMINI_KEY:
            return {"reply": "I'm sorry, my AI core is currently offline (API Key missing)."}

        prompt = f"You are AquaGuard AI, a security assistant for a digital watermarking and asset protection vault. Help the user with: {user_message}"
        response = model.generate_content(prompt)
        return {"reply": response.text}
    except Exception as e:
        return {"reply": f"Sorry, I encountered a glitch: {str(e)}"}

# Helper to serve root files (CSS, JS, Images)
@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    # List of allowed static files in root to avoid serving sensitive files
    allowed_extensions = (".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".html")
    if any(file_path.endswith(ext) for ext in allowed_extensions):
        if os.path.exists(file_path):
            return FileResponse(file_path)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})
    raise HTTPException(status_code=404)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
