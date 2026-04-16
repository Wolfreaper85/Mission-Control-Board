# tools/mission.py
# Chat-accessible tools for Mission Control

from pathlib import Path


def _get_active_scope():
    """Get the active persona's goal scope from ContextVar (matches core goals module behavior)."""
    try:
        from core.chat.function_manager import scope_goal
        return scope_goal.get()
    except Exception:
        return 'default'


def _resolve_scope(arguments):
    """Resolve scope: explicit argument > persona's active scope > 'default'."""
    return arguments.get("scope") or _get_active_scope()


def _get_active_memory_scope():
    """Get the active persona's memory scope from ContextVar — used to align
    calendar tool writes with what the Mission Control UI displays, since the
    calendar UI filters by memory_scope (via _mc.selectedScope)."""
    try:
        from core.chat.function_manager import scope_memory
        return scope_memory.get()
    except Exception:
        return 'default'


def _resolve_calendar_scope(arguments):
    """Resolve the scope used for calendar events.

    The Mission Control calendar UI filters events by `_mc.selectedScope`,
    which is driven by the persona's `memory_scope` setting. To keep the
    tool-created events visible in the UI, align on the same scope source.
    """
    return arguments.get("scope") or _get_active_memory_scope()


def _find_goals_db():
    """Find goals.db regardless of whether we run from plugins/ or user/plugins/."""
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "goals.db"
        if candidate.exists():
            return candidate
    return Path(__file__).parent.parent.parent.parent / "user" / "goals.db"

ENABLED = True
EMOJI = '\U0001f3af'

AVAILABLE_FUNCTIONS = [
    'mission_status', 'take_note', 'search_notes', 'list_notes',
    'self_reflect', 'get_learned_rules', 'post_bulletin', 'get_bulletins', 'edit_bulletin',
    'keep_data', 'edit_memory',
    'complete_goal', 'add_user_goal',
    'create_event', 'update_event', 'delete_event',
    'manage_daily_plan',
    'create_habit', 'toggle_habit',
    'focus_session',
    'save_daily_note',
]

