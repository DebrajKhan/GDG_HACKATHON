import cv2
import numpy as np
import imagehash
from PIL import Image
import io
import os
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def get_phash(image_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(image_bytes))
    return str(imagehash.phash(image))

def derive_key(key: str) -> bytes:
    return hashlib.sha256(key.encode()).digest()

# --- PILLAR 1: 60Hz POV JITTER ---

def generate_pov_frames(image_np: np.ndarray):
    """
    Splits image into two complementary frames (A and B).
    Flicking these at 60Hz recreates the full image for the human eye,
    but captures a 'puzzled' or blurry mess on screenshots/pirate recordings.
    """
    h, w, c = image_np.shape
    # Create checkerboard masks
    mask_a = np.zeros((h, w, 1), dtype=np.uint8)
    mask_b = np.ones((h, w, 1), dtype=np.uint8)
    
    # Simple checkerboard pattern
    mask_a[::2, ::2] = 1
    mask_a[1::2, 1::2] = 1
    mask_b = 1 - mask_a
    
    frame_a = image_np * mask_a
    frame_b = image_np * mask_b
    
    return frame_a, frame_b

# --- PILLAR 2: ANTI-CAMERA MOIRÉ JAMMING ---

def apply_moire_jamming(image_np: np.ndarray):
    """
    Injects a high-frequency invisible grid.
    Causes 'Aliasing' and 'Moiré' rainbow swirls when photographed by a phone camera.
    """
    h, w, c = image_np.shape
    # Create a high-frequency sinusoidal grid
    x = np.linspace(0, w, w)
    y = np.linspace(0, h, h)
    X, Y = np.meshgrid(x, y)
    
    # Frequency set to fight with most CMOS sensors (phone cameras)
    grid = (np.sin(X * 0.5) * np.cos(Y * 0.5) * 5).astype(np.int16)
    
    # Apply grid to all channels
    jammed = image_np.astype(np.int16)
    for i in range(3):
        jammed[:, :, i] += grid
        
    return np.clip(jammed, 0, 255).astype(np.uint8)

# --- CRYPTOGRAPHIC CORE ---

def apply_seal(image_np: np.ndarray, key: str, use_jamming: bool = True) -> bytes:
    """
    Applies Jamming, then AES-256-GCM encryption.
    """
    processed = image_np
    if use_jamming:
        processed = apply_moire_jamming(image_np)
        
    ret, buffer = cv2.imencode('.png', processed)
    data = buffer.tobytes()
    
    aesgcm = AESGCM(derive_key(key))
    nonce = os.urandom(12)
    return nonce + aesgcm.encrypt(nonce, data, None)

def verify_seal(sealed_package: bytes, key: str):
    aesgcm = AESGCM(derive_key(key))
    nonce = sealed_package[:12]
    ciphertext = sealed_package[12:]
    
    decrypted_data = aesgcm.decrypt(nonce, ciphertext, None)
    nparr = np.frombuffer(decrypted_data, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

def get_integrity_hmac(phash: str, owner_id: str, key: str) -> str:
    import hmac
    msg = f"{phash}:{owner_id}".encode()
    return hmac.new(key.encode(), msg, hashlib.sha256).hexdigest()

def hamming_distance(h1: str, h2: str) -> int:
    """Calculates the hamming distance between two hex hashes."""
    return imagehash.hex_to_hash(h1) - imagehash.hex_to_hash(h2)
