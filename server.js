const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

// 1. Supabase Initialization
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

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

const upload = multer({ dest: "uploads/" });
const PORT = 8080;

// ... Supabase Init ...
// (Inside section 4. API Routes)

// AUTH: Register User
app.post("/register", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { data, error } = await supabase.from("users").insert({ email, password: hashedPassword });
        
        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: "User already exists" });
            throw error;
        }
        res.json({ status: "Success", message: "User registered" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AUTH: Login User
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    try {
        const { data, error } = await supabase.from("users").select("*").eq("email", email).single();
        if (error || !data) return res.status(401).json({ error: "Invalid email or password" });

        const isMatch = await bcrypt.compare(password, data.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid email or password" });

        res.json({ status: "Success", user: { email: data.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Helper to call Python CLI

// 3. Helper to call Python CLI
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

// 4. API Routes
app.post("/seal", upload.single("file"), async (req, res) => {
    const { owner_id } = req.query;
    console.log(`\n--- Seal Request: ${owner_id} ---`);

    if (!req.file || !owner_id) return res.status(400).json({ error: "Missing file or owner_id" });

    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const transaction_id = uuidv4();
        
        const phashBuffer = await callPython("hash", PRIVATE_KEY, fileBuffer);
        const currentPhash = phashBuffer.toString().trim();
        const sealedBuffer = await callPython("seal", PRIVATE_KEY, fileBuffer);

        let originalUrl = "http://mock.com/original.png";
        let sealedUrl = "http://mock.com/sealed.png";

        if (!mockMode) {
            const originalPath = `originals/${transaction_id}_${req.file.originalname}`;
            await supabase.storage.from("assets").upload(originalPath, fileBuffer, { contentType: req.file.mimetype });
            originalUrl = supabase.storage.from("assets").getPublicUrl(originalPath).data.publicUrl;

            const sealedPath = `sealed/${transaction_id}_sealed.png`;
            await supabase.storage.from("assets").upload(sealedPath, sealedBuffer, { contentType: "image/png" });
            sealedUrl = supabase.storage.from("assets").getPublicUrl(sealedPath).data.publicUrl;

            await supabase.from("ownership").insert({
                owner_id,
                transaction_id,
                phash_value: currentPhash,
                original_url: originalUrl,
                sealed_url: sealedUrl,
                created_at: new Date()
            });
            console.log("✅ Saved to Supabase");
        }

        fs.unlinkSync(req.file.path);
        res.json({ status: "Success", transaction_id, original_url: originalUrl, sealed_url: sealedUrl });

    } catch (err) {
        console.error("❌ Seal Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post("/verify", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Missing file" });

    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const recoveredHashBuffer = await callPython("unseal", PRIVATE_KEY, fileBuffer);
        const recoveredHash = recoveredHashBuffer.toString().trim();

        if (mockMode) return res.json({ status: "Verified", owner_id: "MOCK_OWNER" });

        const { data, error } = await supabase.from("ownership").select("*").eq("phash_value", recoveredHash).single();
        fs.unlinkSync(req.file.path);

        if (error || !data) return res.status(404).json({ status: "Tampered" });
        res.json({ status: "Verified", owner_id: data.owner_id });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/library", async (req, res) => {
    console.log("--- Library Request ---");
    if (mockMode) return res.json([{ owner_id: "Mock", created_at: new Date() }]);

    try {
        const { data, error } = await supabase.from("ownership").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("❌ Library Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 5. Static Files (Move to the END)
app.use(express.static("."));

app.listen(PORT, () => {
    console.log(`🚀 Supabase-Powered Backend running at http://localhost:${PORT}`);
});
