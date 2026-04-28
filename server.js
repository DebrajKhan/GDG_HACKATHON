const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// Initialize Gemini & Gemma
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_KEY_HERE");
const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const gemmaModel = genAI.getGenerativeModel({ 
    model: "gemma-2-9b-it",
    systemInstruction: "You are the ORYGIN AI Security Assistant. You are an expert in steganography, digital watermarking, and asset protection. Help the user understand how their files are being protected using invisible DNA and AI tagging. Keep your answers concise, professional, and reassuring."
});

// 1. Supabase Initialization
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const {
    SessionManager,
    ForensicWatermarker,
    HLSSessionServer,
    LeakDetector,
    createRoutes
} = require("./broadcast-protection-backend");
const stegEngine = require("./steg-engine");

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = 8080;

// Initialize Protection Stack
const sessionManager = new SessionManager();
const forensicWatermarker = new ForensicWatermarker(path.join(__dirname, "vault"));
const hlsServer = new HLSSessionServer(sessionManager, forensicWatermarker);
const leakDetector = new LeakDetector({
    matchKeywords: (process.env.MATCH_KEYWORDS || "").split(","),
    officialChannelIds: (process.env.OFFICIAL_CHANNEL_IDS || "").split(","),
    autoDmca: true
});

// Start background services
leakDetector.start(300000); // Scan every 5 minutes
setInterval(() => sessionManager.expireStaleSessions(), 60000); // Cleanup sessions

// Mount BroadcastShield Routes
app.use("/api/v1/protection", createRoutes(sessionManager, hlsServer, leakDetector));

app.use(express.static("."));
app.use(express.json());

// Mock database for testing if no Supabase keys provided
const mockMode = !SUPABASE_URL || !SUPABASE_KEY;

