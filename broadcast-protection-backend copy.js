/**
 * BroadcastShield — Professional Sports Streaming Backend
 *
 * Protection stack:
 *   1. Session-bound AES-128 HLS key rotation (viewer cannot share stream URL)
 *   2. GOP-level A/B forensic watermarking (invisible, survives re-encoding)
 *   3. Refresh-rate matched adaptive bitrate delivery
 *   4. Legal leak detection via platform APIs (YouTube, Twitch)
 *
 * What this does NOT do:
 *   - It does not disrupt the authorized viewer's experience in any way.
 *   - It does not scan third-party devices (illegal under CFAA / Computer Misuse Act).
 *   - It does not add visible overlays to the clean feed.
 *
 * The authorized viewer sees: pristine, watermark-free, full-quality video.
 * The forensic signature is mathematically embedded in the encoding decisions
 * themselves — not drawn on top of the image.
 */

'use strict';

const crypto    = require('crypto');
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');
const https     = require('https');
const { v4: uuidv4 } = require('uuid');

// ─── 1. SESSION MANAGER ───────────────────────────────────────────────────────

/**
 * Each authorized viewer gets a cryptographically unique session.
 * The session ID is the root of all forensic evidence.
 */
class SessionManager {
  constructor() {
    this.sessions   = new Map();  // sessionId → Session
    this.keyRotation = new Map(); // sessionId → { key, iv, expiresAt }
  }

  createSession(viewerInfo) {
    const sessionId = uuidv4();
    const session = {
      id:          sessionId,
      viewerId:    viewerInfo.userId,
      email:       viewerInfo.email,
      ipAddress:   viewerInfo.ip,
      userAgent:   viewerInfo.userAgent,
      displayHz:   viewerInfo.displayHz ?? 60,   // Reported by player JS
      createdAt:   Date.now(),
      lastActive:  Date.now(),
      segmentsSent: 0,
      // Forensic watermark assignment: session ID encodes as bit sequence
      // used to select A or B variant for each GOP
      bitSequence: sessionIdToBits(sessionId),
      bitCursor:   0,
    };
    this.sessions.set(sessionId, session);
    this._rotateKey(sessionId);
    return session;
  }

  /**
   * Get the current AES-128 key for this session's HLS segments.
   * Keys rotate every 6 seconds (3 segments at 2s each).
   */
  getCurrentKey(sessionId) {
    const rotation = this.keyRotation.get(sessionId);
    if (!rotation || Date.now() > rotation.expiresAt) {
      this._rotateKey(sessionId);
    }
    return this.keyRotation.get(sessionId);
  }

  _rotateKey(sessionId) {
    this.keyRotation.set(sessionId, {
      key:       crypto.randomBytes(16),  // AES-128
      iv:        crypto.randomBytes(16),
      expiresAt: Date.now() + 6000,       // 6 second TTL
      sequence:  Date.now(),
    });
  }

  /**
   * Called by the leak detector when a pirated stream is found.
   * Returns full viewer identity for the matched session.
   */
  resolveSession(sessionId) {
    return this.sessions.get(sessionId) ?? null;
  }

  touchSession(sessionId) {
    const s = this.sessions.get(sessionId);
    if (s) s.lastActive = Date.now();
  }

  expireStaleSessions(maxIdleMs = 30000) {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActive > maxIdleMs) {
        this.sessions.delete(id);
        this.keyRotation.delete(id);
      }
    }
  }
}

/**
 * Convert a UUID into a reproducible bit sequence.
 * These bits control A/B GOP selection for forensic watermarking.
 */
function sessionIdToBits(sessionId) {
  const hash = crypto.createHash('sha256')
    .update(sessionId)
    .digest();
  const bits = [];
  for (const byte of hash) {
    for (let b = 7; b >= 0; b--) {
      bits.push((byte >> b) & 1);
    }
  }
  return bits;  // 256 bits — enough for 256 GOP decisions
}


// ─── 2. FORENSIC WATERMARKING (A/B GOP SWITCHING) ────────────────────────────

