const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await axios.get(
      'https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.json',
      { timeout: 10000 }
    );
    const ips = (r.data || []).slice(0, 60).map(e => e.ip_address).filter(Boolean);
    if (!ips.length) return res.json({ threats: [] });

    const geoResp = await axios.post(
      'http://ip-api.com/batch?fields=status,lat,lon,country,isp,query',
      ips.map(q => ({ query: q })),
      { timeout: 10000 }
    );
    const threats = geoResp.data
      .filter(g => g.status === 'success' && g.lat && g.lon)
      .map(g => ({
        ip:      g.query,
        lat:     g.lat,
        lng:     g.lon,
        country: g.country,
        isp:     g.isp,
        type:    'C2 Server',
      }));
    res.json({ threats });
  } catch (e) {
    res.status(500).json({ error: e.message, threats: [] });
  }
};
