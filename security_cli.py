import sys
import argparse
import cv2
import numpy as np
import imagehash
from PIL import Image
import io
import json
import base64

def get_phash(image_bytes):
    image = Image.open(io.BytesIO(image_bytes))
    return str(imagehash.phash(image))

def generate_key_mask(shape, key):
    seed = sum(ord(c) for c in key) % (2**32)
    rs = np.random.RandomState(seed)
    return rs.randint(0, 256, size=shape, dtype=np.uint8)

def apply_seal(image_np, key):
    mask = generate_key_mask(image_np.shape, key)
    sealed = np.bitwise_xor(image_np, mask)
    return sealed

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["hash", "seal", "unseal"])
    parser.add_argument("--key", default="SUPER_SECRET_KEY_123")
    parser.add_argument("--input", help="Base64 encoded image string")
    
    args = parser.parse_args()
    
    if args.action == "hash":
        image_bytes = sys.stdin.buffer.read()
        print(get_phash(image_bytes))
        
    elif args.action == "seal":
        image_bytes = sys.stdin.buffer.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        sealed = apply_seal(img, args.key)
        _, buffer = cv2.imencode(".png", sealed)
        sys.stdout.buffer.write(buffer.tobytes())

    elif args.action == "unseal":
        image_bytes = sys.stdin.buffer.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # In this workflow, unseal just recovers the phash of the recovered image
        mask = generate_key_mask(img.shape, args.key)
        recovered = np.bitwise_xor(img, mask)
        
        recovered_pil = Image.fromarray(cv2.cvtColor(recovered, cv2.COLOR_BGR2RGB))
        print(str(imagehash.phash(recovered_pil)))

if __name__ == "__main__":
    main()
