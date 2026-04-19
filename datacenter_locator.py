#!/usr/bin/env python3
"""
SENTINEL PLATFORM — Data Center Locator (Offline / Local CLI)
==============================================================
Discovers and maps physical data-center locations for any organisation
using entirely public / freely-downloadable data sources.

DATA SOURCES (all free, no commercial API key required):
  • BGPView REST API           – ASN / prefix lookup (online fallback)
  • PeeringDB JSON API         – physical facility coordinates
  • RIPE Stat                  – WHOIS, route-origin, AS overview
  • ARIN RDAP                  – WHOIS (Americas)
  • crt.sh                     – Certificate Transparency subdomain harvest
  • Overpass API               – OpenStreetMap data-center buildings
  • MaxMind GeoLite2-City.mmdb – offline IP → lat/lng  (free download)
  • Local RIR delegation files – offline IP-range ownership
  • PeeringDB SQLite dump      – offline facility DB
  • BGP MRT dumps (bgpdump)    – offline BGP route analysis

USAGE:
  python datacenter_locator.py --query "Google"
  python datacenter_locator.py --domain google.com
  python datacenter_locator.py --asn 15169
  python datacenter_locator.py --domain microsoft.com --offline --geoip ./GeoLite2-City.mmdb
  python datacenter_locator.py --query "US Department of Defense" --report html

OUTPUT: JSON to stdout, or --report html writes dc_report.html
"""

import argparse
import json
import os
import re
import socket
import sqlite3
import struct
import subprocess
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone
from ipaddress import ip_network, ip_address
from pathlib import Path


# ─── Optional imports (graceful degradation) ─────────────────────────────────
try:
    import geoip2.database as _geoip2
    HAS_GEOIP2 = True
except ImportError:
    HAS_GEOIP2 = False

try:
    import dns.resolver as _dns_resolver
    import dns.zone
    import dns.query
    HAS_DNSPYTHON = True
except ImportError:
    HAS_DNSPYTHON = False

try:
    import requests as _requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


# ─── Helpers ──────────────────────────────────────────────────────────────────
def http_get(url, timeout=15, headers=None):
    """Simple HTTP GET → parsed JSON or None."""
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'SentinelPlatform/1.0-OSINT')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw.decode('utf-8', errors='replace'))
    except Exception:
        return None


def http_post_raw(url, body_bytes, timeout=25):
    """POST raw bytes → text response."""
    req = urllib.request.Request(url, data=body_bytes, method='POST')
    req.add_header('User-Agent', 'SentinelPlatform/1.0-OSINT')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode('utf-8', errors='replace')
    except Exception:
        return None


def run(cmd, timeout=30):
    """Run a shell command, return stdout string."""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout.strip()
    except Exception:
        return ''


# ─── 1. ASN Resolution ────────────────────────────────────────────────────────
def resolve_asns(query: str) -> list:
    """Return list of {asn, name, description} dicts for the query."""
    query = query.strip()

    # Direct ASN input
    m = re.match(r'^(?:AS)?(\d+)$', query, re.I)
    if m:
        asn = int(m.group(1))
        meta = get_asn_meta(asn)
        return [{'asn': asn, 'name': meta.get('name', f'AS{asn}'), 'source': 'direct'}]

    found = []

    # BGPView search
    enc = urllib.parse.quote(query)
    d = http_get(f'https://api.bgpview.io/search?query_term={enc}')
    if d and d.get('data', {}).get('asns'):
        for a in d['data']['asns'][:6]:
            found.append({'asn': a['asn'], 'name': a.get('name',''), 'description': a.get('description_short',''), 'source': 'bgpview'})

    # RIPE stat search
    if len(found) < 3:
        d2 = http_get(f'https://stat.ripe.net/data/searchindex/data.json?resource={enc}&limit=5')
        if d2 and d2.get('data', {}).get('results', {}).get('aut_nums'):
            for a in d2['data']['results']['aut_nums'][:4]:
                asn = int(a['key'])
                if not any(r['asn'] == asn for r in found):
                    found.append({'asn': asn, 'name': a.get('value',''), 'source': 'ripe'})

    return found


