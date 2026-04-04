# plugin.py
# Self-Reflection core logic — shared by hooks, routes, tools, and scheduled tasks.
# All database operations for corrections, reflections, learned rules, bulletin board, capsules.

import json
import logging
import sqlite3
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── Database Helpers ────────────────────────────────────────────────────────

def _find_goals_db():
    """Find goals.db regardless of install location."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "goals.db"
        if candidate.exists():
            return candidate
    return Path(__file__).parent.parent.parent / "user" / "goals.db"


def get_connection():
    """Open a WAL-mode connection to the goals database."""
    db_path = _find_goals_db()
    conn = sqlite3.connect(str(db_path), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def get_settings():
    """Read plugin settings with defaults."""
    try:
        from core.plugin_loader import plugin_loader
        return plugin_loader.get_plugin_settings("mission-control")
    except Exception:
        return {}


_tables_created = False

def ensure_tables():
    """Create self-reflection tables if they don't exist. Idempotent."""
    global _tables_created
    if _tables_created:
        return True

    db_path = _find_goals_db()
    if not db_path.exists():
        return False

    try:
        conn = get_connection()

        conn.execute('''
            CREATE TABLE IF NOT EXISTS corrections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_message TEXT NOT NULL,
                correction TEXT NOT NULL,
                category TEXT,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed DATETIME
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_corrections_scope ON corrections(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_corrections_created ON corrections(created_at)')
        # Migration: add last_accessed to existing tables
        try:
            conn.execute('ALTER TABLE corrections ADD COLUMN last_accessed DATETIME')
        except Exception:
            pass  # Column already exists

        conn.execute('''
            CREATE TABLE IF NOT EXISTS reflections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_context TEXT,
                what_worked TEXT,
                what_didnt TEXT,
                lesson TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_accessed DATETIME
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_reflections_scope ON reflections(scope)')
        try:
            conn.execute('ALTER TABLE reflections ADD COLUMN last_accessed DATETIME')
        except Exception:
            pass

        conn.execute('''
            CREATE TABLE IF NOT EXISTS learned_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'manual',
                vfm_score REAL DEFAULT 0.0,
                active INTEGER DEFAULT 1,
                times_seen INTEGER DEFAULT 1,
                first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_rules_scope ON learned_rules(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_rules_active ON learned_rules(active)')

        conn.execute('''
            CREATE TABLE IF NOT EXISTS bulletin_board (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_type TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                reason TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_bulletin_scope ON bulletin_board(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_bulletin_status ON bulletin_board(status)')

        conn.execute('''
            CREATE TABLE IF NOT EXISTS capsules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                problem_type TEXT NOT NULL,
                reasoning_pattern TEXT NOT NULL,
                success_count INTEGER DEFAULT 1,
                last_used DATETIME,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_capsules_scope ON capsules(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_capsules_type ON capsules(problem_type)')

        conn.execute('''
            CREATE TABLE IF NOT EXISTS calendar_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                start_date TEXT NOT NULL,
                end_date TEXT,
                all_day INTEGER DEFAULT 1,
                color TEXT DEFAULT '#4a9eff',
                category TEXT DEFAULT 'event',
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_calendar_scope ON calendar_events(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_date)')

        conn.commit()
        conn.close()
        _tables_created = True
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: table creation error: {e}")
        return False


# ─── Corrections ─────────────────────────────────────────────────────────────

def save_correction(user_message, correction, category=None, scope="default"):
    """Save a detected user correction."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO corrections (user_message, correction, category, scope) VALUES (?, ?, ?, ?)",
            (user_message[:2000], correction[:2000], category, scope)
        )
        conn.commit()
        cid = cursor.lastrowid
        conn.close()
        logger.debug(f"Self-Reflection: saved correction #{cid} [{category}]")
        return cid
    except Exception as e:
        logger.error(f"Self-Reflection: save_correction error: {e}")
        return None


def get_corrections(scope="default", limit=50, since_days=None):
    """Get corrections, optionally filtered by recency."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        if since_days:
            rows = conn.execute(
                "SELECT * FROM corrections WHERE scope IN (?, 'global') AND created_at >= datetime('now', ?) ORDER BY created_at DESC LIMIT ?",
                (scope, f"-{since_days} days", limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM corrections WHERE scope IN (?, 'global') ORDER BY created_at DESC LIMIT ?",
                (scope, limit)
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Self-Reflection: get_corrections error: {e}")
        return []


def delete_correction(correction_id):
    """Delete a correction by ID."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM corrections WHERE id = ?", (int(correction_id),))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: delete_correction error: {e}")
        return False


# ─── Reflections ─────────────────────────────────────────────────────────────

def save_reflection(task_context, what_worked, what_didnt, lesson, scope="default"):
    """Save a self-reflection entry."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO reflections (task_context, what_worked, what_didnt, lesson, scope) VALUES (?, ?, ?, ?, ?)",
            (task_context[:1000] if task_context else None,
             what_worked[:1000] if what_worked else None,
             what_didnt[:1000] if what_didnt else None,
             lesson[:2000], scope)
        )
        conn.commit()
        rid = cursor.lastrowid
        conn.close()
        logger.debug(f"Self-Reflection: saved reflection #{rid}")
        return rid
    except Exception as e:
        logger.error(f"Self-Reflection: save_reflection error: {e}")
        return None


def get_reflections(scope="default", limit=50):
    """Get reflections for a scope."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM reflections WHERE scope IN (?, 'global') ORDER BY created_at DESC LIMIT ?",
            (scope, limit)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Self-Reflection: get_reflections error: {e}")
        return []


def delete_reflection(reflection_id):
    """Delete a reflection by ID."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM reflections WHERE id = ?", (int(reflection_id),))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: delete_reflection error: {e}")
        return False


# ─── Learned Rules ───────────────────────────────────────────────────────────

def save_learned_rule(rule, source="manual", vfm_score=0.0, scope="default"):
    """Save a new learned rule."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO learned_rules (rule, source, vfm_score, active, times_seen, first_seen, last_seen, scope) VALUES (?, ?, ?, 1, 1, ?, ?, ?)",
            (rule[:2000], source, vfm_score, now, now, scope)
        )
        conn.commit()
        rid = cursor.lastrowid
        conn.close()
        logger.debug(f"Self-Reflection: saved rule #{rid} (source={source})")
        return rid
    except Exception as e:
        logger.error(f"Self-Reflection: save_learned_rule error: {e}")
        return None


def get_active_rules(scope="default", limit=20):
    """Get active learned rules for prompt injection."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM learned_rules WHERE active = 1 AND scope IN (?, 'global') ORDER BY vfm_score DESC, times_seen DESC LIMIT ?",
            (scope, limit)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Self-Reflection: get_active_rules error: {e}")
        return []


def get_all_rules(scope="default", limit=100):
    """Get all learned rules (active and inactive) for the UI."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM learned_rules WHERE scope IN (?, 'global') ORDER BY active DESC, vfm_score DESC, created_at DESC LIMIT ?",
            (scope, limit)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Self-Reflection: get_all_rules error: {e}")
        return []


def toggle_rule(rule_id, active):
    """Toggle a rule active/inactive."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("UPDATE learned_rules SET active = ? WHERE id = ?", (1 if active else 0, int(rule_id)))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: toggle_rule error: {e}")
        return False


def update_rule(rule_id, **fields):
    """Update a rule's fields."""
    if not ensure_tables():
        return False
    allowed = {"rule", "vfm_score", "active", "times_seen", "last_seen"}
    updates = []
    params = []
    for key, val in fields.items():
        if key in allowed:
            updates.append(f"{key} = ?")
            params.append(val)
    if not updates:
        return False
    try:
        conn = get_connection()
        params.append(int(rule_id))
        conn.execute(f"UPDATE learned_rules SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: update_rule error: {e}")
        return False


def delete_rule(rule_id):
    """Delete a learned rule."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM learned_rules WHERE id = ?", (int(rule_id),))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: delete_rule error: {e}")
        return False


def bump_rule(rule_id):
    """Increment times_seen and update last_seen for a rule."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "UPDATE learned_rules SET times_seen = times_seen + 1, last_seen = ? WHERE id = ?",
            (now, int(rule_id))
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: bump_rule error: {e}")
        return False


# ─── Bulletin Board ──────────────────────────────────────────────────────────

def save_bulletin(request_type, title, description=None, reason=None, scope="default"):
    """Create a new bulletin board request."""
    if not ensure_tables():
        return None
    valid_types = ("standing_order", "rule_promotion", "schedule", "capability")
    if request_type not in valid_types:
        logger.warning(f"Self-Reflection: invalid bulletin type '{request_type}'")
        return None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bulletin_board (request_type, title, description, reason, scope) VALUES (?, ?, ?, ?, ?)",
            (request_type, title[:200], description[:2000] if description else None,
             reason[:1000] if reason else None, scope)
        )
        conn.commit()
        bid = cursor.lastrowid
        conn.close()
        logger.debug(f"Self-Reflection: saved bulletin #{bid} ({request_type})")
        return bid
    except Exception as e:
        logger.error(f"Self-Reflection: save_bulletin error: {e}")
        return None


def get_bulletins(scope="default", status=None, limit=50):
    """Get bulletin board entries."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        if status:
            rows = conn.execute(
                "SELECT * FROM bulletin_board WHERE scope IN (?, 'global') AND status = ? ORDER BY created_at DESC LIMIT ?",
                (scope, status, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM bulletin_board WHERE scope IN (?, 'global') ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC LIMIT ?",
                (scope, limit)
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Self-Reflection: get_bulletins error: {e}")
        return []


def update_bulletin_status(bulletin_id, status):
    """Approve or deny a bulletin board request."""
    if status not in ("pending", "approved", "denied"):
        return False
    try:
        conn = get_connection()
        resolved = datetime.now().strftime("%Y-%m-%d %H:%M:%S") if status != "pending" else None
        conn.execute(
            "UPDATE bulletin_board SET status = ?, resolved_at = ? WHERE id = ?",
            (status, resolved, int(bulletin_id))
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: update_bulletin_status error: {e}")
        return False


def delete_bulletin(bulletin_id):
    """Delete a bulletin board entry."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM bulletin_board WHERE id = ?", (int(bulletin_id),))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: delete_bulletin error: {e}")
        return False


# ─── Capsules ────────────────────────────────────────────────────────────────

def save_capsule(problem_type, reasoning_pattern, scope="default"):
    """Save a successful reasoning pattern."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO capsules (problem_type, reasoning_pattern, success_count, last_used, scope) VALUES (?, ?, 1, ?, ?)",
            (problem_type[:200], reasoning_pattern[:2000], now, scope)
        )
        conn.commit()
        cid = cursor.lastrowid
        conn.close()
        logger.debug(f"Self-Reflection: saved capsule #{cid} ({problem_type})")
        return cid
    except Exception as e:
        logger.error(f"Self-Reflection: save_capsule error: {e}")
        return None


def get_capsules(scope="default", limit=50):
    """Get all capsules for a scope."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM capsules WHERE scope IN (?, 'global') ORDER BY success_count DESC, last_used DESC LIMIT ?",
            (scope, limit)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Self-Reflection: get_capsules error: {e}")
        return []


def get_relevant_capsules(problem_type=None, scope="default", limit=5):
    """Get most relevant capsules for prompt injection."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        if problem_type:
            rows = conn.execute(
                "SELECT * FROM capsules WHERE scope IN (?, 'global') AND problem_type LIKE ? ORDER BY success_count DESC, last_used DESC LIMIT ?",
                (scope, f"%{problem_type}%", limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM capsules WHERE scope IN (?, 'global') ORDER BY success_count DESC, last_used DESC LIMIT ?",
                (scope, limit)
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Self-Reflection: get_relevant_capsules error: {e}")
        return []


def increment_capsule(capsule_id):
    """Bump success count and last_used."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            "UPDATE capsules SET success_count = success_count + 1, last_used = ? WHERE id = ?",
            (now, int(capsule_id))
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: increment_capsule error: {e}")
        return False


def delete_capsule(capsule_id):
    """Delete a capsule."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM capsules WHERE id = ?", (int(capsule_id),))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: delete_capsule error: {e}")
        return False


# ─── Keep-Alive (Touch) ────────────────────────────────────────────────────

def touch_corrections(ids):
    """Reset retention timer on corrections the system still finds useful."""
    if not ids or not ensure_tables():
        return
    try:
        conn = get_connection()
        placeholders = ",".join("?" * len(ids))
        conn.execute(
            f"UPDATE corrections SET last_accessed = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
            [int(i) for i in ids]
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Self-Reflection: touch_corrections error: {e}")


def touch_reflections(ids):
    """Reset retention timer on reflections the system still finds useful."""
    if not ids or not ensure_tables():
        return
    try:
        conn = get_connection()
        placeholders = ",".join("?" * len(ids))
        conn.execute(
            f"UPDATE reflections SET last_accessed = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
            [int(i) for i in ids]
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Self-Reflection: touch_reflections error: {e}")


def touch_capsules(ids):
    """Reset retention timer on capsules that were injected into the prompt."""
    if not ids or not ensure_tables():
        return
    try:
        conn = get_connection()
        placeholders = ",".join("?" * len(ids))
        conn.execute(
            f"UPDATE capsules SET last_used = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
            [int(i) for i in ids]
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Self-Reflection: touch_capsules error: {e}")


# ─── Retention / Cleanup ────────────────────────────────────────────────────

# How long to keep data (in days)
RETENTION_DAYS = {
    "corrections": 30,       # Raw corrections — 30 days, patterns are extracted by then
    "reflections": 60,       # Reflections — 60 days
    "capsules": 90,          # Capsules — 90 days (longer, they're curated)
    "bulletins_resolved": 30 # Approved/denied bulletins — 30 days (pending kept forever)
}

def cleanup_old_data():
    """Purge data older than retention limits. Called by daily pattern scan."""
    if not ensure_tables():
        return {}
    try:
        conn = get_connection()
        deleted = {}

        # Corrections — only purge if BOTH created_at AND last_accessed are past retention
        # If last_accessed is set, the system found it useful and reset the timer
        days_c = f"-{RETENTION_DAYS['corrections']} days"
        cur = conn.execute(
            "DELETE FROM corrections WHERE created_at < datetime('now', ?) AND "
            "(last_accessed IS NULL OR last_accessed < datetime('now', ?))",
            (days_c, days_c)
        )
        deleted["corrections"] = cur.rowcount

        # Reflections — same keep-alive logic
        days_r = f"-{RETENTION_DAYS['reflections']} days"
        cur = conn.execute(
            "DELETE FROM reflections WHERE created_at < datetime('now', ?) AND "
            "(last_accessed IS NULL OR last_accessed < datetime('now', ?))",
            (days_r, days_r)
        )
        deleted["reflections"] = cur.rowcount

        # Capsules — kept alive by last_used (set when injected into prompt)
        days_cap = f"-{RETENTION_DAYS['capsules']} days"
        cur = conn.execute(
            "DELETE FROM capsules WHERE created_at < datetime('now', ?) AND "
            "(last_used IS NULL OR last_used < datetime('now', ?))",
            (days_cap, days_cap)
        )
        deleted["capsules"] = cur.rowcount

        # Resolved bulletins older than 30 days (pending ones stay)
        cur = conn.execute(
            "DELETE FROM bulletin_board WHERE status != 'pending' AND "
            "resolved_at IS NOT NULL AND resolved_at < datetime('now', ?)",
            (f"-{RETENTION_DAYS['bulletins_resolved']} days",)
        )
        deleted["bulletins"] = cur.rowcount

        conn.commit()
        conn.close()
        total = sum(deleted.values())
        if total > 0:
            logger.info(f"Self-Reflection cleanup: purged {deleted}")
        return deleted
    except Exception as e:
        logger.error(f"Self-Reflection: cleanup error: {e}")
        return {}


# ─── Stats ───────────────────────────────────────────────────────────────────

def get_reflection_stats(scope="default"):
    """Get counts for all self-reflection tables."""
    if not ensure_tables():
        return {"corrections": 0, "reflections": 0, "rules_active": 0, "rules_total": 0, "bulletins_pending": 0, "capsules": 0}
    try:
        conn = get_connection()
        stats = {}
        stats["corrections"] = conn.execute(
            "SELECT COUNT(*) as cnt FROM corrections WHERE scope IN (?, 'global')", (scope,)
        ).fetchone()["cnt"]
        stats["reflections"] = conn.execute(
            "SELECT COUNT(*) as cnt FROM reflections WHERE scope IN (?, 'global')", (scope,)
        ).fetchone()["cnt"]
        stats["rules_active"] = conn.execute(
            "SELECT COUNT(*) as cnt FROM learned_rules WHERE active = 1 AND scope IN (?, 'global')", (scope,)
        ).fetchone()["cnt"]
        stats["rules_total"] = conn.execute(
            "SELECT COUNT(*) as cnt FROM learned_rules WHERE scope IN (?, 'global')", (scope,)
        ).fetchone()["cnt"]
        stats["bulletins_pending"] = conn.execute(
            "SELECT COUNT(*) as cnt FROM bulletin_board WHERE status = 'pending' AND scope IN (?, 'global')", (scope,)
        ).fetchone()["cnt"]
        stats["capsules"] = conn.execute(
            "SELECT COUNT(*) as cnt FROM capsules WHERE scope IN (?, 'global')", (scope,)
        ).fetchone()["cnt"]
        conn.close()
        return stats
    except Exception as e:
        logger.error(f"Self-Reflection: get_reflection_stats error: {e}")
        return {"corrections": 0, "reflections": 0, "rules_active": 0, "rules_total": 0, "bulletins_pending": 0, "capsules": 0}


# ─── Calendar Events ────────────────────────────────────────────────────────

def save_calendar_event(title, start_date, end_date=None, description="", all_day=1, color="#4a9eff", category="event", scope="default"):
    """Save a calendar event."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO calendar_events (title, description, start_date, end_date, all_day, color, category, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (title[:500], description[:2000] if description else "", start_date, end_date or start_date, all_day, color, category, scope)
        )
        conn.commit()
        eid = cursor.lastrowid
        conn.close()
        return eid
    except Exception as e:
        logger.error(f"Calendar: save_event error: {e}")
        return None


def get_calendar_events(scope="default", start=None, end=None):
    """Get calendar events, optionally filtered by date range."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        if start and end:
            rows = conn.execute(
                "SELECT * FROM calendar_events WHERE scope IN (?, 'global') AND start_date <= ? AND (end_date >= ? OR end_date IS NULL) ORDER BY start_date",
                (scope, end, start)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM calendar_events WHERE scope IN (?, 'global') ORDER BY start_date DESC LIMIT 200",
                (scope,)
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Calendar: get_events error: {e}")
        return []


def update_calendar_event(event_id, **fields):
    """Update a calendar event."""
    if not ensure_tables():
        return False
    allowed = {"title", "description", "start_date", "end_date", "all_day", "color", "category"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return False
    try:
        updates["updated_at"] = datetime.now().isoformat()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [event_id]
        conn = get_connection()
        conn.execute(f"UPDATE calendar_events SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Calendar: update_event error: {e}")
        return False


def delete_calendar_event(event_id):
    """Delete a calendar event."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Calendar: delete_event error: {e}")
        return False
