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

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = 8080;

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

        // Step B: Inject Invisible DNA
        // DNA Payload format: App: ORYGIN AI | Owner: ID | ID: TRANS_ID ####
        const dnaPayload = `App: ORYGIN AI | Owner: ${ownerId} | ID: ${transactionId} ####`;
        const pythonProcess = exec(`python security_cli.py inject --data "${dnaPayload}"`);
        
        const tempOutPath = path.join("uploads", `sealed_${Date.now()}.png`);
        const stdinStream = fs.createReadStream(file.path);
        const stdoutStream = fs.createWriteStream(tempOutPath);

        const sealPromise = new Promise((resolve, reject) => {
            stdinStream.pipe(pythonProcess.stdin);
            pythonProcess.stdout.pipe(stdoutStream);
            pythonProcess.on("close", (code) => code === 0 ? resolve() : reject("Python injection failed"));
        });

        await sealPromise;

        // Step C: Record in Supabase
        if (!mockMode) {
            await supabase.from("ownership").insert({
                transaction_id: transactionId,
                owner_id: ownerId,
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
        
        let extractedDna = "";
        const extractionPromise = new Promise((resolve, reject) => {
            const stdinStream = fs.createReadStream(file.path);
            pythonProcess.stdin.write(fs.readFileSync(file.path));
            pythonProcess.stdin.end();

            pythonProcess.stdout.on("data", (data) => extractedDna += data.toString());
            pythonProcess.on("close", (code) => code === 0 ? resolve() : reject("DNA extraction failed"));
        });

        await extractionPromise;
        extractedDna = extractedDna.trim();

        // Parse DNA (e.g. ID: TRANS_ID)
        const match = extractedDna.match(/ID: ([A-Z0-9]+)/);
        if (match && match[1]) {
            const transId = match[1];
            
            // Check Database
            if (mockMode) {
                return res.json({ status: "Authentic", dna: extractedDna, details: { owner_id: "Demo Owner", ai_description: "Verified via Mock Mode" } });
            }

            const { data, error } = await supabase.from("ownership").select("*").eq("transaction_id", transId).single();
            if (data) {
                return res.json({ status: "Authentic", dna: extractedDna, details: data });
            }
        }

        res.json({ status: "Tampered", dna: extractedDna || "No DNA Found" });

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

app.listen(PORT, () => console.log(`🚀 ORYGIN AI Backend running at http://localhost:${PORT}`));
