"""
pre_execute hook — fires before any tool call executes.
Intercepts save_memory calls to check for similar existing memories.
If a close match is found, blocks the save and tells the AI why.

This prevents memory duplication at the source — the AI learns she
already has the information and doesn't need to save it again.
"""

import logging
import re
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# Minimum similarity ratio to consider a memory a duplicate (0.0 - 1.0)
SIMILARITY_THRESHOLD = 0.65

# Stopwords to ignore when comparing keyword overlap
_STOPWORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "about", "between", "under", "above", "up", "down",
    "out", "off", "over", "again", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "because", "but", "and", "or",
    "if", "while", "that", "this", "it", "its", "i", "me", "my", "he",
    "she", "his", "her", "we", "they", "them", "what", "which", "who",
})


def _find_memory_db():
    """Find memory.db."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "memory.db"
        if candidate.exists():
            return candidate
    return None


def _extract_keywords(text):
    """Extract meaningful keywords from text, lowercased, no stopwords."""
    words = re.findall(r'[a-z]+', text.lower())
    return set(w for w in words if len(w) >= 3 and w not in _STOPWORDS)


def _keyword_similarity(keywords_a, keywords_b):
    """Calculate Jaccard similarity between two keyword sets."""
    if not keywords_a or not keywords_b:
        return 0.0
    intersection = keywords_a & keywords_b
    union = keywords_a | keywords_b
    return len(intersection) / len(union) if union else 0.0


def _find_similar_memory(content, scope="default"):
    """
    Search existing memories for similar content.
    Uses keyword overlap (Jaccard similarity) for fast, reliable matching.
    Returns (memory_id, memory_content, similarity) or None.
    """
    if not content or len(content.strip()) < 10:
        return None

    db_path = _find_memory_db()
    if not db_path:
        return None

    new_keywords = _extract_keywords(content)
    if len(new_keywords) < 2:
        return None  # Too few keywords to compare meaningfully

    try:
        conn = sqlite3.connect(str(db_path), timeout=2)

        # Get recent memories in this scope (check last 500 — that's plenty)
        rows = conn.execute(
            "SELECT id, content, keywords FROM memories "
            "WHERE scope IN (?, 'global') ORDER BY id DESC LIMIT 500",
            (scope,)
        ).fetchall()
        conn.close()

        best_match = None
        best_score = 0.0

        for row in rows:
            mem_id, mem_content, mem_keywords_str = row

            # Build keyword set from stored keywords or from content
            if mem_keywords_str:
                existing_keywords = set(mem_keywords_str.lower().split())
            else:
                existing_keywords = _extract_keywords(mem_content or "")

            score = _keyword_similarity(new_keywords, existing_keywords)

            if score > best_score:
                best_score = score
                best_match = (mem_id, mem_content, score)

        if best_match and best_match[2] >= SIMILARITY_THRESHOLD:
            return best_match

        return None

    except Exception as e:
        logger.error(f"Self-Reflection: similarity search error: {e}")
        return None


def pre_execute(event):
    """
    Before save_memory executes, check if a similar memory already exists.
    If so, block the save and inform the AI.
    """
    if event.function_name != "save_memory":
        return

    content = (event.arguments or {}).get("content", "")
    if not content or len(content.strip()) < 10:
        return

    # Get scope
    scope = "default"
    if hasattr(event, 'metadata') and event.metadata:
        system = event.metadata.get("system")
        if system and hasattr(system, "llm_chat") and system.llm_chat:
            try:
                scope = system.llm_chat.session_manager.active_scope or "default"
            except Exception:
                pass

    match = _find_similar_memory(content, scope)
    if match:
        mem_id, mem_content, similarity = match
        pct = int(similarity * 100)
        new_len = len(content.strip())
        old_len = len((mem_content or "").strip())

        # If the new memory has more content, it's an upgrade — auto-replace
        if new_len > old_len + 20:
            try:
                db_path = _find_memory_db()
                if db_path:
                    conn = sqlite3.connect(str(db_path), timeout=2)
                    conn.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
                    conn.commit()
                    conn.close()
                    logger.info(
                        f"Self-Reflection: auto-replaced memory #{mem_id} "
                        f"({old_len} chars -> {new_len} chars, {pct}% match)"
                    )
                    # Let the save proceed — don't block
                    return
            except Exception as e:
                logger.error(f"Self-Reflection: auto-replace error: {e}")
                # If replace fails, let the save through anyway
                return

        # Same length or shorter — it's a true duplicate, block it
        event.skip_llm = True
        event.result = (
            f"Memory NOT saved — you already have a similar memory "
            f"(#{mem_id}, {pct}% match):\n"
            f"\"{mem_content[:200]}\"\n\n"
            f"To add more detail, use edit_memory(memory_id={mem_id}, content=\"your updated text\") "
            f"or save a longer version and it will automatically replace the old one."
        )
        logger.info(
            f"Self-Reflection: blocked duplicate save_memory "
            f"({pct}% match with #{mem_id}, new={new_len} old={old_len})"
        )
