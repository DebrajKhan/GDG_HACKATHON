const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = 8000;

// Supabase Initialization
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PRIVATE_KEY = process.env.OWNERSHIP_PRIVATE_KEY || "SUPER_SECRET_KEY_123";

let supabase;
let mockMode = false;

if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes("your-project-id")) {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("✅ Supabase Connected");
} else {
    console.warn("⚠️ Supabase credentials missing or default. Entering MOCK MODE.");
    mockMode = true;
}

app.use(cors());
app.use(express.json());
app.use(express.static("."));

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
const BRIDGE_SCRIPT = `
<script>
    document.addEventListener('DOMContentLoaded', () => {
        const sections = document.querySelectorAll('.view-section');
        const navBtns = document.querySelectorAll('.nav-btn');

        function switchView(targetId) {
            sections.forEach(s => s.classList.toggle('active', s.id === targetId));
            navBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-target') === targetId));
        }

        // 1. Vault Sealing
        const vaultBtn = document.getElementById('secure-vault-btn');
        if (vaultBtn) {
            vaultBtn.addEventListener('click', async (e) => {
                const ownerId = document.getElementById('owner-id').value.trim();
                const file = document.getElementById('protect-file-input').files[0];
                if (!ownerId || !file) return;

                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch(\`/seal?owner_id=\${encodeURIComponent(ownerId)}\`, {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if (response.ok) alert(\`✅ Success! Registered in Supabase.\\nID: \${result.transaction_id}\`);
                    else alert(\`❌ Error: \${result.error}\`);
                } catch (err) { console.error(err); }
            }, true);
        }

        // 2. Library Logic
        const libraryLink = document.querySelector('[data-action="library"]');
        const libraryGrid = document.getElementById('library-grid');

        if (libraryLink) {
            libraryLink.addEventListener('click', async (e) => {
                e.preventDefault();
                switchView('library-section');
                
                libraryGrid.innerHTML = '<div class="loading-spinner">Accessing Supabase Vault...</div>';

                try {
                    const response = await fetch('/library');
                    const data = await response.json();
                    
                    libraryGrid.innerHTML = '';
                    if (data.length === 0) {
                        libraryGrid.innerHTML = '<div class="loading-spinner">No assets secured yet.</div>';
                        return;
                    }

                    data.forEach(item => {
                        const card = document.createElement('div');
                        card.className = 'asset-card';
                        card.innerHTML = \`
                            <div class="asset-header">
                                <span class="asset-owner">\${item.owner_id}</span>
                                <span class="asset-date">\${new Date(item.created_at).toLocaleDateString()}</span>
                            </div>
                            <div class="asset-id">TX: \${item.transaction_id}</div>
                            <div class="asset-actions">
                                <a href="\${item.original_url}" target="_blank" class="btn-small btn-view-original">Original</a>
                                <a href="\${item.sealed_url}" target="_blank" class="btn-small btn-view-sealed">Sealed</a>
                            </div>
                        \`;
                        libraryGrid.appendChild(card);
                    });
                } catch (err) {
                    libraryGrid.innerHTML = '<div class="loading-spinner">Error loading library.</div>';
                }
            });
        }

        // 3. Verify Logic
        const verifyInput = document.getElementById('verify-file-input');
        if (verifyInput) {
            verifyInput.addEventListener('change', async () => {
                const file = verifyInput.files[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const response = await fetch('/verify', { method: 'POST', body: formData });
                    const result = await response.json();
                    alert(\`Verification Result: \${result.status}\\nOwner: \${result.owner_id || 'N/A'}\`);
                } catch (err) { console.error(err); }
            });
        }
    });
</script>
`;

app.get("/", (req, res) => {
    let content = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
    content = content.replace("</body>", BRIDGE_SCRIPT + "</body>");
    res.send(content);
});

// Main Sealing Route
app.post("/seal", upload.single("file"), async (req, res) => {
    const { owner_id } = req.query;
    if (!req.file || !owner_id) return res.status(400).json({ error: "Missing file or owner_id" });

    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const transaction_id = uuidv4();
        
        // 1. Process Logic via Python
        const phashBuffer = await callPython("hash", PRIVATE_KEY, fileBuffer);
        const currentPhash = phashBuffer.toString().trim();
        const sealedBuffer = await callPython("seal", PRIVATE_KEY, fileBuffer);

        let originalUrl = "http://mock.com/original.png";
        let sealedUrl = "http://mock.com/sealed.png";

        if (!mockMode) {
            // 2. Upload Original Image
            const originalPath = `originals/${transaction_id}_${req.file.originalname}`;
            await supabase.storage.from("assets").upload(originalPath, fileBuffer, { contentType: req.file.mimetype });
            originalUrl = supabase.storage.from("assets").getPublicUrl(originalPath).data.publicUrl;

            // 3. Upload Sealed Image
            const sealedPath = `sealed/${transaction_id}_sealed.png`;
            await supabase.storage.from("assets").upload(sealedPath, sealedBuffer, { contentType: "image/png" });
            sealedUrl = supabase.storage.from("assets").getPublicUrl(sealedPath).data.publicUrl;

            // 4. Save Metadata to DB
            const { error } = await supabase.table("ownership").insert({
                owner_id,
                transaction_id,
                phash_value: currentPhash,
                original_url: originalUrl,
                sealed_url: sealedUrl,
                created_at: new Date()
            });
            if (error) throw error;
        }

        // Cleanup
        fs.unlinkSync(req.file.path);

        res.json({
            status: "Sealed & Registered in Supabase",
            transaction_id,
            original_url: originalUrl,
            sealed_url: sealedUrl
        });

    } catch (err) {
        console.error("Seal Error:", err);
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
            return res.json({ status: "Verified", owner_id: "MOCK_OWNER", transaction_id: "MOCK_TXN_123" });
        }

        // Search Supabase
        const { data, error } = await supabase.table("ownership").select("*").eq("phash_value", recoveredHash).single();
        fs.unlinkSync(req.file.path);

        if (error || !data) {
            return res.status(404).json({ status: "Tampered or Unregistered", message: "No ownership record found." });
        }

        res.json({ status: "Verified", owner_id: data.owner_id, transaction_id: data.transaction_id, original_url: data.original_url });

    } catch (err) {
        console.error("Verify Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Library Route - Fetch History from Supabase
app.get("/library", async (req, res) => {
    if (mockMode) {
        return res.json([{ 
            owner_id: "MockUser", 
            transaction_id: "123", 
            original_url: "#", 
            sealed_url: "#", 
            created_at: new Date() 
        }]);
    }

    try {
        const { data, error } = await supabase
            .from("ownership")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Supabase-Powered Backend running at http://localhost:${PORT}`);
});
