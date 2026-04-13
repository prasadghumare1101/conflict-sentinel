"""
predictor.py — Local ML conflict predictor
Uses scikit-learn (TF-IDF + RandomForest) to assess threat level and
predict next-window activity from scraped news text.
Saves / loads model weights from ../models/predictor.pkl.
"""
import os, json, pickle
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE      = os.path.dirname(__file__)
MODEL_DIR  = os.path.join(_HERE, '..', 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'predictor.pkl')
LEVEL_PATH = os.path.join(MODEL_DIR, 'intel_level.json')
COUNT_PATH = os.path.join(MODEL_DIR, 'pred_count.json')

# ── Bootstrap training data (seed corpus) ─────────────────────────────────────
# Labels: 0=LOW, 1=MODERATE, 2=HIGH, 3=CRITICAL
_SEED = [
    ("peace talks ceasefire negotiations diplomat agreement", 0),
    ("military drill exercise training war games", 0),
    ("economic sanctions trade restriction embargo", 0),
    ("protest demonstration civil unrest peaceful march", 1),
    ("election political tension opposition rivalry", 1),
    ("naval patrol maritime exercises warship deployment", 1),
    ("troops movement border military vehicles convoy", 2),
    ("cyber attack hack critical infrastructure breach", 2),
    ("refugee displacement humanitarian crisis civilian", 2),
    ("military buildup armor deployment reinforcement", 2),
    ("assassination political killing targeted murder", 2),
    ("airstrike bombing casualties explosion killed", 3),
    ("missile launch rocket attack ballistic barrage", 3),
    ("artillery shelling frontline combat offensive", 3),
    ("terror attack bomb explosion mass casualties", 3),
    ("drone strike UAV FPV attack precision strike", 3),
    ("ground assault infantry advance urban combat", 3),
    ("chemical weapon mass destruction biological", 3),
]

# ── Direction keywords ────────────────────────────────────────────────────────
_DIR_KWS = {
    "North":     ["north", "northern", "northward", "toward north"],
    "South":     ["south", "southern", "southward", "toward south"],
    "East":      ["east",  "eastern",  "eastward",  "toward east"],
    "West":      ["west",  "western",  "westward",  "toward west"],
    "Northeast": ["northeast", "northeastern"],
    "Southeast": ["southeast", "southeastern"],
    "Southwest": ["southwest", "southwestern"],
    "Northwest": ["northwest", "northwestern"],
}

# ── Hotspot location keywords ─────────────────────────────────────────────────
_HOTSPOT_KWS = [
    "border", "capital", "city", "district", "valley", "highway",
    "base", "port", "bridge", "checkpoint", "airfield", "depot",
]


