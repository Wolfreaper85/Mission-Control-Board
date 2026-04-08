// tabs/focus.js — Focus Mode / Pomodoro Timer (Phase 6)
// Client-side timer with server sync on start/stop. XP integration.

import { CSRF } from '../lib/api.js';
import { esc, showToast, showXPGain } from '../lib/utils.js';

let _mc = null;
let _container = null;
let _timer = null;
let _sessionId = null;
let _isRunning = false;
let _isPaused = false;
let _mode = 'work';      // 'work' | 'break'
let _secondsLeft = 25 * 60;
let _totalSeconds = 25 * 60;
let _goalsCache = [];
let _linkedGoalId = null;
let _focusStats = null;

// Settings (configurable later)
const WORK_MINS = 25;
const SHORT_BREAK = 5;
const LONG_BREAK = 15;
const SESSIONS_BEFORE_LONG = 4;
let _completedSessions = 0;

let _refreshHandler = null;

export function init(el, mc) {
    _mc = mc;
    _container = el;
    el.innerHTML = _buildLayout();
    _bindEvents(el);
    _loadGoals();
    _loadFocusStats();
    if (_refreshHandler) mc.off('refresh-data', _refreshHandler);
    _refreshHandler = () => { _loadGoals(); _loadFocusStats(); };
    mc.on('refresh-data', _refreshHandler);
    return { destroy, refresh };
}

export function destroy() {
    if (_refreshHandler && _mc) { _mc.off('refresh-data', _refreshHandler); _refreshHandler = null; }
}

export function refresh() {
    _loadFocusStats();
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function _buildLayout() {
    return `
    <div class="mc-focus-wrap">
        <!-- Timer Circle -->
        <div class="mc-focus-timer" id="mc-focus-timer">
            <svg class="mc-focus-ring" viewBox="0 0 240 240">
                <circle class="mc-focus-ring-bg" cx="120" cy="120" r="108" />
                <circle class="mc-focus-ring-fill" cx="120" cy="120" r="108" id="mc-focus-ring-fill"
                    stroke-dasharray="0 679" />
            </svg>
            <div class="mc-focus-timer-inner">
                <div class="mc-focus-time" id="mc-focus-time">25:00</div>
                <div class="mc-focus-label" id="mc-focus-label">Focus</div>
            </div>
        </div>

        <!-- Controls -->
        <div class="mc-focus-controls" id="mc-focus-controls">
            <button class="mc-focus-btn" id="mc-focus-start-btn">\u{25B6} Start</button>
            <button class="mc-focus-btn mc-focus-btn-stop" id="mc-focus-stop-btn" style="display:none">\u{23F9} Stop</button>
            <button class="mc-focus-btn" id="mc-focus-pause-btn" style="display:none">\u{23F8} Pause</button>
            <button class="mc-focus-btn" id="mc-focus-skip-btn" style="display:none">Skip \u{23ED}</button>
        </div>

        <!-- Mode Selector -->
        <div class="mc-focus-modes">
            <button class="mc-focus-mode-btn mc-focus-mode-active" data-mode="work" data-mins="${WORK_MINS}">Focus ${WORK_MINS}m</button>
            <button class="mc-focus-mode-btn" data-mode="short" data-mins="${SHORT_BREAK}">Short ${SHORT_BREAK}m</button>
            <button class="mc-focus-mode-btn" data-mode="long" data-mins="${LONG_BREAK}">Long ${LONG_BREAK}m</button>
        </div>

        <!-- Goal Link -->
        <div class="mc-focus-link-section">
            <label class="mc-label">Link to Goal (optional)</label>
            <select class="mc-input mc-focus-goal-select" id="mc-focus-goal-select">
                <option value="">No goal linked</option>
            </select>
        </div>

        <!-- Session Counter -->
        <div class="mc-focus-session-counter" id="mc-focus-session-counter">
            <span class="mc-focus-session-dots" id="mc-focus-session-dots"></span>
            <span class="mc-focus-session-text" id="mc-focus-session-text">0 sessions today</span>
        </div>

        <!-- Stats Cards -->
        <div class="mc-focus-stats-row" id="mc-focus-stats-row">
            <div class="mc-focus-stat-card">
                <div class="mc-focus-stat-icon">\u{1F4C5}</div>
                <div class="mc-focus-stat-num" id="mc-focus-today">0m</div>
                <div class="mc-focus-stat-label">Today</div>
            </div>
            <div class="mc-focus-stat-card">
                <div class="mc-focus-stat-icon">\u{1F4CA}</div>
                <div class="mc-focus-stat-num" id="mc-focus-week">0m</div>
                <div class="mc-focus-stat-label">This Week</div>
            </div>
            <div class="mc-focus-stat-card">
                <div class="mc-focus-stat-icon">\u{1F3C6}</div>
                <div class="mc-focus-stat-num" id="mc-focus-month">0m</div>
                <div class="mc-focus-stat-label">This Month</div>
            </div>
        </div>
    </div>`;
}

// ─── Events ───────────────────────────────────────────────────────────────────

function _bindEvents(el) {
    el.querySelector('#mc-focus-start-btn').addEventListener('click', () => _startTimer());
    el.querySelector('#mc-focus-stop-btn').addEventListener('click', () => _stopTimer());
    el.querySelector('#mc-focus-pause-btn').addEventListener('click', () => _pauseResumeTimer());
    el.querySelector('#mc-focus-skip-btn').addEventListener('click', () => _skipToNext());

    el.querySelectorAll('.mc-focus-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (_isRunning) return; // Don't change mode while running
            el.querySelectorAll('.mc-focus-mode-btn').forEach(b => b.classList.remove('mc-focus-mode-active'));
            btn.classList.add('mc-focus-mode-active');
            const mins = parseInt(btn.dataset.mins);
            _mode = btn.dataset.mode === 'work' ? 'work' : 'break';
            _secondsLeft = mins * 60;
            _totalSeconds = mins * 60;
            _updateDisplay();
        });
    });

    el.querySelector('#mc-focus-goal-select').addEventListener('change', e => {
        _linkedGoalId = e.target.value ? parseInt(e.target.value) : null;
    });
}

