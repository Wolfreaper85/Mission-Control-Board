# tools/mission.py
# Chat-accessible tools for Mission Control

from pathlib import Path

def _find_goals_db():
    """Find goals.db regardless of whether we run from plugins/ or user/plugins/."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "goals.db"
        if candidate.exists():
            return candidate
    return Path(__file__).parent.parent.parent.parent / "user" / "goals.db"

ENABLED = True
EMOJI = '\U0001f3af'

AVAILABLE_FUNCTIONS = ['mission_status', 'take_note', 'search_notes', 'list_notes', 'self_reflect', 'get_learned_rules', 'post_bulletin', 'get_bulletins']

TOOLS = [
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "mission_status",
            "description": "Get a quick summary of your Mission Control dashboard — active goals, running agents, and recent activity. Use when the user asks about their workload, tasks, or agent status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "description": "Goal scope to check (default: 'default')"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "take_note",
            "description": "Save a note to Mission Control's Notes board. Use when the user says 'take a note', 'remember this', 'note this down', 'save this for later', or similar. Always ask for or infer a short title and the note content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Short title for the note (max 200 chars)"
                    },
                    "content": {
                        "type": "string",
                        "description": "The note content/body (max 2000 chars)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope for the note (default: 'default')"
                    }
                },
                "required": ["title", "content"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "search_notes",
            "description": "Search through saved notes in Mission Control. Use when the user says 'check my notes', 'find that note about...', 'do I have a note on...', 'look up my notes', or similar. Searches both title and content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword or phrase to find in note titles and content"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope to search in (default: 'default')"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "list_notes",
            "description": "List all saved notes in Mission Control. Use when the user says 'show my notes', 'what notes do I have', 'list all notes', or similar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "description": "Scope to list (default: 'default')"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "self_reflect",
            "description": "Record a self-reflection about a task you just completed. Use after complex multi-step work, debugging, or when you notice something you could do better. This helps you improve over time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_context": {
                        "type": "string",
                        "description": "Brief description of what the task was"
                    },
                    "what_worked": {
                        "type": "string",
                        "description": "What went well in your approach"
                    },
                    "what_didnt": {
                        "type": "string",
                        "description": "What could have been better (or null if everything went well)"
                    },
                    "lesson": {
                        "type": "string",
                        "description": "One actionable lesson to remember for next time"
                    }
                },
                "required": ["task_context", "lesson"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "get_learned_rules",
            "description": "Check your active learned rules — behavioral guidelines from past corrections and reflections. Use to review what you've learned or when you want to verify a rule before acting on it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "description": "Scope to check (default: 'default')"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "post_bulletin",
            "description": "Post a request to the Mission Control Bulletin Board for user approval. Use when you notice a recurring need and want to propose a standing order, schedule, rule, or new capability. The user will approve or deny your request.",
            "parameters": {
                "type": "object",
                "properties": {
                    "request_type": {
                        "type": "string",
                        "enum": ["standing_order", "rule_promotion", "schedule", "capability"],
                        "description": "Type of request: standing_order (recurring behavior), rule_promotion (make a pattern permanent), schedule (create a scheduled task), capability (request a new tool)"
                    },
                    "title": {
                        "type": "string",
                        "description": "Short title for the request (max 200 chars)"
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of what you're proposing"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why you think this would be helpful — what pattern have you noticed?"
                    }
                },
                "required": ["request_type", "title", "description", "reason"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "get_bulletins",
            "description": "Check the Mission Control Bulletin Board for pending requests. Use to see if you have any approved standing orders or if the user has responded to your requests.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "approved", "denied"],
                        "description": "Filter by status (optional — shows all if omitted)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope to check (default: 'default')"
                    }
                },
                "required": []
            }
        }
    }
]


def execute(function_name, arguments, config):
    """Execute mission control tool functions."""
    if function_name == "mission_status":
        return _mission_status(arguments, config)
    elif function_name == "take_note":
        return _take_note(arguments, config)
    elif function_name == "search_notes":
        return _search_notes(arguments, config)
    elif function_name == "list_notes":
        return _list_notes(arguments, config)
    elif function_name == "self_reflect":
        return _self_reflect(arguments, config)
    elif function_name == "get_learned_rules":
        return _get_learned_rules(arguments, config)
    elif function_name == "post_bulletin":
        return _post_bulletin(arguments, config)
    elif function_name == "get_bulletins":
        return _get_bulletins(arguments, config)
    return "Unknown function", False


def _mission_status(arguments, config):
    """Aggregate a quick status report."""
    import sqlite3
    from pathlib import Path

    scope = arguments.get("scope", "default")
    lines = ["\U0001f3af **Mission Control Status**\n"]

    # Goals summary
    goals_db = _find_goals_db()
    if goals_db.exists():
        try:
            conn = sqlite3.connect(str(goals_db), timeout=5)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            if scope == "global":
                scope_sql = "scope = ?"
                scope_params = [scope]
            else:
                scope_sql = "scope IN (?, 'global')"
                scope_params = [scope]

            # Count by status
            cur.execute(f"SELECT status, COUNT(*) as cnt FROM goals WHERE {scope_sql} GROUP BY status", scope_params)
            counts = {row["status"]: row["cnt"] for row in cur.fetchall()}
            active = counts.get("active", 0)
            completed = counts.get("completed", 0)
            abandoned = counts.get("abandoned", 0)
            total = active + completed + abandoned

            lines.append(f"**Goals:** {total} total | {active} active | {completed} completed | {abandoned} abandoned")

            # Permanent goals
            cur.execute(
                f"SELECT id, title, priority FROM goals WHERE {scope_sql} AND permanent = 1 AND parent_id IS NULL ORDER BY "
                "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END",
                scope_params
            )
            perm_rows = cur.fetchall()
            if perm_rows:
                lines.append("\n**\U0001f4cc Permanent Goals:**")
                for r in perm_rows:
                    icon = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(r["priority"], "\u26aa")
                    lines.append(f"  {icon} [{r['id']}] {r['title']}")

            # Active (non-permanent) goals
            cur.execute(
                f"SELECT id, title, priority, updated_at FROM goals WHERE {scope_sql} AND status = 'active' AND permanent = 0 AND parent_id IS NULL ORDER BY "
                "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at DESC LIMIT 10",
                scope_params
            )
            rows = cur.fetchall()
            if rows:
                lines.append("\n**\U0001f7e2 Active Goals:**")
                for r in rows:
                    icon = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(r["priority"], "\u26aa")
                    lines.append(f"  {icon} [{r['id']}] {r['title']}")

            # Recently completed goals
            cur.execute(
                f"SELECT id, title, completed_at FROM goals WHERE {scope_sql} AND status = 'completed' AND parent_id IS NULL ORDER BY completed_at DESC LIMIT 5",
                scope_params
            )
            done_rows = cur.fetchall()
            if done_rows:
                lines.append("\n**\u2705 Recently Completed:**")
                for r in done_rows:
                    ts = r["completed_at"] or ""
                    lines.append(f"  [{r['id']}] {r['title']} ({ts})")

            conn.close()
        except Exception as e:
            lines.append(f"Goals: error reading database ({e})")
    else:
        lines.append("**Goals:** No goals yet. Create one to get started!")

    # Agent summary
    try:
        from core.api_fastapi import get_system
        _mgr = getattr(get_system(), 'agent_manager', None)
        agents = _mgr.check_all() if _mgr else []
        running = [a for a in agents if a.get("status") in ("running", "pending")]
        done = [a for a in agents if a.get("status") == "done"]
        failed = [a for a in agents if a.get("status") == "failed"]

        lines.append(f"\n**Agents:** {len(running)} running | {len(done)} completed | {len(failed)} failed")
        for a in running:
            elapsed = a.get("elapsed", 0)
            lines.append(f"  \U0001f7e2 {a.get('name', 'unnamed')} — {a.get('mission', '')[:60]} ({elapsed:.0f}s)")
    except Exception:
        lines.append("\n**Agents:** Agent system not available")

    lines.append("\n*Open Mission Control in the sidebar for the full dashboard.*")

    return "\n".join(lines), True


def _take_note(arguments, config):
    """Create a note in Mission Control."""
    import sqlite3
    from pathlib import Path
    from datetime import datetime

    title = arguments.get("title", "").strip()
    content = arguments.get("content", "").strip()
    scope = arguments.get("scope", "default")

    if not title or not content:
        return "Error: Both title and content are required to take a note.", False

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized. Send a message in chat first.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute('''
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute(
            "INSERT INTO notes (title, content, scope) VALUES (?, ?, ?)",
            (title[:200], content[:2000], scope)
        )
        conn.commit()
        conn.close()
        return f"\U0001f4dd **Note saved!**\n**Title:** {title}\n**Content:** {content[:100]}{'...' if len(content) > 100 else ''}\n\n*View it in Mission Control → Notes*", True
    except Exception as e:
        return f"Error saving note: {e}", False


def _search_notes(arguments, config):
    """Search notes by keyword."""
    import sqlite3
    from pathlib import Path

    query = arguments.get("query", "").strip()
    scope = arguments.get("scope", "default")

    if not query:
        return "Please provide a search term to look for in your notes.", False

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "No notes found — database not initialized.", True

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM notes WHERE scope IN (?, 'global') AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT 10",
            (scope, f"%{query}%", f"%{query}%")
        ).fetchall()
        conn.close()

        if not rows:
            return f"\U0001f50d No notes found matching \"{query}\".", True

        lines = [f"\U0001f50d **Found {len(rows)} note(s) matching \"{query}\":**\n"]
        for r in rows:
            ts = r["created_at"] or ""
            lines.append(f"**[{r['id']}] {r['title']}** ({ts})")
            lines.append(f"  {r['content'][:200]}{'...' if len(r['content']) > 200 else ''}\n")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error searching notes: {e}", False


def _list_notes(arguments, config):
    """List all notes."""
    import sqlite3
    from pathlib import Path

    scope = arguments.get("scope", "default")

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "No notes yet. Say 'take a note' to create one!", True

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM notes WHERE scope IN (?, 'global') ORDER BY created_at DESC",
            (scope,)
        ).fetchall()
        conn.close()

        if not rows:
            return "\U0001f4dd **No notes yet.** Say 'take a note' to create one!", True

        lines = [f"\U0001f4dd **Your Notes ({len(rows)}):**\n"]
        for r in rows:
            ts = r["created_at"] or ""
            lines.append(f"**[{r['id']}] {r['title']}** ({ts})")
            lines.append(f"  {r['content'][:150]}{'...' if len(r['content']) > 150 else ''}\n")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error listing notes: {e}", False


# ─── Self-Reflection Tools ──────────────────────────────────────────────────

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


def _self_reflect(arguments, config):
    """Record a self-reflection."""
    task_context = arguments.get("task_context", "").strip()
    what_worked = arguments.get("what_worked", "").strip()
    what_didnt = arguments.get("what_didnt", "").strip() or None
    lesson = arguments.get("lesson", "").strip()

    if not task_context or not lesson:
        return "Error: task_context and lesson are required.", False

    scope = arguments.get("scope", "default")

    try:
        plugin = _load_reflection()
        rid = plugin.save_reflection(
            task_context=task_context,
            what_worked=what_worked,
            what_didnt=what_didnt,
            lesson=lesson,
            scope=scope
        )
        if rid:
            return f"\U0001f4ad **Reflection saved!**\n**Context:** {task_context[:100]}\n**Lesson:** {lesson}\n\n*View in Mission Control \u2192 Reflections*", True
        return "Error saving reflection.", False
    except Exception as e:
        return f"Error: {e}", False


def _get_learned_rules(arguments, config):
    """Get active learned rules."""
    scope = arguments.get("scope", "default")

    try:
        plugin = _load_reflection()
        rules = plugin.get_active_rules(scope=scope)

        if not rules:
            return "\U0001f4cb **No active learned rules yet.** Rules are created when patterns are detected in corrections, or manually via Mission Control.", True

        lines = [f"\U0001f4cb **Active Learned Rules ({len(rules)}):**\n"]
        for r in rules:
            source_icon = "\U0001f916" if r["source"] == "auto" else "\U0001f9e0"
            lines.append(f"{source_icon} **[{r['id']}]** {r['rule']}")
            lines.append(f"   _Seen {r['times_seen']}x | VFM: {r['vfm_score']:.2f} | Source: {r['source']}_\n")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error: {e}", False


def _post_bulletin(arguments, config):
    """Post a request to the bulletin board."""
    request_type = arguments.get("request_type", "")
    title = arguments.get("title", "").strip()
    description = arguments.get("description", "").strip()
    reason = arguments.get("reason", "").strip()
    scope = arguments.get("scope", "default")

    if not request_type or not title:
        return "Error: request_type and title are required.", False

    valid_types = ("standing_order", "rule_promotion", "schedule", "capability")
    if request_type not in valid_types:
        return f"Error: request_type must be one of: {', '.join(valid_types)}", False

    try:
        plugin = _load_reflection()
        bid = plugin.save_bulletin(
            request_type=request_type,
            title=title,
            description=description,
            reason=reason,
            scope=scope
        )
        if bid:
            type_icons = {"standing_order": "\U0001f4e5", "rule_promotion": "\u2b06\ufe0f", "schedule": "\u23f0", "capability": "\U0001f527"}
            icon = type_icons.get(request_type, "\U0001f4cb")
            return f"{icon} **Request posted to Bulletin Board!**\n**Type:** {request_type.replace('_', ' ').title()}\n**Title:** {title}\n**Reason:** {reason[:200]}\n\n*Awaiting user approval in Mission Control \u2192 Bulletin Board*", True
        return "Error posting request.", False
    except Exception as e:
        return f"Error: {e}", False


def _get_bulletins(arguments, config):
    """Check the bulletin board."""
    status = arguments.get("status")
    scope = arguments.get("scope", "default")

    try:
        plugin = _load_reflection()
        bulletins = plugin.get_bulletins(scope=scope, status=status)

        if not bulletins:
            filter_text = f" with status '{status}'" if status else ""
            return f"\U0001f4cb **No bulletin board entries{filter_text}.** Use post_bulletin to make a request.", True

        lines = [f"\U0001f4cb **Bulletin Board ({len(bulletins)} entries):**\n"]
        status_icons = {"pending": "\u23f3", "approved": "\u2705", "denied": "\u274c"}
        type_icons = {"standing_order": "\U0001f4e5", "rule_promotion": "\u2b06\ufe0f", "schedule": "\u23f0", "capability": "\U0001f527"}

        for b in bulletins:
            s_icon = status_icons.get(b["status"], "\u2753")
            t_icon = type_icons.get(b["request_type"], "\U0001f4cb")
            lines.append(f"{s_icon} {t_icon} **[{b['id']}] {b['title']}**")
            lines.append(f"   _Type: {b['request_type'].replace('_', ' ')} | Status: {b['status']} | {b['created_at']}_")
            if b.get("description"):
                lines.append(f"   {b['description'][:200]}")
            lines.append("")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error: {e}", False
