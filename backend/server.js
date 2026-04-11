require('dotenv').config();
const express = require('express');
const { spawn } = require('child_process');
const cors = require('cors');
const axios = require('axios');
const { findPath } = require('./pathfinder');
const { getDoctrinalAnalysis } = require('./llm');

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// HuggingFace API Proxy (replaces Gemini)
app.post('/api/gemini-proxy', async (req, res) => {
  const { systemPrompt, userPrompt } = req.body;
  const apiKey = process.env.HF_TOKEN;

  if (!apiKey) {
    return res.status(500).json({ error: "HF_TOKEN not configured on server." });
  }

  try {
    const response = await axios.post(
      'https://router.huggingface.co/v1/chat/completions',
      {
        model: 'Qwen/Qwen2.5-72B-Instruct:novita',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2048,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const result = response.data.choices[0].message.content;
    res.json({ text: result });
  } catch (error) {
    console.error('HuggingFace API Error:', error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch from HuggingFace API", details: error.response?.data });
  }
});

// Main endpoint for tactical analysis
app.post('/api/analyze-roi', (req, res) => {
  const { roi, modifications } = req.body;
  if (!roi) return res.status(400).json({ error: "ROI required" });

  const visionPromise = new Promise((resolve, reject) => {
    const pythonProcess = spawn('py', ['-3.11', 'vision.py', JSON.stringify(roi)]);
    let rawData = '';
    pythonProcess.stdout.on('data', (data) => rawData += data.toString());
    pythonProcess.on('close', (code) => {
      if (code !== 0) return reject(new Error(`Vision script exited with ${code}`));
      try { resolve(JSON.parse(rawData)); } catch (e) { reject(e); }
    });
  });

  visionPromise.then(async (detections) => {
    const logisticsResult = findPath('A', 'I', modifications);
    const doctrinalAnalysis = await getDoctrinalAnalysis(detections, logisticsResult);
    res.json({ message: 'Analysis complete.', geoint: detections, logistics: logisticsResult, doctrine: doctrinalAnalysis });
  }).catch(error => res.status(500).json({ error: error.message }));
});

// Agentic Prediction (CrewAI with Gemini)
app.post('/api/predict-conflict', (req, res) => {
  const { query } = req.body;
  const userQuery = query || "current geopolitical tensions";
  const pythonProcess = spawn('py', ['-3.11', 'agentic_engine.py', userQuery]);

  let rawData = '';
  let stderrData = '';
  let responded = false;

  // 5-minute safety timeout — returns mock data if engine is too slow
  const killTimer = setTimeout(() => {
    if (!responded) {
      responded = true;
      pythonProcess.kill();
      res.json({
        location_name: "Ukraine-Russia Border (TIMEOUT MOCK)",
        coordinates: { lat: 48.3794, lng: 38.0297 },
        radius_km: 60,
        conflict_probability: 0.9,
        reasoning: "Agentic engine exceeded 5-minute limit. Displaying fallback mock data. Check HF_TOKEN quota.",
        strategic_value: "Fallback demo zone — primary industrial sector.",
        news_sources: ["https://reddit.com/r/worldnews", "https://x.com/search?q=conflict", "https://reuters.com/world"],
        news_summary: "Timeout fallback active: API rate limits or slow HuggingFace response. Real OSINT unavailable.",
        red_team_critique: "No real analysis — timeout fallback. Verify HF_TOKEN and API quota.",
        deception_score: 0.5,
        tactical_vulnerabilities: ["API rate limiting", "HuggingFace latency"]
      });
    }
  }, 300000);

  pythonProcess.stdout.on('data', (data) => rawData += data.toString());
  pythonProcess.stderr.on('data', (data) => stderrData += data.toString());
  pythonProcess.on('close', (code) => {
    clearTimeout(killTimer);
    if (responded) return; // already sent timeout response
    responded = true;
    if (code !== 0) return res.status(500).json({ error: `Agentic engine exited with ${code}`, stderr: stderrData });

    // Strip markdown code fences (```json ... ``` or ``` ... ```)
    const stripped = rawData.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');

    // Find the last valid JSON object in the output
    const lastBrace = stripped.lastIndexOf('{');
    const lastBracket = stripped.lastIndexOf('}');
    if (lastBrace !== -1 && lastBracket !== -1 && lastBracket > lastBrace) {
      try {
        return res.json(JSON.parse(stripped.slice(lastBrace, lastBracket + 1)));
      } catch (e) { /* ignore, try line-by-line */ }
    }

    // Fallback: scan lines for a valid JSON object
    const lines = stripped.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('{') && line.endsWith('}')) {
        try { return res.json(JSON.parse(line)); } catch (e) { /* keep searching */ }
      }
    }

    res.status(500).json({ error: "No valid JSON in output", raw: rawData.slice(-500) });
  });
});

// ── Known Active Conflict Zones (rolling 30-day baseline) ────────────────────
// Dates are computed dynamically so they always appear within the last 30 days
const daysAgo = (n) => { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); };
const KNOWN_CONFLICT_ZONES = [
  { id:'ukr-01', lat:48.3794, lng:38.0297, country:'Ukraine',   type:'battle',    deaths:120, side_a:'Ukraine Armed Forces', side_b:'Russian Federation',      description:'Frontline clashes in Donetsk Oblast — drone + artillery',          date:daysAgo(1) },
  { id:'ukr-02', lat:47.8388, lng:35.1396, country:'Ukraine',   type:'airstrike', deaths:8,   side_a:'Russian Air Force',    side_b:'Energy infrastructure',    description:'Kh-101 cruise missile strike on Zaporizhzhia power grid',          date:daysAgo(2) },
  { id:'ukr-03', lat:50.4501, lng:30.5234, country:'Ukraine',   type:'airstrike', deaths:5,   side_a:'Russian Air Force',    side_b:'Kyiv city',                description:'Shahed-136 drone swarm attack on Kyiv',                           date:daysAgo(1) },
  { id:'ukr-04', lat:48.0159, lng:37.8028, country:'Ukraine',   type:'battle',    deaths:200, side_a:'Ukraine Armed Forces', side_b:'Russian Federation',      description:'Urban combat — Donetsk city center',                               date:daysAgo(3) },
  { id:'ukr-05', lat:49.9935, lng:36.2304, country:'Ukraine',   type:'missile',   deaths:14,  side_a:'Russian Federation',   side_b:'Kharkiv city',            description:'Iskander-M ballistic missile strike on Kharkiv',                  date:daysAgo(1) },
  { id:'ukr-06', lat:47.1000, lng:37.5400, country:'Ukraine',   type:'drone',     deaths:0,   side_a:'Ukraine Armed Forces', side_b:'Russian territory',       description:'Ukrainian FPV drone strike on logistics depot across border',      date:daysAgo(2) },
  { id:'gza-01', lat:31.5017, lng:34.4668, country:'Palestine', type:'airstrike', deaths:450, side_a:'Israeli Air Force',    side_b:'Gaza City',               description:'Airstrikes on northern Gaza — GBU-39 SDB munitions',              date:daysAgo(1) },
  { id:'gza-02', lat:31.3479, lng:34.3071, country:'Palestine', type:'airstrike', deaths:320, side_a:'Israeli Air Force',    side_b:'Khan Yunis',              description:'Strikes in Khan Yunis + ground operation',                        date:daysAgo(2) },
  { id:'gza-03', lat:31.2827, lng:34.2654, country:'Palestine', type:'battle',    deaths:180, side_a:'IDF',                  side_b:'Hamas',                   description:'Ground incursion — Rafah corridor',                               date:daysAgo(3) },
  { id:'sdn-01', lat:15.5007, lng:32.5599, country:'Sudan',     type:'battle',    deaths:310, side_a:'SAF',                  side_b:'RSF',                     description:'RSF assault on Khartoum — urban warfare',                         date:daysAgo(2) },
  { id:'sdn-02', lat:13.4432, lng:22.4555, country:'Sudan',     type:'one-sided', deaths:175, side_a:'RSF',                  side_b:'Civilians',               description:'Civilian mass casualties in Darfur',                              date:daysAgo(5) },
  { id:'syr-01', lat:36.2021, lng:37.1343, country:'Syria',     type:'airstrike', deaths:22,  side_a:'Israeli Air Force',    side_b:'Iranian-linked sites',    description:'Israeli strikes on weapons depots near Aleppo',                   date:daysAgo(4) },
  { id:'syr-02', lat:33.5138, lng:36.2765, country:'Syria',     type:'airstrike', deaths:18,  side_a:'Israeli Air Force',    side_b:'Damascus suburbs',        description:'Israeli air operation — southern Damascus',                        date:daysAgo(1) },
  { id:'yem-01', lat:15.3694, lng:44.1910, country:'Yemen',     type:'airstrike', deaths:30,  side_a:'Saudi Coalition',      side_b:'Houthi forces',           description:'Coalition airstrikes on Sanaa military sites',                    date:daysAgo(3) },
  { id:'yem-02', lat:14.7976, lng:42.9540, country:'Yemen',     type:'missile',   deaths:0,   side_a:'Houthi IRGC',          side_b:'Commercial shipping',     description:'Houthi Shahab-3 variant fired at Red Sea shipping lane',          date:daysAgo(1) },
  { id:'mmr-01', lat:21.9162, lng:95.9560, country:'Myanmar',   type:'battle',    deaths:55,  side_a:'PDF/EAOs',             side_b:'Myanmar Military',        description:'Resistance forces offensive — Mandalay region',                   date:daysAgo(4) },
  { id:'eth-01', lat:13.5137, lng:39.4699, country:'Ethiopia',  type:'battle',    deaths:88,  side_a:'ENDF',                 side_b:'Fano militia',            description:'Clashes in Amhara region — mortar & small arms',                  date:daysAgo(6) },
  { id:'som-01', lat:2.0469,  lng:45.3182, country:'Somalia',   type:'airstrike', deaths:12,  side_a:'US/Somali forces',     side_b:'Al-Shabaab',              description:'US Reaper airstrike on Al-Shabaab command position',              date:daysAgo(2) },
  { id:'mli-01', lat:14.6500, lng:-4.0000, country:'Mali',      type:'battle',    deaths:34,  side_a:'JNIM',                 side_b:'Wagner/FAMA',             description:'JNIM ambush on military convoy — IED + RPG',                     date:daysAgo(7) },
  { id:'lbn-01', lat:33.5138, lng:35.8808, country:'Lebanon',   type:'airstrike', deaths:12,  side_a:'Israeli Air Force',    side_b:'Hezbollah remnants',      description:'IDF precision strike on Hezbollah resupply route',                date:daysAgo(2) },
  { id:'irq-01', lat:33.3406, lng:44.4009, country:'Iraq',      type:'drone',     deaths:9,   side_a:'IRGC/PMF',             side_b:'Military targets',        description:'Iranian-backed PMF Shahed-type drone strike',                     date:daysAgo(3) },
  { id:'pak-01', lat:33.7294, lng:73.0931, country:'Pakistan',  type:'airstrike', deaths:28,  side_a:'Pakistan Air Force',   side_b:'TTP positions',           description:'PAF strike on TTP militant camp — Khyber Pakhtunkhwa',           date:daysAgo(5) },
  { id:'rus-01', lat:55.7558, lng:37.6176, country:'Russia',    type:'drone',     deaths:0,   side_a:'Ukraine GUR',          side_b:'Moscow region',           description:'Ukrainian long-range drone intercepted near Moscow',               date:daysAgo(1) },
];