// ─── Timer Logic ──────────────────────────────────────────────────────────────

async function _startTimer() {
    if (_isRunning && !_isPaused) return;

    if (_isPaused) {
        _isPaused = false;
        _resumeTick();
        _updateButtons();
        return;
    }

    _isRunning = true;
    _isPaused = false;

    // Start server session for work mode
    if (_mode === 'work') {
        try {
            const scope = (_mc && _mc.selectedScope) || 'default';
            const resp = await fetch('/api/plugin/mission-control/focus/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ goal_id: _linkedGoalId, type: 'work', scope })
            });
            const data = await resp.json();
            if (data.success) _sessionId = data.id;
        } catch (e) {
            console.error('[MC] Focus start failed:', e);
        }
    }

    // Apply focus mode UI
    const timerEl = document.getElementById('mc-focus-timer');
    if (timerEl) {
        timerEl.classList.add(_mode === 'work' ? 'mc-focus-active' : 'mc-focus-break');
    }

    _updateButtons();
    _resumeTick();
}

function _resumeTick() {
    if (_timer) clearInterval(_timer);
    _timer = setInterval(() => {
        _secondsLeft--;
        _updateDisplay();
        if (_secondsLeft <= 0) {
            _onTimerComplete();
        }
    }, 1000);
}

function _pauseResumeTimer() {
    if (!_isRunning) return;
    if (_isPaused) {
        _isPaused = false;
        _resumeTick();
    } else {
        _isPaused = true;
        clearInterval(_timer);
        _timer = null;
    }
    _updateButtons();
}

