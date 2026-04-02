"""
Health Digest — scheduled task that posts a system status summary to Discord.
Gathers: active goals, completed goals today, running agents, memories saved,
self-reflection activity (corrections, reflections, capsules, bulletins).

Posts to the configured Discord channel as a formatted digest.
Built from bulletin board request: "Daily System Health Check Summary"
"""

import logging
import sqlite3
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# Discord channel to post to — configurable via plugin settings
DEFAULT_CHANNEL = "ai-updates"


def _find_db(name):
    """Find a database file in the user directory."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / name
        if candidate.exists():
            return candidate
    return None


def _safe_query(db_path, sql, params=()):
    """Run a query against a database, return rows as dicts."""
    if not db_path or not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path), timeout=3)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception as e:
        logger.error(f"Health digest query error ({db_path.name}): {e}")
        return []


def _safe_count(db_path, sql, params=()):
    """Run a COUNT query, return the number."""
    if not db_path or not db_path.exists():
        return 0
    try:
        conn = sqlite3.connect(str(db_path), timeout=3)
        row = conn.execute(sql, params).fetchone()
        conn.close()
        return row[0] if row else 0
    except Exception:
        return 0


def _build_digest():
    """Gather all system stats and build a formatted Discord message."""
    goals_db = _find_db("goals.db")
    memory_db = _find_db("memory.db")

    now = datetime.utcnow()
    today_str = now.strftime("%Y-%m-%d")
    digest_lines = []

    # Header
    digest_lines.append(f"**Mission Control — Daily Digest**")
    digest_lines.append(f"*{now.strftime('%B %d, %Y • %I:%M %p UTC')}*")
    digest_lines.append("")

    # ── Goals ──
    active_goals = _safe_query(
        goals_db,
        "SELECT title, priority, status FROM goals WHERE status IN ('active', 'in_progress') "
        "ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 10"
    )
    completed_today = _safe_count(
        goals_db,
        "SELECT COUNT(*) FROM goals WHERE status = 'completed' AND updated_at >= ?",
        (today_str,)
    )

    digest_lines.append("**Goals**")
    if active_goals:
        priority_icons = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🟢"}
        for g in active_goals:
            icon = priority_icons.get(g.get("priority", ""), "⚪")
            digest_lines.append(f"  {icon} {g['title']}")
    else:
        digest_lines.append("  No active goals")
    if completed_today:
        digest_lines.append(f"  ✅ {completed_today} completed today")
    digest_lines.append("")

    # ── Memories ──
    memories_today = _safe_count(
        memory_db,
        "SELECT COUNT(*) FROM memories WHERE timestamp >= ?",
        (today_str,)
    )
    total_memories = _safe_count(memory_db, "SELECT COUNT(*) FROM memories")

    digest_lines.append("**Memories**")
    digest_lines.append(f"  📝 {memories_today} saved today • {total_memories} total")
    digest_lines.append("")

    # ── Self-Reflection ──
    corrections_today = _safe_count(
        goals_db,
        "SELECT COUNT(*) FROM corrections WHERE created_at >= ?",
        (today_str,)
    )
    reflections_total = _safe_count(goals_db, "SELECT COUNT(*) FROM reflections")
    capsules_total = _safe_count(goals_db, "SELECT COUNT(*) FROM capsules")
    rules_active = _safe_count(goals_db, "SELECT COUNT(*) FROM learned_rules WHERE active = 1")
    pending_bulletins = _safe_count(
        goals_db,
        "SELECT COUNT(*) FROM bulletin_board WHERE status = 'pending'"
    )

    digest_lines.append("**Self-Reflection**")
    digest_lines.append(f"  🔍 {corrections_today} corrections today")
    digest_lines.append(f"  💡 {reflections_total} reflections • {capsules_total} capsules")
    digest_lines.append(f"  📋 {rules_active} active rules")
    if pending_bulletins:
        digest_lines.append(f"  📌 **{pending_bulletins} pending bulletin(s)** awaiting review")
    digest_lines.append("")

    # ── Recent Activity ──
    recent_bulletins = _safe_query(
        goals_db,
        "SELECT title, status, request_type FROM bulletin_board "
        "WHERE created_at >= ? ORDER BY created_at DESC LIMIT 3",
        (today_str,)
    )
    if recent_bulletins:
        status_icons = {"pending": "⏳", "approved": "✅", "denied": "❌"}
        digest_lines.append("**Recent Bulletins**")
        for b in recent_bulletins:
            icon = status_icons.get(b["status"], "❓")
            digest_lines.append(f"  {icon} {b['title']}")
        digest_lines.append("")

    # Footer
    digest_lines.append("— *Mission Control*")

    return "\n".join(digest_lines)


def run(event):
    """
    Build and send the health digest to Discord.
    Called by the continuity scheduler on cron.
    """
    from core.plugin_loader import plugin_loader

    settings = plugin_loader.get_plugin_settings("mission-control")
    if not settings.get("health_digest", True):
        return "Skipped (disabled)"

    # Build the digest
    digest = _build_digest()
    if not digest:
        return "No data to report"

    # Get the Discord channel from settings or use default
    channel = settings.get("digest_channel", DEFAULT_CHANNEL)

    # Send via Discord plugin's send_message
    try:
        import importlib.util
        import sys

        discord_tools_path = Path(__file__).parents[2] / "discord" / "tools" / "discord_tools.py"
        if not discord_tools_path.exists():
            # Try user plugins path
            discord_tools_path = Path(__file__).parents[3] / "discord" / "tools" / "discord_tools.py"

        if not discord_tools_path.exists():
            logger.error("Health digest: Discord plugin not found")
            return "Discord plugin not found"

        spec = importlib.util.spec_from_file_location("_discord_tools", discord_tools_path)
        discord_module = importlib.util.module_from_spec(spec)
        sys.modules["_discord_tools"] = discord_module
        spec.loader.exec_module(discord_module)

        # Call discord_send_message
        result = discord_module.execute("discord_send_message", {
            "channel": channel,
            "text": digest
        }, None)

        logger.info(f"Health digest sent to #{channel}")
        return f"Digest sent to #{channel} ({len(digest)} chars)"

    except Exception as e:
        logger.error(f"Health digest: failed to send to Discord: {e}")
        return f"Error sending digest: {e}"
