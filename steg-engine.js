/**
 * BroadcastShield — Layer B: LSB Steganography Engine
 *
 * TECHNICAL APPROACH:
 * Instead of modifying visible pixels (which causes the Visibility Paradox),
 * we flip only the Least Significant Bit of specific color channels in
 * a deterministic pattern derived from a session-specific key.
 *
 * Human eye:  Cannot perceive a 1-bit change in an 8-bit color channel.
 *             Value 200 (11001000) vs 201 (11001001) = identical to eye.
 * Camera:     Digital sensors DO capture this difference and preserve it
 *             even after re-encoding (with some quality headroom).
 *
 * Forensic detection:  Run the decoder with the session key → extract
 *                      the hidden session ID → identify the original viewer.
 */

'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYLOAD_VERSION   = 0x01;          // Schema version for future-proofing
const MAGIC_HEADER      = 0xDEAD;        // 2-byte sync marker at payload start
const BITS_PER_PIXEL    = 1;             // Only touch 1 LSB per pixel
const CHANNEL_INDEX     = 2;             // 0=R, 1=G, 2=B — we use Blue (least perceptible)
const HEADER_BITS       = 32;            // Bits reserved for length prefix
const FRAME_STRIDE      = 7;             // Embed in every 7th frame (imperceptible cadence)
const REGION_MARGIN     = 0.1;          // Stay 10% from edges (avoid compression artifacts)


// ─── Session Manager ──────────────────────────────────────────────────────────

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  /**
   * Create a new session for a viewer/stream.
   * @param {object} meta  Arbitrary metadata (IP, user-agent, user ID, etc.)
   * @returns {Session}
   */
  createSession(meta = {}) {
    const id      = uuidv4();
    const key     = crypto.randomBytes(32);  // 256-bit session key
    const session = {
      id,
      key,
      meta,
      createdAt:  Date.now(),
      frameCount: 0,
      embedCount: 0,
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id) {
    return this.sessions.get(id) ?? null;
  }

  /**
   * Given a recovered session ID, return full session info.
   * Used during forensic analysis of a pirated recording.
   */
  resolveForensic(recoveredId) {
    const session = this.sessions.get(recoveredId);
    if (!session) return { found: false, recoveredId };
    return {
      found: true,
      sessionId: session.id,
      meta:      session.meta,
      createdAt: new Date(session.createdAt).toISOString(),
      embedCount: session.embedCount,
    };
  }
}


// ─── Payload Builder ──────────────────────────────────────────────────────────

/**
 * Build the binary payload to embed into a frame.
 *
 * Structure:
 *   [2 bytes magic][1 byte version][4 bytes length][N bytes payload][2 bytes checksum]
 *
 * Payload (JSON UTF-8):
 *   { id: "session-uuid", ts: epochMs, frame: frameNumber }
 */
function buildPayload(session, frameNumber) {
  const content = JSON.stringify({
    id:    session.id,
    ts:    Date.now(),
    frame: frameNumber,
  });
  const contentBuf = Buffer.from(content, 'utf8');

  const header   = Buffer.alloc(7);
  header.writeUInt16BE(MAGIC_HEADER,    0);   // 2 bytes sync
  header.writeUInt8(PAYLOAD_VERSION,    2);   // 1 byte version
  header.writeUInt32BE(contentBuf.length, 3); // 4 bytes length

  const raw      = Buffer.concat([header, contentBuf]);
  const checksum = crypto.createHash('sha256')
    .update(session.key)
    .update(raw)
    .digest()
    .slice(0, 2);                             // 2-byte HMAC-lite

  return Buffer.concat([raw, checksum]);
}


// ─── Pseudo-random Pixel Selector ─────────────────────────────────────────────

/**
 * Generate a deterministic list of pixel coordinates for embedding.
 * Uses the session key + frame number as PRNG seed so that only
 * someone with the key can recover the positions during forensic analysis.
 *
 * @param {Buffer} sessionKey
 * @param {number} frameNumber
 * @param {number} width
 * @param {number} height
 * @param {number} count          Number of pixels needed
 * @returns {Array<{x,y}>}
 */
function selectPixels(sessionKey, frameNumber, width, height, count) {
  const seed = crypto.createHmac('sha256', sessionKey)
    .update(Buffer.from(`frame:${frameNumber}`))
    .digest();

  const marginX = Math.floor(width  * REGION_MARGIN);
  const marginY = Math.floor(height * REGION_MARGIN);
  const safeW   = width  - 2 * marginX;
  const safeH   = height - 2 * marginY;

  const pixels  = [];
  let   offset  = 0;

  while (pixels.length < count) {
    // Derive more randomness when seed exhausted
    if (offset + 4 > seed.length) {
      seed.copy(seed, 0, seed.length - 4);  // crude rolling window
      offset = 0;
    }
    const rx = seed.readUInt16BE(offset    ) % safeW + marginX;
    const ry = seed.readUInt16BE(offset + 2) % safeH + marginY;
    offset += 4;
    pixels.push({ x: rx, y: ry });
  }

  return pixels;
}