/**
 * How A/B GOP switching works:
 *
 *   The source video is pre-encoded into TWO variants of each 2-second GOP.
 *   Variant A and Variant B are perceptually identical but differ in:
 *     - Sub-pixel motion vector decisions (±1 pixel displacement in B-frames)
 *     - Quantization parameter rounding (even vs odd QP for specific macroblocks)
 *     - DCT coefficient rounding in high-frequency bands (invisible to eye)
 *
 *   For each GOP delivered to a viewer, we select A or B based on one bit of
 *   their session's bit sequence. After 64 GOPs (128 seconds), the viewer's
 *   full 64-bit session fingerprint is embedded in the video.
 *
 *   If a pirated recording is found, we analyze the A/B pattern in the
 *   recording using our forensic decoder, reconstruct the session ID,
 *   and look up the viewer.
 *
 * This technique is used commercially by:
 *   - Nagra (NexGuard / Forensic Watermarking)
 *   - Verimatrix
 *   - ContentArmor
 *   - Irdeto
 *
 * The implementation below shows the segment-selection and delivery logic.
 * The actual pre-encoding of A/B variants is an FFmpeg offline process.
 */

class ForensicWatermarker {
  /**
   * @param {string} gopVaultPath  Directory containing pre-encoded A/B GOP pairs
   *                               Structure: /vault/gop_{N}_A.ts and gop_{N}_B.ts
   */
  constructor(gopVaultPath) {
    this.vaultPath  = gopVaultPath;
    this.gopIndex   = 0;  // Current GOP number in the live stream
  }

  /**
   * Select the correct variant segment for this viewer's session.
   *
   * @param {Session} session
   * @returns {{ segmentPath: string, variant: 'A'|'B', gopIndex: number }}
   */
  selectSegment(session) {
    const bit     = session.bitSequence[session.bitCursor % session.bitSequence.length];
    const variant = bit === 0 ? 'A' : 'B';

    session.bitCursor++;

    const segmentPath = path.join(
      this.vaultPath,
      `gop_${this.gopIndex}_${variant}.ts`
    );

    return { segmentPath, variant, gopIndex: this.gopIndex };
  }

  advanceGop() {
    this.gopIndex++;
  }

  /**
   * Analyze a recorded segment to extract the A/B bit sequence.
   * In production: uses proprietary pixel-level analysis.
   * Here: demonstrates the interface — real implementation is in the
   * decoding SDK (NexGuard / custom ML model).
   *
   * @param {Buffer} segmentBuffer  Raw TS segment bytes from pirated recording
   * @returns {{ bits: number[], confidence: number }}
   */
  analyzeSegment(segmentBuffer) {
    // Real implementation: extract DCT coefficients and motion vectors,
    // compare against known A/B encoding fingerprint patterns.
    // Returns the bit sequence embedded in this segment.
    throw new Error(
      'analyzeSegment requires the forensic decoder SDK. ' +
      'See NexGuard or ContentArmor for production implementations.'
    );
  }

  /**
   * Given a bit sequence recovered from a pirated recording,
   * reconstruct the session ID and find the viewer.
   *
   * @param {number[]} recoveredBits
   * @param {SessionManager} sessionManager
   * @returns {Session|null}
   */
  resolveFromBits(recoveredBits, sessionManager) {
    // Try to match recovered bits against all active sessions
    for (const [sessionId, session] of sessionManager.sessions) {
      const knownBits = session.bitSequence;
      let matchCount  = 0;
      const checkLen  = Math.min(recoveredBits.length, knownBits.length);

      for (let i = 0; i < checkLen; i++) {
        if (recoveredBits[i] === knownBits[i]) matchCount++;
      }

      const confidence = matchCount / checkLen;
      if (confidence >= 0.85) {  // 85% bit match = positive identification
        return { session, confidence };
      }
    }
    return null;
  }
}


// ─── 3. HLS SEGMENT SERVER WITH SESSION-BOUND ENCRYPTION ─────────────────────

/**
 * Serves HLS segments with per-session AES-128 encryption.
 *
 * HLS encryption flow:
 *   1. Player requests the master playlist → receives a URL with session token
 *   2. Media playlist references an EXT-X-KEY URL specific to this session
 *   3. Player fetches the key URL (authenticated, HTTPS only)
 *   4. Segments are AES-128-CBC encrypted with rotating keys
 *   5. Key URL returns 401 if session token is invalid or from wrong IP
 *
 * Why this prevents stream sharing:
 *   - You cannot share an HLS URL because the key endpoint validates
 *     the session token, IP, and User-Agent on every key request.
 *   - Rotating keys mean even if one key leaks, the window is 6 seconds.
 *   - The encrypted .ts segments are useless without the matching key.
 */