TOOLS = [
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "mission_status",
            "description": "Get a summary of the Mission Control dashboard — active goals, running agents, recent completions. Use whenever the user wants to know what's going on, what they're working on, their workload, task status, or anything about their current goals and agents.",
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
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "take_note",
            "description": "Save a note to Mission Control's Notes board. Use whenever the user's intent is to save, record, write down, or remember any piece of information for later reference. This includes any mention of notes, things to remember, things to jot down, or information they want stored. If the user indicates they have a note but hasn't given the content yet, ask what it is. Always infer a short title from the content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Short title for the note (max 200 chars)"
                    },
                    "content": {
                        "type": "string",
                        "description": "The note content/body (max 2000 chars)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope for the note (default: 'default')"
                    }
                },
                "required": ["title", "content"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "search_notes",
            "description": "Search through saved notes in Mission Control. Use whenever the user wants to find, look up, check, or retrieve a previously saved note. Also use when they ask if they have a note about something, or want to recall information they saved before. Searches both title and content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword or phrase to find in note titles and content"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope to search in (default: 'default')"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "list_notes",
            "description": "List all saved notes in Mission Control. Use whenever the user wants to see all their notes, browse what they've saved, or get an overview of their notes collection.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "description": "Scope to list (default: 'default')"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "self_reflect",
            "description": "CALL THIS FUNCTION to record a self-reflection about a task you completed — do NOT write reflections in chat text, invoke this tool. Use after complex work, debugging, mistakes, or when you notice something you could improve. This is for YOUR learning, not the user's notes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_context": {
                        "type": "string",
                        "description": "Brief description of what the task was"
                    },
                    "what_worked": {
                        "type": "string",
                        "description": "What went well in your approach"
                    },
                    "what_didnt": {
                        "type": "string",
                        "description": "What could have been better (or null if everything went well)"
                    },
                    "lesson": {
                        "type": "string",
                        "description": "One actionable lesson to remember for next time"
                    }
                },
                "required": ["task_context", "lesson"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "get_learned_rules",
            "description": "Check your active learned rules — behavioral guidelines from past corrections and reflections. Use to review what you've learned, verify a rule before acting, or when the user asks what rules you follow.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {
                        "type": "string",
                        "description": "Scope to check (default: 'default')"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "post_bulletin",
            "description": "CALL THIS FUNCTION to submit a request to the Mission Control Bulletin Board — do NOT write the request in your chat response, you must invoke this tool. Use when you want to propose a standing order, rule promotion, schedule, or new capability for the user to approve or deny.",
            "parameters": {
                "type": "object",
                "properties": {
                    "request_type": {
                        "type": "string",
                        "enum": ["standing_order", "rule_promotion", "schedule", "capability"],
                        "description": "Type of request: standing_order (recurring behavior), rule_promotion (make a pattern permanent), schedule (create a scheduled task), capability (request a new tool)"
                    },
                    "title": {
                        "type": "string",
                        "description": "Short title for the request (max 200 chars)"
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of what you're proposing — MUST include specifics: what exactly would happen, when, and how. Never leave this empty."
                    },
                    "reason": {
                        "type": "string",
                        "description": "Why you think this would be helpful — what pattern have you noticed?"
                    }
                },
                "required": ["request_type", "title", "description", "reason"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "get_bulletins",
            "description": "Check the Mission Control Bulletin Board for pending requests. Use to see if you have any approved standing orders or if the user has responded to your requests.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "approved", "denied"],
                        "description": "Filter by status (optional — shows all if omitted)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope to check (default: 'default')"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "edit_bulletin",
            "description": "Edit an existing bulletin board request — update its title, description, or reason. Use when the user asks you to revise, fix, or add more detail to a bulletin you previously posted. Use get_bulletins first to find the bulletin ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "bulletin_id": {
                        "type": "integer",
                        "description": "The ID of the bulletin to edit"
                    },
                    "title": {
                        "type": "string",
                        "description": "New title (max 200 chars)"
                    },
                    "description": {
                        "type": "string",
                        "description": "New detailed description of the proposal"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Updated reason/justification"
                    }
                },
                "required": ["bulletin_id"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "keep_data",
            "description": "CALL THIS FUNCTION to mark self-reflection data as still useful, resetting its retention timer so it won't be auto-purged. Use when you reference a past correction, reflection, or capsule worth keeping. Retention limits: corrections 30d, reflections 60d, capsules 90d — this resets the clock.",
            "parameters": {
                "type": "object",
                "properties": {
                    "data_type": {
                        "type": "string",
                        "enum": ["corrections", "reflections", "capsules"],
                        "description": "Which type of data to keep alive"
                    },
                    "ids": {
                        "type": "array",
                        "items": { "type": "integer" },
                        "description": "List of record IDs to keep alive"
                    }
                },
                "required": ["data_type", "ids"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "edit_memory",
            "description": "Edit an existing memory entry — update its content, label, or both. Use when you want to add more detail to a memory, fix a mistake, or re-categorize it. The memory's keywords and embeddings are automatically regenerated. Use search_memory first to find the memory ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "integer",
                        "description": "The ID of the memory to edit"
                    },
                    "content": {
                        "type": "string",
                        "description": "The updated memory content (max 512 chars). Provide the full new content, not just the changes."
                    },
                    "label": {
                        "type": "string",
                        "description": "Optional category label (e.g. 'preference', 'technical', 'people', 'routine')"
                    }
                },
                "required": ["memory_id", "content"]
            }
        }
    },

    # ─── Goal Completion (create_goal & update_goal live in core goals module) ─
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "complete_goal",
            "description": "Mark a user goal as completed. Use after you finish executing a user's goal, or when the user says a goal is done. Awards XP automatically. Use mission_status first to find goal IDs if needed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "goal_id": {
                        "type": "integer",
                        "description": "The ID of the goal to complete"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["goal_id"]
            }
        }
    },

    # ─── User Goal (guarded — only when user explicitly says "add to my goals") ─
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "add_user_goal",
            "description": "Add a goal to the user's personal goals board. ONLY use this when the user explicitly asks to add something to their goals — e.g. 'add this to my goals', 'create a goal for...', 'I want a goal to...'. Never create goals on your own initiative.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Short goal title (max 200 chars)"
                    },
                    "description": {
                        "type": "string",
                        "description": "The instruction set / brief for this goal — what should be done when executing it"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": "Goal priority (default: medium)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["title"]
            }
        }
    },

    # ─── Calendar ─────────────────────────────────────────────────────────────
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "create_event",
            "description": "Create a calendar event in Mission Control. Use whenever the user wants to schedule, plan, book, or put something on their calendar. This includes meetings, appointments, reminders, deadlines, or any time-based event. Dates should be YYYY-MM-DD format — if the user mentions a day of the week or relative date like 'tomorrow' or 'next Friday', calculate the correct date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Event title"
                    },
                    "start_date": {
                        "type": "string",
                        "description": "Start date in YYYY-MM-DD format"
                    },
                    "end_date": {
                        "type": "string",
                        "description": "End date in YYYY-MM-DD (defaults to start_date)"
                    },
                    "start_time": {
                        "type": "string",
                        "description": "Start time in HH:MM format (24h). Omit for all-day events."
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional event description"
                    },
                    "category": {
                        "type": "string",
                        "enum": ["event", "meeting", "deadline", "reminder", "goal"],
                        "description": "Event category (default: event)"
                    },
                    "color": {
                        "type": "string",
                        "description": "Hex color like #4a9eff (optional)"
                    },
                    "reminder_minutes": {
                        "type": "integer",
                        "description": "Reminder N minutes before event (e.g. 15, 30, 60)"
                    },
                    "recurrence": {
                        "type": "string",
                        "enum": ["daily", "weekly", "monthly"],
                        "description": "Recurrence pattern (optional — omit for one-time events)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["title", "start_date"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "update_event",
            "description": "Update an existing calendar event — change title, date, time, description, or other details. Use whenever the user wants to move, reschedule, or modify a calendar event.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {
                        "type": "integer",
                        "description": "The ID of the event to update"
                    },
                    "title": { "type": "string", "description": "New title" },
                    "start_date": { "type": "string", "description": "New start date YYYY-MM-DD" },
                    "end_date": { "type": "string", "description": "New end date YYYY-MM-DD" },
                    "start_time": { "type": "string", "description": "New start time HH:MM" },
                    "description": { "type": "string", "description": "New description" },
                    "category": { "type": "string", "description": "New category" },
                    "color": { "type": "string", "description": "New hex color" },
                    "reminder_minutes": { "type": "integer", "description": "New reminder minutes" },
                    "scope": { "type": "string", "description": "Scope (default: 'default')" }
                },
                "required": ["event_id"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "delete_event",
            "description": "Delete a calendar event. Use whenever the user wants to cancel, remove, or delete something from their calendar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "event_id": {
                        "type": "integer",
                        "description": "The ID of the event to delete"
                    }
                },
                "required": ["event_id"]
            }
        }
    },

    # ─── Daily Plan ───────────────────────────────────────────────────────────
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "manage_daily_plan",
            "description": "Create or complete today's daily plan. Use whenever the user wants to plan their day, pick goals to focus on today, or indicate they're finished with their daily plan. To create a plan, provide goal_ids from the user's goals. To mark the plan as done, set action to 'complete'. Use mission_status first to get available goal IDs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["create", "complete"],
                        "description": "'create' to set today's plan, 'complete' to mark it done"
                    },
                    "goal_ids": {
                        "type": "array",
                        "items": { "type": "integer" },
                        "description": "List of goal IDs to include in today's plan (required for 'create')"
                    },
                    "date": {
                        "type": "string",
                        "description": "Date in YYYY-MM-DD (defaults to today)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["action"]
            }
        }
    },

    # ─── Habits ───────────────────────────────────────────────────────────────
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "create_habit",
            "description": "Create a new habit to track daily or weekly. Use whenever the user wants to start tracking a routine, build a new habit, or add something they want to do regularly. If they indicate they have a habit to add but haven't said what, ask them.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Habit name (e.g. 'Drink 8 glasses of water', 'Exercise 30min')"
                    },
                    "icon": {
                        "type": "string",
                        "description": "Emoji icon for the habit (default: ✅)"
                    },
                    "frequency": {
                        "type": "string",
                        "enum": ["daily", "weekly"],
                        "description": "How often (default: daily)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["name"]
            }
        }
    },
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "toggle_habit",
            "description": "Toggle a habit as done/undone for today. Use whenever the user indicates they completed a tracked habit, did their routine, or wants to check off / uncheck a habit for the day. Awards 15 XP per check-in.",
            "parameters": {
                "type": "object",
                "properties": {
                    "habit_id": {
                        "type": "integer",
                        "description": "The ID of the habit to toggle"
                    },
                    "date": {
                        "type": "string",
                        "description": "Date in YYYY-MM-DD (defaults to today)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["habit_id"]
            }
        }
    },

    # ─── Focus Sessions ───────────────────────────────────────────────────────
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "focus_session",
            "description": "Start or stop a focus/pomodoro session. Use whenever the user wants to begin focused work, start a timer, do deep work, or end an active focus session. Awards XP based on duration (30 XP per 25-minute block).",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["start", "stop"],
                        "description": "'start' to begin a session, 'stop' to end the current one"
                    },
                    "goal_id": {
                        "type": "integer",
                        "description": "Optional goal to link the focus session to (for 'start')"
                    },
                    "session_id": {
                        "type": "integer",
                        "description": "Session ID to stop (required for 'stop')"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["action"]
            }
        }
    },

    # ─── Daily Notes ──────────────────────────────────────────────────────────
    {
        "type": "function",
        "is_local": True,
        "function": {
            "name": "save_daily_note",
            "description": "Save a daily journal entry. Use whenever the user wants to write in their journal, log something about their day, or add a daily reflection. This is one entry per day (overwrites previous for that date). Different from take_note — this is the daily journal on the Calendar tab, not the Notes board.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The journal/note content"
                    },
                    "date": {
                        "type": "string",
                        "description": "Date in YYYY-MM-DD (defaults to today)"
                    },
                    "scope": {
                        "type": "string",
                        "description": "Scope (default: 'default')"
                    }
                },
                "required": ["content"]
            }
        }
    }
]


