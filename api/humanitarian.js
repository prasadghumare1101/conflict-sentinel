module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const crises = [
    { country:'Sudan',       displaced:8500000, refugees:2100000, lat:15.5,  lng:32.5,  severity:'critical' },
    { country:'Ukraine',     displaced:5800000, refugees:6500000, lat:49.0,  lng:32.0,  severity:'critical' },
    { country:'Palestine',   displaced:1800000, refugees:5900000, lat:31.5,  lng:34.5,  severity:'critical' },
    { country:'Syria',       displaced:7200000, refugees:5500000, lat:35.0,  lng:38.0,  severity:'high'     },
    { country:'Myanmar',     displaced:2100000, refugees:1200000, lat:19.7,  lng:96.1,  severity:'high'     },
    { country:'Ethiopia',    displaced:4200000, refugees:910000,  lat:9.1,   lng:40.5,  severity:'high'     },
    { country:'Afghanistan', displaced:4400000, refugees:5700000, lat:33.9,  lng:67.7,  severity:'high'     },
    { country:'Somalia',     displaced:3800000, refugees:940000,  lat:5.1,   lng:46.2,  severity:'high'     },
    { country:'DRC',         displaced:6900000, refugees:1000000, lat:-4.0,  lng:21.8,  severity:'high'     },
    { country:'Yemen',       displaced:4500000, refugees:89000,   lat:15.5,  lng:48.5,  severity:'critical' },
    { country:'Venezuela',   displaced:300000,  refugees:7700000, lat:6.4,   lng:-66.6, severity:'moderate' },
    { country:'Mali',        displaced:375000,  refugees:270000,  lat:17.6,  lng:-3.9,  severity:'moderate' },
    { country:'Nigeria',     displaced:3100000, refugees:88000,   lat:9.1,   lng:8.7,   severity:'high'     },
    { country:'Lebanon',     displaced:780000,  refugees:1500000, lat:33.9,  lng:35.5,  severity:'high'     },
    { country:'Haiti',       displaced:703000,  refugees:34000,   lat:18.9,  lng:-72.3, severity:'high'     },
  ];
  res.json({ crises });
};
