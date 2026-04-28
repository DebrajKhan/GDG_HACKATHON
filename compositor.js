/**
 * BroadcastShield — Layer A: Client-Side Compositor
 *
 * ROLE IN THE DUAL-LAYER ARCHITECTURE:
 * This module intercepts the raw video stream from OBS (via virtual camera
 * or RTMP), composites visible deterrent overlays onto it, and outputs the
 * protected feed to the platform RTMP endpoint.
 *
 * WHY VISIBLE OVERLAYS DON'T CAUSE THE VISIBILITY PARADOX:
 * The paradox only occurs when we try to make something BOTH invisible
 * and disruptive. Static/slow overlays are always visible — they are
 * a deterrent, not a stealth mechanism. They cause zero temporal noise
 * because they don't flicker. The trade-off is explicit and intentional.
 *
 * WHAT THIS COMPOSITOR ADDS:
 *   1. Slow-drift watermark  — session ID rendered as text, moving in a
 *      Lissajous pattern at ~0.1 px/frame. Ruins PrtScn attribution.
 *   2. Corner bug            — static small badge (channel logo/ID).
 *   3. Timestamp burn-in     — ISO timestamp of the live session.
 *   4. Configurable opacity  — operator can dial from subtle to aggressive.
 *
 * INTEGRATION PATTERN:
 *   OBS → [Virtual Camera / RTMP out] → Compositor → [RTMP] → Platform
 *   The compositor is a Node.js process that wraps FFmpeg with a filtergraph.
 */

'use strict';

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const { v4: uuidv4 } = require('uuid');

// ─── Lissajous Drift Calculator ───────────────────────────────────────────────

/**
 * Compute watermark position at a given frame using a Lissajous curve.
 * This gives a smooth, organic drift pattern that covers all screen regions
 * over time, so a pirate cannot crop the watermark out.
 *
 * @param {number} frame
 * @param {number} videoWidth
 * @param {number} videoHeight
 * @param {object} opts
 * @returns {{ x: number, y: number }}
 */
function lissajousPosition(frame, videoWidth, videoHeight, opts = {}) {
  const {
    freqX    = 3,       // Frequency ratio X
    freqY    = 2,       // Frequency ratio Y
    phaseX   = 0,
    phaseY   = Math.PI / 4,
    padding  = 80,      // Keep watermark this many px from edges
    speed    = 0.002,   // Radians per frame — slow drift
  } = opts;

  const t = frame * speed;
  const cx = videoWidth  / 2;
  const cy = videoHeight / 2;
  const rx = cx - padding;
  const ry = cy - padding;

  return {
    x: Math.round(cx + rx * Math.sin(freqX * t + phaseX)),
    y: Math.round(cy + ry * Math.sin(freqY * t + phaseY)),
  };
}


// ─── FFmpeg Filtergraph Builder ────────────────────────────────────────────────

/**
 * Build the FFmpeg drawtext / overlay filter string for a session.
 *
 * We use drawtext filters (not overlay files) to avoid filesystem I/O
 * on every frame. The expressions are evaluated by FFmpeg's filter engine
 * at runtime.
 *
 * @param {object} config   Compositor configuration
 * @returns {string}        FFmpeg -vf filter string
 */
function buildFiltergraph(config) {
  const {
    sessionId,
    sessionLabel,    // Human-readable label (e.g. viewer name / channel)
    channelBug,      // Short channel identifier
    opacity,         // 0.0 – 1.0
    fontSize,        // Watermark font size in px
    driftSpeed,      // Lissajous speed
    enableTimestamp, // bool
    enableDrift,     // bool
    enableCornerBug, // bool
  } = config;

  const alpha = Math.min(1, Math.max(0, opacity));
  const hexAlpha = Math.round(alpha * 255).toString(16).padStart(2, '0');

  const filters = [];

  // ── 1. Drifting session watermark ──────────────────────────────────────────
  if (enableDrift) {
    // Lissajous X: expressed as FFmpeg eval-time formula using 't' (seconds)
    // t * fps ≈ frame count; we approximate with fixed fps assumption
    const speed = driftSpeed ?? 0.002;
    const driftX = `(w/2)+(w/2-${fontSize * 6})*sin(3*(t*${speed}*30))`;
    const driftY = `(h/2)+(h/2-${fontSize + 20})*sin(2*(t*${speed}*30)+0.785)`;

    filters.push(
      `drawtext=` +
      `text='${sessionLabel ?? sessionId.slice(0, 8).toUpperCase()}':` +
      `fontsize=${fontSize}:` +
      `fontcolor=white@${alpha.toFixed(2)}:` +
      `shadowcolor=black@${(alpha * 0.6).toFixed(2)}:shadowx=1:shadowy=1:` +
      `x=${driftX}:` +
      `y=${driftY}:` +
      `font=monospace`
    );
  }

  // ── 2. Corner bug (static) ─────────────────────────────────────────────────
  if (enableCornerBug && channelBug) {
    filters.push(
      `drawtext=` +
      `text='${channelBug}':` +
      `fontsize=${Math.round(fontSize * 0.7)}:` +
      `fontcolor=white@${(alpha * 0.8).toFixed(2)}:` +
      `shadowcolor=black@0.5:shadowx=1:shadowy=1:` +
      `x=w-tw-16:y=h-th-16:` +
      `font=monospace`
    );
  }

  // ── 3. Live timestamp burn-in ──────────────────────────────────────────────
  if (enableTimestamp) {
    filters.push(
      `drawtext=` +
      `text='%{pts\\:localtime\\:${Math.floor(Date.now() / 1000)}\\:%Y-%m-%dT%H\\\\:%M\\\\:%S}':` +
      `fontsize=${Math.round(fontSize * 0.55)}:` +
      `fontcolor=white@0.55:` +
      `shadowcolor=black@0.3:shadowx=1:shadowy=1:` +
      `x=16:y=16:` +
      `font=monospace`
    );
  }

  return filters.join(',');
}


