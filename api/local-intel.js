// api/local-intel.js — Vercel serverless: Local Intelligence endpoint
// Handles: location search, boundary lookup, local news, AI-powered movement analysis
// Keeps ALL existing endpoints 100% intact — this is a net-new file.

const axios = require('axios');

/* ── helpers ────────────────────────────────────────────────────────────── */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Simple risk scorer from headline text (replaces local sklearn on serverless)
function scoreHeadlines(titles, location) {
  const HIGH_KW  = ['airstrike','missile','bombing','explosion','troops','convoy','assault','killed','attack','shelling','drone strike','clashes'];
  const MED_KW   = ['military','tension','border','protest','deployment','exercise','patrol','arrest','blockade'];
  const locLow   = location.toLowerCase();

  let score = 0;
  let locationHits = 0;
  const combined = titles.join(' ').toLowerCase();

  HIGH_KW.forEach(kw => { if (combined.includes(kw)) score += 2; });
  MED_KW.forEach(kw  => { if (combined.includes(kw)) score += 1; });

  titles.forEach(t => { if (t.toLowerCase().includes(locLow)) locationHits++; });

  const normalized = Math.min(1, score / (titles.length * 2 + 1));
  const level = normalized > 0.6 ? 'CRITICAL' : normalized > 0.4 ? 'HIGH' : normalized > 0.2 ? 'MODERATE' : 'LOW';
  return { score: normalized, level, locationHits };
}

// Derive movement patterns from headlines
function detectMovements(titles) {
  const patterns = [
    { kws: ['convoy','vehicle','truck','armor','tank'],  type:'vehicle',  color:'#ef4444' },
    { kws: ['troops','soldiers','infantry','deployment'],type:'troops',   color:'#f59e0b' },
    { kws: ['ship','naval','vessel','fleet','submarine'],type:'naval',    color:'#3b82f6' },
    { kws: ['drone','uav','fpv','aerial'],               type:'drone',    color:'#a855f7' },
    { kws: ['construction','fortification','trench'],    type:'construct',color:'#6b7280' },
  ];
  const found = [];
  const combined = titles.join(' ').toLowerCase();
  patterns.forEach(p => {
    if (p.kws.some(kw => combined.includes(kw))) found.push(p.type);
  });
  return found.length ? found : ['general'];
}

// Parse GDELT seendate → ISO
function parseGdeltDate(raw) {
  try {
    const s = String(raw);
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:00Z`;
  } catch { return null; }
}

/* ── Nominatim boundary fetch ────────────────────────────────────────────── */
async function fetchBoundary(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&addressdetails=1&limit=5`;
    const resp = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Sentinel-Intelligence-Platform/1.0 (contact@sentinel.io)' }
    });
    const results = resp.data || [];
    if (!results.length) return null;

    // Pick the best match (prefer admin boundaries over POIs)
    const ranked = results.sort((a, b) => {
      const pref = ['administrative','country','state','county','city','town','village'];
      const ia = pref.indexOf(a.type); const ib = pref.indexOf(b.type);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const best = ranked[0];
    return {
      display_name: best.display_name,
      lat: parseFloat(best.lat),
      lng: parseFloat(best.lon),
      type: best.type,
      address: best.address || {},
      geojson: best.geojson || null,
      boundingbox: best.boundingbox ? best.boundingbox.map(Number) : null,
    };
  } catch (e) {
    return null;
  }
}

