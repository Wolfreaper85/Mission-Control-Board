"""
post_execute hook — fires after any tool call completes.
Auto-tags memory entries that were saved without a label.
Built from bulletin board request for contextual auto-tagging.

Observational only — Sapphire's memory system does all the real work.
We just fill in the label when it's missing.
"""

import logging
import re
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── Category Detection Rules ───────────────────────────────────────────────
# Each rule: (category_name, [keyword patterns])
# Checked in order — first match wins. More specific categories first.

_CATEGORY_RULES = [
    ("technical", [
        re.compile(r'\b(?:code|coding|program|debug|error|bug|function|api|server|database|sql|python|javascript|html|css|plugin|git|repo|deploy|config|install|update|version)\b', re.IGNORECASE),
    ]),
    ("preference", [
        re.compile(r'\b(?:prefer|like[sd]?|love[sd]?|hate[sd]?|favorite|dislike|enjoy|fond of|can\'t stand|rather)\b', re.IGNORECASE),
        re.compile(r'\b(?:always want|never want|best way|go-to|style is)\b', re.IGNORECASE),
    ]),
    ("routine", [
        re.compile(r'\b(?:every\s+(?:day|morning|evening|night|week|month)|usually|routine|schedule|habit|always\s+(?:do|does|start|end)|daily|weekly|wake[sd]?\s+up|go(?:es)?\s+to\s+(?:bed|sleep|work))\b', re.IGNORECASE),
    ]),
    ("people", [
        re.compile(r'\b(?:wife|husband|partner|son|daughter|mother|father|mom|dad|brother|sister|friend|coworker|boss|family|kid[sd]?|child|children|grandma|grandpa|uncle|aunt|cousin|nephew|niece)\b', re.IGNORECASE),
        # Names next to relationship words
        re.compile(r'\b(?:named|called|known as|goes by)\s+[A-Z][a-z]+\b'),
    ]),
    ("conversation", [
        re.compile(r'\b(?:we\s+(?:talked|discussed|chatted)|told\s+me|mentioned|said\s+(?:that|he|she|they)|conversation|chat(?:ted)?|discuss(?:ed|ion)?|brought\s+up)\b', re.IGNORECASE),
    ]),
    ("opinion", [
        re.compile(r'\b(?:think[sd]?|believe[sd]?|feel[sd]?\s+(?:that|like|strongly)|opinion|view\s+on|stance|perspective|disagree|agree)\b', re.IGNORECASE),
    ]),
    ("self", [
        re.compile(r'\b(?:i\s+am|my\s+(?:name|personality|style|voice)|about\s+me|who\s+i\s+am|i\s+identify|my\s+role)\b', re.IGNORECASE),
        re.compile(r'\b(?:lexi|sapphire|persona|my\s+(?:purpose|goal|mission))\b', re.IGNORECASE),
    ]),
    ("stories", [
        re.compile(r'\b(?:story|stories|once\s+upon|remember\s+when|back\s+when|years?\s+ago|childhood|growing\s+up|used\s+to)\b', re.IGNORECASE),
    ]),
    ("places", [
        re.compile(r'\b(?:live[sd]?\s+(?:in|at|near)|from\s+[A-Z]|hometown|city|state|country|neighborhood|house|apartment|moved\s+to|born\s+in|travel|visit(?:ed)?)\b', re.IGNORECASE),
    ]),
]


def _find_memory_db():
    """Find memory.db."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "memory.db"
        if candidate.exists():
            return candidate
    return None


def _classify_content(content):
    """
    Determine the best category label for a memory entry based on its content.
    Returns the category name, or None if nothing matches confidently.
    """
    if not content:
        return None

    for category, patterns in _CATEGORY_RULES:
        for pattern in patterns:
            if pattern.search(content):
                return category

    return None


def _check_duplicate(content, scope="default"):
    """
    Check if a very similar memory was saved recently (within last 5 minutes).
    If so, delete the duplicate and return True.
    Prevents the AI from flooding memory with repeated saves.
    """
    if not content:
        return False

    try:
        db_path = _find_memory_db()
        if not db_path:
            return False

        conn = sqlite3.connect(str(db_path), timeout=2)

        # Find memories with identical or near-identical content saved in last 5 min
        # Use the first 100 chars as a signature — exact dupes will match fully
        signature = content[:100].strip()
        rows = conn.execute(
            "SELECT id FROM memories WHERE content LIKE ? AND scope = ? "
            "AND timestamp > datetime('now', '-5 minutes') ORDER BY id DESC",
            (f"{signature}%", scope)
        ).fetchall()

        if len(rows) > 1:
            # Keep the first (oldest), delete the rest
            keep_id = rows[-1][0]  # oldest
            dupe_ids = [r[0] for r in rows if r[0] != keep_id]
            if dupe_ids:
                placeholders = ",".join("?" * len(dupe_ids))
                conn.execute(f"DELETE FROM memories WHERE id IN ({placeholders})", dupe_ids)
                conn.commit()
                logger.info(f"Self-Reflection: cleaned {len(dupe_ids)} duplicate memories (kept #{keep_id})")
            conn.close()
            return True

        conn.close()
        return False
    except Exception as e:
        logger.error(f"Self-Reflection: dedup check error: {e}")
        return False


def post_execute(event):
    """
    After save_memory completes:
    1. Check for and clean duplicate saves (AI memory-save loops)
    2. Auto-classify content and apply a label if missing
    """
    if event.function_name != "save_memory":
        return

    args = event.arguments or {}
    content = args.get("content", "")
    existing_label = args.get("label", "")

    # ── Dedup check — catch AI memory-save loops ──
    # Get scope from metadata if available
    scope = "default"
    if hasattr(event, 'metadata') and event.metadata:
        system = event.metadata.get("system")
        if system and hasattr(system, "llm_chat") and system.llm_chat:
            try:
                scope = system.llm_chat.session_manager.active_scope or "default"
            except Exception:
                pass

    _check_duplicate(content, scope)

    # ── Auto-tag if no label was set ──
    if existing_label and existing_label.strip():
        return

    # Classify the content
    detected = _classify_content(content)
    if not detected:
        return

    # Extract the memory ID from the result text
    # Sapphire returns something like "Memory saved (ID: 42)" or "Memory #42 saved"
    result_text = event.result or ""
    mem_id = None

    # Try common result patterns
    id_match = re.search(r'(?:ID[:\s]*|#)(\d+)', result_text)
    if id_match:
        mem_id = int(id_match.group(1))

    if not mem_id:
        # Fallback: get the most recent memory (just saved)
        try:
            db_path = _find_memory_db()
            if not db_path:
                return
            conn = sqlite3.connect(str(db_path), timeout=2)
            row = conn.execute(
                "SELECT id FROM memories WHERE content = ? AND (label IS NULL OR label = '') ORDER BY id DESC LIMIT 1",
                (content[:512],)
            ).fetchone()
            if row:
                mem_id = row[0]
            conn.close()
        except Exception:
            return

    if not mem_id:
        return

    # Apply the auto-tag
    try:
        db_path = _find_memory_db()
        if not db_path:
            return
        conn = sqlite3.connect(str(db_path), timeout=2)
        conn.execute(
            "UPDATE memories SET label = ? WHERE id = ? AND (label IS NULL OR label = '')",
            (detected, mem_id)
        )
        conn.commit()
        conn.close()
        logger.info(f"Self-Reflection: auto-tagged memory #{mem_id} as '{detected}'")
    except Exception as e:
        logger.error(f"Self-Reflection: auto-tag error: {e}")
