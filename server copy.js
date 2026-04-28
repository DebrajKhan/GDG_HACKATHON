/**
 * BroadcastShield — Main Server
 *
 * Orchestrates the dual-layer pipeline:
 *   OBS → [Layer A: Compositor] → [Layer B: Steg Transcoder] → Platform
 *
 * REST API (consumed by the dashboard):
 *   POST /api/sessions                  Create a new session
 *   GET  /api/sessions                  List all sessions
 *   GET  /api/sessions/:id              Get session details
 *   POST /api/sessions/:id/start        Start compositing + transcoding
 *   POST /api/sessions/:id/stop         Stop pipeline
 *   GET  /api/sessions/:id/stats        Live stats
 *   POST /api/forensic/decode           Attempt forensic recovery from uploaded frame
 *   GET  /api/health                    Health check
 *
 * WebSocket:
 *   ws://host/ws  — real-time stats & events pushed to the dashboard
 */

'use strict';

const express    = require('express');
const cors       = require('cors');
const http       = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');

const { SessionManager, SteganographyPipeline, forensicDecode } = require('./steg-engine');
const { Compositor } = require('./compositor');

// ─── App Setup ────────────────────────────────────────────────────────────────

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const sessionManager = new SessionManager();
const activePipelines = new Map();   // sessionId → { compositor, stegPipeline }

// ─── WebSocket Broadcast ──────────────────────────────────────────────────────

function wsBroadcast(event, data) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    event: 'connected',
    data:  { activeSessions: sessionManager.sessions.size },
    ts:    Date.now(),
  }));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionToDTO(session) {
  const pipeline = activePipelines.get(session.id);
  return {
    id:         session.id,
    meta:       session.meta,
    createdAt:  new Date(session.createdAt).toISOString(),
    frameCount: session.frameCount,
    embedCount: session.embedCount,
    active:     !!pipeline,
    stats:      pipeline?.compositor.getStats() ?? null,
    protection: {
      layerA: 'visible_watermark',
      layerB: 'lsb_steganography',
    },
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status:   'ok',
    sessions: sessionManager.sessions.size,
    active:   activePipelines.size,
    uptime:   process.uptime(),
  });
});

// Create session
app.post('/api/sessions', (req, res) => {
  const { label, viewerId, streamKey, ipAddress } = req.body ?? {};

  const session = sessionManager.createSession({
    label:     label ?? 'Unnamed Session',
    viewerId:  viewerId ?? uuidv4(),
    streamKey: streamKey ?? null,
    ipAddress: ipAddress ?? req.ip,
  });

  wsBroadcast('session:created', sessionToDTO(session));
  res.status(201).json(sessionToDTO(session));
});

// List sessions
app.get('/api/sessions', (_req, res) => {
  const list = [...sessionManager.sessions.values()].map(sessionToDTO);
  res.json({ sessions: list, total: list.length });
});

// Get session
app.get('/api/sessions/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(sessionToDTO(session));
});