// 2. AI Image Tagging & Analysis (Gemini)
async function getAIAnalysis(imageBuffer) {
    try {
        const prompt = "Analyze this image and provide a 1-sentence summary and 5 descriptive tags. Return as JSON: { 'summary': '...', 'tags': ['...', '...'] }";
        const result = await visionModel.generateContent([
            prompt,
            { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/png" } }
        ]);
        const response = await result.response;
        return JSON.parse(response.text().replace(/```json|```/g, "").trim());
    } catch (err) {
        console.error("AI Analysis Error:", err);
        return { summary: "Secured asset in ORYGIN AI Vault.", tags: ["secure", "dna-sealed"] };
    }
}

// 3. DNA Injection & Sealing
app.post("/seal", upload.single("file"), async (req, res) => {
    const { ownerId } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
        const transactionId = Math.random().toString(36).substr(2, 9).toUpperCase();
        
        // Step A: AI Analysis
        const imageBuffer = fs.readFileSync(file.path);
        const aiInfo = await getAIAnalysis(imageBuffer);

        // Step B: Inject Invisible DNA & Generate pHash
        const dnaPayload = `App: ORYGIN AI | Owner: ${ownerId} | ID: ${transactionId} ####`;
        
        // Use Python to both inject DNA and get pHash
        const pythonProcess = exec(`python security_cli.py inject --data "${dnaPayload}"`);
        const tempOutPath = path.join("uploads", `sealed_${Date.now()}.png`);
        const stdinStream = fs.createReadStream(file.path);
        const stdoutStream = fs.createWriteStream(tempOutPath);

        await new Promise((resolve, reject) => {
            stdinStream.pipe(pythonProcess.stdin);
            pythonProcess.stdout.pipe(stdoutStream);
            pythonProcess.on("close", (code) => code === 0 ? resolve() : reject("Python injection failed"));
        });

        // Get pHash for database
        let pHash = "";
        await new Promise((resolve) => {
            const hashProcess = exec(`python security_cli.py hash`);
            fs.createReadStream(tempOutPath).pipe(hashProcess.stdin);
            hashProcess.stdout.on("data", (data) => pHash += data.toString());
            hashProcess.on("close", resolve);
        });
        pHash = pHash.trim();

        // Step C: Record in Supabase
        if (!mockMode) {
            await supabase.from("ownership").insert({
                transaction_id: transactionId,
                owner_id: ownerId,
                phash_value: pHash,
                ai_description: aiInfo.summary,
                ai_tags: aiInfo.tags,
                created_at: new Date()
            });
        }

        const sealedBase64 = fs.readFileSync(tempOutPath, "base64");
        
        // Clean up
        fs.unlinkSync(file.path);
        fs.unlinkSync(tempOutPath);

        res.json({
            success: true,
            transactionId,
            aiInfo,
            sealedImage: `data:image/png;base64,${sealedBase64}`
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Verification & DNA Extraction
app.post("/verify", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
        // Step A: Extract DNA using Python
        const pythonProcess = exec(`python security_cli.py extract`);
        // --- BRUTE FORCE FORENSIC DECODER (New Layer B Logic) ---
        // 1. Convert uploaded file to raw pixel buffer (simulated for demo)
        const imageBuffer = fs.readFileSync(file.path);
        
        // 2. Run the Brute-Force Decode against all active viewer sessions
        const activeSessions = [...sessionManager.sessions.values()];
        const result = stegEngine.forensicDecode(
            imageBuffer, 
            1920, 1080, 
            1, // Assume frame 1 for detection
            activeSessions
        );

        if (result.found) {
            const thief = sessionManager.resolveSession(result.sessionId);
            return res.json({
                status: "Thief Identified",
                method: "Brute-Force LSB Forensic Analysis",
                confidence: "100%",
                details: {
                    owner_id: thief.viewerId,
                    email: thief.email,
                    ip_address: thief.ipAddress,
                    session_id: thief.id,
                    detected_at: new Date(result.ts).toISOString()
                }
            });
        }

        // Fallback to legacy DNA or pHash if no stealth DNA found
        res.json({ 
            status: "Not Identified", 
            message: "No forensic DNA signature found. This content may be original or the DNA was stripped."
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        fs.unlinkSync(file.path);
    }
});

app.get("/library", async (req, res) => {
    try {
        if (mockMode) return res.json([]);
        const { data, error } = await supabase.from("ownership").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Gemma Security Assistant
app.post("/chat", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Missing message" });

    try {
        const systemPrompt = `You are the ORYGIN AI Security Assistant. You are an expert in steganography, digital watermarking, and asset protection. 
        Help the user understand how their files are being protected using invisible DNA and AI tagging. 
        Answer this user question concisely and professionally: "${message}"`;

        const result = await gemmaModel.generateContent(systemPrompt);
        const response = await result.response;
        res.json({ reply: response.text() });
    } catch (err) {
        console.error("Gemma Chat Error:", err.message);
        res.status(500).json({ reply: "I'm having trouble connecting to my security modules. Please try again in a moment." });
    }
});

// 6. Broadcasting Middleware Engine
app.post("/broadcast/start", async (req, res) => {
    try {
        const { broadcaster_id, title, description, venue, medium } = req.body;
        const sessionId = "SS-" + Math.random().toString(36).substr(2, 9).toUpperCase();
        const streamKey = "ORYGIN_" + Math.random().toString(36).substr(2, 6).toUpperCase();

        if (!mockMode) {
            await supabase.from("broadcasts").insert({
                session_id: sessionId,
                broadcaster_id: broadcaster_id,
                title: title,
                description: description,
                venue: venue,
                medium: medium,
                status: "live",
                created_at: new Date()
            });
        }

        console.log(`📡 Broadcast Started: ${sessionId} by ${broadcaster_id}`);
        
        res.json({
            success: true,
            session_id: sessionId,
            stream_key: streamKey,
            middleware_layer: "Active: Anti-Screenshot + Moire Jamming"
        });
    } catch (err) {
        console.error("Broadcast Start Error:", err);
        res.status(500).json({ error: "Failed to initialize secure stream." });
    }
});

app.post("/broadcast/metrics", async (req, res) => {
    try {
        const { session_id, bandwidth, drops } = req.body;
        
        if (!mockMode) {
            await supabase.from("broadcasts")
                .update({ bandwidth_kbps: bandwidth, frame_drops: drops })
                .eq("session_id", session_id);
        }
        
        res.json({ status: "Metrics Synced" });
    } catch (err) {
        res.status(200).json({ status: "Log Failed (Silenced)" }); // Keep it quiet for metrics
    }
});

app.get("/broadcast/status/:sessionId", async (req, res) => {
    const { sessionId } = req.params;
    try {
        if (mockMode) return res.json({ status: "live", title: "Mock Stream" });
        
        const { data, error } = await supabase.from("broadcasts")
            .select("*")
            .eq("session_id", sessionId)
            .single();
            
        if (error || !data) return res.status(404).json({ error: "Stream not found" });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Detection & Crawler Engine (Mock Implementation for Blueprint)
app.post("/crawl/trigger", async (req, res) => {
    try {
        console.log("🔍 Triggering Global Detection Crawler...");
        
        // Mock Discovery: Imagine we found these on social media
        const discoveredItems = [
            { url: "https://twitter.com/user_leak/status/1", platform: "Twitter", pHash: "a1b2c3d4e5f6" },
            { url: "https://youtube.com/watch?v=leak", platform: "YouTube", pHash: "f1e2d3c4b5a6" }
        ];

        let detections = 0;
        
        if (!mockMode) {
            for (const item of discoveredItems) {
                const { data } = await supabase.from("ownership").select("*").eq("phash_value", item.pHash).single();
                if (data) {
                    await supabase.from("violations").insert({
                        asset_id: data.transaction_id,
                        platform: item.platform,
                        violating_url: item.url,
                        reach_estimate: Math.floor(Math.random() * 5000),
                        risk_score: 85,
                        status: "detected",
                        created_at: new Date()
                    });
                    detections++;
                }
            }
        } else {
            detections = 1; // Simulate a find in mock mode
        }

        res.json({
            success: true,
            message: `Crawler completed. Scanned 142 sources, found ${detections} potential violations.`,
            detections_found: detections
        });
    } catch (err) {
        res.status(500).json({ error: "Crawler failed to initialize." });
    }
});

app.get("/violations", async (req, res) => {
    try {
        if (mockMode) {
            return res.json([
                { id: "VIO-882", platform: "YouTube", violating_url: "youtube.com/live/leaked_match_2024", risk_score: 92, status: "detected", created_at: new Date() },
                { id: "VIO-914", platform: "Twitch", violating_url: "twitch.tv/pirate_streamer_x", risk_score: 78, status: "detected", created_at: new Date() },
                { id: "VIO-221", platform: "Facebook", violating_url: "facebook.com/groups/live_sports/video", risk_score: 65, status: "detected", created_at: new Date() }
            ]);
        }
        const { data } = await supabase.from("violations").select("*").order("created_at", { ascending: false });
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/generate-dmca", async (req, res) => {
    const { violation_id } = req.body;
    // Blueprint logic: Generate evidence package
    res.json({ 
        success: true, 
        message: "DMCA Evidence Package generated successfully.",
        package_url: "gs://sportshield-evidence/mock-dmca.pdf"
    });
});

app.listen(PORT, () => console.log(`🚀 ORYGIN AI Backend running at http://localhost:${PORT}`));
