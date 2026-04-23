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

# --- PILLAR 2: INVISIBLE PIXEL WATERMARKING (LSB) ---

def apply_seal(image_np: np.ndarray, data: str) -> bytes:
    """
    Hides the data string in the least significant bits of the image.
    Completely invisible to the human eye.
    """
    # Ensure delimiter is present
    if "####" not in data:
        data += "####" 
        
    binary_data = ''.join(format(ord(i), '08b') for i in data)
    
    data_index = 0
    data_len = len(binary_data)
    output = image_np.copy()
    
    # Inject bits into pixels
    for row in output:
        for pixel in row:
            for channel in range(3):
                if data_index < data_len:
                    pixel[channel] = (int(pixel[channel]) & 254) | int(binary_data[data_index])
                    data_index += 1
                else:
                    break
            if data_index >= data_len: break
        if data_index >= data_len: break
        
    ret, buffer = cv2.imencode('.png', output)
    return buffer.tobytes()

def verify_seal(image_np: np.ndarray):
    """
    Extracts the hidden DNA string from the pixels.
    """
    binary_data = ""
    # Check more pixels for longer UUIDs and payloads
    pixel_limit = 20000 
    pixel_count = 0
    
    for row in image_np:
        for pixel in row:
            for channel in range(3):
                binary_data += str(pixel[channel] & 1)
            pixel_count += 1
            if pixel_count > pixel_limit: break
        if pixel_count > pixel_limit: break
                
    all_bytes = [binary_data[i:i+8] for i in range(0, len(binary_data), 8)]
    decoded_data = ""
    for byte in all_bytes:
        try:
            char = chr(int(byte, 2))
            decoded_data += char
            if "####" in decoded_data:
                return decoded_data.replace("####", "")
        except:
            continue
            
    return None

def get_integrity_hmac(phash: str, owner_id: str, key: str) -> str:
    import hmac
    msg = f"{phash}:{owner_id}".encode()
    return hmac.new(key.encode(), msg, hashlib.sha256).hexdigest()

def hamming_distance(h1: str, h2: str) -> int:
    """Calculates the hamming distance between two hex hashes."""
    return imagehash.hex_to_hash(h1) - imagehash.hex_to_hash(h2)
