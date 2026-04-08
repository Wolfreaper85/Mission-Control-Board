// tabs/goals.js — User Goals board + Notes + Schedule modal
// Manages user goal CRUD, scheduling, and notes.

import { CSRF } from '../lib/api.js';
import { esc, escHtml, to12h, showToast } from '../lib/utils.js';

let _mc = null;
let _container = null;
let _modalHost = null;
let _goalsCache = [];
let _goalSchedules = {};
let _notesCache = [];
let _schedGoalId = null;
let _schedGoalTitle = '';
let _loadGoalsTimer = null;
let _refreshHandler = null;
let _editingGoalId = null;

// ─── Tab Interface ────────────────────────────────────────────────────────────

export function init(container, mc) {
    _mc = mc;
    _container = container;
    container.innerHTML = _buildHTML();

    // Move modal overlays to document.body so position:fixed is not broken
    _modalHost = document.createElement('div');
    _modalHost.id = 'mc-goals-modals';
    ['mc-modal', 'mc-sched-modal', 'mc-note-modal'].forEach(id => {
        const el = container.querySelector('#' + id);
        if (el) _modalHost.appendChild(el);
    });
    document.body.appendChild(_modalHost);

    _bindEvents(container);
    _initDropZones();
    _loadGoalSchedules().then(() => _loadGoalsNow());
    _loadNotes();

    if (_refreshHandler) mc.off('refresh-data', _refreshHandler);
    mc.off('goal-auto-complete', _handleGoalAutoComplete);
    _refreshHandler = () => { _loadGoalsNow(); _loadNotes(); };
    mc.on('goal-auto-complete', _handleGoalAutoComplete);
    mc.on('refresh-data', _refreshHandler);

    return { destroy, refresh };
}

export function destroy() {
    clearTimeout(_loadGoalsTimer);
    if (_mc) {
        _mc.off('goal-auto-complete', _handleGoalAutoComplete);
        if (_refreshHandler) _mc.off('refresh-data', _refreshHandler);
        _refreshHandler = null;
    }
    if (_modalHost && _modalHost.parentNode) {
        _modalHost.parentNode.removeChild(_modalHost);
    }
    _modalHost = null;
}

export function refresh() {
    _loadGoalSchedules().then(() => _loadGoalsNow());
    _loadNotes();
}

// ─── Layout ───────────────────────────────────────────────────────────────────

