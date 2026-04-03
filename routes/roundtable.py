# routes/roundtable.py
# Round Table — multi-persona discussion orchestration
# Lightweight mode: no hooks, no memory saves, no tool calling.
# Each persona's turn is a single LLM call with their system prompt + shared transcript.
# Sessions persist to SQLite so discussions survive restarts.

import json
import logging
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# ─── Session storage (SQLite + in-memory active session) ────────────────────

_active = {}  # session_id -> live session dict (for active discussions)

ROLE_DESCRIPTIONS = {
    "Leader": "Guide the discussion, synthesize points, and keep things on track. Make final calls when the group is divided.",
    "Advisor": "Provide measured counsel and point out considerations others may miss. Draw from experience.",
    "Devil's Advocate": "Challenge assumptions and present counterarguments. Push the group to think harder. Don't just agree.",
    "Observer": "Listen carefully and comment only when you have a key insight. Fewer but higher-quality contributions.",
    "Creative Thinker": "Propose unconventional ideas and novel approaches. Think outside the box.",
    "Analyst": "Focus on data, logic, and evidence. Break down arguments systematically.",
    "Mediator": "Find common ground between disagreeing parties. Reframe conflicts constructively.",
    "Critic": "Evaluate the quality and feasibility of proposals. Be honest but constructive.",
}


