from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
import cv2
import numpy as np
import os
import uuid
import shutil
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from security import get_phash, apply_seal, hamming_distance
from supabase_config import (
    check_duplicate_hash, find_owner_record,
    save_metadata, upload_sealed_image, supabase, MOCK_MODE
)
from PIL import Image
import io
import imagehash

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi import Request

app = FastAPI(title="ORYGIN — Digital Watermarking Service")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# ─────────────────────────────────────────────────────────────────────────────
#  /seal  — Seals an image with invisible LSB watermark and saves to DB.
#           owner_id  : display name / email username
#           user_id   : Supabase Auth UUID of the authenticated user
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/seal")
async def seal_ownership(
    owner_id: str,
    user_id: str,                       # Required: Auth UUID from frontend
    file: UploadFile = File(...)
):
    """
    1. Reads the uploaded image.
    2. Applies invisible LSB watermark (DNA).
    3. Generates perceptual hash (pHash) of sealed image.
    4. Checks for global duplicates (same image already claimed by anyone).
    5. Saves record with user_id to Supabase ownership table.
    6. Uploads sealed image to Supabase Storage.
    """
    try:
        try:
            contents = await file.read()
        except Exception as e:
            return JSONResponse(
                status_code=400,
                content={"status": "Error", "error": f"Failed to read upload: {str(e)}"}
            )

        # Validate image
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return JSONResponse(
                status_code=400,
                content={"status": "Error", "error": "Invalid file. Please upload a PNG or JPEG image."}
            )

        # Generate transaction ID and embed invisible DNA
        transaction_id = str(uuid.uuid4())
        dna_payload = (
            f"App: ORYGIN AI | Owner: {owner_id} | UserID: {user_id} | ID: {transaction_id} ####"
        )
        sealed_package = apply_seal(img, dna_payload)

        # Generate pHash of the sealed image for duplicate detection
        current_phash = get_phash(sealed_package)

        # Global duplicate check — block if ANYONE already owns this image
        duplicate = check_duplicate_hash(current_phash)
        if duplicate:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "Already Claimed",
                    "error": (
                        f"This image was already sealed by '{duplicate.get('owner_id')}' "
                        f"on {str(duplicate.get('created_at', 'unknown date'))}. "
                        f"Content theft detected."
                    )
                }
            )

        # Save metadata to Supabase (with user_id for per-user isolation)
        if not MOCK_MODE:
            supabase.table("ownership").insert({
                "owner_id": owner_id,
                "user_id": user_id,
                "phash_value": current_phash,
                "transaction_id": transaction_id
            }).execute()

        # Upload sealed image to storage
        temp_path = f"temp_{transaction_id}.png"
        with open(temp_path, "wb") as f:
            f.write(sealed_package)
        try:
            storage_url = upload_sealed_image(temp_path, f"sealed/{transaction_id}.png")
            return {
                "status": "Impenetrably Sealed",
                "transaction_id": transaction_id,
                "phash": current_phash,
                "owner_id": owner_id,
                "sealed_url": str(storage_url)
            }
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": f"Seal Failure: {str(e)}"}
        )


# ─────────────────────────────────────────────────────────────────────────────
#  /library  — Returns only the logged-in user's sealed assets.
# ─────────────────────────────────────────────────────────────────────────────
@app.get("/library")
async def get_library(user_id: str = None):
    """
    Fetches ownership records from Supabase filtered by user_id.
    If user_id is not provided, returns empty list (safe fallback).
    """
    if MOCK_MODE:
        return []
    if not user_id:
        return []
    try:
        response = (
            supabase.table("ownership")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return response.data
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": f"Library Fetch Failed: {str(e)}"}
        )


# ─────────────────────────────────────────────────────────────────────────────
#  /verify  — Pure database-based photo verification.
#             NO pixel LSB extraction. Uses pHash against full DB.
#             ORIGINAL only if pHash matches AND user_id matches logged-in user.
# ─────────────────────────────────────────────────────────────────────────────
@app.post("/verify")
async def verify_ownership(
    file: UploadFile = File(...),
    user_id: str = ""               # Logged-in user's Auth UUID from frontend
):
    """
    Pure database photo verification:
    1. Compute pHash of the uploaded image.
    2. Scan the ENTIRE ownership table for a pHash match (global copyright scan).
    3. If match found AND the record's user_id == the requesting user_id → ORIGINAL.
    4. If match found BUT user_id does NOT match → TAMPERED (different owner / stolen).
    5. If no match found → TAMPERED (image not in system at all).
    """
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return JSONResponse(
                status_code=400,
                content={"status": "Error", "error": "Invalid file format. Please upload a PNG/JPEG image."}
            )

        # Step 1: Compute perceptual hash of the uploaded image
        image_phash = get_phash(contents)
        print(f"DEBUG /verify: uploaded image pHash = {image_phash}")
        print(f"DEBUG /verify: requesting user_id   = {user_id!r}")

        # Step 2: Scan entire DB for closest pHash match
        record = find_owner_record(image_phash)

        if record is None:
            # No matching image found in the entire system
            return JSONResponse(
                status_code=200,
                content={
                    "verdict": "TAMPERED",
                    "status": "Not Registered",
                    "reason": "This image has no ownership record in the ORYGIN system.",
                    "phash": image_phash,
                    "owner_id": None,
                    "transaction_id": None,
                    "timestamp": None,
                }
            )

        # Step 3: Match found — now check if the logged-in user is the original owner
        record_user_id  = record.get("user_id", "")
        record_owner_id = record.get("owner_id", "Unknown")
        record_tx_id    = record.get("transaction_id", "")
        record_ts       = str(record.get("created_at", ""))
        record_phash    = record.get("phash_value", image_phash)

        # Owner match: user_id must match exactly
        if user_id and record_user_id and (user_id.strip() == record_user_id.strip()):
            return JSONResponse(
                status_code=200,
                content={
                    "verdict": "ORIGINAL",
                    "status": "Verified Authentic",
                    "reason": "Image pHash matches a sealed record and the requesting account is the original owner.",
                    "owner_id": record_owner_id,
                    "transaction_id": record_tx_id,
                    "timestamp": record_ts,
                    "phash": record_phash,
                }
            )
        else:
            # Image exists in DB but was sealed by a DIFFERENT user — potential theft
            return JSONResponse(
                status_code=200,
                content={
                    "verdict": "TAMPERED",
                    "status": "Ownership Mismatch",
                    "reason": (
                        "This image exists in the ORYGIN system but was sealed by a different account. "
                        "The currently logged-in user is NOT the original owner."
                    ),
                    "owner_id": record_owner_id,       # Show who really owns it
                    "transaction_id": record_tx_id,
                    "timestamp": record_ts,
                    "phash": record_phash,
                }
            )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "Error", "error": f"Verification Failure: {str(e)}"}
        )