function _buildHTML() {
    return `
        <!-- User Goals Board (Kanban) -->
        <div class="mc-board-section">
            <div class="mc-board-header">
                <h2 class="mc-section-title">\u{1F3AF} Your Goals</h2>
                <button class="mc-btn mc-btn-accent" id="mc-add-goal">\u{2795} New Goal</button>
            </div>
            <div class="mc-board" id="mc-goals-board">
                <div class="mc-column" data-status="permanent">
                    <div class="mc-column-head" style="border-bottom: 2px solid #9c27b0;"><span>\u{1F7E3}</span> Permanent <span class="mc-col-count" id="mc-count-permanent">0</span></div>
                    <div class="mc-column-cards" id="mc-col-permanent"></div>
                </div>
                <div class="mc-column" data-status="active">
                    <div class="mc-column-head" style="border-bottom: 2px solid #f44336;"><span>\u{1F534}</span> Active <span class="mc-col-count" id="mc-count-active">0</span></div>
                    <div class="mc-column-cards" id="mc-col-active"></div>
                </div>
                <div class="mc-column" data-status="completed">
                    <div class="mc-column-head" style="border-bottom: 2px solid #4caf50;"><span>\u{1F7E2}</span> Completed <span class="mc-col-count" id="mc-count-completed">0</span><button class="mc-clear-col-btn" id="mc-clear-completed" title="Clear completed">\u{1F5D1}\u{FE0F}</button></div>
                    <div class="mc-column-cards" id="mc-col-completed"></div>
                </div>
                <div class="mc-column" data-status="abandoned">
                    <div class="mc-column-head" style="border-bottom: 2px solid #666;"><span>\u{26AA}</span> Abandoned <span class="mc-col-count" id="mc-count-abandoned">0</span><button class="mc-clear-col-btn" id="mc-clear-abandoned" title="Clear abandoned">\u{1F5D1}\u{FE0F}</button></div>
                    <div class="mc-column-cards" id="mc-col-abandoned"></div>
                </div>
            </div>
        </div>

        <!-- Notes -->
        <div class="mc-notes-section" id="mc-notes-section">
            <div class="mc-board-header">
                <h2 class="mc-section-title">\u{1F4DD} Notes</h2>
                <div class="mc-notes-actions">
                    <input type="text" class="mc-input mc-notes-search" id="mc-notes-search" placeholder="Search notes...">
                    <button class="mc-btn mc-btn-sm" id="mc-note-new">\u{2795} New Note</button>
                    <button class="mc-clear-all-btn" id="mc-notes-clear" title="Delete all notes">\u{1F5D1}\u{FE0F} Clear All</button>
                </div>
            </div>
            <div class="mc-notes-grid" id="mc-notes-grid">
                <div class="mc-empty-sm">No notes yet</div>
            </div>
        </div>

        <!-- Goal Create/Edit Modal -->
        <div class="mc-modal-overlay" id="mc-modal" style="display:none">
            <div class="mc-modal">
                <div class="mc-modal-header">
                    <h3 id="mc-modal-title">New Goal</h3>
                    <button class="mc-modal-close" id="mc-modal-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body">
                    <label class="mc-label">Title</label>
                    <input type="text" class="mc-input" id="mc-goal-title" maxlength="200" placeholder="What's the goal?">
                    <label class="mc-label">Description / Instructions</label>
                    <textarea class="mc-input mc-textarea mc-textarea-lg" id="mc-goal-desc" maxlength="2000" placeholder="The brief — what should be done when this goal is executed..." rows="6"></textarea>
                    <label class="mc-label">Priority</label>
                    <select class="mc-input" id="mc-goal-priority">
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                        <option value="low">Low</option>
                    </select>
                    <label class="mc-label mc-checkbox-label"><input type="checkbox" id="mc-goal-permanent"> Permanent Goal <span style="color:var(--mc-text-secondary);font-size:0.8em">(stays active after completion)</span></label>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn" id="mc-modal-cancel">Cancel</button>
                    <button class="mc-btn mc-btn-accent" id="mc-modal-save">Create Goal</button>
                </div>
            </div>
        </div>

        <!-- Schedule Modal -->
        <div class="mc-modal-overlay" id="mc-sched-modal" style="display:none">
            <div class="mc-modal">
                <div class="mc-modal-header">
                    <h3>\u{23F0} Schedule Goal</h3>
                    <button class="mc-modal-close" id="mc-sched-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body">
                    <div class="mc-sched-goal-name" id="mc-sched-goal-name"></div>
                    <label class="mc-label">Frequency</label>
                    <select class="mc-input" id="mc-sched-freq">
                        <option value="once">Single Use (run once at time)</option>
                        <option value="daily">Daily</option>
                        <option value="weekdays">Weekdays (Mon-Fri)</option>
                        <option value="selectdays">On These Days</option>
                        <option value="hourly">Every X Hours</option>
                        <option value="minutes">Every X Minutes</option>
                        <option value="custom">Custom Cron</option>
                    </select>
                    <div id="mc-sched-days-row" class="mc-sched-row" style="display:none">
                        <div class="mc-day-picker">
                            <button type="button" class="mc-day-btn" data-day="0">Sun</button>
                            <button type="button" class="mc-day-btn mc-day-active" data-day="1">Mon</button>
                            <button type="button" class="mc-day-btn mc-day-active" data-day="2">Tue</button>
                            <button type="button" class="mc-day-btn mc-day-active" data-day="3">Wed</button>
                            <button type="button" class="mc-day-btn mc-day-active" data-day="4">Thu</button>
                            <button type="button" class="mc-day-btn mc-day-active" data-day="5">Fri</button>
                            <button type="button" class="mc-day-btn" data-day="6">Sat</button>
                        </div>
                    </div>
                    <div id="mc-sched-time-row" class="mc-sched-row">
                        <label class="mc-label">Time</label>
                        <input type="time" class="mc-input" id="mc-sched-time" value="09:00">
                    </div>
                    <div id="mc-sched-interval-row" class="mc-sched-row" style="display:none">
                        <label class="mc-label">Interval</label>
                        <input type="number" class="mc-input" id="mc-sched-interval" value="2" min="1" max="60" style="width:80px;display:inline-block">
                        <span id="mc-sched-interval-unit" style="color:#888;margin-left:6px">hours</span>
                    </div>
                    <div id="mc-sched-cron-row" class="mc-sched-row" style="display:none">
                        <label class="mc-label">Cron Expression (5-field)</label>
                        <input type="text" class="mc-input" id="mc-sched-cron" placeholder="0 9 * * *">
                    </div>
                    <label class="mc-label">Mode</label>
                    <select class="mc-input" id="mc-sched-mode">
                        <option value="background">Background (silent)</option>
                        <option value="default">Main Chat (default)</option>
                        <option value="mission_control">Mission Control Chat</option>
                    </select>
                    <label class="mc-label">Persona</label>
                    <select class="mc-input" id="mc-sched-persona"><option value="">Default</option></select>
                    <label class="mc-label">Tools</label>
                    <select class="mc-input" id="mc-sched-toolset">
                        <option value="all">All Tools</option>
                        <option value="none">No Tools</option>
                    </select>
                    <div class="mc-sched-preview" id="mc-sched-preview"></div>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn mc-btn-danger" id="mc-sched-remove" style="display:none;margin-right:auto">\u{1F5D1}\u{FE0F} Remove Schedule</button>
                    <button class="mc-btn" id="mc-sched-cancel">Cancel</button>
                    <button class="mc-btn mc-btn-accent" id="mc-sched-save">\u{23F0} Schedule</button>
                </div>
            </div>
        </div>

        <!-- Note Modal -->
        <div class="mc-modal-overlay" id="mc-note-modal" style="display:none">
            <div class="mc-modal">
                <div class="mc-modal-header">
                    <h3>\u{1F4DD} New Note</h3>
                    <button class="mc-modal-close" id="mc-note-modal-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body">
                    <label class="mc-label">Title</label>
                    <input class="mc-input" id="mc-note-title" placeholder="Note title..." maxlength="200">
                    <label class="mc-label">Content</label>
                    <textarea class="mc-input mc-textarea" id="mc-note-content" placeholder="Write your note here..." rows="6" maxlength="2000"></textarea>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn" id="mc-note-cancel">Cancel</button>
                    <button class="mc-btn mc-btn-accent" id="mc-note-save">\u{1F4BE} Save Note</button>
                </div>
            </div>
        </div>`;
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function _bindEvents(el) {
    // Goal modal
    el.querySelector('#mc-add-goal').addEventListener('click', () => _showGoalModal());
    el.querySelector('#mc-clear-completed').addEventListener('click', () => _clearColumn('completed'));
    el.querySelector('#mc-clear-abandoned').addEventListener('click', () => _clearColumn('abandoned'));
    _modalHost.querySelector('#mc-modal-close').addEventListener('click', () => _hideGoalModal());
    _modalHost.querySelector('#mc-modal-cancel').addEventListener('click', () => _hideGoalModal());
    _modalHost.querySelector('#mc-modal-save').addEventListener('click', () => _saveGoal());
    _modalHost.querySelector('#mc-modal').addEventListener('click', e => { if (e.target.id === 'mc-modal') _hideGoalModal(); });

    // Schedule modal
    _modalHost.querySelector('#mc-sched-close').addEventListener('click', () => _hideSchedModal());
    _modalHost.querySelector('#mc-sched-cancel').addEventListener('click', () => _hideSchedModal());
    _modalHost.querySelector('#mc-sched-save').addEventListener('click', () => _saveSchedule());
    _modalHost.querySelector('#mc-sched-remove').addEventListener('click', () => _removeSchedule());
    _modalHost.querySelector('#mc-sched-modal').addEventListener('click', e => { if (e.target.id === 'mc-sched-modal') _hideSchedModal(); });
    _modalHost.querySelector('#mc-sched-freq').addEventListener('change', () => _updateSchedUI());
    _modalHost.querySelector('#mc-sched-time').addEventListener('change', () => _updateSchedPreview());
    _modalHost.querySelector('#mc-sched-interval').addEventListener('input', () => _updateSchedPreview());
    _modalHost.querySelector('#mc-sched-cron').addEventListener('input', () => _updateSchedPreview());
    _modalHost.querySelector('#mc-sched-mode').addEventListener('change', () => _updateSchedPreview());
    _modalHost.querySelectorAll('.mc-day-btn').forEach(btn => {
        btn.addEventListener('click', () => { btn.classList.toggle('mc-day-active'); _updateSchedPreview(); });
    });

    // Note modal
    el.querySelector('#mc-note-new').addEventListener('click', () => {
        document.getElementById('mc-note-title').value = '';
        document.getElementById('mc-note-content').value = '';
        document.getElementById('mc-note-modal').style.display = 'flex';
    });
    _modalHost.querySelector('#mc-note-modal-close').addEventListener('click', () => { document.getElementById('mc-note-modal').style.display = 'none'; });
    _modalHost.querySelector('#mc-note-cancel').addEventListener('click', () => { document.getElementById('mc-note-modal').style.display = 'none'; });
    _modalHost.querySelector('#mc-note-save').addEventListener('click', () => _saveNote());

    // Notes search
    let _searchTimeout;
    el.querySelector('#mc-notes-search').addEventListener('input', e => {
        clearTimeout(_searchTimeout);
        _searchTimeout = setTimeout(() => _loadNotes(e.target.value.trim()), 300);
    });

    // Clear all notes
    el.querySelector('#mc-notes-clear').addEventListener('click', async () => {
        if (!_notesCache.length) return;
        if (!confirm(`Delete all ${_notesCache.length} note(s)?`)) return;
        try {
            await fetch('/api/plugin/mission-control/notes/clear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({})
            });
            _loadNotes();
        } catch (e) { console.error('[MC] Notes clear error:', e); }
    });
}