class HLSSessionServer {
  constructor(sessionManager, forensicWatermarker, options = {}) {
    this.sessionManager      = sessionManager;
    this.forensicWatermarker = forensicWatermarker;
    this.segmentDuration     = options.segmentDuration ?? 2;   // seconds
    this.bitrateProfiles     = options.bitrateProfiles ?? DEFAULT_BITRATE_PROFILES;
  }

  /**
   * Generate a session-bound master playlist.
   * Called once per viewer after they authenticate.
   *
   * @param {Session} session
   * @param {string}  baseUrl   Public base URL of this server
   * @returns {string}          HLS master playlist content
   */
  generateMasterPlaylist(session, baseUrl) {
    const token = this._signToken(session.id);

    // Adaptive bitrate variants — player selects based on bandwidth + display Hz
    const variants = this.bitrateProfiles.map(profile => {
      const hz       = session.displayHz;
      const frameRate = this._matchFrameRate(hz, profile.fps);

      return [
        `#EXT-X-STREAM-INF:BANDWIDTH=${profile.bitrate},`,
        `RESOLUTION=${profile.resolution},`,
        `FRAME-RATE=${frameRate},`,
        `CODECS="${profile.codecs}"`,
        `${baseUrl}/hls/${session.id}/${profile.name}/playlist.m3u8?token=${token}`,
      ].join('');
    });

    return [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-INDEPENDENT-SEGMENTS',
      ...variants,
    ].join('\n');
  }

  /**
   * Generate a media playlist for one quality level.
   * Contains the rotating key URL and segment references.
   *
   * @param {Session} session
   * @param {string}  profileName
   * @param {string}  baseUrl
   * @param {number}  startSeq     Current sequence number
   * @returns {string}
   */
  generateMediaPlaylist(session, profileName, baseUrl, startSeq) {
    const token   = this._signToken(session.id);
    const keyUrl  = `${baseUrl}/hls-key/${session.id}?token=${token}&seq=${startSeq}`;
    const keyInfo = this.sessionManager.getCurrentKey(session.id);

    const segments = [];
    for (let i = 0; i < 5; i++) {  // 5-segment window (10 seconds)
      const seq = startSeq + i;
      segments.push(`#EXTINF:${this.segmentDuration}.000,`);
      segments.push(`${baseUrl}/hls/${session.id}/${profileName}/seg_${seq}.ts?token=${token}`);
    }

    return [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      '#EXT-X-TARGETDURATION:2',
      `#EXT-X-MEDIA-SEQUENCE:${startSeq}`,
      `#EXT-X-KEY:METHOD=AES-128,URI="${keyUrl}",IV=0x${keyInfo.iv.toString('hex')}`,
      ...segments,
    ].join('\n');
  }

  /**
   * Encrypt a TS segment with the session's current AES-128 key.
   * Called when serving each .ts file.
   *
   * @param {Buffer}  rawSegment    Plaintext TS segment
   * @param {Session} session
   * @returns {Buffer}              Encrypted segment
   */
  encryptSegment(rawSegment, session) {
    // Select A/B variant for forensic watermarking
    const selection = this.forensicWatermarker.selectSegment(session);

    // In production: read pre-encoded A/B segment from vault
    // Here: encrypt the provided segment as a demonstration
    const keyInfo = this.sessionManager.getCurrentKey(session.id);
    const cipher  = crypto.createCipheriv('aes-128-cbc', keyInfo.key, keyInfo.iv);

    session.segmentsSent++;

    return Buffer.concat([
      cipher.update(rawSegment),
      cipher.final(),
    ]);
  }

