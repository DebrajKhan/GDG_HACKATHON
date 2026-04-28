import { useState, useEffect, useRef, useCallback } from "react";

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  bg:      "#0a0c10",
  panel:   "#111318",
  border:  "#1e2128",
  accent:  "#3b82f6",
  green:   "#22c55e",
  amber:   "#f59e0b",
  red:     "#ef4444",
  purple:  "#a855f7",
  muted:   "#6b7280",
  text:    "#e2e8f0",
  textSub: "#9ca3af",
};

// ─── Mock API (simulates the Node.js server) ──────────────────────────────────
const API = (() => {
  let sessions = {};
  let pipelines = {};
  let frameCounter = 0;

  function mkSession(meta) {
    const id = `sess-${Math.random().toString(36).slice(2, 10)}`;
    const s = {
      id,
      meta: { label: meta.label ?? "Unnamed", viewerId: `viewer-${id}`, ...meta },
      createdAt: new Date().toISOString(),
      frameCount: 0,
      embedCount: 0,
      active: false,
      protection: { layerA: "visible_watermark", layerB: "lsb_steganography" },
    };
    sessions[id] = s;
    return s;
  }

  return {
    createSession: async (body) => mkSession(body),
    getSessions:   async () => Object.values(sessions),
    startPipeline: async (id, cfg) => {
      if (!sessions[id]) throw new Error("Not found");
      sessions[id].active = true;
      pipelines[id] = { startTime: Date.now(), framesOut: 0 };
      return sessions[id];
    },
    stopPipeline: async (id) => {
      if (sessions[id]) sessions[id].active = false;
      delete pipelines[id];
      return sessions[id];
    },
    tick: () => {
      Object.values(sessions).forEach(s => {
        if (!s.active) return;
        s.frameCount += 30;
        s.embedCount += 4;  // FRAME_STRIDE = 7
      });
      return sessions;
    },
    forensicDecode: async (sessionId) => {
      const s = sessions[sessionId];
      if (!s) return { found: false };
      return {
        found: true,
        sessionId: s.id,
        frame: s.frameCount - 7,
        ts: Date.now() - 2000,
        resolved: {
          found: true,
          sessionId: s.id,
          meta: s.meta,
          createdAt: s.createdAt,
          embedCount: s.embedCount,
        },
      };
    },
  };
})();

// ─── Subcomponents ────────────────────────────────────────────────────────────

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
      padding: "2px 8px", borderRadius: 99,
      background: color + "22", color, border: `1px solid ${color}44`,
      textTransform: "uppercase",
    }}>{label}</span>
  );
}

function Stat({ label, value, sub, color }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color ?? C.text, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function LayerIndicator({ label, type, active, detail }) {
  const color = type === "A" ? C.amber : C.purple;
  return (
    <div style={{
      background: C.panel, border: `1px solid ${active ? color + "55" : C.border}`,
      borderRadius: 10, padding: "14px 18px",
      transition: "border-color 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: active ? color + "22" : C.border,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, color: active ? color : C.muted,
          transition: "all 0.3s",
        }}>
          {type}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: active ? C.text : C.muted }}>{label}</div>
          <div style={{ fontSize: 11, color: C.muted }}>{active ? "Active" : "Standby"}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: active ? color : C.muted,
            boxShadow: active ? `0 0 8px ${color}` : "none",
            transition: "all 0.3s",
          }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{detail}</div>
    </div>
  );
}

