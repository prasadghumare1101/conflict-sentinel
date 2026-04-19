/**
 * SENTINEL PLATFORM — Data Center Locator API  (v2)
 *
 * Public sources (no API key, all tested reachable):
 *   • ipinfo.io          → IP → ASN + lat/lng (free tier)
 *   • PeeringDB          → org/net name search + facility lat/lng
 *   • RIPE Stat          → ASN meta + announced prefixes
 *   • ARIN RDAP          → ASN WHOIS (Americas)
 *   • crt.sh             → Certificate Transparency subdomain harvest
 *   • Overpass API       → OSM data-center buildings
 *   • DNS lookup (Node)  → domain → IP → ASN via ipinfo
 *
 * GET /api/datacenter-locator?query=<name|domain|ASN>
 */

const https  = require('https');
const http   = require('http');
const dns    = require('dns').promises;

/* ── tiny fetch helper ───────────────────────────────────────────────────── */
function fetchJSON(url, { timeout = 14000 } = {}) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'SentinelPlatform/2.0-OSINT', 'Accept': 'application/json' },
    }, res => {
      let raw = '';
      res.on('data', d => { raw += d; if (raw.length > 1_500_000) req.destroy(); });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

/* POST helper for Overpass */
function overpassPost(query, timeout = 28000) {
  return new Promise(resolve => {
    const body = `data=${encodeURIComponent(query)}`;
    const req = https.request({
      hostname: 'overpass-api.de', path: '/api/interpreter', method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'SentinelPlatform/2.0-OSINT',
      },
    }, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

/* ── 1.  Domain → IP → ASN via ipinfo ───────────────────────────────────── */
async function resolveAsnFromDomain(domain) {
  try {
    const { address } = await dns.lookup(domain.replace(/^www\./i, ''));
    const info = await fetchJSON(`https://ipinfo.io/${address}/json`);
    if (info?.org) {
      const m = info.org.match(/^AS(\d+)\s+(.*)/);
      if (m) {
        return {
          asn: parseInt(m[1]), name: m[2], ip: address,
          city: info.city, country: info.country, source: 'ipinfo-domain',
        };
      }
    }
  } catch (_) {}
  return null;
}

/* ── 2.  PeeringDB org/net name search ───────────────────────────────────── */
async function peeringdbNameSearch(name) {
  const enc = encodeURIComponent(name);
  const results = [];

  // Search organisations
  const orgs = await fetchJSON(`https://www.peeringdb.com/api/org?name__contains=${enc}&limit=4`);
  if (orgs?.data?.length) {
    for (const org of orgs.data.slice(0, 3)) {
      const nets = await fetchJSON(`https://www.peeringdb.com/api/net?org_id=${org.id}&limit=5`);
      if (nets?.data) {
        for (const net of nets.data.slice(0, 3)) {
          if (!results.find(r => r.asn === net.asn)) {
            results.push({ asn: net.asn, name: net.name, org: org.name, source: 'peeringdb-org' });
          }
        }
      }
    }
  }

  // Search net records directly
  if (results.length < 3) {
    const nets = await fetchJSON(`https://www.peeringdb.com/api/net?name__contains=${enc}&limit=6`);
    if (nets?.data) {
      for (const net of nets.data.slice(0, 5)) {
        if (!results.find(r => r.asn === net.asn)) {
          results.push({ asn: net.asn, name: net.name, source: 'peeringdb-net' });
        }
      }
    }
  }

  return results;
}

/* ── 3.  ASN WHOIS meta ──────────────────────────────────────────────────── */
async function getAsnMeta(asn) {
  // RIPE stat (fastest)
  const ripe = await fetchJSON(
    `https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`, { timeout: 8000 }
  );
  if (ripe?.data?.holder) {
    return { name: ripe.data.holder, type: ripe.data.type, source: 'ripe-stat' };
  }
  // ARIN RDAP
  const arin = await fetchJSON(`https://rdap.arin.net/registry/autnum/${asn}`, { timeout: 8000 });
  if (arin?.name) {
    return { name: arin.name, handle: arin.handle, source: 'arin-rdap' };
  }
  return { name: `AS${asn}`, source: 'unknown' };
}

/* ── 4.  Master ASN resolver ─────────────────────────────────────────────── */
async function resolveAsns(query) {
  query = query.trim();

  // Direct ASN (e.g. "15169" or "AS15169")
  const asnMatch = query.match(/^(?:AS)?(\d+)$/i);
  if (asnMatch) {
    const asn = parseInt(asnMatch[1]);
    const meta = await getAsnMeta(asn);
    return [{ asn, ...meta, source: 'direct' }];
  }

  const results = [];

  // Domain input (contains dot, no space)
  const isDomain = query.includes('.') && !query.includes(' ');
  if (isDomain) {
    const a = await resolveAsnFromDomain(query);
    if (a) results.push(a);
  }

  // PeeringDB name search (works for both company names and domains)
  const pdb = await peeringdbNameSearch(query);
  for (const a of pdb) {
    if (!results.find(r => r.asn === a.asn)) results.push(a);
  }

  // Enrich with RIPE/ARIN meta for any ASN found via ipinfo that has no name
  for (const r of results) {
    if (!r.name || r.name === `AS${r.asn}`) {
      const meta = await getAsnMeta(r.asn);
      Object.assign(r, meta);
    }
  }

  return results.slice(0, 6);
}

/* ── 5.  IP prefixes via RIPE stat ──────────────────────────────────────── */
async function getAsnPrefixes(asn) {
  const d = await fetchJSON(
    `https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${asn}`, { timeout: 15000 }
  );
  if (!d?.data?.prefixes) return [];
  return d.data.prefixes.slice(0, 30).map(p => ({
    prefix: p.prefix, asn, source: 'ripe-stat',
    timelines: p.timelines?.length || 0,
  }));
}

/* ── 6.  PeeringDB physical facilities ──────────────────────────────────── */
async function getPeeringdbFacilities(asn) {
  // Get the PeeringDB net record ID for this ASN
  const net = await fetchJSON(`https://www.peeringdb.com/api/net?asn=${asn}`, { timeout: 12000 });
  const netId = net?.data?.[0]?.id;
  if (!netId) return [];

  // Get facility cross-refs
  const netfac = await fetchJSON(
    `https://www.peeringdb.com/api/netfac?net_id=${netId}&limit=15`, { timeout: 12000 }
  );
  if (!netfac?.data?.length) return [];

  const facilities = [];
  // Fetch full fac records (with lat/lng) in parallel batches of 4
  const facIds = [...new Set(netfac.data.map(nf => nf.fac_id))].slice(0, 12);
  const chunks = [];
  for (let i = 0; i < facIds.length; i += 4) chunks.push(facIds.slice(i, i + 4));

  for (const chunk of chunks) {
    const resolved = await Promise.all(
      chunk.map(fid => fetchJSON(`https://www.peeringdb.com/api/fac/${fid}`, { timeout: 10000 }))
    );
    for (const fac of resolved) {
      const f = fac?.data;
      if (f?.latitude && f?.longitude) {
        facilities.push({
          source: 'peeringdb', type: 'data_center',
          name: f.name, address: f.address1,
          city: f.city, country: f.country,
          lat: parseFloat(f.latitude), lng: parseFloat(f.longitude),
          website: f.website || null, asn,
        });
      }
    }
  }
  return facilities;
}

/* ── 7.  IP prefix → lat/lng via ipinfo ─────────────────────────────────── */
async function geoIpPrefix(prefix) {
  const ip = prefix.split('/')[0];
  const d = await fetchJSON(`https://ipinfo.io/${ip}/json`, { timeout: 7000 });
  if (!d?.loc) return null;
  const [lat, lng] = d.loc.split(',').map(Number);
  return { ip, prefix, lat, lng, city: d.city, country: d.country, org: d.org };
}

/* ── 8.  OSM data-center buildings via Overpass ─────────────────────────── */
async function osmDatacenters(lat, lng, radiusKm = 200) {
  const r = radiusKm * 1000;
  const q = `
[out:json][timeout:22];
(
  node["building"="data_center"](around:${r},${lat},${lng});
  way["building"="data_center"](around:${r},${lat},${lng});
  node["industrial"="data_centre"](around:${r},${lat},${lng});
  way["industrial"="data_centre"](around:${r},${lat},${lng});
  node["telecom"="data_center"](around:${r},${lat},${lng});
  way["telecom"="data_center"](around:${r},${lat},${lng});
);
out center tags;`.trim();

  const d = await overpassPost(q, 25000);
  if (!d?.elements) return [];
  return d.elements.map(el => ({
    source: 'osm', type: 'data_center',
    name: el.tags?.name || el.tags?.operator || 'Unknown DC',
    lat: el.lat ?? el.center?.lat, lng: el.lon ?? el.center?.lon,
    operator: el.tags?.operator || null,
    address: [el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', ') || null,
    osm_id: el.id,
  })).filter(b => b.lat && b.lng).slice(0, 25);
}

/* ── 9.  Certificate Transparency harvest ───────────────────────────────── */
async function ctSubdomains(domain) {
  const clean = domain.replace(/^www\./i, '').toLowerCase();
  const d = await fetchJSON(
    `https://crt.sh/?q=%.${encodeURIComponent(clean)}&output=json`, { timeout: 18000 }
  );
  if (!Array.isArray(d)) return [];
  const seen = new Set();
  const out = [];
  for (const cert of d.slice(0, 400)) {
    for (const name of (cert.name_value || '').split('\n')) {
      const h = name.trim().toLowerCase().replace(/^\*\./, '');
      if (h && !seen.has(h) && h.endsWith(clean)) {
        seen.add(h);
        out.push({
          subdomain: h,
          issuer: (cert.issuer_name || '').match(/O=([^,]+)/)?.[1] || '',
          not_before: cert.not_before || '',
        });
      }
    }
  }
  return out.slice(0, 80);
}

/* ── Main handler ────────────────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const query = (req.query.query || req.query.domain || req.query.asn || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Provide ?query=<company|domain|ASN>' });
  }

  const t0 = Date.now();

  try {
    /* ── Step 1: resolve ASNs ── */
    const asns = await resolveAsns(query);
    if (!asns.length) {
      return res.status(200).json({
        query, asns: [], facilities: [], prefixes: [], subdomains: [],
        osm_buildings: [], geolocated_ips: [], locations: [],
        message: 'No ASNs resolved. Try a domain name (e.g. google.com) or ASN (e.g. AS15169).',
        elapsed_ms: Date.now() - t0,
      });
    }

    /* ── Step 2: prefixes + facilities in parallel ── */
    const [prefixSets, facilitySets] = await Promise.all([
      Promise.all(asns.slice(0, 4).map(a => getAsnPrefixes(a.asn))),
      Promise.all(asns.slice(0, 4).map(a => getPeeringdbFacilities(a.asn))),
    ]);
    const prefixes   = prefixSets.flat().slice(0, 50);
    const facilities = facilitySets.flat();

    /* ── Step 3: CT subdomains ── */
    const isDomain = query.includes('.') && !query.includes(' ');
    const subdomains = isDomain ? await ctSubdomains(query) : [];

    /* ── Step 4: geolocate IP prefixes (up to 10) ── */
    const geoRaw = await Promise.all(prefixes.slice(0, 10).map(p => geoIpPrefix(p.prefix)));
    const geolocated_ips = geoRaw.filter(Boolean).filter((g, i, arr) =>
      arr.findIndex(x => x.ip === g.ip) === i
    );

    /* ── Step 5: OSM buildings near known coords ── */
    const knownCoords = [
      ...facilities.filter(f => f.lat && f.lng),
      ...geolocated_ips.filter(g => g.lat && g.lng),
    ].slice(0, 2);

    const osmSets = await Promise.all(
      knownCoords.map(c => osmDatacenters(c.lat, c.lng, 120))
    );
    const osmSeen  = new Set();
    const osm_buildings = osmSets.flat().filter(b =>
      b.osm_id && !osmSeen.has(b.osm_id) && osmSeen.add(b.osm_id)
    );

    /* ── Step 6: unified locations list ── */
    const coordSeen = new Set();
    const locations = [];

    const addLoc = (item, confidence) => {
      const key = `${Number(item.lat).toFixed(2)},${Number(item.lng).toFixed(2)}`;
      if (!coordSeen.has(key) && item.lat && item.lng) {
        coordSeen.add(key);
        locations.push({ ...item, confidence });
      }
    };

    facilities.forEach(f => addLoc(f, 'high'));
    osm_buildings.forEach(b => addLoc(b, 'medium'));
    geolocated_ips.forEach(g => addLoc({
      source: 'geoip', type: 'ip_block',
      name: g.org || g.prefix, city: g.city, country: g.country,
      lat: g.lat, lng: g.lng,
    }, 'low'));

    return res.status(200).json({
      query,
      elapsed_ms: Date.now() - t0,
      asns,
      prefixes,
      subdomains,
      facilities,
      osm_buildings,
      geolocated_ips,
      locations,
      summary: {
        asn_count:      asns.length,
        facility_count: facilities.length,
        prefix_count:   prefixes.length,
        subdomain_count: subdomains.length,
        location_count: locations.length,
      },
    });

  } catch (err) {
    console.error('[datacenter-locator]', err);
    return res.status(500).json({ error: err.message, elapsed_ms: Date.now() - t0 });
  }
};
