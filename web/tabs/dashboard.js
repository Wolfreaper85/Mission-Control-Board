// tabs/dashboard.js — Dashboard with XP bar, daily planning, habits, stats, charts
// Phase 3+4: Daily Planning Ritual, XP System, Habit Quick-Checks

import { CSRF } from '../lib/api.js';
import { setText, esc, countCompletedToday, countCompletedThisWeek, countProgressNotes, showToast, showXPGain } from '../lib/utils.js';

let _mc = null;
let _container = null;
let _modalHost = null;
let _refreshInterval = null;
let _goalsCache = [];
let _selectedScope = '';
let _memoryScopesLoaded = false;
let _refreshHandler = null;
let _sseHandler = null;
let _lastMemoriesToday = 0;
let _lastMemoriesTotal = 0;
let _lastAbandoned = 0;
let _loadStatsTimer = null;
let _xpData = null;
let _dailyPlan = null;
let _habitStats = [];

// ─── Tab Interface ────────────────────────────────────────────────────────────

export function init(container, mc) {
    _mc = mc;
    _container = container;
    container.innerHTML = _buildHTML();

    // Move modal overlays out of the tab content into body so position:fixed works correctly
    // (CSS transforms on .mc-tab-content create a new containing block that clips fixed children)
    _modalHost = document.createElement('div');
    _modalHost.id = 'mc-dashboard-modals';
    ['mc-daily-modal', 'mc-habit-modal'].forEach(id => {
        const modal = container.querySelector('#' + id);
        if (modal) _modalHost.appendChild(modal);
    });
    document.body.appendChild(_modalHost);

    // Sync scope from mc (set by persona switcher / _initScope)
    if (_mc && _mc.selectedScope) {
        _selectedScope = _mc.selectedScope;
    }
    _memoryScopesLoaded = false;   // force re-fetch of scope dropdown

    _bindEvents(container);
    _loadAll();
    _startPolling();

    // Clean up any previous listeners before adding new ones
    if (_refreshHandler) mc.off('refresh-data', _refreshHandler);
    if (_sseHandler) mc.off('sse', _sseHandler);
    _sseHandler = _handleSSE;
    _refreshHandler = () => _loadAll();
    mc.on('sse', _sseHandler);
    mc.on('refresh-data', _refreshHandler);
    return { destroy, refresh };
}

export function destroy() {
    _stopPolling();
    if (_mc) {
        if (_sseHandler) _mc.off('sse', _sseHandler);
        if (_refreshHandler) _mc.off('refresh-data', _refreshHandler);
        _sseHandler = null;
        _refreshHandler = null;
    }
    if (_modalHost && _modalHost.parentNode) {
        _modalHost.parentNode.removeChild(_modalHost);
        _modalHost = null;
    }
}

