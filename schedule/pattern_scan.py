"""
Daily pattern scan — runs on cron to detect recurring corrections,
calculate VFM scores, and create bulletin board requests for rule promotion.
"""

import logging

logger = logging.getLogger(__name__)

# VFM Scoring Weights
WEIGHT_FREQUENCY = 3.0     # How often does this correction appear?
WEIGHT_FAILURE = 3.0       # Does it reduce failures/corrections?
WEIGHT_USER_BURDEN = 2.0   # Does it reduce user effort?
WEIGHT_AI_COST = 2.0       # Cost to the AI (token overhead)?

# Thresholds
MIN_OCCURRENCES = 3        # Must appear 3+ times
MIN_VFM_SCORE = 0.5        # 0.0-1.0 scale, must exceed this to propose
LOOKBACK_DAYS = 7          # Window for pattern detection


def _calculate_vfm(count, total_corrections, category):
    """
    Calculate Value-For-Modification score (0.0-1.0).
    Higher = more worth promoting to a permanent rule.
    """
    # Frequency score: how much of recent corrections does this pattern represent?
    freq_score = min(count / max(total_corrections, 1), 1.0)

    # Failure reduction: permanent directives and explicit corrections are high-value
    failure_map = {
        "explicit_correction": 0.9,
        "permanent_directive": 0.95,
        "stop_directive": 0.8,
        "negative_directive": 0.75,
        "future_directive": 0.7,
        "reminder_correction": 0.85,
        "preference": 0.6,
        "correction": 0.65,
        "alternative": 0.5,
    }
    failure_score = failure_map.get(category, 0.5)

    # User burden: recurring corrections mean the user keeps having to repeat themselves
    burden_score = min(count / 5.0, 1.0)  # Maxes out at 5 occurrences

    # AI cost: rules are cheap (just prompt text), so cost is low
    cost_score = 0.9  # Low cost = high score

    # Weighted average
    total_weight = WEIGHT_FREQUENCY + WEIGHT_FAILURE + WEIGHT_USER_BURDEN + WEIGHT_AI_COST
    vfm = (
        (freq_score * WEIGHT_FREQUENCY) +
        (failure_score * WEIGHT_FAILURE) +
        (burden_score * WEIGHT_USER_BURDEN) +
        (cost_score * WEIGHT_AI_COST)
    ) / total_weight

    return round(vfm, 3)


def _extract_rule_from_corrections(corrections):
    """
    Given a list of similar corrections, extract a concise rule.
    Uses the most common correction text, or the most recent explicit directive.
    """
    # Prefer permanent/future directives as they're already phrased as rules
    for c in corrections:
        cat = c.get("category", "")
        if cat in ("permanent_directive", "future_directive"):
            return c["correction"]

    # Fall back to most recent correction
    return corrections[0]["correction"] if corrections else ""


def run(event):
    """
    Daily pattern scan — detect recurring corrections and propose rule promotions.
    Called by the continuity scheduler on cron.
    """
    from core.plugin_loader import plugin_loader
    import importlib.util
    import sys
    from pathlib import Path

    settings = plugin_loader.get_plugin_settings("mission-control")
    if not settings.get("daily_pattern_scan", True):
        return "Skipped (disabled)"
    if not settings.get("bulletin_board", True):
        return "Skipped (bulletin board disabled)"

    # Load plugin.py
    plugin_file = Path(__file__).parent.parent / "plugin.py"
    spec = importlib.util.spec_from_file_location("_mc_reflection_plugin", plugin_file)
    module = importlib.util.module_from_spec(spec)
    sys.modules["_mc_reflection_plugin"] = module
    spec.loader.exec_module(module)

    # Get recent corrections (last 7 days)
    corrections = module.get_corrections(scope="default", limit=200, since_days=LOOKBACK_DAYS)
    if not corrections:
        return "No recent corrections to analyze"

    total_corrections = len(corrections)

    # Group by category
    by_category = {}
    for c in corrections:
        cat = c.get("category", "unknown")
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(c)

    # Find patterns (3+ in same category within window)
    proposals = 0
    for category, group in by_category.items():
        if len(group) < MIN_OCCURRENCES:
            continue

        # Calculate VFM for this pattern
        vfm = _calculate_vfm(len(group), total_corrections, category)

        # Touch these corrections — they're part of an active pattern, keep them alive
        try:
            module.touch_corrections([c['id'] for c in group])
        except Exception:
            pass

        if vfm < MIN_VFM_SCORE:
            continue

        # Check if we already have an active rule or pending bulletin for this
        existing_rules = module.get_active_rules(scope="default", limit=100)
        existing_bulletins = module.get_bulletins(scope="default", status="pending", limit=100)

        # Simple dedup: skip if a rule already mentions this category
        rule_text = _extract_rule_from_corrections(group)
        already_exists = False
        for r in existing_rules:
            if rule_text[:50].lower() in r["rule"].lower():
                # Bump the existing rule instead
                module.bump_rule(r["id"])
                already_exists = True
                break
        for b in existing_bulletins:
            if rule_text[:50].lower() in (b.get("description") or "").lower():
                already_exists = True
                break

        if already_exists:
            continue

        # Create bulletin board request
        module.save_bulletin(
            request_type="rule_promotion",
            title=f"Promote pattern: {category.replace('_', ' ').title()}",
            description=f"Proposed rule: {rule_text[:500]}",
            reason=f"Detected {len(group)} corrections in category '{category}' over the last {LOOKBACK_DAYS} days (VFM score: {vfm})",
            scope="default"
        )
        proposals += 1
        logger.info(f"Self-Reflection: proposed rule promotion for '{category}' (VFM={vfm}, count={len(group)})")

    # Run retention cleanup
    cleanup = {}
    try:
        cleanup = module.cleanup_old_data()
    except Exception as e:
        logger.error(f"Self-Reflection: cleanup during pattern scan failed: {e}")

    purged = sum(cleanup.values()) if cleanup else 0
    return f"Scanned {total_corrections} corrections, created {proposals} proposals, purged {purged} old records"
