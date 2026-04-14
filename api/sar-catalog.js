// api/sar-catalog.js — Copernicus Data Space / SentinelHub SAR integration
// Handles: OAuth2 token, Sentinel-1 catalog search, SAR preview image generation
// Keeps ALL existing endpoints 100% intact — net-new file.

const axios = require('axios');

/* ── Constants ───────────────────────────────────────────────────────────── */
const TOKEN_URL   = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const CATALOG_URL = 'https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search';
const PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';

/* ── Token cache (warm instance reuse, 50-min TTL) ───────────────────────── */
let _tokenCache = { token: null, expires: 0 };

async function getToken(clientId, clientSecret) {
  if (_tokenCache.token && Date.now() < _tokenCache.expires) {
    return _tokenCache.token;
  }
  const resp = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    }
  );
  const token = resp.data.access_token;
  _tokenCache  = { token, expires: Date.now() + 50 * 60 * 1000 };
  return token;
}

/* ── SAR evalscript — false-colour composite (VV / VH) ───────────────────── */
const SAR_EVALSCRIPT = `
//VERSION=3
function setup() {
  return {
    input:  [{ bands: ["VV","VH"], units: "LINEAR_POWER" }],
    output: { bands: 3 }
  };
}
function evaluatePixel(s) {
  const vv = 10 * Math.log10(s.VV + 1e-10);
  const vh = 10 * Math.log10(s.VH + 1e-10);
  return [
    Math.max(0, Math.min(1, (vv + 25) / 30)),
    Math.max(0, Math.min(1, (vh + 32) / 35)),
    Math.max(0, Math.min(1, (vv - vh + 10) / 20))
  ];
}`.trim();

/* ── Helper: lat/lng + radius → bbox array [W,S,E,N] ───────────────────── */
function makeBbox(lat, lng, radius_km) {
  const R = (radius_km || 50) / 111;
  return [
    parseFloat(lng) - R,
    parseFloat(lat) - R,
    parseFloat(lng) + R,
    parseFloat(lat) + R,
  ].map(v => Math.round(v * 10000) / 10000);
}

/* ── Helper: clamp bbox so Process API preview stays reasonable (<0.8°) ── */
function clampBbox(bbox) {
  const [w, s, e, n] = bbox;
  const cx = (w + e) / 2, cy = (s + n) / 2, half = 0.4;
  return [cx - half, cy - half, cx + half, cy + half];
}

/* ── Helper: parse timespan string → ISO date range ─────────────────────── */
function timespanToDates(ts) {
  const now   = new Date();
  const days  = { '1d':1, '3d':3, '7d':7, '14d':14, '30d':30, '90d':90 }[ts] || 30;
  const from  = new Date(now - days * 86400000).toISOString().slice(0, 19) + 'Z';
  const to    = now.toISOString().slice(0, 19) + 'Z';
  return { from, to };
}

