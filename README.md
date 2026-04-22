# Digital Watermarking Service (Node.js + Python Hybrid)

A high-performance backend for image/video ownership protection using perceptual fingerprinting and bit-plane "sealing". This version uses **Express (Node.js)** for the server base and **Firebase Admin SDK (Node.js)** for data management.

## Prerequisites
- Node.js 16+ & Python 3.10+
- Firebase Project with Firestore and Storage enabled.
- A Firebase Service Account Key (`serviceAccountKey.json`).

## Setup

1. **Install Python Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Install Node.js Dependencies**:
   ```bash
   npm install
   ```

3. **Configuration**:
   - Place your `serviceAccountKey.json` in the root directory.
   - Update `.env` with your `FIREBASE_STORAGE_BUCKET`, `FIREBASE_SERVICE_ACCOUNT_PATH`, and a custom `OWNERSHIP_PRIVATE_KEY`.

4. **Run the Service**:
   ```bash
   node server.js
   ```

## Architecture
- **Node.js (Express)**: Manages API routes, file uploads (Multer), and Firebase interactions.
- **Python CLI (`security_cli.py`)**: Handles bit-plane sealing (OpenCV/NumPy) and perceptual hashing (ImageHash) for maximum efficiency and logic preservation.

## API Endpoints

### 1. Seal Ownership
`POST /seal?owner_id=USER_123`
- **Body**: Multipart file upload (image).
- **Process**:
  - Computes `pHash`.
  - Checks Firestore for existing hashes (Hamming Distance < 5).
  - If unique, applies pixel-level XOR encryption via the Private Key.
  - Uploads "Sealed" image to Firebase Storage.
  - Returns `transaction_id`.

### 2. Verify Ownership
`POST /verify`
- **Body**: Multipart file upload ("Sealed" image).
- **Process**:
  - Reverses the seal using the Private Key.
  - Computes the `pHash` of the recovered image.
  - Matches against the Firestore record.
  - Returns `Verified` or `Tampered` status.

## Security Features
- **Immutable Seal**: Uses Spatial Domain XOR Encryption. Any attempt to overwrite bits or re-watermark results in bit-interference, causing significant visual distortion (noise) upon recovery.
- **Perceptual Integrity**: `phash` ensures that even if the image is resized or slightly compressed, the identity remains intact.
