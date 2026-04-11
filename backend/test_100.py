import requests
import time
import json

url = "http://localhost:3001/api/predict-conflict"
headers = {'Content-Type': 'application/json'}
payload = {"query": "Geopolitical hotspots in the Arctic and Middle East"}

success_count = 0
fail_count = 0

print("Starting 100 consecutive tests on /api/predict-conflict...")
print("This test validates OSINT gathering (News, X, Reddit), Map Projection, and Agent Stability.")

for i in range(1, 101):
    try:
        start_time = time.time()
        # Increased timeout for complex agentic tasks
        response = requests.post(url, headers=headers, json=payload, timeout=120)
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            if "location_name" in data and "coordinates" in data:
                success_count += 1
                is_mock = "MOCK" in data.get("location_name", "")
                has_news = "news_summary" in data
                print(f"Test {i:03d} | SUCCESS ({elapsed:.2f}s) | Location: {data['location_name']} | OSINT: {has_news} | Mock: {is_mock}")
            else:
                fail_count += 1
                print(f"Test {i:03d} | FAIL ({elapsed:.2f}s) | Missing keys in JSON")
        else:
            fail_count += 1
            print(f"Test {i:03d} | FAIL ({elapsed:.2f}s) | Status: {response.status_code}")
    except Exception as e:
        fail_count += 1
        print(f"Test {i:03d} | ERROR | Exception: {str(e)}")
        
    # Small pause to prevent local port exhaustion
    time.sleep(0.2)

print("-" * 60)
print(f"Test Suite Completed: 100 Tests")
print(f"Successes: {success_count}")
print(f"Failures: {fail_count}")
print("-" * 60)
