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

def inject_watermark(image_np, data):
    """
    Hides data in the least significant bits of the image.
    Invisible to human eye.
    """
    # Add a delimiter to know where the data ends
    data += "####" 
    binary_data = ''.join(format(ord(i), '08b') for i in data)
    
    data_index = 0
    data_len = len(binary_data)
    
    # Copy image to avoid modifying original in-place if passed by ref
    output = image_np.copy()
    
    for row in output:
        for pixel in row:
            for channel in range(3): # R, G, B
                if data_index < data_len:
                    # Clear the LSB (254 is 11111110) and set it to our data bit
                    pixel[channel] = (int(pixel[channel]) & 254) | int(binary_data[data_index])
                    data_index += 1
                else:
                    return output
    return output

def extract_watermark(image_np):
    """
    Extracts hidden data from the least significant bits.
    """
    binary_data = ""
    for row in image_np:
        for pixel in row:
            for channel in range(3):
                binary_data += str(pixel[channel] & 1)
                
    # Convert bits to chars
    all_bytes = [binary_data[i:i+8] for i in range(0, len(binary_data), 8)]
    decoded_data = ""
    for byte in all_bytes:
        decoded_data += chr(int(byte, 2))
        if "####" in decoded_data:
            return decoded_data.replace("####", "")
            
    return "No Watermark Found"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["hash", "seal", "unseal", "inject", "extract"])
    parser.add_argument("--key", default="SUPER_SECRET_KEY_123")
    parser.add_argument("--data", default="")
    
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
        mask = generate_key_mask(img.shape, args.key)
        recovered = np.bitwise_xor(img, mask)
        recovered_pil = Image.fromarray(cv2.cvtColor(recovered, cv2.COLOR_BGR2RGB))
        print(str(imagehash.phash(recovered_pil)))

    elif args.action == "inject":
        image_bytes = sys.stdin.buffer.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        injected = inject_watermark(img, args.data)
        _, buffer = cv2.imencode(".png", injected)
        sys.stdout.buffer.write(buffer.tobytes())

    elif args.action == "extract":
        image_bytes = sys.stdin.buffer.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        print(extract_watermark(img))

if __name__ == "__main__":
    main()