// Start pipeline for a session
app.post('/api/sessions/:id/start', async (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (activePipelines.has(session.id)) {
    return res.status(409).json({ error: 'Pipeline already running' });
  }

  const {
    obsRtmpUrl      = 'rtmp://localhost:1935/live/obs',
    platformRtmpUrl = 'rtmp://a.rtmp.youtube.com/live2/STREAM_KEY',
    watermark       = {},
  } = req.body ?? {};

  try {
    // ── Layer A: Compositor ───────────────────────────────────────────────
    const compositor = new Compositor({
      obsRtmpUrl,
      platformRtmpUrl,
      session,
      watermarkConfig: {
        label:           watermark.label          ?? session.meta.label,
        bug:             watermark.bug            ?? '●SHIELD',
        opacity:         watermark.opacity        ?? 0.35,
        fontSize:        watermark.fontSize       ?? 28,
        driftSpeed:      watermark.driftSpeed     ?? 0.002,
        enableDrift:     watermark.enableDrift    !== false,
        enableCornerBug: watermark.enableCornerBug !== false,
        enableTimestamp: watermark.enableTimestamp !== false,
      },
      onStats: (stats) => wsBroadcast('stats:update', { sessionId: session.id, ...stats }),
    });

    // ── Layer B: Steganography pipeline ───────────────────────────────────
    // In production this hooks into the FFmpeg rawvideo pipe;
    // here we initialise the pipeline object and attach it.
    const stegPipeline = new SteganographyPipeline(session);

    // NOTE: Full integration pipes rawvideo frames from compositor stdout
    // through stegPipeline.processFrame() before re-encoding.
    // The hook point is in compositor.js line marked "STEG_HOOK".

    activePipelines.set(session.id, { compositor, stegPipeline });

    // Start compositor (non-blocking — FFmpeg starts in background)
    // In demo/test mode we skip actual FFmpeg if obs URL is 'demo'
    if (obsRtmpUrl !== 'demo') {
      await compositor.start();
    } else {
      // Simulate frame processing for demo dashboard
      startDemoSimulation(session, stegPipeline);
    }

    wsBroadcast('pipeline:started', { sessionId: session.id });
    res.json({ started: true, session: sessionToDTO(session) });

  } catch (err) {
    activePipelines.delete(session.id);
    res.status(500).json({ error: err.message });
  }
});

// Stop pipeline
app.post('/api/sessions/:id/stop', (req, res) => {
  const session  = sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const pipeline = activePipelines.get(session.id);
  if (!pipeline) return res.status(404).json({ error: 'No active pipeline' });

  pipeline.compositor.stop();
  activePipelines.delete(session.id);

  wsBroadcast('pipeline:stopped', { sessionId: session.id });
  res.json({ stopped: true, session: sessionToDTO(session) });
});

// Live stats
app.get('/api/sessions/:id/stats', (req, res) => {
  const session  = sessionManager.getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const pipeline = activePipelines.get(session.id);
  res.json({
    sessionId:  session.id,
    active:     !!pipeline,
    frameCount: session.frameCount,
    embedCount: session.embedCount,
    compositorStats: pipeline?.compositor.getStats() ?? null,
  });
});

// Forensic decode — POST a frame (base64 RGBA) + metadata
app.post('/api/forensic/decode', (req, res) => {
  const { frameBase64, width, height, frameNumber } = req.body ?? {};

  if (!frameBase64 || !width || !height) {
    return res.status(400).json({ error: 'Missing frame data' });
  }

  try {
    const pixelBuf = Buffer.from(frameBase64, 'base64');
    const allSessions = [...sessionManager.sessions.values()];

    const result = forensicDecode(
      pixelBuf,
      parseInt(width),
      parseInt(height),
      parseInt(frameNumber ?? 0),
      allSessions
    );

    if (result.found) {
      const resolved = sessionManager.resolveForensic(result.sessionId);
      res.json({ ...result, resolved });
    } else {
      res.json({ found: false, message: 'No matching session found in payload' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Demo Simulation ──────────────────────────────────────────────────────────

function startDemoSimulation(session, stegPipeline) {
  const interval = setInterval(() => {
    const pipeline = activePipelines.get(session.id);
    if (!pipeline) { clearInterval(interval); return; }

    // Simulate 30fps processing
    for (let f = 0; f < 30; f++) {
      const dummyFrame = Buffer.alloc(1280 * 720 * 4, 128);
      stegPipeline.processFrame(dummyFrame, 1280, 720);
    }

    wsBroadcast('stats:update', {
      sessionId:  session.id,
      framesOut:  session.frameCount,
      embedCount: session.embedCount,
      uptimeMs:   Date.now() - session.createdAt,
    });
  }, 1000);
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
server.listen(PORT, () => {
  console.log(`BroadcastShield server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`\nDual-Layer Protection:`);
  console.log(`  Layer A [Client]: Visible watermarks via FFmpeg filtergraph`);
  console.log(`  Layer B [Server]: LSB steganography via pixel-level bit injection`);
});

module.exports = { app, server };
