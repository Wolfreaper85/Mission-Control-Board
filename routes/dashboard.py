# routes/dashboard.py
# Mission Control API — reads from Sapphire's existing goals.db + agent manager
# All handlers receive kwargs: body, settings, query, request, plus path params

import sqlite3
import logging
from pathlib import Path
from datetime import datetime, timedelta
import math
import json

logger = logging.getLogger(__name__)

# ─── Database helpers ────────────────────────────────────────────────────────

def _goals_db():
    """Path to Sapphire's goals database."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "goals.db"
        if candidate.exists():
            return candidate
    return Path(__file__).parent.parent.parent.parent / "user" / "goals.db"


def _memory_db():
    """Path to Sapphire's memory database."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "memory.db"
        if candidate.exists():
            return candidate
    return Path(__file__).parent.parent.parent.parent / "user" / "memory.db"


def _connect(db_path):
    """Open a read connection to a Sapphire SQLite database."""
    conn = sqlite3.connect(str(db_path), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


_xp_table_ready = False

def _ensure_xp_table(cursor, conn):
    """Create xp_log table if it doesn't exist (idempotent)."""
    global _xp_table_ready
    if _xp_table_ready:
        return
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS xp_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            xp_amount INTEGER NOT NULL,
            details TEXT,
            scope TEXT NOT NULL DEFAULT 'default',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_xp_scope ON xp_log(scope)')
    conn.commit()
    _xp_table_ready = True


def _award_xp_direct(cursor, conn, action, amount, detail_ref, scope):
    """Write XP directly to the xp_log table using an existing DB connection."""
    import json
    _ensure_xp_table(cursor, conn)
    details = json.dumps({"ref": str(detail_ref)}) if detail_ref else None
    cursor.execute(
        "INSERT INTO xp_log (action, xp_amount, details, scope) VALUES (?, ?, ?, ?)",
        (action, amount, details, scope)
    )
    conn.commit()


def _deduct_xp_direct(cursor, conn, action, amount, detail_ref, scope):
    """Deduct XP by writing a negative entry to xp_log."""
    import json
    _ensure_xp_table(cursor, conn)
    details = json.dumps({"ref": str(detail_ref)}) if detail_ref else None
    cursor.execute(
        "INSERT INTO xp_log (action, xp_amount, details, scope) VALUES (?, ?, ?, ?)",
        (action, -amount, details, scope)
    )
    conn.commit()


#─── Goals (Kanban board data) ───────────────────────────────────────────────

def get_goals(**kwargs):
    """Return all goals structured for the Kanban board."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    status_filter = query.get("status", "all")

    db_path = _goals_db()
    if not db_path.exists():
        return {"goals": [], "columns": _default_columns()}

    try:
        conn = _connect(db_path)
        cursor = conn.cursor()

        # Build query with scope awareness (include global overlay)
        if scope == "global":
            scope_sql = "scope = ?"
            scope_params = [scope]
        else:
            scope_sql = "scope IN (?, 'global')"
            scope_params = [scope]

        if status_filter and status_filter != "all":
            cursor.execute(
                f"SELECT * FROM goals WHERE {scope_sql} AND status = ? ORDER BY updated_at DESC",
                scope_params + [status_filter]
            )
        else:
            cursor.execute(
                f"SELECT * FROM goals WHERE {scope_sql} ORDER BY updated_at DESC",
                scope_params
            )

        rows = cursor.fetchall()
        goals = []
        for r in rows:
            goal = dict(r)
            # Fetch progress notes for this goal
            cursor.execute(
                "SELECT note, created_at FROM goal_progress WHERE goal_id = ? ORDER BY created_at DESC LIMIT 5",
                (goal["id"],)
            )
            goal["progress"] = [dict(p) for p in cursor.fetchall()]
            # Count subtasks
            cursor.execute(
                "SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done FROM goals WHERE parent_id = ?",
                (goal["id"],)
            )
            sub = cursor.fetchone()
            goal["subtask_count"] = sub["total"] or 0
            goal["subtask_done"] = sub["done"] or 0
            goals.append(goal)

        conn.close()
        return {"goals": goals, "columns": _default_columns()}

    except Exception as e:
        logger.error(f"Mission Control get_goals error: {e}")
        return {"goals": [], "columns": _default_columns(), "error": str(e)}


def create_goal(**kwargs):
    """Create a new goal from the dashboard."""
    body = kwargs.get("body", {})
    title = body.get("title", "").strip()
    if not title:
        return {"error": "Title is required"}

    description = body.get("description", "").strip()
    priority = body.get("priority", "medium")
    parent_id = body.get("parent_id")
    scope = body.get("scope", "default")
    status = body.get("status", "active")
    permanent = 1 if body.get("permanent") else 0

    if priority not in ("high", "medium", "low"):
        priority = "medium"
    if status not in ("active", "completed", "abandoned"):
        status = "active"

    db_path = _goals_db()
    if not db_path.exists():
        return {"error": "Goals database not initialized. Send a message in chat first."}

    try:
        conn = _connect(db_path)
        cursor = conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        completed_at = now if status == "completed" else None
        cursor.execute(
            "INSERT INTO goals (title, description, priority, status, parent_id, scope, created_at, updated_at, permanent, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (title[:200], description[:500] if description else None, priority, status, parent_id, scope, now, now, permanent, completed_at)
        )
        conn.commit()
        goal_id = cursor.lastrowid
        conn.close()
        return {"success": True, "id": goal_id}
    except Exception as e:
        logger.error(f"Mission Control create_goal error: {e}")
        return {"error": str(e)}


def update_goal(**kwargs):
    """Update a goal's status, priority, or other fields from the dashboard."""
    body = kwargs.get("body", {})
    goal_id = body.get("goal_id")
    if not goal_id:
        return {"error": "goal_id is required"}

    db_path = _goals_db()
    if not db_path.exists():
        return {"error": "Goals database not found"}

    try:
        conn = _connect(db_path)
        cursor = conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        updates = []
        params = []

        for field in ("title", "description", "priority", "status"):
            if field in body and body[field] is not None:
                val = body[field]
                if field == "title":
                    val = str(val)[:200]
                elif field == "description":
                    val = str(val)[:500]
                elif field == "priority" and val not in ("high", "medium", "low"):
                    continue
                elif field == "status" and val not in ("active", "completed", "abandoned"):
                    continue
                updates.append(f"{field} = ?")
                params.append(val)

        # Handle permanent flag
        if "permanent" in body:
            updates.append("permanent = ?")
            params.append(1 if body["permanent"] else 0)

        if body.get("status") == "completed":
            updates.append("completed_at = ?")
            params.append(now)

        updates.append("updated_at = ?")
        params.append(now)
        params.append(goal_id)

        if updates:
            cursor.execute(f"UPDATE goals SET {', '.join(updates)} WHERE id = ?", params)

        # Add progress note if provided
        progress_note = body.get("progress_note", "").strip()
        if progress_note:
            cursor.execute(
                "INSERT INTO goal_progress (goal_id, note, created_at) VALUES (?, ?, ?)",
                (goal_id, progress_note[:1024], now)
            )

        conn.commit()

        # ── XP: award on goal completion, deduct on uncomplete ──
        # Wrapped in its own try/except so XP errors never kill the goal update response
        xp_awarded = 0
        xp_deducted = 0
        daily_bonus = 0
        xp_error = None

        try:
            goal_row = cursor.execute("SELECT scope, priority FROM goals WHERE id = ?", (goal_id,)).fetchone()
            scope = body.get("scope") or (goal_row["scope"] if goal_row else "default") or "default"
            priority = (goal_row["priority"] if goal_row else None) or "medium"
            xp_map = {"high": 50, "medium": 30, "low": 15}
            logger.info(f"XP: Goal {goal_id} status={body.get('status')} scope={scope} priority={priority}")

            if body.get("status") == "completed":
                xp_awarded = xp_map.get(priority, 30)
                _award_xp_direct(cursor, conn, "goal_complete", xp_awarded, goal_id, scope)
                logger.info(f"XP: Awarded {xp_awarded} for goal {goal_id} completion (priority={priority})")

                # Check if all daily plan goals are now complete → bonus XP
                try:
                    import json
                    today = datetime.now().strftime("%Y-%m-%d")
                    plan_row = cursor.execute(
                        "SELECT id, goal_ids, completed FROM daily_plans WHERE plan_date = ? AND scope = ?",
                        (today, scope)
                    ).fetchone()
                    if plan_row and not plan_row["completed"]:
                        plan_goal_ids = json.loads(plan_row["goal_ids"] or '[]')
                        if plan_goal_ids:
                            placeholders = ','.join('?' * len(plan_goal_ids))
                            done_count = cursor.execute(
                                f"SELECT COUNT(*) FROM goals WHERE id IN ({placeholders}) AND status = 'completed'",
                                plan_goal_ids
                            ).fetchone()[0]
                            if done_count >= len(plan_goal_ids):
                                daily_bonus = 100
                                cursor.execute("UPDATE daily_plans SET completed = 1 WHERE id = ?", (plan_row["id"],))
                                _award_xp_direct(cursor, conn, "daily_plan_complete", daily_bonus, today, scope)
                                logger.info(f"XP: Awarded {daily_bonus} daily plan bonus for {today}")
                except Exception as dp_err:
                    logger.warning(f"Daily plan bonus check failed: {dp_err}")

            elif body.get("status") == "active":
                xp_deducted = xp_map.get(priority, 30)
                _deduct_xp_direct(cursor, conn, "goal_uncomplete", xp_deducted, goal_id, scope)
                logger.info(f"XP: Deducted {xp_deducted} for goal {goal_id} uncomplete")

                cursor.execute("UPDATE goals SET completed_at = NULL WHERE id = ?", (goal_id,))

                try:
                    import json
                    today = datetime.now().strftime("%Y-%m-%d")
                    plan_row = cursor.execute(
                        "SELECT id, completed FROM daily_plans WHERE plan_date = ? AND scope = ? AND completed = 1",
                        (today, scope)
                    ).fetchone()
                    if plan_row:
                        cursor.execute("UPDATE daily_plans SET completed = 0 WHERE id = ?", (plan_row["id"],))
                        _deduct_xp_direct(cursor, conn, "daily_plan_uncomplete", 100, today, scope)
                        xp_deducted += 100
                        logger.info(f"XP: Deducted 100 daily plan bonus for uncomplete on {today}")
                except Exception as dp_err:
                    logger.warning(f"Daily plan uncomplete check failed: {dp_err}")

                conn.commit()

        except Exception as xp_err:
            xp_error = str(xp_err)
            logger.error(f"XP processing failed for goal {goal_id}: {xp_err}", exc_info=True)

        conn.close()
        result = {"success": True, "xp_awarded": xp_awarded, "xp_deducted": xp_deducted, "daily_bonus": daily_bonus}
        if xp_error:
            result["xp_error"] = xp_error
        return result
    except Exception as e:
        logger.error(f"Mission Control update_goal error: {e}")
        return {"error": str(e)}


def delete_goal(**kwargs):
    """Delete a goal from the dashboard."""
    body = kwargs.get("body", {})
    goal_id = body.get("goal_id")
    if not goal_id:
        return {"error": "goal_id is required"}

    db_path = _goals_db()
    if not db_path.exists():
        return {"error": "Goals database not found"}

    try:
        conn = _connect(db_path)
        cursor = conn.cursor()
        # Cascade delete subtasks
        cursor.execute("DELETE FROM goals WHERE parent_id = ?", (goal_id,))
        cursor.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"Mission Control delete_goal error: {e}")
        return {"error": str(e)}


