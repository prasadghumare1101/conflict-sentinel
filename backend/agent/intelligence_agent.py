"""
intelligence_agent.py — Local Intelligence Agent
Entry-point script called via subprocess from server.js.

Usage:
  python intelligence_agent.py predict   <location>
  python intelligence_agent.py history   <location>  [limit]
  python intelligence_agent.py status

Keeps running state in SQLite (../models/intel_history.db).
Background loop is NOT run here — the Node server calls this script
every 2 minutes via setInterval (configured in server.js).
"""
import os, sys, json, sqlite3, io, time
from datetime import datetime, timezone

# Force UTF-8 to avoid Windows charmap errors
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
except ImportError:
    pass

# ── Relative imports need the package to be importable ────────────────────────
_parent = os.path.dirname(os.path.dirname(__file__))
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from agent.predictor  import get_predictor
from agent.rl_trainer import get_rl_trainer

import requests

# ── DB path ───────────────────────────────────────────────────────────────────
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
DB_PATH   = os.path.join(MODEL_DIR, 'intel_history.db')


def _ensure_db():
    os.makedirs(MODEL_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS predictions (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp            TEXT,
        location             TEXT,
        activity_probability REAL,
        risk_level           TEXT,
        confidence           REAL,
        direction            TEXT,
        timeframe            INTEGER,
        hotspots             TEXT,
        rl_action            TEXT,
        intel_level          REAL,
        articles_count       INTEGER
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS news_cache (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        location  TEXT,
        fetched   TEXT,
        expires   TEXT,
        articles  TEXT
    )''')
    conn.commit()
    conn.close()


def _load_cached_news(location: str) -> list | None:
    """Return cached articles if not expired (1-hour TTL)."""
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute('SELECT articles, expires FROM news_cache WHERE location=? ORDER BY id DESC LIMIT 1', (location,))
    row  = c.fetchone()
    conn.close()
    if not row:
        return None
    try:
        expires = datetime.fromisoformat(row[1])
        if datetime.now(timezone.utc) < expires.replace(tzinfo=timezone.utc):
            return json.loads(row[0])
    except Exception:
        pass
    return None


def _cache_news(location: str, articles: list):
    from datetime import timedelta
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    conn    = sqlite3.connect(DB_PATH)
    c       = conn.cursor()
    c.execute('INSERT INTO news_cache (location, fetched, expires, articles) VALUES (?,?,?,?)',
              (location, datetime.now(timezone.utc).isoformat(), expires, json.dumps(articles)))
    conn.commit()
    conn.close()


def _fetch_gdelt_news(location: str) -> list:
    """Fetch from GDELT with 3-query fallback, 1-hour cache."""
    cached = _load_cached_news(location)
    if cached is not None:
        return cached

    queries = [
        f'"{location}" conflict military attack',
        f'{location} troops tension border',
        f'{location} violence crisis',
    ]
    for q in queries:
        try:
            url  = (f'https://api.gdeltproject.org/api/v2/doc/doc'
                    f'?query={requests.utils.quote(q)}+sourcelang:eng'
                    f'&mode=artlist&maxrecords=20&format=json&timespan=24h&sort=DateDesc')
            resp = requests.get(url, timeout=12)
            arts = resp.json().get('articles', [])
            if len(arts) >= 3:
                _cache_news(location, arts)
                return arts
            time.sleep(0.8)
        except Exception:
            time.sleep(0.8)
    _cache_news(location, [])
    return []


def _save_prediction(pred: dict):
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute('''INSERT INTO predictions
        (timestamp, location, activity_probability, risk_level, confidence,
         direction, timeframe, hotspots, rl_action, intel_level, articles_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
        (pred['timestamp'], pred['location'],
         pred['activity_probability'], pred['risk_level'], pred['confidence'],
         pred['predicted_direction'],  pred['timeframe_minutes'],
         json.dumps(pred['hotspot_areas']),
         pred.get('rl_action', 'keep'),
         pred['intelligence_level'],
         pred.get('articles_analyzed', 0)))
    conn.commit()
    conn.close()


def _load_last_prediction(location: str) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute('SELECT * FROM predictions WHERE location=? ORDER BY id DESC LIMIT 1', (location,))
    row  = c.fetchone()
    conn.close()
    if not row:
        return None
    cols = ['id','timestamp','location','activity_probability','risk_level',
            'confidence','direction','timeframe','hotspots','rl_action','intel_level','articles_count']
    d = dict(zip(cols, row))
    d['hotspot_areas']       = json.loads(d.pop('hotspots', '[]'))
    d['predicted_direction'] = d.pop('direction')
    d['timeframe_minutes']   = d.pop('timeframe')
    return d


# ── Calculate reward between two consecutive predictions ─────────────────────

def _calc_reward(old: dict, new: dict) -> float:
    risk_map = {"LOW": 0, "MODERATE": 1, "HIGH": 2, "CRITICAL": 3}
    old_r    = risk_map.get(old.get('risk_level', 'LOW'), 0)
    new_r    = risk_map.get(new.get('risk_level', 'LOW'), 0)
    diff     = abs(old_r - new_r)
    if diff == 0:   return  0.4   # stable — good
    if diff == 1:   return  0.2   # adjacent — acceptable
    return -0.3                   # big jump — penalty


# ── Actions ───────────────────────────────────────────────────────────────────

def cmd_predict(location: str) -> dict:
    """Fetch news → run predictor + RL → save → return JSON."""
    _ensure_db()

    predictor = get_predictor()
    rl        = get_rl_trainer()
    articles  = _fetch_gdelt_news(location)
    titles    = [a.get('title', '') for a in articles if a.get('title')]

    # RL: choose action based on last known state
    last     = _load_last_prediction(location)
    prev_risk = last['risk_level'] if last else 'LOW'
    hour      = datetime.now().hour
    action    = rl.choose_action(prev_risk, len(titles), hour)
    mult      = rl.get_confidence_multiplier(action)

    pred = predictor.predict(titles, location)
    pred['activity_probability'] = min(0.98, pred['activity_probability'] * mult)
    pred['confidence']           = min(0.98, pred['confidence'] * mult)
    pred['location']             = location
    pred['timestamp']            = datetime.now(timezone.utc).isoformat()
    pred['articles_analyzed']    = len(titles)
    pred['rl_action']            = ['Lowered confidence', 'Maintained confidence', 'Raised confidence'][action]
    pred['rl_stats']             = rl.get_stats()
    pred['articles']             = [{'title': a.get('title',''), 'url': a.get('url',''),
                                     'source': a.get('domain',''), 'date': a.get('seendate','')}
                                    for a in articles[:15]]

    # RL update from previous prediction
    if last:
        reward = _calc_reward(last, pred)
        rl.update(prev_risk, len(titles), hour,
                  action, reward,
                  pred['risk_level'], len(titles), hour)
        predictor.update(
            " ".join(titles[:6]),
            ["LOW","MODERATE","HIGH","CRITICAL"].index(pred['risk_level']),
            reward,
        )

    _save_prediction(pred)
    return pred


def cmd_history(location: str, limit: int = 20) -> list:
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute('SELECT * FROM predictions WHERE location=? ORDER BY id DESC LIMIT ?', (location, limit))
    rows = c.fetchall()
    conn.close()
    cols = ['id','timestamp','location','activity_probability','risk_level',
            'confidence','direction','timeframe','hotspots','rl_action','intel_level','articles_count']
    result = []
    for row in rows:
        d = dict(zip(cols, row))
        d['hotspot_areas']       = json.loads(d.pop('hotspots', '[]'))
        d['predicted_direction'] = d.pop('direction')
        d['timeframe_minutes']   = d.pop('timeframe')
        result.append(d)
    return result


def cmd_status() -> dict:
    _ensure_db()
    predictor = get_predictor()
    rl        = get_rl_trainer()
    conn      = sqlite3.connect(DB_PATH)
    c         = conn.cursor()
    c.execute('SELECT COUNT(*) FROM predictions')
    total_preds = c.fetchone()[0]
    c.execute('SELECT DISTINCT location FROM predictions ORDER BY id DESC LIMIT 5')
    recent_locs = [r[0] for r in c.fetchall()]
    conn.close()
    return {
        "intelligence_level": predictor.intelligence_level,
        "total_predictions":  total_preds,
        "recent_locations":   recent_locs,
        "rl_stats":           rl.get_stats(),
        "model_exists":       os.path.exists(os.path.join(MODEL_DIR, 'predictor.pkl')),
    }


# ── CLI entry-point ───────────────────────────────────────────────────────────

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        print(json.dumps({"error": "usage: intelligence_agent.py <predict|history|status> [location] [limit]"}))
        sys.exit(1)

    cmd = args[0].lower()

    try:
        if cmd == 'predict':
            location = args[1] if len(args) > 1 else 'Global'
            print(json.dumps(cmd_predict(location)))

        elif cmd == 'history':
            location = args[1] if len(args) > 1 else 'Global'
            limit    = int(args[2]) if len(args) > 2 else 20
            print(json.dumps(cmd_history(location, limit)))

        elif cmd == 'status':
            print(json.dumps(cmd_status()))

        else:
            print(json.dumps({"error": f"unknown command: {cmd}"}))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