function WatermarkPreview({ config }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;

    let frame = 0;
    let animId;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Background gradient (simulated video feed)
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, "#0a1628");
      grad.addColorStop(1, "#0f1f3d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Simulated video content lines
      ctx.strokeStyle = "#ffffff08";
      ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const speed = config.driftSpeed ?? 0.002;
      const t = frame * speed * 30;
      const alpha = config.opacity ?? 0.35;

      if (config.enableDrift !== false) {
        const x = (W / 2) + (W / 2 - 80) * Math.sin(3 * t);
        const y = (H / 2) + (H / 2 - 24) * Math.sin(2 * t + 0.785);

        ctx.font = `${config.fontSize ?? 22}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Shadow
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.6})`;
        ctx.fillText(config.label ?? "PROTECTED", x + 1, y + 1);
        // Text
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillText(config.label ?? "PROTECTED", x, y);
      }

      if (config.enableCornerBug !== false) {
        ctx.font = `${Math.round((config.fontSize ?? 22) * 0.65)}px monospace`;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
        ctx.fillText("●SHIELD", W - 11, H - 11);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.8})`;
        ctx.fillText("●SHIELD", W - 12, H - 12);
      }

      if (config.enableTimestamp !== false) {
        const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
        ctx.font = `${Math.round((config.fontSize ?? 22) * 0.5)}px monospace`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = `rgba(255,255,255,0.55)`;
        ctx.fillText(ts, 12, 12);
      }

      // LSB visualization — subtle pixel scatter to show steg activity
      if (frame % 7 === 0) {
        const count = 30;
        for (let i = 0; i < count; i++) {
          const px = Math.random() * W;
          const py = Math.random() * H;
          ctx.fillStyle = `rgba(168,85,247,0.4)`;
          ctx.fillRect(px, py, 2, 2);
        }
      }

      frame++;
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, [config]);

  return (
    <canvas
      ref={canvasRef}
      width={560} height={315}
      style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}` }}
    />
  );
}