# ─── Schedule Stamp Check ─────────────────────────────────────────────────────

def check_schedule_stamps(**kwargs):
    """Check if any scheduled permanent goals fired and need a completed stamp."""
    try:
        from core.api_fastapi import get_system
        system = get_system()
        if not hasattr(system, 'continuity_scheduler') or not system.continuity_scheduler:
            return {"stamped": 0}
    except Exception:
        return {"stamped": 0}

    db_path = _goals_db()
    if not db_path.exists():
        return {"stamped": 0}

    stamped = 0
    try:
        tasks = system.continuity_scheduler.list_tasks()
        mc_tasks = [t for t in tasks if t.get("source", "").startswith("mc-goal:") and t.get("last_run")]

        if not mc_tasks:
            return {"stamped": 0}

        conn = _connect(db_path)
        cursor = conn.cursor()

        for t in mc_tasks:
            src_parts = t["source"].replace("mc-goal:", "").split(":")
            goal_id = src_parts[0]
            is_single = len(src_parts) > 1 and src_parts[1] == "once"

            # Delete single-use tasks that have already fired — do this FIRST
            if is_single and t.get("last_run"):
                try:
                    from core.api_fastapi import get_system
                    system = get_system()
                    if hasattr(system, 'continuity_scheduler'):
                        system.continuity_scheduler.delete_task(t["id"])
                        logger.info(f"Mission Control: auto-deleted single-use task '{t['name']}' ({t['id'][:8]})")
                except Exception as del_e:
                    logger.error(f"Mission Control: failed to delete single-use task: {del_e}")

            # Get the goal
            cursor.execute("SELECT id, title, priority, scope, permanent FROM goals WHERE id = ?", (goal_id,))
            goal = cursor.fetchone()
            if not goal or not goal["permanent"]:
                continue

            # Only stamp if the task has actually run
            if not t.get("last_run"):
                continue

            # Check if we already stamped for this run
            last_run = t["last_run"]  # ISO format
            cursor.execute(
                "SELECT id FROM goals WHERE title LIKE ? AND status = 'completed' AND created_at >= ? LIMIT 1",
                (f"{goal['title']} %", last_run[:19].replace("T", " "))
            )
            existing_stamp = cursor.fetchone()
            if existing_stamp:
                continue

            # Create stamp
            now = datetime.now()
            stamp_date = now.strftime("%b %d, %Y")
            stamp_time = now.strftime("%I:%M %p").lstrip("0")
            stamp_title = f"{goal['title']} \u2014 {stamp_date} {stamp_time}"
            now_str = now.strftime("%Y-%m-%d %H:%M:%S")

            cursor.execute(
                "INSERT INTO goals (title, description, priority, status, parent_id, scope, created_at, updated_at, permanent, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (stamp_title[:200], f"Scheduled run of permanent goal #{goal['id']}", goal["priority"], "completed", None, goal["scope"], now_str, now_str, 0, now_str)
            )
            stamped += 1

        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Mission Control check_schedule_stamps error: {e}")

    return {"stamped": stamped}


# ─── Agents ──────────────────────────────────────────────────────────────────

def _get_manager():
    """Get AgentManager the same way the agents plugin does."""
    try:
        from core.api_fastapi import get_system
        system = get_system()
        if hasattr(system, 'agent_manager'):
            return system.agent_manager
    except Exception:
        pass
    return None


def get_agents(**kwargs):
    """Return current agent statuses from the agent manager."""
    try:
        mgr = _get_manager()
        if mgr is None:
            return {"agents": []}
        agents_raw = mgr.check_all()
        agents = []
        for a in agents_raw:
            agents.append({
                "id": a.get("id", ""),
                "name": a.get("name", ""),
                "status": a.get("status", "unknown"),
                "mission": a.get("mission", ""),
                "elapsed": a.get("elapsed", 0),
                "agent_type": a.get("agent_type", "llm"),
                "tool_log": a.get("tool_log", [])[-5:],  # Last 5 tool actions
            })
        return {"agents": agents}
    except Exception as e:
        logger.error(f"Mission Control get_agents error: {e}")
        return {"agents": [], "error": str(e)}


# ─── Stats ───────────────────────────────────────────────────────────────────