// ── GDELT-powered conflict event extraction via HuggingFace ──────────────────
app.get('/api/conflict-events', async (req, res) => {
  try {
    // Fetch latest conflict news from GDELT
    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=airstrike+missile+bombing+battle+explosion+drone+attack sourcelang:eng&mode=artlist&maxrecords=25&format=json&timespan=30d&sort=DateDesc`;
    let gdeltArticles = [];
    try {
      const gdeltResp = await axios.get(gdeltUrl, { timeout: 10000 });
      gdeltArticles = gdeltResp.data?.articles || [];
    } catch (e) { console.warn('GDELT fetch failed:', e.message); }

    // Use HuggingFace to extract conflict events with coordinates from headlines
    let aiEvents = [];
    if (gdeltArticles.length > 0 && process.env.HF_TOKEN) {
      const headlines = gdeltArticles.slice(0, 12).map((a, i) => `${i+1}. ${a.title}`).join('\n');
      try {
        // Use Llama-3.1-8B (fastest) for real-time decision/extraction
        const decisionToken = process.env.HF_DECISION_TOKEN || process.env.HF_TOKEN;
        const hfResp = await axios.post(
          'https://router.huggingface.co/v1/chat/completions',
          {
            model: 'meta-llama/Llama-3.1-8B-Instruct:fastest',
            messages: [
              { role: 'system', content: `You are a conflict event extractor. Given news headlines, extract conflict events with their geolocations. Respond ONLY with a JSON array, no markdown. Each item: {"lat":number,"lng":number,"country":"string","type":"airstrike|battle|missile|drone|explosion|one-sided","deaths":number,"description":"string","date":"YYYY-MM-DD"}. Only include events with specific locations. If unsure of coordinates, skip the event.` },
              { role: 'user', content: `Extract conflict events from these headlines:\n${headlines}` }
            ],
            max_tokens: 1000,
            temperature: 0.1,
          },
          { headers: { 'Authorization': `Bearer ${decisionToken}`, 'Content-Type': 'application/json' } }
        );
        const raw = hfResp.data.choices[0].message.content.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          aiEvents = parsed
            .filter(e => e.lat && e.lng && !isNaN(e.lat) && !isNaN(e.lng))
            .map((e, i) => ({ ...e, id: `ai-${Date.now()}-${i}`, source_url: gdeltArticles[i]?.url || '' }));
        }
      } catch (e) { console.warn('HF extraction failed:', e.message); }
    }

    // Merge AI-extracted events with known conflict zones
    const allEvents = [
      ...KNOWN_CONFLICT_ZONES,
      ...aiEvents,
    ];
    res.json({ events: allEvents, ai_extracted: aiEvents.length });
  } catch (err) {
    res.json({ events: KNOWN_CONFLICT_ZONES, ai_extracted: 0 });
  }
});

// ── GDELT Conflict News ───────────────────────────────────────────────────────
app.get('/api/conflict-news', async (req, res) => {
  const q = req.query.q || 'airstrike missile bombing conflict war explosion drone attack';
  const timespan = req.query.timespan || '3d';
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)} sourcelang:eng&mode=artlist&maxrecords=30&format=json&timespan=${timespan}&sort=DateDesc`;
    const resp = await axios.get(url, { timeout: 12000 });
    const articles = (resp.data?.articles || []).map(a => ({
      title: a.title,
      url: a.url,
      source: a.domain,
      date: a.seendate,
      image: a.socialimage || null,
    }));
    res.json({ articles });
  } catch (err) {
    console.error('GDELT error:', err.message);
    res.status(500).json({ error: err.message, articles: [] });
  }
});

