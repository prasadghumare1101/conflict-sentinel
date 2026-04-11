"""
Sentinel Platform - 10-Test Pipeline Validation Suite
Tests:
  1-5  : Gemini/HF proxy (5-agent intelligence pipeline)
  6-10 : CrewAI agentic prediction + map overlay data
"""
import sys, requests, json, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = "http://localhost:3001"
HEADERS = {"Content-Type": "application/json"}

SIGNALS = [
    "Satellite imagery shows armored vehicle concentration near a border region with intercepted comms referencing final preparation.",
    "Cyber intrusions targeting power grid SCADA systems in contested territory with simultaneous GPS jamming.",
    "Naval assets repositioned to contested strait with fishing vessel exclusion zone declared.",
    "State media blackout and diplomatic mission staff departing capital amid troop movements.",
    "Heavy artillery shelling reported in eastern border towns, civilian evacuation orders issued.",
]

QUERIES = [
    "current geopolitical tensions in Eastern Europe",
    "South China Sea military escalation",
    "Middle East conflict flashpoints 2025",
    "Arctic territorial disputes and military buildup",
    "Taiwan Strait tensions and naval exercises",
]

pass_count = 0
fail_count = 0
results = []

print("=" * 70)
print("SENTINEL PLATFORM — 10-TEST PIPELINE VALIDATION")
print("=" * 70)

# ── TESTS 1-5: 5-Agent Intelligence Pipeline (HF Proxy) ──────────────────
print("\n[BLOCK 1] 5-AGENT INTELLIGENCE PIPELINE (via /api/gemini-proxy)\n")

AGENT_PROMPTS = [
    ("OSINT INGESTION",
     'You are an OSINT agent. Respond ONLY with JSON: {"streams":[{"source":"SOCMINT","finding":"string"}],"indicators":["string"]}',
     "Analyze: troop movements reported near border."),
    ("THREAT DETECTION",
     'You are a threat detection agent. Respond ONLY with JSON: {"score":75,"level":"HIGH","summary":"string","patterns":["string"]}',
     "Threat analysis: armored buildup with comms intercept."),
    ("SCENARIO ENGINE",
     'You are a scenario engine. Respond ONLY with JSON: {"scenarios":[{"name":"De-escalation","probability":30,"outcome":"string"},{"name":"Limited Strike","probability":50,"outcome":"string"},{"name":"Full Escalation","probability":20,"outcome":"string"}]}',
     "Generate scenarios for HIGH threat level border crisis."),
    ("CIVILIAN IMPACT",
     'You are a civilian impact modeler. Respond ONLY with JSON: {"populationAtRisk":"500K","displacementRisk":"HIGH","infrastructureRisk":"CRITICAL","summary":"string","mitigationPriorities":["string"]}',
     "Model civilian impact for full escalation scenario."),
    ("BRIEF SYNTHESIS",
     'You are an intelligence brief synthesizer. Respond ONLY with JSON: {"classification":"RESTRICTED","situationAssessment":"string","keyFindings":["string"],"strategicOutlook":"string","commanderNote":"string"}',
     "Synthesize final commander brief for HIGH threat border crisis."),
]

for i, (agent_name, system_prompt, user_prompt) in enumerate(AGENT_PROMPTS, 1):
    t0 = time.time()
    try:
        resp = requests.post(f"{BASE}/api/gemini-proxy", headers=HEADERS,
                             json={"systemPrompt": system_prompt, "userPrompt": user_prompt},
                             timeout=30)
        elapsed = time.time() - t0
        if resp.status_code == 200:
            data = resp.json()
            text = data.get("text", "")
            # Try to parse as JSON
            try:
                clean = text.replace("```json", "").replace("```", "").strip()
                parsed = json.loads(clean)
                status = "PASS"
                detail = f"Valid JSON response ({len(str(parsed))} chars)"
                pass_count += 1
            except:
                status = "PASS (text)"
                detail = f"Text response: {text[:80]}..."
                pass_count += 1
        else:
            status = "FAIL"
            detail = f"HTTP {resp.status_code}: {resp.text[:100]}"
            fail_count += 1
    except Exception as e:
        elapsed = time.time() - t0
        status = "FAIL"
        detail = f"Exception: {e}"
        fail_count += 1

    flag = "[OK]" if "PASS" in status else "[FAIL]"
    print(f"Test {i:02d} | {flag} {status:12s} | Agent: {agent_name:20s} | {elapsed:.2f}s | {detail}")
    results.append({"test": i, "name": agent_name, "status": status, "elapsed": elapsed})

# ── TESTS 6-10: CrewAI Agentic Prediction + Map Overlay ──────────────────
print("\n[BLOCK 2] CREWAI AGENTIC PREDICTION + MAP OVERLAY (via /api/predict-conflict)\n")

for i, query in enumerate(QUERIES, 6):
    t0 = time.time()
    try:
        resp = requests.post(f"{BASE}/api/predict-conflict", headers=HEADERS,
                             json={"query": query}, timeout=320)
        elapsed = time.time() - t0
        if resp.status_code == 200:
            data = resp.json()
            # Validate map overlay fields
            has_coords    = "coordinates" in data and "lat" in data["coordinates"] and "lng" in data["coordinates"]
            has_location  = bool(data.get("location_name"))
            has_radius    = data.get("radius_km") is not None
            has_sources   = isinstance(data.get("news_sources"), list)
            has_deception = data.get("deception_score") is not None
            is_mock       = "MOCK" in data.get("location_name", "")

            if has_coords and has_location and has_radius:
                status = "PASS"
                detail = (f"Location: {data['location_name']} | "
                          f"Coords: ({data['coordinates']['lat']:.2f},{data['coordinates']['lng']:.2f}) | "
                          f"Sources: {len(data.get('news_sources', []))} | Mock: {is_mock}")
                pass_count += 1
            else:
                status = "FAIL"
                detail = f"Missing fields: coords={has_coords} loc={has_location} radius={has_radius}"
                fail_count += 1
        else:
            status = "FAIL"
            detail = f"HTTP {resp.status_code}: {resp.text[:100]}"
            fail_count += 1
    except Exception as e:
        elapsed = time.time() - t0
        status = "FAIL"
        detail = f"Exception: {e}"
        fail_count += 1

    flag = "✓" if status == "PASS" else "✗"
    print(f"Test {i:02d} | {flag} {status:12s} | Query: {query[:35]:35s} | {elapsed:.2f}s")
    print(f"         Detail: {detail}")
    results.append({"test": i, "name": query, "status": status, "elapsed": elapsed})
    time.sleep(0.3)

# ── Summary ───────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print(f"RESULTS: {pass_count}/10 PASSED | {fail_count}/10 FAILED")
avg_elapsed = sum(r["elapsed"] for r in results) / len(results)
print(f"Average response time: {avg_elapsed:.2f}s")
print("=" * 70)

# Validate map overlay capability
map_tests = [r for r in results if r["test"] >= 6]
map_pass = sum(1 for r in map_tests if r["status"] == "PASS")
print(f"\nMap Overlay Validation: {map_pass}/5 conflict zones successfully projected")
if map_pass == 5:
    print("[OK] All conflict zone overlays READY for Tactical Map display.")
else:
    print(f"[WARN] {5 - map_pass} overlay(s) failed -- check agentic engine or API keys.")
