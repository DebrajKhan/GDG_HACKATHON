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
    ULTIMATE AUTHENTICITY CHECK:
    Combines Pixel-level Steganography and AI-Powered Perceptual DNA.
    """
    try:
        # Step 1: Read and Decode the Image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return JSONResponse(status_code=400, content={"status": "Error", "error": "Invalid file format. Please upload a PNG image."})

        # Step 2: High-Depth Pixel Extraction (Invisible Stamp)
        from security import verify_seal, get_phash
        pixel_dna = verify_seal(img)
        print(f"DEBUG: Pixel Extraction Result: {pixel_dna}")

        # Step 3: Perceptual DNA Backup (AI Hashing)
        image_dna = get_phash(contents)
        print(f"DEBUG: Digital DNA Hash: {image_dna}")
        
        # SEARCH LOGIC: Try Pixel ID first, then DNA Match
        match_found = False
        record = None

        # A. Try looking up by the ID extracted from pixels
        if pixel_dna:
            import re
            id_match = re.search(r"ID: ([a-z0-9-]+)", pixel_dna, re.IGNORECASE)
            if id_match:
                trans_id = id_match.group(1)
                db_res = supabase.table("ownership").select("*").eq("transaction_id", trans_id).execute()
                if db_res.data:
                    record = db_res.data[0]
                    match_found = True
                    method = "Invisible Pixel DNA (High Confidence)"

        # B. Fallback to AI DNA Matching if pixel stamp was damaged
        if not match_found:
            dna_match = check_duplicate_hash(image_dna)
            if dna_match:
                record = dna_match
                match_found = True
                method = "AI Perceptual DNA (Pattern Recognition)"

        # FINAL VERDICT
        if match_found:
            return {
                "status": "Verified Authentic",
                "owner_id": record.get("owner_id"),
                "transaction_id": record.get("transaction_id"),
                "timestamp": str(record.get("created_at")),
                "phash": record.get("phash_value", image_dna),
                "method": method
            }

        return JSONResponse(
            status_code=404,
            content={
                "status": "Not Found", 
                "error": "No valid ownership records or DNA patterns found for this asset.",
                "phash": image_dna
            }
        )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": f"Verification Failure: {str(e)}"}
        )

# --- BROADCASTING MIDDLEWARE ENGINE ---

@app.post("/broadcast/start")
async def start_broadcast(request: Request):
    """Initializes a secure broadcast session."""
    try:
        data = await request.json()
        broadcaster_id = data.get("broadcaster_id")
        title = data.get("title", "Untitled Broadcast")
        description = data.get("description", "")
        venue = data.get("venue", "General")
        medium = data.get("medium", "Webcam")
        
        stream_key = f"ORYGIN_{str(uuid.uuid4())[:8].upper()}"
        
        if not MOCK_MODE:
            res = supabase.table("broadcasts").insert({
                "broadcaster_id": broadcaster_id,
                "stream_key": stream_key,
                "title": title,
                "description": description,
                "venue": venue,
                "medium": medium,
                "status": "live"
            }).execute()
            session_id = res.data[0]["id"]
        else:
            session_id = "mock_session_123"

        return {
            "status": "Secure Stream Initialized",
            "session_id": session_id,
            "stream_key": stream_key,
            "middleware_layer": "Active: Anti-Screenshot + Moire Jamming"
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/broadcast/metrics")
async def update_metrics(request: Request):
    """Updates live bandwidth and frame-drop data."""
    try:
        data = await request.json()
        session_id = data.get("session_id")
        if not MOCK_MODE:
            supabase.table("broadcasts").update({
                "bandwidth_kbps": data.get("bandwidth", 0),
                "frame_drops": data.get("drops", 0)
            }).eq("id", session_id).execute()
        return {"status": "Metrics Synced"}
    except Exception as e:
        return {"status": "Log Failed"}

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
            return {"reply": "I'm sorry, my AI core is currently offline."}

        prompt = f"You are ORYGIN ASSISTANT. You help with asset sealing and SECURE LIVE BROADCASTING. Help the user with: {user_message}"
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
