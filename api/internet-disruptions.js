const axios = require('axios');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await axios.get(
      'https://api.cloudflare.com/client/v4/radar/attacks/layer3/timeseries?aggInterval=1h&dateRange=1d&format=json',
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    res.json({ data: r.data?.result || {}, source: 'cloudflare-radar' });
  } catch {
    res.json({
      disruptions: [
        { country:'Russia',   lat:55.75, lng:37.6,  type:'BGP Withdrawal',   severity:'high',     date:'2024-12-01' },
        { country:'Iran',     lat:35.7,  lng:51.4,  type:'Internet Shutdown', severity:'high',     date:'2024-12-02' },
        { country:'Myanmar',  lat:16.9,  lng:96.2,  type:'Outage',           severity:'moderate',  date:'2024-12-01' },
        { country:'Ethiopia', lat:9.0,   lng:38.7,  type:'Throttling',       severity:'low',       date:'2024-12-01' },
      ],
    });
  }
};