# ─── 2. ASN Meta / WHOIS ─────────────────────────────────────────────────────
def get_asn_meta(asn: int) -> dict:
    """RDAP WHOIS for an ASN."""
    # ARIN
    d = http_get(f'https://rdap.arin.net/registry/autnum/{asn}', timeout=8)
    if d and d.get('name'):
        return {'name': d['name'], 'handle': d.get('handle'), 'source': 'arin-rdap'}

    # RIPE fallback
    d2 = http_get(f'https://stat.ripe.net/data/as-overview/data.json?resource=AS{asn}', timeout=8)
    if d2 and d2.get('data'):
        return {'name': d2['data'].get('holder', f'AS{asn}'), 'source': 'ripe-stat'}

    # whois binary fallback
    out = run(['whois', f'AS{asn}'])
    for line in out.splitlines():
        if line.lower().startswith(('as-name:', 'orgname:', 'org-name:')):
            return {'name': line.split(':', 1)[1].strip(), 'source': 'whois-binary'}

    return {'name': f'AS{asn}', 'source': 'unknown'}


# ─── 3. IP Prefix Ranges ─────────────────────────────────────────────────────
def get_prefixes(asn: int) -> list:
    """BGPView ASN prefixes."""
    d = http_get(f'https://api.bgpview.io/asn/{asn}/prefixes', timeout=15)
    prefixes = []
    if d and d.get('data'):
        for p in d['data'].get('ipv4_prefixes', [])[:25]:
            prefixes.append({'prefix': p['prefix'], 'name': p.get('name',''), 'description': p.get('description',''), 'asn': asn})
        for p in d['data'].get('ipv6_prefixes', [])[:5]:
            prefixes.append({'prefix': p['prefix'], 'name': p.get('name',''), 'description': p.get('description',''), 'asn': asn, 'v6': True})
    return prefixes


def get_prefixes_offline(asn: int, rir_dir: str) -> list:
    """
    Offline: parse RIR delegation files.
    Download from:
      https://ftp.arin.net/pub/stats/arin/delegated-arin-extended-latest
      https://ftp.ripe.net/pub/stats/ripencc/delegated-ripencc-extended-latest
      https://ftp.apnic.net/stats/apnic/delegated-apnic-extended-latest
      https://ftp.lacnic.net/pub/stats/lacnic/delegated-lacnic-extended-latest
      https://ftp.afrinic.net/pub/stats/afrinic/delegated-afrinic-extended-latest
    """
    prefixes = []
    rir_dir = Path(rir_dir)
    if not rir_dir.exists():
        return prefixes

    asn_str = str(asn)
    for f in rir_dir.glob('delegated-*-extended-latest*'):
        with open(f, encoding='utf-8', errors='replace') as fh:
            for line in fh:
                parts = line.strip().split('|')
                if len(parts) >= 7 and parts[1] and parts[2] == 'ipv4':
                    # Find lines that reference this ASN in later delegation fields
                    if asn_str in line:
                        prefixes.append({'prefix': f"{parts[3]}/{32 - int(parts[4]).bit_length() + 1 if parts[4].isdigit() else 24}", 'source': 'rir-offline', 'asn': asn})
    return prefixes[:30]