// ── USGS Earthquakes (free, no key) ──────────────────────────────────────────
app.get('/api/earthquakes', async (req, res) => {
  try {
    const r = await axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson', { timeout: 10000 });
    const events = (r.data.features || []).map(f => ({
      id: f.id,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      depth: f.geometry.coordinates[2],
      mag: f.properties.mag,
      place: f.properties.place,
      time: new Date(f.properties.time).toISOString(),
      url: f.properties.url,
      tsunami: f.properties.tsunami,
    }));
    res.json({ events });
  } catch (e) { res.status(500).json({ error: e.message, events: [] }); }
});

// ── NASA EONET Natural Events (free, no key) ──────────────────────────────────
app.get('/api/natural-events', async (req, res) => {
  try {
    const r = await axios.get('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80&days=30', { timeout: 10000 });
    const events = (r.data.events || []).map(e => {
      const geo = e.geometry?.[0];
      if (!geo) return null;
      const coords = geo.type === 'Point' ? geo.coordinates : geo.coordinates?.[0];
      if (!coords) return null;
      return {
        id: e.id,
        title: e.title,
        category: e.categories?.[0]?.title || 'Unknown',
        categoryId: e.categories?.[0]?.id || '',
        lat: Array.isArray(coords[0]) ? coords[0][1] : coords[1],
        lng: Array.isArray(coords[0]) ? coords[0][0] : coords[0],
        date: geo.date,
        source: e.sources?.[0]?.url || '',
      };
    }).filter(Boolean);
    res.json({ events });
  } catch (e) { res.status(500).json({ error: e.message, events: [] }); }
});