def _find_db():
    """Find or create roundtable.db in the user directory."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user"
        if candidate.exists():
            return candidate / "roundtable.db"
    return Path(__file__).parent.parent.parent.parent / "user" / "roundtable.db"


def _get_conn():
    """Get a SQLite connection with WAL mode."""
    db_path = _find_db()
    conn = sqlite3.connect(str(db_path), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


_tables_created = False

def _ensure_tables():
    """Create tables if needed. Idempotent."""
    global _tables_created
    if _tables_created:
        return
    try:
        conn = _get_conn()
        conn.execute('''
            CREATE TABLE IF NOT EXISTS discussions (
                id TEXT PRIMARY KEY,
                topic TEXT NOT NULL,
                roster TEXT NOT NULL,
                transcript TEXT NOT NULL DEFAULT '[]',
                current_round INTEGER DEFAULT 1,
                current_turn_index INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                llm_mode TEXT DEFAULT 'per_persona',
                force_provider TEXT DEFAULT '',
                force_model TEXT DEFAULT '',
                created_at TEXT,
                updated_at TEXT
            )
        ''')
        conn.commit()
        conn.close()
        _tables_created = True
    except Exception as e:
        logger.error(f"Round Table DB init error: {e}")


def _save_session(session):
    """Persist session to SQLite."""
    _ensure_tables()
    try:
        conn = _get_conn()
        conn.execute('''
            INSERT OR REPLACE INTO discussions
            (id, topic, roster, transcript, current_round, current_turn_index,
             status, llm_mode, force_provider, force_model, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            session["id"], session["topic"],
            json.dumps(session["roster"]), json.dumps(session["transcript"]),
            session["current_round"], session["current_turn_index"],
            session["status"], session.get("llm_mode", "per_persona"),
            session.get("force_provider", ""), session.get("force_model", ""),
            session.get("created_at", datetime.now().isoformat()),
            datetime.now().isoformat()
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"Round Table save error: {e}")


def _load_session(session_id):
    """Load a session from SQLite into memory."""
    _ensure_tables()
    try:
        conn = _get_conn()
        row = conn.execute("SELECT * FROM discussions WHERE id = ?", (session_id,)).fetchone()
        conn.close()
        if not row:
            return None
        return {
            "id": row["id"],
            "topic": row["topic"],
            "roster": json.loads(row["roster"]),
            "transcript": json.loads(row["transcript"]),
            "current_round": row["current_round"],
            "current_turn_index": row["current_turn_index"],
            "status": row["status"],
            "llm_mode": row["llm_mode"] or "per_persona",
            "force_provider": row["force_provider"] or "",
            "force_model": row["force_model"] or "",
            "created_at": row["created_at"],
        }
    except Exception as e:
        logger.error(f"Round Table load error: {e}")
        return None


def _get_session(session_id):
    """Get session from active cache or load from DB."""
    if session_id in _active:
        return _active[session_id]
    session = _load_session(session_id)
    if session:
        _active[session_id] = session
    return session


# ─── Helpers ────────────────────────────────────────────────────────────────

def _get_role_description(role):
    if role in ROLE_DESCRIPTIONS:
        return ROLE_DESCRIPTIONS[role]
    return f"Contribute to the discussion from your unique perspective as {role}."


def _format_transcript(transcript):
    lines = []
    for entry in transcript:
        name = entry.get("persona", "User")
        role = entry.get("role", "")
        content = entry.get("content", "")
        if role:
            lines.append(f"[{name} ({role})]: {content}")
        else:
            lines.append(f"[{name}]: {content}")
    return "\n\n".join(lines)


def _resolve_provider(provider_key, model_override=""):
    import config as app_config
    from core.chat.llm_providers import get_provider_by_key, get_first_available_provider, get_generation_params

    providers_config = {
        **getattr(app_config, 'LLM_PROVIDERS', {}),
        **getattr(app_config, 'LLM_CUSTOM_PROVIDERS', {})
    }
    timeout = getattr(app_config, 'LLM_REQUEST_TIMEOUT', 240.0)

    provider = None
    actual_key = provider_key

    if provider_key and provider_key not in ("auto", ""):
        provider = get_provider_by_key(provider_key, providers_config, timeout, model_override=model_override)
        if not provider:
            raise ConnectionError(f"Provider '{provider_key}' not available")
    else:
        result = get_first_available_provider(
            providers_config,
            getattr(app_config, 'LLM_FALLBACK_ORDER', []),
            timeout
        )
        if result:
            actual_key, provider = result
        else:
            raise ConnectionError("No LLM providers available")

    effective_model = model_override if model_override else provider.model
    gen_params = get_generation_params(actual_key, effective_model, providers_config)
    if model_override:
        gen_params['model'] = model_override

    return provider, effective_model, gen_params


def _load_persona_prompt(persona_settings):
    prompt_name = persona_settings.get("prompt", "sapphire")
    try:
        from core import prompts
        prompt_data = prompts.get_prompt(prompt_name)
        if prompt_data:
            content = prompt_data.get("content") if isinstance(prompt_data, dict) else str(prompt_data)
        else:
            content = "You are a helpful assistant."
    except Exception:
        content = "You are a helpful assistant."

    try:
        import config as app_config
        username = getattr(app_config, 'DEFAULT_USERNAME', 'Human')
    except Exception:
        username = 'Human'
    content = content.replace("{user_name}", username).replace("{ai_name}", persona_settings.get("prompt", "Assistant"))

    return content


# ─── API Handlers ───────────────────────────────────────────────────────────

async def get_roundtable_personas(**kwargs):
    """Get all available personas with info needed for the roster."""
    try:
        from core.personas.persona_manager import persona_manager
        personas = persona_manager.get_all()
        result = []
        for name, p in personas.items():
            settings = p.get("settings", {})
            result.append({
                "name": name,
                "tagline": p.get("tagline", ""),
                "avatar": p.get("avatar"),
                "trim_color": settings.get("trim_color", "#4a9eff"),
                "llm_primary": settings.get("llm_primary", "auto"),
                "llm_model": settings.get("llm_model", ""),
            })
        return {"personas": result}
    except Exception as e:
        logger.error(f"get_roundtable_personas error: {e}")
        return {"personas": [], "error": str(e)}


async def get_providers(**kwargs):
    """Get available LLM providers for the single-LLM mode dropdown."""
    try:
        import config as app_config
        from core.chat.llm_providers import get_available_providers
        providers_config = {
            **getattr(app_config, 'LLM_PROVIDERS', {}),
            **getattr(app_config, 'LLM_CUSTOM_PROVIDERS', {})
        }
        providers = get_available_providers(providers_config)
        result = []
        for p in providers:
            if p.get("enabled"):
                result.append({
                    "key": p.get("key", ""),
                    "name": p.get("name", p.get("key", "")),
                    "model": p.get("model", ""),
                })
        return {"providers": result}
    except Exception as e:
        logger.error(f"get_providers error: {e}")
        return {"providers": [], "error": str(e)}


async def list_discussions(**kwargs):
    """List all saved discussions, newest first."""
    _ensure_tables()
    try:
        conn = _get_conn()
        rows = conn.execute(
            "SELECT id, topic, status, current_round, created_at, updated_at, roster, transcript "
            "FROM discussions ORDER BY updated_at DESC LIMIT 50"
        ).fetchall()
        conn.close()
        result = []
        for r in rows:
            roster = json.loads(r["roster"]) if r["roster"] else []
            transcript = json.loads(r["transcript"]) if r["transcript"] else []
            result.append({
                "id": r["id"],
                "topic": r["topic"],
                "status": r["status"],
                "current_round": r["current_round"],
                "persona_count": len(roster),
                "message_count": len(transcript),
                "personas": [p.get("name", "") for p in roster[:5]],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
            })
        return {"discussions": result}
    except Exception as e:
        logger.error(f"list_discussions error: {e}")
        return {"discussions": [], "error": str(e)}


async def delete_discussion(**kwargs):
    """Delete a saved discussion."""
    body = kwargs.get("body", {})
    session_id = body.get("session_id", "")
    if not session_id:
        return {"error": "session_id is required"}
    _ensure_tables()
    try:
        conn = _get_conn()
        conn.execute("DELETE FROM discussions WHERE id = ?", (session_id,))
        conn.commit()
        conn.close()
        _active.pop(session_id, None)
        return {"success": True}
    except Exception as e:
        logger.error(f"delete_discussion error: {e}")
        return {"error": str(e)}


async def start_discussion(**kwargs):
    """Create a new round table session."""
    body = kwargs.get("body", {})
    topic = body.get("topic", "").strip()
    roster = body.get("roster", [])
    llm_mode = body.get("llm_mode", "per_persona")
    force_provider = body.get("force_provider", "")
    force_model = body.get("force_model", "")

    if not topic:
        return {"error": "Topic is required"}
    if len(roster) < 2:
        return {"error": "At least 2 personas are required"}

    roster = sorted(roster, key=lambda r: r.get("order", 0))

    session_id = str(uuid.uuid4())[:8]
    session = {
        "id": session_id,
        "topic": topic,
        "roster": roster,
        "transcript": [],
        "current_round": 1,
        "current_turn_index": 0,
        "status": "active",
        "llm_mode": llm_mode,
        "force_provider": force_provider,
        "force_model": force_model,
        "created_at": datetime.now().isoformat(),
    }
    _active[session_id] = session
    _save_session(session)

    logger.info(f"Round Table started: {session_id} | topic='{topic}' | {len(roster)} personas | mode={llm_mode}")
    return {"session_id": session_id, "roster": roster, "topic": topic}


async def next_turn(**kwargs):
    """Process the next persona's turn in the discussion."""
    body = kwargs.get("body", {})
    session_id = body.get("session_id", "")

    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    if session["status"] != "active":
        return {"error": f"Session is {session['status']}"}

    roster = session["roster"]
    turn_idx = session["current_turn_index"]

    if turn_idx >= len(roster):
        session["current_round"] += 1
        session["current_turn_index"] = 0
        turn_idx = 0

    persona_entry = roster[turn_idx]
    persona_name = persona_entry["name"]
    persona_role = persona_entry.get("role", "Participant")

    try:
        from core.personas.persona_manager import persona_manager
        persona_data = persona_manager.get(persona_name)
        if not persona_data:
            return {"error": f"Persona '{persona_name}' not found"}

        persona_settings = persona_data.get("settings", {})
        system_prompt = _load_persona_prompt(persona_settings)

        role_desc = _get_role_description(persona_role)
        role_injection = (
            f"\n\n[Round Table Discussion]\n"
            f"You are participating in a group discussion with other AI personas.\n"
            f"Your assigned role: {persona_role} — {role_desc}\n"
            f"Stay in character. Address others by name when responding to their points.\n"
            f"Keep your response focused and concise (2-4 paragraphs max)."
        )
        full_system = system_prompt + role_injection

        transcript_text = _format_transcript(session["transcript"]) if session["transcript"] else "(No discussion yet — you speak first.)"

        user_message = (
            f"Discussion topic: {session['topic']}\n\n"
            f"Round {session['current_round']}, it's your turn to contribute.\n\n"
            f"Discussion so far:\n{transcript_text}"
        )

        messages = [
            {"role": "system", "content": full_system},
            {"role": "user", "content": user_message}
        ]

        if session["llm_mode"] == "single" and session["force_provider"]:
            provider_key = session["force_provider"]
            model_override = session.get("force_model", "")
        else:
            provider_key = persona_settings.get("llm_primary", "auto")
            model_override = persona_settings.get("llm_model", "")

        provider, effective_model, gen_params = _resolve_provider(provider_key, model_override)

        response = provider.chat_completion(messages, tools=None, generation_params=gen_params)
        content = response.content or "(No response)"

        import re
        content = re.sub(r'<think>.*?</think>', '', content, flags=re.DOTALL).strip()
        if not content:
            content = "(No response)"

        entry = {
            "persona": persona_name,
            "role": persona_role,
            "content": content,
            "round": session["current_round"],
            "timestamp": datetime.now().isoformat(),
            "trim_color": persona_settings.get("trim_color", "#4a9eff"),
            "avatar": persona_data.get("avatar"),
        }
        session["transcript"].append(entry)
        session["current_turn_index"] = turn_idx + 1
        has_more = (turn_idx + 1) < len(roster)

        # Auto-save after each turn
        _save_session(session)

        logger.info(f"Round Table [{session_id}] R{session['current_round']} | {persona_name} ({persona_role}) spoke | {len(content)} chars")

        return {
            "entry": entry,
            "round": session["current_round"],
            "turn_index": turn_idx,
            "has_more": has_more,
            "session_id": session_id,
        }

    except ConnectionError as e:
        logger.error(f"Round Table provider error: {e}")
        return {"error": str(e), "persona": persona_name}
    except Exception as e:
        logger.error(f"Round Table next_turn error: {e}", exc_info=True)
        return {"error": str(e), "persona": persona_name}


