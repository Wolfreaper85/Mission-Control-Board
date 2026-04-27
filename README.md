# Sapphire Mission Control

Visual command center plugin for [Sapphire AI](https://github.com/Wolfreaper85). The dashboard hub where you manage goals, plan your day, run focus sessions, watch your AI's self-reflection engine work, browse a calendar, and feed a 16-bit pixel pet — all from one place.

Mission Control is one of the larger Sapphire plugins because it pulls a lot of "everyday workflow" features into a single tab. You can use as much or as little of it as you want; everything is opt-in via settings.

## What you get

### Daily workflow
- **Daily Plan** — what you're working on today, with check-off as you complete items
- **Daily Notes** — quick capture for the day's stray thoughts
- **Goals Kanban** — drag-and-drop board for active/in-progress/completed goals
- **User Goals** — long-term goals separate from day-to-day tasks
- **Calendar** — 24-hour planner view, event creation/editing, reminder notifications via Service Worker
- **Habits** — recurring habit tracker with streak stats
- **Focus Timer** — Pomodoro-style sessions with stats

### Self-reflection engine
- **Correction Detection** — auto-detects when you correct the AI mid-conversation and logs it
- **Learned Rules** — promotes recurring corrections into permanent rules the AI follows
- **Bulletin Board** — request board for rule promotions, standing orders, capabilities
- **Reasoning Capsules** — captures successful reasoning patterns for reuse
- **Daily Pattern Scan** — runs at 3 AM, finds recurring corrections, proposes rule promotions to the bulletin board (VFM scoring decides what's worth promoting)
- **Prompt Injection** — active rules and capsules get injected into the system prompt so the AI actually applies what it's learned

### Fun stuff
- **Pixel Pet** — 16-bit-style pet that lives on your dashboard, evolves, reacts to your activity. Optional but delightful.
- **Workshop** — hand-crafted scene art with state-reactive animated overlays (the workshop reflects what's happening in your day)
- **XP System** — earn points and unlock achievements as you complete goals, finish focus sessions, and hit habit streaks

### Glue features
- **Streaming Chat Panel** — chat with personas right from the dashboard, no need to switch views
- **Plugin Launcher** — quick-launch any installed Sapphire plugin from one place
- **Real-time Agent Monitoring** — see which agents are doing what, live
- **Health Digest** — daily 10 PM Discord post summarizing your goals, memory activity, and self-reflection metrics

## Installation

Drop the `mission-control` folder into your Sapphire `plugins/` directory and restart Sapphire. The dashboard is auto-registered as a top-level UI.

For the optional Discord Health Digest, configure the `digest_channel` setting (default: `lexi-updates-for-wolf`) and ensure your Discord plugin is configured.

## Requirements

- [Sapphire AI](https://github.com/Wolfreaper85) v2.5+
- (Optional) [Sapphire-Discord](https://github.com/Wolfreaper85) for Health Digest posting
- (Optional) [MemPalace](https://github.com/Wolfreaper85) — Mission Control's reflection engine reads memory stats from MemPalace if installed

## Settings (all opt-in / opt-out)

| Setting | Default | What it controls |
|---|---|---|
| `correction_detection` | `true` | Auto-log when you correct the AI |
| `self_reflection` | `true` | Lightweight self-evaluation after complex tasks |
| `learned_rules` | `true` | Apply rules learned from corrections |
| `bulletin_board` | `true` | AI request board for rule promotions, capabilities |
| `capsules` | `true` | Capture and reuse successful reasoning patterns |
| `write_ahead_logging` | `true` | Save corrections immediately before AI responds (no data loss on crash) |
| `prompt_injection` | `true` | Inject active rules + capsules into system prompt |
| `workshop` | `true` | Show the pixel art Workshop on dashboard (disable to save GPU/CPU) |
| `daily_pattern_scan` | `true` | Run daily pattern analysis at 3 AM |
| `health_digest` | `true` | Post daily summary to Discord at 10 PM |
| `digest_channel` | `lexi-updates-for-wolf` | Discord channel for health digest |
| `show_apps_nav` | `false` | Show "Apps" launcher button in nav bar |

Each can be toggled independently in Mission Control's settings panel.

## Scheduled tasks (visible in Sapphire's Schedule UI)

| Task | Cron | What it does |
|---|---|---|
| **MC Daily Pattern Scan** | `0 3 * * *` | Detects recurring correction patterns, calculates VFM scores, proposes rule promotions to the bulletin board |
| **MC Health Digest** | `0 22 * * *` | Posts a daily system health summary to Discord — goals, memories, self-reflection activity, focus stats |

Both are managed via Sapphire's Continuity scheduler and appear alongside other plugins' scheduled tasks. Disable from the Schedule UI without touching the plugin settings.

## How the self-reflection engine works

This is the most architecturally interesting piece of the plugin, so worth explaining briefly:

```
You correct the AI mid-conversation
        │
        ▼
   pre_chat hook detects the correction
        │
        ├─ Categorize (explicit_correction, permanent_directive, etc.)
        ├─ Save to local SQLite (write-ahead, before AI responds)
        └─ Surface in Reflection tab for review
        ▼
   Daily 3 AM: Pattern Scan runs
        │
        ├─ Group recent corrections (last 7 days) by category
        ├─ Calculate VFM (Value-For-Modification) score per pattern
        │     freq × failure × user_burden × ai_cost
        ├─ Skip patterns below MIN_VFM_SCORE (0.5) or MIN_OCCURRENCES (3)
        └─ Propose rule promotion to Bulletin Board
        ▼
   You review the bulletin → approve → rule becomes active
        │
        ▼
   prompt_inject hook adds active rules to system prompt on every turn
        │
        ▼
   AI applies the rule going forward; corrections decrease for that pattern
```

The result: the AI gradually learns from your corrections without needing fine-tuning, expensive training runs, or external API calls. Pure prompt-side learning with full transparency (you see and approve every rule promotion).

## Optional: Pixel Pet + Workshop

These are the parts that earned this README's "fun stuff" section. The pixel pet evolves over time as you use the dashboard. The Workshop is a hand-crafted 16-bit scene that animates based on your day's state — focused work sessions, completed habits, hit streaks, etc.

Both are optional (`workshop: false` disables the workshop to save GPU/CPU; the pet's animation can be toggled via the pet's own settings). They exist because *if we can bring a smile to someone, then it was worth it* — and they're not pretending to be more than that.

## License

MIT

## Author

Built by [Wolfreaper85](https://github.com/Wolfreaper85) with help from Claude. Pixel art and workshop scenes hand-crafted.
