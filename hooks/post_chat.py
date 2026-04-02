"""
post_chat hook — fires after a response is saved to history.
Triggers self-reflection on substantial exchanges and captures
reasoning capsules from complex responses.
Also detects "fake tool calls" — when the AI writes tool invocations
as text instead of executing them, indicating a poisoned chat context.
"""

import importlib.util
import logging
import re
import sqlite3
import sys
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# Heuristics for "complex" responses that warrant reflection
MIN_RESPONSE_LENGTH = 400
CODE_BLOCK_PATTERN = re.compile(r'```')
MULTI_STEP_PATTERN = re.compile(r'(?:^|\n)\s*\d+\.\s', re.MULTILINE)
CORRECTION_WINDOW_SECONDS = 30

# Patterns that indicate the AI wrote a tool call as text instead of executing it
_FAKE_TOOL_PATTERNS = [
    # XML-style tool call formats (Qwen, GLM, generic)
    re.compile(r'<function_call>\s*\{', re.IGNORECASE),
    re.compile(r'<tool_call>\s*\{', re.IGNORECASE),
    re.compile(r'<\|tool_call\|>', re.IGNORECASE),
    # JSON-like tool invocation in plain text
    re.compile(r'"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"\s*:', re.IGNORECASE),
    # Describing calling a function instead of calling it
    re.compile(r"(?:let me|i'?ll|i should|i'?m going to)\s+(?:call|use|invoke|run)\s+(?:the\s+)?(?:`?[a-z_]+`?\s+)?(?:function|tool)", re.IGNORECASE),
    # Writing out function call syntax as text
    re.compile(r'(?:calling|executing|running)\s+`?[a-z_]+\(', re.IGNORECASE),
]


def _load_plugin_module():
    """Load plugin.py by absolute path."""
    plugin_file = Path(__file__).parent.parent / "plugin.py"
    spec = importlib.util.spec_from_file_location("_mc_reflection_plugin", plugin_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_mc_reflection_plugin"] = module
    spec.loader.exec_module(module)
    return module


def _is_complex_response(response_text):
    """Heuristic: is this response complex enough to warrant reflection/capsule?"""
    if len(response_text) > MIN_RESPONSE_LENGTH:
        return True
    if len(CODE_BLOCK_PATTERN.findall(response_text)) >= 2:
        return True
    if len(MULTI_STEP_PATTERN.findall(response_text)) >= 3:
        return True
    return False


def _detect_problem_type(user_input, response_text):
    """Infer a problem type category from the exchange."""
    text = (user_input + " " + response_text).lower()
    if any(kw in text for kw in ["debug", "error", "fix", "bug", "crash", "traceback"]):
        return "debugging"
    if any(kw in text for kw in ["create", "build", "implement", "write code", "function"]):
        return "code_generation"
    if any(kw in text for kw in ["explain", "how does", "what is", "why does"]):
        return "explanation"
    if any(kw in text for kw in ["plan", "design", "architect", "structure"]):
        return "planning"
    if any(kw in text for kw in ["compare", "difference", "vs", "versus", "better"]):
        return "analysis"
    if any(kw in text for kw in ["refactor", "improve", "optimize", "clean up"]):
        return "refactoring"
    return "general"


def _do_reflection(plugin, user_input, response_text, scope, system):
    """Background thread: perform self-reflection via lightweight LLM call."""
    try:
        if not system or not hasattr(system, "llm_chat") or not system.llm_chat:
            # No LLM available — do pattern-based reflection
            lesson = f"Handled a {_detect_problem_type(user_input, response_text)} task"
            plugin.save_reflection(
                task_context=user_input[:500],
                what_worked="Completed the response",
                what_didnt=None,
                lesson=lesson,
                scope=scope
            )
            return

        llm = system.llm_chat
        provider_key, provider, model_override = llm._select_provider()
        effective_model = model_override if model_override else provider.model

        from core.chat.llm_providers import get_generation_params
        import config as app_config
        providers_config = {
            **(getattr(app_config, 'LLM_PROVIDERS', None) or {}),
            **(getattr(app_config, 'LLM_CUSTOM_PROVIDERS', None) or {})
        }
        gen_params = get_generation_params(provider_key, effective_model, providers_config)
        if model_override:
            gen_params['model'] = model_override

        prompt = f"""Analyze this exchange briefly. Output ONLY a JSON object, no other text.

User: {user_input[:500]}

Assistant response (truncated): {response_text[:800]}

Output format:
{{"what_worked": "brief note", "what_didnt": "brief note or null", "lesson": "one actionable lesson"}}

Rules:
- Output ONLY the JSON, nothing else
- Keep each field under 200 characters
- Focus on process, not content
- If everything went well, set what_didnt to null"""

        messages = [{"role": "user", "content": prompt}]
        llm_response = llm.tool_engine.call_llm_with_metrics(provider, messages, gen_params, tools=None)
        response = llm_response.content

        if not response:
            return

        # Strip thinking tags
        response_clean = re.sub(r'<think>.*?</think>', '', response.strip(), flags=re.DOTALL)

        # Extract JSON
        start = response_clean.find("{")
        end = response_clean.rfind("}") + 1
        if start == -1 or end == 0:
            return

        import json
        data = json.loads(response_clean[start:end])

        plugin.save_reflection(
            task_context=user_input[:500],
            what_worked=data.get("what_worked", "")[:1000],
            what_didnt=data.get("what_didnt")[:1000] if data.get("what_didnt") else None,
            lesson=data.get("lesson", "No lesson extracted")[:2000],
            scope=scope
        )
        logger.debug("Self-Reflection: reflection saved via LLM analysis")

    except Exception as e:
        logger.error(f"Self-Reflection: background reflection error: {e}")


def _find_goals_db():
    """Find goals.db for direct lightweight writes."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "goals.db"
        if candidate.exists():
            return candidate
    return None


def _detect_fake_tool_calls(response_text, scope="default"):
    """
    Check if the AI wrote tool calls as text instead of executing them.
    If detected, save a tool_health bulletin to alert the user.
    Uses direct SQLite — no module loading, stays lightweight.
    """
    # Strip thinking tags first — don't flag internal reasoning
    clean = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL).strip()
    if not clean:
        return

    matched = []
    for pattern in _FAKE_TOOL_PATTERNS:
        m = pattern.search(clean)
        if m:
            matched.append(m.group(0)[:80])

    if not matched:
        return

    logger.warning(f"Self-Reflection: fake tool call detected in response: {matched[0]}")

    # Save a tool_health bulletin via direct SQLite (no exec/module loading)
    try:
        db_path = _find_goals_db()
        if not db_path:
            return
        conn = sqlite3.connect(str(db_path), timeout=2)

        # Check if we already have a recent tool_health bulletin (avoid spam)
        existing = conn.execute(
            "SELECT id FROM bulletin_board WHERE request_type = 'tool_health' "
            "AND status = 'pending' AND created_at > datetime('now', '-1 hour')"
        ).fetchone()

        if not existing:
            conn.execute(
                "INSERT INTO bulletin_board (request_type, title, description, reason, status, scope) "
                "VALUES (?, ?, ?, ?, 'pending', ?)",
                (
                    "tool_health",
                    "Tool calling issue detected",
                    "The AI appears to be writing tool calls as text instead of executing them. "
                    "This usually means the chat context has become stuck in a pattern. "
                    "Starting a fresh chat should fix this.",
                    f"Detected pattern: {matched[0][:100]}",
                    scope
                )
            )
            conn.commit()
            logger.info("Self-Reflection: tool_health bulletin created")

        conn.close()
    except Exception as e:
        logger.error(f"Self-Reflection: tool health bulletin error: {e}")


def post_chat(event):
    """
    After each exchange, check if reflection or capsule capture is warranted.
    Also monitors for fake tool calls (AI writing tools as text).
    Heavy work runs in a background thread to avoid blocking the response pipeline.
    """
    from core.plugin_loader import plugin_loader

    settings = plugin_loader.get_plugin_settings("mission-control")
    reflection_enabled = settings.get("self_reflection", True)
    capsules_enabled = settings.get("capsules", True)

    user_input = event.input or ""
    response_text = event.response or ""

    # ── Tool health check — always runs, lightweight regex scan ──
    if response_text and len(response_text) > 20:
        # Get scope
        scope = "default"
        system = event.metadata.get("system")
        if system and hasattr(system, "llm_chat") and system.llm_chat:
            try:
                scope = system.llm_chat.session_manager.current_settings.get("memory_scope", "default")
            except Exception:
                pass
        _detect_fake_tool_calls(response_text, scope)

    if not reflection_enabled and not capsules_enabled:
        return

    # Skip trivial exchanges
    if len(user_input.split()) < 5 and len(response_text.split()) < 10:
        return

    # Get scope (reuse if already set above)
    scope = "default"
    system = event.metadata.get("system")
    if system and hasattr(system, "llm_chat") and system.llm_chat:
        try:
            scope = system.llm_chat.session_manager.current_settings.get("memory_scope", "default")
        except Exception:
            pass

    plugin = _load_plugin_module()

    # Capsule capture — for complex responses with clear structure
    if capsules_enabled and _is_complex_response(response_text):
        try:
            problem_type = _detect_problem_type(user_input, response_text)
            # Strip thinking tags before extracting pattern
            clean_response = re.sub(r'<think>.*?</think>', '', response_text, flags=re.DOTALL).strip()
            if not clean_response:
                clean_response = response_text
            # Extract a brief reasoning pattern (first paragraph or first 300 chars)
            pattern = clean_response[:300].split("\n\n")[0]
            if len(pattern) > 50:
                plugin.save_capsule(
                    problem_type=problem_type,
                    reasoning_pattern=pattern,
                    scope=scope
                )
        except Exception as e:
            logger.error(f"Self-Reflection: capsule capture error: {e}")

    # Self-reflection — runs in background thread for complex exchanges
    if reflection_enabled and _is_complex_response(response_text):
        t = threading.Thread(
            target=_do_reflection,
            args=(plugin, user_input, response_text, scope, system),
            daemon=True
        )
        t.start()
