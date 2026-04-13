"""
rl_trainer.py — Q-learning RL trainer for the Local Intelligence agent.
State  : (threat_level_idx, news_count_bucket, hour_bucket)  → 36 states
Action : 0=lower_confidence, 1=keep_confidence, 2=raise_confidence
Reward : accuracy of previous prediction vs new evidence
Weights saved to ../models/q_table.json + ../models/rl_meta.json.
"""
import os, json, random
import numpy as np

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE       = os.path.dirname(__file__)
MODEL_DIR   = os.path.join(_HERE, '..', 'models')
QTABLE_PATH = os.path.join(MODEL_DIR, 'q_table.json')
META_PATH   = os.path.join(MODEL_DIR, 'rl_meta.json')

# ── State space ───────────────────────────────────────────────────────────────
THREAT_LEVELS = ["LOW", "MODERATE", "HIGH", "CRITICAL"]   # 4
NEWS_BUCKETS  = [0, 5, 15]                                 # <5 | 5-14 | 15+  → 3
HOUR_BUCKETS  = [0, 8, 18]                                 # night | day | eve → 3
N_STATES      = 4 * 3 * 3   # = 36
N_ACTIONS     = 3

# Confidence multipliers per action
CONFIDENCE_MULT = {0: 0.82, 1: 1.00, 2: 1.18}


class RLTrainer:
    """Tabular Q-learning trainer."""

    def __init__(self):
        os.makedirs(MODEL_DIR, exist_ok=True)
        self.q_table      = self._load_q_table()
        meta              = self._load_meta()
        self.epsilon      = meta.get('epsilon',  0.20)
        self.episodes     = meta.get('episodes', 0)
        self.total_reward = meta.get('total_reward', 0.0)
        self.lr           = 0.12
        self.gamma        = 0.90

    # ── Persistence ───────────────────────────────────────────────────────────

    def _load_q_table(self) -> np.ndarray:
        if os.path.exists(QTABLE_PATH):
            try:
                with open(QTABLE_PATH, 'r') as f:
                    return np.array(json.load(f), dtype=float)
            except Exception:
                pass
        return np.zeros((N_STATES, N_ACTIONS))

    def _save_q_table(self):
        with open(QTABLE_PATH, 'w') as f:
            json.dump(self.q_table.tolist(), f)

    def _load_meta(self) -> dict:
        try:
            with open(META_PATH, 'r') as f:
                return json.load(f)
        except Exception:
            return {}

    def _save_meta(self):
        with open(META_PATH, 'w') as f:
            json.dump({
                'epsilon':      round(self.epsilon, 5),
                'episodes':     self.episodes,
                'total_reward': round(self.total_reward, 3),
            }, f)

    # ── State encoding ────────────────────────────────────────────────────────

    def _state(self, threat_level: str, news_count: int, hour: int) -> int:
        tl  = THREAT_LEVELS.index(threat_level) if threat_level in THREAT_LEVELS else 0
        nc  = 2 if news_count >= 15 else (1 if news_count >= 5 else 0)
        hr  = 2 if hour >= 18 else (1 if hour >= 8 else 0)
        return tl * 9 + nc * 3 + hr

    # ── ε-greedy action selection ─────────────────────────────────────────────

    def choose_action(self, threat_level: str, news_count: int, hour: int) -> int:
        """Return action index (0/1/2)."""
        if random.random() < self.epsilon:
            return random.randint(0, N_ACTIONS - 1)
        s = self._state(threat_level, news_count, hour)
        return int(np.argmax(self.q_table[s]))

    # ── Q-update step ─────────────────────────────────────────────────────────

    def update(
        self,
        threat: str, news_count: int, hour: int,
        action: int, reward: float,
        next_threat: str, next_count: int, next_hour: int,
    ):
        """Q(s,a) ← Q(s,a) + α[r + γ max Q(s',·) − Q(s,a)]"""
        s      = self._state(threat, news_count, hour)
        s_next = self._state(next_threat, next_count, next_hour)
        best   = float(np.max(self.q_table[s_next]))
        old    = self.q_table[s, action]
        self.q_table[s, action] = old + self.lr * (reward + self.gamma * best - old)

        self.episodes     += 1
        self.total_reward += reward
        self.epsilon       = max(0.04, self.epsilon * 0.9995)  # slow decay

        self._save_q_table()
        self._save_meta()

    # ── Helpers ───────────────────────────────────────────────────────────────

    def get_confidence_multiplier(self, action: int) -> float:
        return CONFIDENCE_MULT.get(action, 1.0)

    def get_stats(self) -> dict:
        return {
            "episodes":      self.episodes,
            "epsilon":       round(self.epsilon, 4),
            "total_reward":  round(self.total_reward, 2),
            "nonzero_cells": int(np.count_nonzero(self.q_table)),
            "q_max":         round(float(self.q_table.max()), 3),
        }


# ── Module-level singleton ────────────────────────────────────────────────────
_instance: RLTrainer | None = None

def get_rl_trainer() -> RLTrainer:
    global _instance
    if _instance is None:
        _instance = RLTrainer()
    return _instance
