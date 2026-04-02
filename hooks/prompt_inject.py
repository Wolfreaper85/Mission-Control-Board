"""
prompt_inject hook — fires during system prompt assembly.
Injects active learned rules and relevant capsules into the system prompt.
This is the "hypnosis" mechanism — injected guidance feels native to the AI.

SAFETY NOTE: This hook runs during prompt assembly, so it must be lightweight.
We use direct SQLite reads here — NO _load_plugin_module() / exec(), which was
found to break all tool calling for the AI model.
"""

import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# Cap injected content to avoid bloating context
MAX_RULES = 10
MAX_CAPSULES = 3
MAX_STANDING_ORDERS = 5


def _find_goals_db():
    """Find goals.db regardless of install location."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "goals.db"
        if candidate.exists():
            return candidate
    return None


def _get_connection():
    """Open a lightweight read-only connection."""
    db_path = _find_goals_db()
    if not db_path or not db_path.exists():
        return None
    conn = sqlite3.connect(str(db_path), timeout=2)
    conn.row_factory = sqlite3.Row
    return conn


def _safe_query(conn, sql, params=()):
    """Run a query, return list of dicts. Returns [] on any error."""
    try:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []


def prompt_inject(event):
    """
    Append active learned rules, standing orders, and capsules to the system prompt.
    Only fires when prompt_injection setting is enabled.

    Uses direct SQLite reads — no exec() or module loading.
    """
    from core.plugin_loader import plugin_loader

    settings = plugin_loader.get_plugin_settings("mission-control")
    if not settings.get("prompt_injection", True):
        return

    conn = _get_connection()
    if not conn:
        return

    try:
        # Get scope
        scope = "default"
        system = event.metadata.get("system")
        if system and hasattr(system, "llm_chat") and system.llm_chat:
            try:
                scope = system.llm_chat.session_manager.active_scope or "default"
            except Exception:
                pass

        parts = []

        # Inject learned rules
        if settings.get("learned_rules", True):
            rules = _safe_query(
                conn,
                "SELECT rule FROM learned_rules WHERE active = 1 AND scope IN (?, 'global') "
                "ORDER BY vfm_score DESC, times_seen DESC LIMIT ?",
                (scope, MAX_RULES)
            )
            if rules:
                rule_lines = [f"- {r['rule']}" for r in rules]
                parts.append(
                    "[Learned Behaviors]\n"
                    "The following rules have been learned from past interactions. Follow them naturally:\n"
                    + "\n".join(rule_lines)
                )

        # Inject approved standing orders from bulletin board
        if settings.get("bulletin_board", True):
            standing = _safe_query(
                conn,
                "SELECT title, description FROM bulletin_board "
                "WHERE scope IN (?, 'global') AND status = 'approved' AND request_type = 'standing_order' "
                "ORDER BY created_at DESC LIMIT ?",
                (scope, MAX_STANDING_ORDERS)
            )
            if standing:
                order_lines = [f"- {s['title']}: {(s.get('description') or '')[:200]}" for s in standing]
                parts.append(
                    "[Approved Standing Orders]\n"
                    "The user has approved these standing orders. Follow them:\n"
                    + "\n".join(order_lines)
                )

        # Inject relevant capsules
        if settings.get("capsules", True):
            capsules = _safe_query(
                conn,
                "SELECT id, problem_type, reasoning_pattern FROM capsules "
                "WHERE scope IN (?, 'global') ORDER BY success_count DESC, last_used DESC LIMIT ?",
                (scope, MAX_CAPSULES)
            )
            if capsules:
                capsule_lines = [f"- [{c['problem_type']}]: {c['reasoning_pattern'][:200]}" for c in capsules]
                parts.append(
                    "[Reasoning Patterns]\n"
                    "Successful approaches from past tasks — reference when relevant:\n"
                    + "\n".join(capsule_lines)
                )
                # Touch capsules — reset their retention timer
                try:
                    capsule_ids = [c['id'] for c in capsules]
                    placeholders = ",".join("?" * len(capsule_ids))
                    conn.execute(
                        f"UPDATE capsules SET last_used = CURRENT_TIMESTAMP WHERE id IN ({placeholders})",
                        capsule_ids
                    )
                    conn.commit()
                except Exception:
                    pass

        if parts:
            injection = "\n\n".join(parts)
            event.context_parts.append(injection)
            logger.debug(f"Self-Reflection: injected {len(parts)} sections into prompt")

    except Exception as e:
        logger.error(f"Self-Reflection prompt_inject error: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass
