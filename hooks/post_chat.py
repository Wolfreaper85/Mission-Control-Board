"""
post_chat hook — fires after a response is saved to history.
Triggers self-reflection on substantial exchanges and captures
reasoning capsules from complex responses.
"""

import importlib.util
import logging
import re
import sys
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

# Heuristics for "complex" responses that warrant reflection
MIN_RESPONSE_LENGTH = 400
CODE_BLOCK_PATTERN = re.compile(r'```')
MULTI_STEP_PATTERN = re.compile(r'(?:^|\n)\s*\d+\.\s', re.MULTILINE)
CORRECTION_WINDOW_SECONDS = 30


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


def post_chat(event):
    """
    After each exchange, check if reflection or capsule capture is warranted.
    Heavy work runs in a background thread to avoid blocking the response pipeline.
    """
    from core.plugin_loader import plugin_loader

    settings = plugin_loader.get_plugin_settings("mission-control")
    reflection_enabled = settings.get("self_reflection", True)
    capsules_enabled = settings.get("capsules", True)

    if not reflection_enabled and not capsules_enabled:
        return

    user_input = event.input or ""
    response_text = event.response or ""

    # Skip trivial exchanges
    if len(user_input.split()) < 5 and len(response_text.split()) < 10:
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

    # Capsule capture — for complex responses with clear structure
    if capsules_enabled and _is_complex_response(response_text):
        try:
            problem_type = _detect_problem_type(user_input, response_text)
            # Extract a brief reasoning pattern (first paragraph or first 300 chars)
            pattern = response_text[:300].split("\n\n")[0]
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