/* ── GDELT local news with retry ────────────────────────────────────────── */
async function fetchLocalNews(location, timespan = '7d') {
  const queries = [
    `"${location}" conflict attack military`,
    `${location} troops military tension`,
    `${location} war violence crisis`,
  ];
  for (const q of queries) {
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}+sourcelang:eng&mode=artlist&maxrecords=25&format=json&timespan=${timespan}&sort=DateDesc`;
      const resp = await axios.get(url, { timeout: 10000 });
      const articles = (resp.data?.articles || []).map(a => ({
        title:  a.title,
        url:    a.url,
        source: a.domain,
        date:   parseGdeltDate(a.seendate),
        image:  a.socialimage || null,
      }));
      if (articles.length >= 3) return articles;
      await sleep(800);
    } catch (e) {
      await sleep(800);
    }
  }
  return [];
}

/* ── HuggingFace-powered prediction ─────────────────────────────────────── */
async function llmPredict(location, headlines, hfToken) {
  if (!hfToken || !headlines.length) return null;

  const headlineStr = headlines.slice(0, 12).map((h, i) => `${i+1}. ${h}`).join('\n');
  const systemPrompt = `You are a military OSINT analyst. Given news headlines about a location, predict the next 30-90 minute activity.
Respond ONLY with a JSON object:
{
  "activity_probability": <0.0-1.0>,
  "risk_level": "LOW|MODERATE|HIGH|CRITICAL",
  "confidence": <0.0-1.0>,
  "predicted_direction": "North|South|East|West|Northeast|Southeast|Southwest|Northwest|Undetermined",
  "timeframe_minutes": <30-120>,
  "hotspot_areas": ["string","string"],
  "reasoning": "1-2 sentence explanation",
  "movement_types": ["vehicle|troops|naval|drone|construct"]
}`;
  try {
    const resp = await axios.post(
      'https://router.huggingface.co/v1/chat/completions',
      {
        model: 'meta-llama/Llama-3.1-8B-Instruct:fastest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: `Location: ${location}\n\nRecent headlines:\n${headlineStr}` }
        ],
        max_tokens: 400,
        temperature: 0.2,
      },
      { headers: { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'application/json' }, timeout: 25000 }
    );
    const raw = resp.data.choices[0].message.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    return null;
  }
}

/* ── 7 Local Intelligence Agents ─────────────────────────────────────────── */
// Each agent specialises in one geographic/source granularity level.
// They run in parallel and each synthesises a focused 1-3 sentence brief.

const LOCAL_AGENTS = [
  {
    id: 'regional', icon: '🗺', color: '#3b82f6',
    label: 'Regional Intel Officer',
    desc: 'State/Province-level patterns · cross-district correlation',
    queryMod: (loc) => `${loc} region state province conflict military`,
    timespan: '14d',
  },
  {
    id: 'district', icon: '📍', color: '#f59e0b',
    label: 'District Field Analyst',
    desc: 'District/County operations · local administration · checkpoints',
    queryMod: (loc) => `${loc} district county local forces checkpoint`,
    timespan: '7d',
  },
  {
    id: 'city', icon: '🏙', color: '#a855f7',
    label: 'Urban Intelligence Monitor',
    desc: 'City/urban centre events · civilian impact · infrastructure',
    queryMod: (loc) => `${loc} city urban attack bombing explosion protest`,
    timespan: '3d',
  },
  {
    id: 'village', icon: '🏘', color: '#c2773a',
    label: 'Village & Rural Scout',
    desc: 'Village/rural activity · IED reports · population movement',
    queryMod: (loc) => `${loc} village rural town displacement civilians`,
    timespan: '7d',
  },
  {
    id: 'social', icon: '📱', color: '#ec4899',
    label: 'Telegram & Social Monitor',
    desc: 'Open-source Telegram channels · social signals · ground reports',
    queryMod: (loc) => `${loc} telegram channel social media report update`,
    timespan: '1d',
  },
  {
    id: 'movement', icon: '🚛', color: '#ef4444',
    label: 'Movement Tracker',
    desc: 'Vehicle/troop movements · convoys · supply routes · border crossings',
    queryMod: (loc) => `${loc} convoy troops vehicle movement border crossing`,
    timespan: '3d',
  },
  {
    id: 'pattern', icon: '📊', color: '#10b981',
    label: 'Historical Pattern Analyst',
    desc: 'Temporal escalation patterns · seasonal cycles · repeat locations',
    queryMod: (loc) => `${loc} conflict escalation pattern history repeated`,
    timespan: '30d',
  },
];

async function runLocalAgents(location, hfToken) {
  // Fetch GDELT news for each agent in parallel (no LLM per-agent to stay within Vercel timeout)
  const fetchAgent = async (agent) => {
    const q   = agent.queryMod(location);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}+sourcelang:eng&mode=artlist&maxrecords=8&format=json&timespan=${agent.timespan}&sort=DateDesc`;
    try {
      const resp     = await axios.get(url, { timeout: 8000 });
      const articles = (resp.data?.articles || []).map(a => ({ title: a.title, url: a.url, source: a.domain }));
      const titles   = articles.map(a => a.title).filter(Boolean);
      const risk     = scoreHeadlines(titles, location);
      return {
        id:       agent.id,
        label:    agent.label,
        icon:     agent.icon,
        color:    agent.color,
        desc:     agent.desc,
        status:   'done',
        articles: articles.slice(0, 5),
        risk:     risk.level,
        score:    risk.score,
        brief:    titles.length > 0
          ? `${titles.length} reports detected. Risk: ${risk.level}. Top signal: "${titles[0]?.slice(0, 90)}"`
          : `No recent signals in ${agent.timespan} window for this query.`,
      };
    } catch (e) {
      return {
        id: agent.id, label: agent.label, icon: agent.icon, color: agent.color,
        desc: agent.desc, status: 'error', articles: [], risk: 'LOW', score: 0,
        brief: `Data fetch error: ${e.message.slice(0, 60)}`,
      };
    }
  };

  // Run agents sequentially with delay to avoid GDELT rate limits (429)
  const results = [];
  for (const agent of LOCAL_AGENTS) {
    results.push(await fetchAgent(agent));
    await sleep(800);
  }

  // If HF token available, generate a master synthesis brief
  let synthesis = null;
  if (hfToken) {
    const agentBriefs = results.map(r => `[${r.label}] ${r.brief}`).join('\n');
    try {
      const resp = await axios.post(
        'https://router.huggingface.co/v1/chat/completions',
        {
          model: 'meta-llama/Llama-3.1-8B-Instruct:fastest',
          messages: [
            { role: 'system', content: `You are a senior intelligence analyst. Synthesize multi-source local intelligence reports into a concise 3-sentence combined brief. Focus on: what is happening, where specifically, and what is the dominant threat vector. Be factual, cite only what agents reported.` },
            { role: 'user',   content: `Location: ${location}\n\nAgent reports:\n${agentBriefs}` }
          ],
          max_tokens: 180,
          temperature: 0.2,
        },
        { headers: { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      synthesis = resp.data.choices[0].message.content.trim();
    } catch (e) {
      // silently skip synthesis on LLM error
    }
  }

  return { agents: results, synthesis };
}

/* ── Main handler ────────────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, location, timespan } = (req.method === 'POST' ? req.body : req.query) || {};

  if (!location || !location.trim()) {
    return res.status(400).json({ error: 'location parameter required' });
  }

  const loc = location.trim();
  const hfToken = process.env.HF_DECISION_TOKEN || process.env.HF_TOKEN;

  try {
    /* ── Action: search — boundary + news + prediction ──────────────────── */
    if (!action || action === 'search') {
      // Fetch boundary and news in parallel
      const [boundary, articles] = await Promise.all([
        fetchBoundary(loc),
        fetchLocalNews(loc, timespan || '7d'),
      ]);

      const titles = articles.map(a => a.title).filter(Boolean);
      const riskInfo = scoreHeadlines(titles, loc);
      const movements = detectMovements(titles);

      // Try LLM prediction (best effort — fallback to rule-based on failure)
      let prediction = null;
      if (hfToken && titles.length >= 3) {
        prediction = await llmPredict(loc, titles, hfToken);
      }

      // Rule-based fallback
      if (!prediction) {
        const prob = 0.2 + riskInfo.score * 0.7;
        const dir_kws = { North:['north','northern'], South:['south','southern'], East:['east','eastern'], West:['west','western'] };
        const combined = titles.join(' ').toLowerCase();
        let dir = 'Undetermined';
        for (const [d, kws] of Object.entries(dir_kws)) { if (kws.some(k => combined.includes(k))) { dir = d; break; } }
        prediction = {
          activity_probability: Math.round(prob * 100) / 100,
          risk_level: riskInfo.level,
          confidence: Math.round((0.3 + riskInfo.score * 0.5) * 100) / 100,
          predicted_direction: dir,
          timeframe_minutes: riskInfo.level === 'CRITICAL' ? 30 : riskInfo.level === 'HIGH' ? 45 : 90,
          hotspot_areas: ['Primary activity zone', 'Border crossing point'],
          reasoning: `Based on ${titles.length} recent headlines for ${loc}. Rule-based fallback (LLM unavailable).`,
          movement_types: movements,
        };
      }

      prediction.location = loc;
      prediction.articles_analyzed = titles.length;
      prediction.intelligence_level = Math.min(100, 10 + titles.length * 2 + (riskInfo.level === 'CRITICAL' ? 15 : 0));
      prediction.timestamp = new Date().toISOString();
      prediction.source = hfToken && titles.length >= 3 ? 'llm' : 'rule-based';

      return res.json({
        location: loc,
        boundary,
        articles: articles.slice(0, 20),
        prediction,
        movements: prediction.movement_types || movements,
      });
    }

    /* ── Action: agents — run all 7 local intel agents ─────────────────── */
    if (action === 'agents') {
      const agentResults = await runLocalAgents(loc, hfToken);
      return res.json({ location: loc, ...agentResults });
    }

    /* ── Action: news only ───────────────────────────────────────────────── */
    if (action === 'news') {
      const articles = await fetchLocalNews(loc, timespan || '7d');
      return res.json({ location: loc, articles });
    }

    /* ── Action: boundary only ──────────────────────────────────────────── */
    if (action === 'boundary') {
      const boundary = await fetchBoundary(loc);
      return res.json({ location: loc, boundary });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('[local-intel]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