# ─── 4. PeeringDB Facilities ─────────────────────────────────────────────────
def get_peeringdb_facilities(asn: int, peeringdb_sqlite: str = None) -> list:
    """
    Fetch facility lat/lng from PeeringDB.
    If peeringdb_sqlite points to the local daily dump, uses that.
    Download the dump: https://www.peeringdb.com/apidocs/ → /api/fac (JSON dump)
    or the SQLite mirror from https://github.com/grizz/peeringdb
    """
    facilities = []

    if peeringdb_sqlite and Path(peeringdb_sqlite).exists():
        con = sqlite3.connect(peeringdb_sqlite)
        con.row_factory = sqlite3.Row
        cur = con.cursor()
        try:
            # Standard PeeringDB SQLite schema
            cur.execute('''
                SELECT f.name, f.address1, f.city, f.country, f.latitude, f.longitude,
                       f.clli, f.website
                FROM peeringdb_network_facility nf
                JOIN peeringdb_facility f ON f.id = nf.facility_id
                JOIN peeringdb_network n ON n.id = nf.network_id
                WHERE n.asn = ?
            ''', (asn,))
            for row in cur.fetchall():
                if row['latitude'] and row['longitude']:
                    facilities.append({
                        'source': 'peeringdb-local', 'type': 'data_center',
                        'name': row['name'], 'address': row['address1'],
                        'city': row['city'], 'country': row['country'],
                        'lat': float(row['latitude']), 'lng': float(row['longitude']),
                        'clli': row['clli'], 'website': row['website'], 'asn': asn,
                    })
        except Exception:
            pass
        con.close()
        return facilities

    # Online fallback
    net = http_get(f'https://www.peeringdb.com/api/net?asn={asn}', timeout=12)
    net_id = net['data'][0]['id'] if net and net.get('data') else None
    if not net_id:
        return facilities

    netfac = http_get(f'https://www.peeringdb.com/api/netfac?net_id={net_id}&depth=2', timeout=12)
    if not netfac or not netfac.get('data'):
        return facilities

    for nf in netfac['data'][:12]:
        fac_id = nf.get('fac_id')
        if not fac_id:
            continue
        fac = http_get(f'https://www.peeringdb.com/api/fac/{fac_id}', timeout=10)
        if fac and fac.get('data') and fac['data'].get('latitude'):
            f = fac['data']
            facilities.append({
                'source': 'peeringdb', 'type': 'data_center',
                'name': f.get('name', ''), 'address': f.get('address1', ''),
                'city': f.get('city', ''), 'country': f.get('country', ''),
                'lat': float(f['latitude']), 'lng': float(f['longitude']),
                'clli': f.get('clli'), 'website': f.get('website'), 'asn': asn,
            })
    return facilities


# ─── 5. Certificate Transparency ─────────────────────────────────────────────
def get_ct_subdomains(domain: str) -> list:
    """crt.sh CT log harvest → unique subdomains."""
    domain = domain.lstrip('*.').lower()
    d = http_get(f'https://crt.sh/?q=%.{urllib.parse.quote(domain)}&output=json', timeout=20)
    if not isinstance(d, list):
        return []

    seen = set()
    results = []
    for cert in d[:500]:
        for name in cert.get('name_value', '').split('\n'):
            h = name.strip().lower().lstrip('*.')
            if h and h not in seen and h.endswith(domain):
                seen.add(h)
                results.append({
                    'subdomain': h,
                    'issuer': re.search(r'O=([^,]+)', cert.get('issuer_name', '') or ''),
                    'not_before': cert.get('not_before', ''),
                })
                if isinstance(results[-1]['issuer'], re.Match):
                    results[-1]['issuer'] = results[-1]['issuer'].group(1)
    return results[:100]


