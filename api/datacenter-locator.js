/**
 * SENTINEL PLATFORM — Data Center Locator API
 *
 * Aggregates OSINT from public sources — no API keys required:
 *   • BGPView          → ASN discovery, IP prefix ranges
 *   • PeeringDB        → physical facility lat/lng
 *   • RIPE Stat        → WHOIS / ASN meta (EU/Asia)
 *   • ARIN RDAP        → WHOIS (Americas / ARIN region)
 *   • crt.sh           → Certificate Transparency subdomain harvest
 *   • Overpass API     → OSM data-center buildings near known coords
 *
 * GET /api/datacenter-locator?query=<name|domain|ASN>
 */

const https = require('https');
const http  = require('http');

/* ── tiny fetch wrapper with timeout ─────────────────────────────────────── */
function fetch(url, { timeout = 12000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'SentinelPlatform/1.0 OSINT', ...headers } }, res => {
      let raw = '';
      res.on('data', d => { raw += d; if (raw.length > 2_000_000) req.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function tryJSON(url, opts) {
  try {
    const r = await fetch(url, opts);
    if (r.status === 200) return JSON.parse(r.body);
  } catch (_) {}
  return null;
}

/* ── 1. Resolve query → ASN list ─────────────────────────────────────────── */
async function resolveASNs(query) {
  const results = [];

  // If already an ASN number
  if (/^(AS)?\d+$/i.test(query.trim())) {
    const num = query.replace(/^AS/i, '').trim();
    results.push({ asn: parseInt(num), name: `AS${num}`, source: 'direct' });
    return results;
  }

  // BGPView search by name/domain
  const enc = encodeURIComponent(query);
  const bgp = await tryJSON(`https://api.bgpview.io/search?query_term=${enc}`, { timeout: 10000 });
  if (bgp?.data?.asns) {
    for (const a of bgp.data.asns.slice(0, 6)) {
      results.push({ asn: a.asn, name: a.name, description: a.description_short, source: 'bgpview' });
    }
  }

  // RIPE stat search (good for EU / gov entities)
  if (results.length < 3) {
    const ripe = await tryJSON(
      `https://stat.ripe.net/data/searchindex/data.json?resource=${enc}&limit=5`,
      { timeout: 10000 }
    );
    if (ripe?.data?.results?.aut_nums) {
      for (const a of ripe.data.results.aut_nums.slice(0, 4)) {
        if (!results.find(r => r.asn === parseInt(a.key))) {
          results.push({ asn: parseInt(a.key), name: a.value, source: 'ripe' });
        }
      }
    }
  }

  return results;
}

/* ── 2. Get IP prefixes for an ASN ──────────────────────────────────────── */
async function getASNPrefixes(asn) {
  const d = await tryJSON(`https://api.bgpview.io/asn/${asn}/prefixes`, { timeout: 12000 });
  const prefixes = [];
  if (d?.data) {
    for (const p of (d.data.ipv4_prefixes || []).slice(0, 20)) {
      prefixes.push({ prefix: p.prefix, name: p.name, description: p.description });
    }
  }
  return prefixes;
}

/* ── 3. PeeringDB facility lookup ────────────────────────────────────────── */
async function getPeeringDBFacilities(asn) {
  const facilities = [];

  // Get net record
  const net = await tryJSON(`https://www.peeringdb.com/api/net?asn=${asn}`, { timeout: 12000 });
  const netId = net?.data?.[0]?.id;
  if (!netId) return facilities;

  // Get facility cross-references
  const netfac = await tryJSON(`https://www.peeringdb.com/api/netfac?net_id=${netId}&depth=2`, { timeout: 12000 });
  if (!netfac?.data) return facilities;

  for (const nf of netfac.data.slice(0, 12)) {
    const facId = nf.fac_id;
    const fac = await tryJSON(`https://www.peeringdb.com/api/fac/${facId}`, { timeout: 10000 });
    if (fac?.data) {
      const f = fac.data;
      if (f.latitude && f.longitude) {
        facilities.push({
          source: 'peeringdb',
          type: 'data_center',
          name: f.name,
          address: f.address1,
          city: f.city,
          country: f.country,
          lat: parseFloat(f.latitude),
          lng: parseFloat(f.longitude),
          clli: f.clli || null,
          website: f.website || null,
          asn,
        });
      }
    }
  }

  return facilities;
}

/* ── 4. ASN WHOIS meta (RIPE + ARIN) ─────────────────────────────────────── */
async function getASNMeta(asn) {
  // ARIN RDAP
  const arin = await tryJSON(`https://rdap.arin.net/registry/autnum/${asn}`, { timeout: 8000 });
  if (arin?.name) {
    return {
      name: arin.name,
      handle: arin.handle,
      country: arin.country || null,
      org: arin.entities?.[0]?.vcardArray?.[1]?.find(v => v[0] === 'org')?.[3] || null,
      source: 'arin-rdap',
    };
  }

  // RIPE fallback
  const ripe = await tryJSON(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`, { timeout: 8000 });
  if (ripe?.data) {
    return {
      name: ripe.data.holder || `AS${asn}`,
      country: null,
      source: 'ripe-stat',
    };
  }

  return { name: `AS${asn}`, source: 'unknown' };
}

/* ── 5. Certificate Transparency harvest ─────────────────────────────────── */
async function getCTSubdomains(domain) {
  if (!domain) return [];

  const clean = domain.replace(/^www\./i, '').toLowerCase();
  const crt = await tryJSON(
    `https://crt.sh/?q=%.${encodeURIComponent(clean)}&output=json`,
    { timeout: 15000 }
  );
  if (!Array.isArray(crt)) return [];

  const seen = new Set();
  const names = [];
  for (const cert of crt.slice(0, 300)) {
    for (const n of (cert.name_value || '').split('\n')) {
      const h = n.trim().toLowerCase().replace(/^\*\./, '');
      if (h && !seen.has(h) && h.endsWith(clean)) {
        seen.add(h);
        names.push({ subdomain: h, issuer: cert.issuer_name?.match(/O=([^,]+)/)?.[1] || '', notBefore: cert.not_before });
      }
    }
  }
  return names.slice(0, 80);
}

/* ── 6. Overpass OSM data-center buildings ───────────────────────────────── */
async function getOSMDataCenters(lat, lng, radiusKm = 200) {
  const r = radiusKm * 1000;
  const query = `
[out:json][timeout:20];
(
  node["building"="data_center"](around:${r},${lat},${lng});
  way["building"="data_center"](around:${r},${lat},${lng});
  node["industrial"="data_centre"](around:${r},${lat},${lng});
  way["industrial"="data_centre"](around:${r},${lat},${lng});
  node["telecom"="data_center"](around:${r},${lat},${lng});
  way["telecom"="data_center"](around:${r},${lat},${lng});
);
out center tags;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      timeout: 25000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    // POST manually
    return await new Promise((resolve, reject) => {
      const body = `data=${encodeURIComponent(query)}`;
      const opts = {
        hostname: 'overpass-api.de',
        path: '/api/interpreter',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'SentinelPlatform/1.0',
        },
      };
      const req = https.request(opts, res => {
        let raw = '';
        res.on('data', d => { raw += d; });
        res.on('end', () => {
          try {
            const d = JSON.parse(raw);
            const buildings = (d.elements || []).map(el => ({
              source: 'osm',
              type: 'data_center',
              name: el.tags?.name || el.tags?.operator || 'Unknown DC',
              lat: el.lat ?? el.center?.lat,
              lng: el.lon ?? el.center?.lon,
              operator: el.tags?.operator || null,
              address: [el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', ') || null,
              osm_id: el.id,
            })).filter(b => b.lat && b.lng);
            resolve(buildings.slice(0, 30));
          } catch (_) { resolve([]); }
        });
      });
      req.setTimeout(25000, () => req.destroy());
      req.on('error', () => resolve([]));
      req.write(body);
      req.end();
    });
  } catch (_) {
    return [];
  }
}

/* ── 7. IP → geolocation via ipinfo.io (free, no key for basic) ─────────── */
async function geolocatePrefix(prefix) {
  const ip = prefix.split('/')[0];
  const d = await tryJSON(`https://ipinfo.io/${ip}/json`, { timeout: 6000 });
  if (!d?.loc) return null;
  const [lat, lng] = d.loc.split(',').map(Number);
  return { ip, lat, lng, city: d.city, region: d.region, country: d.country, org: d.org };
}

/* ── Main handler ─────────────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const query = (req.query.query || '').trim();
  const domain = (req.query.domain || '').trim();
  const asnParam = (req.query.asn || '').trim();

  const searchTerm = asnParam || domain || query;
  if (!searchTerm) {
    return res.status(400).json({ error: 'Provide ?query=<name|domain|ASN>' });
  }

  try {
    const t0 = Date.now();

    // 1. Resolve ASNs
    const asns = await resolveASNs(searchTerm);
    if (!asns.length) {
      return res.status(200).json({
        query: searchTerm, asns: [], facilities: [], prefixes: [],
        subdomains: [], osm_buildings: [], geolocated_ips: [],
        message: 'No ASNs found for this entity',
      });
    }

    // 2. Parallel: prefixes + PeeringDB facilities for each ASN, ASN meta
    const [prefixSets, facilitySets, metaSets] = await Promise.all([
      Promise.all(asns.slice(0, 4).map(a => getASNPrefixes(a.asn))),
      Promise.all(asns.slice(0, 4).map(a => getPeeringDBFacilities(a.asn))),
      Promise.all(asns.slice(0, 4).map(a => getASNMeta(a.asn))),
    ]);

    const prefixes = prefixSets.flat().slice(0, 40);
    const facilities = facilitySets.flat();

    // Enrich ASNs with meta
    asns.forEach((a, i) => { if (metaSets[i]) Object.assign(a, metaSets[i]); });

    // 3. CT subdomain harvest (from domain if provided, else try to infer)
    const inferredDomain = domain || (query.includes('.') ? query : null);
    const subdomains = inferredDomain ? await getCTSubdomains(inferredDomain) : [];

    // 4. OSM buildings near known facility coordinates (take first 2 known lat/lng)
    const knownCoords = facilities.filter(f => f.lat && f.lng).slice(0, 2);
    const osmSets = await Promise.all(
      knownCoords.map(c => getOSMDataCenters(c.lat, c.lng, 150))
    );
    const osm_buildings = osmSets.flat().filter((b, i, arr) =>
      arr.findIndex(x => x.osm_id === b.osm_id) === i
    );

    // 5. Geolocate a sample of IP prefixes (up to 8)
    const geoSample = prefixes.slice(0, 8);
    const geoRaw = await Promise.all(geoSample.map(p => geolocatePrefix(p.prefix)));
    const geolocated_ips = geoRaw.filter(Boolean).filter((g, i, arr) =>
      arr.findIndex(x => x.ip === g.ip) === i
    );

    // 6. Merge all located points into a unified `locations` array for map rendering
    const locations = [
      ...facilities.map(f => ({ ...f, confidence: 'high' })),
      ...osm_buildings.map(b => ({ ...b, confidence: 'medium' })),
      ...geolocated_ips.map(g => ({
        source: 'geoip', type: 'ip_block', name: g.org || g.ip,
        lat: g.lat, lng: g.lng, city: g.city, country: g.country,
        confidence: 'low',
      })),
    ].filter(l => l.lat && l.lng);

    return res.status(200).json({
      query: searchTerm,
      elapsed_ms: Date.now() - t0,
      asns,
      prefixes,
      subdomains,
      facilities,
      osm_buildings,
      geolocated_ips,
      locations,   // unified list for map plotting
      summary: {
        asn_count: asns.length,
        facility_count: facilities.length,
        prefix_count: prefixes.length,
        subdomain_count: subdomains.length,
        location_count: locations.length,
      },
    });

  } catch (err) {
    console.error('[datacenter-locator]', err);
    return res.status(500).json({ error: err.message });
  }
};