async function _stopTimer() {
    clearInterval(_timer);
    _timer = null;
    _isRunning = false;
    _isPaused = false;

    // Stop server session
    if (_sessionId) {
        try {
            await fetch('/api/plugin/mission-control/focus/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ id: _sessionId })
            });
        } catch (e) {
            console.error('[MC] Focus stop failed:', e);
        }
        _sessionId = null;
    }

    // Reset UI
    const timerEl = document.getElementById('mc-focus-timer');
    if (timerEl) {
        timerEl.classList.remove('mc-focus-active', 'mc-focus-break');
    }

    _secondsLeft = _totalSeconds;
    _updateDisplay();
    _updateButtons();
    _loadFocusStats();
}

async function _onTimerComplete() {
    clearInterval(_timer);
    _timer = null;
    _isRunning = false;
    _isPaused = false;

    // Play completion chime
    _playChime();

    if (_mode === 'work') {
        _completedSessions++;

        // Stop server session
        if (_sessionId) {
            try {
                const resp = await fetch('/api/plugin/mission-control/focus/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: _sessionId })
                });
                const data = await resp.json();
                if (data.success && data.duration_minutes > 0) {
                    // Award XP: 30 per 25 minutes
                    const xp = Math.round(30 * (data.duration_minutes / 25));
                    if (xp > 0) {
                        const scope = (_mc && _mc.selectedScope) || 'default';
                        fetch('/api/plugin/mission-control/xp/award', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                            body: JSON.stringify({ action: 'focus_complete', amount: xp, scope })
                        });
                        showXPGain(xp, 'Focus session');
                    }
                }
            } catch (e) {
                console.error('[MC] Focus stop failed:', e);
            }
            _sessionId = null;
        }

        showToast(`Focus session complete! \u{1F389}`, 'success');

        // Auto-switch to break
        const isLongBreak = _completedSessions % SESSIONS_BEFORE_LONG === 0;
        _mode = 'break';
        _secondsLeft = (isLongBreak ? LONG_BREAK : SHORT_BREAK) * 60;
        _totalSeconds = _secondsLeft;
        _updateModeButtons(isLongBreak ? 'long' : 'short');
    } else {
        // Break complete — switch to work
        showToast('Break over! Time to focus \u{1F4AA}', 'info');
        _mode = 'work';
        _secondsLeft = WORK_MINS * 60;
        _totalSeconds = _secondsLeft;
        _updateModeButtons('work');
    }

    const timerEl = document.getElementById('mc-focus-timer');
    if (timerEl) timerEl.classList.remove('mc-focus-active', 'mc-focus-break');

    _updateDisplay();
    _updateButtons();
    _updateSessionDots();
    _loadFocusStats();
}

function _skipToNext() {
    if (!_isRunning) return;
    _secondsLeft = 1; // Will trigger completion on next tick
}

// ─── UI Updates ───────────────────────────────────────────────────────────────

function _updateDisplay() {
    const mins = Math.floor(_secondsLeft / 60);
    const secs = _secondsLeft % 60;
    const timeEl = document.getElementById('mc-focus-time');
    if (timeEl) timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const labelEl = document.getElementById('mc-focus-label');
    if (labelEl) {
        if (_mode === 'work') labelEl.textContent = _isRunning ? 'Focusing...' : 'Focus';
        else labelEl.textContent = _isRunning ? 'On Break...' : 'Break';
    }

    // Update ring progress
    const ring = document.getElementById('mc-focus-ring-fill');
    if (ring) {
        const circ = 2 * Math.PI * 108;
        const progress = 1 - (_secondsLeft / _totalSeconds);
        ring.setAttribute('stroke-dasharray', `${progress * circ} ${circ}`);
    }
}