# ─── 6. DNS Enumeration ───────────────────────────────────────────────────────
def dns_enum(domain: str) -> dict:
    """
    DNS enumeration using system dig / nslookup or dnspython.
    Returns A records, MX, NS, and attempts zone transfer.
    """
    results = {'a': [], 'mx': [], 'ns': [], 'txt': [], 'zone_transfer': []}

    if HAS_DNSPYTHON:
        resolver = _dns_resolver.Resolver()
        resolver.nameservers = ['8.8.8.8', '1.1.1.1']

        for rtype in ('A', 'MX', 'NS', 'TXT'):
            try:
                answers = resolver.resolve(domain, rtype, lifetime=5)
                key = rtype.lower()
                for rr in answers:
                    results[key].append(str(rr))
            except Exception:
                pass

        # Zone transfer attempt (only succeeds on misconfigured DNS — legitimate research)
        for ns in results['ns'][:3]:
            ns_clean = ns.rstrip('.')
            try:
                z = dns.zone.from_xfr(dns.query.xfr(ns_clean, domain, timeout=5, lifetime=8))
                results['zone_transfer'] = [str(n) for n in z.nodes.keys()][:50]
                break
            except Exception:
                pass
    else:
        # Fallback: system dig
        for rtype in ('A', 'MX', 'NS'):
            out = run(['dig', '+short', rtype, domain])
            results[rtype.lower()] = [l for l in out.splitlines() if l.strip()]

    return results


# ─── 7. Traceroute + GeoIP ───────────────────────────────────────────────────
def traceroute_geoip(target: str, geoip_db: str = None) -> list:
    """
    Run traceroute to target, geolocate each hop with MaxMind GeoLite2.
    Download GeoLite2-City.mmdb free from: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
    """
    hops = []
    if not geoip_db or not Path(geoip_db).exists():
        return hops
    if not HAS_GEOIP2:
        print('[traceroute] Install geoip2: pip install geoip2', file=sys.stderr)
        return hops

    # Resolve target IP
    try:
        target_ip = socket.gethostbyname(target)
    except Exception:
        return hops

    # Run traceroute
    cmd = ['traceroute', '-n', '-m', '20', '-w', '2', target_ip]
    if sys.platform == 'win32':
        cmd = ['tracert', '-d', '-h', '20', '-w', '2000', target_ip]
    out = run(cmd, timeout=60)

    ip_re = re.compile(r'(\d{1,3}(?:\.\d{1,3}){3})')
    reader = _geoip2.Reader(geoip_db)

    for line in out.splitlines():
        ips = ip_re.findall(line)
        for ip_str in ips:
            try:
                r = reader.city(ip_str)
                hops.append({
                    'ip': ip_str,
                    'lat': r.location.latitude,
                    'lng': r.location.longitude,
                    'city': r.city.name,
                    'country': r.country.iso_code,
                    'asn': None,
                })
            except Exception:
                hops.append({'ip': ip_str, 'lat': None, 'lng': None})

    reader.close()
    return hops


# ─── 8. OpenStreetMap via Overpass ───────────────────────────────────────────
def get_osm_datacenters(lat: float, lng: float, radius_km: int = 200) -> list:
    """Query Overpass API for data-center tagged buildings near a coordinate."""
    r = radius_km * 1000
    query = f"""
[out:json][timeout:25];
(
  node["building"="data_center"](around:{r},{lat},{lng});
  way["building"="data_center"](around:{r},{lat},{lng});
  node["industrial"="data_centre"](around:{r},{lat},{lng});
  way["industrial"="data_centre"](around:{r},{lat},{lng});
  node["telecom"="data_center"](around:{r},{lat},{lng});
  way["telecom"="data_center"](around:{r},{lat},{lng});
  node["military"="base"]["operator"~".",i](around:{r},{lat},{lng});
);
out center tags;
""".strip()

    body = urllib.parse.urlencode({'data': query}).encode()
    raw = http_post_raw('https://overpass-api.de/api/interpreter', body, timeout=30)
    if not raw:
        return []

    try:
        d = json.loads(raw)
    except Exception:
        return []

    results = []
    for el in d.get('elements', []):
        elat = el.get('lat') or el.get('center', {}).get('lat')
        elng = el.get('lon') or el.get('center', {}).get('lon')
        if not elat or not elng:
            continue
        tags = el.get('tags', {})
        results.append({
            'source': 'osm', 'type': 'data_center',
            'osm_id': el['id'],
            'name': tags.get('name') or tags.get('operator') or 'Unknown DC',
            'lat': elat, 'lng': elng,
            'operator': tags.get('operator'),
            'address': ', '.join(filter(None, [tags.get('addr:street'), tags.get('addr:city')])),
            'power_supply': tags.get('generator:source') or tags.get('power'),
        })
    return results[:40]