class ConflictPredictor:
    """Sklearn-backed conflict predictor with online fine-tuning."""

    def __init__(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        self.model: Pipeline = self._load_or_create()
        self.intelligence_level: float = self._load_intel_level()
        self._training_buffer: list[tuple[str, int]] = list(_SEED)

    # ── Model persistence ──────────────────────────────────────────────────────

    def _load_or_create(self) -> Pipeline:
        if os.path.exists(MODEL_PATH):
            try:
                with open(MODEL_PATH, 'rb') as f:
                    return pickle.load(f)
            except Exception:
                pass
        return self._create_and_save()

    def _create_and_save(self) -> Pipeline:
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2), max_features=600, sublinear_tf=True)),
            ('clf',   RandomForestClassifier(n_estimators=80, random_state=42, class_weight='balanced')),
        ])
        texts  = [t for t, _ in _SEED]
        labels = [l for _, l in _SEED]
        pipeline.fit(texts, labels)
        self._save_model(pipeline)
        return pipeline

    def _save_model(self, model=None):
        with open(MODEL_PATH, 'wb') as f:
            pickle.dump(model or self.model, f)

    # ── Intel-level persistence ───────────────────────────────────────────────

    def _load_intel_level(self) -> float:
        try:
            with open(LEVEL_PATH, 'r') as f:
                return float(json.load(f).get('level', 1.0))
        except Exception:
            return 1.0

    def _save_intel_level(self):
        with open(LEVEL_PATH, 'w') as f:
            json.dump({'level': round(self.intelligence_level, 2)}, f)

    # ── Prediction count ──────────────────────────────────────────────────────

    def _get_and_inc_count(self) -> int:
        try:
            with open(COUNT_PATH, 'r') as f:
                count = int(json.load(f).get('count', 0))
        except Exception:
            count = 0
        count += 1
        with open(COUNT_PATH, 'w') as f:
            json.dump({'count': count}, f)
        return count

    # ── Core prediction ───────────────────────────────────────────────────────

    def predict(self, news_texts: list[str], location_name: str = "") -> dict:
        """Return structured prediction dict from a list of headline strings."""
        if not news_texts:
            return self._default_prediction(location_name)

        combined = " ".join(news_texts)

        try:
            level_pred = int(self.model.predict([combined])[0])
            proba      = self.model.predict_proba([combined])[0]
            confidence = float(max(proba))
        except Exception:
            level_pred, confidence = 1, 0.45

        risk_labels  = ["LOW", "MODERATE", "HIGH", "CRITICAL"]
        risk_level   = risk_labels[min(level_pred, 3)]
        activity_prob = min(0.97, confidence * (0.45 + level_pred * 0.14))
        timeframe    = [90, 60, 45, 30][level_pred]

        return {
            "activity_probability": round(activity_prob, 2),
            "risk_level":           risk_level,
            "confidence":           round(confidence, 2),
            "predicted_direction":  self._detect_direction(combined),
            "timeframe_minutes":    timeframe,
            "hotspot_areas":        self._extract_hotspots(news_texts),
            "intelligence_level":   self.intelligence_level,
            "predictions_made":     self._get_and_inc_count(),
        }

    # ── Online learning ───────────────────────────────────────────────────────

    def update(self, text: str, actual_label: int, reward: float):
        """Incremental fine-tune: buffer the new sample and retrain on last 80."""
        self._training_buffer.append((text, actual_label))
        buf = self._training_buffer[-80:]
        texts  = [t for t, _ in buf]
        labels = [l for _, l in buf]
        try:
            self.model.fit(texts, labels)
            self._save_model()
        except Exception:
            pass
        # Adjust intelligence level
        if reward > 0:
            self.intelligence_level = min(100.0, self.intelligence_level + 0.5 * reward)
        else:
            self.intelligence_level = max(1.0, self.intelligence_level + 0.2 * reward)
        self._save_intel_level()

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _detect_direction(self, text: str) -> str:
        tl = text.lower()
        scores = {d: sum(1 for kw in kws if kw in tl) for d, kws in _DIR_KWS.items()}
        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else "Undetermined"

    def _extract_hotspots(self, texts: list[str]) -> list[str]:
        hotspots = []
        for text in texts[:6]:
            tl = text.lower()
            for kw in _HOTSPOT_KWS:
                if kw in tl and len(hotspots) < 4:
                    idx     = tl.find(kw)
                    snippet = text[max(0, idx - 18):idx + 28].strip()
                    if snippet and snippet not in hotspots:
                        hotspots.append(snippet)
        return hotspots[:3] if hotspots else ["Primary activity zone", "Secondary transit corridor"]

    def _default_prediction(self, location_name: str) -> dict:
        return {
            "activity_probability": 0.25,
            "risk_level":           "LOW",
            "confidence":           0.35,
            "predicted_direction":  "Undetermined",
            "timeframe_minutes":    90,
            "hotspot_areas":        ["No data available — fetch news first"],
            "intelligence_level":   self.intelligence_level,
            "predictions_made":     0,
        }


# ── Module-level singleton ────────────────────────────────────────────────────
_instance: ConflictPredictor | None = None

def get_predictor() -> ConflictPredictor:
    global _instance
    if _instance is None:
        _instance = ConflictPredictor()
    return _instance