function _updateButtons() {
    const startBtn = document.getElementById('mc-focus-start-btn');
    const stopBtn = document.getElementById('mc-focus-stop-btn');
    const pauseBtn = document.getElementById('mc-focus-pause-btn');
    const skipBtn = document.getElementById('mc-focus-skip-btn');

    if (_isRunning) {
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = '';
        if (pauseBtn) {
            pauseBtn.style.display = '';
            pauseBtn.innerHTML = _isPaused ? '\u{25B6} Resume' : '\u{23F8} Pause';
        }
        if (skipBtn) skipBtn.style.display = '';
    } else {
        if (startBtn) startBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (skipBtn) skipBtn.style.display = 'none';
    }
}

function _updateModeButtons(activeMode) {
    const el = _container;
    if (!el) return;
    el.querySelectorAll('.mc-focus-mode-btn').forEach(btn => {
        btn.classList.toggle('mc-focus-mode-active', btn.dataset.mode === activeMode);
    });
}

function _updateSessionDots() {
    const dots = document.getElementById('mc-focus-session-dots');
    const text = document.getElementById('mc-focus-session-text');
    if (dots) {
        let html = '';
        for (let i = 0; i < Math.min(_completedSessions, 8); i++) {
            html += '<span class="mc-focus-dot-done"></span>';
        }
        const remaining = SESSIONS_BEFORE_LONG - (_completedSessions % SESSIONS_BEFORE_LONG);
        for (let i = 0; i < remaining && (html.length / 46) + i < 8; i++) {
            html += '<span class="mc-focus-dot-pending"></span>';
        }
        dots.innerHTML = html;
    }
    if (text) text.textContent = `${_completedSessions} sessions today`;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

async function _loadGoals() {
    try {
        const scope = (_mc && _mc.selectedScope) || 'default';
        const resp = await fetch(`/api/plugin/mission-control/goals?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        _goalsCache = (data.goals || []).filter(g => g.status === 'active');
        const select = document.getElementById('mc-focus-goal-select');
        if (select) {
            select.innerHTML = '<option value="">No goal linked</option>' +
                _goalsCache.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
        }
    } catch (e) {
        console.error('[MC] Focus goals load failed:', e);
    }
}

async function _loadFocusStats() {
    try {
        const scope = (_mc && _mc.selectedScope) || 'default';
        const resp = await fetch(`/api/plugin/mission-control/focus/stats?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (!resp.ok) return;
        _focusStats = await resp.json();
        _renderFocusStats();

        // Check for active session
        if (_focusStats.active && !_isRunning) {
            // Resume active session display
            _sessionId = _focusStats.active.id;
        }
    } catch (e) {
        console.error('[MC] Focus stats load failed:', e);
    }
}

function _renderFocusStats() {
    if (!_focusStats) return;
    const fmt = mins => {
        if (mins < 60) return `${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };
    const todayEl = document.getElementById('mc-focus-today');
    const weekEl = document.getElementById('mc-focus-week');
    const monthEl = document.getElementById('mc-focus-month');
    if (todayEl) todayEl.textContent = fmt(_focusStats.today || 0);
    if (weekEl) weekEl.textContent = fmt(_focusStats.week || 0);
    if (monthEl) monthEl.textContent = fmt(_focusStats.month || 0);

    // Update session count from today's data
    const todaySessions = (_focusStats.sessions || []).filter(s => {
        return s.start_time && s.start_time.startsWith(new Date().toISOString().substring(0, 10));
    }).length;
    _completedSessions = todaySessions;
    _updateSessionDots();
}

// ─── Sound ────────────────────────────────────────────────────────────────────

function _playChime() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.15;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.6);
        });
    } catch (e) {
        console.warn('[MC] Chime failed:', e);
    }

    // Also browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(_mode === 'work' ? '\u{1F345} Focus Complete!' : '\u{2615} Break Over!', {
            body: _mode === 'work' ? 'Great work! Time for a break.' : 'Ready to focus again?',
            icon: '/plugin-web/mission-control/icon.png'
        });
    }
}