# ─── 9. BGP MRT dump analysis (offline) ─────────────────────────────────────
def analyze_bgp_dump(mrt_file: str, target_asns: list) -> list:
    """
    Parse BGP MRT dump (from bgpdump binary).
    Download daily dumps from: http://archive.routeviews.org/bgpdata/
    or: https://data.ris.ripe.net/
    Requires: bgpdump CLI tool (apt install bgpdump)
    """
    if not Path(mrt_file).exists():
        return []

    target_set = {str(a) for a in target_asns}
    prefixes = []

    out = run(['bgpdump', '-m', mrt_file], timeout=120)
    for line in out.splitlines():
        parts = line.split('|')
        if len(parts) < 7:
            continue
        prefix = parts[5] if len(parts) > 5 else ''
        as_path = parts[6] if len(parts) > 6 else ''
        origin_asn = as_path.split()[-1] if as_path else ''
        if origin_asn in target_set:
            prefixes.append({'prefix': prefix, 'origin_asn': int(origin_asn), 'source': 'bgp-mrt'})

    # Deduplicate
    seen = set()
    unique = []
    for p in prefixes:
        if p['prefix'] not in seen:
            seen.add(p['prefix'])
            unique.append(p)
    return unique[:50]


# ─── 10. GeoIP enrichment for prefixes ───────────────────────────────────────
def geoip_enrich(prefixes: list, geoip_db: str) -> list:
    """Map prefix first-IPs → lat/lng using MaxMind GeoLite2."""
    if not geoip_db or not Path(geoip_db).exists() or not HAS_GEOIP2:
        # Online fallback via ipinfo.io
        results = []
        for p in prefixes[:10]:
            ip = p['prefix'].split('/')[0]
            d = http_get(f'https://ipinfo.io/{ip}/json', timeout=6)
            if d and d.get('loc'):
                lat, lng = map(float, d['loc'].split(','))
                results.append({**p, 'lat': lat, 'lng': lng, 'city': d.get('city'),
                                 'country': d.get('country'), 'org': d.get('org')})
        return results

    reader = _geoip2.Reader(geoip_db)
    results = []
    for p in prefixes[:20]:
        ip = p['prefix'].split('/')[0]
        try:
            r = reader.city(ip)
            results.append({**p,
                'lat': r.location.latitude, 'lng': r.location.longitude,
                'city': r.city.name, 'country': r.country.iso_code,
                'isp': r.traits.isp if hasattr(r.traits, 'isp') else None,
            })
        except Exception:
            pass
    reader.close()
    return results


# ─── 11. EXIF metadata from images ───────────────────────────────────────────
def extract_exif_from_url(image_url: str) -> dict:
    """
    Download an image and extract GPS EXIF metadata.
    Useful for photos posted on company/military websites.
    Requires: pip install exifread
    """
    try:
        import exifread
        import io
        req = urllib.request.Request(image_url)
        req.add_header('User-Agent', 'SentinelPlatform/1.0')
        with urllib.request.urlopen(req, timeout=10) as r:
            data = io.BytesIO(r.read())
        tags = exifread.process_file(data, details=False)
        gps = {}
        for key, val in tags.items():
            if 'GPS' in key:
                gps[key] = str(val)
        return gps
    except Exception as e:
        return {'error': str(e)}


