# Sentinel — Intelligence Platform

A real-time military intelligence dashboard powered by a 5-agent AI pipeline, live conflict data feeds, and an interactive tactical map.

**Live:** [sentinelplatform.vercel.app](https://sentinelplatform.vercel.app)

---

## Overview

Sentinel aggregates live geopolitical data — conflict events, breaking news, cyber threats, earthquakes, humanitarian crises, and internet disruptions — and feeds it into a chain of specialised AI agents that produce structured intelligence briefs, threat scores, and ROI predictions directly overlaid on a world map.

---

## Features

### 5-Agent AI Pipeline
Each agent runs in sequence, with each feeding its output to the next:

| Agent | Role |
|-------|------|
| OSINT Intelligence Officer | Multi-source harvest — SIGINT, IMINT, HUMINT, SOCMINT, live news injection |
| Strategic Threat Analyst | Escalation scoring, NLP pattern detection, war doctrine analysis |
| War Games Director | Military scenario simulation, psychological ops assessment, outcomes modelling |
| Humanitarian Impact Modeler | Civilian risk, displacement projection, infrastructure vulnerability |
| Commander's Board Synthesis | Cross-agent brief, strategic recommendations, traceable sourcing |

### Live Data Feeds (8 endpoints)
- **Conflict Events** — 28 pre-seeded zones + AI-extracted from GDELT (includes Kashmir, LoC, Pakistan TTP, Manipur, Naxal corridors)
- **Conflict News** — Live GDELT headlines (India, Pakistan, Ukraine, Russia, Gaza, drone, attack) — auto-refreshes every 90s
- **Cyber Threats** — Live botnet C2 IPs from Feodo Tracker
- **Earthquakes** — USGS real-time seismic feed
- **Natural Events** — NASA EONET fire, storm, flood events
- **Humanitarian** — ReliefWeb crisis reports
- **Internet Disruptions** — NetBlocks-style outage detection
- **Conflict Prediction** — HuggingFace LLM (Qwen-72B) 3-step analysis pipeline

### Tactical Map
- Interactive Leaflet map with live event markers
- Color-coded by event type (conflict, cyber, earthquake, humanitarian)
- ROI (Region of Interest) prediction zone overlay
- Agent intel popups on map markers

### Live Footage Tab
- 6 live news streams embedded directly (muted autoplay)
- Al Jazeera, DW News, France 24, Sky News, NDTV India, Bloomberg
- Fallback "Open in YouTube" link if embed is blocked

### Fully Responsive
| Screen | Behaviour |
|--------|-----------|
| Desktop (≥1024px) | Permanent side panel (390–420px), map shrinks |
| Tablet (768–1023px) | Slide-in overlay drawer, tap-outside to close |
| Large phone (480–767px) | Bottom sheet (85vh), rounded top corners |
| Phone (≤479px) | Full-width bottom sheet (88vh), iOS safe area |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Styling | Plain CSS (no framework) |
| Map | Leaflet via react-leaflet |
| AI | HuggingFace Inference Router — Qwen2.5-72B (analysis), Llama-3.1-8B (extraction) |
| Backend | Vercel Serverless Functions (Node.js 20) |
| Deployment | Vercel |
| News | GDELT Project API |
| Threat Intel | Feodo Tracker, USGS, NASA EONET, ReliefWeb |

---

## Project Structure

```
conflict-sentinel/
├── api/                        # Vercel serverless functions
│   ├── gemini-proxy.js         # LLM proxy → HuggingFace (Qwen-72B)
│   ├── predict-conflict.js     # 3-step conflict prediction pipeline
│   ├── conflict-events.js      # Live conflict zone events
│   ├── conflict-news.js        # GDELT live news feed
│   ├── cyber-threats.js        # Feodo Tracker botnet IPs
│   ├── earthquakes.js          # USGS seismic data
│   ├── natural-events.js       # NASA EONET
│   ├── humanitarian.js         # ReliefWeb crisis reports
│   └── internet-disruptions.js # Internet outage detection
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Root layout, responsive panel logic
│   │   ├── App.css             # Responsive layout (5 breakpoints)
│   │   ├── SentinelPlatform.jsx # Full intelligence platform UI
│   │   ├── TacticalMap.jsx     # Leaflet map component
│   │   ├── HeroBackground.jsx  # Animated background
│   │   └── index.css           # Global reset + scrollbar
│   └── index.html              # HTML entry point
├── package.json                # Root deps (axios for serverless)
├── vercel.json                 # Vercel build + function config
└── .env.example                # Required environment variables
```

---

## Environment Variables

Create a `.env` file at the project root (or set these in Vercel → Project Settings → Environment Variables):

```env
HF_TOKEN=your_huggingface_token_here
```

Get a free HuggingFace token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

> `HF_DECISION_TOKEN` is optional — falls back to `HF_TOKEN` if not set.

---

## Local Development

```bash
# 1. Clone
git clone https://github.com/prasadghumare1101/conflict-sentinel.git
cd conflict-sentinel

# 2. Install dependencies
npm install
cd frontend && npm install && cd ..

# 3. Set environment variables
cp .env.example .env
# Edit .env and add your HF_TOKEN

# 4. Run with Vercel CLI (runs both frontend dev server + serverless functions)
npx vercel dev
```

The app will be available at `http://localhost:3000`.

---

## Deployment (Vercel)

This project is pre-configured for Vercel. To deploy your own instance:

1. Fork this repository
2. Import it at [vercel.com/new](https://vercel.com/new)
3. Add `HF_TOKEN` in **Project Settings → Environment Variables**
4. Deploy — Vercel auto-builds on every push to `main`

The `vercel.json` handles:
- Installing both root and frontend dependencies
- Building the Vite frontend
- Routing all non-API requests to the React SPA
- Per-function timeout limits (60s for LLM, 10–30s for data feeds)

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/gemini-proxy` | POST | LLM inference (Qwen-72B via HuggingFace) |
| `GET /api/predict-conflict` | GET | 3-step conflict prediction |
| `GET /api/conflict-events` | GET | Live conflict zone markers |
| `GET /api/conflict-news` | GET | GDELT breaking news |
| `GET /api/cyber-threats` | GET | Botnet C2 IP list |
| `GET /api/earthquakes` | GET | USGS seismic events |
| `GET /api/natural-events` | GET | NASA EONET natural events |
| `GET /api/humanitarian` | GET | ReliefWeb crisis reports |
| `GET /api/internet-disruptions` | GET | Internet outage detection |

---

## License

MIT