// ─── Goals Data ───────────────────────────────────────────────────────────────

function _loadGoals() {
    clearTimeout(_loadGoalsTimer);
    _loadGoalsTimer = setTimeout(_loadGoalsNow, 300);
}

async function _loadGoalsNow() {
    try {
        const scope = (_mc && _mc.selectedScope) || 'default';
        const resp = await fetch(`/api/plugin/mission-control/user-goals?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.status === 429) { setTimeout(_loadGoalsNow, 2000); return; }
        if (!resp.ok) return;
        const data = await resp.json();
        _goalsCache = data.goals || [];
        _renderGoals(_goalsCache);
    } catch (e) {
        console.error('[MC] Failed to load user goals:', e);
    }
}

async function _loadGoalSchedules() {
    try {
        const resp = await fetch('/api/continuity/tasks', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const data = await resp.json();
        _goalSchedules = {};
        for (const t of (data.tasks || [])) {
            if (t.source && t.source.startsWith('mc-goal:')) {
                const srcParts = t.source.replace('mc-goal:', '').split(':');
                const goalId = srcParts[0];
                const isSingleUse = srcParts[1] === 'once';
                if (isSingleUse && t.last_run) {
                    try { await fetch(`/api/continuity/tasks/${t.id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': CSRF() } }); } catch {}
                    continue;
                }
                _goalSchedules[goalId] = { taskId: t.id, schedule: t.schedule, enabled: t.enabled, name: t.name };
            }
        }
    } catch (e) { console.error('[MC] Failed to load schedules:', e); }
}