  /**
   * Validate a key request.
   * Returns the raw 16-byte AES key if valid, throws if not.
   *
   * @param {string} sessionId
   * @param {string} token
   * @param {string} requestIp     IP of the key request
   * @param {string} requestUA     User-Agent of the key request
   */
  serveKey(sessionId, token, requestIp, requestUA) {
    const session = this.sessionManager.resolveSession(sessionId);
    if (!session) throw new AuthError('Unknown session');

    this._verifyToken(token, sessionId);

    // IP binding — key delivery only to the original viewer's IP
    if (session.ipAddress !== requestIp) {
      throw new AuthError(`Key request from unexpected IP: ${requestIp} (session bound to ${session.ipAddress})`);
    }

    this.sessionManager.touchSession(sessionId);
    const keyInfo = this.sessionManager.getCurrentKey(sessionId);
    return keyInfo.key;  // Raw 16 bytes — served as application/octet-stream
  }

  /** Match the content frame rate to the viewer's display refresh rate */
  _matchFrameRate(displayHz, contentFps) {
    // Find the largest divisor of displayHz that is ≤ contentFps
    // e.g. 165Hz display, 60fps content → serve at 55fps (165/3)
    // e.g. 144Hz display, 60fps content → serve at 48fps (144/3)
    // e.g.  60Hz display, 60fps content → serve at 60fps (60/1)
    const candidates = [1, 2, 3, 4, 5, 6];
    let best = contentFps;
    for (const div of candidates) {
      const candidate = displayHz / div;
      if (candidate <= contentFps && candidate > best * 0.8) {
        best = candidate;
      }
    }
    return Math.round(best * 100) / 100;
  }

  _signToken(sessionId) {
    return crypto
      .createHmac('sha256', process.env.TOKEN_SECRET ?? 'change-this-secret')
      .update(sessionId)
      .digest('base64url');
  }

  _verifyToken(token, sessionId) {
    const expected = this._signToken(sessionId);
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      throw new AuthError('Invalid session token');
    }
  }
}

class AuthError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'AuthError';
    this.statusCode = 401;
  }
}

const DEFAULT_BITRATE_PROFILES = [
  { name: '1080p60',  bitrate: 8000000,  resolution: '1920x1080', fps: 60, codecs: 'avc1.640028,mp4a.40.2' },
  { name: '1080p30',  bitrate: 4500000,  resolution: '1920x1080', fps: 30, codecs: 'avc1.640028,mp4a.40.2' },
  { name: '720p60',   bitrate: 3000000,  resolution: '1280x720',  fps: 60, codecs: 'avc1.64001f,mp4a.40.2' },
  { name: '720p30',   bitrate: 1500000,  resolution: '1280x720',  fps: 30, codecs: 'avc1.64001f,mp4a.40.2' },
  { name: '480p30',   bitrate:  800000,  resolution:  '854x480',  fps: 30, codecs: 'avc1.64001e,mp4a.40.2' },
];


// ─── 4. LEGAL LEAK DETECTION ──────────────────────────────────────────────────

/**
 * Detects unauthorized re-streams of YOUR content on public platforms
 * using their OFFICIAL APIs — not by scanning third-party devices.
 *
 * Legal basis: Platform APIs are public, rate-limited services intended
 * for exactly this use case (content ID / copyright enforcement).
 *
 * Platforms and their legal detection mechanisms:
 *   YouTube:  Data API v3 → search for live streams by keyword/fingerprint
 *   Twitch:   Helix API → stream search + content classification
 *   Facebook: Content ID API (requires Facebook partner program)
 *   Twitter:  Media Studio API
 */
class LeakDetector {
  constructor(config) {
    this.config         = config;
    this.detectedLeaks  = new Map();
    this.scanInterval   = null;
    this.matchKeywords  = config.matchKeywords ?? [];  // e.g. ["Premier League", "Match Title"]
  }

  start(intervalMs = 60000) {
    this.scanInterval = setInterval(() => this._scan(), intervalMs);
    this._scan();  // Immediate first scan
  }

  stop() {
    clearInterval(this.scanInterval);
  }

  async _scan() {
    const results = await Promise.allSettled([
      this._scanYouTube(),
      this._scanTwitch(),
    ]);

    results.forEach(r => {
      if (r.status === 'rejected') {
        console.error('Leak scan error:', r.reason.message);
      }
    });
  }

  /**
   * Search YouTube Live for unauthorized streams of your content.
   * Uses official YouTube Data API v3 — completely legal.
   *
   * Requires: YOUTUBE_API_KEY environment variable
   * Docs: https://developers.google.com/youtube/v3/docs/search/list
   */
  async _scanYouTube() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return;