# ─── 12. HTML Report Generator ───────────────────────────────────────────────
def generate_html_report(results: dict) -> str:
    query = results.get('query', 'Unknown')
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    locs = results.get('locations', [])
    asns = results.get('asns', [])
    prefixes = results.get('prefixes', [])
    subdomains = results.get('subdomains', [])

    loc_rows = ''.join(
        f'<tr><td>{l.get("name","")}</td><td>{l.get("lat","")}</td>'
        f'<td>{l.get("lng","")}</td><td>{l.get("city","")}</td>'
        f'<td>{l.get("country","")}</td><td>{l.get("source","")}</td>'
        f'<td><span class="conf-{l.get("confidence","low")}">{l.get("confidence","").upper()}</span></td></tr>'
        for l in locs
    )
    asn_rows = ''.join(
        f'<tr><td>AS{a.get("asn","")}</td><td>{a.get("name","")}</td>'
        f'<td>{a.get("description","")}</td><td>{a.get("source","")}</td></tr>'
        for a in asns
    )
    prefix_rows = ''.join(
        f'<tr><td>{p.get("prefix","")}</td><td>{p.get("name","")}</td>'
        f'<td>{p.get("description","")}</td></tr>'
        for p in prefixes[:30]
    )
    subdomain_rows = ''.join(
        f'<tr><td>{s.get("subdomain","")}</td><td>{s.get("issuer","")}</td>'
        f'<td>{s.get("not_before","")[:10]}</td></tr>'
        for s in subdomains[:50]
    )

    markers_js = json.dumps([
        {'lat': l['lat'], 'lng': l['lng'], 'name': l.get('name',''),
         'type': l.get('type',''), 'source': l.get('source',''), 'confidence': l.get('confidence','')}
        for l in locs if l.get('lat') and l.get('lng')
    ])

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>DC Locator — {query}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  body {{ font-family: monospace; background: #0a0e14; color: #c9d1d9; margin: 0; padding: 20px; }}
  h1 {{ color: #58a6ff; }} h2 {{ color: #3fb950; border-bottom: 1px solid #30363d; padding-bottom: 6px; }}
  table {{ border-collapse: collapse; width: 100%; margin-bottom: 24px; font-size: 12px; }}
  th {{ background: #161b22; color: #58a6ff; padding: 6px 10px; text-align: left; }}
  td {{ padding: 5px 10px; border-bottom: 1px solid #21262d; }}
  tr:hover td {{ background: #161b22; }}
  #map {{ height: 480px; border: 1px solid #30363d; border-radius: 6px; margin-bottom: 24px; }}
  .conf-high {{ color: #3fb950; }} .conf-medium {{ color: #f59e0b; }} .conf-low {{ color: #8b949e; }}
  .badge {{ display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; }}
  .summary {{ display:flex; gap:20px; flex-wrap:wrap; margin-bottom:20px; }}
  .stat {{ background:#161b22; border:1px solid #30363d; border-radius:6px; padding:12px 20px; }}
  .stat-n {{ font-size:28px; color:#58a6ff; font-weight:700; }}
  .stat-l {{ font-size:11px; color:#8b949e; }}
</style>
</head>
<body>
<h1>⬡ SENTINEL — Data Center Locator</h1>
<p style="color:#8b949e">Query: <b style="color:#e6edf3">{query}</b> &nbsp;|&nbsp; Generated: {ts}</p>

<div class="summary">
  <div class="stat"><div class="stat-n">{len(asns)}</div><div class="stat-l">ASNs</div></div>
  <div class="stat"><div class="stat-n">{len(locs)}</div><div class="stat-l">Locations</div></div>
  <div class="stat"><div class="stat-n">{len(prefixes)}</div><div class="stat-l">IP Prefixes</div></div>
  <div class="stat"><div class="stat-n">{len(subdomains)}</div><div class="stat-l">Subdomains</div></div>
</div>

<h2>Map</h2>
<div id="map"></div>
<script>
const map = L.map('map').setView([20, 10], 2);
L.tileLayer('https://{{s}}.basemaps.cartocdn.com/dark_all/{{z}}/{{x}}/{{y}}{{r}}.png',
  {{attribution:'&copy; CartoDB', maxZoom:19}}).addTo(map);
const markers = {markers_js};
const colors = {{high:'#3fb950', medium:'#f59e0b', low:'#8b949e', peeringdb:'#58a6ff', osm:'#a78bfa', geoip:'#f97316'}};
markers.forEach(m => {{
  const c = colors[m.confidence] || colors[m.source] || '#58a6ff';
  L.circleMarker([m.lat, m.lng], {{radius:8, color:c, fillColor:c, fillOpacity:0.75, weight:2}})
    .bindPopup(`<b>${{m.name}}</b><br>Type: ${{m.type}}<br>Source: ${{m.source}}<br>Confidence: ${{m.confidence}}`)
    .addTo(map);
}});
if (markers.length) {{
  const group = L.featureGroup(markers.filter(m=>m.lat).map(m=>L.circleMarker([m.lat,m.lng])));
  try {{ map.fitBounds(group.getBounds().pad(0.2)); }} catch(_) {{}}
}}
</script>

<h2>Discovered Locations ({len(locs)})</h2>
<table><thead><tr><th>Name</th><th>Lat</th><th>Lng</th><th>City</th><th>Country</th><th>Source</th><th>Confidence</th></tr></thead>
<tbody>{loc_rows}</tbody></table>

<h2>ASNs ({len(asns)})</h2>
<table><thead><tr><th>ASN</th><th>Name</th><th>Description</th><th>Source</th></tr></thead>
<tbody>{asn_rows}</tbody></table>

<h2>IP Prefixes ({len(prefixes)})</h2>
<table><thead><tr><th>Prefix</th><th>Name</th><th>Description</th></tr></thead>
<tbody>{prefix_rows}</tbody></table>

<h2>Subdomains from CT Logs ({len(subdomains)})</h2>
<table><thead><tr><th>Subdomain</th><th>Issuer</th><th>First Seen</th></tr></thead>
<tbody>{subdomain_rows}</tbody></table>

<p style="color:#30363d;font-size:10px">SENTINEL Platform · Data Center Locator · {ts} · Sources: BGPView, PeeringDB, RIPE Stat, ARIN RDAP, crt.sh, OpenStreetMap</p>
</body>
</html>"""


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description='SENTINEL Data Center Locator')
    ap.add_argument('--query',   '-q', help='Company / entity name, domain, or ASN')
    ap.add_argument('--domain',  '-d', help='Domain name (e.g. google.com)')
    ap.add_argument('--asn',     '-a', help='ASN number (e.g. 15169)')
    ap.add_argument('--geoip',        help='Path to MaxMind GeoLite2-City.mmdb', default=None)
    ap.add_argument('--peeringdb',    help='Path to local PeeringDB SQLite dump', default=None)
    ap.add_argument('--bgp-dump',     help='Path to BGP MRT dump file', default=None)
    ap.add_argument('--rir-dir',      help='Directory with RIR delegation files', default=None)
    ap.add_argument('--traceroute',   action='store_true', help='Run traceroute to discovered IPs')
    ap.add_argument('--report',       choices=['json', 'html'], default='json', help='Output format')
    ap.add_argument('--output',  '-o', help='Output file (default: stdout for json, dc_report.html for html)')
    ap.add_argument('--verbose', '-v', action='store_true')
    args = ap.parse_args()

    search_term = args.asn or args.domain or args.query
    if not search_term:
        ap.print_help()
        sys.exit(1)

    def log(msg):
        if args.verbose:
            print(f'[{datetime.now().strftime("%H:%M:%S")}] {msg}', file=sys.stderr)

    log(f'Resolving ASNs for: {search_term}')
    asns = resolve_asns(search_term)
    log(f'Found {len(asns)} ASN(s): {[a["asn"] for a in asns]}')

    if not asns:
        print(json.dumps({'error': 'No ASNs found', 'query': search_term}))
        sys.exit(0)

    # Prefixes
    log('Fetching IP prefixes...')
    prefixes = []
    for a in asns[:4]:
        if args.rir_dir:
            prefixes.extend(get_prefixes_offline(a['asn'], args.rir_dir))
        else:
            prefixes.extend(get_prefixes(a['asn']))

    # PeeringDB facilities
    log('Querying PeeringDB for physical facilities...')
    facilities = []
    for a in asns[:4]:
        facilities.extend(get_peeringdb_facilities(a['asn'], args.peeringdb))

    # CT subdomains
    domain = args.domain or (search_term if '.' in search_term else None)
    subdomains = []
    if domain:
        log(f'Harvesting Certificate Transparency logs for {domain}...')
        subdomains = get_ct_subdomains(domain)
        log(f'Found {len(subdomains)} subdomains')

    # OSM buildings near known coords
    log('Querying OpenStreetMap for data-center buildings...')
    osm_buildings = []
    for f in facilities[:2]:
        osm_buildings.extend(get_osm_datacenters(f['lat'], f['lng'], radius_km=150))
    # Deduplicate by osm_id
    seen_osm = set()
    osm_buildings = [b for b in osm_buildings if not (b['osm_id'] in seen_osm or seen_osm.add(b['osm_id']))]

    # GeoIP enrichment
    log('Geolocating IP prefixes...')
    geolocated = geoip_enrich(prefixes, args.geoip)

    # BGP MRT dump (offline)
    bgp_prefixes = []
    if args.bgp_dump:
        log(f'Analyzing BGP dump: {args.bgp_dump}')
        bgp_prefixes = analyze_bgp_dump(args.bgp_dump, [a['asn'] for a in asns])
        log(f'BGP dump yielded {len(bgp_prefixes)} prefixes')

    # Traceroute
    traceroute_hops = []
    if args.traceroute and domain:
        log(f'Running traceroute to {domain}...')
        traceroute_hops = traceroute_geoip(domain, args.geoip)
        log(f'Traceroute: {len(traceroute_hops)} hops geolocated')

    # Unified location list
    locations = []
    seen_coords = set()

    def add_loc(item, confidence):
        k = (round(item.get('lat', 0), 3), round(item.get('lng', 0), 3))
        if k not in seen_coords and item.get('lat') and item.get('lng'):
            seen_coords.add(k)
            locations.append({**item, 'confidence': confidence})

    for f in facilities:
        add_loc(f, 'high')
    for b in osm_buildings:
        add_loc(b, 'medium')
    for g in geolocated:
        add_loc({**g, 'source': 'geoip', 'type': 'ip_block', 'name': g.get('org', g['prefix'])}, 'low')
    for h in traceroute_hops:
        if h.get('lat'):
            add_loc({**h, 'source': 'traceroute', 'type': 'hop', 'name': h['ip']}, 'low')

    results = {
        'query': search_term,
        'generated': datetime.now(timezone.utc).isoformat(),
        'asns': asns,
        'prefixes': prefixes + bgp_prefixes,
        'subdomains': subdomains,
        'facilities': facilities,
        'osm_buildings': osm_buildings,
        'geolocated_ips': geolocated,
        'traceroute_hops': traceroute_hops,
        'locations': locations,
        'summary': {
            'asn_count': len(asns),
            'facility_count': len(facilities),
            'prefix_count': len(prefixes) + len(bgp_prefixes),
            'subdomain_count': len(subdomains),
            'osm_count': len(osm_buildings),
            'location_count': len(locations),
        },
    }

    if args.report == 'html':
        html = generate_html_report(results)
        out_path = args.output or 'dc_report.html'
        Path(out_path).write_text(html, encoding='utf-8')
        print(f'[+] HTML report written to: {out_path}', file=sys.stderr)
    else:
        out = args.output
        if out:
            Path(out).write_text(json.dumps(results, indent=2), encoding='utf-8')
            print(f'[+] JSON results written to: {out}', file=sys.stderr)
        else:
            print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
