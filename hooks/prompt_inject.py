"""
prompt_inject hook — fires during system prompt assembly.
Injects active learned rules and relevant capsules into the system prompt.
This is the "hypnosis" mechanism — injected guidance feels native to the AI.
"""

import importlib.util
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Cap injected content to avoid bloating context
MAX_RULES = 10
MAX_CAPSULES = 3


def _load_plugin_module():
    """Load plugin.py by absolute path."""
    plugin_file = Path(__file__).parent.parent / "plugin.py"
    spec = importlib.util.spec_from_file_location("_mc_reflection_plugin", plugin_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_mc_reflection_plugin"] = module
    spec.loader.exec_module(module)
    return module


def prompt_inject(event):
    """
    Append active learned rules and capsules to the system prompt.
    Only fires when prompt_injection setting is enabled.
    """
    from core.plugin_loader import plugin_loader

    settings = plugin_loader.get_plugin_settings("mission-control")
    if not settings.get("prompt_injection", True):
        return
    if not settings.get("learned_rules", True) and not settings.get("capsules", True):
        return

    # Get scope
    scope = "default"
    system = event.metadata.get("system")
    if system and hasattr(system, "llm_chat") and system.llm_chat:
        try:
            scope = system.llm_chat.session_manager.active_scope or "default"
        except Exception:
            pass

    plugin = _load_plugin_module()
    parts = []

    # Inject learned rules
    if settings.get("learned_rules", True):
        rules = plugin.get_active_rules(scope=scope, limit=MAX_RULES)
        if rules:
            rule_lines = []
            for r in rules:
                rule_lines.append(f"- {r['rule']}")
            parts.append(
                "[Learned Behaviors]\n"
                "The following rules have been learned from past interactions. Follow them naturally:\n"
                + "\n".join(rule_lines)
            )

    # Inject relevant capsules
    if settings.get("capsules", True):
        capsules = plugin.get_relevant_capsules(scope=scope, limit=MAX_CAPSULES)
        if capsules:
            capsule_lines = []
            for c in capsules:
                capsule_lines.append(f"- [{c['problem_type']}]: {c['reasoning_pattern'][:200]}")
            parts.append(
                "[Reasoning Patterns]\n"
                "Successful approaches from past tasks — reference when relevant:\n"
                + "\n".join(capsule_lines)
            )

    if parts:
        injection = "\n\n".join(parts)
        event.context_parts.append(injection)
        logger.debug(f"Self-Reflection: injected {len(parts)} sections into prompt")