// ─── Goals Rendering ─────────────────────────────────────────────────────────

function _renderGoals(goals) {
    const permanent = goals.filter(g => g.permanent);
    const active = goals.filter(g => g.status === 'active' && !g.permanent);
    const completed = goals.filter(g => g.status === 'completed');
    const abandoned = goals.filter(g => g.status === 'abandoned');

    const columns = {
        permanent: { goals: permanent, el: document.getElementById('mc-col-permanent'), count: document.getElementById('mc-count-permanent') },
        active: { goals: active, el: document.getElementById('mc-col-active'), count: document.getElementById('mc-count-active') },
        completed: { goals: completed, el: document.getElementById('mc-col-completed'), count: document.getElementById('mc-count-completed') },
        abandoned: { goals: abandoned, el: document.getElementById('mc-col-abandoned'), count: document.getElementById('mc-count-abandoned') },
    };

    for (const [status, col] of Object.entries(columns)) {
        if (!col.el) continue;
        if (col.count) col.count.textContent = col.goals.length;
        if (col.goals.length === 0) {
            col.el.innerHTML = `<div class="mc-empty-sm">No ${status} goals</div>`;
        } else {
            col.el.innerHTML = col.goals.map(g => _renderGoalCard(g, status)).join('');
            _bindGoalActions(col.el, status);
        }
    }
}

function _renderGoalCard(g, colStatus) {
    const pri = { high: '\u{1F534}', medium: '\u{1F7E0}', low: '\u{1F7E2}' }[g.priority] || '\u{26AA}';
    const priClass = `mc-card-${g.priority}`;
    const sched = _goalSchedules[g.id];
    const isActive = colStatus === 'active' || colStatus === 'permanent';

    let timestampHtml = '';
    if (colStatus === 'completed' && g.completed_at) {
        const ts = new Date(g.completed_at);
        timestampHtml = `<div class="mc-card-timestamp">\u{2705} ${ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>`;
    } else if (g.created_at) {
        timestampHtml = `<div class="mc-card-timestamp">Created ${new Date(g.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>`;
    }

    const descHtml = g.description ? `<details class="mc-goal-brief"><summary class="mc-goal-brief-toggle">View Instructions</summary><div class="mc-goal-brief-content">${escHtml(g.description)}</div></details>` : '';

    let actions = '';
    if (isActive) {
        actions += `<button class="mc-card-btn mc-act-deploy" data-id="${g.id}" data-title="${esc(g.title)}" title="Send to agent">\u{1F680}</button>`;
        actions += `<button class="mc-card-btn mc-act-schedule${sched ? ' mc-scheduled' : ''}" data-id="${g.id}" data-title="${esc(g.title)}" title="${sched ? 'Edit Schedule' : 'Schedule'}">\u{23F0}</button>`;
        if (sched) actions += `<span class="mc-countdown" data-goal-id="${g.id}">${_getCountdown(sched.schedule)}</span>`;
        actions += `<button class="mc-card-btn mc-act-done" data-id="${g.id}" title="Complete">\u{2705}</button>`;
        actions += `<button class="mc-card-btn mc-act-edit" data-id="${g.id}" title="Edit">\u{270F}\u{FE0F}</button>`;
        actions += `<button class="mc-card-btn mc-act-perm${g.permanent ? ' mc-perm-active' : ''}" data-id="${g.id}" title="${g.permanent ? 'Remove Permanent' : 'Make Permanent'}">\u{1F4CC}</button>`;
        if (!g.permanent) actions += `<button class="mc-card-btn mc-act-abandon" data-id="${g.id}" title="Abandon">\u{26D4}</button>`;
    } else if (colStatus === 'completed' || colStatus === 'abandoned') {
        actions += `<button class="mc-card-btn mc-act-activate" data-id="${g.id}" title="Reactivate">\u{25B6}\u{FE0F}</button>`;
    }
    actions += `<button class="mc-card-btn mc-act-del" data-id="${g.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>`;

    return `
    <div class="mc-card ${priClass}" data-id="${g.id}" draggable="true">
        <div class="mc-card-top">
            <span>${pri}</span>
            <span class="mc-card-title">${esc(g.title)}</span>
        </div>
        ${descHtml}
        ${timestampHtml}
        <div class="mc-card-actions">${actions}</div>
    </div>`;
}

function _bindGoalActions(container) {
    container.querySelectorAll('.mc-act-deploy').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _deployGoal(btn.dataset.id, btn.dataset.title); }));
    container.querySelectorAll('.mc-act-schedule').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _showSchedModal(btn.dataset.id, btn.dataset.title); }));
    container.querySelectorAll('.mc-act-done').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _updateGoalStatus(btn.dataset.id, 'completed'); }));
    container.querySelectorAll('.mc-act-activate').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _updateGoalStatus(btn.dataset.id, 'active'); }));
    container.querySelectorAll('.mc-act-abandon').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _updateGoalStatus(btn.dataset.id, 'abandoned'); }));
    container.querySelectorAll('.mc-act-perm').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _togglePermanent(btn.dataset.id); }));
    container.querySelectorAll('.mc-act-edit').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _editGoal(btn.dataset.id); }));
    container.querySelectorAll('.mc-act-del').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); _deleteGoal(btn.dataset.id); }));

    // Drag-and-drop on cards
    container.querySelectorAll('.mc-card[draggable]').forEach(card => {
        card.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', card.dataset.id);
            card.classList.add('mc-dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('mc-dragging'));
    });
}

