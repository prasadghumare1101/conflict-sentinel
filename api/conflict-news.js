const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query?.q || 'airstrike missile bombing conflict war explosion drone attack india pakistan';
  const timespan = req.query?.timespan || '3d';

  // Try up to 3 different GDELT query variations on 429
  const queries = [
    q,
    'conflict war airstrike missile india ceasefire diplomacy',
    'war battle explosion drone attack india pakistan ukraine',
  ];

  for (const query of queries) {
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}+sourcelang:eng&mode=artlist&maxrecords=30&format=json&timespan=${timespan}&sort=DateDesc`;
      const resp = await axios.get(url, { timeout: 6000 });
      if (resp.status === 429) continue;
      const articles = (resp.data?.articles || []).map(a => ({
        title:  a.title,
        url:    a.url,
        source: a.domain,
        date:   a.seendate,
        image:  a.socialimage || null,
      }));
      return res.json({ articles });
    } catch (err) {
      // On any error (timeout, 5xx, network), try next query variation
      continue;
    }
  }

  // All attempts rate-limited — return empty with message
  res.json({ articles: [], error: 'GDELT rate limited, try again in a few seconds.' });
};
