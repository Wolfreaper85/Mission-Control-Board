// styles/theme.js — Dark Neon Theme System for Mission Control
// CSS variables + all component styles + neon glow effects

export function injectTheme() {
    if (document.getElementById('mc-theme')) return;
    const style = document.createElement('style');
    style.id = 'mc-theme';
    style.textContent = CSS;
    document.head.appendChild(style);
}

const CSS = `
/* ═══════════════════════════════════════════════════════════════════════════
   MISSION CONTROL — DARK NEON THEME
   CSS Variable System + Complete Component Styles
   ═══════════════════════════════════════════════════════════════════════════ */

:root {
    /* ── Core Backgrounds ── */
    --mc-bg-void: #050508;
    --mc-bg-primary: #0a0a0f;
    --mc-bg-secondary: #0d0d14;
    --mc-bg-tertiary: #111118;
    --mc-bg-elevated: #15151f;
    --mc-bg-surface: #1a1a2e;

    /* ── Borders ── */
    --mc-border: #1a1a24;
    --mc-border-hover: #2a2a3a;
    --mc-border-active: #333;

    /* ── Text ── */
    --mc-text-primary: #e8e8f0;
    --mc-text-secondary: #aaa;
    --mc-text-muted: #666;
    --mc-text-dim: #444;

    /* ── Neon Accents ── */
    --mc-cyan: #00f0ff;
    --mc-cyan-dim: #00a8b3;
    --mc-cyan-bg: rgba(0,240,255,0.08);
    --mc-cyan-glow: 0 0 20px rgba(0,240,255,0.3);

    --mc-magenta: #ff00aa;
    --mc-magenta-dim: #b3007a;
    --mc-magenta-bg: rgba(255,0,170,0.08);
    --mc-magenta-glow: 0 0 20px rgba(255,0,170,0.3);

    --mc-green: #00ff88;
    --mc-green-dim: #00b35e;
    --mc-green-bg: rgba(0,255,136,0.08);
    --mc-green-glow: 0 0 20px rgba(0,255,136,0.3);

    --mc-gold: #ffd700;
    --mc-gold-dim: #b39600;
    --mc-gold-bg: rgba(255,215,0,0.08);
    --mc-gold-glow: 0 0 20px rgba(255,215,0,0.3);

    --mc-orange: #ff9800;
    --mc-red: #ff3355;
    --mc-purple: #b366ff;

    /* ── Glassmorphism ── */
    --mc-glass-bg: rgba(17,17,24,0.85);
    --mc-glass-border: rgba(255,255,255,0.06);
    --mc-glass-blur: blur(12px);

    /* ── Transitions ── */
    --mc-transition: 0.2s ease;
    --mc-transition-slow: 0.4s ease;

    /* ── Sizing ── */
    --mc-radius: 10px;
    --mc-radius-sm: 6px;
    --mc-radius-lg: 14px;
}

/* ═══ Global Animations ═══ */

@keyframes mc-glow-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
@keyframes mc-neon-breathe {
    0%, 100% { box-shadow: 0 0 8px var(--mc-cyan), inset 0 0 8px rgba(0,240,255,0.05); }
    50% { box-shadow: 0 0 20px var(--mc-cyan), 0 0 40px rgba(0,240,255,0.15), inset 0 0 15px rgba(0,240,255,0.08); }
}
@keyframes mc-float-up {
    0% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-60px); }
}
@keyframes mc-toast-in {
    from { opacity: 0; transform: translateX(40px) scale(0.95); }
    to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes mc-toast-glow {
    0%, 100% { box-shadow: 0 0 12px var(--mc-glow-color, rgba(0,240,255,0.2)); }
    50% { box-shadow: 0 0 24px var(--mc-glow-color, rgba(0,240,255,0.4)), 0 0 48px var(--mc-glow-color, rgba(0,240,255,0.15)); }
}
@keyframes mc-slide-in {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes mc-dot-bounce {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.2); }
}
@keyframes mc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes mc-overlay-in { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes mc-drawer-slide { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }
@keyframes mc-health-fade-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mc-guide-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mc-tab-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mc-xp-float { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-80px) scale(1.2); } }
@keyframes mc-level-burst {
    0% { transform: scale(0); opacity: 0; }
    50% { transform: scale(1.3); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
}
@keyframes mc-streak-glow {
    0%, 100% { text-shadow: 0 0 8px var(--mc-gold); }
    50% { text-shadow: 0 0 20px var(--mc-gold), 0 0 40px rgba(255,215,0,0.3); }
}
@keyframes mc-ripple {
    to { transform: scale(2.5); opacity: 0; }
}
@keyframes mc-scanner {
    0% { top: 0; opacity: 0.6; }
    50% { opacity: 0.3; }
    100% { top: 100%; opacity: 0; }
}
@keyframes mc-gradient-shift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
@keyframes mc-card-enter {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ═══ Root Layout ═══ */

.mc-root {
    display: flex;
    height: 100%;
    overflow: hidden;
    background: var(--mc-bg-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    position: relative;
    color: var(--mc-text-primary);
}
.mc-root::before {
    content: '';
    position: absolute;
    top: -50%; left: -50%; right: -50%; bottom: -50%;
    background:
        radial-gradient(ellipse at 20% 50%, rgba(0,240,255,0.03) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(255,0,170,0.02) 0%, transparent 50%),
        radial-gradient(ellipse at 60% 80%, rgba(179,102,255,0.02) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
    animation: mc-gradient-shift 20s ease infinite;
    background-size: 200% 200%;
}
.mc-root > * { position: relative; z-index: 1; }

/* ═══ Tab Bar (new) ═══ */

.mc-tab-bar {
    display: flex;
    gap: 2px;
    padding: 0 8px;
    background: rgba(13,13,20,0.8);
    backdrop-filter: blur(16px) saturate(1.8);
    -webkit-backdrop-filter: blur(16px) saturate(1.8);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    overflow-x: auto;
    flex-shrink: 0;
    position: relative;
    z-index: 5;
}
.mc-tab-bar::before {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0,240,255,0.15), transparent);
}
.mc-tab-bar::-webkit-scrollbar { height: 0; }

.mc-tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--mc-text-muted);
    font-size: 0.82rem;
    padding: 12px 16px;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
    overflow: hidden;
}
.mc-tab-btn:hover {
    color: var(--mc-text-secondary);
    background: rgba(255,255,255,0.03);
}
.mc-tab-btn.mc-tab-active {
    color: var(--mc-cyan);
    border-bottom-color: var(--mc-cyan);
    text-shadow: 0 0 10px rgba(0,240,255,0.3);
    background: rgba(0,240,255,0.04);
}
.mc-tab-btn.mc-tab-active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 10%;
    right: 10%;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--mc-cyan), transparent);
    box-shadow: 0 0 12px rgba(0,240,255,0.5), 0 0 24px rgba(0,240,255,0.2);
    border-radius: 2px;
}
.mc-tab-btn.mc-tab-active::before {
    content: '';
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 60%;
    background: linear-gradient(to top, rgba(0,240,255,0.04), transparent);
    pointer-events: none;
}
.mc-tab-icon { font-size: 0.9rem; transition: transform 0.2s; }
.mc-tab-btn:hover .mc-tab-icon { transform: scale(1.1); }
.mc-tab-btn.mc-tab-active .mc-tab-icon { filter: drop-shadow(0 0 4px rgba(0,240,255,0.4)); }
.mc-tab-label { font-weight: 600; letter-spacing: 0.02em; }
.mc-tab-badge {
    font-size: 0.6rem;
    background: var(--mc-magenta-bg);
    color: var(--mc-magenta);
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 700;
}

/* Tab Content Area */
.mc-tab-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    animation: mc-tab-fade 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 16px 24px 40px;
}
.mc-tab-content > * {
    animation: mc-card-enter 0.35s ease-out both;
}
.mc-tab-content > *:nth-child(2) { animation-delay: 0.05s; }
.mc-tab-content > *:nth-child(3) { animation-delay: 0.1s; }
.mc-tab-content > *:nth-child(4) { animation-delay: 0.15s; }
.mc-tab-content > *:nth-child(5) { animation-delay: 0.2s; }

/* ═══ Dashboard Area (right side of chat) ═══ */
.mc-dash {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--mc-text-primary);
}
.mc-dash-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 24px 40px;
}

/* ═══ Header ═══ */
.mc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px 12px;
    flex-shrink: 0;
    background: rgba(10,10,15,0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255,255,255,0.03);
}
.mc-header-left { display: flex; align-items: center; gap: 4px; }
.mc-header-right { display: flex; align-items: center; gap: 10px; }

.mc-greeting {
    font-size: 1.8rem;
    font-weight: 700;
    margin: 0;
    color: #fff;
    font-style: italic;
    background: linear-gradient(135deg, #fff 20%, var(--mc-cyan) 60%, var(--mc-magenta) 100%);
    background-size: 200% 200%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: mc-gradient-shift 8s ease infinite;
}
.mc-date { margin: 4px 0 0; color: var(--mc-text-muted); font-size: 0.85rem; }
.mc-back-btn {
    background: none; border: none; font-size: 1.3rem; cursor: pointer;
    padding: 4px 8px; margin-right: 8px; opacity: 0.6; transition: opacity var(--mc-transition);
}
.mc-back-btn:hover { opacity: 1; }

/* Agent Status */
.mc-agent-status {
    display: flex; align-items: center; gap: 10px;
    background: rgba(17,17,24,0.7); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); padding: 10px 16px;
    backdrop-filter: blur(12px) saturate(1.5);
    -webkit-backdrop-filter: blur(12px) saturate(1.5);
    transition: all 0.3s;
}
.mc-agent-status:hover { border-color: rgba(255,255,255,0.08); }
.mc-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.mc-dot-idle { background: #555; }
.mc-dot-active { background: var(--mc-green); box-shadow: var(--mc-green-glow); animation: mc-glow-pulse 2s infinite; }
.mc-status-text { display: flex; flex-direction: column; }
.mc-status-name { font-size: 0.82rem; font-weight: 600; color: #ccc; }
.mc-status-sub { font-size: 0.72rem; color: var(--mc-text-muted); }

/* Guide button */
.mc-guide-btn {
    background: var(--mc-cyan-bg); border: 1px solid rgba(0,240,255,0.25); border-radius: 8px;
    color: var(--mc-cyan); font-size: 0.78rem; padding: 8px 14px; cursor: pointer;
    transition: all var(--mc-transition); white-space: nowrap;
}
.mc-guide-btn:hover { background: rgba(0,240,255,0.15); border-color: rgba(0,240,255,0.45); box-shadow: var(--mc-cyan-glow); }

/* ═══ XP Bar (new) ═══ */

.mc-xp-section {
    margin-bottom: 16px;
}
.mc-xp-bar-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(17,17,24,0.7);
    border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius);
    padding: 10px 16px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    position: relative;
    overflow: hidden;
}
.mc-xp-bar-wrap::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,215,0,0.2), transparent);
}
.mc-xp-level {
    font-size: 1.4rem;
    font-weight: 800;
    color: var(--mc-gold);
    text-shadow: 0 0 12px rgba(255,215,0,0.4);
    min-width: 40px;
    text-align: center;
}
.mc-xp-track {
    flex: 1;
    height: 8px;
    background: var(--mc-bg-void);
    border-radius: 4px;
    overflow: hidden;
    position: relative;
}
.mc-xp-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--mc-cyan), var(--mc-magenta));
    border-radius: 4px;
    transition: width 0.6s ease;
    box-shadow: 0 0 10px rgba(0,240,255,0.3);
    position: relative;
}
.mc-xp-fill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
    animation: mc-xp-shimmer 2s infinite;
}
@keyframes mc-xp-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}
.mc-xp-info {
    font-size: 0.72rem;
    color: var(--mc-text-muted);
    white-space: nowrap;
    min-width: 80px;
    text-align: right;
}
.mc-xp-info strong { color: var(--mc-cyan); }

/* XP Float Notification */
.mc-xp-float {
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--mc-gold);
    text-shadow: 0 0 20px var(--mc-gold);
    pointer-events: none;
    z-index: 99999;
    animation: mc-xp-float 2s ease-out forwards;
}
.mc-xp-reason { font-size: 0.7rem; color: var(--mc-text-muted); display: block; text-align: center; }

/* ═══ Self-Reflection Quick Bar ═══ */
.mc-reflect-bar {
    display: flex; gap: 8px; margin-bottom: 12px;
}
.mc-reflect-btn {
    flex: 1; display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: var(--mc-radius);
    background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border);
    cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.mc-reflect-btn:hover { border-color: var(--mc-border-hover); background: var(--mc-bg-elevated); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
.mc-reflect-btn-icon { font-size: 1rem; }
.mc-reflect-btn-label { font-size: 0.78rem; color: var(--mc-text-secondary); font-weight: 600; }
.mc-reflect-btn-bulletin {
    background: linear-gradient(135deg, rgba(255,193,7,0.06), rgba(255,152,0,0.06));
    border-color: rgba(255,193,7,0.15);
}
.mc-reflect-btn-bulletin:hover { border-color: rgba(255,193,7,0.35); }
.mc-reflect-btn-brain {
    background: linear-gradient(135deg, rgba(0,240,255,0.06), rgba(156,39,176,0.06));
    border-color: rgba(0,240,255,0.15);
}
.mc-reflect-btn-brain:hover { border-color: rgba(0,240,255,0.35); }
.mc-reflect-btn-tools {
    background: linear-gradient(135deg, rgba(255,152,0,0.08), rgba(255,87,34,0.08));
    border-color: rgba(255,152,0,0.2);
}
.mc-reflect-btn-tools:hover { border-color: rgba(255,152,0,0.4); }
.mc-badge {
    font-size: 0.6rem; font-weight: 700; padding: 1px 7px; border-radius: 8px;
    background: var(--mc-magenta-bg); color: var(--mc-magenta);
}
.mc-glow-amber { animation: mc-neon-amber 2s infinite; }
@keyframes mc-neon-amber {
    0%, 100% { box-shadow: 0 0 8px rgba(255,193,7,0.3); }
    50% { box-shadow: 0 0 20px rgba(255,193,7,0.5), 0 0 40px rgba(255,193,7,0.2); }
}
.mc-glow-cyan { animation: mc-neon-breathe 2s infinite; }

/* ═══ Stats Row ═══ */
.mc-stats-row { display: flex; gap: 12px; margin-bottom: 6px; }
.mc-stat-card {
    flex: 1; background: rgba(17,17,24,0.7); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); padding: 16px 18px; border-top: 3px solid var(--mc-border-active);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.mc-stat-card::before {
    content: ''; position: absolute; inset: 0; opacity: 0;
    transition: opacity var(--mc-transition);
    pointer-events: none;
}
.mc-stat-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1); transform: translateY(-2px); }
.mc-stat-card:hover::before { opacity: 1; }
.mc-border-red { border-top-color: var(--mc-red); }
.mc-border-red::before { background: linear-gradient(180deg, rgba(255,51,85,0.05) 0%, transparent 60%); }
.mc-border-green { border-top-color: var(--mc-green); }
.mc-border-green::before { background: linear-gradient(180deg, rgba(0,255,136,0.05) 0%, transparent 60%); }
.mc-border-yellow { border-top-color: var(--mc-orange); }
.mc-border-yellow::before { background: linear-gradient(180deg, rgba(255,152,0,0.05) 0%, transparent 60%); }
.mc-border-purple { border-top-color: var(--mc-purple); }
.mc-border-purple::before { background: linear-gradient(180deg, rgba(179,102,255,0.05) 0%, transparent 60%); }
.mc-border-blue { border-top-color: var(--mc-cyan); }
.mc-border-blue::before { background: linear-gradient(180deg, rgba(0,240,255,0.05) 0%, transparent 60%); }

.mc-stat-top { display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
.mc-stat-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mc-text-muted); font-weight: 600; }
.mc-stat-icon { font-size: 1.1rem; opacity: 0.5; }
.mc-stat-num { font-size: 2.2rem; font-weight: 800; color: #fff; margin-top: 6px; line-height: 1; position: relative; z-index: 1; }

/* Accent Divider */
.mc-accent-divider {
    height: 3px;
    margin: 14px 0 18px;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--mc-cyan), var(--mc-magenta), var(--mc-gold), var(--mc-green), var(--mc-cyan));
    background-size: 300% 100%;
    animation: mc-accent-shift 8s linear infinite;
    opacity: 0.7;
    box-shadow: 0 0 10px rgba(0,240,255,0.15), 0 0 20px rgba(255,0,200,0.1);
}
@keyframes mc-accent-shift {
    0% { background-position: 0% 50%; }
    100% { background-position: 300% 50%; }
}

/* ═══ AI Impact ═══ */
.mc-impact-section {
    background: rgba(17,17,24,0.65); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); padding: 16px 20px; margin-bottom: 16px;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    position: relative; overflow: hidden;
}
.mc-impact-section::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,0,170,0.2), transparent);
}
.mc-impact-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.mc-impact-icon { font-size: 1rem; }
.mc-impact-title { font-weight: 600; font-size: 0.95rem; color: #ccc; }
.mc-impact-badge {
    background: var(--mc-magenta-bg); color: var(--mc-magenta);
    font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 12px; margin-left: 8px;
}
.mc-impact-stats { display: flex; gap: 0; }
.mc-impact-stat { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 8px; border-right: 1px solid var(--mc-border); }
.mc-impact-stat:last-child { border-right: none; }
.mc-impact-stat-icon { font-size: 1rem; margin-bottom: 4px; }
.mc-impact-num { font-size: 1.6rem; font-weight: 800; color: #fff; line-height: 1; }
.mc-impact-label { font-size: 0.68rem; color: var(--mc-text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.04em; }

/* ═══ Charts Row ═══ */
.mc-charts-row { display: flex; gap: 12px; margin-bottom: 16px; }
.mc-chart-card {
    flex: 1; background: rgba(17,17,24,0.65); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); padding: 20px; display: flex; flex-direction: column; align-items: center;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.mc-chart-card:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
.mc-chart-title { margin: 0 0 12px; font-size: 0.9rem; font-weight: 600; color: #ccc; align-self: flex-start; }
.mc-donut-wrap { width: 160px; height: 160px; }
.mc-donut { width: 100%; height: 100%; transform: rotate(-90deg); }
.mc-donut-bg { fill: none; stroke: var(--mc-border); stroke-width: 10; }
.mc-donut-ring { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
.mc-donut-red { stroke: var(--mc-cyan); }
.mc-donut-seg-low { stroke: var(--mc-green); }
.mc-donut-seg-med { stroke: var(--mc-orange); }
.mc-donut-seg-high { stroke: var(--mc-red); }
.mc-donut-text { font-size: 1.6rem; font-weight: 800; fill: #fff; text-anchor: middle; dominant-baseline: middle; transform: rotate(90deg); transform-origin: 60px 60px; }
.mc-donut-sub { font-size: 0.6rem; fill: var(--mc-text-muted); text-anchor: middle; dominant-baseline: middle; transform: rotate(90deg); transform-origin: 60px 60px; text-transform: uppercase; letter-spacing: 0.05em; }
.mc-legend { display: flex; gap: 14px; margin-top: 12px; }
.mc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; color: var(--mc-text-secondary); }
.mc-leg-dot { width: 8px; height: 8px; border-radius: 50%; }

/* Side Stack */
.mc-side-stack { flex: 1; display: flex; flex-direction: column; gap: 12px; max-width: 340px; }
.mc-side-card { background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 14px 16px; display: flex; flex-direction: column; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: border-color 0.2s; }
.mc-side-card:hover { border-color: rgba(255,255,255,0.08); }
.mc-side-card-log { flex: 1; min-height: 160px; }
.mc-side-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.mc-side-icon { font-size: 1rem; }
.mc-side-count { font-size: 1.4rem; font-weight: 800; color: var(--mc-cyan); }
.mc-side-label { font-size: 0.82rem; color: var(--mc-text-secondary); }

/* Agent rows */
.mc-agents-list { display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; }
.mc-agent-row { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: var(--mc-radius-sm); background: var(--mc-bg-primary); font-size: 0.78rem; }
.mc-astat-running { border-left: 2px solid var(--mc-green); }
.mc-astat-pending { border-left: 2px solid var(--mc-orange); }
.mc-astat-done { border-left: 2px solid #555; opacity: 0.6; }
.mc-astat-failed { border-left: 2px solid var(--mc-red); }
.mc-agent-name { font-weight: 600; color: #ddd; }
.mc-agent-mission { flex: 1; color: var(--mc-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-agent-elapsed { color: var(--mc-text-dim); font-size: 0.72rem; }

/* AI Log */
.mc-activity-feed { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow-y: auto; }
.mc-log-entry { display: flex; align-items: center; gap: 6px; padding: 5px 8px; font-size: 0.75rem; border-bottom: 1px solid var(--mc-border); transition: background 0.4s; }
.mc-log-new { background: rgba(0,240,255,0.05); }
.mc-log-icon { flex-shrink: 0; }
.mc-log-text { flex: 1; color: #bbb; }
.mc-log-time { color: #555; font-size: 0.68rem; white-space: nowrap; }
.mc-empty-sm { color: #555; font-size: 0.78rem; text-align: center; padding: 12px; }

/* ═══ Mind Buttons & Drawer ═══ */
.mc-stat-mind { position: relative; }
.mc-mind-btns { display: flex; gap: 4px; margin-top: 8px; justify-content: center; }
.mc-mind-btn {
    background: var(--mc-bg-primary); border: 1px solid var(--mc-border); border-radius: 5px;
    padding: 4px 8px; font-size: 0.82rem; cursor: pointer; transition: all var(--mc-transition);
    line-height: 1; opacity: 0.5;
}
.mc-mind-btn:hover { opacity: 0.9; border-color: var(--mc-border-active); background: var(--mc-bg-elevated); }
.mc-mind-btn-active { opacity: 1; border-color: var(--mc-purple); background: var(--mc-bg-surface); box-shadow: 0 0 8px rgba(179,102,255,0.15); }

/* Mind Scope Dropdown */
.mc-mind-scope-anchor { position: relative; display: inline-block; }
.mc-mind-scope-dropdown {
    position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
    background: var(--mc-bg-tertiary); border: 1px solid var(--mc-border); border-radius: 8px;
    min-width: 160px; max-height: 240px; overflow-y: auto; z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6); padding: 4px;
}
.mc-mind-scope-dropdown::-webkit-scrollbar { width: 4px; }
.mc-mind-scope-dropdown::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
.mc-mind-scope-item {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 7px 10px; border-radius: 5px; cursor: pointer; font-size: 0.75rem;
    color: var(--mc-text-secondary); transition: background 0.15s; white-space: nowrap;
}
.mc-mind-scope-item:hover { background: var(--mc-bg-surface); color: #ccc; }
.mc-mind-scope-active { background: var(--mc-bg-surface); color: var(--mc-purple); font-weight: 600; }
.mc-mind-scope-count { font-size: 0.65rem; color: var(--mc-text-muted); background: var(--mc-bg-primary); padding: 1px 6px; border-radius: 8px; }
.mc-mind-scope-loading { color: #555; font-style: italic; justify-content: center; }
.mc-mind-scope-divider { height: 1px; background: var(--mc-border); margin: 4px 6px; }
.mc-mind-scope-add { color: var(--mc-green) !important; font-weight: 500; }
.mc-mind-scope-add:hover { background: rgba(0,255,136,0.08) !important; }

/* Mind Drawer */
.mc-mind-drawer {
    background: var(--mc-bg-tertiary); border: 1px solid var(--mc-border); border-radius: var(--mc-radius);
    padding: 12px 16px; margin-bottom: 6px; animation: mc-drawer-slide 0.2s ease-out;
}
.mc-mind-drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.mc-mind-drawer-title { font-size: 0.85rem; font-weight: 600; color: #ccc; }
.mc-mind-drawer-close { background: none; border: none; color: var(--mc-text-muted); cursor: pointer; font-size: 0.85rem; padding: 2px 6px; border-radius: 4px; transition: color 0.15s; }
.mc-mind-drawer-close:hover { color: var(--mc-red); }
.mc-mind-body { max-height: 350px; overflow-y: auto; }
.mc-mind-body::-webkit-scrollbar { width: 5px; }
.mc-mind-body::-webkit-scrollbar-track { background: transparent; }
.mc-mind-body::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
.mc-mind-content { min-height: 60px; }
.mc-mind-loading { color: var(--mc-text-muted); font-size: 0.8rem; text-align: center; padding: 20px; }
.mc-mind-empty { color: #555; font-size: 0.82rem; text-align: center; padding: 24px 12px; }
.mc-mind-summary { font-size: 0.7rem; color: var(--mc-text-muted); margin-bottom: 8px; padding: 0 2px; text-transform: uppercase; letter-spacing: 0.05em; }
.mc-mind-group { border: 1px solid var(--mc-border); border-radius: var(--mc-radius-sm); margin-bottom: 4px; overflow: hidden; }
.mc-mind-group-header {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer;
    background: var(--mc-bg-secondary); transition: background var(--mc-transition); user-select: none;
}
.mc-mind-group-header:hover { background: var(--mc-bg-elevated); }
.mc-mind-arrow { font-size: 0.55rem; color: var(--mc-text-muted); transition: transform 0.2s; display: inline-block; }
.mc-mind-expanded > .mc-mind-group-header .mc-mind-arrow { transform: rotate(90deg); }
.mc-mind-group-name { flex: 1; font-size: 0.82rem; font-weight: 600; color: #ccc; }
.mc-mind-group-count { background: var(--mc-bg-surface); color: var(--mc-text-muted); font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; min-width: 18px; text-align: center; }
.mc-mind-group-items { display: none; padding: 4px 8px 8px; }
.mc-mind-expanded > .mc-mind-group-items { display: block; }
.mc-mind-memory-item { padding: 8px 10px; margin: 3px 0; background: var(--mc-bg-primary); border-radius: 5px; border-left: 2px solid var(--mc-border); font-size: 0.78rem; line-height: 1.4; }
.mc-mind-memory-text { color: #bbb; word-break: break-word; }
.mc-mind-memory-time { color: #555; font-size: 0.65rem; margin-top: 4px; }
.mc-mind-more { color: var(--mc-text-muted); font-size: 0.72rem; text-align: center; padding: 6px; font-style: italic; }
.mc-mind-people-grid { display: flex; flex-direction: column; gap: 4px; }
.mc-mind-person-card { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--mc-bg-secondary); border-radius: var(--mc-radius-sm); border: 1px solid var(--mc-border); }
.mc-mind-person-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--mc-bg-surface); color: var(--mc-cyan); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
.mc-mind-person-info { flex: 1; min-width: 0; }
.mc-mind-person-name { font-size: 0.82rem; font-weight: 600; color: #ccc; }
.mc-mind-person-rel { font-size: 0.65rem; color: var(--mc-text-muted); background: var(--mc-bg-surface); padding: 1px 6px; border-radius: 8px; margin-left: 6px; font-weight: 400; }
.mc-mind-person-details { font-size: 0.7rem; color: var(--mc-text-muted); margin-top: 2px; }
.mc-mind-person-notes { font-size: 0.72rem; color: var(--mc-text-muted); margin-top: 4px; line-height: 1.3; }
.mc-mind-kb-desc { font-size: 0.75rem; color: var(--mc-text-muted); padding: 4px 0 8px; line-height: 1.3; }
.mc-mind-load-entries { background: var(--mc-bg-surface); color: var(--mc-text-muted); border: 1px solid var(--mc-border); border-radius: 5px; padding: 4px 14px; font-size: 0.72rem; cursor: pointer; font-family: inherit; transition: all var(--mc-transition); }
.mc-mind-load-entries:hover { color: #ccc; border-color: var(--mc-border-active); }

/* ═══ Goals Board ═══ */
.mc-board-section { background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 16px 20px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.mc-board-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.mc-section-title { margin: 0; font-size: 1rem; font-weight: 600; color: #ccc; }
.mc-board { display: flex; gap: 12px; }
.mc-column { flex: 1; min-width: 180px; }
.mc-column-head { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; font-weight: 600; color: var(--mc-text-secondary); padding: 8px 10px; background: var(--mc-bg-primary); border-radius: 8px 8px 0 0; border: 1px solid var(--mc-border); border-bottom: none; }
.mc-col-dot { width: 8px; height: 8px; border-radius: 50%; }
.mc-col-count { margin-left: auto; font-size: 0.72rem; color: var(--mc-text-muted); background: var(--mc-border); padding: 1px 8px; border-radius: 8px; }
.mc-clear-all-btn { background: none; border: 1px solid var(--mc-border-active); color: var(--mc-text-muted); font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; cursor: pointer; transition: all var(--mc-transition); }
.mc-clear-all-btn:hover { background: rgba(255,51,85,0.1); border-color: var(--mc-red); color: var(--mc-red); }
.mc-clear-col-btn { background: none; border: none; color: var(--mc-text-muted); font-size: 0.7rem; cursor: pointer; margin-left: 4px; padding: 0 2px; opacity: 0.5; transition: opacity 0.15s; }
.mc-clear-col-btn:hover { opacity: 1; color: var(--mc-red); }
.mc-checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.85rem; }
.mc-checkbox-label input[type="checkbox"] { width: 16px; height: 16px; accent-color: #9c27b0; cursor: pointer; }
.mc-act-perm.mc-perm-active { color: #9c27b0 !important; opacity: 1 !important; }
.mc-card.mc-dragging { opacity: 0.4; transform: scale(0.95); }
.mc-column-cards.mc-drop-target { background: rgba(0,240,255,0.05); border-color: var(--mc-accent); box-shadow: inset 0 0 12px rgba(0,240,255,0.08); }
.mc-column-cards { background: var(--mc-bg-primary); border: 1px solid var(--mc-border); border-radius: 0 0 8px 8px; padding: 8px; min-height: 80px; max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.mc-empty-col { color: var(--mc-text-dim); font-size: 0.78rem; text-align: center; padding: 20px; }

/* Cards */
.mc-card {
    background: rgba(17,17,24,0.65); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius-sm);
    padding: 10px 12px; cursor: grab; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    border-left: 3px solid var(--mc-border-active);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
.mc-card:hover { border-color: var(--mc-border-hover); box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.08); transform: translateY(-1px); }
.mc-card.mc-dragging { opacity: 0.3; }
.mc-drop-hover { background: rgba(0,240,255,0.05) !important; border-color: var(--mc-cyan) !important; }
.mc-card-high { border-left-color: var(--mc-red); }
.mc-card-medium { border-left-color: var(--mc-orange); }
.mc-card-low { border-left-color: var(--mc-green); }
.mc-card-top { display: flex; align-items: center; gap: 6px; }
.mc-card-title { font-weight: 600; font-size: 0.82rem; color: #eee; }
.mc-card-desc { font-size: 0.75rem; color: #777; margin-top: 4px; line-height: 1.3; }
.mc-card-sub { font-size: 0.7rem; color: var(--mc-text-muted); margin-top: 5px; }
.mc-card-progress { font-size: 0.7rem; color: var(--mc-text-muted); margin-top: 4px; font-style: italic; border-left: 2px solid var(--mc-border-active); padding-left: 6px; }
.mc-card-timestamp { font-size: 0.65rem; color: #555; margin-top: 4px; }
.mc-card-actions { display: flex; gap: 4px; margin-top: 8px; justify-content: flex-end; }
.mc-card-btn { background: none; border: none; cursor: pointer; font-size: 0.75rem; padding: 2px 4px; border-radius: 4px; opacity: 0.4; transition: opacity 0.15s; }
.mc-card-btn:hover { opacity: 1; }
.mc-act-deploy { opacity: 0.7; }
.mc-act-deploy:hover { opacity: 1; filter: drop-shadow(0 0 4px var(--mc-cyan)); }
.mc-perm { font-size: 0.65rem; vertical-align: middle; }

/* ═══ Buttons ═══ */
.mc-btn {
    padding: 7px 16px; border-radius: var(--mc-radius-sm); border: 1px solid var(--mc-border-active);
    background: var(--mc-bg-surface); color: #ccc; cursor: pointer; font-size: 0.82rem;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative; overflow: hidden; font-family: inherit;
}
.mc-btn::after {
    content: ''; position: absolute; width: 100%; height: 100%;
    top: 0; left: 0; pointer-events: none;
    background: radial-gradient(circle, rgba(255,255,255,0.15) 10%, transparent 10.01%);
    transform: scale(10); opacity: 0; transition: transform 0.4s, opacity 0.5s;
}
.mc-btn:active::after { transform: scale(0); opacity: 0.3; transition: 0s; }
.mc-btn:hover { background: var(--mc-bg-elevated); border-color: var(--mc-border-hover); }
.mc-btn-accent {
    background: linear-gradient(135deg, #5b4fcf, #7c6fe0);
    color: #fff; border-color: rgba(124,111,224,0.5); font-weight: 600;
}
.mc-btn-accent:hover { box-shadow: 0 0 16px rgba(124,111,224,0.35), 0 0 32px rgba(124,111,224,0.12); transform: translateY(-1px); background: linear-gradient(135deg, #6a5fd8, #8b7ee8); }
.mc-btn-accent:active { transform: translateY(0); }
.mc-btn-danger { background: var(--mc-red); color: #fff; border-color: var(--mc-red); }
.mc-btn-danger:hover { box-shadow: 0 0 16px rgba(255,0,170,0.4), 0 0 32px rgba(255,0,170,0.15); transform: translateY(-1px); }
.mc-btn-danger:active { transform: translateY(0); }
.mc-btn-sm { font-size: 0.78rem; padding: 4px 10px; min-width: auto; }

/* ═══ Modals ═══ */
.mc-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
    backdrop-filter: blur(4px);
}
.mc-modal {
    background: rgba(17,17,24,0.92); border: 1px solid rgba(255,255,255,0.08);
    border-radius: var(--mc-radius-lg); width: 440px; max-width: 92vw;
    box-shadow: 0 16px 64px rgba(0,0,0,0.7), 0 0 48px rgba(0,240,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04);
    animation: mc-overlay-in 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(20px) saturate(1.5); -webkit-backdrop-filter: blur(20px) saturate(1.5);
}
.mc-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--mc-border); }
.mc-modal-header h3 { margin: 0; font-size: 1rem; color: #fff; }
.mc-modal-close { background: none; border: none; color: var(--mc-text-muted); cursor: pointer; font-size: 1.1rem; transition: color 0.15s; }
.mc-modal-close:hover { color: #fff; }
.mc-modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.mc-modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--mc-border); }
.mc-perm-check { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #bbb; cursor: pointer; padding: 4px 0; }
.mc-perm-check input[type="checkbox"] { accent-color: var(--mc-purple); width: 16px; height: 16px; cursor: pointer; }
.mc-perm-hint { color: #555; font-size: 0.7rem; }

/* ═══ Form Inputs ═══ */
.mc-label { font-size: 0.78rem; color: var(--mc-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.mc-input {
    width: 100%; padding: 9px 12px; background: var(--mc-bg-primary); border: 1px solid var(--mc-border-hover);
    border-radius: var(--mc-radius-sm); color: var(--mc-text-primary); font-size: 0.85rem; box-sizing: border-box;
    transition: border-color var(--mc-transition), box-shadow var(--mc-transition);
}
.mc-input:focus { border-color: var(--mc-cyan); outline: none; box-shadow: 0 0 0 2px rgba(0,240,255,0.15); }
.mc-input::placeholder { color: var(--mc-text-dim); }
.mc-textarea { resize: vertical; min-height: 60px; font-family: inherit; }
.mc-textarea-lg { min-height: 120px; }
select.mc-input { cursor: pointer; }

/* ═══ User Goals Board ═══ */
.mc-user-goals { display: flex; flex-direction: column; gap: 8px; }
.mc-user-goals .mc-card { animation: mc-card-enter 0.3s ease-out both; }
.mc-completed-section { margin-top: 16px; }
.mc-completed-toggle { cursor: pointer; font-size: 0.85rem; color: #888; padding: 8px 0; user-select: none; }
.mc-completed-toggle:hover { color: #bbb; }
.mc-completed-toggle .mc-col-count { margin-left: 6px; }
.mc-completed-goals { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.mc-completed-goals .mc-card { opacity: 0.6; }
.mc-completed-goals .mc-card:hover { opacity: 0.85; }
.mc-goal-brief { margin-top: 6px; }
.mc-goal-brief-toggle { font-size: 0.72rem; color: var(--mc-cyan); cursor: pointer; user-select: none; }
.mc-goal-brief-toggle:hover { color: #fff; }
.mc-goal-brief-content { font-size: 0.75rem; color: #999; margin-top: 4px; line-height: 1.4; white-space: pre-wrap; padding: 6px 8px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 2px solid var(--mc-cyan); }

/* ═══ Schedule ═══ */
.mc-scheduled { color: var(--mc-cyan) !important; text-shadow: 0 0 8px rgba(0,240,255,0.6); filter: drop-shadow(0 0 4px rgba(0,240,255,0.5)); }
.mc-countdown { font-size: 0.65rem; color: var(--mc-cyan); background: var(--mc-cyan-bg); padding: 2px 6px; border-radius: 8px; white-space: nowrap; margin-left: 2px; }
.mc-sched-goal-name { font-size: 0.95rem; font-weight: 600; color: var(--mc-cyan); padding: 6px 10px; background: var(--mc-cyan-bg); border-radius: var(--mc-radius-sm); margin-bottom: 4px; }
.mc-sched-row { margin-top: 2px; }
.mc-sched-preview { margin-top: 8px; padding: 8px 12px; background: var(--mc-bg-secondary); border: 1px solid var(--mc-border); border-radius: 8px; font-size: 0.8rem; color: var(--mc-cyan); }
.mc-day-picker { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.mc-day-btn { background: var(--mc-bg-surface); border: 1px solid var(--mc-border-hover); color: var(--mc-text-muted); padding: 6px 10px; border-radius: var(--mc-radius-sm); font-size: 0.75rem; cursor: pointer; transition: all var(--mc-transition); font-weight: 600; }
.mc-day-btn:hover { border-color: var(--mc-cyan); color: #ccc; }
.mc-day-btn.mc-day-active { background: var(--mc-cyan); color: var(--mc-bg-primary); border-color: var(--mc-cyan); }

/* ═══ Notes ═══ */
.mc-notes-section { background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 16px 20px; margin-top: 16px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.mc-notes-actions { display: flex; gap: 8px; align-items: center; }
.mc-notes-search { width: 180px; padding: 5px 10px; font-size: 0.78rem; background: var(--mc-bg-secondary); border: 1px solid var(--mc-border-hover); color: #ccc; border-radius: var(--mc-radius-sm); }
.mc-notes-search:focus { border-color: var(--mc-cyan); outline: none; }
.mc-notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.mc-note-card { background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-radius: 8px; padding: 12px 14px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.mc-note-card:hover { border-color: rgba(0,240,255,0.15); box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 12px rgba(0,240,255,0.05); transform: translateY(-2px); }
.mc-note-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.mc-note-title { font-weight: 600; color: var(--mc-text-primary); font-size: 0.88rem; line-height: 1.3; }
.mc-note-stamp { font-size: 0.7rem; color: var(--mc-text-muted); margin: 4px 0 8px; }
.mc-note-body { font-size: 0.8rem; color: #999; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow-y: auto; }
.mc-note-body::-webkit-scrollbar { width: 4px; }
.mc-note-body::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }

/* ═══ Calendar ═══ */
.mc-calendar-section { background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 16px 20px; margin-top: 16px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.mc-week-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.mc-week-grid > * { flex: 1 1 110px; max-width: calc(14.28% - 7px); }
.mc-cal-day { background: var(--mc-bg-secondary); border: 1px solid var(--mc-border); border-radius: 8px; padding: 8px; min-height: 80px; min-width: 0; overflow: hidden; }
.mc-cal-today { border-color: var(--mc-cyan); box-shadow: 0 0 10px rgba(0,240,255,0.1); }
.mc-cal-day-label { font-size: 0.7rem; font-weight: 700; color: var(--mc-text-muted); text-transform: uppercase; text-align: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid var(--mc-border); }
.mc-cal-today .mc-cal-day-label { color: var(--mc-cyan); }
.mc-cal-task { background: var(--mc-bg-surface); border-radius: 5px; padding: 4px 6px; margin-bottom: 4px; }
.mc-cal-task-name { font-size: 0.65rem; color: #ccc; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-cal-task-time { font-size: 0.6rem; color: var(--mc-text-muted); }
.mc-cal-empty { font-size: 0.65rem; color: #333; text-align: center; padding: 8px 0; }

.mc-next-up { background: var(--mc-bg-secondary); border: 1px solid var(--mc-border); border-radius: 8px; padding: 10px 14px; }
.mc-next-up-header { font-size: 0.8rem; font-weight: 700; color: var(--mc-text-muted); margin-bottom: 8px; }
.mc-next-item { display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--mc-bg-tertiary); }
.mc-next-item:last-child { border-bottom: none; }
.mc-next-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-right: 10px; }
.mc-next-name { flex: 1; font-size: 0.78rem; color: var(--mc-cyan); font-weight: 600; }
.mc-next-time { font-size: 0.72rem; color: var(--mc-text-muted); margin-left: 10px; }

/* ── Split Panel: Today's Tasks + Next Up ── */
.mc-cal-split {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;
}
@media (max-width: 900px) {
    .mc-cal-split { grid-template-columns: 1fr; }
}
.mc-cal-tasks-panel, .mc-cal-nextup-panel {
    background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); padding: 0;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    display: flex; flex-direction: column; min-height: 0;
    max-height: 480px; overflow: hidden;
}
.mc-cal-nextup-panel {
    gap: 12px; padding: 16px;
}
.mc-cal-nextup-panel .mc-calendar-section {
    margin-top: 0; padding: 0; background: none; border: none;
    backdrop-filter: none; -webkit-backdrop-filter: none;
}
.mc-cal-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--mc-border);
    font-size: 0.85rem; font-weight: 700; color: var(--mc-text-primary);
    flex-shrink: 0;
}
.mc-cal-tasks-date { font-size: 0.75rem; font-weight: 400; color: var(--mc-text-muted); }
.mc-cal-tasks-list { flex: 1; overflow-y: auto; padding: 8px 12px; }

/* ── Today Task Items ── */
.mc-today-task {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 12px; border-radius: 8px; margin-bottom: 4px;
    background: var(--mc-bg-secondary); cursor: pointer;
    transition: all 0.15s; position: relative;
}
.mc-today-task:hover { background: var(--mc-bg-surface); }
.mc-today-task-done { opacity: 0.45; }
.mc-today-task-done .mc-today-task-title { text-decoration: line-through; }
.mc-today-task-check {
    font-size: 1.1rem; cursor: pointer; flex-shrink: 0;
    padding: 4px; border-radius: 4px; transition: all 0.15s;
    line-height: 1;
}
.mc-today-task-check[data-today-toggle]:hover {
    transform: scale(1.15); background: rgba(0,255,136,0.1);
}
.mc-today-task-check[data-today-done="1"]:hover {
    background: rgba(255,0,170,0.1);
}
.mc-today-task-body { flex: 1; min-width: 0; }
.mc-today-task-top {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.85rem; color: var(--mc-text-primary);
}
.mc-today-task-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.mc-today-task-time {
    font-size: 0.72rem; color: var(--mc-text-secondary);
    white-space: nowrap; margin-left: auto; flex-shrink: 0;
}
.mc-today-task-desc {
    font-size: 0.74rem; color: var(--mc-text-muted);
    margin-top: 3px; line-height: 1.35;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mc-today-task-del {
    background: none; border: none; color: var(--mc-text-dim);
    cursor: pointer; font-size: 0.7rem; padding: 4px;
    opacity: 0; transition: all 0.15s; flex-shrink: 0; align-self: center;
}
.mc-today-task:hover .mc-today-task-del { opacity: 0.5; }
.mc-today-task-del:hover { opacity: 1 !important; color: var(--mc-magenta); }

/* Full Calendar */
.mc-fullcal-section { background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 16px 20px; margin-top: 16px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.mc-fullcal-controls { display: flex; align-items: center; gap: 8px; }
.mc-fullcal-title { font-size: 1rem; font-weight: 700; color: var(--mc-text-primary); min-width: 160px; text-align: center; }
.mc-cal-today-btn { margin-left: 4px; font-size: 0.72rem !important; padding: 4px 10px !important; }
.mc-fullcal-header-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 2px; }
.mc-fullcal-day-header { font-size: 0.7rem; font-weight: 700; color: var(--mc-text-muted); text-transform: uppercase; text-align: center; padding: 6px 0; border-bottom: 1px solid var(--mc-border); }
.mc-fullcal-body { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.mc-fullcal-cell { background: rgba(13,13,20,0.5); border: 1px solid var(--mc-border); border-radius: var(--mc-radius-sm); min-height: 90px; padding: 4px 5px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; }
.mc-fullcal-cell:hover { border-color: rgba(0,240,255,0.2); background: rgba(0,240,255,0.03); box-shadow: inset 0 0 20px rgba(0,240,255,0.03); }
.mc-fullcal-empty { background: transparent; border-color: transparent; cursor: default; min-height: 90px; }
.mc-fullcal-empty:hover { border-color: transparent; background: transparent; }
.mc-fullcal-today { border-color: var(--mc-cyan) !important; box-shadow: 0 0 12px rgba(0,240,255,0.1); }
.mc-fullcal-date { font-size: 0.72rem; font-weight: 600; color: #555; margin-bottom: 3px; padding: 1px 4px; }
.mc-fullcal-date-today { color: #fff; background: var(--mc-cyan); border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 0.68rem; box-shadow: var(--mc-cyan-glow); }
.mc-fullcal-event { border-radius: 4px; padding: 2px 4px; margin-bottom: 2px; display: flex; align-items: center; gap: 3px; cursor: pointer; transition: all 0.15s; overflow: hidden; }
.mc-fullcal-event:hover { opacity: 0.8; }
.mc-fullcal-draggable { cursor: grab; }
.mc-fullcal-draggable:active { cursor: grabbing; }
.mc-fullcal-dragging { opacity: 0.3; transform: scale(0.95); }
.mc-fullcal-drop-target { background: rgba(0,240,255,0.08) !important; box-shadow: inset 0 0 12px rgba(0,240,255,0.15); border-color: var(--mc-cyan) !important; }
.mc-fullcal-event-icon { font-size: 0.6rem; flex-shrink: 0; }
.mc-fullcal-event-title { font-size: 0.6rem; color: #ccc; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-fullcal-event-bell { font-size: 0.5rem; flex-shrink: 0; opacity: 0.7; }
.mc-fullcal-more { font-size: 0.58rem; color: var(--mc-cyan); padding: 1px 4px; cursor: pointer; font-weight: 600; }
/* ═══ Day Detail Popup ═══ */
.mc-day-detail-popup { position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
.mc-day-detail-inner { background: rgba(10,10,15,0.95); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--mc-radius-lg); width: 90%; max-width: 520px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 60px rgba(0,240,255,0.06); backdrop-filter: blur(24px); }
.mc-day-detail-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--mc-border); flex-shrink: 0; }
.mc-day-detail-header h3 { margin: 0; font-size: 1rem; color: var(--mc-text-primary); flex: 1; }
.mc-day-detail-list { padding: 12px 16px; overflow-y: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
.mc-day-detail-event { padding: 10px 14px; background: var(--mc-bg-secondary); border-radius: var(--mc-radius-sm); transition: all 0.15s; }
.mc-day-detail-event:hover { background: var(--mc-bg-surface); }
.mc-day-detail-hl { background: var(--mc-bg-surface); box-shadow: 0 0 8px rgba(0,240,255,0.1); }
.mc-day-detail-event-top { display: flex; align-items: center; gap: 6px; font-size: 0.88rem; color: var(--mc-text-primary); }
.mc-day-detail-source { font-size: 0.65rem; color: var(--mc-text-muted); background: rgba(255,255,255,0.05); padding: 1px 6px; border-radius: 4px; margin-left: auto; }
.mc-day-detail-desc { font-size: 0.78rem; color: var(--mc-text-secondary); margin-top: 4px; line-height: 1.4; }
.mc-day-detail-meta { font-size: 0.72rem; color: var(--mc-text-muted); margin-top: 4px; }
.mc-day-detail-edit { font-size: 0.68rem; color: var(--mc-cyan); margin-top: 4px; opacity: 0.7; }
.mc-day-detail-footer { padding: 12px 16px; border-top: 1px solid var(--mc-border); flex-shrink: 0; display: flex; justify-content: flex-end; }

/* ═══ Daily Planner Overlay ═══ */
.mc-planner-overlay {
    position: fixed; inset: 0; z-index: 9600;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
    animation: mc-guide-fade 0.2s ease;
}
.mc-planner-panel {
    background: var(--mc-bg-primary);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: var(--mc-radius-lg);
    width: 94%; max-width: 640px; max-height: 88vh;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,0.8), 0 0 80px rgba(0,240,255,0.04);
    overflow: hidden;
}
.mc-planner-header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 18px; border-bottom: 1px solid var(--mc-border);
    flex-shrink: 0; background: var(--mc-bg-secondary);
}
.mc-planner-header h2 {
    margin: 0; font-size: 1rem; font-weight: 600;
    color: var(--mc-text-primary); flex: 1; text-align: center;
}
.mc-planner-tabs {
    display: flex; gap: 0; border-bottom: 1px solid var(--mc-border);
    flex-shrink: 0; background: var(--mc-bg-secondary);
    padding: 0 12px;
}
.mc-planner-tabs .mc-overlay-tab { flex: 1; text-align: center; }
.mc-planner-body {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 0;
}
.mc-planner-tab-content { padding: 16px; }

/* ── Schedule Tab — Hourly Grid ── */
.mc-planner-hours { display: flex; flex-direction: column; }
.mc-planner-allday {
    display: flex; gap: 12px; padding: 10px 0;
    border-bottom: 1px solid var(--mc-border); align-items: flex-start;
}
.mc-planner-hour-row {
    display: flex; gap: 12px; padding: 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    min-height: 42px; align-items: flex-start;
    transition: background 0.15s;
}
.mc-planner-hour-row:hover { background: rgba(255,255,255,0.015); }
.mc-planner-hour-now {
    background: rgba(0,240,255,0.04);
    border-left: 2px solid var(--mc-cyan);
    padding-left: 10px;
}
.mc-planner-hour-now .mc-planner-hour-label { color: var(--mc-cyan); font-weight: 600; }
.mc-planner-hour-label {
    width: 72px; min-width: 72px; flex-shrink: 0;
    font-size: 0.75rem; color: var(--mc-text-muted);
    padding-top: 2px; text-align: right; padding-right: 8px;
}
.mc-planner-hour-events {
    flex: 1; display: flex; flex-direction: column; gap: 4px;
}

/* ── Event Chips ── */
.mc-planner-event {
    padding: 6px 10px; border-radius: 6px;
    font-size: 0.82rem; transition: all 0.15s;
    background: rgba(74,158,255,0.07);
}
.mc-planner-event:hover { filter: brightness(1.15); }
.mc-planner-event[data-planner-edit] { cursor: pointer; }
.mc-planner-evt-top {
    display: flex; align-items: center; gap: 6px;
    color: var(--mc-text-primary); font-size: 0.82rem;
}
.mc-planner-evt-top strong { font-weight: 600; }
.mc-planner-evt-time {
    font-size: 0.72rem; color: var(--mc-text-secondary);
    margin-left: auto; white-space: nowrap;
}
.mc-planner-evt-desc {
    font-size: 0.74rem; color: var(--mc-text-secondary);
    margin-top: 3px; line-height: 1.35;
}
.mc-planner-event-done { opacity: 0.5; }
.mc-planner-event-done strong { text-decoration: line-through; }
.mc-planner-evt-actions {
    display: flex; gap: 4px; margin-left: auto; flex-shrink: 0;
}
.mc-planner-evt-btn {
    background: none; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; font-size: 0.7rem; transition: all 0.15s;
    color: var(--mc-text-muted); opacity: 0;
}
.mc-planner-event:hover .mc-planner-evt-btn { opacity: 0.7; }
.mc-planner-evt-btn:hover { opacity: 1 !important; border-color: rgba(255,255,255,0.2); }
.mc-planner-evt-delete:hover { color: var(--mc-magenta); border-color: rgba(255,0,170,0.3); }
.mc-planner-evt-complete:hover { color: var(--mc-green); border-color: rgba(0,255,136,0.3); }
.mc-planner-evt-btn-done { opacity: 0.7 !important; color: var(--mc-green); }

/* ── Tasks Tab ── */
.mc-planner-section-title {
    font-size: 0.82rem; font-weight: 600;
    color: var(--mc-text-secondary); margin-bottom: 10px;
    letter-spacing: 0.02em;
}
.mc-planner-task {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 6px;
    font-size: 0.85rem; color: var(--mc-text-primary);
    cursor: pointer; transition: all 0.15s;
    border: 1px solid transparent;
}
.mc-planner-task:hover {
    background: rgba(255,255,255,0.03);
    border-color: rgba(255,255,255,0.06);
}
.mc-planner-task-done {
    opacity: 0.5;
}
.mc-planner-task-done .mc-planner-task-text {
    text-decoration: line-through;
}
.mc-planner-task-check {
    font-size: 1rem; flex-shrink: 0; width: 22px; text-align: center;
}
.mc-planner-task-text { flex: 1; }
.mc-planner-task .mc-card-btn {
    opacity: 0; transition: opacity 0.15s;
}
.mc-planner-task:hover .mc-card-btn { opacity: 0.6; }
.mc-planner-task:hover .mc-card-btn:hover { opacity: 1; }

/* ── Quick Add Row ── */
.mc-planner-quickadd {
    display: flex; gap: 8px; margin-bottom: 12px;
}
.mc-planner-quickadd .mc-input {
    flex: 1; font-size: 0.82rem; padding: 6px 10px;
}

/* ── Notes Tab ── */
.mc-planner-notes-area {
    width: 100%; min-height: 260px; resize: vertical;
    font-size: 0.88rem; line-height: 1.6;
    background: var(--mc-bg-secondary);
    border: 1px solid var(--mc-border);
    border-radius: 8px; padding: 14px;
    color: var(--mc-text-primary);
    font-family: 'Segoe UI', system-ui, sans-serif;
}
.mc-planner-notes-area:focus {
    outline: none; border-color: rgba(0,240,255,0.3);
    box-shadow: 0 0 12px rgba(0,240,255,0.08);
}
.mc-planner-notes-footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 10px; padding: 0 2px;
}
.mc-planner-notes-status {
    font-size: 0.72rem; color: var(--mc-text-muted);
}

/* ═══ Task Rollover Popup ═══ */
.mc-rollover-body { padding: 16px 20px; }
.mc-rollover-msg {
    font-size: 0.88rem; color: var(--mc-text-secondary);
    margin-bottom: 14px; line-height: 1.5;
}
.mc-rollover-msg strong { color: var(--mc-text-primary); }
.mc-rollover-list {
    max-height: 300px; overflow-y: auto;
    margin-bottom: 16px;
}
.mc-rollover-date-label {
    font-size: 0.72rem; font-weight: 700; color: var(--mc-text-muted);
    text-transform: uppercase; letter-spacing: 0.04em;
    padding: 8px 0 4px; margin-top: 4px;
}
.mc-rollover-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: 6px; margin-bottom: 3px;
    background: var(--mc-bg-secondary); cursor: pointer;
    font-size: 0.85rem; color: var(--mc-text-primary);
    transition: background 0.15s;
}
.mc-rollover-item:hover { background: var(--mc-bg-surface); }
.mc-rollover-check {
    width: 16px; height: 16px; accent-color: var(--mc-cyan);
    cursor: pointer; flex-shrink: 0;
}
.mc-rollover-actions {
    display: flex; justify-content: flex-end; gap: 10px;
    padding-top: 8px; border-top: 1px solid var(--mc-border);
}

.mc-event-modal-inner { max-width: 480px; }
.mc-event-row { display: flex; gap: 12px; margin-top: 4px; }
.mc-event-field { flex: 1; }
.mc-event-colors { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.mc-event-color-opt { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all 0.15s; }
.mc-event-color-opt:hover { transform: scale(1.15); }
.mc-event-color-opt.mc-event-color-sel { border-color: #fff; transform: scale(1.15); box-shadow: 0 0 12px rgba(255,255,255,0.3); }

/* ���─ Recurrence UI ── */
.mc-recurrence-options { margin-top: 8px; padding: 12px; border-radius: 8px; background: rgba(0,240,255,0.04); border: 1px solid rgba(0,240,255,0.1); }
.mc-recurrence-interval { display: flex; align-items: center; gap: 8px; }
.mc-recurrence-unit { color: var(--mc-text-secondary); font-size: 0.8rem; white-space: nowrap; }
.mc-recurrence-days { margin-top: 8px; }
.mc-day-picker { display: flex; gap: 4px; margin-top: 6px; }
.mc-day-btn {
    width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04); color: var(--mc-text-secondary); font-size: 0.7rem;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center;
}
.mc-day-btn:hover { border-color: var(--mc-cyan); color: var(--mc-cyan); }
.mc-day-btn.mc-day-selected {
    background: var(--mc-cyan); color: #000; border-color: var(--mc-cyan);
    box-shadow: 0 0 12px rgba(0,240,255,0.3); font-weight: 700;
}

/* ── Recurring Action Dialog ── */
.mc-recurring-dialog-inner { max-width: 400px; }
.mc-recurring-actions { display: flex; flex-direction: column; gap: 8px; }
.mc-recurring-actions .mc-btn { width: 100%; justify-content: center; }

/* ═══ Chat Panel (left side) ═══ */
.mc-chat-panel {
    width: 340px; min-width: 280px; max-width: 400px;
    display: flex; flex-direction: column; position: relative;
    background: var(--mc-bg-void); border-right: 1px solid var(--mc-border);
    flex-shrink: 0;
    transition: width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease, opacity 0.2s ease;
}
#mc-chat-mount { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

/* Collapse / Expand */
.mc-collapse-btn {
    background: none; border: 1px solid var(--mc-border-hover); color: #555;
    border-radius: 4px; width: 24px; height: 24px; display: flex; align-items: center;
    justify-content: center; cursor: pointer; font-size: 0.6rem; flex-shrink: 0;
    margin-left: 2px; transition: all 0.15s;
}
.mc-collapse-btn:hover { color: #fff; border-color: var(--mc-border-active); }
.mc-expand-btn {
    display: none; position: absolute; top: 50%; left: 0; transform: translateY(-50%);
    z-index: 20; background: var(--mc-bg-tertiary); border: 1px solid var(--mc-border);
    border-left: none; border-radius: 0 8px 8px 0; color: var(--mc-text-muted);
    padding: 14px 8px; cursor: pointer; font-size: 1.1rem;
    transition: all 0.15s; writing-mode: vertical-lr;
}
.mc-expand-btn:hover { color: #fff; background: var(--mc-bg-surface); }

.mc-chat-collapsed .mc-chat-panel { width: 0; min-width: 0; max-width: 0; overflow: hidden; border-right: none; opacity: 0; pointer-events: none; }
.mc-chat-collapsed .mc-expand-btn { display: flex; }
.mc-chat-collapsed .mc-collapse-btn { display: none; }
.mc-chat-collapsed .mc-stat-num { font-size: 2.8rem; }
.mc-chat-collapsed .mc-stat-card { padding: 20px 22px; }
.mc-chat-collapsed .mc-impact-num { font-size: 2rem; }
.mc-chat-collapsed .mc-donut-wrap { width: 190px; height: 190px; }
.mc-chat-collapsed .mc-chart-card { padding: 24px; }
.mc-chat-collapsed .mc-side-stack { max-width: 420px; }
.mc-chat-collapsed .mc-greeting { font-size: 2.2rem; }
.mc-stat-num, .mc-stat-card, .mc-impact-num, .mc-donut-wrap, .mc-chart-card, .mc-greeting { transition: all 0.3s ease; }

/* Persona bar */
.mc-persona-bar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: var(--mc-bg-secondary); border-bottom: 1px solid var(--mc-border); flex-shrink: 0; cursor: pointer; }
.mc-persona-avatar-wrap { width: 42px; height: 42px; border-radius: 50%; overflow: hidden; border: 2px solid var(--mc-cyan); flex-shrink: 0; position: relative; background: var(--mc-bg-tertiary); transition: border-color 0.3s; }
.mc-persona-avatar { width: 100%; height: 100%; object-fit: cover; display: block; }
.mc-persona-avatar-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 700; color: var(--mc-cyan); background: var(--mc-bg-tertiary); }
.mc-persona-info { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.mc-persona-name { font-weight: 700; font-size: 0.92rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-persona-label { font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 0.06em; }
.mc-persona-switch-btn { background: none; border: 1px solid var(--mc-border-hover); color: var(--mc-text-muted); border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.7rem; transition: all 0.15s; flex-shrink: 0; }
.mc-persona-switch-btn:hover { color: #fff; border-color: var(--mc-border-active); }

/* Persona dropdown */
.mc-persona-dropdown { background: var(--mc-bg-secondary); border-bottom: 1px solid var(--mc-border); padding: 12px; flex-shrink: 0; max-height: 320px; overflow-y: auto; }
.mc-persona-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mc-persona-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px; border-radius: 8px; cursor: pointer; transition: background 0.15s; border: 1px solid transparent; }
.mc-persona-card:hover { background: var(--mc-bg-elevated); }
.mc-persona-selected { background: var(--mc-bg-surface); border-color: var(--mc-cyan); }
.mc-persona-card-img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid var(--mc-border-hover); transition: border-color 0.15s; }
.mc-persona-selected .mc-persona-card-img { border-color: var(--mc-cyan); }
.mc-persona-card-fallback { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 700; color: var(--mc-text-muted); background: var(--mc-bg-surface); border: 2px solid var(--mc-border-hover); }
.mc-persona-selected .mc-persona-card-fallback { border-color: var(--mc-cyan); color: var(--mc-cyan); }
.mc-persona-card-name { font-size: 0.7rem; color: var(--mc-text-secondary); text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px; }
.mc-persona-selected .mc-persona-card-name { color: #fff; font-weight: 600; }

/* Chat header */
.mc-chat-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--mc-border); flex-shrink: 0; }
.mc-chat-header-name { font-weight: 700; font-size: 0.95rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.mc-chat-header-actions { display: flex; gap: 4px; }
.mc-chat-hdr-btn { background: none; border: 1px solid var(--mc-border-hover); color: var(--mc-text-muted); border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: 0.72rem; transition: all 0.15s; }
.mc-chat-hdr-btn:hover { color: #fff; border-color: var(--mc-border-active); }

/* Chat dropdown */
.mc-chat-dropdown { background: var(--mc-bg-secondary); border-bottom: 1px solid var(--mc-border); flex-shrink: 0; max-height: 300px; display: flex; flex-direction: column; }
.mc-chat-dropdown-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--mc-border); }
.mc-dropdown-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--mc-text-muted); font-weight: 600; }
.mc-chat-list { overflow-y: auto; flex: 1; padding: 4px 0; }
.mc-chat-list-item { display: flex; align-items: center; justify-content: space-between; padding: 7px 12px; cursor: pointer; font-size: 0.82rem; color: var(--mc-text-secondary); transition: background 0.1s; }
.mc-chat-list-item:hover { background: var(--mc-bg-elevated); }
.mc-chat-active { color: #fff; background: var(--mc-bg-surface); border-left: 2px solid var(--mc-cyan); }
.mc-chat-list-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-chat-list-del { background: none; border: none; color: var(--mc-text-dim); cursor: pointer; font-size: 0.72rem; padding: 2px 4px; border-radius: 3px; opacity: 0; transition: opacity 0.15s, color 0.15s; }
.mc-chat-list-item:hover .mc-chat-list-del { opacity: 1; }
.mc-chat-list-del:hover { color: var(--mc-red); }
.mc-chat-dropdown-footer { display: flex; gap: 2px; padding: 6px 8px; border-top: 1px solid var(--mc-border); }
.mc-chat-action-btn { flex: 1; background: none; border: 1px solid var(--mc-border); color: #777; padding: 5px 4px; border-radius: 4px; cursor: pointer; font-size: 0.68rem; text-align: center; transition: all 0.15s; }
.mc-chat-action-btn:hover { background: var(--mc-bg-surface); color: #ddd; }

/* Chat messages */
.mc-chat-messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.mc-chat-welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 8px; }
.mc-chat-welcome-icon { font-size: 2.5rem; opacity: 0.3; }
.mc-chat-welcome-text { font-size: 1.1rem; font-weight: 700; color: #555; }
.mc-chat-welcome-sub { font-size: 0.78rem; color: var(--mc-text-dim); line-height: 1.5; }

/* Bubbles */
.mc-bubble { max-width: 95%; word-wrap: break-word; }
.mc-bubble-user { align-self: flex-end; background: var(--mc-bg-surface); border: 1px solid rgba(0,240,255,0.1); border-radius: 12px 12px 4px 12px; padding: 8px 12px; }
.mc-bubble-assistant { align-self: flex-start; background: rgba(17,17,24,0.8); border: 1px solid rgba(0,240,255,0.08); border-radius: 12px 12px 12px 4px; padding: 8px 12px; border-left: 2px solid var(--mc-cyan); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
.mc-bubble-content { font-size: 0.82rem; color: #ddd; line-height: 1.5; }
.mc-bubble-user .mc-bubble-content { color: #bbb; }
.mc-bubble-footer { display: flex; align-items: center; gap: 6px; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.04); }
.mc-bubble-model { font-size: 0.6rem; color: var(--mc-text-dim); background: rgba(255,255,255,0.04); padding: 1px 6px; border-radius: 6px; font-family: monospace; letter-spacing: 0.02em; }
.mc-bubble-thumbsdown { background: none; border: none; cursor: pointer; font-size: 0.7rem; opacity: 0.3; transition: opacity 0.15s; padding: 1px 4px; margin-left: auto; }
.mc-bubble-thumbsdown:hover { opacity: 0.8; }
.mc-bubble-thumbsdown.mc-thumbed { opacity: 1; color: var(--mc-red, #ff3355); cursor: default; font-size: 0.6rem; }
.mc-inline-code { background: var(--mc-bg-primary); padding: 1px 5px; border-radius: 3px; font-family: 'Consolas', 'Monaco', monospace; font-size: 0.78rem; color: var(--mc-cyan); }

/* Context Bar */
.mc-context-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0 6px;
}
.mc-context-track {
    flex: 1;
    height: 4px;
    background: var(--mc-bg-void);
    border-radius: 3px;
    overflow: hidden;
}
.mc-context-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease, background 0.4s ease;
    background: linear-gradient(90deg, var(--mc-cyan), var(--mc-green));
}
.mc-context-label {
    font-size: 0.62rem;
    color: var(--mc-text-dim);
    white-space: nowrap;
    min-width: 60px;
    text-align: right;
    letter-spacing: 0.02em;
}
.mc-context-critical .mc-context-fill {
    animation: mc-context-pulse 1.5s ease-in-out infinite;
}
.mc-context-critical .mc-context-label {
    color: #f44336;
    font-weight: 600;
}
@keyframes mc-context-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}

/* Input */
.mc-chat-input-wrap { border-top: 1px solid var(--mc-border); padding: 10px 12px; flex-shrink: 0; }
.mc-chat-input-row { display: flex; gap: 8px; align-items: flex-end; }
.mc-chat-input { flex: 1; background: var(--mc-bg-tertiary); border: 1px solid var(--mc-border-hover); border-radius: 8px; padding: 8px 12px; color: var(--mc-text-primary); font-size: 0.85rem; font-family: inherit; resize: none; max-height: 120px; line-height: 1.4; }
.mc-chat-input:focus { border-color: var(--mc-cyan); outline: none; box-shadow: 0 0 0 2px rgba(0,240,255,0.15); }
.mc-chat-input::placeholder { color: var(--mc-text-dim); }
.mc-chat-send { width: 36px; height: 36px; border-radius: 8px; border: none; background: linear-gradient(135deg, #5b4fcf, #7c6fe0); color: #fff; font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); font-weight: 700; }
.mc-chat-send:hover { box-shadow: 0 0 16px rgba(124,111,224,0.4), 0 0 32px rgba(124,111,224,0.15); transform: scale(1.08); }
.mc-chat-send:active { transform: scale(0.95); }
.mc-chat-streaming-indicator { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 0.75rem; color: var(--mc-text-muted); }
.mc-typing-dots { display: flex; gap: 3px; }
.mc-typing-dots span { width: 5px; height: 5px; border-radius: 50%; background: var(--mc-cyan); animation: mc-dot-bounce 1.4s infinite; }
.mc-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.mc-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
.mc-chat-cancel { margin-left: auto; background: none; border: 1px solid var(--mc-border-active); color: var(--mc-text-muted); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.75rem; }
.mc-chat-cancel:hover { color: var(--mc-red); border-color: var(--mc-red); }

/* Tool health */
.mc-tool-health-bar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: rgba(255,152,0,0.08); border-bottom: 1px solid rgba(255,152,0,0.2); animation: mc-health-fade-in 0.3s ease; flex-shrink: 0; font-size: 0.78rem; color: var(--mc-orange); }
.mc-tool-health-icon { font-size: 0.9rem; }
.mc-tool-health-text { flex: 1; font-size: 0.72rem; line-height: 1.3; }
.mc-tool-health-nudge { background: rgba(255,152,0,0.15); border: 1px solid rgba(255,152,0,0.3); color: var(--mc-orange); font-size: 0.72rem; padding: 3px 10px; border-radius: 5px; cursor: pointer; white-space: nowrap; transition: all 0.15s; font-family: inherit; }
.mc-tool-health-nudge:hover { background: rgba(255,152,0,0.25); }
.mc-tool-health-dismiss { background: none; border: none; color: var(--mc-text-muted); cursor: pointer; font-size: 0.85rem; padding: 2px 6px; border-radius: 4px; transition: all 0.15s; }
.mc-tool-health-dismiss:hover { color: var(--mc-orange); background: rgba(255,152,0,0.15); }

/* ═══ Overlays ═══ */
.mc-overlay { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
.mc-overlay-panel { background: rgba(10,10,15,0.92); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--mc-radius-lg); width: 90%; max-width: 640px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 60px rgba(0,240,255,0.06), inset 0 1px 0 rgba(255,255,255,0.04); animation: mc-overlay-in 0.25s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(24px) saturate(1.5); -webkit-backdrop-filter: blur(24px) saturate(1.5); }
.mc-overlay-wide { max-width: 800px; }
.mc-overlay-header { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--mc-border); flex-shrink: 0; }
.mc-overlay-header h2 { margin: 0; font-size: 1.1rem; color: var(--mc-text-primary); flex: 1; }
.mc-overlay-close { background: none; border: none; color: var(--mc-text-muted); font-size: 1.2rem; cursor: pointer; padding: 4px 8px; border-radius: var(--mc-radius-sm); transition: all 0.15s; }
.mc-overlay-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
.mc-overlay-hint { font-size: 0.8rem; color: #777; line-height: 1.5; margin-bottom: 14px; }
.mc-overlay-body { padding: 16px 20px; overflow-y: auto; flex: 1; min-height: 0; }
.mc-overlay-tabs { display: flex; gap: 0; padding: 0 20px; border-bottom: 1px solid var(--mc-border); overflow-x: auto; flex-shrink: 0; }
.mc-overlay-tab { background: none; border: none; border-bottom: 2px solid transparent; color: #777; font-size: 0.82rem; padding: 10px 14px; cursor: pointer; transition: all 0.15s; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
.mc-overlay-tab:hover { color: #ccc; }
.mc-overlay-tab-active { color: #fff; border-bottom-color: var(--mc-cyan); }
.mc-overlay-tab .mc-reflect-count { font-size: 0.65rem; }
.mc-rules-toolbar { display: flex; justify-content: flex-end; margin-bottom: 10px; }

/* Guide */
.mc-guide-panel { max-width: 860px; }
.mc-guide-nav { display: flex; flex-wrap: wrap; gap: 0; padding: 0 16px; border-bottom: 1px solid var(--mc-border); }
.mc-guide-nav-btn { background: none; border: none; border-bottom: 2px solid transparent; color: #777; font-size: 0.78rem; padding: 9px 12px; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.mc-guide-nav-btn:hover { color: #ccc; }
.mc-guide-nav-active { color: var(--mc-cyan); border-bottom-color: var(--mc-cyan); }
.mc-guide-body { padding: 20px 24px; line-height: 1.65; color: #c0c0c0; }
.mc-guide-body h3 { color: var(--mc-text-primary); margin: 0 0 10px; font-size: 1.05rem; }
.mc-guide-body h4 { color: var(--mc-cyan); margin: 18px 0 6px; font-size: 0.9rem; }
.mc-guide-body p { margin: 6px 0; font-size: 0.85rem; }
.mc-guide-body ul { margin: 6px 0 12px 8px; padding-left: 14px; }
.mc-guide-body li { margin: 4px 0; font-size: 0.84rem; }
.mc-guide-body code { background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 3px; font-size: 0.82rem; color: var(--mc-cyan); }
.mc-guide-section { animation: mc-guide-fade 0.2s ease; }

/* ═══ Tools Status ═══ */
.mc-tools-banner { display: flex; align-items: center; justify-content: space-between; background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 12px 16px; margin-bottom: 14px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.mc-tools-toolset { font-size: 0.85rem; color: var(--mc-text-secondary); }
.mc-tools-toolset strong { color: var(--mc-cyan); }
.mc-tools-counts { font-size: 0.8rem; color: var(--mc-text-muted); }
.mc-tools-list { display: flex; flex-direction: column; gap: 8px; }
.mc-tool-card { background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 14px 16px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.mc-tool-card:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 2px 12px rgba(0,0,0,0.3); transform: translateY(-1px); }
.mc-tool-card.mc-tool-enabled { border-left: 3px solid var(--mc-green); }
.mc-tool-card.mc-tool-disabled { border-left: 3px solid var(--mc-red); opacity: 0.7; }
.mc-tool-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.mc-tool-status-icon { font-size: 0.9rem; }
.mc-tool-name { font-weight: 700; font-size: 0.88rem; color: var(--mc-text-primary); font-family: monospace; }
.mc-tool-status-badge { margin-left: auto; font-size: 0.7rem; padding: 2px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.mc-tool-status-badge.mc-tool-enabled { background: var(--mc-green-bg); color: var(--mc-green); }
.mc-tool-status-badge.mc-tool-disabled { background: var(--mc-magenta-bg); color: var(--mc-red); }
.mc-tool-desc { font-size: 0.78rem; color: var(--mc-text-muted); line-height: 1.5; margin-bottom: 8px; }
.mc-tool-params { display: flex; flex-wrap: wrap; gap: 4px; }
.mc-tool-param { font-size: 0.7rem; background: var(--mc-bg-tertiary); border: 1px solid var(--mc-border-hover); color: var(--mc-text-secondary); padding: 2px 8px; border-radius: 4px; font-family: monospace; }
.mc-tool-param-none { color: #555; font-style: italic; }

/* ═══ Model Feedback ═══ */
.mc-feedback-summary { margin-bottom: 16px; }
.mc-feedback-bars { display: flex; flex-direction: column; gap: 10px; }
.mc-feedback-bar-row { display: flex; align-items: center; gap: 10px; }
.mc-feedback-bar-label { flex: 0 0 160px; font-size: 0.78rem; color: var(--mc-text-secondary); font-family: monospace; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-feedback-bar-track { flex: 1; height: 18px; background: rgba(255,255,255,0.04); border-radius: 9px; overflow: hidden; border: 1px solid var(--mc-glass-border); }
.mc-feedback-bar-fill { height: 100%; background: linear-gradient(90deg, var(--mc-red, #ff3355), var(--mc-magenta, #ff00aa)); border-radius: 9px; transition: width 0.4s ease; min-width: 4px; }
.mc-feedback-bar-count { flex: 0 0 30px; font-size: 0.8rem; color: var(--mc-text-primary); font-weight: 700; text-align: center; }
.mc-feedback-recent-title { font-size: 0.85rem; color: var(--mc-text-secondary); margin: 18px 0 10px 0; font-weight: 600; }
.mc-feedback-list { display: flex; flex-direction: column; gap: 8px; }
.mc-feedback-entry { background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-left: 3px solid var(--mc-red, #ff3355); border-radius: var(--mc-radius); padding: 10px 14px; }
.mc-feedback-entry:hover { border-color: rgba(255,255,255,0.1); }
.mc-feedback-entry-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.mc-feedback-entry-model { font-size: 0.75rem; font-family: monospace; color: var(--mc-cyan, #00f0ff); background: rgba(0,240,255,0.08); padding: 2px 8px; border-radius: 6px; }
.mc-feedback-entry-date { font-size: 0.7rem; color: var(--mc-text-muted); }
.mc-feedback-entry-preview { font-size: 0.78rem; color: var(--mc-text-muted); line-height: 1.5; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }

/* ═══ Pixel Art Workshop ═══ */
.mc-pixel-section { background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 12px; margin-top: 16px; overflow: hidden; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.mc-pixel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mc-pixel-style-select { width: auto; max-width: 220px; font-size: 0.78rem; padding: 4px 8px; }
.mc-pixel-stage { display: flex; align-items: center; justify-content: center; gap: 0; position: relative; border-radius: 8px; border: 1px solid var(--mc-border); overflow: hidden; background: var(--mc-bg-void); }
.mc-pixel-stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 6px); z-index: 10; mix-blend-mode: multiply; border-radius: 8px; }
.mc-pixel-desk { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; z-index: 1; min-width: 0; overflow: hidden; }
.mc-pixel-canvas { width: 100%; aspect-ratio: 629 / 1024; display: block; }
.mc-pixel-hub { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 90px; flex-shrink: 0; position: relative; z-index: 2; }
.mc-pixel-hub-core { position: relative; width: 44px; height: 44px; }
.mc-pixel-hub-ring { position: absolute; inset: 0; border-radius: 50%; border: 3px solid var(--mc-cyan); opacity: 0.6; animation: mc-hub-spin 4s linear infinite; }
@keyframes mc-hub-spin { 0% { transform: rotate(0deg); border-color: var(--mc-cyan); } 50% { border-color: var(--mc-magenta); } 100% { transform: rotate(360deg); border-color: var(--mc-cyan); } }
.mc-pixel-hub-dot { position: absolute; top: 50%; left: 50%; width: 14px; height: 14px; background: var(--mc-cyan); border-radius: 50%; transform: translate(-50%, -50%); box-shadow: var(--mc-cyan-glow); transition: all 0.4s; }
.mc-pixel-data-stream { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 8px 0; }
.mc-pixel-particle { width: 4px; height: 4px; border-radius: 50%; background: var(--mc-cyan); opacity: 0; animation: mc-stream-flow 1.6s infinite; }
.mc-p2 { animation-delay: 0.4s; }
.mc-p3 { animation-delay: 0.8s; }
.mc-p4 { animation-delay: 1.2s; }
@keyframes mc-stream-flow { 0% { opacity: 0; transform: translateY(-8px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(8px); } }
.mc-pixel-status { font-size: 0.6rem; font-weight: 800; color: var(--mc-cyan); text-transform: uppercase; letter-spacing: 0.15em; text-align: center; margin-top: 4px; text-shadow: 0 0 6px var(--mc-cyan); }

/* Pixel states */
.mc-pixel-thinking .mc-pixel-hub-dot { background: var(--mc-gold); box-shadow: var(--mc-gold-glow); }
.mc-pixel-thinking .mc-pixel-hub-ring { border-color: var(--mc-gold); }
.mc-pixel-thinking .mc-pixel-particle { background: var(--mc-gold); }
.mc-pixel-typing .mc-pixel-hub-dot { background: var(--mc-green); box-shadow: var(--mc-green-glow); }
.mc-pixel-typing .mc-pixel-hub-ring { border-color: var(--mc-green); }
.mc-pixel-typing .mc-pixel-particle { background: var(--mc-green); }
.mc-pixel-tool .mc-pixel-hub-dot { background: var(--mc-orange); box-shadow: 0 0 20px rgba(255,152,0,0.3); }
.mc-pixel-tool .mc-pixel-hub-ring { border-color: var(--mc-orange); }
.mc-pixel-tool .mc-pixel-particle { background: var(--mc-orange); }

/* ═══ Pixel Pet ═══ */
.mc-pet-room {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px;
}
.mc-pet-room canvas {
    border: 2px solid var(--mc-glass-border);
    border-radius: 12px;
    background: #0e1018;
    image-rendering: pixelated;
    max-width: 100%;
    box-shadow: 0 0 20px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,240,255,0.03);
}
.mc-pet-stats {
    display: flex;
    gap: 16px;
    font-size: 0.75rem;
    color: var(--mc-text-muted);
}

/* Pet Interact Bar */
.mc-pet-interact-bar { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 4px 0; }
.mc-pet-play-btn { background: rgba(0,240,255,0.06); border: 1px solid rgba(0,240,255,0.15); color: var(--mc-text-secondary, #aaa); font-size: 0.78rem; padding: 4px 14px; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-weight: 600; }
.mc-pet-play-btn:hover { background: rgba(0,240,255,0.12); border-color: rgba(0,240,255,0.3); color: var(--mc-cyan, #00f0ff); transform: scale(1.05); }
.mc-pet-play-btn:active { transform: scale(0.97); }
.mc-pet-play-count { font-size: 0.68rem; color: var(--mc-text-muted, #555); font-family: monospace; }

/* Pet Help Panel */
.mc-pet-help { margin-top: 8px; text-align: center; }
.mc-pet-help-toggle {
    background: transparent;
    border: 1px solid var(--mc-glass-border);
    color: var(--mc-cyan);
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
}
.mc-pet-help-toggle:hover {
    background: rgba(0,240,255,0.08);
    border-color: var(--mc-cyan);
    box-shadow: 0 0 12px rgba(0,240,255,0.15);
}
.mc-pet-help-panel {
    margin-top: 12px;
    background: var(--mc-bg-secondary);
    border: 1px solid var(--mc-glass-border);
    border-radius: 12px;
    padding: 20px 24px;
    text-align: left;
    max-width: 540px;
    margin-left: auto;
    margin-right: auto;
    animation: mc-fade-in 0.25s ease;
}
.mc-pet-help-panel h3 {
    margin: 0 0 8px;
    color: var(--mc-cyan);
    font-size: 1rem;
    text-align: center;
}
.mc-pet-help-panel > p {
    color: var(--mc-text-muted);
    font-size: 0.8rem;
    margin: 0 0 16px;
    text-align: center;
    line-height: 1.5;
}
.mc-pet-help-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
}
.mc-pet-help-card {
    background: var(--mc-bg-tertiary);
    border: 1px solid var(--mc-glass-border);
    border-radius: 8px;
    padding: 12px;
    font-size: 0.75rem;
    line-height: 1.5;
}
.mc-pet-help-card .mc-pet-help-icon {
    display: block;
    font-size: 1.4rem;
    margin-bottom: 4px;
}
.mc-pet-help-card strong {
    display: block;
    color: var(--mc-text-primary);
    margin-bottom: 6px;
    font-size: 0.8rem;
}
.mc-pet-help-card ul {
    margin: 0;
    padding-left: 14px;
    color: var(--mc-text-muted);
}
.mc-pet-help-card ul li { margin-bottom: 2px; }
.mc-pet-help-section {
    margin-bottom: 14px;
    font-size: 0.8rem;
    color: var(--mc-text-muted);
    line-height: 1.5;
}
.mc-pet-help-section strong {
    display: block;
    color: var(--mc-text-primary);
    margin-bottom: 6px;
}
.mc-pet-help-section ul {
    margin: 4px 0 0;
    padding-left: 16px;
}
.mc-pet-help-section ul li { margin-bottom: 2px; }
.mc-pet-evo-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 8px 0;
}
.mc-pet-evo-row span {
    background: var(--mc-bg-tertiary);
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    border: 1px solid var(--mc-glass-border);
}
.mc-pet-evo-row span small {
    color: var(--mc-text-muted);
    margin-left: 4px;
}
@keyframes mc-fade-in {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
}

/* ═══ Launcher ═══ */
.mc-launcher { height: 100%; overflow-y: auto; background: var(--mc-bg-primary); position: relative; }
.mc-launcher::before {
    content: ''; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background:
        radial-gradient(ellipse at 30% 30%, rgba(0,240,255,0.04) 0%, transparent 50%),
        radial-gradient(ellipse at 70% 70%, rgba(255,0,170,0.03) 0%, transparent 50%);
    pointer-events: none;
}
.mc-launcher-inner { max-width: 1200px; margin: 0 auto; padding: 40px 32px; }
.mc-launcher-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
.mc-launcher-title { font-size: 2rem; font-weight: 700; color: #fff; margin: 0; font-style: italic; background: linear-gradient(135deg, #fff 20%, var(--mc-cyan) 60%, var(--mc-magenta) 100%); background-size: 200% 200%; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: mc-gradient-shift 8s ease infinite; }
.mc-launcher-date { color: var(--mc-text-muted); font-size: 0.85rem; margin-top: 4px; }
.mc-launcher-settings-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; opacity: 0.5; transition: opacity 0.2s; padding: 8px; }
.mc-launcher-settings-btn:hover { opacity: 1; }
.mc-launcher-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; }
.mc-app-card { background: rgba(17,17,24,0.7); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius-lg); overflow: hidden; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.mc-app-card:hover { border-color: var(--mc-cyan); transform: translateY(-6px) scale(1.02); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 24px rgba(0,240,255,0.15); }
.mc-app-card:active { transform: translateY(-2px) scale(0.99); }
.mc-app-card.mc-app-dragging { opacity: 0.4; transform: scale(0.95); }
.mc-app-card.mc-app-drag-over { border-color: var(--mc-cyan); box-shadow: var(--mc-cyan-glow); }
.mc-app-preview { height: 140px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--mc-bg-secondary) 0%, var(--mc-bg-surface) 100%); border-bottom: 1px solid var(--mc-border); }
.mc-app-icon-large { font-size: 3.5rem; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5)); }
.mc-app-info { padding: 14px 16px; }
.mc-app-name { font-size: 0.95rem; font-weight: 700; color: #eee; margin-bottom: 4px; }
.mc-app-desc { font-size: 0.72rem; color: var(--mc-text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mc-app-badge { position: absolute; top: 8px; right: 8px; background: var(--mc-border-active); color: var(--mc-text-muted); font-size: 0.6rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; }
.mc-badge-auto { background: var(--mc-cyan); color: var(--mc-bg-primary); }

/* Launcher toggle list */
.mc-launcher-toggle-list { max-height: 400px; overflow-y: auto; }
.mc-launcher-toggle-item { display: flex; flex-direction: column; padding: 10px 12px; border-bottom: 1px solid var(--mc-border); transition: background 0.15s; }
.mc-launcher-toggle-item:hover { background: rgba(255,255,255,0.02); }
.mc-launcher-toggle-icon { font-size: 1.2rem; margin-right: 12px; flex-shrink: 0; }
.mc-launcher-toggle-name { flex: 1; color: #ccc; font-size: 0.85rem; font-weight: 600; }
.mc-launcher-toggle-cb { display: none; }
.mc-launcher-toggle-switch { width: 40px; height: 22px; background: var(--mc-border-active); border-radius: 11px; position: relative; transition: background 0.2s; flex-shrink: 0; }
.mc-launcher-toggle-switch::after { content: ''; position: absolute; width: 16px; height: 16px; background: var(--mc-text-muted); border-radius: 50%; top: 3px; left: 3px; transition: all 0.2s; }
.mc-launcher-toggle-cb:checked + .mc-launcher-toggle-switch { background: var(--mc-cyan); }
.mc-launcher-toggle-cb:checked + .mc-launcher-toggle-switch::after { left: 21px; background: #fff; }
.mc-launcher-toggle-row { display: flex; align-items: center; width: 100%; cursor: pointer; }
.mc-launcher-type-badge { font-size: 0.6rem; font-weight: 700; color: var(--mc-text-muted); background: var(--mc-border); padding: 2px 8px; border-radius: 6px; margin-right: 10px; text-transform: uppercase; }
.mc-launcher-prompt-row { display: flex; align-items: center; gap: 8px; padding: 6px 0 2px 34px; }
.mc-launcher-prompt-input { flex: 1; background: var(--mc-bg-secondary); border: 1px solid var(--mc-border-hover); border-radius: var(--mc-radius-sm); color: #ccc; padding: 6px 10px; font-size: 0.78rem; outline: none; transition: border-color var(--mc-transition); }
.mc-launcher-prompt-input:focus { border-color: var(--mc-cyan); }
.mc-launcher-prompt-input::placeholder { color: var(--mc-text-dim); }
.mc-launcher-autosend-label { display: flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.mc-launcher-autosend-cb { width: 14px; height: 14px; accent-color: var(--mc-cyan); cursor: pointer; }
.mc-launcher-autosend-text { font-size: 0.7rem; color: var(--mc-text-muted); }

/* ═══ Habit Tracker (new) ═══ */
.mc-habit-grid { display: flex; flex-direction: column; gap: 8px; }
.mc-habit-row { display: flex; align-items: center; gap: 12px; background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius); padding: 12px 16px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.mc-habit-row:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 2px 12px rgba(0,0,0,0.3); transform: translateY(-1px); }
.mc-habit-check { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--mc-border-hover); background: none; cursor: pointer; transition: all var(--mc-transition); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: transparent; }
.mc-habit-check:hover { border-color: var(--mc-green); }
.mc-habit-check.mc-habit-done { background: var(--mc-green); border-color: var(--mc-green); color: #000; box-shadow: var(--mc-green-glow); }
.mc-habit-info { flex: 1; }
.mc-habit-name { font-size: 0.88rem; font-weight: 600; color: var(--mc-text-primary); }
.mc-habit-streak { font-size: 0.7rem; color: var(--mc-gold); animation: mc-streak-glow 3s infinite; }
.mc-habit-heatmap { display: flex; gap: 2px; }
.mc-habit-day { width: 14px; height: 14px; border-radius: 3px; background: var(--mc-bg-void); border: 1px solid var(--mc-border); }
.mc-habit-day-done { background: var(--mc-green); border-color: var(--mc-green); box-shadow: 0 0 4px rgba(0,255,136,0.2); }

/* ═══ Focus Mode / Pomodoro ═══ */
.mc-focus-wrap { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 30px 20px; }
.mc-focus-timer {
    width: 240px; height: 240px; border-radius: 50%;
    background: var(--mc-bg-secondary);
    display: flex; align-items: center; justify-content: center;
    position: relative;
}
.mc-focus-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.mc-focus-ring-bg { fill: none; stroke: var(--mc-border); stroke-width: 6; }
.mc-focus-ring-fill { fill: none; stroke: var(--mc-cyan); stroke-width: 6; stroke-linecap: round; transition: stroke-dasharray 1s linear; }
.mc-focus-timer.mc-focus-active .mc-focus-ring-fill { stroke: var(--mc-cyan); filter: drop-shadow(0 0 8px rgba(0,240,255,0.5)); }
.mc-focus-timer.mc-focus-break .mc-focus-ring-fill { stroke: var(--mc-green); filter: drop-shadow(0 0 8px rgba(0,255,136,0.5)); }
.mc-focus-timer.mc-focus-active { animation: mc-neon-breathe 3s infinite; }
.mc-focus-timer.mc-focus-break { box-shadow: var(--mc-green-glow); }
.mc-focus-timer-inner { position: relative; z-index: 1; text-align: center; }
.mc-focus-time { font-size: 3.2rem; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.mc-focus-label { font-size: 0.82rem; color: var(--mc-text-muted); text-transform: uppercase; letter-spacing: 0.12em; margin-top: 4px; }
.mc-focus-controls { display: flex; gap: 10px; }
.mc-focus-btn { padding: 10px 24px; border-radius: 8px; border: 1px solid var(--mc-cyan); background: var(--mc-cyan-bg); color: var(--mc-cyan); font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); font-family: inherit; }
.mc-focus-btn:hover { background: rgba(0,240,255,0.2); box-shadow: 0 0 16px rgba(0,240,255,0.3); transform: translateY(-1px); }
.mc-focus-btn:active { transform: translateY(0); }
.mc-focus-btn-stop { border-color: var(--mc-red); background: var(--mc-magenta-bg); color: var(--mc-red); }
.mc-focus-btn-stop:hover { background: rgba(255,0,170,0.2); box-shadow: 0 0 16px rgba(255,0,170,0.3); }

/* Mode selector */
.mc-focus-modes { display: flex; gap: 4px; background: var(--mc-bg-tertiary); border-radius: var(--mc-radius); padding: 4px; border: 1px solid var(--mc-border); }
.mc-focus-mode-btn {
    background: none; border: none; color: var(--mc-text-muted); font-size: 0.78rem;
    padding: 8px 16px; border-radius: var(--mc-radius-sm); cursor: pointer;
    transition: all 0.2s; font-family: inherit; font-weight: 600;
}
.mc-focus-mode-btn:hover { color: var(--mc-text-secondary); }
.mc-focus-mode-btn.mc-focus-mode-active {
    background: var(--mc-cyan-bg); color: var(--mc-cyan); border: 1px solid rgba(0,240,255,0.2);
    box-shadow: 0 0 8px rgba(0,240,255,0.1);
}

/* Goal link */
.mc-focus-link-section { width: 100%; max-width: 320px; }
.mc-focus-goal-select { width: 100%; font-size: 0.82rem; }

/* Session counter */
.mc-focus-session-counter { display: flex; align-items: center; gap: 10px; }
.mc-focus-session-dots { display: flex; gap: 6px; }
.mc-focus-dot-done { width: 12px; height: 12px; border-radius: 50%; background: var(--mc-cyan); box-shadow: 0 0 6px rgba(0,240,255,0.4); }
.mc-focus-dot-pending { width: 12px; height: 12px; border-radius: 50%; background: var(--mc-border); border: 1px solid var(--mc-border-hover); }
.mc-focus-session-text { font-size: 0.78rem; color: var(--mc-text-muted); }

/* Stats row */
.mc-focus-stats-row { display: flex; gap: 16px; width: 100%; max-width: 480px; }
.mc-focus-stat-card {
    flex: 1; text-align: center; padding: 16px 12px;
    background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}
.mc-focus-stat-icon { font-size: 1.2rem; margin-bottom: 6px; }
.mc-focus-stat-num { font-size: 1.4rem; font-weight: 800; color: #fff; }
.mc-focus-stat-label { font-size: 0.68rem; color: var(--mc-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }

/* ═══ Daily Planning ═══ */
.mc-daily-banner {
    display: flex; align-items: center; gap: 14px; padding: 14px 18px; margin-bottom: 16px;
    background: linear-gradient(135deg, rgba(255,215,0,0.06), rgba(255,152,0,0.06));
    border: 1px solid rgba(255,215,0,0.15); border-radius: var(--mc-radius);
    animation: mc-neon-gold-breathe 3s infinite;
}
@keyframes mc-neon-gold-breathe {
    0%, 100% { box-shadow: 0 0 8px rgba(255,215,0,0.1); }
    50% { box-shadow: 0 0 20px rgba(255,215,0,0.2); }
}
.mc-daily-banner-icon { font-size: 1.5rem; }
.mc-daily-banner-text { flex: 1; }
.mc-daily-banner-text strong { color: var(--mc-gold); font-size: 0.95rem; display: block; }
.mc-daily-banner-text span { color: var(--mc-text-muted); font-size: 0.78rem; }

.mc-todays-plan {
    background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); padding: 16px 20px; margin-bottom: 16px;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.mc-plan-progress { font-size: 0.82rem; font-weight: 700; color: var(--mc-cyan); }
.mc-plan-goals { display: flex; flex-direction: column; gap: 6px; }
.mc-plan-goal-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: var(--mc-bg-secondary); border: 1px solid var(--mc-border);
    border-radius: var(--mc-radius-sm); transition: all 0.2s;
}
.mc-plan-goal-item.mc-plan-done { opacity: 0.6; }
.mc-plan-goal-item.mc-plan-done .mc-plan-goal-name { text-decoration: line-through; }
.mc-plan-check { font-size: 0.9rem; }
.mc-plan-goal-pri { font-size: 0.7rem; }
.mc-plan-goal-name { flex: 1; font-size: 0.85rem; color: var(--mc-text-primary); font-weight: 500; }
.mc-plan-xp { font-size: 0.68rem; color: var(--mc-gold); font-weight: 700; }

.mc-habits-quick {
    background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border);
    border-radius: var(--mc-radius); padding: 16px 20px; margin-bottom: 16px;
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}

.mc-daily-planning { display: flex; flex-direction: column; gap: 4px; max-height: 400px; overflow-y: auto; }
.mc-daily-add-row { display: flex; gap: 8px; margin-bottom: 12px; }
.mc-daily-add-input { flex: 1; }
.mc-daily-goal-pick { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--mc-bg-secondary); border: 1px solid var(--mc-border); border-radius: var(--mc-radius-sm); cursor: pointer; transition: all 0.2s; }
.mc-daily-goal-pick:hover { border-color: var(--mc-cyan); background: rgba(0,240,255,0.03); }
.mc-daily-goal-pick.mc-daily-selected { border-color: var(--mc-cyan); background: var(--mc-cyan-bg); }

/* ═══ Calendar Tab ═══ */
.mc-calendar-tab { padding: 0; }

/* ═══ Focus Tab Placeholder ═══ */
.mc-focus-tab { padding: 40px 20px; display: flex; justify-content: center; }
.mc-focus-placeholder { text-align: center; max-width: 520px; }
.mc-focus-icon { font-size: 3.5rem; margin-bottom: 12px; filter: drop-shadow(0 0 12px rgba(0,240,255,0.3)); }
.mc-focus-title { font-size: 1.5rem; font-weight: 700; color: #fff; margin: 0 0 8px; }
.mc-focus-desc { font-size: 0.88rem; color: var(--mc-text-muted); line-height: 1.5; margin: 0 0 24px; }
.mc-focus-preview { display: flex; flex-direction: column; gap: 12px; text-align: left; }
.mc-focus-feature {
    display: flex; align-items: flex-start; gap: 14px; padding: 14px 18px;
    background: rgba(17,17,24,0.6); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
.mc-focus-feature:hover { border-color: rgba(0,240,255,0.15); box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 20px rgba(0,240,255,0.05); transform: translateX(4px); }
.mc-focus-feature-icon { font-size: 1.5rem; flex-shrink: 0; margin-top: 2px; }
.mc-focus-feature strong { color: var(--mc-text-primary); font-size: 0.88rem; display: block; margin-bottom: 2px; }
.mc-focus-feature p { color: var(--mc-text-muted); font-size: 0.78rem; margin: 0; line-height: 1.4; }

/* ═══ Bulletin Board ═══ */
.mc-bulletin-list { display: flex; flex-direction: column; gap: 10px; }
.mc-bulletin-card {
    background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius);
    padding: 14px 16px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.mc-bulletin-card:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
.mc-bulletin-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.mc-bulletin-type { font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; background: var(--mc-bg-surface); color: var(--mc-text-muted); }
.mc-bulletin-status { font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; text-transform: uppercase; }
.mc-bulletin-title { font-size: 0.9rem; font-weight: 600; color: var(--mc-text-primary); }
.mc-bulletin-desc { font-size: 0.78rem; color: var(--mc-text-secondary); line-height: 1.4; margin: 6px 0; }
.mc-bulletin-reason { font-size: 0.75rem; color: var(--mc-text-muted); font-style: italic; margin: 4px 0; padding-left: 10px; border-left: 2px solid var(--mc-border-active); }
.mc-bulletin-date { font-size: 0.68rem; color: var(--mc-text-dim); }
.mc-bulletin-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.mc-bulletin-actions { display: flex; gap: 6px; }
.mc-bulletin-del { background: none; border: none; color: var(--mc-text-dim); cursor: pointer; font-size: 0.75rem; padding: 2px 4px; border-radius: 4px; opacity: 0.5; transition: all 0.15s; }
.mc-bulletin-del:hover { opacity: 1; color: var(--mc-red); }
.mc-btn-resend { background: rgba(0,240,255,0.08); border-color: rgba(0,240,255,0.2); color: var(--mc-cyan, #00f0ff); }
.mc-btn-resend:hover { background: rgba(0,240,255,0.15); box-shadow: 0 0 12px rgba(0,240,255,0.2); }
.mc-trunc-toggle { font-size: 0.7rem; color: var(--mc-cyan, #00f0ff); cursor: pointer; margin-top: 4px; opacity: 0.7; transition: opacity 0.15s; user-select: none; }
.mc-trunc-toggle:hover { opacity: 1; }
.mc-trunc-expanded { white-space: pre-wrap; word-break: break-word; }

/* ═══ Corrections ═══ */
.mc-corrections-list { display: flex; flex-direction: column; gap: 8px; }
.mc-correction-card {
    background: var(--mc-bg-secondary); border: 1px solid var(--mc-border); border-radius: var(--mc-radius);
    padding: 12px 14px; border-left: 3px solid var(--mc-orange);
}
.mc-correction-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.mc-correction-cat { font-size: 0.65rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; background: rgba(255,152,0,0.1); color: var(--mc-orange); text-transform: uppercase; }
.mc-correction-date { font-size: 0.68rem; color: var(--mc-text-dim); margin-left: auto; }
.mc-correction-text { font-size: 0.82rem; color: var(--mc-text-secondary); line-height: 1.5; }
.mc-correction-del { background: none; border: none; color: var(--mc-text-dim); cursor: pointer; font-size: 0.72rem; padding: 2px 4px; opacity: 0.4; transition: all 0.15s; float: right; }
.mc-correction-del:hover { opacity: 1; color: var(--mc-red); }

/* ═══ Reflections ═══ */
.mc-reflections-list { display: flex; flex-direction: column; gap: 10px; }
.mc-reflection-card {
    background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius);
    padding: 14px 16px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.mc-reflection-card:hover { border-color: rgba(255,255,255,0.1); }
.mc-reflection-tab { display: block; }
.mc-reflection-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.mc-reflection-date { font-size: 0.68rem; color: var(--mc-text-dim); margin-left: auto; }
.mc-reflection-bar { display: flex; gap: 6px; margin-bottom: 6px; }
.mc-reflection-good { font-size: 0.78rem; color: var(--mc-green); line-height: 1.4; padding: 6px 10px; background: rgba(0,255,136,0.05); border-radius: var(--mc-radius-sm); flex: 1; }
.mc-reflection-bad { font-size: 0.78rem; color: var(--mc-red); line-height: 1.4; padding: 6px 10px; background: rgba(255,51,85,0.05); border-radius: var(--mc-radius-sm); flex: 1; }
.mc-reflection-lesson { font-size: 0.82rem; color: var(--mc-gold); font-weight: 600; margin: 6px 0 4px; padding: 6px 10px; background: var(--mc-gold-bg); border-radius: var(--mc-radius-sm); border-left: 3px solid var(--mc-gold); }
.mc-reflection-context { font-size: 0.75rem; color: var(--mc-text-muted); line-height: 1.4; margin-top: 4px; }
.mc-reflection-del { background: none; border: none; color: var(--mc-text-dim); cursor: pointer; font-size: 0.72rem; padding: 2px 4px; opacity: 0.4; transition: all 0.15s; }
.mc-reflection-del:hover { opacity: 1; color: var(--mc-red); }

/* ═══ Learned Rules ═══ */
.mc-rules-list { display: flex; flex-direction: column; gap: 8px; }
.mc-rule-card {
    background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius);
    padding: 12px 14px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.mc-rule-card:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
.mc-rule-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.mc-rule-check { font-size: 0.85rem; }
.mc-rule-text { font-size: 0.82rem; color: var(--mc-text-primary); line-height: 1.5; font-weight: 500; }
.mc-rule-toggle { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.mc-rule-toggle input[type="checkbox"] { accent-color: var(--mc-cyan); width: 14px; height: 14px; cursor: pointer; }
.mc-rule-toggle-label { font-size: 0.72rem; color: var(--mc-text-muted); cursor: pointer; }
.mc-rule-source { font-size: 0.68rem; color: var(--mc-text-dim); background: var(--mc-bg-surface); padding: 2px 8px; border-radius: 6px; }
.mc-rule-vfm { font-size: 0.65rem; color: var(--mc-text-dim); margin-left: auto; }
.mc-rule-dates { font-size: 0.65rem; color: var(--mc-text-dim); margin-top: 4px; }
.mc-rule-seen { font-size: 0.65rem; color: var(--mc-text-dim); }
.mc-rule-del { background: none; border: none; color: var(--mc-text-dim); cursor: pointer; font-size: 0.72rem; padding: 2px 4px; opacity: 0.4; transition: all 0.15s; }
.mc-rule-del:hover { opacity: 1; color: var(--mc-red); }

/* ═══ Capsules ═══ */
.mc-capsules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.mc-capsule-card {
    background: rgba(13,13,20,0.7); border: 1px solid var(--mc-glass-border); border-radius: var(--mc-radius);
    padding: 12px 14px; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.mc-capsule-card:hover { border-color: rgba(255,255,255,0.1); box-shadow: 0 2px 12px rgba(0,0,0,0.2); }
.mc-capsule-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.mc-capsule-pattern { font-size: 0.82rem; color: var(--mc-text-primary); font-weight: 600; line-height: 1.4; }
.mc-capsule-type { font-size: 0.6rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; background: var(--mc-purple); color: #fff; text-transform: uppercase; }
.mc-capsule-uses { font-size: 0.65rem; color: var(--mc-text-muted); background: var(--mc-bg-surface); padding: 2px 8px; border-radius: 8px; margin-left: auto; }
.mc-capsule-date { font-size: 0.65rem; color: var(--mc-text-dim); margin-top: 4px; }
.mc-capsule-del { background: none; border: none; color: var(--mc-text-dim); cursor: pointer; font-size: 0.72rem; padding: 2px 4px; opacity: 0.4; transition: all 0.15s; float: right; }
.mc-capsule-del:hover { opacity: 1; color: var(--mc-red); }
.mc-capsule-expand {
    font-size: 0.7rem; color: var(--mc-cyan, #00f0ff); cursor: pointer; margin-top: 4px;
    opacity: 0.7; transition: opacity 0.15s; user-select: none;
}
.mc-capsule-expand:hover { opacity: 1; }
.mc-capsule-expanded { white-space: pre-wrap; word-break: break-word; }

/* ═══ Mind Section (Reflection Tab) ═══ */
.mc-mind-section { margin-top: 16px; }
.mc-mind-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--mc-border); margin-bottom: 12px; overflow-x: auto; }
.mc-mind-tab-btn {
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--mc-text-muted); font-size: 0.82rem; padding: 10px 14px;
    cursor: pointer; transition: all 0.15s; white-space: nowrap; font-family: inherit;
}
.mc-mind-tab-btn:hover { color: var(--mc-text-secondary); }
.mc-mind-tab-btn.mc-mind-tab-active { color: var(--mc-purple); border-bottom-color: var(--mc-purple); }
/* mind-tab-panel visibility is managed by JS inline styles */
.mc-mind-kb-entries { margin-top: 8px; }

/* ═══ Button Variants ═══ */
.mc-btn-approve { background: rgba(0,255,136,0.12); color: var(--mc-green); border-color: var(--mc-green); }
.mc-btn-approve:hover { background: rgba(0,255,136,0.25); box-shadow: var(--mc-green-glow); }
.mc-btn-deny { background: rgba(255,51,85,0.12); color: var(--mc-red); border-color: var(--mc-red); }
.mc-btn-deny:hover { background: rgba(255,51,85,0.25); box-shadow: var(--mc-magenta-glow); }

/* ═══ Extra Utilities ═══ */
.mc-modal-hint { font-size: 0.75rem; color: var(--mc-text-muted); line-height: 1.4; }
/* overlay-tab-content visibility is managed by JS inline styles */
.mc-tools-info { font-size: 0.78rem; color: var(--mc-text-muted); margin-bottom: 12px; line-height: 1.4; }
.mc-stat-memories { font-size: 0.65rem; color: var(--mc-text-dim); margin-top: 2px; }

/* ═══ Scrollbar ═══ */
.mc-chat-messages::-webkit-scrollbar,
.mc-dash-scroll::-webkit-scrollbar,
.mc-tab-content::-webkit-scrollbar,
.mc-column-cards::-webkit-scrollbar,
.mc-agents-list::-webkit-scrollbar,
.mc-activity-feed::-webkit-scrollbar { width: 5px; }
.mc-chat-messages::-webkit-scrollbar-track,
.mc-dash-scroll::-webkit-scrollbar-track,
.mc-tab-content::-webkit-scrollbar-track,
.mc-column-cards::-webkit-scrollbar-track,
.mc-agents-list::-webkit-scrollbar-track,
.mc-activity-feed::-webkit-scrollbar-track { background: transparent; }
.mc-chat-messages::-webkit-scrollbar-thumb,
.mc-dash-scroll::-webkit-scrollbar-thumb,
.mc-tab-content::-webkit-scrollbar-thumb,
.mc-column-cards::-webkit-scrollbar-thumb,
.mc-agents-list::-webkit-scrollbar-thumb,
.mc-activity-feed::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }

/* ═══ Responsive ═══ */
@media (max-width: 1100px) {
    .mc-chat-panel { width: 280px; min-width: 240px; }
    .mc-charts-row { flex-wrap: wrap; }
    .mc-side-stack { max-width: none; }
}
@media (max-width: 800px) {
    .mc-root { flex-direction: column; }
    .mc-chat-panel { width: 100%; max-width: none; height: 300px; border-right: none; border-bottom: 1px solid var(--mc-border); }
    .mc-dash-scroll { padding: 0 12px 24px; }
    .mc-board { flex-direction: column; }
    .mc-stats-row { flex-wrap: wrap; }
    .mc-stat-card { min-width: 120px; }
    .mc-greeting { font-size: 1.3rem; }
    .mc-week-grid > * { max-width: none; }
    .mc-pixel-stage { max-height: 60vh; }
    .mc-pixel-hub { width: 50px; }
    .mc-tab-bar { overflow-x: auto; }
}
@media (max-width: 768px) {
    .mc-fullcal-cell { min-height: 65px; }
    .mc-fullcal-event-title { font-size: 0.55rem; }
    .mc-fullcal-date { font-size: 0.65rem; }
    .mc-event-row { flex-direction: column; gap: 6px; }
}
`;
