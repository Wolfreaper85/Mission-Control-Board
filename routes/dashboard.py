# routes/dashboard.py
# Mission Control API — reads from Sapphire's existing goals.db + agent manager
# All handlers receive kwargs: body, settings, query, request, plus path params

import sqlite3
import logging
from pathlib import Path
from datetime import datetime

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


# ─── Goals (Kanban board data) ───────────────────────────────────────────────

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
        conn.close()
        return {"success": True}
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

            cursor.execute(f"SELECT status, COUNT(*) as cnt FROM goals WHERE {scope_sql} GROUP BY status", scope_params)
            for row in cursor.fetchall():
                key = f"goals_{row['status']}"
                if key in stats:
                    stats[key] = row["cnt"]
                stats["goals_total"] += row["cnt"]
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

def _load_reflection():
    """Load plugin.py for self-reflection data access."""
    import importlib.util
    import sys
    plugin_file = Path(__file__).parent.parent / "plugin.py"
    spec = importlib.util.spec_from_file_location("_mc_reflection_plugin", plugin_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_mc_reflection_plugin"] = module
    spec.loader.exec_module(module)
    return module


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

            # Goals created in range
            rows = conn.execute(
                "SELECT id, title, status, priority, created_at, completed_at FROM goals WHERE created_at >= ? AND created_at <= ? ORDER BY created_at",
                (start, end + " 23:59:59")
            ).fetchall()
            for r in rows:
                goal_events.append({
                    "id": f"goal-{r['id']}",
                    "title": r["title"],
                    "start_date": r["created_at"][:10] if r["created_at"] else start,
                    "end_date": r["created_at"][:10] if r["created_at"] else start,
                    "category": "goal",
                    "color": {"high": "#f44336", "medium": "#ff9800", "low": "#4caf50"}.get(r["priority"], "#4a9eff"),
                    "status": r["status"],
                    "_source": "goal",
                })

            # Goals completed in range
            rows = conn.execute(
                "SELECT id, title, status, priority, completed_at FROM goals WHERE completed_at IS NOT NULL AND completed_at >= ? AND completed_at <= ?",
                (start, end + " 23:59:59")
            ).fetchall()
            for r in rows:
                goal_events.append({
                    "id": f"goal-done-{r['id']}",
                    "title": f"✅ {r['title']}",
                    "start_date": r["completed_at"][:10],
                    "end_date": r["completed_at"][:10],
                    "category": "completed",
                    "color": "#4caf50",
                    "_source": "goal_completed",
                })

            # Notes created in range
            try:
                rows = conn.execute(
                    "SELECT id, title, created_at FROM notes WHERE created_at >= ? AND created_at <= ? ORDER BY created_at",
                    (start, end + " 23:59:59")
                ).fetchall()
                for r in rows:
                    goal_events.append({
                        "id": f"note-{r['id']}",
                        "title": f"📝 {r['title']}",
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
    """Create a calendar event."""
    body = kwargs.get("body", {})
    title = body.get("title", "").strip()
    start_date = body.get("start_date", "").strip()
    if not title or not start_date:
        return {"error": "title and start_date are required"}
    try:
        plugin = _load_reflection()
        reminder_val = body.get("reminder_minutes")
        reminder_minutes = int(reminder_val) if reminder_val is not None and str(reminder_val) != "" else None
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
        )
        return {"success": True, "id": eid}
    except Exception as e:
        logger.error(f"create_calendar_event error: {e}")
        return {"error": str(e)}


async def update_calendar_event(**kwargs):
    """Update a calendar event."""
    body = kwargs.get("body", {})
    eid = body.get("id")
    if not eid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
        fields = {}
        for k in ("title", "description", "start_date", "end_date", "start_time", "all_day", "color", "category", "reminder_minutes"):
            if k in body:
                fields[k] = body[k]
        # If reminder settings changed, reset reminded flag
        if "reminder_minutes" in body or "start_time" in body or "start_date" in body:
            fields["reminded"] = 0
        ok = plugin.update_calendar_event(eid, **fields)
        return {"success": ok}
    except Exception as e:
        logger.error(f"update_calendar_event error: {e}")
        return {"error": str(e)}


async def delete_calendar_event(**kwargs):
    """Delete a calendar event."""
    body = kwargs.get("body", {})
    eid = body.get("id")
    if not eid:
        return {"error": "id is required"}
    try:
        plugin = _load_reflection()
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
