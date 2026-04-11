const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await axios.get(
      'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80&days=30',
      { timeout: 10000 }
    );
    const events = (r.data.events || []).map(e => {
      const geo = e.geometry?.[0];
      if (!geo) return null;
      const coords = geo.type === 'Point' ? geo.coordinates : geo.coordinates?.[0];
      if (!coords) return null;
      return {
        id:         e.id,
        title:      e.title,
        category:   e.categories?.[0]?.title  || 'Unknown',
        categoryId: e.categories?.[0]?.id     || '',
        lat:  Array.isArray(coords[0]) ? coords[0][1] : coords[1],
        lng:  Array.isArray(coords[0]) ? coords[0][0] : coords[0],
        date:   geo.date,
        source: e.sources?.[0]?.url || '',
      };
    }).filter(Boolean);
    res.json({ events });
  } catch (e) {
    res.status(500).json({ error: e.message, events: [] });
  }
};