function SessionRow({ session, onStart, onStop, onForensic }) {
  const uptime = session.active
    ? Math.floor((Date.now() - new Date(session.createdAt).getTime()) / 1000)
    : 0;

  return (
    <div style={{
      background: C.panel, border: `1px solid ${session.active ? C.accent + "44" : C.border}`,
      borderRadius: 10, padding: "16px 20px", marginBottom: 10,
      transition: "border-color 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: session.active ? C.green : C.muted,
          boxShadow: session.active ? `0 0 8px ${C.green}` : "none",
          flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{session.meta.label}</div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{session.id}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
            {session.frameCount.toLocaleString()} frames · {session.embedCount.toLocaleString()} embeds
          </span>
          <Badge label="Layer A" color={C.amber} />
          <Badge label="Layer B" color={C.purple} />
          {!session.active
            ? <button onClick={() => onStart(session.id)} style={btnStyle(C.accent)}>Start</button>
            : <button onClick={() => onStop(session.id)} style={btnStyle(C.red)}>Stop</button>
          }
          <button onClick={() => onForensic(session.id)} style={btnStyle(C.purple)}>Forensic</button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(color) {
  return {
    fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6,
    background: color + "22", color, border: `1px solid ${color}44`,
    cursor: "pointer", letterSpacing: "0.02em",
  };
}

function ForensicModal({ result, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000000cc",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }} onClick={onClose}>
      <div style={{
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14,
        padding: 32, width: 480, maxWidth: "90vw",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ fontSize: 20 }}>🔬</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Forensic decode result</div>
        </div>
        {result?.found ? (
          <>
            <Badge label="Match found" color={C.green} />
            <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
              {[
                ["Session ID",   result.sessionId],
                ["Viewer label", result.resolved?.meta?.label],
                ["Viewer IP",    result.resolved?.meta?.ipAddress ?? "—"],
                ["Created",      result.resolved?.createdAt],
                ["Embed count",  result.resolved?.embedCount],
                ["Frame #",      result.frame],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                  <span style={{ color: C.muted, width: 120, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: C.text, fontFamily: "monospace", wordBreak: "break-all" }}>{v}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ color: C.red, fontSize: 14 }}>No session signature found in payload.</div>
        )}
        <button onClick={onClose} style={{ ...btnStyle(C.muted), marginTop: 24 }}>Close</button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function BroadcastShield() {
  const [sessions, setSessions]       = useState([]);
  const [tab, setTab]                 = useState("dashboard");
  const [creating, setCreating]       = useState(false);
  const [newLabel, setNewLabel]       = useState("");
  const [forensicResult, setForensic] = useState(null);
  const [events, setEvents]           = useState([]);
  const [wConfig, setWConfig]         = useState({
    label: "PROTECTED", opacity: 0.35, fontSize: 22,
    driftSpeed: 0.002, enableDrift: true, enableCornerBug: true, enableTimestamp: true,
  });

  const logEvent = useCallback((msg, color = C.textSub) => {
    setEvents(ev => [{ id: Date.now(), msg, color, ts: new Date().toLocaleTimeString() }, ...ev].slice(0, 60));
  }, []);

  // Tick simulation
  useEffect(() => {
    const id = setInterval(() => {
      API.tick();
      API.getSessions().then(s => setSessions([...s]));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  async function createSession() {
    if (!newLabel.trim()) return;
    const s = await API.createSession({ label: newLabel.trim() });
    setSessions(await API.getSessions());
    setNewLabel("");
    setCreating(false);
    logEvent(`Session created: ${s.meta.label}`, C.accent);
  }

  async function startPipeline(id) {
    await API.startPipeline(id, { obsRtmpUrl: "demo" });
    setSessions(await API.getSessions());
    logEvent(`Pipeline started → session ${id.slice(5, 13)}`, C.green);
  }

  async function stopPipeline(id) {
    await API.stopPipeline(id);
    setSessions(await API.getSessions());
    logEvent(`Pipeline stopped → session ${id.slice(5, 13)}`, C.amber);
  }

  async function forensicDecode(id) {
    const r = await API.forensicDecode(id);
    setForensic(r);
    logEvent(r.found ? `Forensic match: ${r.sessionId.slice(5, 13)}` : "Forensic: no match", r.found ? C.green : C.red);
  }

  const activeSessions = sessions.filter(s => s.active);
  const totalFrames    = sessions.reduce((a, s) => a + s.frameCount, 0);
  const totalEmbeds    = sessions.reduce((a, s) => a + s.embedCount, 0);

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{
      fontSize: 13, fontWeight: tab === id ? 600 : 400,
      padding: "6px 16px", borderRadius: 6, border: "none",
      background: tab === id ? C.accent + "22" : "transparent",
      color: tab === id ? C.accent : C.muted, cursor: "pointer",
    }}>{label}</button>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "system-ui, sans-serif", padding: "0 0 40px" }}>
      {/* Header */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", height: 56, gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.accent + "22", border: `1px solid ${C.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🛡</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>BroadcastShield</span>
          <Badge label="v1.0" color={C.muted} />
        </div>
        <nav style={{ display: "flex", gap: 2, marginLeft: 24 }}>
          <TabBtn id="dashboard" label="Dashboard" />
          <TabBtn id="sessions"  label="Sessions"  />
          <TabBtn id="watermark" label="Watermark" />
          <TabBtn id="log"       label="Event log" />
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          <span style={{ fontSize: 12, color: C.muted }}>Server online</span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>

        {/* ── Dashboard tab ── */}
        {tab === "dashboard" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
              <Stat label="Active streams"  value={activeSessions.length}         color={activeSessions.length > 0 ? C.green : C.muted} />
              <Stat label="Total sessions"  value={sessions.length} />
              <Stat label="Frames secured"  value={totalFrames.toLocaleString()}  color={C.accent} />
              <Stat label="DNA embeds"      value={totalEmbeds.toLocaleString()}  color={C.purple} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
              <LayerIndicator
                label="Client compositor"
                type="A"
                active={activeSessions.length > 0}
                detail="Lissajous watermark drift + corner bug + timestamp burn-in via FFmpeg drawtext. Zero temporal noise — static compositing only."
              />
              <LayerIndicator
                label="Server transcoder"
                type="B"
                active={activeSessions.length > 0}
                detail="LSB steganography on Blue channel. Session ID + timestamp embedded every 7th frame using HMAC-keyed pixel selection. Invisible to human eye."
              />
            </div>

            {/* Architecture diagram summary */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, fontSize: 13, lineHeight: 1.8, color: C.textSub }}>
              <div style={{ fontWeight: 600, color: C.text, marginBottom: 10 }}>How the Visibility Paradox is solved</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ color: C.amber, fontWeight: 600, marginBottom: 4 }}>Layer A — Visible deterrent</div>
                  The slow-moving watermark is always visible. It causes zero temporal noise because it does not flicker — it drifts at ~0.002 rad/frame. A casual screenshot attempt captures the watermark clearly, making cropping attributable.
                </div>
                <div>
                  <div style={{ color: C.purple, fontWeight: 600, marginBottom: 4 }}>Layer B — Invisible DNA</div>
                  The LSB of a single colour channel is flipped in a deterministic, session-keyed pixel pattern. The human eye cannot perceive a 1-bit change in an 8-bit channel. A recording preserves the DNA through most re-encodings above CRF 28.
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Sessions tab ── */}
        {tab === "sessions" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Sessions ({sessions.length})</div>
              <button onClick={() => setCreating(!creating)} style={btnStyle(C.accent)}>+ New session</button>
            </div>

            {creating && (
              <div style={{ background: C.panel, border: `1px solid ${C.accent}44`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Viewer / stream label</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && createSession()}
                    placeholder="e.g. Premium Viewer #42"
                    style={{
                      flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6,
                      color: C.text, padding: "8px 12px", fontSize: 13, outline: "none",
                    }}
                  />
                  <button onClick={createSession} style={btnStyle(C.green)}>Create</button>
                </div>
              </div>
            )}

            {sessions.length === 0
              ? <div style={{ textAlign: "center", color: C.muted, padding: "48px 0", fontSize: 14 }}>No sessions yet. Create one to begin protecting your stream.</div>
              : sessions.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    onStart={startPipeline}
                    onStop={stopPipeline}
                    onForensic={forensicDecode}
                  />
                ))
            }
          </>
        )}

        {/* ── Watermark tab ── */}
        {tab === "watermark" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>Live preview</div>
              <WatermarkPreview config={wConfig} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Purple pixels show active LSB steganography embed sites (Layer B, every 7th frame)</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Layer A configuration</div>

              {[
                { label: "Label text", key: "label",    type: "text"  },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                  <input
                    type={type}
                    value={wConfig[key]}
                    onChange={e => setWConfig(c => ({ ...c, [key]: e.target.value }))}
                    style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
              ))}

              {[
                { label: `Opacity: ${Math.round(wConfig.opacity * 100)}%`, key: "opacity", min: 0.05, max: 0.9, step: 0.05 },
                { label: `Font size: ${wConfig.fontSize}px`,               key: "fontSize", min: 12, max: 48, step: 2 },
                { label: `Drift speed: ${wConfig.driftSpeed}`,             key: "driftSpeed", min: 0.0005, max: 0.01, step: 0.0005 },
              ].map(({ label, key, min, max, step }) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                  <input type="range" min={min} max={max} step={step} value={wConfig[key]}
                    onChange={e => setWConfig(c => ({ ...c, [key]: parseFloat(e.target.value) }))}
                    style={{ width: "100%" }} />
                </div>
              ))}

              {[
                { label: "Drifting watermark", key: "enableDrift" },
                { label: "Corner bug",          key: "enableCornerBug" },
                { label: "Timestamp burn-in",   key: "enableTimestamp" },
              ].map(({ label, key }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: C.textSub }}>
                  <input type="checkbox" checked={wConfig[key]}
                    onChange={e => setWConfig(c => ({ ...c, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Event log tab ── */}
        {tab === "log" && (
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: C.text }}>Event log</div>
            {events.length === 0
              ? <div style={{ color: C.muted, fontSize: 13 }}>No events yet.</div>
              : events.map(e => (
                  <div key={e.id} style={{ display: "flex", gap: 12, padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                    <span style={{ color: C.muted, fontFamily: "monospace", flexShrink: 0 }}>{e.ts}</span>
                    <span style={{ color: e.color }}>{e.msg}</span>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {forensicResult && (
        <ForensicModal result={forensicResult} onClose={() => setForensic(null)} />
      )}
    </div>
  );
}