function _initDropZones() {
    document.querySelectorAll('.mc-column-cards').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('mc-drop-target'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('mc-drop-target'));
        zone.addEventListener('drop', async e => {
            e.preventDefault();
            zone.classList.remove('mc-drop-target');
            const goalId = e.dataTransfer.getData('text/plain');
            if (!goalId) return;

            const col = zone.closest('.mc-column');
            const targetStatus = col?.dataset?.status;
            if (!targetStatus) return;

            const goal = _goalsCache.find(g => g.id === parseInt(goalId));
            if (!goal) return;

            // Determine what to update based on target column
            const updates = { goal_id: parseInt(goalId) };
            if (targetStatus === 'permanent') {
                updates.permanent = 1;
                updates.status = 'active';
            } else {
                updates.permanent = 0;
                updates.status = targetStatus;
            }

            try {
                await fetch('/api/plugin/mission-control/user-goals/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify(updates)
                });
                _loadGoals();
                _mc?.emit('refresh-data');
            } catch (err) { console.error('[MC] Drop update failed:', err); }
        });
    });
}

// ─── Goal Actions ─────────────────────────────────────────────────────────────

function _deployGoal(goalId, goalTitle) {
    if (!_mc) return;
    const goal = _goalsCache.find(g => g.id === parseInt(goalId));
    const desc = goal?.description || '';

    _mc.emit('deploy-goal', { goalId: parseInt(goalId) });

    // Build a directive message with the full brief so the model knows what to do
    let msg = `Execute this goal:\nTitle: ${goalTitle}`;
    if (desc) msg += `\nInstructions: ${desc}`;
    msg += `\n\nFollow the instructions above. Do the work and respond with results.`;

    _mc.emit('send-message', { text: msg });
}

async function _updateGoalStatus(goalId, status) {
    try {
        const goal = _goalsCache.find(g => g.id === parseInt(goalId));
        const scope = (_mc && _mc.selectedScope) || 'default';
        const isPermanentComplete = status === 'completed' && goal?.permanent;

        const resp = await fetch('/api/plugin/mission-control/user-goals/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({
                goal_id: parseInt(goalId),
                status: isPermanentComplete ? 'active' : status,
                permanent_run: isPermanentComplete ? true : undefined,
                scope
            })
        });
        const data = await resp.json();

        if ((status === 'completed' || isPermanentComplete) && data.xp_awarded) {
            const label = isPermanentComplete ? 'Run completed!' : 'Goal completed!';
            showToast(`+${data.xp_awarded} XP \u2014 ${label}`, 'success');
            if (data.daily_bonus) {
                setTimeout(() => showToast(`\u{1F389} +${data.daily_bonus} XP \u2014 Daily plan complete!`, 'success', 5000), 800);
            }
        } else if (status === 'active' && data.xp_deducted) {
            showToast(`-${data.xp_deducted} XP \u2014 Goal reactivated`, 'info');
        }

        _loadGoals();
        _mc?.emit('refresh-data');
    } catch (e) { console.error('[MC] Update failed:', e); }
}

async function _togglePermanent(goalId) {
    const goal = _goalsCache.find(g => g.id === parseInt(goalId));
    if (!goal) return;
    const newVal = goal.permanent ? 0 : 1;
    try {
        await fetch('/api/plugin/mission-control/user-goals/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ goal_id: parseInt(goalId), permanent: newVal })
        });
        _loadGoals();
        _mc?.emit('refresh-data');
    } catch (e) { console.error('[MC] Toggle permanent failed:', e); }
}

async function _clearColumn(status) {
    const goals = _goalsCache.filter(g => g.status === status);
    if (!goals.length) return;
    if (!confirm(`Delete all ${goals.length} ${status} goal(s)?`)) return;
    try {
        for (const g of goals) {
            await fetch('/api/plugin/mission-control/user-goals/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ goal_id: g.id })
            });
        }
        _loadGoals();
        _mc?.emit('refresh-data');
    } catch (e) { console.error('[MC] Clear column failed:', e); }
}

async function _deleteGoal(goalId) {
    if (!confirm('Delete this goal?')) return;
    try {
        await fetch('/api/plugin/mission-control/user-goals/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ goal_id: parseInt(goalId) })
        });
        _loadGoals();
        _mc?.emit('refresh-data');
    } catch (e) { console.error('[MC] Delete failed:', e); }
}

function _editGoal(goalId) {
    const goal = _goalsCache.find(g => g.id === parseInt(goalId));
    if (!goal) return;
    _editingGoalId = parseInt(goalId);
    _showGoalModal(goal);
}

async function _handleGoalAutoComplete(e) {
    const goalId = e.detail?.goalId;
    if (!goalId || !_goalsCache.length) return;
    const goal = _goalsCache.find(g => g.id === goalId);
    if (!goal || goal.status !== 'active') return;
    await _updateGoalStatus(goalId, 'completed');
}

// ─── Goal Modal ───────────────────────────────────────────────────────────────