// ─── Compositor Process Manager ───────────────────────────────────────────────

class Compositor {
  /**
   * @param {object} opts
   * @param {string} opts.obsRtmpUrl        Input: OBS RTMP stream URL
   * @param {string} opts.platformRtmpUrl   Output: Platform RTMP endpoint
   * @param {object} opts.watermarkConfig   Watermark settings
   * @param {object} opts.session           Session object from SessionManager
   * @param {function} opts.onStats         Callback for frame stats
   */
  constructor(opts) {
    this.opts      = opts;
    this.process   = null;
    this.running   = false;
    this.stats     = { framesIn: 0, framesOut: 0, startTime: null, errors: [] };
  }

  /**
   * Start the compositor FFmpeg pipeline.
   * Returns a Promise that resolves when the process starts, and rejects if
   * FFmpeg fails to initialise (e.g. bad RTMP URL).
   */
  start() {
    return new Promise((resolve, reject) => {
      const { obsRtmpUrl, platformRtmpUrl, watermarkConfig, session } = this.opts;

      const filtergraph = buildFiltergraph({
        sessionId:     session.id,
        sessionLabel:  watermarkConfig.label  ?? 'PROTECTED',
        channelBug:    watermarkConfig.bug    ?? '●LIVE',
        opacity:       watermarkConfig.opacity   ?? 0.35,
        fontSize:      watermarkConfig.fontSize  ?? 28,
        driftSpeed:    watermarkConfig.driftSpeed ?? 0.002,
        enableDrift:   watermarkConfig.enableDrift    !== false,
        enableCornerBug:watermarkConfig.enableCornerBug !== false,
        enableTimestamp:watermarkConfig.enableTimestamp !== false,
      });

      const ffmpegArgs = [
        // ── Input ──────────────────────────────────────────────────────────
        '-re',                         // Read input at native framerate
        '-i', obsRtmpUrl,              // OBS RTMP or SRT feed

        // ── Video processing ───────────────────────────────────────────────
        '-vf', filtergraph,            // Apply watermark filters

        // ── Encoding ───────────────────────────────────────────────────────
        '-c:v', 'libx264',
        '-preset', 'veryfast',         // Low latency for live streaming
        '-tune', 'zerolatency',
        '-crf', '18',                  // High quality (18 = visually lossless)
        '-g', '60',                    // Keyframe interval
        '-sc_threshold', '0',

        // ── Audio ──────────────────────────────────────────────────────────
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',

        // ── Output ─────────────────────────────────────────────────────────
        '-f', 'flv',                   // RTMP container
        platformRtmpUrl,

        // ── Stats ──────────────────────────────────────────────────────────
        '-progress', 'pipe:2',
      ];

      this.process  = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.running  = true;
      this.stats.startTime = Date.now();

      let startupTimer = setTimeout(() => resolve(this), 3000);

      this.process.stderr.on('data', (data) => {
        clearTimeout(startupTimer);
        const line = data.toString();

        // Parse progress lines
        if (line.includes('frame=')) {
          const match = line.match(/frame=\s*(\d+)/);
          if (match) this.stats.framesOut = parseInt(match[1], 10);
          if (this.opts.onStats) this.opts.onStats(this.stats);
        }

        // Detect startup failure
        if (line.includes('Connection refused') || line.includes('Invalid data')) {
          reject(new Error(`FFmpeg compositor failed: ${line.trim()}`));
        }
      });

      this.process.on('close', (code) => {
        this.running = false;
        if (code !== 0) {
          this.stats.errors.push(`FFmpeg exited with code ${code}`);
        }
      });

      this.process.on('error', (err) => {
        this.running = false;
        reject(err);
      });
    });
  }

  stop() {
    if (this.process && this.running) {
      this.process.kill('SIGTERM');
      this.running = false;
    }
  }

  getStats() {
    return {
      ...this.stats,
      uptimeMs: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
    };
  }
}


// ─── Watermark Preview Generator ──────────────────────────────────────────────

/**
 * Generate a still-image preview of the watermark layout.
 * Used by the dashboard to show operators what the overlay looks like.
 *
 * Requires: ffmpeg with lavfi and color source
 * @returns {Promise<Buffer>}  JPEG buffer of the preview frame
 */
function generatePreview(config, width = 1280, height = 720) {
  return new Promise((resolve, reject) => {
    const filtergraph = buildFiltergraph(config);
    const fullFilter  = `color=black:size=${width}x${height}:rate=1[base];[base]${filtergraph}`;

    const chunks = [];
    const proc   = spawn('ffmpeg', [
      '-f',        'lavfi',
      '-i',        `color=black:size=${width}x${height}:rate=1`,
      '-vf',       filtergraph,
      '-frames:v', '1',
      '-f',        'image2',
      '-vcodec',   'mjpeg',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });

    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.on('close', code => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`Preview generation failed (code ${code})`));
    });
    proc.on('error', reject);
  });
}


module.exports = {
  Compositor,
  buildFiltergraph,
  lissajousPosition,
  generatePreview,
};
