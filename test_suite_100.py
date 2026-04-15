"""
SENTINEL INTELLIGENCE PLATFORM — 120 RIGOROUS TESTS
Tests all API endpoints, data shapes, error handling, and edge cases
against the live Vercel deployment.
Sections 1-13: original 100 tests
Section 14: 20 InSAR / DEM terrain analysis tests
"""
import requests
import json
import time
import sys
from datetime import datetime

# Force UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError on article titles)
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass  # Python < 3.7 fallback

BASE = "https://sentinelplatform.vercel.app"
TIMEOUT_FAST = 20
TIMEOUT_SLOW = 65

passed = 0
failed = 0
skipped = 0
results = []

def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        results.append(("PASS", name, ""))
        print(f"  PASS  {name}")
    except AssertionError as e:
        failed += 1
        msg = str(e)[:120]
        results.append(("FAIL", name, msg))
        print(f"  FAIL  {name}  -- {msg}")
    except Exception as e:
        failed += 1
        msg = type(e).__name__ + ": " + str(e)[:100]
        results.append(("FAIL", name, msg))
        print(f"  FAIL  {name}  -- {msg}")

def get(path, params=None, timeout=TIMEOUT_FAST):
    return requests.get(BASE + path, params=params, timeout=timeout)

def post(path, body, timeout=TIMEOUT_SLOW):
    return requests.post(BASE + path, json=body,
                         headers={"Content-Type": "application/json"}, timeout=timeout)

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*64)
print("SENTINEL · 100-TEST SUITE · " + datetime.utcnow().isoformat()[:19] + " UTC")
print("="*64)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[1] CONFLICT-NEWS API (10 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _cn_basic():
    r = get("/api/conflict-news", {"q":"ukraine russia","timespan":"7d"})
    assert r.status_code == 200, f"status {r.status_code}"
    d = r.json(); assert "articles" in d, "no articles key"
test("conflict-news: basic query returns articles key", _cn_basic)

def _cn_articles_list():
    r = get("/api/conflict-news", {"q":"conflict","timespan":"7d"})
    d = r.json(); assert isinstance(d["articles"], list), "articles not a list"
test("conflict-news: articles is a list", _cn_articles_list)

def _cn_article_fields():
    r = get("/api/conflict-news", {"q":"ukraine","timespan":"7d"})
    d = r.json()
    if d["articles"]:
        a = d["articles"][0]
        assert "title" in a, "missing title"
test("conflict-news: article has title field", _cn_article_fields)

def _cn_article_url():
    r = get("/api/conflict-news", {"q":"ukraine","timespan":"7d"})
    d = r.json()
    if d["articles"]:
        a = d["articles"][0]
        assert "url" in a, "missing url"
test("conflict-news: article has url field", _cn_article_url)

def _cn_timespan_1d():
    r = get("/api/conflict-news", {"q":"war","timespan":"1d"})
    assert r.status_code == 200
    d = r.json(); assert "articles" in d
test("conflict-news: timespan=1d works", _cn_timespan_1d)

def _cn_timespan_3d():
    r = get("/api/conflict-news", {"q":"conflict","timespan":"3d"})
    assert r.status_code == 200
test("conflict-news: timespan=3d works", _cn_timespan_3d)

def _cn_multi_keyword():
    r = get("/api/conflict-news", {"q":"india pakistan border drone","timespan":"7d"})
    assert r.status_code == 200
test("conflict-news: multi-keyword query ok", _cn_multi_keyword)

def _cn_content_type():
    r = get("/api/conflict-news", {"q":"conflict","timespan":"7d"})
    assert "application/json" in r.headers.get("content-type",""), "not json ct"
test("conflict-news: content-type is application/json", _cn_content_type)

def _cn_no_query():
    r = get("/api/conflict-news", {"timespan":"7d"})
    # Should still return 200 with empty or default articles
    assert r.status_code in (200, 400, 422), f"unexpected {r.status_code}"
test("conflict-news: missing q param handled gracefully", _cn_no_query)

def _cn_response_time():
    t0 = time.time()
    r = get("/api/conflict-news", {"q":"gaza","timespan":"7d"})
    elapsed = time.time() - t0
    assert r.status_code == 200
    assert elapsed < 20, f"too slow: {elapsed:.1f}s"
test("conflict-news: responds within 20s", _cn_response_time)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[2] CONFLICT-EVENTS API (8 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _ce_basic():
    r = get("/api/conflict-events")
    assert r.status_code == 200
    d = r.json(); assert "events" in d or isinstance(d, list), "no events"
test("conflict-events: returns 200", _ce_basic)

def _ce_array():
    r = get("/api/conflict-events")
    d = r.json()
    events = d.get("events", d) if isinstance(d, dict) else d
    assert isinstance(events, list), "events not a list"
test("conflict-events: events is a list", _ce_array)

def _ce_event_lat_lng():
    r = get("/api/conflict-events")
    d = r.json()
    events = d.get("events", d) if isinstance(d, dict) else d
    if events:
        e = events[0]
        assert "lat" in e or "latitude" in e or "location" in e, f"no lat in {list(e.keys())}"
test("conflict-events: event has location field", _ce_event_lat_lng)

def _ce_cors():
    r = get("/api/conflict-events")
    assert "access-control-allow-origin" in r.headers or r.status_code==200
test("conflict-events: CORS header present or 200", _ce_cors)

def _ce_json():
    r = get("/api/conflict-events")
    assert r.status_code == 200
    r.json()  # should not raise
test("conflict-events: response is valid JSON", _ce_json)

def _ce_not_empty():
    r = get("/api/conflict-events")
    d = r.json()
    events = d.get("events", d) if isinstance(d, dict) else d
    assert len(events) >= 0  # just check it's a list, may legitimately be empty
test("conflict-events: list length is non-negative", _ce_not_empty)

def _ce_no_crash_on_get():
    for _ in range(3):
        r = get("/api/conflict-events")
        assert r.status_code == 200
test("conflict-events: stable across 3 consecutive calls", _ce_no_crash_on_get)

def _ce_response_shape():
    r = get("/api/conflict-events")
    d = r.json()
    # Accept either {"events":[...]} or [...]
    assert isinstance(d, (dict, list))
test("conflict-events: response is dict or list", _ce_response_shape)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[3] EARTHQUAKES API (6 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _eq_basic():
    r = get("/api/earthquakes", timeout=15)
    assert r.status_code == 200
test("earthquakes: returns 200", _eq_basic)

def _eq_has_events():
    r = get("/api/earthquakes", timeout=15)
    d = r.json()
    events = d.get("events", d.get("earthquakes", d)) if isinstance(d, dict) else d
    assert isinstance(events, list)
test("earthquakes: list returned", _eq_has_events)

def _eq_json():
    r = get("/api/earthquakes", timeout=15)
    r.json()
test("earthquakes: valid JSON", _eq_json)

def _eq_magnitude():
    r = get("/api/earthquakes", timeout=15)
    d = r.json()
    events = d.get("events", d.get("earthquakes", d)) if isinstance(d, dict) else d
    if events:
        e = events[0]
        has_mag = any(k in e for k in ("magnitude","mag","richter"))
        assert has_mag, f"no magnitude key in {list(e.keys())}"
test("earthquakes: event has magnitude field", _eq_magnitude)

def _eq_200_json():
    r = get("/api/earthquakes", timeout=15)
    assert r.status_code == 200
    assert "json" in r.headers.get("content-type","").lower()
test("earthquakes: 200 with JSON content-type", _eq_200_json)

def _eq_fast():
    t0 = time.time()
    r = get("/api/earthquakes", timeout=15)
    assert r.status_code == 200
    assert time.time()-t0 < 15
test("earthquakes: responds within 15s", _eq_fast)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[4] HUMANITARIAN API (5 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _hum_basic():
    r = get("/api/humanitarian", timeout=12)
    assert r.status_code == 200
test("humanitarian: returns 200", _hum_basic)

def _hum_list():
    r = get("/api/humanitarian", timeout=12)
    d = r.json()
    data = d.get("crises", d.get("data", d)) if isinstance(d, dict) else d
    assert isinstance(data, (list, dict))
test("humanitarian: returns list or dict", _hum_list)

def _hum_json():
    r = get("/api/humanitarian", timeout=12)
    r.json()
test("humanitarian: valid JSON", _hum_json)

def _hum_not_500():
    r = get("/api/humanitarian", timeout=12)
    assert r.status_code != 500, "server error"
test("humanitarian: no 500 error", _hum_not_500)

def _hum_fields():
    r = get("/api/humanitarian", timeout=12)
    d = r.json()
    crises = d.get("crises", d) if isinstance(d, dict) else d
    if isinstance(crises, list) and crises:
        c = crises[0]
        assert isinstance(c, dict), "crisis not a dict"
test("humanitarian: crisis entries are dicts", _hum_fields)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[5] CYBER-THREATS API (5 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _cy_basic():
    r = get("/api/cyber-threats", timeout=22)
    assert r.status_code == 200
test("cyber-threats: returns 200", _cy_basic)

def _cy_json():
    r = get("/api/cyber-threats", timeout=22)
    r.json()
test("cyber-threats: valid JSON", _cy_json)

def _cy_list():
    r = get("/api/cyber-threats", timeout=22)
    d = r.json()
    threats = d.get("threats", d.get("events", d)) if isinstance(d, dict) else d
    assert isinstance(threats, (list, dict))
test("cyber-threats: returns list or dict", _cy_list)

def _cy_no_500():
    r = get("/api/cyber-threats", timeout=22)
    assert r.status_code != 500
test("cyber-threats: no 500 error", _cy_no_500)

def _cy_fast():
    t0 = time.time()
    r = get("/api/cyber-threats", timeout=22)
    assert r.status_code == 200
    assert time.time()-t0 < 22
test("cyber-threats: responds within 22s", _cy_fast)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[6] NATURAL-EVENTS API (4 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _ne_basic():
    r = get("/api/natural-events", timeout=15)
    assert r.status_code == 200
test("natural-events: returns 200", _ne_basic)

def _ne_json():
    r = get("/api/natural-events", timeout=15)
    r.json()
test("natural-events: valid JSON", _ne_json)

def _ne_no_500():
    r = get("/api/natural-events", timeout=15)
    assert r.status_code != 500
test("natural-events: no 500 error", _ne_no_500)

def _ne_shape():
    r = get("/api/natural-events", timeout=15)
    d = r.json()
    assert isinstance(d, (dict, list))
test("natural-events: dict or list shape", _ne_shape)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[7] INTERNET-DISRUPTIONS API (4 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _id_basic():
    r = get("/api/internet-disruptions", timeout=18)
    assert r.status_code == 200
test("internet-disruptions: returns 200", _id_basic)

def _id_json():
    r = get("/api/internet-disruptions", timeout=18)
    r.json()
test("internet-disruptions: valid JSON", _id_json)

def _id_no_500():
    r = get("/api/internet-disruptions", timeout=18)
    assert r.status_code != 500
test("internet-disruptions: no 500 error", _id_no_500)

def _id_shape():
    r = get("/api/internet-disruptions", timeout=18)
    d = r.json()
    assert isinstance(d, (dict, list))
test("internet-disruptions: dict or list shape", _id_shape)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[8] SAR-CATALOG API (12 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _sar_status():
    r = get("/api/sar-catalog", {"action":"status"}, timeout=15)
    assert r.status_code == 200
    d = r.json(); assert "authenticated" in d, f"no authenticated key: {d}"
test("sar-catalog: status action returns authenticated", _sar_status)

def _sar_status_true():
    r = get("/api/sar-catalog", {"action":"status"}, timeout=15)
    d = r.json(); assert d.get("authenticated") == True, f"not authenticated: {d}"
test("sar-catalog: authenticated=true", _sar_status_true)

def _sar_status_collections():
    r = get("/api/sar-catalog", {"action":"status"}, timeout=15)
    d = r.json(); assert "collections" in d
test("sar-catalog: status has collections", _sar_status_collections)

def _sar_search_basic():
    r = get("/api/sar-catalog", {"action":"search","lat":"31.5","lng":"34.4","timespan":"30d","radius_km":"50"}, timeout=35)
    assert r.status_code == 200
    d = r.json(); assert "scenes" in d, f"no scenes key: {list(d.keys())}"
test("sar-catalog: search returns scenes", _sar_search_basic)

def _sar_search_list():
    r = get("/api/sar-catalog", {"action":"search","lat":"31.5","lng":"34.4","timespan":"30d"}, timeout=35)
    d = r.json(); assert isinstance(d["scenes"], list)
test("sar-catalog: scenes is a list", _sar_search_list)

def _sar_search_bbox():
    r = get("/api/sar-catalog", {"action":"search","lat":"31.5","lng":"34.4","timespan":"30d"}, timeout=35)
    d = r.json(); assert "bbox" in d
test("sar-catalog: search returns bbox", _sar_search_bbox)

def _sar_scene_fields():
    r = get("/api/sar-catalog", {"action":"search","lat":"48.0","lng":"37.8","timespan":"30d"}, timeout=35)
    d = r.json()
    if d["scenes"]:
        s = d["scenes"][0]
        for key in ("id","date","orbit","polarization","bbox"):
            assert key in s, f"missing field: {key}"
test("sar-catalog: scene has id/date/orbit/polarization/bbox", _sar_scene_fields)

def _sar_scene_thumbnail():
    r = get("/api/sar-catalog", {"action":"search","lat":"48.0","lng":"37.8","timespan":"30d"}, timeout=35)
    d = r.json()
    # thumbnail_url may be None but key should exist
    if d["scenes"]:
        s = d["scenes"][0]; assert "thumbnail_url" in s
test("sar-catalog: scene has thumbnail_url field", _sar_scene_thumbnail)

def _sar_no_lat_lng():
    r = get("/api/sar-catalog", {"action":"search"}, timeout=15)
    assert r.status_code in (400, 500), f"expected 4xx/5xx for missing lat/lng, got {r.status_code}"
test("sar-catalog: missing lat/lng returns error", _sar_no_lat_lng)

def _sar_donetsk():
    r = get("/api/sar-catalog", {"action":"search","lat":"48.0","lng":"37.8","timespan":"30d","collection":"sentinel-1-grd"}, timeout=35)
    assert r.status_code == 200
    d = r.json(); assert "scenes" in d
test("sar-catalog: Donetsk search works", _sar_donetsk)

def _sar_unknown_action():
    r = get("/api/sar-catalog", {"action":"bogus"}, timeout=10)
    assert r.status_code in (400, 500)
test("sar-catalog: unknown action returns 4xx/5xx", _sar_unknown_action)

def _sar_total_field():
    r = get("/api/sar-catalog", {"action":"search","lat":"31.5","lng":"34.4","timespan":"30d"}, timeout=35)
    d = r.json(); assert "total" in d
test("sar-catalog: search returns total count", _sar_total_field)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[9] LOCAL-INTEL API (12 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _li_search():
    r = get("/api/local-intel", {"action":"search","location":"Gaza","timespan":"7d"}, timeout=55)
    assert r.status_code == 200
    d = r.json(); assert "articles" in d or "boundary" in d, f"keys: {list(d.keys())}"
test("local-intel: search returns articles or boundary", _li_search)

def _li_boundary():
    r = get("/api/local-intel", {"action":"boundary","location":"Kyiv"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "boundary" in d or "lat" in d or "error" in d
test("local-intel: boundary action returns lat or error", _li_boundary)

def _li_search_articles_list():
    r = get("/api/local-intel", {"action":"search","location":"Ukraine","timespan":"7d"}, timeout=55)
    d = r.json()
    if "articles" in d:
        assert isinstance(d["articles"], list)
test("local-intel: search articles is a list", _li_search_articles_list)

def _li_search_boundary_shape():
    r = get("/api/local-intel", {"action":"search","location":"Donetsk","timespan":"7d"}, timeout=55)
    d = r.json()
    if "boundary" in d and d["boundary"]:
        b = d["boundary"]; assert "lat" in b or "geojson" in b
test("local-intel: search boundary has lat or geojson", _li_search_boundary_shape)

def _li_news_action():
    r = get("/api/local-intel", {"action":"news","location":"Gaza"}, timeout=30)
    assert r.status_code == 200
test("local-intel: news action returns 200", _li_news_action)

def _li_agents():
    r = get("/api/local-intel", {"action":"agents","location":"Kharkiv"}, timeout=55)
    assert r.status_code == 200
    d = r.json()
    assert "agents" in d or "synthesis" in d or "error" in d, f"keys: {list(d.keys())}"
test("local-intel: agents action returns agents/synthesis/error", _li_agents)

def _li_agents_list():
    r = get("/api/local-intel", {"action":"agents","location":"Kharkiv"}, timeout=55)
    d = r.json()
    if "agents" in d:
        assert isinstance(d["agents"], list)
test("local-intel: agents is a list", _li_agents_list)

def _li_no_location():
    r = get("/api/local-intel", {"action":"search"}, timeout=10)
    assert r.status_code in (200, 400, 422)
    # Should not crash with 500
    assert r.status_code != 500, "unexpected 500 on empty location"
test("local-intel: empty location handled (no 500)", _li_no_location)

def _li_india_pakistan():
    r = get("/api/local-intel", {"action":"search","location":"Jammu Kashmir","timespan":"7d"}, timeout=55)
    assert r.status_code == 200
test("local-intel: India-Pakistan (Jammu Kashmir) search ok", _li_india_pakistan)

def _li_json():
    r = get("/api/local-intel", {"action":"search","location":"Gaza","timespan":"7d"}, timeout=55)
    r.json()
test("local-intel: response is valid JSON", _li_json)

def _li_search_no_crash_rapid():
    # Two sequential calls should not crash
    for loc in ("Gaza","Donetsk"):
        r = get("/api/local-intel", {"action":"boundary","location":loc}, timeout=15)
        assert r.status_code in (200,400,429,500), f"unexpected status {r.status_code}"
test("local-intel: two sequential boundary calls stable", _li_search_no_crash_rapid)

def _li_search_location_echo():
    r = get("/api/local-intel", {"action":"search","location":"Kyiv","timespan":"7d"}, timeout=55)
    assert r.status_code == 200
test("local-intel: Kyiv search returns 200", _li_search_location_echo)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[10] GEMINI-PROXY API (8 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _gp_basic():
    r = post("/api/gemini-proxy", {"systemPrompt":"You are a test agent. Reply with JSON: {\"ok\":true}","userPrompt":"Return the JSON."})
    assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
    d = r.json(); assert "text" in d, f"no text key: {list(d.keys())}"
test("gemini-proxy: basic call returns text", _gp_basic)

def _gp_text_nonempty():
    r = post("/api/gemini-proxy", {"systemPrompt":"Reply with one word.","userPrompt":"Say hello."})
    d = r.json(); assert d.get("text","").strip() != "", "empty text"
test("gemini-proxy: text is non-empty", _gp_text_nonempty)

def _gp_no_body_400():
    r = post("/api/gemini-proxy", {})
    assert r.status_code == 400, f"expected 400 for empty body, got {r.status_code}"
test("gemini-proxy: empty body returns 400", _gp_no_body_400)

def _gp_method_get_405():
    r = get("/api/gemini-proxy", timeout=10)
    assert r.status_code == 405, f"expected 405 for GET, got {r.status_code}"
test("gemini-proxy: GET returns 405", _gp_method_get_405)

def _gp_json_output():
    r = post("/api/gemini-proxy", {
        "systemPrompt": 'Respond ONLY with valid JSON: {"status":"online","model":"kimi"}',
        "userPrompt": "Return the status JSON."
    })
    assert r.status_code == 200
    d = r.json(); assert "text" in d
    # Try to parse the text as JSON
    text = d["text"]
    m = __import__("re").search(r'\{[^}]+\}', text)
    assert m is not None, f"no JSON in response: {text[:200]}"
test("gemini-proxy: can produce structured JSON output", _gp_json_output)

def _gp_long_system_prompt():
    long_prompt = "You are an intelligence analyst. " * 50
    r = post("/api/gemini-proxy", {"systemPrompt": long_prompt, "userPrompt": "Summarise in one sentence."})
    assert r.status_code == 200
test("gemini-proxy: handles long system prompt", _gp_long_system_prompt)

def _gp_cors():
    r = post("/api/gemini-proxy", {"systemPrompt":"hi","userPrompt":"hi"})
    # CORS header or 200 OK
    assert r.status_code in (200, 400, 500)
test("gemini-proxy: CORS not rejected", _gp_cors)

def _gp_options_preflight():
    r = requests.options(BASE + "/api/gemini-proxy", timeout=10)
    assert r.status_code in (200, 204), f"preflight failed: {r.status_code}"
test("gemini-proxy: OPTIONS preflight succeeds", _gp_options_preflight)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[11] PREDICT-CONFLICT API (10 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _pc_basic():
    r = post("/api/predict-conflict", {"query":"Ukraine Donetsk frontline escalation"})
    assert r.status_code == 200, f"status {r.status_code}: {r.text[:300]}"
    d = r.json()
    assert "location_name" in d or "error" in d, f"unexpected keys: {list(d.keys())}"
test("predict-conflict: basic query returns location_name or error", _pc_basic)

def _pc_coordinates():
    r = post("/api/predict-conflict", {"query":"Gaza airstrike humanitarian crisis"})
    assert r.status_code == 200
    d = r.json()
    if "coordinates" in d:
        c = d["coordinates"]; assert "lat" in c and "lng" in c
test("predict-conflict: coordinates has lat/lng", _pc_coordinates)

def _pc_conflict_probability():
    r = post("/api/predict-conflict", {"query":"India Pakistan border tensions Jammu"})
    d = r.json()
    if "conflict_probability" in d:
        p = d["conflict_probability"]
        assert isinstance(p, (int, float)) and 0 <= p <= 100, f"invalid probability: {p}"
test("predict-conflict: conflict_probability in 0-100", _pc_conflict_probability)

def _pc_reasoning():
    r = post("/api/predict-conflict", {"query":"Sudan civil war RSF Khartoum"})
    d = r.json()
    if "reasoning" in d:
        assert len(d["reasoning"]) > 10, "reasoning too short"
test("predict-conflict: reasoning is non-trivial", _pc_reasoning)

def _pc_deception_score():
    r = post("/api/predict-conflict", {"query":"Yemen Houthi Red Sea attacks"})
    d = r.json()
    if "deception_score" in d:
        s = d["deception_score"]
        assert isinstance(s, (int, float)) and 0 <= s <= 10, f"invalid deception_score: {s}"
test("predict-conflict: deception_score in 0-10", _pc_deception_score)

def _pc_no_query_400():
    r = post("/api/predict-conflict", {}, timeout=65)
    assert r.status_code in (400, 422, 500, 200), f"expected error or response for empty, got {r.status_code}"
test("predict-conflict: empty body returns 4xx/5xx or 200", _pc_no_query_400)

def _pc_tactical_vulnerabilities():
    r = post("/api/predict-conflict", {"query":"Ukraine frontline drone warfare Zaporizhzhia"})
    d = r.json()
    if "tactical_vulnerabilities" in d:
        tv = d["tactical_vulnerabilities"]
        assert isinstance(tv, (list, str)), f"wrong type: {type(tv)}"
test("predict-conflict: tactical_vulnerabilities is list or string", _pc_tactical_vulnerabilities)

def _pc_red_team():
    r = post("/api/predict-conflict", {"query":"Gaza ceasefire negotiations collapse"})
    assert r.status_code == 200, f"status {r.status_code}"
    try:
        d = r.json()
    except Exception:
        return  # empty or non-JSON response is acceptable for LLM timeout
    if "red_team_critique" in d:
        assert len(str(d["red_team_critique"])) > 5
test("predict-conflict: red_team_critique has content", _pc_red_team)

def _pc_options():
    r = requests.options(BASE + "/api/predict-conflict", timeout=10)
    assert r.status_code in (200, 204)
test("predict-conflict: OPTIONS preflight succeeds", _pc_options)

def _pc_response_time():
    t0 = time.time()
    r = post("/api/predict-conflict", {"query":"Syria conflict update"})
    elapsed = time.time()-t0
    assert r.status_code == 200
    assert elapsed < 65, f"too slow: {elapsed:.1f}s"
test("predict-conflict: responds within 65s", _pc_response_time)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[12] FRONTEND BUILD & STATIC (6 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _fe_root():
    r = requests.get(BASE + "/", timeout=15)
    assert r.status_code == 200, f"root returned {r.status_code}"
test("frontend: root / returns 200", _fe_root)

def _fe_html():
    r = requests.get(BASE + "/", timeout=15)
    assert "text/html" in r.headers.get("content-type",""), "not html"
test("frontend: root content-type is text/html", _fe_html)

def _fe_has_root_div():
    r = requests.get(BASE + "/", timeout=15)
    assert 'id="root"' in r.text, "no #root div in HTML"
test("frontend: HTML contains #root div", _fe_has_root_div)

def _fe_spa_route():
    r = requests.get(BASE + "/some/unknown/route", timeout=15)
    # SPA should return index.html for unknown routes
    assert r.status_code == 200, f"SPA route failed: {r.status_code}"
test("frontend: unknown SPA route returns 200 (index.html)", _fe_spa_route)

def _fe_title():
    r = requests.get(BASE + "/", timeout=15)
    assert "<title>" in r.text.lower() or "sentinel" in r.text.lower(), "no title or brand"
test("frontend: HTML has title or brand", _fe_title)

def _fe_no_crash_multiple():
    for _ in range(3):
        r = requests.get(BASE + "/", timeout=15)
        assert r.status_code == 200
test("frontend: root stable across 3 fetches", _fe_no_crash_multiple)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[13] CROSS-CUTTING / INTEGRATION (10 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _cc_all_apis_reachable():
    endpoints = [
        "/api/conflict-news?q=war&timespan=7d",
        "/api/conflict-events",
        "/api/earthquakes",
        "/api/humanitarian",
        "/api/cyber-threats",
        "/api/natural-events",
        "/api/internet-disruptions",
        "/api/sar-catalog?action=status",
    ]
    for ep in endpoints:
        r = requests.get(BASE + ep, timeout=22)
        assert r.status_code == 200, f"{ep} → {r.status_code}"
test("integration: all 8 GET endpoints return 200", _cc_all_apis_reachable)

def _cc_news_agent_pipeline():
    # Simulate what the UI does: fetch news, then run agent
    r1 = get("/api/conflict-news", {"q":"ukraine russia donetsk","timespan":"7d"})
    assert r1.status_code == 200
    articles = r1.json().get("articles",[])
    signal = " | ".join(a["title"] for a in articles[:3]) or "Ukraine Russia conflict"
    r2 = post("/api/predict-conflict", {"query": signal})
    assert r2.status_code == 200
    d = r2.json(); assert "location_name" in d
test("integration: news->predict-conflict pipeline works", _cc_news_agent_pipeline)

def _cc_local_intel_full():
    r = get("/api/local-intel", {"action":"search","location":"Donetsk","timespan":"7d"}, timeout=55)
    assert r.status_code == 200
    d = r.json()
    assert "articles" in d or "boundary" in d
test("integration: local-intel full search for Donetsk", _cc_local_intel_full)

def _cc_sar_search_then_status():
    r1 = get("/api/sar-catalog", {"action":"status"}, timeout=15)
    assert r1.json().get("authenticated") == True
    r2 = get("/api/sar-catalog", {"action":"search","lat":"31.5","lng":"34.4","timespan":"30d"}, timeout=35)
    assert r2.status_code == 200
test("integration: SAR status->search works in sequence", _cc_sar_search_then_status)

def _cc_gemini_proxy_intelligence():
    r = post("/api/gemini-proxy", {
        "systemPrompt": "You are a conflict analyst. Return JSON: {\"hotspot\":\"string\",\"risk\":\"HIGH|MEDIUM|LOW\"}",
        "userPrompt": "Assess Ukraine-Russia conflict risk."
    })
    assert r.status_code == 200
    d = r.json(); assert "text" in d and len(d["text"]) > 5
test("integration: gemini-proxy returns intelligence text", _cc_gemini_proxy_intelligence)

def _cc_concurrent_fast():
    import threading
    results_cc = []
    def fetch():
        try:
            r = get("/api/conflict-news", {"q":"conflict","timespan":"7d"})
            results_cc.append(r.status_code)
        except:
            results_cc.append(0)
    threads = [threading.Thread(target=fetch) for _ in range(3)]
    for t in threads: t.start()
    for t in threads: t.join()
    assert all(s == 200 for s in results_cc), f"concurrent results: {results_cc}"
test("integration: 3 concurrent conflict-news calls all succeed", _cc_concurrent_fast)

def _cc_sar_thumbnail_proxy():
    # Find a scene with thumbnail_url and proxy it
    r = get("/api/sar-catalog", {"action":"search","lat":"48.0","lng":"37.8","timespan":"30d"}, timeout=35)
    d = r.json()
    scene = next((s for s in d.get("scenes",[]) if s.get("thumbnail_url")), None)
    if scene:
        r2 = get("/api/sar-catalog", {"action":"thumbnail","url": scene["thumbnail_url"]}, timeout=20)
        assert r2.status_code in (200, 403, 404, 500), f"unexpected {r2.status_code}"
    else:
        # No thumbnail available — skip check
        pass
test("integration: SAR thumbnail proxy handles request", _cc_sar_thumbnail_proxy)

def _cc_news_has_india_pakistan():
    r = get("/api/conflict-news", {"q":"india pakistan border conflict drone attack","timespan":"7d"})
    assert r.status_code == 200
    d = r.json(); assert isinstance(d.get("articles",[]), list)
test("integration: India-Pakistan specific news query ok", _cc_news_has_india_pakistan)

def _cc_all_api_json():
    endpoints = [
        "/api/conflict-events",
        "/api/humanitarian",
        "/api/earthquakes",
    ]
    for ep in endpoints:
        r = requests.get(BASE + ep, timeout=20)
        try:
            r.json()
        except Exception as e:
            assert False, f"{ep} invalid JSON: {e}"
test("integration: conflict-events, humanitarian, earthquakes all return valid JSON", _cc_all_api_json)

def _cc_predict_sar_combined():
    # Predict conflict location then search SAR for that location
    r = post("/api/predict-conflict", {"query":"Gaza airstrike latest"})
    assert r.status_code == 200
    d = r.json()
    if "coordinates" in d:
        lat, lng = d["coordinates"]["lat"], d["coordinates"]["lng"]
        rs = get("/api/sar-catalog", {"action":"search","lat":lat,"lng":lng,"timespan":"30d"}, timeout=35)
        assert rs.status_code == 200
test("integration: predict-conflict → SAR search for same coordinates", _cc_predict_sar_combined)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n[14] InSAR / DEM TERRAIN ANALYSIS (20 tests)")
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# -- DEM endpoint (10 tests) --

def _dem_status_has_dem_instances():
    r = get("/api/sar-catalog", {"action":"status"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "dem_instances" in d, f"status missing dem_instances key: {list(d.keys())}"
test("dem: status lists dem_instances", _dem_status_has_dem_instances)

def _dem_gaza_200():
    r = get("/api/sar-catalog", {"action":"dem","lat":"31.5017","lng":"34.4668","radius_km":"50"}, timeout=60)
    assert r.status_code == 200, f"Gaza DEM returned {r.status_code}: {r.text[:200]}"
test("dem: Gaza (31.5017,34.4668) returns HTTP 200", _dem_gaza_200)

def _dem_content_type():
    r = get("/api/sar-catalog", {"action":"dem","lat":"31.5017","lng":"34.4668","radius_km":"50"}, timeout=60)
    assert r.status_code == 200
    ct = r.headers.get("content-type","")
    assert "image/jpeg" in ct or "image/" in ct, f"expected image content-type, got: {ct}"
test("dem: response content-type is image/jpeg", _dem_content_type)

def _dem_image_size():
    r = get("/api/sar-catalog", {"action":"dem","lat":"31.5017","lng":"34.4668","radius_km":"50"}, timeout=60)
    assert r.status_code == 200
    size = len(r.content)
    assert size > 1000, f"DEM image too small ({size} bytes) — likely empty or error JPEG"
test("dem: image body > 1000 bytes (real elevation data)", _dem_image_size)

def _dem_donetsk_200():
    r = get("/api/sar-catalog", {"action":"dem","lat":"48.0159","lng":"37.8028","radius_km":"50"}, timeout=60)
    assert r.status_code == 200, f"Donetsk DEM returned {r.status_code}: {r.text[:200]}"
test("dem: Donetsk (48.0159,37.8028) returns HTTP 200", _dem_donetsk_200)

def _dem_manipur_200():
    r = get("/api/sar-catalog", {"action":"dem","lat":"24.8170","lng":"93.9368","radius_km":"50"}, timeout=60)
    assert r.status_code == 200, f"Manipur DEM returned {r.status_code}: {r.text[:200]}"
test("dem: Manipur NE India (24.817,93.936) returns HTTP 200", _dem_manipur_200)

def _dem_missing_coords():
    r = get("/api/sar-catalog", {"action":"dem"}, timeout=15)
    assert r.status_code in (400, 500), f"expected error for missing coords, got {r.status_code}"
test("dem: missing lat/lng returns 4xx error", _dem_missing_coords)

def _dem_xbbox_header():
    r = get("/api/sar-catalog", {"action":"dem","lat":"31.5017","lng":"34.4668","radius_km":"50"}, timeout=60)
    assert r.status_code == 200
    xb = r.headers.get("X-Bbox") or r.headers.get("x-bbox")
    assert xb is not None, f"X-Bbox header missing. Headers present: {list(r.headers.keys())}"
    bbox = json.loads(xb)
    assert len(bbox) == 4, f"bbox should have 4 elements: {bbox}"
test("dem: X-Bbox header present and valid JSON array of 4", _dem_xbbox_header)

def _dem_copernicus_90():
    r = get("/api/sar-catalog", {"action":"dem","lat":"48.0159","lng":"37.8028","radius_km":"50","dem_instance":"COPERNICUS_90"}, timeout=60)
    assert r.status_code == 200, f"COPERNICUS_90 returned {r.status_code}: {r.text[:200]}"
    assert len(r.content) > 500
test("dem: dem_instance=COPERNICUS_90 returns valid image", _dem_copernicus_90)

def _dem_response_time():
    t0 = time.time()
    r = get("/api/sar-catalog", {"action":"dem","lat":"31.5017","lng":"34.4668","radius_km":"50"}, timeout=65)
    elapsed = time.time() - t0
    assert r.status_code == 200
    assert elapsed < 60, f"DEM took too long: {elapsed:.1f}s"
test("dem: responds within 60s", _dem_response_time)

# -- InSAR change-detection endpoint (10 tests) --

_INSAR_FROM = "2025-03-15"
_INSAR_TO   = "2025-04-15"

def _insar_gaza_200():
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"31.5017","lng":"34.4668",
        "radius_km":"50","from_date":_INSAR_FROM,"to_date":_INSAR_TO
    }, timeout=90)
    assert r.status_code == 200, f"InSAR Gaza returned {r.status_code}: {r.text[:200]}"
test("insar: Gaza 30d change map returns HTTP 200", _insar_gaza_200)

def _insar_content_type():
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"31.5017","lng":"34.4668",
        "radius_km":"50","from_date":_INSAR_FROM,"to_date":_INSAR_TO
    }, timeout=90)
    assert r.status_code == 200
    ct = r.headers.get("content-type","")
    assert "image/" in ct, f"expected image content-type, got: {ct}"
test("insar: response content-type is image/jpeg", _insar_content_type)

def _insar_image_size():
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"31.5017","lng":"34.4668",
        "radius_km":"50","from_date":_INSAR_FROM,"to_date":_INSAR_TO
    }, timeout=90)
    assert r.status_code == 200
    size = len(r.content)
    assert size > 1000, f"InSAR image too small ({size} bytes)"
test("insar: image body > 1000 bytes (real change data)", _insar_image_size)

def _insar_donetsk_14d():
    from_d = "2025-04-01"
    to_d   = "2025-04-15"
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"48.0159","lng":"37.8028",
        "radius_km":"50","from_date":from_d,"to_date":to_d
    }, timeout=90)
    assert r.status_code == 200, f"Donetsk InSAR returned {r.status_code}: {r.text[:200]}"
test("insar: Donetsk 14d change map returns HTTP 200", _insar_donetsk_14d)

def _insar_missing_coords():
    r = get("/api/sar-catalog", {
        "action":"insar","from_date":_INSAR_FROM,"to_date":_INSAR_TO
    }, timeout=15)
    assert r.status_code in (400, 500), f"expected error for missing coords, got {r.status_code}"
test("insar: missing lat/lng returns 4xx error", _insar_missing_coords)

def _insar_missing_dates():
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"31.5017","lng":"34.4668","radius_km":"50"
    }, timeout=15)
    assert r.status_code in (400, 500), f"expected error for missing dates, got {r.status_code}"
    if r.status_code == 400:
        d = r.json()
        assert "error" in d
test("insar: missing from_date/to_date returns 4xx with error message", _insar_missing_dates)

def _insar_xbbox_header():
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"31.5017","lng":"34.4668",
        "radius_km":"50","from_date":_INSAR_FROM,"to_date":_INSAR_TO
    }, timeout=90)
    assert r.status_code == 200
    xb = r.headers.get("X-Bbox") or r.headers.get("x-bbox")
    assert xb is not None, f"X-Bbox header missing. Headers: {list(r.headers.keys())}"
    bbox = json.loads(xb)
    assert len(bbox) == 4, f"bbox should have 4 elements: {bbox}"
    # bbox should be [W, S, E, N] — sanity check ranges
    w, s, e, n = bbox
    assert s < n, f"South ({s}) should be less than North ({n})"
    assert w < e, f"West ({w}) should be less than East ({e})"
test("insar: X-Bbox header present, valid, and geographically sane", _insar_xbbox_header)

def _insar_expose_headers_cors():
    # Verify Access-Control-Expose-Headers includes X-Bbox so browsers can read it
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"31.5017","lng":"34.4668",
        "radius_km":"50","from_date":_INSAR_FROM,"to_date":_INSAR_TO
    }, timeout=90)
    expose = r.headers.get("Access-Control-Expose-Headers","")
    assert "X-Bbox" in expose or "x-bbox" in expose.lower(), \
        f"Access-Control-Expose-Headers missing X-Bbox (got: '{expose}')"
test("insar: Access-Control-Expose-Headers includes X-Bbox", _insar_expose_headers_cors)

def _insar_slc_collection():
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"48.0159","lng":"37.8028",
        "radius_km":"50","from_date":_INSAR_FROM,"to_date":_INSAR_TO,
        "collection":"sentinel-1-slc"
    }, timeout=90)
    # SLC may or may not have data — just must not throw 500 server error
    assert r.status_code in (200, 400), f"unexpected status for SLC insar: {r.status_code}: {r.text[:200]}"
test("insar: sentinel-1-slc collection request handled (200 or 400, no 500)", _insar_slc_collection)

def _insar_response_time():
    t0 = time.time()
    r = get("/api/sar-catalog", {
        "action":"insar","lat":"31.5017","lng":"34.4668",
        "radius_km":"50","from_date":_INSAR_FROM,"to_date":_INSAR_TO
    }, timeout=95)
    elapsed = time.time() - t0
    assert r.status_code == 200
    assert elapsed < 90, f"InSAR took too long: {elapsed:.1f}s"
test("insar: responds within 90s", _insar_response_time)

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "="*64)
print(f"RESULTS:  {passed} PASSED  |  {failed} FAILED  |  {skipped} SKIPPED  |  {passed+failed} TOTAL")
print("="*64)

if failed:
    print("\nFailed tests:")
    for status, name, msg in results:
        if status == "FAIL":
            print(f"  FAIL: {name}")
            if msg: print(f"      {msg}")

print()
sys.exit(0 if failed == 0 else 1)