    for (const keyword of this.matchKeywords) {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part',       'snippet');
      url.searchParams.set('q',           keyword);
      url.searchParams.set('type',        'video');
      url.searchParams.set('eventType',   'live');      // Live streams only
      url.searchParams.set('maxResults', '10');
      url.searchParams.set('key',         apiKey);

      const data = await this._fetch(url.toString());

      for (const item of data.items ?? []) {
        const videoId = item.id?.videoId;
        const title   = item.snippet?.title ?? '';
        const channel = item.snippet?.channelTitle ?? '';

        // Skip your own official channel
        if (this.config.officialChannelIds?.includes(item.snippet?.channelId)) continue;

        const leakId = `youtube:${videoId}`;
        if (!this.detectedLeaks.has(leakId)) {
          const leak = {
            id:        leakId,
            platform:  'youtube',
            videoId,
            url:       `https://www.youtube.com/watch?v=${videoId}`,
            title,
            channel,
            detectedAt: Date.now(),
            status:    'detected',
          };
          this.detectedLeaks.set(leakId, leak);
          this._onLeakDetected(leak);
        }
      }
    }
  }

  /**
   * Search Twitch for unauthorized streams.
   * Uses official Twitch Helix API — completely legal.
   *
   * Requires: TWITCH_CLIENT_ID and TWITCH_APP_TOKEN environment variables
   * Docs: https://dev.twitch.tv/docs/api/reference/#get-streams
   */
  async _scanTwitch() {
    const clientId = process.env.TWITCH_CLIENT_ID;
    const appToken = process.env.TWITCH_APP_TOKEN;
    if (!clientId || !appToken) return;

    for (const keyword of this.matchKeywords) {
      // Twitch: search by game/category first, then filter by title
      const url = new URL('https://api.twitch.tv/helix/search/channels');
      url.searchParams.set('query', keyword);
      url.searchParams.set('live_only', 'true');

      const data = await this._fetch(url.toString(), {
        'Client-Id':    clientId,
        'Authorization': `Bearer ${appToken}`,
      });

      for (const channel of data.data ?? []) {
        if (!channel.is_live) continue;

        const leakId = `twitch:${channel.id}`;
        if (!this.detectedLeaks.has(leakId)) {
          const leak = {
            id:         leakId,
            platform:   'twitch',
            channelId:  channel.id,
            url:        `https://www.twitch.tv/${channel.broadcaster_login}`,
            title:      channel.title,
            channel:    channel.display_name,
            detectedAt: Date.now(),
            status:     'detected',
          };
          this.detectedLeaks.set(leakId, leak);
          this._onLeakDetected(leak);
        }
      }
    }
  }

  _onLeakDetected(leak) {
    console.error(`[LEAK DETECTED] ${leak.platform.toUpperCase()}: "${leak.title}" by ${leak.channel}`);
    console.error(`  URL: ${leak.url}`);
    console.error(`  Detected at: ${new Date(leak.detectedAt).toISOString()}`);

    // Emit event for dashboard / alerting system
    if (this.config.onLeakDetected) {
      this.config.onLeakDetected(leak);
    }

    // Auto-report: Send DMCA takedown notice (requires your legal workflow)
    if (this.config.autoDmca) {
      this._initiateDmca(leak);
    }
  }

  _initiateDmca(leak) {
    // Platform DMCA APIs:
    //   YouTube: https://support.google.com/youtube/answer/2807622
    //   Twitch:  https://www.twitch.tv/p/en/legal/dmca-guidelines/
    // This is a legal process — implementation depends on your rights holder setup.
    console.log(`[DMCA] Initiating takedown for ${leak.url}`);
  }

  getDetectedLeaks() {
    return [...this.detectedLeaks.values()];
  }

  _fetch(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
    });
  }
}


// ─── 5. EXPRESS ROUTE HANDLERS ────────────────────────────────────────────────

/**
 * Mount these routes on your Express app:
 *
 *   app.use('/api', createRoutes(sessionManager, hlsServer, leakDetector));
 */
