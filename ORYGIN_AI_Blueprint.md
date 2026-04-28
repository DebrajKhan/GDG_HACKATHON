# 🛡️ ORYGIN AI — Protecting the Integrity of Digital Sports Media

> **GDG Solution Challenge 2026 | Full Project Blueprint**

---

## 📌 Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Core Features](#3-core-features)
4. [System Architecture](#4-system-architecture)
5. [Tech Stack](#5-tech-stack)
6. [Frontend — Pages & UI/UX](#6-frontend--pages--uiux)
7. [Backend Pipelines](#7-backend-pipelines)
8. [Live Encrypted Streaming Module](#8-live-encrypted-streaming-module)
9. [AI / ML Layer](#9-ai--ml-layer)
10. [Database Design](#10-database-design)
11. [Security Model](#11-security-model)
12. [GDG Google Services Alignment](#12-gdg-google-services-alignment)
13. [MVP Scope & Roadmap](#13-mvp-scope--roadmap)

---

## 1. Problem Statement

Sports organizations (leagues, federations, broadcasters) generate enormous volumes of high-value digital media — match highlights, player footage, press images, official broadcasts. This content:

- **Scatters globally** across YouTube, Twitter/X, Instagram, Telegram, TikTok within minutes
- **Gets re-encoded, cropped, flipped, and recolored** to evade detection
- **Is monetized without consent** by third parties
- **Leaves rights owners with no real-time visibility** into where their content lives

> Traditional watermarking is brittle. Manual monitoring is impossible at scale. The damage is done before anyone notices.

---

## 2. Solution Overview

**ORYGIN AI** is a full-stack, AI-powered digital media protection platform with three pillars:

| Pillar | Description |
|--------|-------------|
| 🔏 **Seal** | Embed invisible, AI-verifiable Digital DNA into every asset at ingest |
| 🔍 **Detect** | Continuously crawl the internet to find unauthorized copies using AI vision |
| 📡 **Broadcast** | Stream live camera feeds with real-time watermarking and end-to-end encryption |

---

## 3. Core Features

### 🔏 Asset Protection
- Perceptual hashing (pHash / dHash) for content fingerprinting
- Invisible steganographic watermarking (pixel-level Digital DNA)
- Cryptographic asset manifest with signed hashes
- Immutable asset registry on Firestore

### 🔍 Detection & Monitoring
- AI-powered web crawler network (social platforms + open web)
- Gemini Vision API for semantic image/video similarity matching
- Audio fingerprinting for video content
- Propagation graph — maps how content spreads
- Risk scoring engine — threat level per violation
- Near-real-time alerts (within minutes of detection)

### 📡 Secure Live Streaming
- Browser-based camera capture (no app install needed)
- Real-time invisible watermark injection per frame
- WebRTC end-to-end encrypted transmission
- Per-viewer watermarking (trace who leaked a stream)
- Anti-screenshot visual overlay for secure viewing
- Broadcaster authentication and session DNA

### 📊 Analytics Dashboard
- Violation trends over time
- Content propagation heatmaps
- Asset protection coverage score
- DMCA takedown automation & evidence packaging

---

## 4. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        ORYGIN AI Platform                      │
│                                                                    │
│  ┌─────────────┐    ┌─────────────────┐    ┌──────────────────┐  │
│  │  Web Upload │    │  Live Broadcast  │    │  API Ingest      │  │
│  │  (Images /  │    │  (Camera WebRTC) │    │  (Partner Feed)  │  │
│  │   Videos)   │    │                  │    │                  │  │
│  └──────┬──────┘    └────────┬─────────┘    └────────┬─────────┘  │
│         │                    │                        │            │
│         └───────────┬────────┴────────────────────────┘            │
│                     ▼                                              │
│          ┌─────────────────────┐                                   │
│          │   Watermark Engine   │  <- Digital DNA Injection        │
│          │  (FastAPI + OpenCV)  │                                   │
│          └──────────┬──────────┘                                   │
│                     │                                              │
│         ┌───────────▼──────────┐                                   │
│         │   Asset Registry      │  <- Firestore + GCS             │
│         │   (Hash + Metadata)   │                                   │
│         └───────────┬───────────┘                                  │
│                     │                                              │
│    ┌────────────────▼────────────────────────┐                    │
│    │           Detection Pipeline             │                    │
│    │  Crawler -> AI Match -> Risk Score -> Alert                   │
│    └────────────────┬────────────────────────┘                    │
│                     │                                              │
│          ┌──────────▼──────────┐                                   │
│          │   Dashboard (React)  │                                   │
│          │   Alerts, Analytics  │                                   │
│          └─────────────────────┘                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Tech Stack

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| Styling | Vanilla CSS (custom design system) + CSS Variables |
| Routing | React Router v6 |
| State | Zustand |
| Charts | Recharts |
| WebRTC | Native browser APIs + simple-peer |
| Canvas | HTML5 Canvas API (watermark rendering) |
| Auth UI | Firebase Auth SDK |

### Backend
| Layer | Technology |
|-------|-----------|
| API Server | FastAPI (Python 3.11) |
| Watermarking | OpenCV + NumPy + Pillow |
| Hashing | ImageHash (pHash, dHash) |
| Crawler | Scrapy + Playwright (headless Chromium) |
| Task Queue | Google Cloud Tasks |
| Streaming | WebRTC (aiortc for server-side) |
| Audio FP | Librosa + custom spectral fingerprinting |

### Google Cloud / Firebase
| Service | Purpose |
|---------|---------|
| Firebase Auth | User authentication (orgs, broadcasters, analysts) |
| Firestore | Asset registry, violation records, user data |
| Firebase Hosting | Frontend deployment |
| Google Cloud Storage | Watermarked originals, evidence screenshots |
| Cloud Functions | Serverless triggers (new asset -> watermark pipeline) |
| Cloud Pub/Sub | Real-time detection event streaming |
| BigQuery | Long-term analytics on propagation data |
| Vertex AI | Custom model training for sports content matching |
| Gemini Vision API | Semantic image/video similarity detection |
| Cloud Vision API | Label detection, logo detection, similarity |
| Firebase Performance | Frontend performance monitoring |

---

## 6. Frontend — Pages & UI/UX

### 6.1 Pages

#### `/` — Landing Page
- Hero section: animated globe showing content propagation in real-time
- 3-step explainer: Seal -> Detect -> Broadcast
- CTA: "Protect Your Assets" / "Start Broadcasting"
- Trusted-by logos section

#### `/dashboard` — Main Control Center
- **Summary Cards**: Total assets protected, Active violations, Streams live, DMCA filed
- **Live Feed**: Real-time violation alerts as cards (platform, reach, risk score)
- **Propagation Map**: World map heatmap of where content is being shared
- **Recent Activity**: Timeline of detections and actions

#### `/assets` — Asset Vault
- Grid view of all uploaded/registered assets
- Each card: thumbnail, hash ID, upload date, violation count, status badge
- Upload new asset (drag and drop)
- View asset DNA / fingerprint details

#### `/upload` — Seal an Asset
- Drag and drop or file picker (image/video)
- Preview panel
- Watermark strength slider (Subtle vs Robust)
- Generate Digital DNA -> download watermarked file
- Register to vault

#### `/broadcast` — Live Encrypted Studio
- Camera selector + microphone selector
- Live preview canvas (with watermark overlay toggle)
- "Go Live" button -> generates stream key + session DNA
- Real-time stats: frames/sec, viewers, watermark status
- Viewer link with token auth

#### `/violations` — Violation Tracker
- Table: URL, Platform, Detected At, Reach, Risk Score, Status
- Filters: platform, date range, risk level
- Per-violation: Evidence package, DMCA status, takedown action
- Bulk DMCA filing

#### `/analytics` — Insights
- Line charts: violations over time
- Bar charts: violations by platform
- Pie chart: content type breakdown
- BigQuery-powered propagation depth analysis

#### `/verify` — Public Verification Page
- Upload any image/video
- System checks if it contains a registered ORYGIN AI watermark
- Returns: Owner, Original upload date, License status

### 6.2 Design System
- **Color Palette**: Deep navy (#0A0E1A) base, electric cyan (#00D4FF) accent, amber (#FFB347) warning
- **Typography**: Inter (UI) + Space Grotesk (headings)
- **Motion**: Framer Motion for page transitions, card entrances, live pulse animations
- **Components**: Glassmorphism cards, neon-glow badges, animated stat counters

---

## 7. Backend Pipelines

### Pipeline 1 — Asset Sealing (Upload Flow)

```
User uploads file
       |
FastAPI /seal endpoint receives file
       |
Generate pHash + dHash fingerprints
       |
Inject steganographic watermark (OpenCV pixel manipulation)
       |
Generate cryptographic manifest (SHA-256 signed hash)
       |
Store original + watermarked copy -> Google Cloud Storage
       |
Register metadata -> Firestore (assets collection)
       |
Publish event -> Cloud Pub/Sub (asset.sealed topic)
       |
Return: Asset ID, DNA fingerprint, download URL
```

### Pipeline 2 — Detection & Crawling

```
Scheduler triggers crawl job (every 15 mins) via Cloud Tasks
       |
Scrapy spiders query platform APIs:
  - YouTube Data API v3
  - Twitter/X API v2
  - Instagram Basic Display API
  - General web: Playwright headless
       |
For each discovered media item:
  - Generate pHash
  - Compare against Firestore asset registry (hash similarity <= threshold)
       |
  [Match found?]
  YES -> Send to Gemini Vision API for semantic verification
       |
       Gemini confirms match
       |
       Calculate Risk Score (reach x platform weight x recency)
       |
       Write violation record -> Firestore (violations collection)
       |
       Publish event -> Pub/Sub (violation.detected topic)
       |
       Cloud Function triggers -> Firebase alert to dashboard
       |
       Evidence package captured (screenshot + metadata)
```

### Pipeline 3 — DMCA Automation

```
Rights holder reviews violation (or auto-threshold triggered)
       |
FastAPI /dmca/generate endpoint:
  - Pulls violation evidence from Firestore
  - Generates DMCA notice (templated PDF)
  - Packages: original asset proof, violation URL, timestamp, reach data
       |
Store evidence package -> GCS
       |
Update violation status in Firestore -> "DMCA_FILED"
       |
Notify rights holder via Firebase Cloud Messaging
```

---

## 8. Live Encrypted Streaming Module

### 8.1 Architecture

```
Broadcaster Browser
       |
getUserMedia() -> Raw camera/mic stream
       |
Canvas API intercepts video frames
       |
Steganographic watermark injected per frame
  (session DNA + broadcaster ID + timestamp)
       |
captureStream() -> Watermarked MediaStream
       |
WebRTC RTCPeerConnection (DTLS-SRTP encrypted)
       |
SFU Server (Livekit / aiortc)
       |
Per-viewer stream fork -> unique viewer watermark injected
       |
Viewers receive stream (token-authenticated)
```

### 8.2 Encryption Layers

| Layer | Mechanism | Protects Against |
|-------|-----------|-----------------|
| Transport | WebRTC DTLS-SRTP | MITM, packet sniffing |
| Content | Steganographic watermark | Unauthorized redistribution |
| Frame signing | SHA-256 per frame hash | Frame tampering |
| Stream auth | JWT viewer tokens | Unauthorized access |
| Visual overlay | CSS noise layer | Casual screenshotting |

### 8.3 Key APIs Used

```javascript
// Camera capture
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1920, height: 1080 },
  audio: true
});

// Frame interception for watermarking
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

function injectWatermark(videoElement, sessionDNA) {
  ctx.drawImage(videoElement, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // Steganographic pixel manipulation here
  embedDNA(imageData.data, sessionDNA);
  ctx.putImageData(imageData, 0, 0);
}

// Watermarked stream back to WebRTC
const watermarkedStream = canvas.captureStream(30);
peerConnection.addTrack(watermarkedStream.getVideoTracks()[0]);
```

### 8.4 Per-Viewer Watermarking Strategy

- Each viewer gets a **unique token** when joining
- Server-side: Livekit SFU receives clean stream from broadcaster
- Before forwarding to each viewer: a unique viewer-ID watermark is injected
- If a viewer leaks the stream: watermark in the leak identifies exactly which viewer

---

## 9. AI / ML Layer

### 9.1 Gemini Vision API — Content Matching
- Input: Crawled image or video frame
- Prompt: "Does this image contain sports content matching any of these fingerprint descriptions: [asset descriptions]?"
- Output: Confidence score, matched asset ID, reasoning
- Used for: Semantic matching beyond hash similarity (handles crops, recolors, overlays)

### 9.2 Vertex AI — Custom Sports Content Classifier
- Fine-tuned on sports media dataset
- Classifies content by: sport type, team, event, media type
- Used for: Prioritizing which violations to flag first

### 9.3 Perceptual Hashing Engine
- **pHash**: Frequency-domain fingerprint, robust to resizing/compression
- **dHash**: Gradient-based, fast comparison
- Comparison threshold: Hamming distance <= 10 = likely match
- Used for: First-pass filtering before expensive AI calls

### 9.4 Audio Fingerprinting
- Spectral analysis of audio track using Librosa
- Chroma feature extraction for music/commentary matching
- Used for: Detecting re-uploaded match highlights with original commentary

---

## 10. Database Design

### Firestore Collections

#### `assets`
```json
{
  "assetId": "uuid-v4",
  "orgId": "org_123",
  "fileName": "match_highlight_cl_final.mp4",
  "mediaType": "video",
  "uploadedAt": "timestamp",
  "pHash": "a3f2b1c4...",
  "dHash": "9f1a2b3c...",
  "manifestHash": "sha256:abc123...",
  "watermarkedUrl": "gs://sportshield-assets/watermarked/...",
  "originalUrl": "gs://sportshield-assets/originals/...",
  "status": "protected",
  "violationCount": 14,
  "tags": ["football", "champions-league", "2026"]
}
```

#### `violations`
```json
{
  "violationId": "uuid-v4",
  "assetId": "ref -> assets",
  "detectedAt": "timestamp",
  "platform": "youtube",
  "violatingUrl": "https://youtube.com/watch?v=...",
  "uploaderHandle": "@unofficial_sports",
  "reachEstimate": 45200,
  "riskScore": 87,
  "status": "detected | dmca_filed | removed | ignored",
  "evidenceUrl": "gs://sportshield-evidence/...",
  "geminiConfidence": 0.94,
  "matchType": "semantic | hash | audio"
}
```

#### `streams`
```json
{
  "streamId": "uuid-v4",
  "broadcasterId": "user_123",
  "orgId": "org_456",
  "sessionDNA": "dna-hex-string",
  "startedAt": "timestamp",
  "endedAt": "timestamp",
  "viewerCount": 134,
  "status": "live | ended",
  "viewerTokens": ["token_a", "token_b"],
  "recordingUrl": "gs://sportshield-recordings/..."
}
```

#### `organizations`
```json
{
  "orgId": "uuid-v4",
  "name": "FIFA",
  "plan": "enterprise",
  "assetsCount": 12400,
  "activeStreams": 3,
  "violationsThisMonth": 892,
  "dmcaFiled": 201,
  "createdAt": "timestamp"
}
```

### BigQuery Tables

| Table | Purpose |
|-------|---------|
| `violations_history` | Long-term violation analytics |
| `propagation_graph` | Content spread paths (source -> resharer -> resharer) |
| `platform_metrics` | Per-platform violation rates over time |
| `stream_events` | Per-frame watermark events, viewer join/leave |

---

## 11. Security Model

```
Authentication Layer
  Firebase Auth (JWT)
  Role-based: Admin, Analyst, Viewer

Asset Security Layer
  AES-256 encryption at rest (GCS)
  SHA-256 signed manifests
  Watermark: LSB steganography

Stream Security Layer
  WebRTC DTLS-SRTP (transport)
  Per-viewer JWT stream tokens
  Canvas-level watermark injection
  Anti-screenshot CSS overlay

API Security Layer
  CORS restricted to known origins
  Rate limiting (Cloud Armor)
  All secrets in Secret Manager
```

---

## 12. GDG Google Services Alignment

| Google Service | How Used | Impact |
|---------------|----------|--------|
| **Gemini Vision API** | Semantic content matching in detection pipeline | Core AI differentiator |
| **Vertex AI** | Custom sports content classifier | Precision improvement |
| **Cloud Vision API** | Logo, label, similarity detection | Broad coverage |
| **Firebase Auth** | Org/user authentication, role management | Security foundation |
| **Firestore** | Asset registry, violations, streams (real-time) | Core database |
| **Firebase Hosting** | Frontend deployment (CDN-backed) | Global availability |
| **Firebase Performance** | Frontend performance monitoring | Optimization insights |
| **Cloud Storage (GCS)** | Watermarked assets, evidence, recordings | Scalable media storage |
| **Cloud Functions** | Serverless pipeline triggers | Event-driven automation |
| **Cloud Pub/Sub** | Real-time detection event bus | Sub-second alerting |
| **Cloud Tasks** | Scheduled crawler job management | Reliable crawl scheduling |
| **BigQuery** | Long-term propagation analytics | Enterprise insights |
| **Firebase Cloud Messaging** | Push alerts to rights holders | Real-time notifications |
| **Secret Manager** | API keys, watermark seeds | Security compliance |

---

## 13. MVP Scope & Roadmap

### Phase 1 — Hackathon MVP (2 weeks)

- [ ] Landing page with animated demo
- [ ] Firebase Auth (org login)
- [ ] Asset upload + pHash fingerprinting
- [ ] Steganographic watermark injection (OpenCV)
- [ ] Asset vault dashboard
- [ ] Basic violation simulation (mock crawl data)
- [ ] Gemini Vision API integration (verify single image)
- [ ] Live streaming module (1 broadcaster to 1 viewer WebRTC demo)
- [ ] Real-time watermark on stream frames
- [ ] Public /verify page
- [ ] Firestore integration

### Phase 2 — Post-Hackathon

- [ ] Real crawler (YouTube API + Twitter API)
- [ ] Audio fingerprinting pipeline
- [ ] Multi-viewer SFU streaming (Livekit)
- [ ] Per-viewer watermarking
- [ ] DMCA automation
- [ ] BigQuery analytics integration
- [ ] Vertex AI custom classifier training
- [ ] Mobile-responsive progressive web app

### Phase 3 — Production

- [ ] Enterprise multi-org support
- [ ] Dark web / Telegram monitoring
- [ ] Real-time propagation graph visualization
- [ ] Legal evidence API (court-grade documentation)
- [ ] Partner API for third-party integrations

---

> **ORYGIN AI** — *Your content, your DNA, your rights.*