function _showGoalModal(existingGoal = null) {
    const m = document.getElementById('mc-modal'); if (m) m.style.display = 'flex';
    const modalTitle = document.getElementById('mc-modal-title');
    const saveBtn = document.getElementById('mc-modal-save');
    const t = document.getElementById('mc-goal-title');
    const d = document.getElementById('mc-goal-desc');
    const p = document.getElementById('mc-goal-priority');
    const perm = document.getElementById('mc-goal-permanent');

    if (existingGoal) {
        if (modalTitle) modalTitle.textContent = 'Edit Goal';
        if (saveBtn) saveBtn.textContent = 'Save Changes';
        if (t) { t.value = existingGoal.title || ''; t.focus(); }
        if (d) d.value = existingGoal.description || '';
        if (p) p.value = existingGoal.priority || 'medium';
        if (perm) perm.checked = !!existingGoal.permanent;
    } else {
        _editingGoalId = null;
        if (modalTitle) modalTitle.textContent = 'New Goal';
        if (saveBtn) saveBtn.textContent = 'Create Goal';
        if (t) { t.value = ''; t.focus(); }
        if (d) d.value = '';
        if (p) p.value = 'medium';
        if (perm) perm.checked = false;
    }
}

function _hideGoalModal() {
    const m = document.getElementById('mc-modal'); if (m) m.style.display = 'none';
    _editingGoalId = null;
}

async function _saveGoal() {
    const title = document.getElementById('mc-goal-title')?.value?.trim();
    if (!title) return;
    const description = document.getElementById('mc-goal-desc')?.value?.trim();
    const priority = document.getElementById('mc-goal-priority')?.value || 'medium';
    const permanent = document.getElementById('mc-goal-permanent')?.checked ? 1 : 0;
    const scope = (_mc && _mc.selectedScope) || 'default';

    try {
        if (_editingGoalId) {
            // Update existing
            await fetch('/api/plugin/mission-control/user-goals/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ goal_id: _editingGoalId, title, description, priority, permanent, scope })
            });
        } else {
            // Create new
            await fetch('/api/plugin/mission-control/user-goals/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ title, description, priority, permanent, scope })
            });
        }
        _hideGoalModal();
        _loadGoals();
        _mc?.emit('refresh-data');
    } catch (e) { console.error('[MC] Save failed:', e); }
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────

function _showSchedModal(goalId, goalTitle) {
    _schedGoalId = goalId;
    _schedGoalTitle = goalTitle;
    document.getElementById('mc-sched-modal').style.display = 'flex';
    document.getElementById('mc-sched-goal-name').textContent = goalTitle;
    document.getElementById('mc-sched-freq').value = 'daily';
    document.getElementById('mc-sched-time').value = '09:00';
    document.getElementById('mc-sched-interval').value = '2';
    document.getElementById('mc-sched-cron').value = '';
    document.getElementById('mc-sched-mode').value = 'background';
    document.getElementById('mc-sched-toolset').value = 'all';
    document.querySelectorAll('.mc-day-btn').forEach(btn => {
        const d = parseInt(btn.dataset.day);
        btn.classList.toggle('mc-day-active', d >= 1 && d <= 5);
    });

    const removeBtn = document.getElementById('mc-sched-remove');
    if (_goalSchedules[goalId]) {
        removeBtn.style.display = '';
        document.getElementById('mc-sched-save').textContent = '\u{23F0} Update';
        _loadExistingSchedule(goalId);
    } else {
        removeBtn.style.display = 'none';
        document.getElementById('mc-sched-save').textContent = '\u{23F0} Schedule';
    }
    _loadSchedPersonas();
    _updateSchedUI();
    _updateSchedPreview();
}

function _hideSchedModal() {
    document.getElementById('mc-sched-modal').style.display = 'none';
    _schedGoalId = null;
}

