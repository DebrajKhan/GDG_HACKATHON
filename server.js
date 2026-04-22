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
app.use(express.static(".")); // Serve frontend assets (CSS, JS, Images)

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

// --- BACKEND BRIDGE SCRIPT ---
// This script is injected into index.html to connect the UI to the real backend
const BRIDGE_SCRIPT = `
<script>
    document.addEventListener('DOMContentLoaded', () => {
        console.log("🚀 Backend Bridge Active");

        // 1. Hook into the "Secure Vault" button
        const vaultBtn = document.getElementById('secure-vault-btn');
        const ownerInput = document.getElementById('owner-id');
        const fileInput = document.getElementById('protect-file-input');

        if (vaultBtn) {
            vaultBtn.addEventListener('click', async (e) => {
                const ownerId = ownerInput.value.trim();
                const file = fileInput.files[0];

                if (!ownerId || !file) return; // Let app.js show its alerts

                const formData = new FormData();
                formData.append('file', file);

                try {
                    console.log("Sealing file via backend...");
                    const response = await fetch(\`/seal?owner_id=\${encodeURIComponent(ownerId)}\`, {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    
                    if (response.ok) {
                        console.log("✅ Successfully sealed:", result.transaction_id);
                    } else {
                        console.error("❌ Sealing failed:", result.error || result.status);
                    }
                } catch (err) {
                    console.error("❌ Connection error:", err);
                }
            }, true); // Use capture phase to run before app.js simulation
        }

        // 2. Hook into the "Verify" input
        const verifyInput = document.getElementById('verify-file-input');
        if (verifyInput) {
            verifyInput.addEventListener('change', async () => {
                const file = verifyInput.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    console.log("Verifying file via backend...");
                    const response = await fetch('/verify', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    
                    // We can show a custom toast with the result
                    const status = result.status === 'Verified' ? '✅ Authenticity Verified' : '❌ Tampering Detected';
                    const msg = result.status === 'Verified' ? \`Owner: \${result.owner_id}\` : result.message;
                    
                    alert(\`Verification Result:\\n\${status}\\n\${msg}\`);
                } catch (err) {
                    console.error("❌ Verification error:", err);
                }
            });
        }
    });
</script>
`;

// Routes
app.get("/", (req, res) => {
    let content = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    content = content.replace("</body>", BRIDGE_SCRIPT + "</body>");
    res.send(content);
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// API Routes
app.post("/seal", upload.single("file"), async (req, res) => {
    const { owner_id } = req.query;
    if (!req.file || !owner_id) return res.status(400).json({ error: "Missing file or owner_id" });

    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const phashBuffer = await callPython("hash", PRIVATE_KEY, fileBuffer);
        const currentPhash = phashBuffer.toString().trim();

        if (!mockMode) {
            const snapshot = await db.collection("ownership").get();
            for (const doc of snapshot.docs) {
                const existing = doc.data();
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

        const sealedBuffer = await callPython("seal", PRIVATE_KEY, fileBuffer);
        const transaction_id = uuidv4();
        
        let storageUrl = "http://mockstorage.com/demo.png";
        if (!mockMode) {
            const blob = bucket.file(`sealed/${transaction_id}.png`);
            await blob.save(sealedBuffer, { contentType: "image/png" });
            storageUrl = `https://storage.googleapis.com/${bucket.name}/sealed/${transaction_id}.png`;
            
            await db.collection("ownership").doc(transaction_id).set({
                owner_id,
                pHash_value: currentPhash,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                transaction_id
            });
        }

        fs.unlinkSync(req.file.path);
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
        const recoveredHashBuffer = await callPython("unseal", PRIVATE_KEY, fileBuffer);
        const recoveredHash = recoveredHashBuffer.toString().trim();

        if (mockMode) {
            return res.json({
                status: "Verified",
                owner_id: "MOCK_OWNER",
                transaction_id: "MOCK_TXN_123"
            });
        }

        const query = await db.collection("ownership").where("pHash_value", "==", recoveredHash).limit(1).get();
        fs.unlinkSync(req.file.path);

        if (query.empty) {
            return res.status(404).json({ status: "Tampered or Unregistered", message: "No ownership record found." });
        }

        const data = query.docs[0].data();
        res.json({ status: "Verified", owner_id: data.owner_id, transaction_id: data.transaction_id });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Hybrid Backend running at http://localhost:${PORT}`);
});