export function refresh() {
    _loadAll();
    _startPolling();
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function _buildHTML() {
    return `
        <!-- XP Bar -->
        <div class="mc-xp-section">
            <div class="mc-xp-bar-wrap">
                <div class="mc-xp-level" id="mc-xp-level" title="Current Level">1</div>
                <div class="mc-xp-track">
                    <div class="mc-xp-fill" id="mc-xp-fill" style="width:0%"></div>
                </div>
                <div class="mc-xp-info">
                    <span id="mc-xp-text">0 / 100 XP</span>
                </div>
            </div>
        </div>

        <!-- Daily Plan Banner -->
        <div class="mc-daily-banner" id="mc-daily-banner" style="display:none">
            <div class="mc-daily-banner-icon">\u{2600}\u{FE0F}</div>
            <div class="mc-daily-banner-text">
                <strong>Start Your Day</strong>
                <span>Pick today's priorities and earn bonus XP</span>
            </div>
            <button class="mc-btn mc-btn-accent mc-btn-sm" id="mc-daily-start-btn">Plan Today</button>
        </div>

        <!-- Today's Plan (shown after planning) -->
        <div class="mc-todays-plan" id="mc-todays-plan" style="display:none">
            <div class="mc-board-header">
                <h3 class="mc-section-title">\u{1F4CB} Today's Plan</h3>
                <div style="display:flex;gap:8px;align-items:center">
                    <span class="mc-plan-progress" id="mc-plan-progress">0/0</span>
                    <button class="mc-btn mc-btn-sm" id="mc-plan-edit-btn">Edit</button>
                </div>
            </div>
            <div class="mc-plan-goals" id="mc-plan-goals"></div>
        </div>

        <!-- Habits Quick-Check -->
        <div class="mc-habits-quick" id="mc-habits-quick" style="display:none">
            <div class="mc-board-header">
                <h3 class="mc-section-title">\u{2705} Today's Habits</h3>
                <button class="mc-btn mc-btn-sm" id="mc-habits-manage-btn">Manage</button>
            </div>
            <div class="mc-habit-grid" id="mc-habit-grid"></div>
        </div>

        <!-- Stats Row -->
        <div class="mc-stats-row">
            <div class="mc-stat-card mc-border-red">
                <div class="mc-stat-top"><span class="mc-stat-label">TOTAL GOALS</span><span class="mc-stat-icon">\u{1F4CB}</span></div>
                <div class="mc-stat-num" id="mc-s-total">0</div>
            </div>
            <div class="mc-stat-card mc-border-green">
                <div class="mc-stat-top"><span class="mc-stat-label">COMPLETED</span><span class="mc-stat-icon">\u{2705}</span></div>
                <div class="mc-stat-num" id="mc-s-completed">0</div>
            </div>
            <div class="mc-stat-card mc-border-yellow">
                <div class="mc-stat-top"><span class="mc-stat-label">ACTIVE</span><span class="mc-stat-icon">\u{1F525}</span></div>
                <div class="mc-stat-num" id="mc-s-active">0</div>
            </div>
            <div class="mc-stat-card mc-border-purple mc-stat-mind">
                <div class="mc-stat-top">
                    <span class="mc-stat-label">MIND</span>
                    <span class="mc-stat-icon">\u{1F9E0}</span>
                </div>
                <div class="mc-stat-num" id="mc-s-memories">0</div>
                <div class="mc-mind-btns">
                    <div class="mc-mind-scope-anchor">
                        <button class="mc-mind-btn" id="mc-mind-scope-btn" title="Switch scope">\u{1F464}</button>
                        <div class="mc-mind-scope-dropdown" id="mc-mind-scope-dropdown" style="display:none">
                            <div class="mc-mind-scope-list" id="mc-mind-scope-list"></div>
                        </div>
                    </div>
                </div>
                <select id="mc-memory-scope" style="display:none"><option value="">All</option></select>
            </div>
            <div class="mc-stat-card mc-border-blue">
                <div class="mc-stat-top"><span class="mc-stat-label">AGENTS</span><span class="mc-stat-icon">\u{1F916}</span></div>
                <div class="mc-stat-num" id="mc-s-agents">0</div>
            </div>
        </div>

        <!-- Accent Divider -->
        <div class="mc-accent-divider"></div>

        <!-- AI Impact Row -->
        <div class="mc-impact-section">
            <div class="mc-impact-header">
                <span class="mc-impact-icon">\u{26A1}</span>
                <span class="mc-impact-title">AI Impact &mdash; Today</span>
                <span class="mc-impact-badge" id="mc-impact-badge">0 actions</span>
            </div>
            <div class="mc-impact-stats">
                <div class="mc-impact-stat">
                    <span class="mc-impact-stat-icon mc-imp-green">\u{2714}</span>
                    <span class="mc-impact-num" id="mc-imp-done">0</span>
                    <span class="mc-impact-label">Done Today</span>
                </div>
                <div class="mc-impact-stat">
                    <span class="mc-impact-stat-icon mc-imp-orange">\u{1F4C8}</span>
                    <span class="mc-impact-num" id="mc-imp-week">0</span>
                    <span class="mc-impact-label">This Week</span>
                </div>
                <div class="mc-impact-stat">
                    <span class="mc-impact-stat-icon mc-imp-blue">\u{1F4DD}</span>
                    <span class="mc-impact-num" id="mc-imp-progress">0</span>
                    <span class="mc-impact-label">Progress Notes</span>
                </div>
                <div class="mc-impact-stat">
                    <span class="mc-impact-stat-icon mc-imp-purple">\u{1F4A1}</span>
                    <span class="mc-impact-num" id="mc-imp-memories">0</span>
                    <span class="mc-impact-label">Memories</span>
                </div>
                <div class="mc-impact-stat">
                    <span class="mc-impact-stat-icon mc-imp-red">\u{1F4D3}</span>
                    <span class="mc-impact-num" id="mc-imp-abandoned">0</span>
                    <span class="mc-impact-label">Abandoned</span>
                </div>
            </div>
        </div>

        <!-- Charts + Side Panel Row -->
        <div class="mc-charts-row">
            <div class="mc-chart-card">
                <h3 class="mc-chart-title">Completion Rate</h3>
                <div class="mc-donut-wrap">
                    <svg class="mc-donut" viewBox="0 0 120 120">
                        <circle class="mc-donut-bg" cx="60" cy="60" r="50" />
                        <circle class="mc-donut-ring mc-donut-red" cx="60" cy="60" r="50"
                            stroke-dasharray="0 314" id="mc-donut-completion-ring" />
                        <text class="mc-donut-text" x="60" y="56" id="mc-donut-pct">0%</text>
                        <text class="mc-donut-sub" x="60" y="72">Complete</text>
                    </svg>
                </div>
            </div>
            <div class="mc-chart-card">
                <h3 class="mc-chart-title">Priority Distribution</h3>
                <div class="mc-donut-wrap">
                    <svg class="mc-donut" viewBox="0 0 120 120">
                        <circle class="mc-donut-bg" cx="60" cy="60" r="50" />
                        <circle class="mc-donut-ring mc-donut-seg-low" cx="60" cy="60" r="50"
                            stroke-dasharray="0 314" id="mc-pri-low" />
                        <circle class="mc-donut-ring mc-donut-seg-med" cx="60" cy="60" r="50"
                            stroke-dasharray="0 314" id="mc-pri-med" />
                        <circle class="mc-donut-ring mc-donut-seg-high" cx="60" cy="60" r="50"
                            stroke-dasharray="0 314" id="mc-pri-high" />
                        <text class="mc-donut-text" x="60" y="56" id="mc-pri-total">0</text>
                        <text class="mc-donut-sub" x="60" y="72">tasks</text>
                    </svg>
                </div>
                <div class="mc-legend">
                    <span class="mc-legend-item"><span class="mc-leg-dot" style="background:#4caf50"></span> Low</span>
                    <span class="mc-legend-item"><span class="mc-leg-dot" style="background:#ff9800"></span> Medium</span>
                    <span class="mc-legend-item"><span class="mc-leg-dot" style="background:#f44336"></span> High</span>
                </div>
            </div>
            <div class="mc-side-stack">
                <div class="mc-side-card">
                    <div class="mc-side-card-header">
                        <span class="mc-side-icon">\u{1F916}</span>
                        <span class="mc-side-count" id="mc-agents-count">0</span>
                        <span class="mc-side-label">Active Agents</span>
                    </div>
                    <div class="mc-agents-list" id="mc-agents-list">
                        <div class="mc-empty-sm">No agents running</div>
                    </div>
                </div>
                <div class="mc-side-card mc-side-card-log">
                    <div class="mc-side-card-header">
                        <span class="mc-side-icon">\u{1F4DD}</span>
                        <span class="mc-side-label">AI Log</span>
                    </div>
                    <div class="mc-activity-feed" id="mc-activity-feed">
                        <div class="mc-empty-sm">Listening for events...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Daily Planning Modal -->
        <div class="mc-modal-overlay" id="mc-daily-modal" style="display:none">
            <div class="mc-modal" style="max-width:560px">
                <div class="mc-modal-header">
                    <h3>\u{2600}\u{FE0F} Plan Your Day</h3>
                    <button class="mc-modal-close" id="mc-daily-modal-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body" id="mc-daily-modal-body">
                    <p class="mc-modal-hint">Pick goals or add quick tasks for today. Completing your daily plan earns +100 bonus XP!</p>
                    <div class="mc-daily-add-row">
                        <input class="mc-input mc-daily-add-input" id="mc-daily-add-input" type="text" placeholder="Add a quick task..." maxlength="200">
                        <button class="mc-btn mc-btn-accent mc-btn-sm" id="mc-daily-add-btn">+ Add</button>
                    </div>
                    <div id="mc-daily-goal-list" class="mc-daily-planning"></div>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn" id="mc-daily-cancel">Cancel</button>
                    <button class="mc-btn mc-btn-accent" id="mc-daily-save">Save Plan</button>
                </div>
            </div>
        </div>

        <!-- Habit Manager Modal -->
        <div class="mc-modal-overlay" id="mc-habit-modal" style="display:none">
            <div class="mc-modal" style="max-width:480px">
                <div class="mc-modal-header">
                    <h3>\u{1F4DD} Manage Habits</h3>
                    <button class="mc-modal-close" id="mc-habit-modal-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body">
                    <div id="mc-habit-list"></div>
                    <div style="display:flex;gap:8px;margin-top:12px">
                        <input type="text" class="mc-input" id="mc-habit-new-name" placeholder="New habit name...">
                        <input type="text" class="mc-input" id="mc-habit-new-icon" placeholder="\u{2705}" style="width:50px;text-align:center">
                        <button class="mc-btn mc-btn-accent mc-btn-sm" id="mc-habit-add-btn">Add</button>
                    </div>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn" id="mc-habit-modal-done">Done</button>
                </div>
            </div>
        </div>`;
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function _bindEvents(el) {
    // Memory scope
    el.querySelector('#mc-memory-scope').addEventListener('change', e => {
        _selectedScope = e.target.value;
        if (_mc) _mc.selectedScope = _selectedScope;
        _loadGoalsForCharts();
        _loadStatsNow();
    });

    // Mind scope button
    el.querySelector('#mc-mind-scope-btn').addEventListener('click', e => {
        e.stopPropagation();
        const dd = document.getElementById('mc-mind-scope-dropdown');
        if (dd.style.display !== 'none') { dd.style.display = 'none'; return; }
        _populateScopeDropdown();
        dd.style.display = 'block';
    });
    document.addEventListener('click', e => {
        const dd = document.getElementById('mc-mind-scope-dropdown');
        const btn = document.getElementById('mc-mind-scope-btn');
        if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && e.target !== btn) {
            dd.style.display = 'none';
        }
    });

    // Daily planning — openers are in el, modal internals are in _modalHost
    el.querySelector('#mc-daily-start-btn').addEventListener('click', () => _openDailyPlanner());
    el.querySelector('#mc-plan-edit-btn')?.addEventListener('click', () => _openDailyPlanner());
    _modalHost.querySelector('#mc-daily-modal-close').addEventListener('click', () => _closeDailyModal());
    _modalHost.querySelector('#mc-daily-cancel').addEventListener('click', () => _closeDailyModal());
    _modalHost.querySelector('#mc-daily-save').addEventListener('click', () => _saveDailyPlan());
    _modalHost.querySelector('#mc-daily-add-btn').addEventListener('click', () => _addQuickTask());
    _modalHost.querySelector('#mc-daily-add-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') _addQuickTask();
    });
    _modalHost.querySelector('#mc-daily-modal').addEventListener('click', e => {
        if (e.target.id === 'mc-daily-modal') _closeDailyModal();
    });

    // Habit manager — opener is in el, modal internals are in _modalHost
    el.querySelector('#mc-habits-manage-btn').addEventListener('click', () => _openHabitManager());
    _modalHost.querySelector('#mc-habit-modal-close').addEventListener('click', () => _closeHabitModal());
    _modalHost.querySelector('#mc-habit-modal-done').addEventListener('click', () => _closeHabitModal());
    _modalHost.querySelector('#mc-habit-modal').addEventListener('click', e => {
        if (e.target.id === 'mc-habit-modal') _closeHabitModal();
    });
    _modalHost.querySelector('#mc-habit-add-btn').addEventListener('click', () => _addHabit());
    _modalHost.querySelector('#mc-habit-new-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') _addHabit();
    });
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