async def user_interject(**kwargs):
    """Add a user message to the transcript."""
    body = kwargs.get("body", {})
    session_id = body.get("session_id", "")
    message = body.get("message", "").strip()

    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found"}
    if not message:
        return {"error": "Message is required"}

    entry = {
        "persona": "You",
        "role": "Moderator",
        "content": message,
        "round": session["current_round"],
        "timestamp": datetime.now().isoformat(),
        "trim_color": "#ffffff",
        "avatar": None,
    }
    session["transcript"].append(entry)
    session["current_round"] += 1
    session["current_turn_index"] = 0

    _save_session(session)
    return {"entry": entry, "round": session["current_round"]}


async def stop_discussion(**kwargs):
    """Stop a discussion session."""
    body = kwargs.get("body", {})
    session_id = body.get("session_id", "")

    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found"}

    session["status"] = "complete"
    _save_session(session)
    _active.pop(session_id, None)

    logger.info(f"Round Table [{session_id}] stopped | {len(session['transcript'])} messages")
    return {"success": True, "total_messages": len(session["transcript"])}


async def get_session_state(**kwargs):
    """Get full session state (for loading a saved discussion)."""
    query = kwargs.get("query", {})
    session_id = query.get("session_id", "")

    session = _get_session(session_id)
    if not session:
        return {"error": "Session not found"}

    return {
        "session_id": session["id"],
        "topic": session["topic"],
        "roster": session["roster"],
        "transcript": session["transcript"],
        "current_round": session["current_round"],
        "current_turn_index": session["current_turn_index"],
        "status": session["status"],
        "llm_mode": session.get("llm_mode", "per_persona"),
    }


async def get_roles(**kwargs):
    """Get available role presets."""
    return {"roles": list(ROLE_DESCRIPTIONS.keys())}