async function _loadExistingSchedule(goalId) {
    const sched = _goalSchedules[goalId];
    if (!sched) return;
    try {
        const resp = await fetch(`/api/continuity/tasks/${sched.taskId}`, { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const t = await resp.json();
        const cron = t.schedule || '0 9 * * *';
        const isSingleUse = t.source && t.source.endsWith(':once');
        const parts = cron.split(/\s+/);
        if (parts.length === 5) {
            const [min, hr, , , dow] = parts;
            if (isSingleUse) { document.getElementById('mc-sched-freq').value = 'once'; document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`; }
            else if (min.startsWith('*/')) { document.getElementById('mc-sched-freq').value = 'minutes'; document.getElementById('mc-sched-interval').value = min.replace('*/', ''); }
            else if (hr.startsWith('*/')) { document.getElementById('mc-sched-freq').value = 'hourly'; document.getElementById('mc-sched-interval').value = hr.replace('*/', ''); }
            else if (dow === '1-5') { document.getElementById('mc-sched-freq').value = 'weekdays'; document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`; }
            else if (dow !== '*' && dow.includes(',')) {
                document.getElementById('mc-sched-freq').value = 'selectdays';
                document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`;
                document.querySelectorAll('.mc-day-btn').forEach(btn => btn.classList.remove('mc-day-active'));
                dow.split(',').forEach(d => { const btn = document.querySelector(`.mc-day-btn[data-day="${d.trim()}"]`); if (btn) btn.classList.add('mc-day-active'); });
            }
            else if (dow === '*' && hr !== '*') { document.getElementById('mc-sched-freq').value = 'daily'; document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`; }
            else { document.getElementById('mc-sched-freq').value = 'custom'; document.getElementById('mc-sched-cron').value = cron; }
        }
        document.getElementById('mc-sched-mode').value = !t.chat_target ? 'background' : (t.chat_target === 'default' ? 'default' : 'mission_control');
        document.getElementById('mc-sched-toolset').value = t.toolset || 'all';
        if (t.persona) { for (const opt of document.getElementById('mc-sched-persona').options) { if (opt.value === t.persona) { opt.selected = true; break; } } }
        _updateSchedUI();
        _updateSchedPreview();
    } catch (e) { console.error('[MC] Failed to load schedule:', e); }
}

async function _loadSchedPersonas() {
    try {
        const resp = await fetch('/api/personas', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const data = await resp.json();
        const sel = document.getElementById('mc-sched-persona');
        const current = sel.value;
        sel.innerHTML = '<option value="">Default</option>';
        for (const p of (data.personas || data || [])) {
            const name = typeof p === 'string' ? p : p.name;
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            if (name === current) opt.selected = true;
            sel.appendChild(opt);
        }
    } catch (e) { console.error('[MC] Failed to load personas for schedule:', e); }
}

function _updateSchedUI() {
    const freq = document.getElementById('mc-sched-freq').value;
    document.getElementById('mc-sched-time-row').style.display = ['once', 'daily', 'weekdays', 'selectdays'].includes(freq) ? '' : 'none';
    document.getElementById('mc-sched-days-row').style.display = freq === 'selectdays' ? '' : 'none';
    document.getElementById('mc-sched-interval-row').style.display = ['hourly', 'minutes'].includes(freq) ? '' : 'none';
    document.getElementById('mc-sched-cron-row').style.display = freq === 'custom' ? '' : 'none';
    document.getElementById('mc-sched-interval-unit').textContent = freq === 'minutes' ? 'minutes' : 'hours';
    _updateSchedPreview();
}

function _buildCron() {
    const freq = document.getElementById('mc-sched-freq').value;
    const time = document.getElementById('mc-sched-time').value || '09:00';
    const [h, m] = time.split(':').map(Number);
    const interval = parseInt(document.getElementById('mc-sched-interval').value) || 2;
    switch (freq) {
        case 'once': case 'daily': return `${m} ${h} * * *`;
        case 'weekdays': return `${m} ${h} * * 1-5`;
        case 'selectdays': { const days = _getSelectedDays(); return `${m} ${h} * * ${days.length ? days.join(',') : '*'}`; }
        case 'hourly': return `0 */${interval} * * *`;
        case 'minutes': return `*/${interval} * * * *`;
        case 'custom': return document.getElementById('mc-sched-cron').value || '0 9 * * *';
        default: return '0 9 * * *';
    }
}

function _getSelectedDays() {
    const days = [];
    document.querySelectorAll('.mc-day-btn.mc-day-active').forEach(btn => days.push(parseInt(btn.dataset.day)));
    return days.sort();
}

function _updateSchedPreview() {
    const cron = _buildCron();
    const freq = document.getElementById('mc-sched-freq').value;
    const mode = document.getElementById('mc-sched-mode').value;
    const time = document.getElementById('mc-sched-time').value || '09:00';
    const interval = parseInt(document.getElementById('mc-sched-interval').value) || 2;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let desc = '';
    switch (freq) {
        case 'once': desc = `Once at ${time} (auto-removes after)`; break;
        case 'daily': desc = `Every day at ${time}`; break;
        case 'weekdays': desc = `Weekdays at ${time}`; break;
        case 'selectdays': { const days = _getSelectedDays().map(d => dayNames[d]); desc = days.length ? `${days.join(', ')} at ${time}` : 'No days selected'; break; }
        case 'hourly': desc = `Every ${interval} hour${interval > 1 ? 's' : ''}`; break;
        case 'minutes': desc = `Every ${interval} minute${interval > 1 ? 's' : ''}`; break;
        case 'custom': desc = `Cron: ${cron}`; break;
    }
    desc += mode === 'background' ? ' \u2022 Background' : mode === 'default' ? ' \u2022 Main Chat' : ' \u2022 MC Chat';
    const preview = document.getElementById('mc-sched-preview');
    if (preview) preview.textContent = desc;
}

async function _saveSchedule() {
    if (!_schedGoalId) return;
    const cron = _buildCron();
    const mode = document.getElementById('mc-sched-mode').value;
    const persona = document.getElementById('mc-sched-persona').value;
    const toolset = document.getElementById('mc-sched-toolset').value;
    const scope = (_mc && _mc.selectedScope) || 'default';
    const freq = document.getElementById('mc-sched-freq').value;
    const isSingleUse = freq === 'once';

    const taskData = {
        type: 'task', name: `\u{1F3AF} ${_schedGoalTitle}`, enabled: true, schedule: cron,
        initial_message: _schedGoalTitle, chat_target: mode === 'background' ? '' : mode,
        persona, toolset, tts_enabled: true, memory_scope: scope, knowledge_scope: scope,
        people_scope: scope, goal_scope: scope, source: `mc-goal:${_schedGoalId}${isSingleUse ? ':once' : ''}`,
        inject_datetime: true
    };

    try {
        const existingSched = _goalSchedules[_schedGoalId];
        if (existingSched) {
            await fetch(`/api/continuity/tasks/${existingSched.taskId}`, { method: 'DELETE', headers: { 'X-CSRF-Token': CSRF() } });
        }
        const resp = await fetch('/api/continuity/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify(taskData)
        });
        if (resp.ok) { await _loadGoalSchedules(); _loadGoals(); }
    } catch (e) { console.error('[MC] Failed to save schedule:', e); }
    _hideSchedModal();
}

async function _removeSchedule() {
    if (!_schedGoalId) return;
    const sched = _goalSchedules[_schedGoalId];
    if (!sched) return;
    try {
        await fetch(`/api/continuity/tasks/${sched.taskId}`, { method: 'DELETE', headers: { 'X-CSRF-Token': CSRF() } });
        delete _goalSchedules[_schedGoalId];
        _loadGoals();
    } catch (e) { console.error('[MC] Failed to remove schedule:', e); }
    _hideSchedModal();
}

// ─── Notes ────────────────────────────────────────────────────────────────────

function _loadNotes(search) {
    const url = search ? `/api/plugin/mission-control/notes?search=${encodeURIComponent(search)}` : '/api/plugin/mission-control/notes';
    fetch(url, { headers: { 'X-CSRF-Token': CSRF() } })
        .then(r => r.json())
        .then(data => { _notesCache = data.notes || []; _renderNotes(); })
        .catch(e => console.error('[MC] Notes load error:', e));
}

function _renderNotes() {
    const grid = document.getElementById('mc-notes-grid');
    if (!grid) return;
    if (!_notesCache.length) { grid.innerHTML = '<div class="mc-empty-sm">No notes yet \u2014 create one or ask the AI to take a note for you</div>'; return; }

    grid.innerHTML = _notesCache.map(n => {
        const d = new Date(n.created_at + 'Z');
        const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return `<div class="mc-note-card" data-id="${n.id}">
            <div class="mc-note-header">
                <span class="mc-note-title">${escHtml(n.title)}</span>
                <button class="mc-card-btn mc-note-del" data-id="${n.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>
            </div>
            <div class="mc-note-stamp">${dateStr} at ${timeStr}</div>
            <div class="mc-note-body">${escHtml(n.content)}</div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.mc-note-del').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm('Delete this note?')) return;
            try {
                await fetch('/api/plugin/mission-control/notes/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ note_id: parseInt(btn.dataset.id) })
                });
                _loadNotes();
            } catch (err) { console.error('[MC] Note delete error:', err); }
        });
    });
}

async function _saveNote() {
    const title = document.getElementById('mc-note-title').value.trim();
    const content = document.getElementById('mc-note-content').value.trim();
    if (!title || !content) { alert('Both title and content are required.'); return; }
    try {
        await fetch('/api/plugin/mission-control/notes/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ title, content })
        });
        document.getElementById('mc-note-modal').style.display = 'none';
        _loadNotes();
    } catch (e) { console.error('[MC] Note save error:', e); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _getCountdown(cronStr) {
    try {
        const next = _nextCronFire(cronStr);
        if (!next) return '';
        const diff = next - Date.now() + 30000;
        if (diff <= 0) return 'soon';
        const mins = Math.floor(diff / 60000);
        const hrs = Math.floor(mins / 60);
        const days = Math.floor(hrs / 24);
        if (days > 0) return `${days}d ${hrs % 24}h`;
        if (hrs > 0) return `${hrs}h ${mins % 60}m`;
        if (mins <= 1) return '<1m';
        return `${mins}m`;
    } catch { return ''; }
}

function _nextCronFire(cronStr) {
    const parts = cronStr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minF, hrF, , , dowF] = parts;
    const now = new Date();

    if (minF.startsWith('*/')) {
        const interval = parseInt(minF.replace('*/', ''));
        if (!interval) return null;
        const nextMin = Math.ceil((now.getMinutes() * 60 + now.getSeconds() + 1) / (interval * 60)) * interval;
        const next = new Date(now); next.setSeconds(0, 0); next.setMinutes(0); next.setMinutes(nextMin);
        return next.getTime();
    }

    if (hrF.startsWith('*/')) {
        const interval = parseInt(hrF.replace('*/', ''));
        if (!interval) return null;
        const min = parseInt(minF) || 0;
        for (let h = now.getHours(); h < now.getHours() + 24; h++) {
            if (h % interval !== 0) continue;
            const c = new Date(now); c.setSeconds(0, 0);
            if (h >= 24) { c.setDate(c.getDate() + 1); c.setHours(h - 24, min); }
            else c.setHours(h, min);
            if (c > now) return c.getTime();
        }
        return null;
    }

    const targetMin = parseInt(minF);
    const targetHr = parseInt(hrF);
    if (isNaN(targetMin) || isNaN(targetHr)) return null;

    for (let d = 0; d < 8; d++) {
        const c = new Date(now); c.setDate(c.getDate() + d); c.setHours(targetHr, targetMin, 0, 0);
        if (c <= now) continue;
        if (dowF !== '*') {
            const dow = c.getDay();
            const allowed = dowF.split(',').flatMap(p => {
                if (p.includes('-')) { const [a, b] = p.split('-').map(Number); const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
                return [parseInt(p)];
            });
            if (!allowed.includes(dow)) continue;
        }
        return c.getTime();
    }
    return null;
}