// ─── LSB Embed / Extract ──────────────────────────────────────────────────────

/**
 * Embed payload bits into raw RGBA pixel buffer (in-place, returns modified buf).
 *
 * @param {Buffer} pixelBuf  Raw RGBA buffer (width * height * 4 bytes)
 * @param {number} width
 * @param {number} height
 * @param {Session} session
 * @param {number} frameNumber
 * @returns {Buffer}         Modified pixel buffer
 */
function embedPayload(pixelBuf, width, height, session, frameNumber) {
  const payload  = buildPayload(session, frameNumber);
  const bits     = payloadToBits(payload);
  const pixels   = selectPixels(session.key, frameNumber, width, height, bits.length);

  for (let i = 0; i < bits.length; i++) {
    const { x, y } = pixels[i];
    const idx       = (y * width + x) * 4 + CHANNEL_INDEX;  // Blue channel
    // Flip LSB to match payload bit
    pixelBuf[idx]   = (pixelBuf[idx] & 0xFE) | bits[i];
  }

  return pixelBuf;
}

/**
 * Extract payload bits from a pixel buffer using the session key.
 * Used during forensic recovery.
 */
function extractPayload(pixelBuf, width, height, sessionKey, frameNumber, payloadByteLength) {
  const totalBits = (payloadByteLength + 3) * 8;  // Estimate with overhead
  const pixels    = selectPixels(sessionKey, frameNumber, width, height, totalBits);
  const bits      = [];

  for (const { x, y } of pixels) {
    const idx = (y * width + x) * 4 + CHANNEL_INDEX;
    bits.push(pixelBuf[idx] & 0x01);
  }

  return bitsToBuffer(bits);
}

/** Convert Buffer to array of individual bits */
function payloadToBits(buf) {
  const bits = [];
  for (const byte of buf) {
    for (let b = 7; b >= 0; b--) {
      bits.push((byte >> b) & 1);
    }
  }
  return bits;
}

/** Convert array of bits back to Buffer */
function bitsToBuffer(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | (bits[i + b] ?? 0);
    }
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}


// ─── Forensic Decoder ─────────────────────────────────────────────────────────

/**
 * Given a captured frame and a set of candidate sessions, attempt to
 * recover the embedded session ID.
 *
 * In production: this runs on the AI analysis server against a pirated clip.
 *
 * @param {Buffer} pixelBuf
 * @param {number} width
 * @param {number} height
 * @param {number} frameNumber
 * @param {Session[]} candidateSessions   All active sessions to test against
 * @returns {{ found: boolean, sessionId?: string }}
 */
function forensicDecode(pixelBuf, width, height, frameNumber, candidateSessions) {
  for (const session of candidateSessions) {
    try {
      const raw   = extractPayload(pixelBuf, width, height, session.key, frameNumber, 200);
      const magic = raw.readUInt16BE(0);
      if (magic !== MAGIC_HEADER) continue;

      const version = raw.readUInt8(2);
      if (version !== PAYLOAD_VERSION) continue;

      const len     = raw.readUInt32BE(3);
      const content = raw.slice(7, 7 + len).toString('utf8');
      const parsed  = JSON.parse(content);

      return { found: true, sessionId: parsed.id, frame: parsed.frame, ts: parsed.ts };
    } catch (_) {
      // Key mismatch — try next
    }
  }
  return { found: false };
}


// ─── Frame-Level Pipeline Hook ─────────────────────────────────────────────────

/**
 * This is the hook you integrate into your FFmpeg/GStreamer pipeline.
 * Call it for every raw frame before it goes to the output encoder.
 *
 * Usage:
 *   const steg = new SteganographyPipeline(session);
 *   // For each frame buffer from FFmpeg rawvideo:
 *   const securedFrame = steg.processFrame(frameBuffer, width, height);
 *
 * The pipeline only embeds every FRAME_STRIDE frames to further
 * reduce the statistical signal in pixel distribution analysis.
 */
class SteganographyPipeline {
  constructor(session) {
    this.session    = session;
    this.frameCount = 0;
  }

  processFrame(pixelBuf, width, height) {
    this.frameCount++;
    this.session.frameCount++;

    if (this.frameCount % FRAME_STRIDE !== 0) {
      return pixelBuf;  // Pass-through untouched
    }

    this.session.embedCount++;
    return embedPayload(
      Buffer.from(pixelBuf),  // Copy — never mutate the original
      width,
      height,
      this.session,
      this.frameCount
    );
  }
}


// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  SessionManager,
  SteganographyPipeline,
  forensicDecode,
  buildPayload,
  embedPayload,
  extractPayload,
  FRAME_STRIDE,
  MAGIC_HEADER,
  PAYLOAD_VERSION,
};
