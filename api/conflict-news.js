const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query?.q || 'airstrike missile bombing conflict war explosion drone attack';
  const timespan = req.query?.timespan || '3d';

  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}+sourcelang:eng&mode=artlist&maxrecords=30&format=json&timespan=${timespan}&sort=DateDesc`;
    const resp = await axios.get(url, { timeout: 12000 });
    const articles = (resp.data?.articles || []).map(a => ({
      title:  a.title,
      url:    a.url,
      source: a.domain,
      date:   a.seendate,
      image:  a.socialimage || null,
    }));
    res.json({ articles });
  } catch (err) {
    console.error('GDELT conflict-news error:', err.message);
    res.status(500).json({ error: err.message, articles: [] });
  }
};