def execute(function_name, arguments, config):
    """Execute mission control tool functions."""
    if function_name == "mission_status":
        return _mission_status(arguments, config)
    elif function_name == "take_note":
        return _take_note(arguments, config)
    elif function_name == "search_notes":
        return _search_notes(arguments, config)
    elif function_name == "list_notes":
        return _list_notes(arguments, config)
    elif function_name == "self_reflect":
        return _self_reflect(arguments, config)
    elif function_name == "get_learned_rules":
        return _get_learned_rules(arguments, config)
    elif function_name == "post_bulletin":
        return _post_bulletin(arguments, config)
    elif function_name == "get_bulletins":
        return _get_bulletins(arguments, config)
    elif function_name == "edit_bulletin":
        return _edit_bulletin(arguments, config)
    elif function_name == "keep_data":
        return _keep_data(arguments, config)
    elif function_name == "edit_memory":
        return _edit_memory(arguments, config)
    elif function_name == "complete_goal":
        return _complete_goal(arguments, config)
    elif function_name == "add_user_goal":
        return _add_user_goal(arguments, config)
    elif function_name == "create_event":
        return _create_event(arguments, config)
    elif function_name == "update_event":
        return _update_event(arguments, config)
    elif function_name == "delete_event":
        return _delete_event(arguments, config)
    elif function_name == "manage_daily_plan":
        return _manage_daily_plan(arguments, config)
    elif function_name == "create_habit":
        return _create_habit(arguments, config)
    elif function_name == "toggle_habit":
        return _toggle_habit(arguments, config)
    elif function_name == "focus_session":
        return _focus_session(arguments, config)
    elif function_name == "save_daily_note":
        return _save_daily_note(arguments, config)
    return "Unknown function", False


