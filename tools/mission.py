# tools/mission.py
# Chat-accessible tools for Mission Control

ENABLED = True
EMOJI = '\U0001f3af'

AVAILABLE_FUNCTIONS = ['mission_status']

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
    }
]


def execute(function_name, arguments, config):
    """Execute mission control tool functions."""
    if function_name == "mission_status":
        return _mission_status(arguments, config)
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