/* ── Main handler ────────────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const body = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  const { action } = body;

  const clientId     = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'CDSE_CLIENT_ID / CDSE_CLIENT_SECRET not configured in environment variables.' });
  }

  try {
    const token = await getToken(clientId, clientSecret);

    /* ══ action: search ═══════════════════════════════════════════════════ */
    if (!action || action === 'search') {
      const {
        lat, lng,
        radius_km  = 50,
        timespan   = '30d',
        startDate, endDate,
        collection = 'sentinel-1-grd',
        polarization,
        limit      = 10,
      } = body;

      if (!lat || !lng) {
        return res.status(400).json({ error: 'lat and lng are required for SAR search' });
      }

      const bbox = makeBbox(lat, lng, radius_km);
      const { from, to } = (startDate && endDate)
        ? { from: new Date(startDate).toISOString().slice(0,19)+'Z', to: new Date(endDate).toISOString().slice(0,19)+'Z' }
        : timespanToDates(timespan);

      const searchBody = {
        bbox,
        datetime:    `${from}/${to}`,
        collections: [collection],
        limit:       Math.min(parseInt(limit) || 10, 20),
      };

      // Polarization CQL2 filter (only if a specific one is requested)
      if (polarization && polarization !== 'ALL') {
        searchBody.filter      = { op: 'like', args: [{ property: 's1:polarization' }, `%${polarization}%`] };
        searchBody['filter-lang'] = 'cql2-json';
      }

      const catResp = await axios.post(CATALOG_URL, searchBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        timeout: 30000,
      });

      const features = catResp.data?.features || [];
      const scenes = features.map(f => {
        const p  = f.properties || {};
        const dt = new Date(p.datetime || 0);
        // Extract thumbnail/quicklook from STAC assets — these are always available
        const assets = f.assets || {};
        const thumbnailUrl =
          assets.thumbnail?.href ||
          assets.overview?.href  ||
          assets.quicklook?.href ||
          assets.preview?.href   ||
          null;
        return {
          id:           f.id,
          geometry:     f.geometry,
          date:         p.datetime,
          date_label:   dt.toUTCString().slice(0, 25),
          platform:     (p.platform || p.constellation || 'Sentinel-1').toUpperCase(),
          orbit:        (p['sat:orbit_state'] || p['s1:orbit_direction'] || 'UNKNOWN').toUpperCase(),
          polarization: p['s1:polarization'] || 'VV VH',
          mode:         p['s1:instrument_mode'] || 'IW',
          resolution:   p['s1:resolution'] || 'HIGH',
          orbit_number: p['sat:absolute_orbit'] || p['s1:absolute_orbit'] || 0,
          // date range for preview generation: ±12h around acquisition
          preview_from: new Date(dt - 12*3600*1000).toISOString().slice(0,19)+'Z',
          preview_to:   new Date(dt + 12*3600*1000).toISOString().slice(0,19)+'Z',
          bbox,
          thumbnail_url:  thumbnailUrl,
          copernicus_url: `https://browser.dataspace.copernicus.eu/?zoom=10&lat=${parseFloat(lat).toFixed(4)}&lng=${parseFloat(lng).toFixed(4)}&themeId=SAR`,
        };
      });

      return res.json({
        location:   body.location || `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`,
        bbox,
        collection,
        datetime:   `${from.slice(0,10)} → ${to.slice(0,10)}`,
        total:      catResp.data?.numberMatched || scenes.length,
        scenes,
      });
    }

    /* ══ action: preview ══════════════════════════════════════════════════ */
    if (action === 'preview') {
      const {
        bbox,
        from_date, to_date,
        collection   = 'sentinel-1-grd',
        orbit,
        polarization = 'DV',
      } = body;

      if (!bbox || !from_date || !to_date) {
        return res.status(400).json({ error: 'bbox, from_date, to_date required for preview' });
      }

      const bboxArr     = Array.isArray(bbox) ? bbox : JSON.parse(bbox);
      const clampedBbox = clampBbox(bboxArr);

      const dataFilter = {
        timeRange: {
          from: new Date(from_date).toISOString().slice(0,19) + 'Z',
          to:   new Date(to_date).toISOString().slice(0,19) + 'Z',
        },
        acquisitionMode: 'IW',
        polarization:    polarization || 'DV',
      };
      if (orbit && orbit !== 'UNKNOWN') {
        dataFilter.orbitDirection = orbit.toUpperCase();
      }

      const processBody = {
        input: {
          bounds: {
            bbox:       clampedBbox,
            properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' },
          },
          data: [{ type: collection, dataFilter }],
        },
        output: {
          width:  320,
          height: 320,
          responses: [{ identifier: 'default', format: { type: 'image/jpeg' } }],
        },
        evalscript: SAR_EVALSCRIPT,
      };

      const procResp = await axios.post(PROCESS_URL, processBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'Accept':        'image/jpeg',
        },
        responseType: 'arraybuffer',
        timeout:      45000,
      });

      res.setHeader('Content-Type',  'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(procResp.data));
    }

    /* ══ action: thumbnail — proxy authenticated thumbnail from STAC assets ═ */
    if (action === 'thumbnail') {
      const { url: thumbUrl } = body;
      if (!thumbUrl) return res.status(400).json({ error: 'url required' });
      const thumbResp = await axios.get(thumbUrl, {
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 20000,
      });
      const ct = thumbResp.headers['content-type'] || 'image/jpeg';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(thumbResp.data));
    }

    /* ══ action: status ═══════════════════════════════════════════════════ */
    if (action === 'status') {
      return res.json({
        authenticated: true,
        service:       'Copernicus Data Space Ecosystem (SentinelHub)',
        collections:   ['sentinel-1-grd', 'sentinel-1-slc'],
        catalog_url:   CATALOG_URL,
        process_url:   PROCESS_URL,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}. Use: search | preview | status` });

  } catch (err) {
    const raw     = err.response?.data;
    const details = raw instanceof Buffer
      ? raw.toString('utf8').slice(0, 300)
      : (typeof raw === 'object' ? JSON.stringify(raw).slice(0, 300) : String(raw || err.message).slice(0, 300));
    console.error('[sar-catalog]', err.message, details);
    return res.status(500).json({ error: err.message, details });
  }
};