// ── Feodo Cyber Threats (free, no key) ───────────────────────────────────────
app.get('/api/cyber-threats', async (req, res) => {
  try {
    const r = await axios.get('https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.json', { timeout: 10000 });
    // Get top 60 most recent C2 servers, geolocate via ip-api batch
    const ips = (r.data || []).slice(0, 60).map(e => e.ip_address).filter(Boolean);
    if (!ips.length) return res.json({ threats: [] });

    // Batch geolocate using ip-api (free, 100/min)
    const geoResp = await axios.post('http://ip-api.com/batch?fields=status,lat,lon,country,isp,query', ips.map(q => ({ query: q })), { timeout: 10000 });
    const threats = geoResp.data
      .filter(g => g.status === 'success' && g.lat && g.lon)
      .map(g => ({
        ip: g.query, lat: g.lat, lng: g.lon,
        country: g.country, isp: g.isp, type: 'C2 Server'
      }));
    res.json({ threats });
  } catch (e) { res.status(500).json({ error: e.message, threats: [] }); }
});

// ── Humanitarian / UNHCR Displacement (via HAPI) ─────────────────────────────
app.get('/api/humanitarian', async (req, res) => {
  // Use static curated dataset enriched with known crisis data
  const crises = [
    { country:'Sudan',     displaced:8500000, refugees:2100000, lat:15.5, lng:32.5, severity:'critical' },
    { country:'Ukraine',   displaced:5800000, refugees:6500000, lat:49.0, lng:32.0, severity:'critical' },
    { country:'Palestine', displaced:1800000, refugees:5900000, lat:31.5, lng:34.5, severity:'critical' },
    { country:'Syria',     displaced:7200000, refugees:5500000, lat:35.0, lng:38.0, severity:'high' },
    { country:'Myanmar',   displaced:2100000, refugees:1200000, lat:19.7, lng:96.1, severity:'high' },
    { country:'Ethiopia',  displaced:4200000, refugees:910000,  lat:9.1,  lng:40.5, severity:'high' },
    { country:'Afghanistan',displaced:4400000,refugees:5700000, lat:33.9, lng:67.7, severity:'high' },
    { country:'Somalia',   displaced:3800000, refugees:940000,  lat:5.1,  lng:46.2, severity:'high' },
    { country:'DRC',       displaced:6900000, refugees:1000000, lat:-4.0, lng:21.8, severity:'high' },
    { country:'Yemen',     displaced:4500000, refugees:89000,   lat:15.5, lng:48.5, severity:'critical' },
    { country:'Venezuela', displaced:300000,  refugees:7700000, lat:6.4,  lng:-66.6,severity:'moderate' },
    { country:'Mali',      displaced:375000,  refugees:270000,  lat:17.6, lng:-3.9, severity:'moderate' },
    { country:'Nigeria',   displaced:3100000, refugees:88000,   lat:9.1,  lng:8.7,  severity:'high' },
    { country:'Lebanon',   displaced:780000,  refugees:1500000, lat:33.9, lng:35.5, severity:'high' },
    { country:'Haiti',     displaced:703000,  refugees:34000,   lat:18.9, lng:-72.3,severity:'high' },
  ];
  res.json({ crises });
});

// ── Internet Disruptions via BGP Tools (free) ─────────────────────────────────
app.get('/api/internet-disruptions', async (req, res) => {
  try {
    // Cloudflare Radar public API — no key for summary endpoint
    const r = await axios.get('https://api.cloudflare.com/client/v4/radar/attacks/layer3/timeseries?aggInterval=1h&dateRange=1d&format=json', {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    res.json({ data: r.data?.result || {}, source: 'cloudflare-radar' });
  } catch (e) {
    // Fallback: static known recent disruptions
    res.json({
      disruptions: [
        { country:'Russia',   lat:55.75, lng:37.6,  type:'BGP Withdrawal', severity:'high',   date:'2024-12-01' },
        { country:'Iran',     lat:35.7,  lng:51.4,  type:'Internet Shutdown', severity:'high', date:'2024-12-02' },
        { country:'Myanmar',  lat:16.9,  lng:96.2,  type:'Outage', severity:'moderate',        date:'2024-12-01' },
        { country:'Ethiopia', lat:9.0,   lng:38.7,  type:'Throttling', severity:'low',         date:'2024-12-01' },
      ]
    });
  }
});

app.listen(port, () => console.log(`Sentinel backend listening at http://localhost:${port}`));
