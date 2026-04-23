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
        
        # 3. Apply Invisible DNA Injection (Pixel-to-Pixel)
        transaction_id = str(uuid.uuid4())
        
        # Original Localhost Payload format
        dna_payload = f"App: ORYGIN AI | Owner: {owner_id} | ID: {transaction_id} ####"
        
        # This applies the invisible pixel-to-pixel engravtion
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        sealed_package = apply_seal(img, dna_payload)
        
        # GENERATE DNA (pHash) for duplicate protection
        current_phash = get_phash(sealed_package)
        
        # Check for Duplicates
        duplicate = check_duplicate_hash(current_phash)
        if duplicate:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "Already Claimed",
                    "error": f"This asset was already claimed by {duplicate.get('owner_id')} on {str(duplicate.get('created_at'))}"
                }
            )

        # 4. Save Metadata to Supabase
        if not MOCK_MODE:
            supabase.table("ownership").insert({
                "owner_id": owner_id,
                "phash_value": current_phash,
                "transaction_id": transaction_id
            }).execute()
        
        temp_path = f"temp_{transaction_id}.png"
        with open(temp_path, "wb") as f:
            f.write(sealed_package)
        try:
            storage_url = upload_sealed_image(temp_path, f"sealed/{transaction_id}.png")
            return {
                "status": "Impenetrably Sealed",
                "transaction_id": transaction_id,
                "phash": current_phash,
                "sealed_url": str(storage_url)
            }
        finally:
            if os.path.exists(temp_path): os.remove(temp_path)
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": f"Global Crash: {str(e)}"}
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
    EXACT LOCALHOST LOGIC:
    1. Extracts DNA string from pixels.
    2. Finds Transaction ID.
    3. Searches Supabase by Transaction ID.
    """
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        from security import verify_seal
        extracted_dna = verify_seal(img)
        print(f"DEBUG: Extracted DNA String: {extracted_dna}")

        if extracted_dna:
            # Parse Transaction ID (format: ID: ABC12345)
            import re
            match = re.search(r"ID: ([a-z0-9-]+)", extracted_dna, re.IGNORECASE)
            if match:
                trans_id = match.group(1)
                print(f"DEBUG: Found Trans ID: {trans_id}")
                
                # Check Database
                response = supabase.table("ownership").select("*").eq("transaction_id", trans_id).execute()
                if response.data:
                    record = response.data[0]
                    return {
                        "status": "Verified Authentic",
                        "owner_id": record.get("owner_id"),
                        "transaction_id": trans_id,
                        "timestamp": str(record.get("created_at")),
                        "phash": record.get("phash_value"),
                        "method": "Invisible Pixel DNA"
                    }

        return JSONResponse(
            status_code=404,
            content={"status": "Not Found", "error": "No valid DNA found in this asset.", "phash": "CORRUPTED_OR_MISSING"}
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
    model = genai.GenerativeModel('gemini-1.5-flash-latest')
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

        prompt = f"You are ORYGIN ASSISTANT, a security assistant for a digital watermarking and asset protection vault. Help the user with: {user_message}"
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