def _mission_status(arguments, config):
    """Aggregate a quick status report."""
    import sqlite3
    from pathlib import Path

    scope = _resolve_scope(arguments)
    lines = ["\U0001f3af **Mission Control Status**\n"]

    # User Goals summary (user-owned goals from MC plugin)
    goals_db = _find_goals_db()
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

            # Count user goals by status
            cur.execute(f"SELECT status, COUNT(*) as cnt FROM user_goals WHERE {scope_sql} GROUP BY status", scope_params)
            counts = {row["status"]: row["cnt"] for row in cur.fetchall()}
            active = counts.get("active", 0)
            completed = counts.get("completed", 0)
            total = active + completed

            lines.append(f"**Your Goals:** {total} total | {active} active | {completed} completed")

            # Active user goals
            cur.execute(
                f"SELECT id, title, priority, description FROM user_goals WHERE {scope_sql} AND status = 'active' ORDER BY "
                "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, updated_at DESC LIMIT 10",
                scope_params
            )
            rows = cur.fetchall()
            if rows:
                lines.append("\n**\U0001f7e2 Active Goals:**")
                for r in rows:
                    icon = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(r["priority"], "\u26aa")
                    desc_hint = f" — {r['description'][:60]}..." if r["description"] else ""
                    lines.append(f"  {icon} [{r['id']}] {r['title']}{desc_hint}")

            # Recently completed user goals
            cur.execute(
                f"SELECT id, title, completed_at FROM user_goals WHERE {scope_sql} AND status = 'completed' ORDER BY completed_at DESC LIMIT 5",
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
        lines.append("**Your Goals:** No goals yet. Create one in Mission Control!")

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


def _take_note(arguments, config):
    """Create a note in Mission Control."""
    import sqlite3
    from pathlib import Path
    from datetime import datetime

    title = arguments.get("title", "").strip()
    content = arguments.get("content", "").strip()
    scope = _resolve_scope(arguments)

    if not title or not content:
        return "Error: Both title and content are required to take a note.", False

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized. Send a message in chat first.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute('''
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                scope TEXT NOT NULL DEFAULT 'default',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute(
            "INSERT INTO notes (title, content, scope) VALUES (?, ?, ?)",
            (title[:200], content[:2000], scope)
        )
        conn.commit()
        conn.close()
        return f"\U0001f4dd **Note saved!**\n**Title:** {title}\n**Content:** {content[:100]}{'...' if len(content) > 100 else ''}\n\n*View it in Mission Control → Notes*", True
    except Exception as e:
        return f"Error saving note: {e}", False


def _search_notes(arguments, config):
    """Search notes by keyword."""
    import sqlite3
    from pathlib import Path

    query = arguments.get("query", "").strip()
    scope = _resolve_scope(arguments)

    if not query:
        return "Please provide a search term to look for in your notes.", False

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "No notes found — database not initialized.", True

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM notes WHERE scope IN (?, 'global') AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT 10",
            (scope, f"%{query}%", f"%{query}%")
        ).fetchall()
        conn.close()

        if not rows:
            return f"\U0001f50d No notes found matching \"{query}\".", True

        lines = [f"\U0001f50d **Found {len(rows)} note(s) matching \"{query}\":**\n"]
        for r in rows:
            ts = r["created_at"] or ""
            lines.append(f"**[{r['id']}] {r['title']}** ({ts})")
            lines.append(f"  {r['content'][:200]}{'...' if len(r['content']) > 200 else ''}\n")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error searching notes: {e}", False


def _list_notes(arguments, config):
    """List all notes."""
    import sqlite3
    from pathlib import Path

    scope = _resolve_scope(arguments)

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "No notes yet. Say 'take a note' to create one!", True

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM notes WHERE scope IN (?, 'global') ORDER BY created_at DESC",
            (scope,)
        ).fetchall()
        conn.close()

        if not rows:
            return "\U0001f4dd **No notes yet.** Say 'take a note' to create one!", True

        lines = [f"\U0001f4dd **Your Notes ({len(rows)}):**\n"]
        for r in rows:
            ts = r["created_at"] or ""
            lines.append(f"**[{r['id']}] {r['title']}** ({ts})")
            lines.append(f"  {r['content'][:150]}{'...' if len(r['content']) > 150 else ''}\n")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error listing notes: {e}", False


# ─── Self-Reflection Tools ──────────────────────────────────────────────────

def _load_reflection():
    """Load plugin.py for self-reflection data access."""
    import importlib.util
    import sys
    plugin_file = Path(__file__).parent.parent / "plugin.py"
    spec = importlib.util.spec_from_file_location("_mc_reflection_plugin", plugin_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_mc_reflection_plugin"] = module
    spec.loader.exec_module(module)
    return module


def _self_reflect(arguments, config):
    """Record a self-reflection."""
    task_context = arguments.get("task_context", "").strip()
    what_worked = arguments.get("what_worked", "").strip()
    what_didnt = arguments.get("what_didnt", "").strip() or None
    lesson = arguments.get("lesson", "").strip()

    if not task_context or not lesson:
        return "Error: task_context and lesson are required.", False

    scope = _resolve_scope(arguments)

    try:
        plugin = _load_reflection()
        rid = plugin.save_reflection(
            task_context=task_context,
            what_worked=what_worked,
            what_didnt=what_didnt,
            lesson=lesson,
            scope=scope
        )
        if rid:
            return f"\U0001f4ad **Reflection saved!**\n**Context:** {task_context[:100]}\n**Lesson:** {lesson}\n\n*View in Mission Control \u2192 Reflections*", True
        return "Error saving reflection.", False
    except Exception as e:
        return f"Error: {e}", False


def _get_learned_rules(arguments, config):
    """Get active learned rules."""
    scope = _resolve_scope(arguments)

    try:
        plugin = _load_reflection()
        rules = plugin.get_active_rules(scope=scope)

        if not rules:
            return "\U0001f4cb **No active learned rules yet.** Rules are created when patterns are detected in corrections, or manually via Mission Control.", True

        lines = [f"\U0001f4cb **Active Learned Rules ({len(rules)}):**\n"]
        for r in rules:
            source_icon = "\U0001f916" if r["source"] == "auto" else "\U0001f9e0"
            lines.append(f"{source_icon} **[{r['id']}]** {r['rule']}")
            lines.append(f"   _Seen {r['times_seen']}x | VFM: {r['vfm_score']:.2f} | Source: {r['source']}_\n")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error: {e}", False


def _post_bulletin(arguments, config):
    """Post a request to the bulletin board."""
    request_type = arguments.get("request_type", "")
    title = arguments.get("title", "").strip()
    description = arguments.get("description", "").strip()
    reason = arguments.get("reason", "").strip()
    scope = _resolve_scope(arguments)

    if not request_type or not title:
        return "Error: request_type and title are required.", False

    if not description:
        return "Error: description is required — explain specifically what you're proposing, not just why.", False

    valid_types = ("standing_order", "rule_promotion", "schedule", "capability")
    if request_type not in valid_types:
        return f"Error: request_type must be one of: {', '.join(valid_types)}", False

    try:
        plugin = _load_reflection()
        bid = plugin.save_bulletin(
            request_type=request_type,
            title=title,
            description=description,
            reason=reason,
            scope=scope
        )
        if bid:
            type_icons = {"standing_order": "\U0001f4e5", "rule_promotion": "\u2b06\ufe0f", "schedule": "\u23f0", "capability": "\U0001f527"}
            icon = type_icons.get(request_type, "\U0001f4cb")
            return f"{icon} **Request posted to Bulletin Board!**\n**Type:** {request_type.replace('_', ' ').title()}\n**Title:** {title}\n**Reason:** {reason[:200]}\n\n*Awaiting user approval in Mission Control \u2192 Bulletin Board*", True
        return "Error posting request.", False
    except Exception as e:
        return f"Error: {e}", False


def _get_bulletins(arguments, config):
    """Check the bulletin board."""
    status = arguments.get("status")
    scope = _resolve_scope(arguments)

    try:
        plugin = _load_reflection()
        bulletins = plugin.get_bulletins(scope=scope, status=status)

        if not bulletins:
            filter_text = f" with status '{status}'" if status else ""
            return f"\U0001f4cb **No bulletin board entries{filter_text}.** Use post_bulletin to make a request.", True

        lines = [f"\U0001f4cb **Bulletin Board ({len(bulletins)} entries):**\n"]
        status_icons = {"pending": "\u23f3", "approved": "\u2705", "denied": "\u274c"}
        type_icons = {"standing_order": "\U0001f4e5", "rule_promotion": "\u2b06\ufe0f", "schedule": "\u23f0", "capability": "\U0001f527"}

        for b in bulletins:
            s_icon = status_icons.get(b["status"], "\u2753")
            t_icon = type_icons.get(b["request_type"], "\U0001f4cb")
            lines.append(f"{s_icon} {t_icon} **[{b['id']}] {b['title']}**")
            lines.append(f"   _Type: {b['request_type'].replace('_', ' ')} | Status: {b['status']} | {b['created_at']}_")
            if b.get("description"):
                lines.append(f"   {b['description'][:200]}")
            lines.append("")

        return "\n".join(lines), True
    except Exception as e:
        return f"Error: {e}", False


def _edit_bulletin(arguments, config):
    """Edit an existing bulletin board entry."""
    import sqlite3

    bulletin_id = arguments.get("bulletin_id")
    if not bulletin_id:
        return "Error: bulletin_id is required.", False

    fields = []
    params = []
    for key, col, max_len in [("title", "title", 200), ("description", "description", 2000), ("reason", "reason", 2000)]:
        val = arguments.get(key)
        if val is not None:
            fields.append(f"{col} = ?")
            params.append(val.strip()[:max_len])

    if not fields:
        return "Error: Nothing to update. Provide title, description, or reason.", False

    params.append(int(bulletin_id))

    try:
        goals_db = _find_goals_db()
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        cur = conn.execute(f"UPDATE bulletin_board SET {', '.join(fields)} WHERE id = ?", params)
        if cur.rowcount == 0:
            conn.close()
            return f"Error: Bulletin [{bulletin_id}] not found.", False
        conn.commit()
        conn.close()
        return f"\u2705 Bulletin [{bulletin_id}] updated.", True
    except Exception as e:
        return f"Error editing bulletin: {e}", False


def _keep_data(arguments, config):
    """Reset retention timer on self-reflection data the AI finds useful."""
    import importlib.util
    import sys

    data_type = arguments.get("data_type")
    ids = arguments.get("ids", [])

    if not data_type or not ids:
        return "Error: data_type and ids are required", False

    valid_types = ["corrections", "reflections", "capsules"]
    if data_type not in valid_types:
        return f"Error: data_type must be one of {valid_types}", False

    try:
        plugin_file = Path(__file__).parent.parent / "plugin.py"
        spec = importlib.util.spec_from_file_location("_mc_reflection_plugin", plugin_file)
        module = importlib.util.module_from_spec(spec)
        sys.modules["_mc_reflection_plugin"] = module
        spec.loader.exec_module(module)

        touch_fn = {
            "corrections": module.touch_corrections,
            "reflections": module.touch_reflections,
            "capsules": module.touch_capsules
        }[data_type]

        touch_fn(ids)
        return f"\u2705 Kept {len(ids)} {data_type} alive \u2014 retention timer reset", True
    except Exception as e:
        return f"Error: {e}", False


def _edit_memory(arguments, config):
    """Edit an existing memory — updates content, keywords, embeddings, and optional label."""
    import sqlite3
    import re

    memory_id = arguments.get("memory_id")
    content = arguments.get("content", "").strip()
    label = arguments.get("label")

    if not memory_id:
        return "Error: memory_id is required", False
    if not content:
        return "Error: content is required", False
    if len(content) > 512:
        return f"Error: content too long ({len(content)} chars, max 512)", False

    # Find memory.db
    memory_db = None
    for i in range(6):
        candidate = Path(__file__).parents[i] / "user" / "memory.db"
        if candidate.exists():
            memory_db = candidate
            break

    if not memory_db:
        return "Error: memory database not found", False

    try:
        conn = sqlite3.connect(str(memory_db), timeout=5)
        conn.row_factory = sqlite3.Row

        # Verify memory exists
        row = conn.execute("SELECT id, content, scope FROM memories WHERE id = ?", (int(memory_id),)).fetchone()
        if not row:
            conn.close()
            return f"Error: memory #{memory_id} not found", False

        scope = row["scope"]
        old_content = row["content"]

        # Extract keywords (same logic as Sapphire core)
        stopwords = {"the", "a", "an", "is", "are", "was", "were", "be", "been",
                     "have", "has", "had", "do", "does", "did", "will", "would",
                     "could", "should", "can", "to", "of", "in", "for", "on",
                     "with", "at", "by", "from", "as", "and", "or", "but", "not",
                     "this", "that", "it", "i", "me", "my", "he", "she", "his",
                     "her", "we", "they", "them", "you", "your"}
        words = re.findall(r'[a-z]+', content.lower())
        keywords = " ".join(sorted(set(w for w in words if len(w) >= 3 and w not in stopwords)))

        # Try to generate embedding via Sapphire's embedder
        embedding_blob = None
        try:
            from functions.memory import _get_embedder
            embedder = _get_embedder()
            if embedder.available:
                embs = embedder.embed([content], prefix='search_document')
                if embs is not None:
                    embedding_blob = embs[0].tobytes()
        except Exception:
            pass  # Embedding update is optional

        # Update the memory
        if label is not None:
            conn.execute(
                "UPDATE memories SET content = ?, keywords = ?, label = ?, embedding = ?, "
                "timestamp = CURRENT_TIMESTAMP WHERE id = ? AND scope = ?",
                (content, keywords, label.lower().strip() if label else None, embedding_blob, int(memory_id), scope)
            )
        else:
            conn.execute(
                "UPDATE memories SET content = ?, keywords = ?, embedding = ?, "
                "timestamp = CURRENT_TIMESTAMP WHERE id = ? AND scope = ?",
                (content, keywords, embedding_blob, int(memory_id), scope)
            )

        conn.commit()
        conn.close()

        return (
            f"\u2705 Memory #{memory_id} updated.\n"
            f"**Before:** {old_content[:150]}{'...' if len(old_content) > 150 else ''}\n"
            f"**After:** {content[:150]}{'...' if len(content) > 150 else ''}"
        ), True

    except Exception as e:
        return f"Error editing memory: {e}", False


# ─── Goal Management Tools ────────────────────────────────────────────────────

def _create_goal(arguments, config):
    """Create a goal in Mission Control."""
    import sqlite3
    import json
    from datetime import datetime, date

    title = arguments.get("title", "").strip()
    if not title:
        return "Error: title is required.", False

    description = arguments.get("description", "").strip()
    priority = arguments.get("priority", "medium")
    permanent = 1 if arguments.get("permanent") else 0
    scope = _resolve_scope(arguments)

    if priority not in ("high", "medium", "low"):
        priority = "medium"

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized. Send a message in chat first.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        cur = conn.execute(
            "INSERT INTO goals (title, description, priority, status, permanent, scope, created_at, updated_at) "
            "VALUES (?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            (title[:200], description[:500], priority, permanent, scope)
        )
        goal_id = cur.lastrowid

        # Auto-add to today's daily plan so AI-created goals appear immediately
        today = date.today().isoformat()
        try:
            row = conn.execute(
                "SELECT id, goal_ids FROM daily_plans WHERE plan_date = ? AND scope = ?",
                (today, scope)
            ).fetchone()
            if row:
                existing_ids = json.loads(row[1] or '[]')
                if goal_id not in existing_ids:
                    existing_ids.append(goal_id)
                    conn.execute("UPDATE daily_plans SET goal_ids = ? WHERE id = ?",
                                 (json.dumps(existing_ids), row[0]))
            else:
                conn.execute(
                    "INSERT INTO daily_plans (plan_date, goal_ids, scope) VALUES (?, ?, ?)",
                    (today, json.dumps([goal_id]), scope)
                )
        except Exception as plan_err:
            logger.debug(f"Auto-add to daily plan failed (non-fatal): {plan_err}")

        conn.commit()
        conn.close()

        perm_tag = " (permanent)" if permanent else ""
        icon = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(priority, "\u26aa")
        return f"{icon} **Goal created!** [{goal_id}] {title}{perm_tag}\n*Priority: {priority} | View in Mission Control → Goals*", True
    except Exception as e:
        return f"Error creating goal: {e}", False


def _update_goal(arguments, config):
    """Update a goal's title, description, or priority."""
    import sqlite3

    goal_id = arguments.get("goal_id")
    if not goal_id:
        return "Error: goal_id is required.", False

    scope = _resolve_scope(arguments)
    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    fields = []
    params = []
    for key, col, max_len in [("title", "title", 200), ("description", "description", 500)]:
        val = arguments.get(key)
        if val is not None:
            fields.append(f"{col} = ?")
            params.append(val.strip()[:max_len])

    priority = arguments.get("priority")
    if priority and priority in ("high", "medium", "low"):
        fields.append("priority = ?")
        params.append(priority)

    if not fields:
        return "Error: Nothing to update. Provide title, description, or priority.", False

    fields.append("updated_at = CURRENT_TIMESTAMP")
    params.extend([int(goal_id), scope])

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            f"UPDATE goals SET {', '.join(fields)} WHERE id = ? AND scope IN (?, 'global')",
            params
        )
        conn.commit()
        conn.close()
        return f"\u2705 Goal [{goal_id}] updated.", True
    except Exception as e:
        return f"Error updating goal: {e}", False


def _complete_goal(arguments, config):
    """Mark a user goal as completed, with XP award."""
    import sqlite3
    import json
    from datetime import datetime

    goal_id = arguments.get("goal_id")
    if not goal_id:
        return "Error: goal_id is required.", False

    status = arguments.get("status", "completed")
    if status not in ("completed",):
        status = "completed"

    scope = _resolve_scope(arguments)
    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")

        # Look up in user_goals table
        row = conn.execute("SELECT title, priority FROM user_goals WHERE id = ?", (int(goal_id),)).fetchone()
        if not row:
            conn.close()
            return f"Error: User goal [{goal_id}] not found.", False

        title = row["title"]
        priority = row["priority"]

        conn.execute(
            "UPDATE user_goals SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (int(goal_id),)
        )

        # Award XP
        xp_map = {"high": 50, "medium": 30, "low": 15}
        xp = xp_map.get(priority, 30)
        try:
            conn.execute(
                "INSERT INTO xp_log (action, xp_amount, scope, details) VALUES (?, ?, ?, ?)",
                ("user_goal_complete", xp, scope, json.dumps({"goal_id": goal_id, "title": title}))
            )
        except Exception:
            pass

        conn.commit()
        conn.close()
        return f"\u2705 **Goal completed!** [{goal_id}] {title}\n+{xp} XP awarded ({priority} priority)", True

    except Exception as e:
        return f"Error completing goal: {e}", False


def _add_user_goal(arguments, config):
    """Create a user goal (only when user explicitly requests it)."""
    title = arguments.get("title", "").strip()
    if not title:
        return "Error: title is required.", False

    description = arguments.get("description", "").strip() or None
    priority = arguments.get("priority", "medium")
    scope = _resolve_scope(arguments)

    try:
        import importlib.util, sys
        plugin_file = Path(__file__).parent.parent / "plugin.py"
        spec = importlib.util.spec_from_file_location("_mc_plugin_goals", plugin_file)
        module = importlib.util.module_from_spec(spec)
        sys.modules["_mc_plugin_goals"] = module
        spec.loader.exec_module(module)

        goal_id = module.create_user_goal(title, description, priority, scope)
        if goal_id:
            icon = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(priority, "\u26aa")
            desc_line = f"\n**Brief:** {description[:200]}" if description else ""
            return f"{icon} **Goal added!** [{goal_id}] {title}{desc_line}\n\n*View in Mission Control → Goals*", True
        return "Error: Failed to create goal.", False
    except Exception as e:
        return f"Error creating goal: {e}", False


# ─── Calendar Tools ───────────────────────────────────────────────────────────

def _create_event(arguments, config):
    """Create a calendar event."""
    import sqlite3

    title = arguments.get("title", "").strip()
    start_date = arguments.get("start_date", "").strip()
    if not title or not start_date:
        return "Error: title and start_date are required.", False

    end_date = arguments.get("end_date", start_date).strip()
    start_time = arguments.get("start_time")
    description = arguments.get("description", "")
    category = arguments.get("category", "event")
    color = arguments.get("color", "#4a9eff")
    reminder_minutes = arguments.get("reminder_minutes")
    recurrence = arguments.get("recurrence")
    scope = _resolve_calendar_scope(arguments)
    all_day = 0 if start_time else 1

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        cur = conn.execute(
            "INSERT INTO calendar_events (title, description, start_date, end_date, start_time, all_day, color, category, scope, reminder_minutes, chime_count, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, CURRENT_TIMESTAMP)",
            (title, description, start_date, end_date, start_time, all_day, color, category, scope, reminder_minutes)
        )
        event_id = cur.lastrowid

        # Handle recurrence
        if recurrence and recurrence in ("daily", "weekly", "monthly"):
            try:
                conn.execute(
                    "INSERT INTO recurring_rules (event_id, pattern, interval_val, scope, created_at) VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)",
                    (event_id, recurrence, scope)
                )
            except Exception:
                pass  # Recurring table may not exist

        conn.commit()
        conn.close()

        time_str = f" at {start_time}" if start_time else " (all day)"
        recur_str = f" — repeats {recurrence}" if recurrence else ""
        return f"\U0001f4c5 **Event created!** [{event_id}] {title}\n{start_date}{time_str}{recur_str}\n*View in Mission Control → Calendar*", True
    except Exception as e:
        return f"Error creating event: {e}", False


def _update_event(arguments, config):
    """Update a calendar event."""
    import sqlite3

    event_id = arguments.get("event_id")
    if not event_id:
        return "Error: event_id is required.", False

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    fields = []
    params = []
    for key in ["title", "description", "start_date", "end_date", "start_time", "category", "color"]:
        val = arguments.get(key)
        if val is not None:
            fields.append(f"{key} = ?")
            params.append(val)

    reminder = arguments.get("reminder_minutes")
    if reminder is not None:
        fields.append("reminder_minutes = ?")
        params.append(reminder)

    if not fields:
        return "Error: Nothing to update.", False

    params.append(int(event_id))

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(f"UPDATE calendar_events SET {', '.join(fields)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        return f"\u2705 Event [{event_id}] updated.", True
    except Exception as e:
        return f"Error updating event: {e}", False


def _delete_event(arguments, config):
    """Delete a calendar event."""
    import sqlite3

    event_id = arguments.get("event_id")
    if not event_id:
        return "Error: event_id is required.", False

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")

        # Get event title for confirmation
        row = conn.execute("SELECT title FROM calendar_events WHERE id = ?", (int(event_id),)).fetchone()
        if not row:
            conn.close()
            return f"Error: Event [{event_id}] not found.", False
        title = row[0]

        conn.execute("DELETE FROM calendar_events WHERE id = ?", (int(event_id),))
        # Also clean up recurring rules
        try:
            conn.execute("DELETE FROM recurring_rules WHERE event_id = ?", (int(event_id),))
        except Exception:
            pass

        conn.commit()
        conn.close()
        return f"\U0001f5d1\ufe0f Event [{event_id}] \"{title}\" deleted.", True
    except Exception as e:
        return f"Error deleting event: {e}", False


# ─── Daily Plan Tools ─────────────────────────────────────────────────────────

def _manage_daily_plan(arguments, config):
    """Create or complete a daily plan."""
    import sqlite3
    import json
    from datetime import date

    action = arguments.get("action", "create")
    scope = _resolve_scope(arguments)
    plan_date = arguments.get("date", date.today().isoformat())

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")

        if action == "create":
            goal_ids = arguments.get("goal_ids", [])
            if not goal_ids:
                return "Error: goal_ids are required to create a daily plan.", False

            # Get goal titles for confirmation (from user_goals table)
            placeholders = ",".join("?" * len(goal_ids))
            rows = conn.execute(
                f"SELECT id, title, priority FROM user_goals WHERE id IN ({placeholders})",
                goal_ids
            ).fetchall()

            conn.execute(
                "INSERT OR REPLACE INTO daily_plans (plan_date, scope, goal_ids, completed, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)",
                (plan_date, scope, json.dumps(goal_ids))
            )
            conn.commit()
            conn.close()

            lines = [f"\U0001f4cb **Daily plan set for {plan_date}!**\n"]
            for r in rows:
                icon = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(r[2], "\u26aa")
                lines.append(f"  {icon} [{r[0]}] {r[1]}")
            lines.append(f"\n*{len(goal_ids)} goals planned. Complete them to earn bonus XP!*")
            return "\n".join(lines), True

        elif action == "complete":
            conn.execute(
                "UPDATE daily_plans SET completed = 1 WHERE plan_date = ? AND scope = ?",
                (plan_date, scope)
            )
            # Award bonus XP
            try:
                conn.execute(
                    "INSERT INTO xp_log (action, xp_amount, scope, details, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    ("daily_plan_complete", 100, scope, json.dumps({"date": plan_date}))
                )
            except Exception:
                pass

            conn.commit()
            conn.close()
            return f"\U0001f389 **Daily plan completed!** Great work today!\n+100 bonus XP awarded", True

        else:
            conn.close()
            return f"Error: Unknown action '{action}'. Use 'create' or 'complete'.", False

    except Exception as e:
        return f"Error with daily plan: {e}", False


# ─── Habit Tools ──────────────────────────────────────────────────────────────

def _create_habit(arguments, config):
    """Create a new habit."""
    import sqlite3

    name = arguments.get("name", "").strip()
    if not name:
        return "Error: name is required.", False

    icon = arguments.get("icon", "\u2705")
    frequency = arguments.get("frequency", "daily")
    scope = _resolve_scope(arguments)

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        cur = conn.execute(
            "INSERT INTO habits (name, icon, frequency, scope, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
            (name, icon, frequency, scope)
        )
        habit_id = cur.lastrowid
        conn.commit()
        conn.close()
        return f"{icon} **Habit created!** [{habit_id}] {name} ({frequency})\n*Track it daily in Mission Control → Dashboard*", True
    except Exception as e:
        return f"Error creating habit: {e}", False


def _toggle_habit(arguments, config):
    """Toggle habit completion for a date."""
    import sqlite3
    from datetime import date

    habit_id = arguments.get("habit_id")
    if not habit_id:
        return "Error: habit_id is required.", False

    toggle_date = arguments.get("date", date.today().isoformat())
    scope = _resolve_scope(arguments)

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")

        # Get habit name
        habit = conn.execute("SELECT name, icon FROM habits WHERE id = ?", (int(habit_id),)).fetchone()
        if not habit:
            conn.close()
            return f"Error: Habit [{habit_id}] not found.", False

        # Check if already completed today
        existing = conn.execute(
            "SELECT id FROM habit_completions WHERE habit_id = ? AND date = ?",
            (int(habit_id), toggle_date)
        ).fetchone()

        if existing:
            conn.execute("DELETE FROM habit_completions WHERE id = ?", (existing["id"],))
            conn.commit()
            conn.close()
            return f"\u26aa Habit [{habit_id}] {habit['name']} — unchecked for {toggle_date}", True
        else:
            conn.execute(
                "INSERT INTO habit_completions (habit_id, date, completed_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (int(habit_id), toggle_date)
            )
            # Award XP
            try:
                conn.execute(
                    "INSERT INTO xp_log (action, xp_amount, scope, details, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    ("habit_checkin", 15, scope, f'{{"habit_id": {habit_id}}}')
                )
            except Exception:
                pass

            conn.commit()
            conn.close()
            return f"{habit['icon']} **{habit['name']}** — checked off for {toggle_date}!\n+15 XP", True

    except Exception as e:
        return f"Error toggling habit: {e}", False


# ─── Focus Session Tools ─────────────────────────────────────────────────────

def _focus_session(arguments, config):
    """Start or stop a focus session."""
    import sqlite3
    from datetime import datetime

    action = arguments.get("action", "start")
    scope = _resolve_scope(arguments)

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")

        if action == "start":
            goal_id = arguments.get("goal_id")
            session_type = arguments.get("type", "work")
            now = datetime.now().isoformat()

            cur = conn.execute(
                "INSERT INTO focus_sessions (goal_id, start_time, type, scope, completed) VALUES (?, ?, ?, ?, 0)",
                (goal_id, now, session_type, scope)
            )
            session_id = cur.lastrowid
            conn.commit()
            conn.close()

            goal_str = f" on goal [{goal_id}]" if goal_id else ""
            return f"\u23f1\ufe0f **Focus session started!** [{session_id}]{goal_str}\n*Stay focused! Tell me when you're done to stop the timer.*", True

        elif action == "stop":
            session_id = arguments.get("session_id")

            # If no session_id, find the most recent active session
            if not session_id:
                row = conn.execute(
                    "SELECT id, start_time, goal_id FROM focus_sessions WHERE end_time IS NULL AND scope = ? ORDER BY start_time DESC LIMIT 1",
                    (scope,)
                ).fetchone()
                if not row:
                    conn.close()
                    return "No active focus session found.", False
                session_id = row[0]
                start_time = row[1]
            else:
                row = conn.execute(
                    "SELECT start_time FROM focus_sessions WHERE id = ?",
                    (int(session_id),)
                ).fetchone()
                if not row:
                    conn.close()
                    return f"Error: Session [{session_id}] not found.", False
                start_time = row[0]

            now = datetime.now()
            start = datetime.fromisoformat(start_time)
            duration = int((now - start).total_seconds() / 60)

            conn.execute(
                "UPDATE focus_sessions SET end_time = ?, duration_minutes = ?, completed = 1 WHERE id = ?",
                (now.isoformat(), duration, int(session_id))
            )

            # Award XP based on duration
            xp = max(10, 30 * (duration // 25))  # 30 XP per pomodoro (25min)
            try:
                conn.execute(
                    "INSERT INTO xp_log (action, xp_amount, scope, details, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    ("focus_complete", xp, scope, f'{{"session_id": {session_id}, "minutes": {duration}}}')
                )
            except Exception:
                pass

            conn.commit()
            conn.close()
            return f"\u2705 **Focus session complete!** [{session_id}]\n*Duration: {duration} minutes*\n+{xp} XP awarded", True

        else:
            conn.close()
            return f"Error: Unknown action '{action}'. Use 'start' or 'stop'.", False

    except Exception as e:
        return f"Error with focus session: {e}", False


# ─── Daily Note Tool ──────────────────────────────────────────────────────────

def _save_daily_note(arguments, config):
    """Save a daily journal entry."""
    import sqlite3
    from datetime import date

    content = arguments.get("content", "").strip()
    if not content:
        return "Error: content is required.", False

    note_date = arguments.get("date", date.today().isoformat())
    scope = _resolve_scope(arguments)

    goals_db = _find_goals_db()
    if not goals_db.exists():
        return "Error: Database not initialized.", False

    try:
        conn = sqlite3.connect(str(goals_db), timeout=5)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            "INSERT OR REPLACE INTO daily_notes (date, scope, content, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (note_date, scope, content)
        )
        conn.commit()
        conn.close()
        return f"\U0001f4d3 **Daily note saved for {note_date}!**\n{content[:200]}{'...' if len(content) > 200 else ''}\n*View in Mission Control → Calendar*", True
    except Exception as e:
        return f"Error saving daily note: {e}", False
