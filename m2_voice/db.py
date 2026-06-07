"""
db.py — SQLite 영속화 (MVP)
spec § 5 데이터 모델. 일기·프로필은 전체 JSON 페이로드로 저장해 스키마 변화에 유연.
필요해지면 aiosqlite로 교체. 지금은 동기 + per-call connection이 가장 단순·안전.
"""

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta

DB_PATH = os.getenv("AGITA_DB_PATH", "agita.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    age_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companions (
    user_id TEXT PRIMARY KEY,
    name TEXT DEFAULT '온',
    voice_id TEXT,
    intensity TEXT DEFAULT '다정',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_sec INTEGER,
    transcript TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_calls_user_started ON calls(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS diaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    payload TEXT NOT NULL,
    safety_flag INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_id) REFERENCES calls(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_diaries_user_date ON diaries(user_id, date DESC);

CREATE TABLE IF NOT EXISTS profiles (
    user_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS usage (
    user_id TEXT NOT NULL,
    month TEXT NOT NULL,
    minutes_used INTEGER DEFAULT 0,
    plan TEXT DEFAULT 'free',
    PRIMARY KEY (user_id, month),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """앱 시작 시 1회. 멱등."""
    with connect() as conn:
        conn.executescript(SCHEMA)


# ─── users / companions ─────────────────────────────────────────────────────

def ensure_user(user_id: str, name: str | None = None) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)",
            (user_id, name),
        )


def get_companion(user_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT name, voice_id, intensity FROM companions WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def upsert_companion(
    user_id: str,
    name: str = "온",
    voice_id: str | None = None,
    intensity: str = "다정",
) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO companions (user_id, name, voice_id, intensity, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                name = excluded.name,
                voice_id = excluded.voice_id,
                intensity = excluded.intensity,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, name, voice_id, intensity),
        )


# ─── calls ──────────────────────────────────────────────────────────────────

def start_call(user_id: str) -> str:
    call_id = str(uuid.uuid4())
    with connect() as conn:
        conn.execute(
            "INSERT INTO calls (id, user_id, started_at) VALUES (?, ?, ?)",
            (call_id, user_id, datetime.now().isoformat()),
        )
    return call_id


def end_call(call_id: str, transcript: str) -> int:
    """duration_sec 반환."""
    ended_at = datetime.now()
    with connect() as conn:
        row = conn.execute(
            "SELECT started_at FROM calls WHERE id = ?", (call_id,)
        ).fetchone()
        if not row:
            return 0
        started = datetime.fromisoformat(row["started_at"])
        duration = int((ended_at - started).total_seconds())
        conn.execute(
            "UPDATE calls SET ended_at = ?, duration_sec = ?, transcript = ? WHERE id = ?",
            (ended_at.isoformat(), duration, transcript, call_id),
        )
    return duration


# ─── diaries ────────────────────────────────────────────────────────────────

def save_diary(user_id: str, diary: dict, call_id: str | None = None) -> int:
    date = diary.get("date") or datetime.now().strftime("%Y-%m-%d")
    safety = 1 if diary.get("safety_flag") else 0
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO diaries (call_id, user_id, date, payload, safety_flag) VALUES (?, ?, ?, ?, ?)",
            (call_id, user_id, date, json.dumps(diary, ensure_ascii=False), safety),
        )
        return cur.lastrowid


def load_last_diary(user_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT payload FROM diaries WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 1",
            (user_id,),
        ).fetchone()
        return json.loads(row["payload"]) if row else None


def load_recent_diaries(user_id: str, days: int = 7) -> list[dict]:
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    with connect() as conn:
        rows = conn.execute(
            "SELECT payload FROM diaries WHERE user_id = ? AND date >= ? ORDER BY date DESC, id DESC",
            (user_id, cutoff),
        ).fetchall()
        return [json.loads(r["payload"]) for r in rows]


# ─── profiles ───────────────────────────────────────────────────────────────

def save_user_profile(user_id: str, profile: dict) -> None:
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO profiles (user_id, payload, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = CURRENT_TIMESTAMP
            """,
            (user_id, json.dumps(profile, ensure_ascii=False)),
        )


def load_user_profile(user_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            "SELECT payload FROM profiles WHERE user_id = ?", (user_id,)
        ).fetchone()
        return json.loads(row["payload"]) if row else None


# ─── usage (Phase 2 스텁) ───────────────────────────────────────────────────

def add_minutes(user_id: str, minutes: int) -> None:
    month = datetime.now().strftime("%Y-%m")
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO usage (user_id, month, minutes_used)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, month) DO UPDATE SET
                minutes_used = minutes_used + excluded.minutes_used
            """,
            (user_id, month, minutes),
        )