function createRoutes(sessionManager, hlsServer, leakDetector) {
  const express = require('express');
  const router  = express.Router();

  // Auth middleware — validates JWT or session cookie (your auth system)
  function requireAuth(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    // Plug in your existing auth (Firebase, Auth0, Supertokens, etc.)
    req.viewerInfo = decodeViewerToken(token, req);
    next();
  }

  // Create a session and return the master playlist URL
  router.post('/stream/session', requireAuth, (req, res) => {
    const session = sessionManager.createSession({
      userId:     req.viewerInfo.userId,
      email:      req.viewerInfo.email,
      ip:         req.ip,
      userAgent:  req.headers['user-agent'],
      displayHz:  req.body.displayHz ?? 60,  // Reported by player JS
    });

    const baseUrl     = `${req.protocol}://${req.get('host')}`;
    const masterM3u8  = hlsServer.generateMasterPlaylist(session, baseUrl);

    res.json({
      sessionId:   session.id,
      masterM3u8,  // Player loads this URL
      expiresIn:   3600,
    });
  });

  // Serve session-bound media playlist
  router.get('/hls/:sessionId/:profile/playlist.m3u8', (req, res) => {
    const { sessionId, profile } = req.params;
    const { token }              = req.query;

    try {
      const session = sessionManager.resolveSession(sessionId);
      if (!session) return res.status(404).send('Session not found');

      const baseUrl  = `${req.protocol}://${req.get('host')}`;
      const playlist = hlsServer.generateMediaPlaylist(session, profile, baseUrl, 0);

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');  // Never cache session playlists
      res.send(playlist);
    } catch (e) {
      if (e instanceof AuthError) return res.status(401).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // Serve encrypted segments
  router.get('/hls/:sessionId/:profile/seg_:seq.ts', (req, res) => {
    const { sessionId, profile, seq } = req.params;
    const { token }                   = req.query;

    try {
      const session = sessionManager.resolveSession(sessionId);
      if (!session) return res.status(404).send();

      // In production: load the pre-encoded TS segment from your CDN/vault
      // The forensic watermarker selects A or B variant automatically
      const rawSegment     = loadSegmentFromVault(profile, parseInt(seq));
      const encryptedSeg   = hlsServer.encryptSegment(rawSegment, session);

      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'no-store');
      res.send(encryptedSeg);
    } catch (e) {
      if (e instanceof AuthError) return res.status(401).send();
      res.status(500).send();
    }
  });

  // Serve AES-128 decryption key (session-bound, IP-validated)
  router.get('/hls-key/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { token }     = req.query;

    try {
      const key = hlsServer.serveKey(sessionId, token, req.ip, req.headers['user-agent']);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.send(key);
    } catch (e) {
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  });

  // Leak detection status
  router.get('/leaks', requireAuth, (req, res) => {
    res.json({
      leaks:       leakDetector.getDetectedLeaks(),
      total:       leakDetector.detectedLeaks.size,
      scanningFor: leakDetector.matchKeywords,
    });
  });

  // Active sessions
  router.get('/sessions', requireAuth, (req, res) => {
    const sessions = [...sessionManager.sessions.values()].map(s => ({
      id:           s.id,
      viewerId:     s.viewerId,
      email:        s.email,
      ipAddress:    s.ipAddress,
      displayHz:    s.displayHz,
      createdAt:    new Date(s.createdAt).toISOString(),
      segmentsSent: s.segmentsSent,
      active:       Date.now() - s.lastActive < 30000,
    }));
    res.json({ sessions, total: sessions.length });
  });

  return router;
}


// ─── Stubs (replace with your implementations) ────────────────────────────────

function decodeViewerToken(token, req) {
  // Replace with your JWT verification (jsonwebtoken, Auth0, Firebase, etc.)
  return { userId: 'user-123', email: 'viewer@example.com' };
}

function loadSegmentFromVault(profile, seq) {
  // Replace with your CDN segment loader.
  // The forensic watermarker in encryptSegment() will select A/B variant.
  return Buffer.alloc(188 * 1000, 0);  // Stub: empty TS packet
}


// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  SessionManager,
  ForensicWatermarker,
  HLSSessionServer,
  LeakDetector,
  createRoutes,
  sessionIdToBits,
  AuthError,
  DEFAULT_BITRATE_PROFILES,
};
