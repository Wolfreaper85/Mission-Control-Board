# tools/mission.py
# Chat-accessible tools for Mission Control

ENABLED = True
EMOJI = '\U0001f3af'

AVAILABLE_FUNCTIONS = ['mission_status', 'take_note', 'search_notes', 'list_notes']

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
    return "Unknown function", False


def _mission_status(arguments, config):
    """Aggregate a quick status report."""
    import sqlite3
    from pathlib import Path

    scope = arguments.get("scope", "default")
    lines = ["\U0001f3af **Mission Control Status**\n"]

    # Goals summary
    goals_db = Path(__file__).parent.parent.parent.parent / "user" / "goals.db"
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

    goals_db = Path(__file__).parent.parent.parent.parent / "user" / "goals.db"
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

    goals_db = Path(__file__).parent.parent.parent.parent / "user" / "goals.db"
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

    goals_db = Path(__file__).parent.parent.parent.parent / "user" / "goals.db"
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
