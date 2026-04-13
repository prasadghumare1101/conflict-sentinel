/**
 * predict-conflict.js
 * Pure Node.js replacement for the Python/CrewAI agentic_engine.
 * Uses GDELT for live news + HuggingFace LLM for multi-step conflict prediction.
 */
const axios = require('axios');

const HF_MODEL = 'moonshotai/Kimi-K2.5:novita';

async function callHF(token, systemPrompt, userPrompt, maxTokens = 1024) {
  const response = await axios.post(
    'https://router.huggingface.co/v1/chat/completions',
    {
      model: HF_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 50000,
    }
  );
  return response.data.choices[0].message.content;
}

function parseJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    // find first { ... }
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(clean.slice(start, end + 1));
  } catch {}
  return null;
}

async function fetchGDELTNews(query) {
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query + ' conflict war')}&sourcelang=eng&mode=artlist&maxrecords=15&format=json&timespan=7d&sort=DateDesc`;
    const r = await axios.get(url, { timeout: 8000 });
    return (r.data?.articles || []).map(a => a.title).filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.body?.query || 'current geopolitical tensions';
  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: 'HF_TOKEN not configured.' });

  try {
    // Step 1 — Gather live news context via GDELT
    const headlines = await fetchGDELTNews(query);
    const newsContext = headlines.length
      ? `LIVE NEWS (last 7 days):\n${headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
      : 'No live news available — use general geopolitical knowledge.';

    // Step 2 — Research + predict conflict zone
    const analysisRaw = await callHF(
      token,
      `You are a senior OSINT analyst and conflict prediction specialist. Analyze the input and live news to identify the single most likely active or emerging conflict zone right now. Respond ONLY with a JSON object — no markdown fences.
Schema:
{
  "location_name": "string",
  "coordinates": { "lat": number, "lng": number },
  "radius_km": number,
  "conflict_probability": number,
  "reasoning": "string",
  "strategic_value": "string",
  "news_summary": "string",
  "news_sources": ["url1","url2"],
  "deception_score": number,
  "tactical_vulnerabilities": ["string"]
}
Rules: conflict_probability is 0-1. deception_score is 0-1 (likelihood of info manipulation). radius_km is the conflict zone radius. Be specific with coordinates.`,
      `Query: ${query}\n\n${newsContext}`,
      1200
    );

    const prediction = parseJSON(analysisRaw);
    if (!prediction) {
      return res.status(500).json({ error: 'Could not parse prediction JSON', raw: analysisRaw.slice(0, 300) });
    }

    // Step 3 — Red team critique
    const redTeamRaw = await callHF(
      token,
      `You are the Artemis Red Team Supervisor. Critically evaluate the conflict prediction and identify flaws, deception, or alternative interpretations. Be concise (2-3 sentences). Respond with plain text only.`,
      `Conflict prediction: ${JSON.stringify(prediction)}\n\nQuery: ${query}`,
      300
    );

    res.json({
      ...prediction,
      red_team_critique: redTeamRaw?.trim() || 'No critique available.',
      _timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('predict-conflict error:', error.message);
    // Fallback mock so the UI does not hard-crash
    res.json({
      location_name: 'Ukraine-Russia Frontline (Fallback)',
      coordinates:   { lat: 48.3794, lng: 38.0297 },
      radius_km: 60,
      conflict_probability: 0.9,
      reasoning: `API error: ${error.message}. Displaying fallback data.`,
      strategic_value: 'Eastern Donbas industrial corridor.',
      news_sources: [],
      news_summary: `Prediction service encountered an error: ${error.message}`,
      red_team_critique: 'Fallback mode — no real analysis.',
      deception_score: 0.5,
      tactical_vulnerabilities: ['API error', 'HuggingFace latency'],
      _timestamp: new Date().toISOString(),
    });
  }
};
