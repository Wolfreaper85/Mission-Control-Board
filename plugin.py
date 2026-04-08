# plugin.py
# Self-Reflection core logic — shared by hooks, routes, tools, and scheduled tasks.
# All database operations for corrections, reflections, learned rules, bulletin board, capsules.

import json
import logging
import sqlite3
from datetime import datetime, timedelta
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
_calendar_migrated = False

def ensure_tables():
    """Create self-reflection tables if they don't exist. Idempotent."""
    global _tables_created, _calendar_migrated
    if _tables_created:
        if not _calendar_migrated:
            _run_calendar_migration()
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
                start_time TEXT,
                all_day INTEGER DEFAULT 1,
                color TEXT DEFAULT '#4a9eff',
                category TEXT DEFAULT 'event',
                reminder_minutes INTEGER,
                reminded INTEGER DEFAULT 0,
                chime_count INTEGER DEFAULT 3,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_calendar_scope ON calendar_events(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_calendar_start ON calendar_events(start_date)')

        # ── Phase 3: Daily Plans ──
        conn.execute('''
            CREATE TABLE IF NOT EXISTS daily_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                plan_date TEXT NOT NULL,
                goal_ids TEXT NOT NULL DEFAULT '[]',
                completed INTEGER DEFAULT 0,
                reflection TEXT,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_daily_scope ON daily_plans(scope)')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_date_scope ON daily_plans(plan_date, scope)')

        # ── Phase 3b: Daily Notes ──
        conn.execute('''
            CREATE TABLE IF NOT EXISTS daily_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_date TEXT NOT NULL,
                content TEXT DEFAULT '',
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_daily_notes_scope ON daily_notes(scope)')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_notes_date_scope ON daily_notes(note_date, scope)')

        # ── Phase 4: XP & Achievements ──
        conn.execute('''
            CREATE TABLE IF NOT EXISTS xp_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                xp_amount INTEGER NOT NULL,
                details TEXT,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_xp_scope ON xp_log(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_xp_created ON xp_log(created_at)')

        conn.execute('''
            CREATE TABLE IF NOT EXISTS achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                scope TEXT NOT NULL DEFAULT 'default',
                unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_achievements_scope ON achievements(scope)')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_achievements_key_scope ON achievements(key, scope)')

        # ── Phase 5: Habits ──
        conn.execute('''
            CREATE TABLE IF NOT EXISTS habits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '✅',
                frequency TEXT DEFAULT 'daily',
                target_days TEXT DEFAULT '[]',
                archived INTEGER DEFAULT 0,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_habits_scope ON habits(scope)')

        conn.execute('''
            CREATE TABLE IF NOT EXISTS habit_completions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                habit_id INTEGER NOT NULL,
                completion_date TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT 'default',
                completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (habit_id) REFERENCES habits(id)
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_hcomp_habit ON habit_completions(habit_id)')
        conn.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_hcomp_unique ON habit_completions(habit_id, completion_date)')

        # ── Phase 6: Focus Sessions ──
        conn.execute('''
            CREATE TABLE IF NOT EXISTS focus_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                goal_id INTEGER,
                start_time DATETIME NOT NULL,
                end_time DATETIME,
                duration_minutes INTEGER DEFAULT 0,
                session_type TEXT DEFAULT 'work',
                completed INTEGER DEFAULT 0,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_focus_scope ON focus_sessions(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_focus_start ON focus_sessions(start_time)')

        # ── Phase 7: Recurring Rules ──
        conn.execute('''
            CREATE TABLE IF NOT EXISTS recurring_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id INTEGER NOT NULL,
                pattern TEXT NOT NULL DEFAULT 'none',
                interval_val INTEGER DEFAULT 1,
                days_of_week TEXT DEFAULT '[]',
                day_of_month INTEGER,
                end_date TEXT,
                exceptions TEXT DEFAULT '[]',
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_recurring_event ON recurring_rules(event_id)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_recurring_scope ON recurring_rules(scope)')

        # ── User Goals (owned by user, separate from AI operational goals) ──
        conn.execute('''
            CREATE TABLE IF NOT EXISTS user_goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                priority TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'active',
                permanent INTEGER NOT NULL DEFAULT 0,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_user_goals_scope ON user_goals(scope)')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status)')

        # Migration: add permanent column if missing
        try:
            cursor = conn.execute("PRAGMA table_info(user_goals)")
            cols = [row[1] for row in cursor.fetchall()]
            if 'permanent' not in cols:
                conn.execute("ALTER TABLE user_goals ADD COLUMN permanent INTEGER NOT NULL DEFAULT 0")
                logger.info("UserGoals: migrated — added 'permanent' column")
        except Exception as mig_err:
            logger.warning(f"UserGoals: permanent migration: {mig_err}")

        conn.commit()
        conn.close()
        _tables_created = True
        _run_calendar_migration()
        return True
    except Exception as e:
        logger.error(f"Self-Reflection: table creation error: {e}")
        return False


def _run_calendar_migration():
    """Ensure calendar_events has reminder columns (for tables created before this update)."""
    global _calendar_migrated
    if _calendar_migrated:
        return
    try:
        conn = get_connection()
        for col, coltype, default in [
            ("start_time", "TEXT", "NULL"),
            ("reminder_minutes", "INTEGER", "NULL"),
            ("reminded", "INTEGER", "0"),
            ("chime_count", "INTEGER", "3"),
            ("status", "TEXT", "'active'"),
        ]:
            try:
                conn.execute(f'ALTER TABLE calendar_events ADD COLUMN {col} {coltype} DEFAULT {default}')
            except Exception:
                pass  # Column already exists
        conn.commit()
        conn.close()
        _calendar_migrated = True
    except Exception as e:
        logger.error(f"Calendar migration error: {e}")
        _calendar_migrated = True  # Don't retry endlessly


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

def save_calendar_event(title, start_date, end_date=None, description="", all_day=1, color="#4a9eff", category="event", scope="default", start_time=None, reminder_minutes=None, chime_count=3, recurrence=None):
    """Save a calendar event, optionally with a recurrence rule."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO calendar_events (title, description, start_date, end_date, start_time, all_day, color, category, scope, reminder_minutes, reminded, chime_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
            (title[:500], description[:2000] if description else "", start_date, end_date or start_date, start_time, all_day, color, category, scope, reminder_minutes, chime_count)
        )
        eid = cursor.lastrowid

        # Create recurrence rule if provided
        if recurrence and recurrence.get("pattern", "none") != "none":
            cursor.execute(
                "INSERT INTO recurring_rules (event_id, pattern, interval_val, days_of_week, day_of_month, end_date, scope) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    eid,
                    recurrence["pattern"],
                    recurrence.get("interval", 1),
                    json.dumps(recurrence.get("days_of_week", [])),
                    recurrence.get("day_of_month"),
                    recurrence.get("end_date"),
                    scope,
                )
            )

        conn.commit()
        conn.close()
        return eid
    except Exception as e:
        logger.error(f"Calendar: save_event error: {e}")
        return None


def get_calendar_events(scope="default", start=None, end=None):
    """Get calendar events, optionally filtered by date range. Expands recurring events."""
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

        events = [dict(r) for r in rows]

        # Expand recurring events within the date range
        if start and end:
            recurring_rows = conn.execute(
                """SELECT r.*, e.title, e.description, e.start_time, e.all_day, e.color, e.category,
                          e.reminder_minutes, e.chime_count, e.scope as event_scope, e.start_date as original_start
                   FROM recurring_rules r
                   JOIN calendar_events e ON r.event_id = e.id
                   WHERE e.scope IN (?, 'global')""",
                (scope,)
            ).fetchall()

            for rule in recurring_rows:
                rule = dict(rule)
                exceptions = json.loads(rule.get("exceptions") or "[]")
                virtual = _expand_recurring(rule, start, end, exceptions)
                events.extend(virtual)

        conn.close()

        # Attach recurrence info to base events
        if events:
            conn2 = get_connection()
            rule_map = {}
            rule_rows = conn2.execute("SELECT * FROM recurring_rules").fetchall()
            for rr in rule_rows:
                rr = dict(rr)
                rule_map[rr["event_id"]] = rr
            conn2.close()
            for ev in events:
                eid = ev.get("id")
                if isinstance(eid, int) and eid in rule_map:
                    r = rule_map[eid]
                    ev["recurrence"] = {
                        "rule_id": r["id"],
                        "pattern": r["pattern"],
                        "interval": r["interval_val"],
                        "days_of_week": json.loads(r.get("days_of_week") or "[]"),
                        "day_of_month": r.get("day_of_month"),
                        "end_date": r.get("end_date"),
                    }

        return events
    except Exception as e:
        logger.error(f"Calendar: get_events error: {e}")
        return []


def _expand_recurring(rule, range_start, range_end, exceptions):
    """Generate virtual event instances for a recurring rule within a date range."""
    from datetime import date as date_type

    pattern = rule["pattern"]
    interval = rule.get("interval_val", 1) or 1
    rule_end = rule.get("end_date")
    original_start = rule.get("original_start", "")[:10]
    event_id = rule["event_id"]
    rule_id = rule["id"]

    try:
        orig = datetime.strptime(original_start, "%Y-%m-%d").date()
        r_start = datetime.strptime(range_start, "%Y-%m-%d").date()
        r_end = datetime.strptime(range_end, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return []

    if rule_end:
        try:
            end_limit = datetime.strptime(rule_end, "%Y-%m-%d").date()
            r_end = min(r_end, end_limit)
        except (ValueError, TypeError):
            pass

    exception_set = set(exceptions)
    virtual_events = []

    def _make_virtual(d):
        date_str = d.strftime("%Y-%m-%d")
        if date_str in exception_set:
            return None
        if date_str == original_start:
            return None  # Base event already in the list
        return {
            "id": f"recurring-{rule_id}-{date_str}",
            "title": rule.get("title", ""),
            "description": rule.get("description", ""),
            "start_date": date_str,
            "end_date": date_str,
            "start_time": rule.get("start_time"),
            "all_day": rule.get("all_day", 1),
            "color": rule.get("color", "#4a9eff"),
            "category": rule.get("category", "event"),
            "reminder_minutes": rule.get("reminder_minutes"),
            "chime_count": rule.get("chime_count", 3),
            "scope": rule.get("event_scope", "default"),
            "_recurring": True,
            "_rule_id": rule_id,
            "_base_event_id": event_id,
        }

    if pattern == "daily":
        current = orig + timedelta(days=interval)
        while current <= r_end:
            if current >= r_start:
                ev = _make_virtual(current)
                if ev:
                    virtual_events.append(ev)
            current += timedelta(days=interval)

    elif pattern == "weekly":
        days_of_week = json.loads(rule.get("days_of_week") or "[]")
        if not days_of_week:
            # Default to same day of week as original
            days_of_week = [orig.weekday()]
        # Iterate day by day from orig to r_end, check if weekday matches
        current = orig + timedelta(days=1)
        week_count = 0
        last_week = orig.isocalendar()[1]
        while current <= r_end:
            cw = current.isocalendar()[1]
            if cw != last_week:
                week_count += 1
                last_week = cw
            if week_count % interval == 0 and current.weekday() in days_of_week:
                if current >= r_start:
                    ev = _make_virtual(current)
                    if ev:
                        virtual_events.append(ev)
            current += timedelta(days=1)

    elif pattern == "monthly":
        dom = rule.get("day_of_month") or orig.day
        current_month = orig.month + interval
        current_year = orig.year
        while current_year < r_end.year + 2:  # safety bound
            while current_month > 12:
                current_month -= 12
                current_year += 1
            try:
                import calendar as cal_mod
                max_day = cal_mod.monthrange(current_year, current_month)[1]
                actual_day = min(dom, max_day)
                d = datetime(current_year, current_month, actual_day).date()
            except (ValueError, TypeError):
                current_month += interval
                continue
            if d > r_end:
                break
            if d >= r_start:
                ev = _make_virtual(d)
                if ev:
                    virtual_events.append(ev)
            current_month += interval

    return virtual_events


def update_calendar_event(event_id, **fields):
    """Update a calendar event and optionally its recurrence rule."""
    if not ensure_tables():
        return False
    recurrence = fields.pop("recurrence", None)
    allowed = {"title", "description", "start_date", "end_date", "start_time", "all_day", "color", "category", "reminder_minutes", "reminded", "chime_count", "status"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    try:
        conn = get_connection()
        if updates:
            updates["updated_at"] = datetime.now().isoformat()
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [event_id]
            conn.execute(f"UPDATE calendar_events SET {set_clause} WHERE id = ?", values)

        # Handle recurrence updates
        if recurrence is not None:
            # Delete existing rule
            conn.execute("DELETE FROM recurring_rules WHERE event_id = ?", (event_id,))
            if recurrence.get("pattern", "none") != "none":
                scope_row = conn.execute("SELECT scope FROM calendar_events WHERE id = ?", (event_id,)).fetchone()
                scope = scope_row["scope"] if scope_row else "default"
                conn.execute(
                    "INSERT INTO recurring_rules (event_id, pattern, interval_val, days_of_week, day_of_month, end_date, scope) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        event_id,
                        recurrence["pattern"],
                        recurrence.get("interval", 1),
                        json.dumps(recurrence.get("days_of_week", [])),
                        recurrence.get("day_of_month"),
                        recurrence.get("end_date"),
                        scope,
                    )
                )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Calendar: update_event error: {e}")
        return False


def add_recurring_exception(rule_id, exception_date):
    """Add an exception date to a recurring rule (skip one occurrence)."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        row = conn.execute("SELECT exceptions FROM recurring_rules WHERE id = ?", (rule_id,)).fetchone()
        if not row:
            conn.close()
            return False
        exceptions = json.loads(row["exceptions"] or "[]")
        if exception_date not in exceptions:
            exceptions.append(exception_date)
        conn.execute("UPDATE recurring_rules SET exceptions = ? WHERE id = ?", (json.dumps(exceptions), rule_id))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Calendar: add_recurring_exception error: {e}")
        return False


def end_recurring_rule(rule_id, end_date):
    """End a recurring rule from a specific date forward."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("UPDATE recurring_rules SET end_date = ? WHERE id = ?", (end_date, rule_id))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Calendar: end_recurring_rule error: {e}")
        return False


def get_recurring_rule(event_id):
    """Get the recurring rule for a calendar event."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        row = conn.execute("SELECT * FROM recurring_rules WHERE event_id = ?", (event_id,)).fetchone()
        conn.close()
        if row:
            r = dict(row)
            r["days_of_week"] = json.loads(r.get("days_of_week") or "[]")
            r["exceptions"] = json.loads(r.get("exceptions") or "[]")
            return r
        return None
    except Exception as e:
        logger.error(f"Calendar: get_recurring_rule error: {e}")
        return None


def get_due_reminders():
    """Get calendar events whose reminders are due now (not yet reminded)."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        now = datetime.now()
        # Get all events with reminders that haven't fired yet
        rows = conn.execute(
            "SELECT * FROM calendar_events WHERE reminder_minutes IS NOT NULL AND reminded = 0 AND start_date >= ?",
            (now.strftime("%Y-%m-%d"),)
        ).fetchall()

        due = []
        for r in rows:
            row = dict(r)
            # Build the event datetime
            event_date = row["start_date"][:10]
            event_time = row.get("start_time") or "09:00"
            try:
                event_dt = datetime.strptime(f"{event_date} {event_time}", "%Y-%m-%d %H:%M")
            except Exception:
                event_dt = datetime.strptime(f"{event_date} 09:00", "%Y-%m-%d %H:%M")

            # Check if reminder is due
            remind_at = event_dt - timedelta(minutes=row["reminder_minutes"])
            if now >= remind_at:
                due.append(row)

        # Mark them as reminded
        if due:
            ids = [d["id"] for d in due]
            placeholders = ",".join("?" * len(ids))
            conn.execute(f"UPDATE calendar_events SET reminded = 1 WHERE id IN ({placeholders})", ids)
            conn.commit()

        conn.close()
        return due
    except Exception as e:
        logger.error(f"Calendar: get_due_reminders error: {e}")
        return []


def delete_calendar_event(event_id):
    """Delete a calendar event and its recurring rule."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM recurring_rules WHERE event_id = ?", (event_id,))
        conn.execute("DELETE FROM calendar_events WHERE id = ?", (event_id,))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Calendar: delete_event error: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
#  User Goals (user-owned, separate from AI operational goals)
# ═══════════════════════════════════════════════════════════════════════════════

def get_user_goals(scope="default", status=None):
    """Get user goals, optionally filtered by status."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        if status:
            rows = conn.execute(
                "SELECT * FROM user_goals WHERE scope IN (?, 'global') AND status = ? "
                "ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at DESC",
                (scope, status)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM user_goals WHERE scope IN (?, 'global') "
                "ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at DESC",
                (scope,)
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"UserGoals: get error: {e}")
        return []


def create_user_goal(title, description=None, priority="medium", scope="default"):
    """Create a new user goal."""
    if not ensure_tables():
        return None
    if priority not in ("high", "medium", "low"):
        priority = "medium"
    try:
        conn = get_connection()
        cursor = conn.execute(
            "INSERT INTO user_goals (title, description, priority, scope) VALUES (?, ?, ?, ?)",
            (title[:200], (description or "")[:2000], priority, scope)
        )
        conn.commit()
        goal_id = cursor.lastrowid
        conn.close()
        logger.debug(f"UserGoals: created #{goal_id} '{title[:50]}'")
        return goal_id
    except Exception as e:
        logger.error(f"UserGoals: create error: {e}")
        return None


def update_user_goal(goal_id, **fields):
    """Update a user goal's fields."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        updates = []
        params = []
        for key in ("title", "description", "priority", "status", "permanent"):
            if key in fields and fields[key] is not None:
                val = fields[key]
                if key == "title":
                    val = str(val)[:200]
                elif key == "description":
                    val = str(val)[:2000]
                elif key == "priority" and val not in ("high", "medium", "low"):
                    continue
                elif key == "status" and val not in ("active", "completed", "abandoned"):
                    continue
                elif key == "permanent":
                    val = 1 if val else 0
                updates.append(f"{key} = ?")
                params.append(val)

        if fields.get("status") == "completed":
            updates.append("completed_at = CURRENT_TIMESTAMP")

        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(int(goal_id))

        if updates:
            conn.execute(
                f"UPDATE user_goals SET {', '.join(updates)} WHERE id = ?",
                params
            )
            conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"UserGoals: update error: {e}")
        return False


def delete_user_goal(goal_id):
    """Delete a user goal."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute("DELETE FROM user_goals WHERE id = ?", (int(goal_id),))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"UserGoals: delete error: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
#  Daily Plans
# ═══════════════════════════════════════════════════════════════════════════════

def get_daily_plan(plan_date, scope="default"):
    """Get the daily plan for a specific date."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM daily_plans WHERE plan_date = ? AND scope = ?",
            (plan_date, scope)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"DailyPlan: get error: {e}")
        return None


def save_daily_plan(plan_date, goal_ids, scope="default"):
    """Create or update the daily plan for a date."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        import json
        ids_json = json.dumps(goal_ids) if isinstance(goal_ids, list) else goal_ids
        existing = conn.execute(
            "SELECT id FROM daily_plans WHERE plan_date = ? AND scope = ?",
            (plan_date, scope)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE daily_plans SET goal_ids = ? WHERE id = ?",
                (ids_json, existing["id"])
            )
            plan_id = existing["id"]
        else:
            cursor = conn.execute(
                "INSERT INTO daily_plans (plan_date, goal_ids, scope) VALUES (?, ?, ?)",
                (plan_date, ids_json, scope)
            )
            plan_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return plan_id
    except Exception as e:
        logger.error(f"DailyPlan: save error: {e}")
        return None


def complete_daily_plan(plan_date, scope="default"):
    """Mark a daily plan as completed."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute(
            "UPDATE daily_plans SET completed = 1 WHERE plan_date = ? AND scope = ?",
            (plan_date, scope)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"DailyPlan: complete error: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
#  Daily Notes
# ═══════════════════════════════════════════════════════════════════════════════

def get_daily_note(note_date, scope="default"):
    """Get the daily note for a specific date and scope."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        row = conn.execute(
            "SELECT * FROM daily_notes WHERE note_date = ? AND scope = ?",
            (note_date, scope)
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except Exception as e:
        logger.error(f"DailyNote: get error: {e}")
        return None


def save_daily_note(note_date, content, scope="default"):
    """Create or update the daily note for a date and scope."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        existing = conn.execute(
            "SELECT id FROM daily_notes WHERE note_date = ? AND scope = ?",
            (note_date, scope)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE daily_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (content, existing["id"])
            )
            note_id = existing["id"]
        else:
            cursor = conn.execute(
                "INSERT INTO daily_notes (note_date, content, scope) VALUES (?, ?, ?)",
                (note_date, content, scope)
            )
            note_id = cursor.lastrowid
        conn.commit()
        conn.close()
        return note_id
    except Exception as e:
        logger.error(f"DailyNote: save error: {e}")
        return None


def delete_daily_note(note_date, scope="default"):
    """Delete the daily note for a date and scope."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        conn.execute(
            "DELETE FROM daily_notes WHERE note_date = ? AND scope = ?",
            (note_date, scope)
        )
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"DailyNote: delete error: {e}")
        return False


# ═════════════════════════════════════════════════════════════════════════════
#  XP & Achievements
# ═════════════════════════════════════════════════════════════════════════════

def award_xp(action, xp_amount, details=None, scope="default"):
    """Award XP and log it."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        import json
        details_str = json.dumps(details) if details else None
        cursor = conn.execute(
            "INSERT INTO xp_log (action, xp_amount, details, scope) VALUES (?, ?, ?, ?)",
            (action, xp_amount, details_str, scope)
        )
        conn.commit()
        xp_id = cursor.lastrowid
        conn.close()
        return xp_id
    except Exception as e:
        logger.error(f"XP: award error: {e}")
        return None


def get_xp_status(scope="default"):
    """Get current XP total, level, and recent gains."""
    if not ensure_tables():
        return {"total_xp": 0, "level": 0, "next_level_xp": 100}
    try:
        import math, json
        conn = get_connection()
        row = conn.execute(
            "SELECT COALESCE(SUM(xp_amount), 0) as total FROM xp_log WHERE scope = ?",
            (scope,)
        ).fetchone()
        total = row["total"] if row else 0
        level = int(math.floor(math.sqrt(total / 100)))
        next_level = (level + 1) ** 2 * 100
        current_level_xp = level ** 2 * 100
        progress = (total - current_level_xp) / max(1, next_level - current_level_xp)

        # Today's XP
        today = datetime.now().strftime("%Y-%m-%d")
        today_row = conn.execute(
            "SELECT COALESCE(SUM(xp_amount), 0) as today_xp FROM xp_log WHERE scope = ? AND created_at >= ?",
            (scope, today)
        ).fetchone()

        # Recent gains
        recent = conn.execute(
            "SELECT * FROM xp_log WHERE scope = ? ORDER BY created_at DESC LIMIT 10",
            (scope,)
        ).fetchall()

        conn.close()
        return {
            "total_xp": total,
            "level": level,
            "next_level_xp": next_level,
            "current_level_xp": current_level_xp,
            "progress": round(progress, 3),
            "today_xp": today_row["today_xp"] if today_row else 0,
            "recent": [dict(r) for r in recent]
        }
    except Exception as e:
        logger.error(f"XP: status error: {e}")
        return {"total_xp": 0, "level": 0, "next_level_xp": 100, "progress": 0}


def unlock_achievement(key, name, description, icon, scope="default"):
    """Unlock an achievement (no-op if already unlocked)."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        existing = conn.execute(
            "SELECT id FROM achievements WHERE key = ? AND scope = ?",
            (key, scope)
        ).fetchone()
        if existing:
            conn.close()
            return None  # Already unlocked
        cursor = conn.execute(
            "INSERT INTO achievements (key, name, description, icon, scope) VALUES (?, ?, ?, ?, ?)",
            (key, name, description, icon, scope)
        )
        conn.commit()
        ach_id = cursor.lastrowid
        conn.close()
        return ach_id
    except Exception as e:
        logger.error(f"Achievement: unlock error: {e}")
        return None


def get_achievements(scope="default"):
    """Get all unlocked achievements."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM achievements WHERE scope = ? ORDER BY unlocked_at DESC",
            (scope,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Achievement: get error: {e}")
        return []


# ══════════════════════════════════════════════════��════════════════════════════
#  Habits
# ═══════════════════════════════════════════════════════════════════════════════

def get_habits(scope="default"):
    """Get all active (non-archived) habits."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        rows = conn.execute(
            "SELECT * FROM habits WHERE scope = ? AND archived = 0 ORDER BY created_at",
            (scope,)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Habits: get error: {e}")
        return []


def save_habit(name, icon="✅", frequency="daily", target_days=None, scope="default"):
    """Create a new habit."""
    if not ensure_tables():
        return None
    try:
        import json
        conn = get_connection()
        days_json = json.dumps(target_days or [])
        cursor = conn.execute(
            "INSERT INTO habits (name, icon, frequency, target_days, scope) VALUES (?, ?, ?, ?, ?)",
            (name, icon, frequency, days_json, scope)
        )
        conn.commit()
        habit_id = cursor.lastrowid
        conn.close()
        return habit_id
    except Exception as e:
        logger.error(f"Habits: save error: {e}")
        return None


def update_habit(habit_id, **fields):
    """Update a habit."""
    if not ensure_tables():
        return False
    allowed = {"name", "icon", "frequency", "target_days", "archived"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return False
    try:
        import json
        if "target_days" in updates and isinstance(updates["target_days"], list):
            updates["target_days"] = json.dumps(updates["target_days"])
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [habit_id]
        conn = get_connection()
        conn.execute(f"UPDATE habits SET {set_clause} WHERE id = ?", values)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Habits: update error: {e}")
        return False


def toggle_habit_completion(habit_id, date_str, scope="default"):
    """Toggle a habit completion for a given date. Returns True if now completed, False if removed."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        existing = conn.execute(
            "SELECT id FROM habit_completions WHERE habit_id = ? AND completion_date = ?",
            (habit_id, date_str)
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM habit_completions WHERE id = ?", (existing["id"],))
            conn.commit()
            conn.close()
            return False
        else:
            conn.execute(
                "INSERT INTO habit_completions (habit_id, completion_date, scope) VALUES (?, ?, ?)",
                (habit_id, date_str, scope)
            )
            conn.commit()
            conn.close()
            return True
    except Exception as e:
        logger.error(f"Habits: toggle error: {e}")
        return None


def get_habit_completions(habit_id, days=30):
    """Get recent completions for a habit."""
    if not ensure_tables():
        return []
    try:
        conn = get_connection()
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        rows = conn.execute(
            "SELECT * FROM habit_completions WHERE habit_id = ? AND completion_date >= ? ORDER BY completion_date",
            (habit_id, cutoff)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Habits: get_completions error: {e}")
        return []


def get_habit_stats(scope="default"):
    """Get habit stats including streaks and completion rates."""
    if not ensure_tables():
        return []
    try:
        import json
        conn = get_connection()
        habits = conn.execute(
            "SELECT * FROM habits WHERE scope = ? AND archived = 0 ORDER BY created_at",
            (scope,)
        ).fetchall()

        today = datetime.now().strftime("%Y-%m-%d")
        results = []
        for h in habits:
            habit = dict(h)
            # Get completions for last 30 days
            cutoff = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            completions = conn.execute(
                "SELECT completion_date FROM habit_completions WHERE habit_id = ? AND completion_date >= ? ORDER BY completion_date DESC",
                (habit["id"], cutoff)
            ).fetchall()
            dates = [r["completion_date"] for r in completions]

            # Calculate streak
            streak = 0
            check_date = datetime.now()
            for _ in range(365):
                d = check_date.strftime("%Y-%m-%d")
                if d in dates:
                    streak += 1
                    check_date -= timedelta(days=1)
                else:
                    break

            habit["streak"] = streak
            habit["completed_today"] = today in dates
            habit["completion_dates"] = dates[:7]  # Last 7 for heatmap
            habit["completion_rate"] = round(len(dates) / 30 * 100, 1) if dates else 0
            results.append(habit)

        conn.close()
        return results
    except Exception as e:
        logger.error(f"Habits: stats error: {e}")
        return []


# ══════════════════════════════════════════════════════════════════════════════��
#  Focus Sessions
# ═══════════════════════════════��═════════════════════════════��═════════════════

def start_focus_session(goal_id=None, session_type="work", scope="default"):
    """Start a new focus session."""
    if not ensure_tables():
        return None
    try:
        conn = get_connection()
        now = datetime.now().isoformat()
        cursor = conn.execute(
            "INSERT INTO focus_sessions (goal_id, start_time, session_type, scope) VALUES (?, ?, ?, ?)",
            (goal_id, now, session_type, scope)
        )
        conn.commit()
        session_id = cursor.lastrowid
        conn.close()
        return session_id
    except Exception as e:
        logger.error(f"Focus: start error: {e}")
        return None


def stop_focus_session(session_id):
    """End a focus session, calculate duration."""
    if not ensure_tables():
        return False
    try:
        conn = get_connection()
        row = conn.execute("SELECT * FROM focus_sessions WHERE id = ?", (session_id,)).fetchone()
        if not row:
            conn.close()
            return False
        start = datetime.fromisoformat(row["start_time"])
        now = datetime.now()
        duration = int((now - start).total_seconds() / 60)
        conn.execute(
            "UPDATE focus_sessions SET end_time = ?, duration_minutes = ?, completed = 1 WHERE id = ?",
            (now.isoformat(), duration, session_id)
        )
        conn.commit()
        conn.close()
        return duration
    except Exception as e:
        logger.error(f"Focus: stop error: {e}")
        return False


def get_focus_stats(scope="default"):
    """Get focus session stats."""
    if not ensure_tables():
        return {"today": 0, "week": 0, "month": 0, "sessions": []}
    try:
        conn = get_connection()
        now = datetime.now()
        today = now.strftime("%Y-%m-%d")
        week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
        month_start = now.strftime("%Y-%m-01")

        today_mins = conn.execute(
            "SELECT COALESCE(SUM(duration_minutes), 0) as mins FROM focus_sessions WHERE scope = ? AND completed = 1 AND start_time >= ?",
            (scope, today)
        ).fetchone()["mins"]

        week_mins = conn.execute(
            "SELECT COALESCE(SUM(duration_minutes), 0) as mins FROM focus_sessions WHERE scope = ? AND completed = 1 AND start_time >= ?",
            (scope, week_start)
        ).fetchone()["mins"]

        month_mins = conn.execute(
            "SELECT COALESCE(SUM(duration_minutes), 0) as mins FROM focus_sessions WHERE scope = ? AND completed = 1 AND start_time >= ?",
            (scope, month_start)
        ).fetchone()["mins"]

        recent = conn.execute(
            "SELECT * FROM focus_sessions WHERE scope = ? AND completed = 1 ORDER BY start_time DESC LIMIT 10",
            (scope,)
        ).fetchall()

        # Current active session
        active = conn.execute(
            "SELECT * FROM focus_sessions WHERE scope = ? AND completed = 0 ORDER BY start_time DESC LIMIT 1",
            (scope,)
        ).fetchone()

        conn.close()
        return {
            "today": today_mins,
            "week": week_mins,
            "month": month_mins,
            "sessions": [dict(r) for r in recent],
            "active": dict(active) if active else None
        }
    except Exception as e:
        logger.error(f"Focus: stats error: {e}")
        return {"today": 0, "week": 0, "month": 0, "sessions": []}
