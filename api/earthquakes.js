const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await axios.get(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson',
      { timeout: 10000 }
    );
    const events = (r.data.features || []).map(f => ({
      id:      f.id,
      lat:     f.geometry.coordinates[1],
      lng:     f.geometry.coordinates[0],
      depth:   f.geometry.coordinates[2],
      mag:     f.properties.mag,
      place:   f.properties.place,
      time:    new Date(f.properties.time).toISOString(),
      url:     f.properties.url,
      tsunami: f.properties.tsunami,
    }));
    res.json({ events });
  } catch (e) {
    res.status(500).json({ error: e.message, events: [] });
  }
};
