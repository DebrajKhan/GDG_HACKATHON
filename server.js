const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { db, bucket, mockMode, admin } = require("./firebaseConfig");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = 8000;
const PRIVATE_KEY = process.env.OWNERSHIP_PRIVATE_KEY || "SUPER_SECRET_KEY_123";

app.use(cors());
app.use(express.json());
app.use(express.static(".")); // Serve frontend

// Helper to call Python CLI
function callPython(action, key, buffer) {
    return new Promise((resolve, reject) => {
        const py = spawn("python", ["security_cli.py", action, "--key", key]);
        let output = [];
        let error = "";

        py.stdin.write(buffer);
        py.stdin.end();

        py.stdout.on("data", (data) => output.push(data));
        py.stderr.on("data", (data) => error += data.toString());
        
        py.on("close", (code) => {
            if (code !== 0) reject(error || `Python process exited with code ${code}`);
            else resolve(Buffer.concat(output));
        });
    });
}

// Routes
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/seal", upload.single("file"), async (req, res) => {
    const { owner_id } = req.query;
    if (!req.file || !owner_id) return res.status(400).json({ error: "Missing file or owner_id" });

    try {
        const fileBuffer = fs.readFileSync(req.file.path);

        // 1. Get phash from Python
        const phashBuffer = await callPython("hash", PRIVATE_KEY, fileBuffer);
        const currentPhash = phashBuffer.toString().trim();

        // 2. Check duplicates in Firestore
        if (!mockMode) {
            const snapshot = await db.collection("ownership").get();
            // Note: In real setup, use specialized index. This is a simple linear search for demo.
            for (const doc of snapshot.docs) {
                const existing = doc.data();
                // Simple exact match or logic here. 
                // For Hamming distance, we'd ideally do it in Node or Python.
                if (existing.pHash_value === currentPhash) {
                    fs.unlinkSync(req.file.path);
                    return res.status(409).json({
                        status: "Already Claimed",
                        owner_id: existing.owner_id,
                        timestamp: existing.timestamp?.toDate()
                    });
                }
            }
        }

        // 3. Apply Seal via Python
        const sealedBuffer = await callPython("seal", PRIVATE_KEY, fileBuffer);
        const transaction_id = uuidv4();
        const sealedPath = `sealed_${transaction_id}.png`;
        fs.writeFileSync(sealedPath, sealedBuffer);

        // 4. Upload to Storage
        let storageUrl = "http://mockstorage.com/demo.png";
        if (!mockMode) {
            const blob = bucket.file(`sealed/${transaction_id}.png`);
            await blob.save(sealedBuffer, { contentType: "image/png" });
            storageUrl = `https://storage.googleapis.com/${bucket.name}/sealed/${transaction_id}.png`;
            
            // Save Metadata
            await db.collection("ownership").doc(transaction_id).set({
                owner_id,
                pHash_value: currentPhash,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                transaction_id
            });
        }

        // Cleanup
        fs.unlinkSync(req.file.path);
        if (fs.existsSync(sealedPath)) fs.unlinkSync(sealedPath);

        res.json({
            status: "Sealed & Registered",
            transaction_id,
            pHash: currentPhash,
            storage_url: storageUrl
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/verify", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    try {
        const fileBuffer = fs.readFileSync(req.file.path);

        // 1. Recover hash using Python unseal action
        const recoveredHashBuffer = await callPython("unseal", PRIVATE_KEY, fileBuffer);
        const recoveredHash = recoveredHashBuffer.toString().trim();

        if (mockMode) {
            return res.json({
                status: "Verified",
                owner_id: "MOCK_OWNER",
                transaction_id: "MOCK_TXN_123"
            });
        }

        // 2. Lookup in Firestore
        const query = await db.collection("ownership").where("pHash_value", "==", recoveredHash).limit(1).get();
        
        fs.unlinkSync(req.file.path);

        if (query.empty) {
            return res.status(404).json({ status: "Tampered or Unregistered", message: "No ownership record found." });
        }

        const data = query.docs[0].data();
        res.json({
            status: "Verified",
            owner_id: data.owner_id,
            transaction_id: data.transaction_id
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Node.js Backend running at http://localhost:${PORT}`);
});