function _loadAll() {
    _loadGoalsForCharts();
    _loadStatsNow();
    _loadAgentsNow();
    _loadXPStatus();
    _loadDailyPlan();
    _loadHabitStats();
}

async function _loadXPStatus() {
    try {
        const scope = _selectedScope || 'default';
        const resp = await fetch(`/api/plugin/mission-control/xp/status?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (!resp.ok) {
            console.warn('[MC] XP status response not ok:', resp.status);
            return;
        }
        _xpData = await resp.json();
        console.log('[MC] XP data loaded:', _xpData);
        if (_xpData.error) console.warn('[MC] XP server error:', _xpData.error);
        _renderXPBar();
    } catch (e) {
        console.error('[MC] XP load failed:', e);
    }
}

function _renderXPBar() {
    if (!_xpData) return;
    const lvl = _xpData.level || 0;
    const total = _xpData.total_xp || 0;
    const nextLvl = _xpData.next_level_xp || 100;
    const progress = _xpData.progress || 0;

    const levelEl = document.getElementById('mc-xp-level');
    if (levelEl) levelEl.textContent = lvl;
    const fill = document.getElementById('mc-xp-fill');
    if (fill) fill.style.width = Math.round(progress * 100) + '%';
    const text = document.getElementById('mc-xp-text');
    if (text) text.innerHTML = `<strong>${total}</strong> / ${nextLvl} XP`;
}

async function _loadDailyPlan() {
    try {
        const scope = _selectedScope || 'default';
        const today = new Date().toISOString().substring(0, 10);
        const resp = await fetch(`/api/plugin/mission-control/daily-plan?scope=${encodeURIComponent(scope)}&date=${today}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        _dailyPlan = data.plan;
        _renderDailyPlanUI();
    } catch (e) {
        console.error('[MC] Daily plan load failed:', e);
    }
}

function _renderDailyPlanUI() {
    const banner = document.getElementById('mc-daily-banner');
    const planSection = document.getElementById('mc-todays-plan');

    if (!_dailyPlan) {
        // No plan yet — show the "Start Your Day" banner
        if (banner) banner.style.display = '';
        if (planSection) planSection.style.display = 'none';
        return;
    }

    if (banner) banner.style.display = 'none';
    if (planSection) planSection.style.display = '';

    let goalIds = [];
    try { goalIds = JSON.parse(_dailyPlan.goal_ids || '[]'); } catch { goalIds = []; }

    const goals = _goalsCache.filter(g => goalIds.includes(g.id));
    const completed = goals.filter(g => g.status === 'completed').length;
    setText('mc-plan-progress', `${completed}/${goals.length}`);

    const list = document.getElementById('mc-plan-goals');
    if (!list) return;

    if (goals.length === 0) {
        list.innerHTML = '<div class="mc-empty-sm">No goals in today\'s plan</div>';
        return;
    }

    const xpMap = { high: 50, medium: 30, low: 15 };
    list.innerHTML = goals.map(g => {
        const done = g.status === 'completed';
        const pri = { high: '\u{1F534}', medium: '\u{1F7E0}', low: '\u{1F7E2}' }[g.priority] || '\u{26AA}';
        const xp = xpMap[g.priority] || 30;
        return `
        <div class="mc-plan-goal-item ${done ? 'mc-plan-done' : ''}">
            <span class="mc-plan-check">${done ? '\u{2705}' : '\u{2B1C}'}</span>
            <span class="mc-plan-goal-pri">${pri}</span>
            <span class="mc-plan-goal-name">${esc(g.title)}</span>
            ${done ? `<span class="mc-plan-xp">+${xp} XP</span>` : ''}
        </div>`;
    }).join('');
}

async function _loadHabitStats() {
    try {
        const scope = _selectedScope || 'default';
        const resp = await fetch(`/api/plugin/mission-control/habits/stats?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        _habitStats = data.habits || [];
        _renderHabits();
    } catch (e) {
        console.error('[MC] Habits load failed:', e);
    }
}

function _renderHabits() {
    const section = document.getElementById('mc-habits-quick');
    const grid = document.getElementById('mc-habit-grid');
    if (!section || !grid) return;

    if (_habitStats.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    grid.innerHTML = _habitStats.map(h => {
        const done = h.completed_today;
        const streak = h.streak || 0;
        // Build mini heatmap for last 7 days
        const dates = h.completion_dates || [];
        const today = new Date();
        let heatmapHTML = '';
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const ds = d.toISOString().substring(0, 10);
            const filled = dates.includes(ds);
            heatmapHTML += `<div class="mc-habit-day${filled ? ' mc-habit-day-done' : ''}" title="${ds}"></div>`;
        }
        return `
        <div class="mc-habit-row" data-habit-id="${h.id}">
            <button class="mc-habit-check${done ? ' mc-habit-done' : ''}" data-habit-id="${h.id}">${done ? '\u{2714}' : ''}</button>
            <div class="mc-habit-info">
                <div class="mc-habit-name">${esc(h.icon || '\u{2705}')} ${esc(h.name)}</div>
                ${streak > 0 ? `<div class="mc-habit-streak">\u{1F525} ${streak} day streak</div>` : ''}
            </div>
            <div class="mc-habit-heatmap">${heatmapHTML}</div>
        </div>`;
    }).join('');

    // Bind toggle clicks
    grid.querySelectorAll('.mc-habit-check').forEach(btn => {
        btn.addEventListener('click', () => _toggleHabit(parseInt(btn.dataset.habitId)));
    });
}

async function _toggleHabit(habitId) {
    try {
        const scope = _selectedScope || 'default';
        const resp = await fetch('/api/plugin/mission-control/habits/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ id: habitId, scope })
        });
        const data = await resp.json();
        if (data.success) {
            if (data.completed) {
                showXPGain(15, 'Habit check-in');
                // Award XP server-side
                fetch('/api/plugin/mission-control/xp/award', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ action: 'habit_checkin', amount: 15, scope })
                });
            }
            _loadHabitStats();
            _loadXPStatus();
        }
    } catch (e) {
        console.error('[MC] Habit toggle failed:', e);
    }
}

// ─── Daily Planning Modal ────────────────────────────────────────────────────

function _openDailyPlanner() {
    const modal = document.getElementById('mc-daily-modal');
    if (!modal) return;

    // Populate goal list from active user goals
    const active = _goalsCache.filter(g => g.status === 'active');
    let selectedIds = [];
    if (_dailyPlan) {
        try { selectedIds = JSON.parse(_dailyPlan.goal_ids || '[]'); } catch {}
    }

    const list = document.getElementById('mc-daily-goal-list');
    if (list) {
        if (active.length === 0) {
            list.innerHTML = '<div class="mc-empty-sm">No active goals. Create goals in the Goals tab first.</div>';
        } else {
            list.innerHTML = active.map(g => {
                const sel = selectedIds.includes(g.id);
                const pri = { high: '\u{1F534}', medium: '\u{1F7E0}', low: '\u{1F7E2}' }[g.priority] || '\u{26AA}';
                return `
                <div class="mc-daily-goal-pick${sel ? ' mc-daily-selected' : ''}" data-goal-id="${g.id}">
                    <span>${sel ? '\u{2705}' : '\u{2B1C}'}</span>
                    <span>${pri}</span>
                    <span style="flex:1;color:#ccc;font-size:0.88rem">${esc(g.title)}</span>
                    <span style="font-size:0.7rem;color:var(--mc-text-muted)">${esc(g.priority)}</span>
                </div>`;
            }).join('');

            list.querySelectorAll('.mc-daily-goal-pick').forEach(el => {
                el.addEventListener('click', () => {
                    el.classList.toggle('mc-daily-selected');
                    const check = el.querySelector('span:first-child');
                    if (check) check.textContent = el.classList.contains('mc-daily-selected') ? '\u{2705}' : '\u{2B1C}';
                });
            });
        }
    }

    modal.style.display = '';
}

function _closeDailyModal() {
    const modal = document.getElementById('mc-daily-modal');
    if (modal) modal.style.display = 'none';
}

async function _addQuickTask() {
    const input = document.getElementById('mc-daily-add-input');
    const title = (input?.value || '').trim();
    if (!title) return;

    const scope = _selectedScope || 'default';
    try {
        const resp = await fetch('/api/plugin/mission-control/user-goals/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ title, priority: 'medium', scope })
        });
        const data = await resp.json();
        if (data.id) {
            // Add to goals cache and insert into the planner list as selected
            const newGoal = { id: data.id, title, priority: 'medium', status: 'active' };
            _goalsCache.push(newGoal);
            const list = document.getElementById('mc-daily-goal-list');
            if (list) {
                const empty = list.querySelector('.mc-empty-sm');
                if (empty) empty.remove();
                const row = document.createElement('div');
                row.className = 'mc-daily-goal-pick mc-daily-selected';
                row.dataset.goalId = data.id;
                row.innerHTML = `
                    <span>\u{2705}</span>
                    <span>\u{1F7E0}</span>
                    <span style="flex:1;color:#ccc;font-size:0.88rem">${esc(title)}</span>
                    <span style="font-size:0.7rem;color:var(--mc-text-muted)">medium</span>`;
                row.addEventListener('click', () => {
                    row.classList.toggle('mc-daily-selected');
                    const check = row.querySelector('span:first-child');
                    if (check) check.textContent = row.classList.contains('mc-daily-selected') ? '\u{2705}' : '\u{2B1C}';
                });
                list.prepend(row);
            }
            input.value = '';
        }
    } catch (e) {
        console.error('[MC] Quick task add failed:', e);
    }
}

async function _saveDailyPlan() {
    const selected = [];
    document.querySelectorAll('#mc-daily-goal-list .mc-daily-selected').forEach(el => {
        selected.push(parseInt(el.dataset.goalId));
    });

    try {
        const scope = _selectedScope || 'default';
        const today = new Date().toISOString().substring(0, 10);
        const resp = await fetch('/api/plugin/mission-control/daily-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ date: today, goal_ids: selected, scope })
        });
        const data = await resp.json();
        if (data.success) {
            showToast(`Daily plan saved with ${selected.length} goals!`, 'success');
            _closeDailyModal();
            _loadDailyPlan();
        }
    } catch (e) {
        console.error('[MC] Save daily plan failed:', e);
        showToast('Failed to save plan', 'error');
    }
}

// ─── Habit Manager Modal ─────────────────────────────────────────────────────

function _openHabitManager() {
    const modal = document.getElementById('mc-habit-modal');
    if (!modal) return;
    _renderHabitManager();
    modal.style.display = '';
}

function _closeHabitModal() {
    const modal = document.getElementById('mc-habit-modal');
    if (modal) modal.style.display = 'none';
    _loadHabitStats();
}

function _renderHabitManager() {
    const list = document.getElementById('mc-habit-list');
    if (!list) return;

    if (_habitStats.length === 0) {
        list.innerHTML = '<div class="mc-empty-sm">No habits yet. Add your first one below!</div>';
        return;
    }

    list.innerHTML = _habitStats.map(h => `
        <div class="mc-habit-row" style="margin-bottom:6px">
            <span style="font-size:1.2rem">${esc(h.icon || '\u{2705}')}</span>
            <div class="mc-habit-info" style="flex:1">
                <div class="mc-habit-name">${esc(h.name)}</div>
                <div style="font-size:0.7rem;color:var(--mc-text-muted)">${esc(h.frequency)} \u{00B7} ${h.completion_rate}% rate</div>
            </div>
            <button class="mc-card-btn" data-habit-archive="${h.id}" title="Archive">\u{1F5D1}\u{FE0F}</button>
        </div>
    `).join('');

    list.querySelectorAll('[data-habit-archive]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.habitArchive);
            await fetch('/api/plugin/mission-control/habits/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ id, archived: 1 })
            });
            await _loadHabitStats();
            _renderHabitManager();
        });
    });
}

async function _addHabit() {
    const nameInput = document.getElementById('mc-habit-new-name');
    const iconInput = document.getElementById('mc-habit-new-icon');
    const name = nameInput?.value.trim();
    if (!name) return;
    const icon = iconInput?.value.trim() || '\u{2705}';
    const scope = _selectedScope || 'default';

    try {
        const resp = await fetch('/api/plugin/mission-control/habits/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ name, icon, scope })
        });
        const data = await resp.json();
        if (data.success) {
            if (nameInput) nameInput.value = '';
            if (iconInput) iconInput.value = '';
            showToast(`Habit "${name}" created!`, 'success');
            await _loadHabitStats();
            _renderHabitManager();
        }
    } catch (e) {
        console.error('[MC] Add habit failed:', e);
    }
}

// ─── Existing Data Loading ───────────────────────────────────────────────────

async function _loadGoalsForCharts() {
    try {
        const scope = _selectedScope || 'default';
        const resp = await fetch(`/api/plugin/mission-control/user-goals?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.status === 429) { setTimeout(_loadGoalsForCharts, 2000); return; }
        if (!resp.ok) return;
        const data = await resp.json();
        _goalsCache = data.goals || [];
        _renderCharts(_goalsCache);
        _updateImpact();
        _renderDailyPlanUI(); // Re-render with fresh goal data
    } catch (e) {
        console.error('[MC] Failed to load user goals:', e);
    }
}

function _loadStats() {
    clearTimeout(_loadStatsTimer);
    _loadStatsTimer = setTimeout(_loadStatsNow, 300);
}

async function _loadStatsNow() {
    try {
        if (!_memoryScopesLoaded) {
            _memoryScopesLoaded = true;
            _loadMemoryScopes();
        }

        const scope = _selectedScope || 'default';
        const memScopeParam = _selectedScope ? `&memory_scope=${encodeURIComponent(_selectedScope)}` : '';
        const resp = await fetch(`/api/plugin/mission-control/stats?scope=${encodeURIComponent(scope)}${memScopeParam}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.status === 429) { setTimeout(_loadStatsNow, 2000); return; }
        if (!resp.ok) return;
        const s = await resp.json();
        const total = s.goals_total || 0;
        const completed = s.goals_completed || 0;
        const active = s.goals_active || 0;
        const abandoned = s.goals_abandoned || 0;

        setText('mc-s-total', total);
        setText('mc-s-completed', completed);
        setText('mc-s-active', active);
        setText('mc-s-memories', s.memories_total || 0);
        setText('mc-s-agents', s.agents_running || 0);

        const running = s.agents_running || 0;
        const dot = document.querySelector('.mc-status-dot');
        const statusText = document.getElementById('mc-agent-status-text');
        if (dot) { dot.classList.remove('mc-dot-idle', 'mc-dot-active'); dot.classList.add(running > 0 ? 'mc-dot-active' : 'mc-dot-idle'); }
        if (statusText) statusText.textContent = running > 0 ? `${running} running` : 'Idle';

        _lastMemoriesToday = s.memories_today || 0;
        _lastMemoriesTotal = s.memories_total || 0;
        _lastAbandoned = abandoned;
        _updateImpact();
    } catch (e) {
        console.error('[MC] Failed to load stats:', e);
    }
}

async function _loadAgentsNow() {
    try {
        const resp = await fetch('/api/plugin/mission-control/agents', {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.status === 429) { setTimeout(_loadAgentsNow, 2000); return; }
        if (!resp.ok) return;
        const data = await resp.json();
        _renderAgents(data.agents || []);
    } catch (e) {
        console.error('[MC] Failed to load agents:', e);
    }
}

async function _loadMemoryScopes() {
    try {
        const resp = await fetch('/api/plugin/mission-control/memory/scopes', {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        const data = await resp.json();
        const scopes = data.scopes || [];
        const select = document.getElementById('mc-memory-scope');
        if (!select) return;

        const isFirstLoad = !_selectedScope;
        if (isFirstLoad) {
            // Use the scope already determined by main.js _initScope (from active persona)
            if (_mc && _mc.selectedScope) {
                _selectedScope = _mc.selectedScope;
            } else if (scopes.length > 0) {
                const largest = scopes.reduce((a, b) => b.count > a.count ? b : a, scopes[0]);
                _selectedScope = largest.name;
                if (_mc) _mc.selectedScope = _selectedScope;
            }
        }

        const current = _selectedScope || select.value;
        select.innerHTML = `<option value="">All (${data.total || 0})</option>`;
        for (const s of scopes) {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = `${s.name} (${s.count})`;
            if (s.name === current) opt.selected = true;
            select.appendChild(opt);
        }

        if (isFirstLoad && _selectedScope) {
            _loadGoalsForCharts();
            _loadStatsNow();
        }
    } catch (e) {
        console.error('[MC] Failed to load memory scopes:', e);
    }
}

function _populateScopeDropdown() {
    const list = document.getElementById('mc-mind-scope-list');
    const select = document.getElementById('mc-memory-scope');
    if (!list || !select) return;
    list.innerHTML = Array.from(select.options).map(opt =>
        `<div class="mc-mind-scope-item${opt.value === _selectedScope ? ' mc-mind-scope-active' : ''}" data-scope="${esc(opt.value)}">${esc(opt.textContent)}</div>`
    ).join('');
    list.querySelectorAll('.mc-mind-scope-item').forEach(item => {
        item.addEventListener('click', () => {
            _selectedScope = item.dataset.scope;
            if (_mc) _mc.selectedScope = _selectedScope;
            select.value = _selectedScope;
            select.dispatchEvent(new Event('change'));
            document.getElementById('mc-mind-scope-dropdown').style.display = 'none';
        });
    });
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function _updateImpact() {
    const doneToday = countCompletedToday(_goalsCache);
    const doneWeek = countCompletedThisWeek(_goalsCache);
    setText('mc-imp-done', doneToday);
    setText('mc-imp-week', doneWeek);
    setText('mc-imp-progress', countProgressNotes(_goalsCache));
    setText('mc-imp-memories', _lastMemoriesTotal);
    setText('mc-imp-abandoned', _lastAbandoned);
    setText('mc-impact-badge', `${doneToday + _lastMemoriesToday} actions today`);
}

function _renderCharts(goals) {
    const total = goals.length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const circ = 2 * Math.PI * 50;

    const ring = document.getElementById('mc-donut-completion-ring');
    const pctText = document.getElementById('mc-donut-pct');
    if (ring) ring.setAttribute('stroke-dasharray', `${(pct / 100) * circ} ${circ}`);
    if (pctText) pctText.textContent = pct + '%';

    const active = goals.filter(g => !g.parent_id && g.status === 'active');
    const priCount = { low: 0, medium: 0, high: 0 };
    active.forEach(g => { if (priCount[g.priority] !== undefined) priCount[g.priority]++; });
    const priTotal = active.length || 1;
    const lowArc = (priCount.low / priTotal) * circ;
    const medArc = (priCount.medium / priTotal) * circ;
    const highArc = (priCount.high / priTotal) * circ;

    const lowRing = document.getElementById('mc-pri-low');
    const medRing = document.getElementById('mc-pri-med');
    const highRing = document.getElementById('mc-pri-high');
    if (lowRing) { lowRing.setAttribute('stroke-dasharray', `${lowArc} ${circ - lowArc}`); lowRing.setAttribute('stroke-dashoffset', '0'); }
    if (medRing) { medRing.setAttribute('stroke-dasharray', `${medArc} ${circ - medArc}`); medRing.setAttribute('stroke-dashoffset', `${-lowArc}`); }
    if (highRing) { highRing.setAttribute('stroke-dasharray', `${highArc} ${circ - highArc}`); highRing.setAttribute('stroke-dashoffset', `${-(lowArc + medArc)}`); }
    setText('mc-pri-total', active.length);
}

function _renderAgents(agents) {
    const list = document.getElementById('mc-agents-list');
    const countEl = document.getElementById('mc-agents-count');
    if (!list) return;
    const running = agents.filter(a => a.status === 'running' || a.status === 'pending');
    if (countEl) countEl.textContent = running.length;
    if (agents.length === 0) { list.innerHTML = '<div class="mc-empty-sm">No agents running</div>'; return; }

    list.innerHTML = agents.map(a => {
        const icon = { running: '\u{1F7E2}', pending: '\u{1F7E1}', done: '\u{2705}', failed: '\u{274C}', cancelled: '\u{23F9}\u{FE0F}' }[a.status] || '\u{26AA}';
        const elapsed = a.elapsed ? `${Math.round(a.elapsed)}s` : '';
        return `
        <div class="mc-agent-row mc-astat-${a.status}">
            <span>${icon}</span>
            <span class="mc-agent-name">${esc(a.name || 'Agent')}</span>
            <span class="mc-agent-mission">${esc((a.mission || '').substring(0, 60))}</span>
            <span class="mc-agent-elapsed">${elapsed}</span>
        </div>`;
    }).join('');
}

// ─── SSE / Activity Feed ──────────────────────────────────────────────────────

const _TRACKED_EVENTS = [
    'agent_spawned', 'agent_completed', 'agent_dismissed',
    'tool_executing', 'tool_complete',
    'ai_typing_start', 'ai_typing_end',
    'message_added', 'chat_switched',
];

function _handleSSE(e) {
    const evt = e.detail;
    if (!evt || !_TRACKED_EVENTS.includes(evt.type)) return;
    _addActivity(evt);
    if (evt.type.startsWith('agent_')) _loadAgentsNow();
}

function _addActivity(evt) {
    const feed = document.getElementById('mc-activity-feed');
    if (!feed) return;
    const empty = feed.querySelector('.mc-empty-sm');
    if (empty) empty.remove();

    const icons = {
        agent_spawned: '\u{1F680}', agent_completed: '\u{2705}', agent_dismissed: '\u{1F44B}',
        tool_executing: '\u{1F527}', tool_complete: '\u{2705}',
        ai_typing_start: '\u{1F4AD}', ai_typing_end: '\u{2714}\u{FE0F}',
        message_added: '\u{1F4AC}', chat_switched: '\u{1F504}',
    };
    const labels = {
        agent_spawned: d => `Agent "${d.name || ''}" deployed`,
        agent_completed: d => `Agent "${d.name || ''}" finished`,
        agent_dismissed: d => `Agent "${d.name || ''}" dismissed`,
        tool_executing: d => `${d.name || 'tool'} running...`,
        tool_complete: d => `${d.name || 'tool'} ${d.error ? 'failed' : 'done'}`,
        ai_typing_start: () => 'AI thinking...',
        ai_typing_end: () => 'Response ready',
        message_added: () => 'New message',
        chat_switched: () => 'Chat switched',
    };

    const d = evt.data || {};
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const icon = icons[evt.type] || '\u{26AA}';
    const label = labels[evt.type] ? labels[evt.type](d) : evt.type;

    const item = document.createElement('div');
    item.className = 'mc-log-entry mc-log-new';
    item.innerHTML = `<span class="mc-log-icon">${icon}</span><span class="mc-log-text">${esc(label)}</span><span class="mc-log-time">${time}</span>`;
    feed.insertBefore(item, feed.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => item.classList.remove('mc-log-new')));
    while (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

// ─── Polling ──────────────────────────────────────────────────────────────────

function _startPolling() {
    _stopPolling();
    _refreshInterval = setInterval(() => {
        _loadStats();
        _loadAgentsNow();
    }, 30000);
}

function _stopPolling() {
    if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
    clearTimeout(_loadStatsTimer);
}
