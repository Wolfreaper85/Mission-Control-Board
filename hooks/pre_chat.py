"""
pre_chat hook — Write-Ahead Logging (WAL) for correction detection.
Scans the user's message BEFORE the AI responds and saves any detected
corrections immediately so they're never lost.
"""

import importlib.util
import logging
import re
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Compiled regex patterns for correction detection
# These cover explicit corrections, preference statements, and behavioral directives
_CORRECTION_PATTERNS = [
    # Explicit corrections — blunt "you're wrong" phrasing
    (re.compile(r"\bno[,.]?\s+(not?\s+)?(like\s+that|that\s+way)", re.IGNORECASE), "explicit_correction"),
    (re.compile(r"\bnot\s+what\s+i\s+(asked|wanted|meant|need)", re.IGNORECASE), "explicit_correction"),
    (re.compile(r"\bthat'?s?\s+(wrong|incorrect|not\s+right)", re.IGNORECASE), "explicit_correction"),
    (re.compile(r"\bthat'?s\s+not\s+how\b", re.IGNORECASE), "explicit_correction"),
    (re.compile(r"\byou('re|\s+are)\s+(wrong|incorrect|mistaken|confused)", re.IGNORECASE), "explicit_correction"),
    (re.compile(r"\bthat'?s\s+not\s+(what|for|how|the)", re.IGNORECASE), "explicit_correction"),

    # Clarifications — explaining what something actually is/does
    (re.compile(r"\bno[,.]?\s+(it|that|this)\s+(is|was|should|means)", re.IGNORECASE), "correction"),
    (re.compile(r"\bactually[,]?\s", re.IGNORECASE), "correction"),
    (re.compile(r"\bnot\s+(exactly|quite|really)\b", re.IGNORECASE), "correction"),
    (re.compile(r"\bwhat\s+i\s+(meant|mean)\s+(is|was)\b", re.IGNORECASE), "correction"),
    (re.compile(r"\blet\s+me\s+(clarify|explain|correct)\b", re.IGNORECASE), "correction"),
    (re.compile(r"\bto\s+be\s+clear\b", re.IGNORECASE), "correction"),
    (re.compile(r"\bthe\s+other\s+way\s+around\b", re.IGNORECASE), "correction"),
    (re.compile(r"\byou('ve|\s+have)\s+(it|that|this)\s+(backwards|reversed|flipped|mixed)", re.IGNORECASE), "correction"),
    (re.compile(r"\bnot\s+the\s+other\s+way", re.IGNORECASE), "correction"),

    # Preferences — only when directing the AI, not just sharing info
    (re.compile(r"\bi\s+prefer\s+(you|it|that|when\s+you|if\s+you)\b", re.IGNORECASE), "preference"),
    (re.compile(r"\bi('d|\s+would)\s+(rather\s+you|like\s+(it|you)\s+to)\b", re.IGNORECASE), "preference"),
    (re.compile(r"\bprefer\s+(it\s+)?(?:when|if|that)\s+you\b", re.IGNORECASE), "preference"),

    # Alternatives — only when redirecting, not describing options
    (re.compile(r"\binstead[,]?\s+(of\s+that|do|use|try|make|say)\b", re.IGNORECASE), "alternative"),
    (re.compile(r"\bdo\s+(this|that|it)\s+instead\b", re.IGNORECASE), "alternative"),

    # Stop / negative directives
    (re.compile(r"\bstop\s+(doing|saying|using|making|writing)\b", re.IGNORECASE), "stop_directive"),
    (re.compile(r"\bdon'?t\s+(do|say|use|make|write|add|include)\b", re.IGNORECASE), "negative_directive"),
    (re.compile(r"\bplease\s+(don'?t|stop|never)\b", re.IGNORECASE), "negative_directive"),
    (re.compile(r"\byou\s+(don'?t|shouldn'?t|can'?t)\s+need\s+to\b", re.IGNORECASE), "negative_directive"),

    # Future / permanent directives
    (re.compile(r"\bnext\s+time\b", re.IGNORECASE), "future_directive"),
    (re.compile(r"\bgoing\s+forward\b", re.IGNORECASE), "future_directive"),
    (re.compile(r"\bfrom\s+now\s+on\b", re.IGNORECASE), "permanent_directive"),
    (re.compile(r"\balways\s+(use|do|say|make|include|remember)\b", re.IGNORECASE), "permanent_directive"),
    (re.compile(r"\bnever\s+(do|say|use|make|write|add)\b", re.IGNORECASE), "permanent_directive"),
    (re.compile(r"\bmake\s+sure\s+(you|to)\s+(always|never)\b", re.IGNORECASE), "permanent_directive"),
    (re.compile(r"\bremember\s+that\b", re.IGNORECASE), "permanent_directive"),

    # Reminders — "I already told you"
    (re.compile(r"\bi\s+(told|asked)\s+you\s+to\b", re.IGNORECASE), "reminder_correction"),
    (re.compile(r"\bi\s+(already|just)\s+(said|told|explained|mentioned)\b", re.IGNORECASE), "reminder_correction"),
    (re.compile(r"\blike\s+i\s+said\b", re.IGNORECASE), "reminder_correction"),
]


def _load_plugin_module():
    """Load plugin.py by absolute path."""
    plugin_file = Path(__file__).parent.parent / "plugin.py"
    spec = importlib.util.spec_from_file_location("_mc_reflection_plugin", plugin_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_mc_reflection_plugin"] = module
    spec.loader.exec_module(module)
    return module


def pre_chat(event):
    """
    Scan user input for corrections and save them before the AI responds.
    This is purely observational — does NOT set skip_llm or modify input.
    """
    from core.plugin_loader import plugin_loader

    settings = plugin_loader.get_plugin_settings("mission-control")
    if not settings.get("correction_detection", True):
        return
    if not settings.get("write_ahead_logging", True):
        return

    user_input = event.input or ""
    if not user_input or len(user_input.split()) < 3:
        return

    # Check for correction patterns
    matched_categories = []
    for pattern, category in _CORRECTION_PATTERNS:
        if pattern.search(user_input):
            matched_categories.append(category)

    if not matched_categories:
        return

    # Use the most specific category found
    category = matched_categories[0]

    try:
        plugin = _load_plugin_module()
        # Get scope from system if available
        scope = "default"
        system = event.metadata.get("system")
        if system and hasattr(system, "llm_chat") and system.llm_chat:
            try:
                scope = system.llm_chat.session_manager.active_scope or "default"
            except Exception:
                pass

        plugin.save_correction(
            user_message=user_input,
            correction=user_input,  # Full message — refinement can come later
            category=category,
            scope=scope
        )
        logger.debug(f"Self-Reflection WAL: logged correction ({category})")
    except Exception as e:
        logger.error(f"Self-Reflection pre_chat error: {e}")