def get_stats(**kwargs):
    """Aggregate stats for the dashboard header."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")

    stats = {
        "goals_active": 0,
        "goals_completed": 0,
        "goals_abandoned": 0,
        "goals_overdue": 0,
        "goals_total": 0,
        "agents_running": 0,
        "memories_total": 0,
        "memories_today": 0,
    }

    # Goal stats
    db_path = _goals_db()
    if db_path.exists():
        try:
            conn = _connect(db_path)
            cursor = conn.cursor()
            if scope == "global":
                scope_sql = "scope = ?"
                scope_params = [scope]
            else:
                scope_sql = "scope IN (?, 'global')"
                scope_params = [scope]

            # Count from user_goals table (user-owned goals)
            try:
                cursor.execute(f"SELECT status, COUNT(*) as cnt FROM user_goals WHERE {scope_sql} GROUP BY status", scope_params)
                for row in cursor.fetchall():
                    key = f"goals_{row['status']}"
                    if key in stats:
                        stats[key] = row["cnt"]
                    stats["goals_total"] += row["cnt"]
            except Exception:
                pass  # Table may not exist yet
            conn.close()
        except Exception as e:
            logger.error(f"Mission Control stats goals error: {e}")

    # Agent stats
    try:
        mgr = _get_manager()
        if mgr:
            all_agents = mgr.check_all()
            stats["agents_running"] = sum(1 for a in all_agents if a.get("status") in ("running", "pending"))
    except Exception:
        pass

    # Memory stats (scoped)
    memory_scope = query.get("memory_scope", "")
    mem_path = _memory_db()
    if mem_path.exists():
        try:
            conn = _connect(mem_path)
            cursor = conn.cursor()
            if memory_scope:
                cursor.execute("SELECT COUNT(*) as cnt FROM memories WHERE scope = ?", (memory_scope,))
            else:
                cursor.execute("SELECT COUNT(*) as cnt FROM memories")
            stats["memories_total"] = cursor.fetchone()["cnt"]
            stats["memory_scope"] = memory_scope or "all"

            # Count memories created today
            today = datetime.now().strftime("%Y-%m-%d")
            if memory_scope:
                cursor.execute("SELECT COUNT(*) as cnt FROM memories WHERE scope = ? AND created_at LIKE ?", (memory_scope, today + '%'))
            else:
                cursor.execute("SELECT COUNT(*) as cnt FROM memories WHERE created_at LIKE ?", (today + '%',))
            stats["memories_today"] = cursor.fetchone()["cnt"]
            conn.close()
        except Exception:
            pass

    return stats


def get_memory_scopes(**kwargs):
    """Return all memory scopes with counts."""
    mem_path = _memory_db()
    if not mem_path.exists():
        return {"scopes": [{"name": "default", "count": 0}]}

    try:
        conn = _connect(mem_path)
        cursor = conn.cursor()

        # Get counts per scope
        cursor.execute("SELECT scope, COUNT(*) as cnt FROM memories GROUP BY scope ORDER BY scope")
        scope_counts = {row["scope"]: row["cnt"] for row in cursor.fetchall()}

        # Get registered scopes
        cursor.execute("SELECT name FROM memory_scopes ORDER BY name")
        registered = [row["name"] for row in cursor.fetchall()]

        # Total across all
        cursor.execute("SELECT COUNT(*) as cnt FROM memories")
        total = cursor.fetchone()["cnt"]

        conn.close()

        all_names = sorted(set(registered) | set(scope_counts.keys()) | {"default"})
        scopes = [{"name": name, "count": scope_counts.get(name, 0)} for name in all_names]

        return {"scopes": scopes, "total": total}
    except Exception as e:
        logger.error(f"Mission Control get_memory_scopes error: {e}")
        return {"scopes": [{"name": "default", "count": 0}], "total": 0}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _default_columns():
    """Default Kanban column definitions mapped to goal statuses."""
    return [
        {"id": "active", "title": "Active", "status": "active", "color": "#4a9eff"},
        {"id": "completed", "title": "Completed", "status": "completed", "color": "#4caf50"},
        {"id": "abandoned", "title": "Abandoned", "status": "abandoned", "color": "#888"},
    ]


def get_plugin_info(**kwargs):
    """Get auto-detected info for all plugins (PLUGIN_PROMPT, plugin_launch, etc.)."""
    try:
        from core.api_fastapi import get_system
        system = get_system()
        fm = system.llm_chat.function_manager

        plugin_info = {}
        for mod_name, mod_info in fm.function_modules.items():
            plugin_name = mod_info.get('_plugin', '')
            if not plugin_name or not mod_info.get('executor'):
                continue

            globs = mod_info['executor'].__globals__

            # Initialize plugin entry if not seen yet
            if plugin_name not in plugin_info:
                plugin_info[plugin_name] = {
                    'has_launcher': False,
                    'prompt': None,
                    'type': 'tool'  # default
                }

            # Check for plugin_launch()
            if 'plugin_launch' in globs and callable(globs['plugin_launch']):
                plugin_info[plugin_name]['has_launcher'] = True
                plugin_info[plugin_name]['type'] = 'launcher'

            # Fallback: known launchers for specific plugins
            if not plugin_info[plugin_name]['has_launcher']:
                fallback_fns = {
                    'tandem-browser': '_ensure_tandem_running',
                }
                fn_name = fallback_fns.get(plugin_name)
                if fn_name and fn_name in globs and callable(globs[fn_name]):
                    plugin_info[plugin_name]['has_launcher'] = True
                    plugin_info[plugin_name]['type'] = 'launcher'

            # Check for PLUGIN_PROMPT
            prompt = globs.get('PLUGIN_PROMPT')
            if isinstance(prompt, str) and prompt.strip():
                plugin_info[plugin_name]['prompt'] = prompt.strip()
                if plugin_info[plugin_name]['type'] == 'tool':
                    plugin_info[plugin_name]['type'] = 'prompt'

        return {"success": True, "plugins": plugin_info}
    except Exception as e:
        logger.error(f"Mission Control get_plugin_info error: {e}")
        return {"success": True, "plugins": {}}


def launch_plugin(**kwargs):
    """Launch a plugin directly from the Mission Control launcher.

    Auto-detect pattern: Looks for a `plugin_launch()` function in the plugin's
    tool modules. Plugin authors can add this to make their plugin launchable
    from Mission Control with one click.

    Example in a plugin's tools/*.py file:
        def plugin_launch():
            '''Called by Mission Control to launch this plugin.'''
            _start_my_app()
            return True  # or a status message string

    Falls back to known launchers for existing plugins (e.g. tandem-browser).
    """
    import threading
    body = kwargs.get("body", {})
    plugin_name = body.get("plugin", "")

    if not plugin_name:
        return {"success": False, "error": "No plugin specified"}

    try:
        from core.api_fastapi import get_system
        system = get_system()
        fm = system.llm_chat.function_manager

        # Step 1: Auto-detect — look for plugin_launch() in any of this plugin's tool modules
        launch_fn = None
        for mod_name, mod_info in fm.function_modules.items():
            # Module names follow pattern: plugin_{plugin-name}_{toolfile}
            if mod_info.get('_plugin') == plugin_name and mod_info.get('executor'):
                globs = mod_info['executor'].__globals__
                if 'plugin_launch' in globs and callable(globs['plugin_launch']):
                    launch_fn = globs['plugin_launch']
                    logger.info(f"Mission Control: Found plugin_launch() in {mod_name}")
                    break

        # Step 2: Fallback — known launchers for specific plugins
        if launch_fn is None:
            fallbacks = {
                'tandem-browser': '_ensure_tandem_running',
            }
            if plugin_name in fallbacks:
                fn_name = fallbacks[plugin_name]
                for mod_name, mod_info in fm.function_modules.items():
                    if mod_info.get('_plugin') == plugin_name and mod_info.get('executor'):
                        globs = mod_info['executor'].__globals__
                        if fn_name in globs and callable(globs[fn_name]):
                            launch_fn = globs[fn_name]
                            logger.info(f"Mission Control: Found fallback {fn_name}() in {mod_name}")
                            break

        if launch_fn is None:
            return {"success": False, "error": f"Plugin '{plugin_name}' has no launcher. Add a plugin_launch() function to make it launchable."}

        # Run in background thread so API responds immediately
        def _launch():
            try:
                logger.info(f"Mission Control: Launching {plugin_name}...")
                result = launch_fn()
                logger.info(f"Mission Control: {plugin_name} launch returned: {result}")
            except Exception as e:
                logger.error(f"Mission Control: Failed to launch {plugin_name}: {e}", exc_info=True)

        t = threading.Thread(target=_launch, daemon=True)
        t.start()
        return {"success": True, "message": f"Launching {plugin_name}..."}

    except Exception as e:
        logger.error(f"Mission Control launch_plugin error: {e}")
        return {"success": False, "error": str(e)}


# ─── Notes ────────────────────────────────────────────────────────────────────

def _ensure_notes_table():
    """Create notes table if it doesn't exist."""
    db_path = _goals_db()
    if not db_path.exists():
        return False
    try:
        conn = _connect(db_path)
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute('''
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('CREATE INDEX IF NOT EXISTS idx_notes_scope ON notes(scope)')
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"Notes table init error: {e}")
        return False


def get_notes(**kwargs):
    """List all notes, optionally filtered by scope or search query."""
    query_params = kwargs.get("query", {})
    scope = query_params.get("scope", "default")
    search = query_params.get("search", "").strip()

    if not _ensure_notes_table():
        return {"notes": []}

    try:
        conn = _connect(_goals_db())
        if search:
            rows = conn.execute(
                "SELECT * FROM notes WHERE scope IN (?, 'global') AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC",
                (scope, f"%{search}%", f"%{search}%")
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM notes WHERE scope IN (?, 'global') ORDER BY created_at DESC",
                (scope,)
            ).fetchall()
        conn.close()
        return {"notes": [dict(r) for r in rows]}
    except Exception as e:
        logger.error(f"get_notes error: {e}")
        return {"notes": [], "error": str(e)}


def create_note(**kwargs):
    """Create a new note."""
    body = kwargs.get("body", {})
    title = body.get("title", "").strip()
    content = body.get("content", "").strip()

    if not title:
        return {"error": "Title is required"}
    if not content:
        return {"error": "Content is required"}

    scope = body.get("scope", "default")

    if not _ensure_notes_table():
        return {"error": "Database not initialized"}

    try:
        conn = _connect(_goals_db())
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO notes (title, content, scope) VALUES (?, ?, ?)",
            (title[:200], content[:2000], scope)
        )
        conn.commit()
        note_id = cursor.lastrowid
        conn.close()
        return {"success": True, "id": note_id}
    except Exception as e:
        logger.error(f"create_note error: {e}")
        return {"error": str(e)}


def delete_note(**kwargs):
    """Delete a single note by ID."""
    body = kwargs.get("body", {})
    note_id = body.get("note_id")
    if not note_id:
        return {"error": "note_id is required"}

    try:
        conn = _connect(_goals_db())
        conn.execute("DELETE FROM notes WHERE id = ?", (int(note_id),))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"delete_note error: {e}")
        return {"error": str(e)}


def clear_notes(**kwargs):
    """Delete all notes (with optional scope filter)."""
    body = kwargs.get("body", {})
    scope = body.get("scope", "default")

    try:
        conn = _connect(_goals_db())
        conn.execute("DELETE FROM notes WHERE scope IN (?, 'global')", (scope,))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"clear_notes error: {e}")
        return {"error": str(e)}


def search_notes(**kwargs):
    """Search notes by keyword — used by AI tools."""
    query_params = kwargs.get("query", {})
    q = query_params.get("q", "").strip()
    scope = query_params.get("scope", "default")

    if not q:
        return {"notes": [], "error": "Search query is required"}

    if not _ensure_notes_table():
        return {"notes": []}

    try:
        conn = _connect(_goals_db())
        rows = conn.execute(
            "SELECT * FROM notes WHERE scope IN (?, 'global') AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT 20",
            (scope, f"%{q}%", f"%{q}%")
        ).fetchall()
        conn.close()
        return {"notes": [dict(r) for r in rows]}
    except Exception as e:
        logger.error(f"search_notes error: {e}")
        return {"notes": [], "error": str(e)}


# ─── Self-Reflection: Shared plugin.py loader ────────────────────────────────

def _load_mc_plugin():
    """Load plugin.py for XP and other core functions."""
    import importlib.util
    import sys
    plugin_file = Path(__file__).parent.parent / "plugin.py"
    mod_name = "_mc_plugin_core"
    if mod_name in sys.modules:
        return sys.modules[mod_name]
    spec = importlib.util.spec_from_file_location(mod_name, plugin_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = module
    spec.loader.exec_module(module)
    return module


def _load_reflection():
    """Load plugin.py for self-reflection data access."""
    return _load_mc_plugin()


# ─── Corrections ─────────────────────────────────────────────────────────────

async def get_corrections(**kwargs):
    """List detected corrections."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    limit = int(query.get("limit", 50))
    try:
        plugin = _load_reflection()
        corrections = plugin.get_corrections(scope=scope, limit=limit)
        return {"corrections": corrections}
    except Exception as e:
        logger.error(f"get_corrections error: {e}")
        return {"corrections": [], "error": str(e)}


async def delete_correction(**kwargs):
    """Delete a correction by ID."""
    body = kwargs.get("body", {})
    cid = body.get("id")
    if not cid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        ok = plugin.delete_correction(cid)
        return {"success": ok}
    except Exception as e:
        logger.error(f"delete_correction error: {e}")
        return {"error": str(e)}


# ─── Reflections ─────────────────────────────────────────────────────────────

async def get_reflections(**kwargs):
    """List self-reflections."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    limit = int(query.get("limit", 50))
    try:
        plugin = _load_reflection()
        reflections = plugin.get_reflections(scope=scope, limit=limit)
        return {"reflections": reflections}
    except Exception as e:
        logger.error(f"get_reflections error: {e}")
        return {"reflections": [], "error": str(e)}


async def delete_reflection(**kwargs):
    """Delete a reflection by ID."""
    body = kwargs.get("body", {})
    rid = body.get("id")
    if not rid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        ok = plugin.delete_reflection(rid)
        return {"success": ok}
    except Exception as e:
        logger.error(f"delete_reflection error: {e}")
        return {"error": str(e)}


# ─── Learned Rules ───────────────────────────────────────────────────────────

async def get_rules(**kwargs):
    """List all learned rules (active and inactive)."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        plugin = _load_reflection()
        rules = plugin.get_all_rules(scope=scope)
        return {"rules": rules}
    except Exception as e:
        logger.error(f"get_rules error: {e}")
        return {"rules": [], "error": str(e)}


async def create_rule(**kwargs):
    """Create a new learned rule (manual 'hypnosis' injection)."""
    body = kwargs.get("body", {})
    rule = body.get("rule", "").strip()
    if not rule:
        return {"error": "Rule text is required"}
    scope = body.get("scope", "default")
    try:
        plugin = _load_reflection()
        rid = plugin.save_learned_rule(rule=rule, source="manual", vfm_score=1.0, scope=scope)
        return {"success": True, "id": rid}
    except Exception as e:
        logger.error(f"create_rule error: {e}")
        return {"error": str(e)}


async def update_rule(**kwargs):
    """Update a rule's text or score."""
    body = kwargs.get("body", {})
    rid = body.get("id")
    if not rid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        fields = {}
        if "rule" in body:
            fields["rule"] = body["rule"]
        if "vfm_score" in body:
            fields["vfm_score"] = float(body["vfm_score"])
        ok = plugin.update_rule(rid, **fields)
        return {"success": ok}
    except Exception as e:
        logger.error(f"update_rule error: {e}")
        return {"error": str(e)}


async def toggle_rule(**kwargs):
    """Toggle a rule active/inactive."""
    body = kwargs.get("body", {})
    rid = body.get("id")
    active = body.get("active", True)
    if not rid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        ok = plugin.toggle_rule(rid, active)
        return {"success": ok}
    except Exception as e:
        logger.error(f"toggle_rule error: {e}")
        return {"error": str(e)}


async def delete_rule(**kwargs):
    """Delete a learned rule."""
    body = kwargs.get("body", {})
    rid = body.get("id")
    if not rid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        ok = plugin.delete_rule(rid)
        return {"success": ok}
    except Exception as e:
        logger.error(f"delete_rule error: {e}")
        return {"error": str(e)}


# ─── Bulletin Board ──────────────────────────────────────────────────────────

async def get_bulletins(**kwargs):
    """List bulletin board entries."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    status = query.get("status", None)
    try:
        plugin = _load_reflection()
        bulletins = plugin.get_bulletins(scope=scope, status=status)
        return {"bulletins": bulletins}
    except Exception as e:
        logger.error(f"get_bulletins error: {e}")
        return {"bulletins": [], "error": str(e)}


async def create_bulletin(**kwargs):
    """Create a bulletin board request (usually from AI tools)."""
    body = kwargs.get("body", {})
    request_type = body.get("request_type", "")
    title = body.get("title", "").strip()
    if not request_type or not title:
        return {"error": "request_type and title are required"}
    scope = body.get("scope", "default")
    try:
        plugin = _load_reflection()
        bid = plugin.save_bulletin(
            request_type=request_type,
            title=title,
            description=body.get("description", ""),
            reason=body.get("reason", ""),
            scope=scope
        )
        return {"success": True, "id": bid}
    except Exception as e:
        logger.error(f"create_bulletin error: {e}")
        return {"error": str(e)}


async def update_bulletin(**kwargs):
    """Approve or deny a bulletin board request."""
    body = kwargs.get("body", {})
    bid = body.get("id")
    status = body.get("status")
    if not bid or not status:
        return {"error": "id and status are required"}
    try:
        plugin = _load_reflection()

        # If approving a rule_promotion, create the learned rule
        if status == "approved":
            bulletins = plugin.get_bulletins(scope="default", limit=200)
            bulletin = next((b for b in bulletins if b["id"] == int(bid)), None)
            if bulletin and bulletin["request_type"] == "rule_promotion":
                desc = bulletin.get("description", "")
                rule_text = desc.replace("Proposed rule: ", "", 1) if desc.startswith("Proposed rule: ") else desc
                if rule_text:
                    plugin.save_learned_rule(
                        rule=rule_text,
                        source="auto",
                        vfm_score=0.7,
                        scope=bulletin.get("scope", "default")
                    )

        ok = plugin.update_bulletin_status(bid, status)
        return {"success": ok}
    except Exception as e:
        logger.error(f"update_bulletin error: {e}")
        return {"error": str(e)}


async def delete_bulletin(**kwargs):
    """Delete a bulletin board entry."""
    body = kwargs.get("body", {})
    bid = body.get("id")
    if not bid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        ok = plugin.delete_bulletin(bid)
        return {"success": ok}
    except Exception as e:
        logger.error(f"delete_bulletin error: {e}")
        return {"error": str(e)}


# ─── Capsules ────────────────────────────────────────────────────────────────

async def get_capsules(**kwargs):
    """List reasoning capsules."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        plugin = _load_reflection()
        capsules = plugin.get_capsules(scope=scope)
        return {"capsules": capsules}
    except Exception as e:
        logger.error(f"get_capsules error: {e}")
        return {"capsules": [], "error": str(e)}


async def delete_capsule(**kwargs):
    """Delete a capsule."""
    body = kwargs.get("body", {})
    cid = body.get("id")
    if not cid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        ok = plugin.delete_capsule(cid)
        return {"success": ok}
    except Exception as e:
        logger.error(f"delete_capsule error: {e}")
        return {"error": str(e)}


# ─── Reflection Batch ─────────────────────────────────────────────��──────────

async def get_reflection_batch(**kwargs):
    """Return all reflection data in a single request (saves 4 rate-limited calls)."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    limit = int(query.get("limit", 50))
    result = {}
    try:
        plugin = _load_reflection()
        result["corrections"] = plugin.get_corrections(scope=scope, limit=limit)
        result["reflections"] = plugin.get_reflections(scope=scope, limit=limit)
        result["rules"] = plugin.get_all_rules(scope=scope)
        result["bulletins"] = plugin.get_bulletins(scope=scope)
        result["capsules"] = plugin.get_capsules(scope=scope)
    except Exception as e:
        logger.error(f"get_reflection_batch error: {e}")
        result["error"] = str(e)
    return result


# ─── Reflection Stats ────────────────────────────────────────────────────────

async def get_reflection_stats(**kwargs):
    """Get counts for all self-reflection data."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        plugin = _load_reflection()
        stats = plugin.get_reflection_stats(scope=scope)
        return stats
    except Exception as e:
        logger.error(f"get_reflection_stats error: {e}")
        return {"corrections": 0, "reflections": 0, "rules_active": 0, "rules_total": 0, "bulletins_pending": 0, "capsules": 0}


# ─── Tool Status ────────────────────────────────────────────────────────────

async def get_tool_status(**kwargs):
    """Get Mission Control tool registration and enabled status."""
    try:
        from core.api_fastapi import get_system
        import importlib.util

        system = get_system()
        if not system or not hasattr(system, 'llm_chat'):
            return {"tools": [], "error": "System not ready"}

        fm = system.llm_chat.function_manager

        # Load MC tool definitions from tools/mission.py
        tools_path = Path(__file__).parent.parent / "tools" / "mission.py"
        spec = importlib.util.spec_from_file_location("_mc_tools", str(tools_path))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        # Get enabled tool names once (not per-tool)
        enabled_names = set(fm.get_enabled_function_names())

        mc_tools = []
        for tool_def in getattr(mod, 'TOOLS', []):
            fn = tool_def.get("function", {})
            name = fn.get("name", "")
            desc = fn.get("description", "")
            params = fn.get("parameters", {}).get("properties", {})
            param_names = list(params.keys())

            mc_tools.append({
                "name": name,
                "description": desc,
                "params": param_names,
                "enabled": name in enabled_names,
            })

        # Current toolset info
        toolset_info = fm.get_current_toolset_info()

        return {
            "tools": mc_tools,
            "toolset": toolset_info,
        }
    except Exception as e:
        logger.error(f"get_tool_status error: {e}")
        return {"tools": [], "error": str(e)}


# ─── Calendar Events ───────────────────────────────────────────────────────

async def get_calendar_events(**kwargs):
    """Get calendar events for a date range, plus goal/note timeline data."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    start = query.get("start")  # YYYY-MM-DD
    end = query.get("end")      # YYYY-MM-DD
    try:
        plugin = _load_reflection()

        # Custom calendar events
        events = plugin.get_calendar_events(scope=scope, start=start, end=end)

        # Also gather goals with dates for the calendar
        goal_events = []
        if start and end:
            db = _goals_db()
            conn = sqlite3.connect(str(db), timeout=5)
            conn.row_factory = sqlite3.Row

            # User goals created in range
            rows = conn.execute(
                "SELECT id, title, description, status, priority, created_at, completed_at FROM user_goals WHERE created_at >= ? AND created_at <= ? ORDER BY created_at",
                (start, end + " 23:59:59")
            ).fetchall()
            for r in rows:
                pri_label = {"high": "High priority", "medium": "Medium priority", "low": "Low priority"}.get(r["priority"], "")
                goal_events.append({
                    "id": f"goal-{r['id']}",
                    "title": r["title"],
                    "description": r["description"] or "",
                    "start_date": r["created_at"][:10] if r["created_at"] else start,
                    "end_date": r["created_at"][:10] if r["created_at"] else start,
                    "start_time": r["created_at"][11:16] if r["created_at"] and len(r["created_at"]) > 15 else None,
                    "category": "goal",
                    "color": {"high": "#f44336", "medium": "#ff9800", "low": "#4caf50"}.get(r["priority"], "#4a9eff"),
                    "status": r["status"],
                    "priority": r["priority"],
                    "detail": f"{pri_label} \u2022 Status: {r['status']}",
                    "_source": "goal",
                })

            # User goals completed in range
            rows = conn.execute(
                "SELECT id, title, description, status, priority, completed_at FROM user_goals WHERE completed_at IS NOT NULL AND completed_at >= ? AND completed_at <= ?",
                (start, end + " 23:59:59")
            ).fetchall()
            for r in rows:
                goal_events.append({
                    "id": f"goal-done-{r['id']}",
                    "title": f"\u2705 {r['title']}",
                    "description": r["description"] or "",
                    "start_date": r["completed_at"][:10],
                    "end_date": r["completed_at"][:10],
                    "start_time": r["completed_at"][11:16] if r["completed_at"] and len(r["completed_at"]) > 15 else None,
                    "category": "completed",
                    "color": "#4caf50",
                    "priority": r["priority"],
                    "detail": f"Completed at {r['completed_at'][11:16] if r['completed_at'] and len(r['completed_at']) > 15 else 'unknown'}",
                    "_source": "goal_completed",
                })

            # Notes created in range
            try:
                rows = conn.execute(
                    "SELECT id, title, content, created_at FROM notes WHERE created_at >= ? AND created_at <= ? ORDER BY created_at",
                    (start, end + " 23:59:59")
                ).fetchall()
                for r in rows:
                    preview = (r["content"] or "")[:150]
                    goal_events.append({
                        "id": f"note-{r['id']}",
                        "title": f"\U0001f4dd {r['title']}",
                        "description": preview,
                        "start_date": r["created_at"][:10] if r["created_at"] else start,
                        "end_date": r["created_at"][:10] if r["created_at"] else start,
                        "category": "note",
                        "color": "#9c27b0",
                        "_source": "note",
                    })
            except Exception:
                pass  # Notes table might not exist

            conn.close()

        return {
            "events": events,
            "timeline": goal_events,
        }
    except Exception as e:
        logger.error(f"get_calendar_events error: {e}")
        return {"events": [], "timeline": [], "error": str(e)}


async def create_calendar_event(**kwargs):
    """Create a calendar event, optionally with recurrence."""
    body = kwargs.get("body", {})
    title = body.get("title", "").strip()
    start_date = body.get("start_date", "").strip()
    if not title or not start_date:
        return {"error": "title and start_date are required"}
    try:
        plugin = _load_reflection()
        reminder_val = body.get("reminder_minutes")
        reminder_minutes = int(reminder_val) if reminder_val is not None and str(reminder_val) != "" else None
        chime_val = body.get("chime_count")
        chime_count = int(chime_val) if chime_val is not None and str(chime_val) != "" else 3
        recurrence = body.get("recurrence")
        eid = plugin.save_calendar_event(
            title=title,
            start_date=start_date,
            end_date=body.get("end_date", start_date),
            description=body.get("description", ""),
            all_day=body.get("all_day", 1),
            color=body.get("color", "#4a9eff"),
            category=body.get("category", "event"),
            scope=body.get("scope", "default"),
            start_time=body.get("start_time"),
            reminder_minutes=reminder_minutes,
            chime_count=chime_count,
            recurrence=recurrence,
        )
        return {"success": True, "id": eid}
    except Exception as e:
        logger.error(f"create_calendar_event error: {e}")
        return {"error": str(e)}


async def update_calendar_event(**kwargs):
    """Update a calendar event, optionally with recurrence changes."""
    body = kwargs.get("body", {})
    eid = body.get("id")
    if not eid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        fields = {}
        for k in ("title", "description", "start_date", "end_date", "start_time", "all_day", "color", "category", "reminder_minutes", "chime_count", "status"):
            if k in body:
                fields[k] = body[k]
        # If reminder settings changed, reset reminded flag
        if "reminder_minutes" in body or "start_time" in body or "start_date" in body:
            fields["reminded"] = 0
        # Pass recurrence through if provided
        if "recurrence" in body:
            fields["recurrence"] = body["recurrence"]
        ok = plugin.update_calendar_event(eid, **fields)

        # XP: award on complete, deduct on uncomplete
        xp_awarded = 0
        xp_deducted = 0
        scope = body.get("scope", "default")
        if body.get("status") == "completed":
            xp_awarded = 20
            try:
                db_path = _goals_db()
                conn = _connect(db_path)
                cursor = conn.cursor()
                _award_xp_direct(cursor, conn, "event_complete", xp_awarded, eid, scope)
                conn.close()
                logger.info(f"XP: Awarded {xp_awarded} for calendar event {eid} completion")
            except Exception as xp_err:
                logger.warning(f"XP award for event {eid} failed: {xp_err}")
        elif body.get("status") == "active":
            xp_deducted = 20
            try:
                db_path = _goals_db()
                conn = _connect(db_path)
                cursor = conn.cursor()
                _deduct_xp_direct(cursor, conn, "event_uncomplete", xp_deducted, eid, scope)
                conn.close()
                logger.info(f"XP: Deducted {xp_deducted} for calendar event {eid} uncomplete")
            except Exception as xp_err:
                logger.warning(f"XP deduct for event {eid} failed: {xp_err}")

        return {"success": ok, "xp_awarded": xp_awarded, "xp_deducted": xp_deducted}
    except Exception as e:
        logger.error(f"update_calendar_event error: {e}")
        return {"error": str(e)}


async def delete_calendar_event(**kwargs):
    """Delete a calendar event. For recurring: mode='this' adds exception, mode='all_future' ends rule, mode='all' deletes."""
    body = kwargs.get("body", {})
    eid = body.get("id")
    if not eid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        mode = body.get("mode", "all")  # 'all', 'this', 'all_future'
        rule_id = body.get("rule_id")
        event_date = body.get("event_date")

        if mode == "this" and rule_id and event_date:
            # Skip just this occurrence
            ok = plugin.add_recurring_exception(rule_id, event_date)
            return {"success": ok}
        elif mode == "all_future" and rule_id and event_date:
            # End the rule the day before this occurrence
            ok = plugin.end_recurring_rule(rule_id, event_date)
            return {"success": ok}
        else:
            # Delete the base event and its rule entirely
            ok = plugin.delete_calendar_event(eid)
            return {"success": ok}
    except Exception as e:
        logger.error(f"delete_calendar_event error: {e}")
        return {"error": str(e)}


async def check_calendar_reminders(**kwargs):
    """Check for due calendar reminders. Called by frontend polling."""
    try:
        plugin = _load_reflection()
        due = plugin.get_due_reminders()
        return {"reminders": due}
    except Exception as e:
        logger.error(f"check_calendar_reminders error: {e}")
        return {"reminders": [], "error": str(e)}


# ─── Daily Plans ─────────────────────────────────────────────────────────────

async def get_daily_plan(**kwargs):
    """Get the daily plan for a given date (default: today)."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    plan_date = query.get("date", datetime.now().strftime("%Y-%m-%d"))
    try:
        plugin = _load_reflection()
        plan = plugin.get_daily_plan(plan_date, scope)
        return {"plan": plan}
    except Exception as e:
        logger.error(f"get_daily_plan error: {e}")
        return {"error": str(e)}


async def save_daily_plan(**kwargs):
    """Save today's daily plan (list of goal IDs)."""
    body = kwargs.get("body", {})
    query = kwargs.get("query", {})
    scope = query.get("scope", body.get("scope", "default"))
    plan_date = body.get("date", datetime.now().strftime("%Y-%m-%d"))
    goal_ids = body.get("goal_ids", [])
    try:
        plugin = _load_reflection()
        plan_id = plugin.save_daily_plan(plan_date, goal_ids, scope)
        if plan_id:
            return {"success": True, "id": plan_id}
        return {"error": "Failed to save plan"}
    except Exception as e:
        logger.error(f"save_daily_plan error: {e}")
        return {"error": str(e)}


async def complete_daily_plan(**kwargs):
    """Mark today's plan as completed."""
    body = kwargs.get("body", {})
    query = kwargs.get("query", {})
    scope = query.get("scope", body.get("scope", "default"))
    plan_date = body.get("date", datetime.now().strftime("%Y-%m-%d"))
    try:
        plugin = _load_reflection()
        ok = plugin.complete_daily_plan(plan_date, scope)
        return {"success": ok}
    except Exception as e:
        logger.error(f"complete_daily_plan error: {e}")
        return {"error": str(e)}


# ─── Daily Notes ─────────────────────────────────────────────────────────────

async def get_daily_note(**kwargs):
    """Get the daily note for a given date (default: today)."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    note_date = query.get("date", datetime.now().strftime("%Y-%m-%d"))
    try:
        plugin = _load_mc_plugin()
        note = plugin.get_daily_note(note_date, scope)
        return {"note": note}
    except Exception as e:
        logger.error(f"get_daily_note error: {e}")
        return {"error": str(e)}


async def save_daily_note(**kwargs):
    """Save the daily note for a given date."""
    body = kwargs.get("body", {})
    scope = body.get("scope", "default")
    note_date = body.get("date", datetime.now().strftime("%Y-%m-%d"))
    content = body.get("content", "")
    try:
        plugin = _load_mc_plugin()
        note_id = plugin.save_daily_note(note_date, content, scope)
        if note_id:
            return {"success": True, "id": note_id}
        return {"error": "Failed to save note"}
    except Exception as e:
        logger.error(f"save_daily_note error: {e}")
        return {"error": str(e)}


async def delete_daily_note(**kwargs):
    """Delete the daily note for a given date."""
    body = kwargs.get("body", {})
    scope = body.get("scope", "default")
    note_date = body.get("date", datetime.now().strftime("%Y-%m-%d"))
    try:
        plugin = _load_mc_plugin()
        ok = plugin.delete_daily_note(note_date, scope)
        return {"success": ok}
    except Exception as e:
        logger.error(f"delete_daily_note error: {e}")
        return {"error": str(e)}


# ─── XP & Achievements ──────────────────────────────────────────────────────

async def get_xp_status(**kwargs):
    """Get current XP total, level, and recent gains."""
    import math, json
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        db_path = _goals_db()
        if not db_path.exists():
            return {"total_xp": 0, "level": 0, "next_level_xp": 100, "progress": 0, "today_xp": 0, "recent": []}
        conn = _connect(db_path)
        cursor = conn.cursor()
        _ensure_xp_table(cursor, conn)

        row = cursor.execute("SELECT COALESCE(SUM(xp_amount), 0) as total FROM xp_log WHERE scope = ?", (scope,)).fetchone()
        total = max(0, row["total"] if row else 0)  # Floor at 0
        level = int(math.floor(math.sqrt(total / 100))) if total > 0 else 0
        next_level = (level + 1) ** 2 * 100
        current_level_xp = level ** 2 * 100
        progress = (total - current_level_xp) / max(1, next_level - current_level_xp)

        today = datetime.now().strftime("%Y-%m-%d")
        today_row = cursor.execute("SELECT COALESCE(SUM(xp_amount), 0) as today_xp FROM xp_log WHERE scope = ? AND created_at >= ?", (scope, today)).fetchone()

        recent = cursor.execute("SELECT * FROM xp_log WHERE scope = ? ORDER BY created_at DESC LIMIT 10", (scope,)).fetchall()
        conn.close()

        return {
            "total_xp": total,
            "level": level,
            "next_level_xp": next_level,
            "current_level_xp": current_level_xp,
            "progress": round(progress, 3),
            "today_xp": today_row["today_xp"] if today_row else 0,
            "recent": [dict(r) for r in recent],
        }
    except Exception as e:
        logger.error(f"get_xp_status error: {e}", exc_info=True)
        return {"total_xp": 0, "level": 0, "next_level_xp": 100, "progress": 0, "today_xp": 0, "recent": [], "error": str(e)}


async def award_xp(**kwargs):
    """Award XP for an action."""
    import json as _json
    body = kwargs.get("body", {})
    query = kwargs.get("query", {})
    scope = query.get("scope", body.get("scope", "default"))
    action = body.get("action", "manual")
    amount = int(body.get("amount", 0))
    details = body.get("details")
    if amount <= 0:
        return {"error": "amount must be positive"}
    try:
        db_path = _goals_db()
        conn = _connect(db_path)
        cursor = conn.cursor()
        _award_xp_direct(cursor, conn, action, amount, _json.dumps(details) if details else None, scope)
        conn.close()
        return {"success": True}
    except Exception as e:
        logger.error(f"award_xp error: {e}")
        return {"error": str(e)}


async def get_achievements(**kwargs):
    """Get all unlocked achievements."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        plugin = _load_reflection()
        achs = plugin.get_achievements(scope)
        return {"achievements": achs}
    except Exception as e:
        logger.error(f"get_achievements error: {e}")
        return {"error": str(e)}


# ─── Habits ──────────────────────────────────────────────────────────────────

async def get_habits(**kwargs):
    """Get all active habits."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        plugin = _load_reflection()
        habits = plugin.get_habits(scope)
        return {"habits": habits}
    except Exception as e:
        logger.error(f"get_habits error: {e}")
        return {"error": str(e)}


async def create_habit(**kwargs):
    """Create a new habit."""
    body = kwargs.get("body", {})
    query = kwargs.get("query", {})
    scope = query.get("scope", body.get("scope", "default"))
    name = body.get("name", "").strip()
    if not name:
        return {"error": "name is required"}
    try:
        plugin = _load_reflection()
        habit_id = plugin.save_habit(
            name,
            icon=body.get("icon", "✅"),
            frequency=body.get("frequency", "daily"),
            target_days=body.get("target_days"),
            scope=scope
        )
        if habit_id:
            return {"success": True, "id": habit_id}
        return {"error": "Failed to create habit"}
    except Exception as e:
        logger.error(f"create_habit error: {e}")
        return {"error": str(e)}


async def update_habit(**kwargs):
    """Update a habit."""
    body = kwargs.get("body", {})
    habit_id = body.get("id")
    if not habit_id:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        ok = plugin.update_habit(habit_id, **{k: v for k, v in body.items() if k != "id"})
        return {"success": ok}
    except Exception as e:
        logger.error(f"update_habit error: {e}")
        return {"error": str(e)}


async def toggle_habit(**kwargs):
    """Toggle habit completion for today."""
    body = kwargs.get("body", {})
    query = kwargs.get("query", {})
    scope = query.get("scope", body.get("scope", "default"))
    habit_id = body.get("id")
    date_str = body.get("date", datetime.now().strftime("%Y-%m-%d"))
    if not habit_id:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        result = plugin.toggle_habit_completion(habit_id, date_str, scope)
        return {"success": True, "completed": result}
    except Exception as e:
        logger.error(f"toggle_habit error: {e}")
        return {"error": str(e)}


async def get_habit_stats(**kwargs):
    """Get habit stats including streaks."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        plugin = _load_reflection()
        stats = plugin.get_habit_stats(scope)
        return {"habits": stats}
    except Exception as e:
        logger.error(f"get_habit_stats error: {e}")
        return {"error": str(e)}


# ─── Focus Sessions ─────────────────────────────────────────────────────────

async def start_focus(**kwargs):
    """Start a focus session."""
    body = kwargs.get("body", {})
    query = kwargs.get("query", {})
    scope = query.get("scope", body.get("scope", "default"))
    goal_id = body.get("goal_id")
    session_type = body.get("type", "work")
    try:
        plugin = _load_reflection()
        session_id = plugin.start_focus_session(goal_id, session_type, scope)
        if session_id:
            return {"success": True, "id": session_id}
        return {"error": "Failed to start session"}
    except Exception as e:
        logger.error(f"start_focus error: {e}")
        return {"error": str(e)}


async def stop_focus(**kwargs):
    """Stop a focus session."""
    body = kwargs.get("body", {})
    session_id = body.get("id")
    if not session_id:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        duration = plugin.stop_focus_session(session_id)
        return {"success": True, "duration_minutes": duration}
    except Exception as e:
        logger.error(f"stop_focus error: {e}")
        return {"error": str(e)}


async def get_focus_stats(**kwargs):
    """Get focus session stats."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        plugin = _load_reflection()
        stats = plugin.get_focus_stats(scope)
        return stats
    except Exception as e:
        logger.error(f"get_focus_stats error: {e}")
        return {"error": str(e)}


# ─── Pixel Pet Backend ──────────────────────────────────────────────────────

_pet_table_ready = False


def _ensure_pet_table(cursor, conn):
    """Create pet_state table if it doesn't exist (idempotent)."""
    global _pet_table_ready
    if _pet_table_ready:
        return
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS pet_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL DEFAULT 'default',
            pet_name TEXT DEFAULT 'Byte',
            dismissed_clutter TEXT DEFAULT '[]',
            last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_scope ON pet_state(scope)')
    conn.commit()
    _pet_table_ready = True


async def get_pet_status(**kwargs):
    """Get Pixel Pet status — hunger, happiness, cleanliness, evolution, clutter."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    try:
        db_path = _goals_db()
        conn = _connect(db_path)
        cursor = conn.cursor()

        _ensure_pet_table(cursor, conn)

        # Get or create pet_state row
        pet_row = cursor.execute(
            "SELECT * FROM pet_state WHERE scope = ?", (scope,)
        ).fetchone()
        if not pet_row:
            cursor.execute(
                "INSERT INTO pet_state (scope) VALUES (?)", (scope,)
            )
            conn.commit()
            pet_row = cursor.execute(
                "SELECT * FROM pet_state WHERE scope = ?", (scope,)
            ).fetchone()

        pet_name = pet_row["pet_name"]
        last_visit = pet_row["last_visit"]

        # ── Time away ──
        hours_away = 0
        if last_visit:
            try:
                hours_away = (datetime.now() - datetime.strptime(str(last_visit), "%Y-%m-%d %H:%M:%S")).total_seconds() / 3600
            except Exception:
                hours_away = 0

        today = datetime.now().strftime("%Y-%m-%d")

        # ── Hunger (0-100) ──
        base = 30
        goals_today = 0
        try:
            goals_today = cursor.execute(
                "SELECT COUNT(*) FROM user_goals WHERE completed_at >= ? AND (scope = ? OR scope = 'global')",
                (today, scope)
            ).fetchone()[0]
        except Exception:
            pass  # Table may not exist yet
        goals_bonus = min(goals_today * 15, 40)

        plan_row = cursor.execute(
            "SELECT completed FROM daily_plans WHERE plan_date = ? AND scope = ?",
            (today, scope)
        ).fetchone()
        plan_bonus = 20 if (plan_row and plan_row["completed"]) else 0

        _ensure_xp_table(cursor, conn)
        xp_today_row = cursor.execute(
            "SELECT COALESCE(SUM(xp_amount), 0) as t FROM xp_log WHERE scope = ? AND created_at >= ?",
            (scope, today)
        ).fetchone()
        xp_today = xp_today_row["t"] if xp_today_row else 0
        xp_bonus = min(int(xp_today / 10), 10)

        decay = int(hours_away * 5) if hours_away > 0.5 else 0
        hunger = max(10, min(100, base + goals_bonus + plan_bonus + xp_bonus - decay))

        # ── Happiness (0-100) ──
        total_xp_row = cursor.execute(
            "SELECT COALESCE(SUM(xp_amount), 0) as t FROM xp_log WHERE scope = ?",
            (scope,)
        ).fetchone()
        total_xp = max(0, total_xp_row["t"] if total_xp_row else 0)
        level = int(math.floor(math.sqrt(total_xp / 100))) if total_xp > 0 else 0
        level_bonus = min(level * 3, 30)

        reflections_7d = 0
        try:
            week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
            ref_row = cursor.execute(
                "SELECT COUNT(*) FROM reflections WHERE scope = ? AND created_at >= ?",
                (scope, week_ago)
            ).fetchone()
            reflections_7d = ref_row[0] if ref_row else 0
        except Exception:
            pass
        ref_bonus = min(reflections_7d * 5, 20)

        habit_bonus = 0
        try:
            habits = cursor.execute(
                "SELECT COUNT(*) FROM habit_completions WHERE completed_at >= ?",
                (today,)
            ).fetchone()
            habit_bonus = min((habits[0] if habits else 0) * 5, 25)
        except Exception:
            pass

        # Chat activity bonus — each chat today adds a small happiness boost
        chat_bonus = 0
        try:
            chat_row = cursor.execute(
                "SELECT COUNT(*) FROM xp_log WHERE action = 'chat' AND scope = ? AND created_at >= ?",
                (scope, today)
            ).fetchone()
            chats_today = chat_row[0] if chat_row else 0
            chat_bonus = min(chats_today * 2, 20)  # +2 per chat, cap at +20
        except Exception:
            pass

        # Play bonus — each play today boosts happiness
        play_bonus = 0
        try:
            play_row = cursor.execute(
                "SELECT COUNT(*) FROM xp_log WHERE action = 'pet_play' AND scope = ? AND created_at >= ?",
                (scope, today)
            ).fetchone()
            plays = play_row[0] if play_row else 0
            play_bonus = min(plays * 5, 25)  # +5 per play, cap at +25
        except Exception:
            pass

        happiness_decay = int(hours_away * 3) if hours_away > 0.5 else 0
        happiness = max(15, min(100, 10 + level_bonus + ref_bonus + habit_bonus + chat_bonus + play_bonus - happiness_decay))

        # ── Cleanliness (0-100) ──
        # Based on stale user goals (no abandoned concept in user goals)
        week_ago_str = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        stale = 0
        try:
            stale = cursor.execute(
                "SELECT COUNT(*) FROM user_goals WHERE status = 'active' AND updated_at < ? AND (scope = ? OR scope = 'global')",
                (week_ago_str, scope)
            ).fetchone()[0]
        except Exception:
            pass
        stale_penalty = min(stale * 5, 30)
        cleanliness = max(0, 100 - stale_penalty)

        # ── Evolution stage ──
        if level >= 15:
            stage, stage_name = 5, "master"
        elif level >= 10:
            stage, stage_name = 4, "adult"
        elif level >= 6:
            stage, stage_name = 3, "teen"
        elif level >= 3:
            stage, stage_name = 2, "child"
        elif level >= 1:
            stage, stage_name = 1, "baby"
        else:
            stage, stage_name = 0, "egg"

        # ── Clutter items ──
        dismissed = json.loads(pet_row["dismissed_clutter"] or '[]') if pet_row else []
        clutter = []
        # Stale user goals generate paper clutter
        try:
            stale_goals = cursor.execute(
                "SELECT id, title FROM user_goals WHERE status = 'active' AND updated_at < ? AND (scope = ? OR scope = 'global') LIMIT 10",
                (week_ago_str, scope)
            ).fetchall()
            for g in stale_goals:
                if g["id"] not in dismissed:
                    clutter.append({"id": g["id"], "type": "papers", "label": g["title"][:30]})
        except Exception:
            pass

        # ── Dust bunnies (time-based clutter) ──
        # Accumulate ~1 dust bunny per hour since last cleaning, max 12
        # Each bunny grows every 30 min (size 1→2→3)
        # IDs are epoch-based so dismissed dust doesn't block new dust
        dust_count = 0
        last_clean = datetime.now()
        try:
            last_clean_row = cursor.execute(
                "SELECT MAX(created_at) as t FROM xp_log WHERE action = 'pet_clean' AND scope = ?",
                (scope,)
            ).fetchone()
            last_clean_str = last_clean_row["t"] if last_clean_row and last_clean_row["t"] else None
            if last_clean_str:
                last_clean = datetime.strptime(str(last_clean_str)[:19], "%Y-%m-%d %H:%M:%S")
            else:
                # Never cleaned — use pet creation time
                last_clean = datetime.strptime(str(pet_row["created_at"])[:19], "%Y-%m-%d %H:%M:%S") if pet_row else datetime.now()
            hours_since_clean = (datetime.now() - last_clean).total_seconds() / 3600
            dust_count = min(int(hours_since_clean), 12)  # 1 per hour, max 12
        except Exception:
            pass

        # Use epoch of last_clean as base for dust IDs so each cycle gets unique IDs
        dust_epoch = int(last_clean.timestamp())
        now_ts = datetime.now().timestamp()

        # Prune old dismissed dust entries that no longer match current epoch
        dismissed = [d for d in dismissed if not (isinstance(d, str) and d.startswith("dust_")) or d.startswith(f"dust_{dust_epoch}_")]

        for di in range(dust_count):
            dust_id = f"dust_{dust_epoch}_{di}"
            if dust_id not in dismissed:
                # Each bunny spawns 1h apart from last_clean; age determines size
                bunny_spawn_ts = last_clean.timestamp() + (di * 3600)
                age_minutes = (now_ts - bunny_spawn_ts) / 60
                size = min(int(age_minutes / 30) + 1, 3)  # grows every 30min: 1→2→3
                clutter.append({"id": dust_id, "type": "dust", "label": "Dust bunny", "size": size})

        # Factor dust into cleanliness — bigger bunnies penalize more
        dust_penalty = sum(c.get("size", 1) * 3 for c in clutter if c["type"] == "dust")
        dust_penalty = min(dust_penalty, 50)
        cleanliness = max(0, cleanliness - dust_penalty)

        # ── Play count today ──
        plays_today = 0
        try:
            play_row = cursor.execute(
                "SELECT COUNT(*) FROM xp_log WHERE action = 'pet_play' AND scope = ? AND created_at >= ?",
                (scope, today)
            ).fetchone()
            plays_today = play_row[0] if play_row else 0
        except Exception:
            pass

        # ── Mood ──
        stats_map = {"hungry": hunger, "happy": happiness, "dirty": cleanliness}
        lowest_key = min(stats_map, key=stats_map.get)
        lowest_val = stats_map[lowest_key]
        if lowest_val >= 70:
            mood = "happy"
        elif lowest_val >= 40:
            mood = "content"
        elif lowest_key == "hungry":
            mood = "hungry"
        elif lowest_key == "dirty":
            mood = "dirty"
        else:
            mood = "sad"

        # Persist pruned dismissed list + update last_visit
        cursor.execute(
            "UPDATE pet_state SET dismissed_clutter = ?, last_visit = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE scope = ?",
            (json.dumps(dismissed), scope)
        )
        conn.commit()
        conn.close()

        return {
            "pet_name": pet_name,
            "hunger": hunger,
            "happiness": happiness,
            "cleanliness": cleanliness,
            "evolution": stage,
            "evolution_name": stage_name,
            "level": level,
            "total_xp": total_xp,
            "clutter": clutter,
            "goals_today": goals_today,
            "today_xp": xp_today,
            "mood": mood,
            "plays_today": plays_today,
            "max_plays": 5,
        }
    except Exception as e:
        logger.error(f"get_pet_status error: {e}")
        return {"error": str(e)}


async def pet_interact(**kwargs):
    """Handle pet interactions — clutter dismissal, playing, dust cleaning."""
    body = kwargs.get("body", {})
    action = body.get("action")
    scope = body.get("scope", "default")

    if action == "play":
        return _pet_play(scope)
    elif action == "clean_dust":
        return _pet_clean_dust(scope, body.get("dust_id"))
    elif action == "dismiss_clutter":
        return _pet_dismiss_clutter(scope, body.get("goal_id"))
    else:
        return {"error": f"Unknown action: {action}"}


def _pet_play(scope):
    """Play with the pet — +1 XP, happiness boost. Capped at 5 plays/day."""
    try:
        db_path = _goals_db()
        conn = _connect(db_path)
        cursor = conn.cursor()
        _ensure_xp_table(cursor, conn)

        today = datetime.now().strftime("%Y-%m-%d")
        play_row = cursor.execute(
            "SELECT COUNT(*) FROM xp_log WHERE action = 'pet_play' AND scope = ? AND created_at >= ?",
            (scope, today)
        ).fetchone()
        plays_today = play_row[0] if play_row else 0

        if plays_today >= 5:
            conn.close()
            return {"success": False, "message": "Your pet is tired! Come back tomorrow.", "plays_today": plays_today, "max_plays": 5}

        # Award 1 XP for playing
        _award_xp_direct(cursor, conn, "pet_play", 1, None, scope)
        conn.close()
        return {"success": True, "xp_awarded": 1, "plays_today": plays_today + 1, "max_plays": 5}
    except Exception as e:
        logger.error(f"pet_play error: {e}")
        return {"error": str(e)}


def _pet_clean_dust(scope, dust_id):
    """Clean a dust bunny — logs a cleaning event and dismisses the dust."""
    if not dust_id:
        return {"error": "dust_id is required"}
    try:
        db_path = _goals_db()
        conn = _connect(db_path)
        cursor = conn.cursor()
        _ensure_pet_table(cursor, conn)
        _ensure_xp_table(cursor, conn)

        # Log cleaning event (resets dust timer for this bunny)
        _award_xp_direct(cursor, conn, "pet_clean", 1, dust_id, scope)

        # Dismiss the dust bunny
        pet_row = cursor.execute(
            "SELECT dismissed_clutter FROM pet_state WHERE scope = ?", (scope,)
        ).fetchone()
        dismissed = json.loads(pet_row["dismissed_clutter"] or '[]') if pet_row else []
        if dust_id not in dismissed:
            dismissed.append(dust_id)
        cursor.execute(
            "UPDATE pet_state SET dismissed_clutter = ?, updated_at = CURRENT_TIMESTAMP WHERE scope = ?",
            (json.dumps(dismissed), scope)
        )
        conn.commit()
        conn.close()
        return {"success": True, "cleaned": dust_id}
    except Exception as e:
        logger.error(f"pet_clean_dust error: {e}")
        return {"error": str(e)}


def _pet_dismiss_clutter(scope, goal_id):
    """Dismiss a goal-based clutter item (cobweb or papers)."""
    if goal_id is None:
        return {"error": "goal_id is required"}
    try:
        db_path = _goals_db()
        conn = _connect(db_path)
        cursor = conn.cursor()
        _ensure_pet_table(cursor, conn)

        pet_row = cursor.execute(
            "SELECT dismissed_clutter FROM pet_state WHERE scope = ?", (scope,)
        ).fetchone()
        if not pet_row:
            cursor.execute("INSERT INTO pet_state (scope) VALUES (?)", (scope,))
            conn.commit()
            dismissed = []
        else:
            dismissed = json.loads(pet_row["dismissed_clutter"] or '[]')

        if goal_id not in dismissed:
            dismissed.append(goal_id)

        cursor.execute(
            "UPDATE pet_state SET dismissed_clutter = ?, updated_at = CURRENT_TIMESTAMP WHERE scope = ?",
            (json.dumps(dismissed), scope)
        )
        conn.commit()
        conn.close()
        return {"success": True, "dismissed": dismissed}
    except Exception as e:
        logger.error(f"pet_dismiss_clutter error: {e}")
        return {"error": str(e)}


# ─── Feedback / Thumbs Down ─────────────────────────────────────────────────

def _ensure_feedback_table():
    """Create feedback table if needed."""
    try:
        db = _goals_db()
        conn = sqlite3.connect(str(db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS model_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model TEXT NOT NULL,
                provider TEXT NOT NULL,
                response_preview TEXT,
                timestamp TEXT NOT NULL,
                scope TEXT DEFAULT 'default'
            )
        """)
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"ensure_feedback_table error: {e}")
        return False


async def log_thumbsdown(**kwargs):
    """Log a thumbs down on an AI response."""
    body = kwargs.get("body", {})
    if not _ensure_feedback_table():
        return {"error": "Database not ready"}

    model = body.get("model", "unknown")
    provider = body.get("provider", "unknown")
    preview = (body.get("response_preview", "") or "")[:500]
    ts = body.get("timestamp", datetime.now().isoformat())

    try:
        db = _goals_db()
        conn = sqlite3.connect(str(db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            "INSERT INTO model_feedback (model, provider, response_preview, timestamp) VALUES (?, ?, ?, ?)",
            (model, provider, preview, ts)
        )
        conn.commit()
        conn.close()
        logger.info(f"Thumbs down logged: model={model}, provider={provider}")
        return {"ok": True}
    except Exception as e:
        logger.error(f"log_thumbsdown error: {e}")
        return {"error": str(e)}


async def get_feedback_stats(**kwargs):
    """Get model feedback stats — thumbs down counts per model."""
    if not _ensure_feedback_table():
        return {"stats": [], "error": "Database not ready"}

    try:
        db = _goals_db()
        conn = sqlite3.connect(str(db), timeout=5)
        conn.row_factory = sqlite3.Row

        # Per-model counts
        rows = conn.execute(
            "SELECT model, provider, COUNT(*) as count FROM model_feedback GROUP BY model, provider ORDER BY count DESC"
        ).fetchall()
        stats = [dict(r) for r in rows]

        # Recent entries
        recent = conn.execute(
            "SELECT * FROM model_feedback ORDER BY timestamp DESC LIMIT 20"
        ).fetchall()

        conn.close()
        return {"stats": stats, "recent": [dict(r) for r in recent]}
    except Exception as e:
        logger.error(f"get_feedback_stats error: {e}")
        return {"stats": [], "error": str(e)}


# ─── User Goals (user-owned, separate from AI operational goals) ─────────────

async def get_user_goals(**kwargs):
    """Return user goals, optionally filtered by status."""
    query = kwargs.get("query", {})
    scope = query.get("scope", "default")
    status = query.get("status")
    try:
        plugin = _load_mc_plugin()
        goals = plugin.get_user_goals(scope, status if status and status != "all" else None)
        return {"goals": goals}
    except Exception as e:
        logger.error(f"get_user_goals error: {e}")
        return {"goals": [], "error": str(e)}


async def create_user_goal(**kwargs):
    """Create a new user goal."""
    body = kwargs.get("body", {})
    title = body.get("title", "").strip()
    if not title:
        return {"error": "Title is required"}
    description = body.get("description", "").strip()
    priority = body.get("priority", "medium")
    permanent = body.get("permanent", 0)
    scope = body.get("scope", "default")
    try:
        plugin = _load_mc_plugin()
        goal_id = plugin.create_user_goal(title, description or None, priority, scope)
        # Set permanent flag if requested
        if goal_id and permanent:
            plugin.update_user_goal(goal_id, permanent=1)
        if goal_id:
            return {"success": True, "id": goal_id}
        return {"error": "Failed to create goal"}
    except Exception as e:
        logger.error(f"create_user_goal error: {e}")
        return {"error": str(e)}


async def update_user_goal(**kwargs):
    """Update a user goal — status, priority, title, description."""
    body = kwargs.get("body", {})
    goal_id = body.get("goal_id")
    if not goal_id:
        return {"error": "goal_id is required"}

    scope = body.get("scope", "default")
    fields = {}
    for key in ("title", "description", "priority", "status", "permanent"):
        if key in body and body[key] is not None:
            fields[key] = body[key]

    try:
        plugin = _load_mc_plugin()
        ok = plugin.update_user_goal(goal_id, **fields)
        if not ok:
            return {"error": "Failed to update goal"}

        result = {"success": True}
        permanent_run = body.get("permanent_run", False)

        # Award XP on completion (or permanent goal run)
        if fields.get("status") == "completed" or permanent_run:
            try:
                db_path = _goals_db()
                conn = _connect(db_path)
                cursor = conn.cursor()
                row = cursor.execute("SELECT priority FROM user_goals WHERE id = ?", (int(goal_id),)).fetchone()
                priority = row["priority"] if row else "medium"
                xp_map = {"high": 50, "medium": 30, "low": 15}
                xp = xp_map.get(priority, 30)
                source = "permanent_goal_run" if permanent_run else "user_goal_complete"
                _award_xp_direct(cursor, conn, source, xp, goal_id, scope)
                result["xp_awarded"] = xp

                # Check if all daily plan goals are now complete → bonus XP
                if not permanent_run:
                    today = datetime.now().strftime("%Y-%m-%d")
                    plan_row = cursor.execute(
                        "SELECT id, goal_ids, completed FROM daily_plans WHERE plan_date = ? AND scope = ?",
                        (today, scope)
                    ).fetchone()
                    if plan_row and not plan_row["completed"]:
                        plan_goal_ids = json.loads(plan_row["goal_ids"] or '[]')
                        if plan_goal_ids and int(goal_id) in plan_goal_ids:
                            placeholders = ','.join('?' * len(plan_goal_ids))
                            done_count = cursor.execute(
                                f"SELECT COUNT(*) FROM user_goals WHERE id IN ({placeholders}) AND status = 'completed'",
                                plan_goal_ids
                            ).fetchone()[0]
                            if done_count >= len(plan_goal_ids):
                                cursor.execute("UPDATE daily_plans SET completed = 1 WHERE id = ?", (plan_row["id"],))
                                _award_xp_direct(cursor, conn, "daily_plan_complete", 100, today, scope)
                                result["daily_bonus"] = 100

                conn.close()
            except Exception as xp_err:
                logger.warning(f"User goal XP award failed: {xp_err}")

        # Deduct XP on reactivation (undo completion)
        elif fields.get("status") == "active" and not permanent_run:
            try:
                db_path = _goals_db()
                conn = _connect(db_path)
                cursor = conn.cursor()
                row = cursor.execute("SELECT priority FROM user_goals WHERE id = ?", (int(goal_id),)).fetchone()
                priority = row["priority"] if row else "medium"
                xp_map = {"high": 50, "medium": 30, "low": 15}
                xp = xp_map.get(priority, 30)
                _deduct_xp_direct(cursor, conn, "user_goal_uncomplete", xp, goal_id, scope)
                result["xp_deducted"] = xp
                conn.close()
            except Exception as xp_err:
                logger.warning(f"User goal XP deduct failed: {xp_err}")

        return result
    except Exception as e:
        logger.error(f"update_user_goal error: {e}")
        return {"error": str(e)}


async def delete_user_goal(**kwargs):
    """Delete a user goal."""
    body = kwargs.get("body", {})
    goal_id = body.get("goal_id")
    if not goal_id:
        return {"error": "goal_id is required"}
    try:
        plugin = _load_mc_plugin()
        ok = plugin.delete_user_goal(goal_id)
        return {"success": ok}
    except Exception as e:
        logger.error(f"delete_user_goal error: {e}")
        return {"error": str(e)}