# ─────────────────────────────────────────────────────────────────────────────
#  BROADCASTING MIDDLEWARE ENGINE
# ─────────────────────────────────────────────────────────────────────────────

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
    except Exception:
        return {"status": "Log Failed"}


# AI Chatbot Setup
import google.generativeai as genai
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel('gemini-1.5-flash-latest')
else:
    print("Warning: GEMINI_API_KEY not found. Chatbot will be disabled.")


@app.get("/violations")
async def get_violations(user_id: str = None):
    """
    Fetches violations from Supabase that are linked to the requesting user's assets.
    If user_id is provided, only returns violations for assets owned by that user.
    Falls back to all violations if user_id is not provided.
    """
    if MOCK_MODE:
        # Return empty list in mock mode — no fake data on the dashboard
        return []
    try:
        if user_id:
            # First get this user's asset transaction IDs
            owned_res = (
                supabase.table("ownership")
                .select("transaction_id")
                .eq("user_id", user_id)
                .execute()
            )
            owned_ids = [r["transaction_id"] for r in (owned_res.data or []) if r.get("transaction_id")]

            if not owned_ids:
                return []

            # Now fetch violations tied to those assets
            response = (
                supabase.table("violations")
                .select("*")
                .in_("asset_id", owned_ids)
                .order("created_at", desc=True)
                .execute()
            )
        else:
            # No user_id — return all violations (admin view)
            response = (
                supabase.table("violations")
                .select("*")
                .order("created_at", desc=True)
                .execute()
            )
        return response.data or []
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/crawl/trigger")
async def trigger_crawler(request: Request):
    """
    Scans all sealed assets in the DB for potential matches on discovered pirate URLs.
    In production, discovered_items would come from an actual web crawler.
    """
    try:
        body = {}
        try:
            body = await request.json()
        except Exception:
            pass
        user_id = body.get("user_id")

        # Placeholder discovered pirate content
        # (In production, this is replaced by Scrapy/Playwright output)
        discovered_items = [
            {"url": "https://twitter.com/user_leak/status/1",  "platform": "Twitter",  "pHash": "a1b2c3d4e5f6"},
            {"url": "https://youtube.com/watch?v=leak",        "platform": "YouTube",  "pHash": "f1e2d3c4b5a6"}
        ]

        detections = 0
        if not MOCK_MODE:
            for item in discovered_items:
                # Match against the full ownership table
                query = supabase.table("ownership").select("*").eq("phash_value", item["pHash"])
                if user_id:
                    query = query.eq("user_id", user_id)
                res = query.execute()
                if res.data:
                    supabase.table("violations").insert({
                        "asset_id": res.data[0]["transaction_id"],
                        "platform": item["platform"],
                        "violating_url": item["url"],
                        "risk_score": 85,
                        "status": "detected"
                    }).execute()
                    detections += 1
        # In mock mode, report 0 real detections — no fake numbers

        return {
            "success": True,
            "message": f"Global Scan Complete. Found {detections} potential violations against your assets.",
            "detections_found": detections
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/chat")
async def chat_with_ai(request: Request):
    """AI Security Assistant endpoint."""
    try:
        data = await request.json()
        user_message = data.get("message", "")

        if not GEMINI_KEY:
            return {"reply": "I'm sorry, my AI core is currently offline."}

        prompt = (
            f"You are ORYGIN ASSISTANT. You help with asset sealing and SECURE LIVE BROADCASTING. "
            f"Help the user with: {user_message}"
        )
        response = model.generate_content(prompt)
        return {"reply": response.text}
    except Exception as e:
        return {"reply": f"Sorry, I encountered a glitch: {str(e)}"}


# Helper to serve root files (CSS, JS, Images)
@app.get("/{file_path:path}")
async def serve_static(file_path: str):
    allowed_extensions = (".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".html")
    if any(file_path.endswith(ext) for ext in allowed_extensions):
        if os.path.exists(file_path):
            return FileResponse(file_path)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
