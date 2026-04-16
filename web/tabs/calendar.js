// calendar.js — Schedule calendar (weekly), full calendar (monthly), event CRUD, reminders
// Extracted from legacy main.js lines 3122-3502, 5518-5968

import { CSRF } from '../lib/api.js';
import { esc, escHtml, to12h, fmtDate, showToast } from '../lib/utils.js';

let _mc = null;
let _container = null;
let _allScheduledTasks = [];
let _goalSchedules = {};
let _calendarYear = new Date().getFullYear();
let _calendarMonth = new Date().getMonth();
let _calendarEvents = [];
let _calendarTimeline = [];
let _editingEventId = null;
let _reminderTimer = null;
let _modalHost = null;
let _refreshHandler = null;

// ─── Public API ──────────────────────────────────────────────────────────────

export function init(el, mc) {
    _mc = mc;
    _container = el;
    el.innerHTML = _buildLayout();

    // Move modals out of tab content into body so position:fixed works
    // (CSS transform on .mc-tab-content creates a new containing block)
    _modalHost = document.createElement('div');
    _modalHost.id = 'mc-calendar-modals';
    ['mc-event-modal', 'mc-recurring-dialog'].forEach(id => {
        const modal = el.querySelector('#' + id);
        if (modal) _modalHost.appendChild(modal);
    });
    document.body.appendChild(_modalHost);

    _bindEvents(el);
    _loadAll();
    _startReminderPolling();
    if (_refreshHandler) mc.off('refresh-data', _refreshHandler);
    _refreshHandler = () => _loadAll();
    mc.on('refresh-data', _refreshHandler);
    return { destroy, refresh };
}

export function destroy() {
    if (_reminderTimer) { clearInterval(_reminderTimer); _reminderTimer = null; }
    if (_refreshHandler && _mc) { _mc.off('refresh-data', _refreshHandler); _refreshHandler = null; }
    if (_modalHost && _modalHost.parentNode) {
        _modalHost.parentNode.removeChild(_modalHost);
        _modalHost = null;
    }
    // Clean up planner + rollover overlays if open
    if (_plannerNoteTimer) { clearTimeout(_plannerNoteTimer); _plannerNoteTimer = null; }
    if (_plannerEl) { _plannerEl.remove(); _plannerEl = null; }
    const rollover = document.getElementById('mc-rollover-overlay');
    if (rollover) rollover.remove();
}

export function refresh() {
    _loadAll();
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function _buildLayout() {
    return `
    <div class="mc-calendar-tab">
        <!-- Full Calendar (Monthly) -->
        <div class="mc-fullcal-section" id="mc-fullcal-section">
            <div class="mc-board-header">
                <h2 class="mc-section-title">\u{1F4C6} Calendar</h2>
                <div class="mc-fullcal-controls">
                    <button class="mc-btn mc-btn-sm" id="mc-cal-prev">\u{276E}</button>
                    <span class="mc-fullcal-title" id="mc-cal-title"></span>
                    <button class="mc-btn mc-btn-sm" id="mc-cal-next">\u{276F}</button>
                    <button class="mc-btn mc-btn-sm mc-cal-today-btn" id="mc-cal-today-btn">Today</button>
                    <button class="mc-btn mc-btn-accent mc-btn-sm" id="mc-cal-add-event">\u{2795} Event</button>
                </div>
            </div>
            <div class="mc-fullcal-grid" id="mc-fullcal-grid"></div>
        </div>

        <!-- Split Panel: Today's Tasks + Next Up -->
        <div class="mc-cal-split" id="mc-cal-split">
            <!-- Left: Today's Tasks -->
            <div class="mc-cal-tasks-panel" id="mc-cal-tasks-panel">
                <div class="mc-cal-panel-header">
                    <span>\u{2705} Today's Tasks</span>
                    <span class="mc-cal-tasks-date" id="mc-cal-tasks-date"></span>
                </div>
                <div class="mc-cal-tasks-list" id="mc-cal-tasks-list"></div>
            </div>

            <!-- Right: Schedule & Next Up -->
            <div class="mc-cal-nextup-panel" id="mc-cal-nextup-panel">
                <div class="mc-calendar-section" id="mc-calendar-section">
                    <div class="mc-cal-panel-header">\u{1F4C5} Weekly Schedule</div>
                    <div class="mc-week-grid" id="mc-week-grid"></div>
                </div>
                <div class="mc-next-up" id="mc-next-up">
                    <div class="mc-next-up-header">\u{1F4CB} Next Up</div>
                    <div class="mc-next-up-list" id="mc-next-up-list"></div>
                </div>
            </div>
        </div>

        <!-- Event Modal -->
        <div class="mc-modal-overlay" id="mc-event-modal" style="display:none">
            <div class="mc-modal mc-event-modal-inner">
                <div class="mc-modal-header">
                    <h3 id="mc-event-modal-title">\u{1F4C6} New Event</h3>
                    <button class="mc-modal-close" id="mc-event-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body">
                    <label class="mc-label">Title</label>
                    <input type="text" class="mc-input" id="mc-event-title" maxlength="200" placeholder="Event title...">
                    <label class="mc-label">Description</label>
                    <textarea class="mc-input mc-textarea" id="mc-event-desc" maxlength="500" placeholder="Optional details..."></textarea>
                    <div class="mc-event-row">
                        <div class="mc-event-field">
                            <label class="mc-label">Start Date</label>
                            <input type="date" class="mc-input" id="mc-event-start">
                        </div>
                        <div class="mc-event-field">
                            <label class="mc-label">End Date</label>
                            <input type="date" class="mc-input" id="mc-event-end">
                        </div>
                    </div>
                    <div class="mc-event-row">
                        <div class="mc-event-field">
                            <label class="mc-label">Time</label>
                            <input type="time" class="mc-input" id="mc-event-time" value="09:00">
                        </div>
                        <div class="mc-event-field">
                            <label class="mc-label">\u{1F514} Reminder</label>
                            <select class="mc-input" id="mc-event-reminder">
                                <option value="">No reminder</option>
                                <option value="0">At time of event</option>
                                <option value="5">5 minutes before</option>
                                <option value="15">15 minutes before</option>
                                <option value="30">30 minutes before</option>
                                <option value="60">1 hour before</option>
                                <option value="1440">1 day before</option>
                            </select>
                        </div>
                    </div>
                    <div class="mc-event-row">
                        <div class="mc-event-field">
                            <label class="mc-label">\u{1F50A} Chimes</label>
                            <select class="mc-input" id="mc-event-chimes">
                                <option value="1">1 chime</option>
                                <option value="2">2 chimes</option>
                                <option value="3" selected>3 chimes</option>
                                <option value="5">5 chimes</option>
                                <option value="10">10 chimes</option>
                                <option value="-1">Repeat until dismissed</option>
                            </select>
                        </div>
                        <div class="mc-event-field">
                            <label class="mc-label">Color</label>
                            <div class="mc-event-colors" id="mc-event-colors">
                                <span class="mc-event-color-opt mc-event-color-sel" data-color="#4a9eff" style="background:#4a9eff" title="Blue"></span>
                                <span class="mc-event-color-opt" data-color="#f44336" style="background:#f44336" title="Red"></span>
                                <span class="mc-event-color-opt" data-color="#ff9800" style="background:#ff9800" title="Orange"></span>
                                <span class="mc-event-color-opt" data-color="#4caf50" style="background:#4caf50" title="Green"></span>
                                <span class="mc-event-color-opt" data-color="#9c27b0" style="background:#9c27b0" title="Purple"></span>
                                <span class="mc-event-color-opt" data-color="#e91e63" style="background:#e91e63" title="Pink"></span>
                                <span class="mc-event-color-opt" data-color="#00bcd4" style="background:#00bcd4" title="Cyan"></span>
                                <span class="mc-event-color-opt" data-color="#ffeb3b" style="background:#ffeb3b" title="Yellow"></span>
                            </div>
                        </div>
                    </div>
                    <div class="mc-event-row">
                        <div class="mc-event-field">
                            <label class="mc-label">Category</label>
                            <select class="mc-input" id="mc-event-category">
                                <option value="event">Event</option>
                                <option value="deadline">Deadline</option>
                                <option value="reminder">Reminder</option>
                                <option value="milestone">Milestone</option>
                            </select>
                        </div>
                        <div class="mc-event-field">
                            <label class="mc-label">\u{1F501} Repeat</label>
                            <select class="mc-input" id="mc-event-recurrence">
                                <option value="none">No repeat</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </div>
                    <!-- Recurrence Options (shown when repeat != none) -->
                    <div class="mc-recurrence-options" id="mc-recurrence-options" style="display:none">
                        <div class="mc-event-row">
                            <div class="mc-event-field">
                                <label class="mc-label">Every</label>
                                <div class="mc-recurrence-interval">
                                    <input type="number" class="mc-input" id="mc-recurrence-interval" min="1" max="99" value="1" style="width:60px">
                                    <span class="mc-recurrence-unit" id="mc-recurrence-unit">day(s)</span>
                                </div>
                            </div>
                            <div class="mc-event-field">
                                <label class="mc-label">Until</label>
                                <input type="date" class="mc-input" id="mc-recurrence-end" placeholder="No end date">
                            </div>
                        </div>
                        <div class="mc-recurrence-days" id="mc-recurrence-days" style="display:none">
                            <label class="mc-label">On days</label>
                            <div class="mc-day-picker" id="mc-day-picker">
                                <button type="button" class="mc-day-btn" data-day="0">Su</button>
                                <button type="button" class="mc-day-btn" data-day="1">Mo</button>
                                <button type="button" class="mc-day-btn" data-day="2">Tu</button>
                                <button type="button" class="mc-day-btn" data-day="3">We</button>
                                <button type="button" class="mc-day-btn" data-day="4">Th</button>
                                <button type="button" class="mc-day-btn" data-day="5">Fr</button>
                                <button type="button" class="mc-day-btn" data-day="6">Sa</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn mc-btn-danger" id="mc-event-delete" style="display:none;margin-right:auto">\u{1F5D1}\u{FE0F} Delete</button>
                    <button class="mc-btn" id="mc-event-cancel">Cancel</button>
                    <button class="mc-btn mc-btn-accent" id="mc-event-save">\u{1F4C6} Save Event</button>
                </div>
            </div>
        </div>
        <!-- Recurring Action Dialog -->
        <div class="mc-modal-overlay" id="mc-recurring-dialog" style="display:none">
            <div class="mc-modal mc-recurring-dialog-inner">
                <div class="mc-modal-header">
                    <h3 id="mc-recurring-dialog-title">\u{1F501} Recurring Event</h3>
                    <button class="mc-modal-close" id="mc-recurring-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body" style="text-align:center;padding:20px">
                    <p id="mc-recurring-dialog-msg" style="margin-bottom:16px;color:var(--mc-text-secondary,#8888aa)">This is a recurring event. What would you like to do?</p>
                    <div class="mc-recurring-actions">
                        <button class="mc-btn mc-btn-accent" id="mc-recurring-this">\u{1F4C5} This event only</button>
                        <button class="mc-btn mc-btn-accent" id="mc-recurring-future">\u{23ED}\u{FE0F} This & future events</button>
                        <button class="mc-btn" id="mc-recurring-cancel">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function _bindEvents(el) {
    // Calendar nav
    el.querySelector('#mc-cal-prev').addEventListener('click', () => { _calendarMonth--; if (_calendarMonth < 0) { _calendarMonth = 11; _calendarYear--; } _loadCalendarEvents(); });
    el.querySelector('#mc-cal-next').addEventListener('click', () => { _calendarMonth++; if (_calendarMonth > 11) { _calendarMonth = 0; _calendarYear++; } _loadCalendarEvents(); });
    el.querySelector('#mc-cal-today-btn').addEventListener('click', () => { const now = new Date(); _calendarYear = now.getFullYear(); _calendarMonth = now.getMonth(); _loadCalendarEvents(); });
    el.querySelector('#mc-cal-add-event').addEventListener('click', () => _showEventModal(null));

    // Event modal (in _modalHost, moved to body)
    const mh = _modalHost;
    mh.querySelector('#mc-event-close').addEventListener('click', _hideEventModal);
    mh.querySelector('#mc-event-cancel').addEventListener('click', _hideEventModal);
    mh.querySelector('#mc-event-save').addEventListener('click', _saveCalendarEvent);
    mh.querySelector('#mc-event-delete').addEventListener('click', _deleteCalendarEvent);
    mh.querySelector('#mc-event-modal').addEventListener('click', e => { if (e.target.id === 'mc-event-modal') _hideEventModal(); });

    // Color picker
    mh.querySelectorAll('.mc-event-color-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            mh.querySelectorAll('.mc-event-color-opt').forEach(o => o.classList.remove('mc-event-color-sel'));
            opt.classList.add('mc-event-color-sel');
        });
    });

    // Recurrence controls
    mh.querySelector('#mc-event-recurrence').addEventListener('change', _onRecurrenceChange);
    mh.querySelectorAll('.mc-day-btn').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('mc-day-selected'));
    });

    // Recurring action dialog
    mh.querySelector('#mc-recurring-close').addEventListener('click', _hideRecurringDialog);
    mh.querySelector('#mc-recurring-cancel').addEventListener('click', _hideRecurringDialog);
}

// ─── Data Loading ────────────────────────────────────────────────────────────

function _loadAll() {
    _loadGoalSchedules();
    _loadCalendarEvents();
}

async function _loadGoalSchedules() {
    try {
        const resp = await fetch('/api/continuity/tasks', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const data = await resp.json();
        _goalSchedules = {};
        _allScheduledTasks = [];
        for (const t of (data.tasks || [])) {
            if (t.enabled && t.schedule) {
                _allScheduledTasks.push({
                    name: t.name,
                    schedule: t.schedule,
                    source: t.source || '',
                    persona: t.persona || '',
                    chat_target: t.chat_target || '',
                    singleUse: !!(t.source && t.source.endsWith(':once'))
                });
            }

            if (t.source && t.source.startsWith('mc-goal:')) {
                const srcParts = t.source.replace('mc-goal:', '').split(':');
                const goalId = srcParts[0];
                const isSingleUse = srcParts[1] === 'once';

                if (isSingleUse && t.last_run) {
                    try {
                        await fetch(`/api/continuity/tasks/${t.id}`, {
                            method: 'DELETE',
                            headers: { 'X-CSRF-Token': CSRF() }
                        });
                    } catch { /* ignore */ }
                    continue;
                }

                _goalSchedules[goalId] = {
                    taskId: t.id,
                    schedule: t.schedule,
                    enabled: t.enabled,
                    name: t.name
                };
            }
        }
        _renderWeekGrid();
    } catch (e) { console.error('[MC] Failed to load schedules:', e); }
}

async function _loadCalendarEvents() {
    const y = _calendarYear;
    const m = _calendarMonth;
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const titleEl = document.getElementById('mc-cal-title');
    if (titleEl) {
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        titleEl.textContent = `${monthNames[m]} ${y}`;
    }

    try {
        const scope = (_mc && _mc.selectedScope) || 'default';
        const resp = await fetch(`/api/plugin/mission-control/calendar/events?scope=${encodeURIComponent(scope)}&start=${start}&end=${end}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (!resp.ok) { _renderFullCalendar(); return; }
        const data = await resp.json();
        _calendarEvents = data.events || [];
        _calendarTimeline = data.timeline || [];
        _renderFullCalendar();
        _checkRollover();
    } catch (e) {
        console.error('[MC] Calendar load error:', e);
        _renderFullCalendar();
    }
}

// ─── Weekly Schedule Grid ────────────────────────────────────────────────────

function _cronMatchesDay(cron, dayOfWeek) {
    const parts = cron.split(/\s+/);
    if (parts.length < 5) return false;
    const dow = parts[4];
    if (dow === '*') return true;
    if (dow.includes('-')) {
        const [start, end] = dow.split('-').map(Number);
        return dayOfWeek >= start && dayOfWeek <= end;
    }
    if (dow.includes(',')) {
        return dow.split(',').map(d => parseInt(d.trim())).includes(dayOfWeek);
    }
    return parseInt(dow) === dayOfWeek;
}

function _cronGetTime(cron) {
    const parts = cron.split(/\s+/);
    if (parts.length < 5) return null;
    const [min, hr] = parts;
    if (hr.includes('/')) return { display: `Every ${hr.replace('*/','')}h`, sort: 0 };
    if (min.includes('/')) return { display: `Every ${min.replace('*/','')}m`, sort: 0 };
    const h = parseInt(hr);
    const m = parseInt(min);
    if (isNaN(h) || isNaN(m)) return null;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { display: `${h12}:${String(m).padStart(2,'0')} ${ampm}`, sort: h * 60 + m };
}

function _taskColor(name) {
    const colors = ['#f44336','#e91e63','#9c27b0','#673ab7','#3f51b5','#2196f3','#00bcd4','#009688','#4caf50','#ff9800','#ff5722','#795548'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return colors[Math.abs(hash) % colors.length];
}

function _renderWeekGrid() {
    const grid = document.getElementById('mc-week-grid');
    const nextUpList = document.getElementById('mc-next-up-list');
    if (!grid || !nextUpList) return;

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();

    let html = '';
    for (let d = 0; d < 7; d++) {
        const isToday = d === today;
        html += `<div class="mc-cal-day${isToday ? ' mc-cal-today' : ''}">`;
        html += `<div class="mc-cal-day-label">${dayLabels[d]}</div>`;

        const dayTasks = [];
        for (const t of _allScheduledTasks) {
            if (t.singleUse && d !== today) continue;
            if (_cronMatchesDay(t.schedule, d)) {
                const time = _cronGetTime(t.schedule);
                if (time) {
                    const label = t.singleUse ? '\u{26A1} ' + t.name : t.name;
                    dayTasks.push({ name: label, time: time.display, sort: time.sort, color: _taskColor(t.name) });
                }
            }
        }
        dayTasks.sort((a, b) => a.sort - b.sort);

        for (const task of dayTasks) {
            const cleanName = task.name.replace(/[\u{1F3AF}\u{1F4CB}]/gu, '').trim();
            html += `<div class="mc-cal-task" style="border-left: 3px solid ${task.color}">
                <div class="mc-cal-task-name">${cleanName}</div>
                <div class="mc-cal-task-time">${task.time}</div>
            </div>`;
        }
        if (!dayTasks.length) {
            html += `<div class="mc-cal-empty">\u2014</div>`;
        }
        html += '</div>';
    }
    grid.innerHTML = html;

    // Build "Next Up" list
    const now = new Date();
    const upcoming = [];
    for (const t of _allScheduledTasks) {
        const nextFire = _nextCronFire(t.schedule);
        if (nextFire) {
            const diff = nextFire - now;
            if (diff > 0) {
                let timeStr = '';
                const mins = Math.floor(diff / 60000);
                if (mins < 60) timeStr = `in ${mins}m`;
                else if (mins < 1440) timeStr = `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
                else timeStr = `in ${Math.floor(mins / 1440)}d`;
                upcoming.push({ name: t.name, timeStr, diff, color: _taskColor(t.name) });
            }
        }
    }
    upcoming.sort((a, b) => a.diff - b.diff);

    if (upcoming.length) {
        nextUpList.innerHTML = upcoming.slice(0, 8).map(u => {
            const cleanName = u.name.replace(/[\u{1F3AF}\u{1F4CB}]/gu, '').trim();
            return `<div class="mc-next-item">
                <span class="mc-next-dot" style="background:${u.color}"></span>
                <span class="mc-next-name">${cleanName}</span>
                <span class="mc-next-time">${u.timeStr}</span>
            </div>`;
        }).join('');
    } else {
        nextUpList.innerHTML = '<div class="mc-cal-empty" style="padding:8px;color:#555">No upcoming tasks</div>';
    }
}

// ─── Full Calendar (Monthly) ─────────────────────────────────────────────────

function _renderFullCalendar() {
    const grid = document.getElementById('mc-fullcal-grid');
    if (!grid) return;

    const y = _calendarYear;
    const m = _calendarMonth;
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const allEvents = [
        ..._calendarEvents.map(e => ({ ...e, _source: 'custom' })),
        ..._calendarTimeline,
    ];

    const byDate = {};
    for (const ev of allEvents) {
        const d = (ev.start_date || '').substring(0, 10);
        if (!d) continue;
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(ev);
    }

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = '<div class="mc-fullcal-header-row">';
    for (const dl of dayLabels) html += `<div class="mc-fullcal-day-header">${dl}</div>`;
    html += '</div><div class="mc-fullcal-body">';

    for (let i = 0; i < firstDay; i++) html += '<div class="mc-fullcal-cell mc-fullcal-empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = dateStr === todayStr;
        const dayEvents = byDate[dateStr] || [];

        html += `<div class="mc-fullcal-cell${isToday ? ' mc-fullcal-today' : ''}" data-date="${dateStr}">`;
        html += `<div class="mc-fullcal-date${isToday ? ' mc-fullcal-date-today' : ''}">${d}</div>`;

        const visible = dayEvents.slice(0, 3);
        const extra = dayEvents.length - 3;

        for (const ev of visible) {
            const color = ev.color || '#4a9eff';
            const clickAttr = ev.id != null ? `data-event-id="${ev.id}"` : '';
            const catIcon = _calCatIcon(ev.category || ev._source || 'event');
            const isDraggable = ev._source === 'custom' && ev.id && !ev._recurring;
            const dragAttr = isDraggable ? `draggable="true" data-drag-id="${ev.id}"` : '';
            html += `<div class="mc-fullcal-event${isDraggable ? ' mc-fullcal-draggable' : ''}" style="border-left:3px solid ${color};background:${color}15" ${clickAttr} ${dragAttr}>`;
            const hasReminder = ev.reminder_minutes != null && ev._source === 'custom';
            const isRecurring = ev._recurring || ev.recurrence;
            html += `<span class="mc-fullcal-event-icon">${catIcon}</span>`;
            html += `<span class="mc-fullcal-event-title">${esc(ev.title)}</span>`;
            if (isRecurring) html += `<span class="mc-fullcal-event-bell" title="Recurring">\u{1F501}</span>`;
            if (hasReminder) html += `<span class="mc-fullcal-event-bell">\u{1F514}</span>`;
            html += '</div>';
        }
        if (extra > 0) html += `<div class="mc-fullcal-more" data-date="${dateStr}">+${extra} more</div>`;
        html += '</div>';
    }

    const totalCells = firstDay + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i++) html += '<div class="mc-fullcal-cell mc-fullcal-empty"></div>';

    html += '</div>';
    grid.innerHTML = html;

    // Merge recurring events into allEvents for click handling
    const clickableEvents = allEvents;

    grid.querySelectorAll('.mc-fullcal-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', (e) => {
            _showDailyPlanner(cell.dataset.date);
        });
    });

    // ── Drag & Drop for calendar events ──
    let _wasDragging = false;
    grid.querySelectorAll('.mc-fullcal-event[data-drag-id]').forEach(chip => {
        chip.addEventListener('dragstart', (e) => {
            _wasDragging = true;
            e.stopPropagation();
            const eid = chip.dataset.dragId;
            e.dataTransfer.setData('text/plain', eid);
            e.dataTransfer.effectAllowed = 'move';
            chip.classList.add('mc-fullcal-dragging');
            // Store which date it came from
            const cell = chip.closest('.mc-fullcal-cell');
            if (cell) e.dataTransfer.setData('application/x-source-date', cell.dataset.date);
        });
        chip.addEventListener('dragend', () => {
            chip.classList.remove('mc-fullcal-dragging');
            grid.querySelectorAll('.mc-fullcal-drop-target').forEach(c => c.classList.remove('mc-fullcal-drop-target'));
            // Reset drag flag after a short delay so the click handler can check it
            setTimeout(() => { _wasDragging = false; }, 100);
        });
        // Clicking an event chip opens the planner for that day (unless we just dragged)
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            if (_wasDragging) return;
            const cell = chip.closest('.mc-fullcal-cell[data-date]');
            if (cell) _showDailyPlanner(cell.dataset.date);
        });
    });

    grid.querySelectorAll('.mc-fullcal-cell[data-date]').forEach(cell => {
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('mc-fullcal-drop-target');
        });
        cell.addEventListener('dragleave', () => {
            cell.classList.remove('mc-fullcal-drop-target');
        });
        cell.addEventListener('drop', async (e) => {
            e.preventDefault();
            cell.classList.remove('mc-fullcal-drop-target');
            const eid = parseInt(e.dataTransfer.getData('text/plain'));
            const sourceDate = e.dataTransfer.getData('application/x-source-date');
            const targetDate = cell.dataset.date;
            if (!eid || !targetDate || sourceDate === targetDate) return;

            // Update event date via API
            const scope = (_mc && _mc.selectedScope) || 'default';
            try {
                const resp = await fetch('/api/plugin/mission-control/calendar/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: eid, start_date: targetDate, end_date: targetDate, scope })
                });
                if (resp.ok) {
                    // Update local cache
                    const ev = _calendarEvents.find(x => x.id === eid);
                    if (ev) { ev.start_date = targetDate; ev.end_date = targetDate; }
                    _renderFullCalendar();
                    showToast('Event moved', 'success');
                }
            } catch (err) { console.error('[MC] Drag-drop move failed:', err); }
        });
    });

    // Also render today's tasks panel
    _renderTodayTasks();
}

// ─── Today's Tasks Panel ────────────────────────────────────────────────────

function _renderTodayTasks() {
    const list = document.getElementById('mc-cal-tasks-list');
    const dateEl = document.getElementById('mc-cal-tasks-date');
    if (!list) return;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    // Combine calendar events + timeline for today
    const allEvts = [
        ..._calendarEvents.map(e => ({ ...e, _source: 'custom' })),
        ..._calendarTimeline,
    ].filter(ev => (ev.start_date || '').substring(0, 10) === todayStr);

    // Sort: timed events first (by time), then all-day
    allEvts.sort((a, b) => {
        if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
        if (a.start_time) return -1;
        if (b.start_time) return 1;
        return 0;
    });

    if (allEvts.length === 0) {
        list.innerHTML = '<div class="mc-empty-sm" style="padding:20px 0;text-align:center">No tasks for today</div>';
        return;
    }

    list.innerHTML = allEvts.map(ev => {
        const color = ev.color || '#4a9eff';
        const catIcon = _calCatIcon(ev.category || ev._source || 'event');
        const isDone = ev.status === 'completed';
        const time = ev.start_time ? `<span class="mc-today-task-time">${to12h(ev.start_time)}</span>` : '';
        const desc = ev.description ? `<div class="mc-today-task-desc">${escHtml((ev.description || '').substring(0, 100))}</div>` : '';
        const detail = ev.detail ? `<div class="mc-today-task-desc">${escHtml(ev.detail)}</div>` : '';

        // Determine type + real ID for actions
        const isCustom = ev._source === 'custom' && ev.id;
        const isGoal = ev._source === 'goal' && typeof ev.id === 'string' && ev.id.startsWith('goal-');
        const isNote = ev._source === 'note' && typeof ev.id === 'string' && ev.id.startsWith('note-');
        const canToggle = isCustom || isGoal;  // can check AND uncheck
        const canDelete = isCustom || isGoal || isNote;

        // Build data attributes for action binding
        let checkAttr = '';
        let delAttr = '';
        if (canToggle && isCustom) checkAttr = `data-today-toggle="event:${ev.id}" data-today-done="${isDone ? '1' : '0'}"`;
        else if (canToggle && isGoal) checkAttr = `data-today-toggle="goal:${ev.id.replace('goal-', '')}" data-today-done="${isDone ? '1' : '0'}"`;
        if (canDelete && isCustom) delAttr = `data-today-delete="event:${ev.id}"`;
        else if (canDelete && isGoal) delAttr = `data-today-delete="goal:${ev.id.replace('goal-', '')}"`;
        else if (canDelete && isNote) delAttr = `data-today-delete="note:${ev.id.replace('note-', '')}"`;

        return `<div class="mc-today-task${isDone ? ' mc-today-task-done' : ''}" style="border-left:3px solid ${color}">
            <div class="mc-today-task-check" ${checkAttr}>${isDone ? '\u2705' : (canToggle ? '\u2B1C' : '\u26AA')}</div>
            <div class="mc-today-task-body">
                <div class="mc-today-task-top">
                    <span>${catIcon}</span>
                    <span class="mc-today-task-title">${esc(ev.title)}</span>
                    ${time}
                </div>
                ${detail || desc}
            </div>
            ${canDelete && !isDone ? `<button class="mc-today-task-del" ${delAttr} title="Delete">\u2715</button>` : ''}
        </div>`;
    }).join('');

    // ── Bind toggle clicks (check / uncheck for events + goals) ──
    list.querySelectorAll('[data-today-toggle]').forEach(check => {
        check.addEventListener('click', async (e) => {
            e.stopPropagation();
            const raw = check.dataset.todayToggle; // "event:5" or "goal:12"
            const [type, idStr] = raw.split(':');
            const id = parseInt(idStr);
            if (!id) return;

            const isDone = check.dataset.todayDone === '1';
            const newStatus = isDone ? 'active' : 'completed';
            const scope = (_mc && _mc.selectedScope) || 'default';

            try {
                if (type === 'event') {
                    const resp = await fetch('/api/plugin/mission-control/calendar/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({ id, status: newStatus, scope })
                    });
                    const data = await resp.json();
                    if (!isDone && data.xp_awarded) showToast(`+${data.xp_awarded} XP — Event completed!`, 'success');
                    if (isDone && data.xp_deducted) showToast(`-${data.xp_deducted} XP — Event unchecked`, 'info');
                    const ev = _calendarEvents.find(x => x.id === id);
                    if (ev) ev.status = newStatus;
                } else if (type === 'goal') {
                    const resp = await fetch('/api/plugin/mission-control/goals/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({ goal_id: id, status: newStatus, scope })
                    });
                    const data = await resp.json();
                    if (!isDone && data.xp_awarded) showToast(`+${data.xp_awarded} XP — Goal completed!`, 'success');
                    if (!isDone && data.daily_bonus) setTimeout(() => showToast(`\u{1F389} +${data.daily_bonus} XP — Daily plan complete!`, 'success', 5000), 800);
                    if (isDone && data.xp_deducted) showToast(`-${data.xp_deducted} XP — Goal unchecked`, 'info');
                    const tl = _calendarTimeline.find(x => x.id === `goal-${id}`);
                    if (tl) tl.status = newStatus;
                }
                _renderTodayTasks();
                _renderFullCalendar();
                _mc?.emit('refresh-data');
            } catch (err) { console.error('[MC] Toggle failed:', err); }
        });
    });

    // ── Bind delete clicks (events + goals + notes) ──
    list.querySelectorAll('[data-today-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const raw = btn.dataset.todayDelete; // "event:5", "goal:12", "note:3"
            const [type, idStr] = raw.split(':');
            const id = parseInt(idStr);
            if (!confirm('Delete this item?')) return;

            const scope = (_mc && _mc.selectedScope) || 'default';
            try {
                if (type === 'event') {
                    await fetch('/api/plugin/mission-control/calendar/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({ id })
                    });
                    _calendarEvents = _calendarEvents.filter(x => x.id !== id);
                } else if (type === 'goal') {
                    await fetch('/api/plugin/mission-control/goals/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({ goal_id: id, scope })
                    });
                    _calendarTimeline = _calendarTimeline.filter(x => x.id !== `goal-${id}`);
                } else if (type === 'note') {
                    await fetch('/api/plugin/mission-control/notes/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({ id })
                    });
                    _calendarTimeline = _calendarTimeline.filter(x => x.id !== `note-${id}`);
                }
                _renderTodayTasks();
                _renderFullCalendar();
                showToast('Deleted', 'info');
                _mc?.emit('refresh-data');
            } catch (err) { console.error('[MC] Delete failed:', err); }
        });
    });

    // ── Click task row (not on check/delete) to open planner ──
    list.querySelectorAll('.mc-today-task').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('[data-today-toggle]') || e.target.closest('[data-today-delete]')) return;
            _showDailyPlanner(todayStr);
        });
    });
}

// ─── Task Rollover ──────────────────────────────────────────────────────────

function _checkRollover() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const scope = (_mc && _mc.selectedScope) || 'default';
    const storageKey = `mc-rollover-checked-${scope}`;

    // Only ask once per day per scope
    try {
        if (localStorage.getItem(storageKey) === todayStr) return;
    } catch {}

    // Look back up to 3 days for incomplete tasks
    const incompleteTasks = [];
    for (let dayOffset = 1; dayOffset <= 3; dayOffset++) {
        const d = new Date(now);
        d.setDate(d.getDate() - dayOffset);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        // Custom calendar events from that day that aren't completed
        for (const ev of _calendarEvents) {
            if ((ev.start_date || '').substring(0, 10) === dateStr && ev.status !== 'completed') {
                incompleteTasks.push({ type: 'event', id: ev.id, title: ev.title, date: dateStr, color: ev.color || '#4a9eff' });
            }
        }
        // Goals from timeline that aren't completed
        for (const ev of _calendarTimeline) {
            if (ev._source === 'goal' && (ev.start_date || '').substring(0, 10) === dateStr && ev.status !== 'completed') {
                const realId = parseInt((ev.id || '').replace('goal-', ''));
                if (realId) {
                    incompleteTasks.push({ type: 'goal', id: realId, title: ev.title, date: dateStr, color: ev.color || '#ff9800' });
                }
            }
        }
    }

    if (incompleteTasks.length === 0) {
        // Nothing to roll over — mark as done so we don't scan again today
        try { localStorage.setItem(storageKey, todayStr); } catch {}
        return;
    }

    // Show rollover popup — localStorage is set when user interacts (move or skip)
    _showRolloverPopup(incompleteTasks, todayStr, storageKey);
}

function _showRolloverPopup(tasks, todayStr, storageKey) {
    const popup = document.createElement('div');
    popup.className = 'mc-planner-overlay';
    popup.id = 'mc-rollover-overlay';

    const dateLabels = {};
    for (const t of tasks) {
        if (!dateLabels[t.date]) {
            const d = new Date(t.date + 'T12:00:00');
            dateLabels[t.date] = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        }
    }

    // Group by date
    const byDate = {};
    for (const t of tasks) {
        if (!byDate[t.date]) byDate[t.date] = [];
        byDate[t.date].push(t);
    }

    let listHtml = '';
    for (const [date, items] of Object.entries(byDate)) {
        listHtml += `<div class="mc-rollover-date-label">${dateLabels[date]}</div>`;
        listHtml += items.map((t, i) => {
            const icon = t.type === 'goal' ? '\u{1F3AF}' : '\u{1F4C6}';
            return `<label class="mc-rollover-item" style="border-left:3px solid ${t.color}">
                <input type="checkbox" class="mc-rollover-check" data-rollover-type="${t.type}" data-rollover-id="${t.id}" checked>
                <span>${icon} ${esc(t.title)}</span>
            </label>`;
        }).join('');
    }

    popup.innerHTML = `
    <div class="mc-planner-panel" style="max-width:480px">
        <div class="mc-planner-header">
            <h2 style="flex:1;text-align:center">\u{1F504} Unfinished Tasks</h2>
            <button class="mc-overlay-close" id="mc-rollover-close">\u{2715}</button>
        </div>
        <div class="mc-rollover-body">
            <p class="mc-rollover-msg">You have <strong>${tasks.length}</strong> unfinished task${tasks.length > 1 ? 's' : ''} from recent days. Move them to today?</p>
            <div class="mc-rollover-list">${listHtml}</div>
            <div class="mc-rollover-actions">
                <button class="mc-btn" id="mc-rollover-skip">Skip</button>
                <button class="mc-btn mc-btn-accent" id="mc-rollover-move">\u{27A1}\u{FE0F} Move Selected to Today</button>
            </div>
        </div>
    </div>`;

    document.body.appendChild(popup);

    // Close / Skip — mark as checked so it won't pop up again today
    const close = () => {
        try { if (storageKey) localStorage.setItem(storageKey, todayStr); } catch {}
        popup.remove();
    };
    popup.querySelector('#mc-rollover-close').addEventListener('click', close);
    popup.querySelector('#mc-rollover-skip').addEventListener('click', close);
    popup.addEventListener('click', e => { if (e.target === popup) close(); });

    // Move selected
    popup.querySelector('#mc-rollover-move').addEventListener('click', async () => {
        const checks = popup.querySelectorAll('.mc-rollover-check:checked');
        if (checks.length === 0) { close(); return; }

        const scope = (_mc && _mc.selectedScope) || 'default';
        let moved = 0;

        for (const check of checks) {
            const type = check.dataset.rolloverType;
            const id = parseInt(check.dataset.rolloverId);
            const label = check.closest('.mc-rollover-item')?.querySelector('span')?.textContent?.trim() || 'Task';
            try {
                if (type === 'event') {
                    // Move the calendar event's date to today
                    const resp = await fetch('/api/plugin/mission-control/calendar/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({ id, start_date: todayStr, end_date: todayStr })
                    });
                    if (resp.ok) moved++;
                    else console.warn('[MC] Rollover event update failed:', resp.status);
                } else if (type === 'goal') {
                    // Goals live by created_at — can't change that.
                    // Create a calendar event for today linked to the goal so it shows on the calendar.
                    const goalTitle = label.replace(/^\u{1F3AF}\s*/u, '');
                    const resp = await fetch('/api/plugin/mission-control/calendar/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({
                            title: goalTitle,
                            description: `Rolled over from goal #${id}`,
                            start_date: todayStr,
                            end_date: todayStr,
                            all_day: true,
                            category: 'goal',
                            color: check.closest('.mc-rollover-item')?.style.borderLeftColor || '#ff9800',
                            scope
                        })
                    });
                    if (resp.ok) moved++;
                    else console.warn('[MC] Rollover goal→event creation failed:', resp.status);
                }
            } catch (err) { console.error('[MC] Rollover failed for', type, id, err); }
        }

        close();
        if (moved > 0) {
            showToast(`${moved} task${moved > 1 ? 's' : ''} moved to today`, 'success');
            // Full reload from DB so calendar grid, today's tasks, and planner all update
            await _loadCalendarEvents();
            _renderTodayTasks();
        }
    });
}

function _calCatIcon(cat) {
    const icons = {
        'event': '\u{1F4C6}', 'deadline': '\u{23F0}', 'reminder': '\u{1F514}',
        'milestone': '\u{1F3C6}', 'goal': '\u{1F3AF}', 'completed': '\u{2705}',
        'goal_completed': '\u{2705}', 'note': '\u{1F4DD}',
    };
    return icons[cat] || '\u{1F4C6}';
}

// ─── Day Detail Popup ────────────────────────────────────────────────────────

function _showDayDetail(dateStr, allEvents, highlightId = null) {
    // Remove any existing popup
    document.getElementById('mc-day-detail-popup')?.remove();

    const dayEvents = allEvents.filter(ev => {
        const evDate = (ev.start_date || '').substring(0, 10);
        return evDate === dateStr;
    });

    if (dayEvents.length === 0) return;

    const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
    });

    const popup = document.createElement('div');
    popup.id = 'mc-day-detail-popup';
    popup.className = 'mc-day-detail-popup';
    popup.innerHTML = `
        <div class="mc-day-detail-inner">
            <div class="mc-day-detail-header">
                <h3>${esc(dateLabel)}</h3>
                <span style="font-size:0.78rem;color:var(--mc-text-muted,#888)">${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}</span>
                <button class="mc-overlay-close" id="mc-day-detail-close">\u{2715}</button>
            </div>
            <div class="mc-day-detail-list">
                ${dayEvents.map(ev => {
                    const color = ev.color || '#4a9eff';
                    const catIcon = _calCatIcon(ev.category || ev._source || 'event');
                    const time = ev.start_time ? `\u{1F552} ${ev.start_time}` : '';
                    const sourceLabel = { goal: 'Goal', goal_completed: 'Completed', note: 'Note', custom: '' };
                    const source = ev._source && ev._source !== 'custom' ? `<span class="mc-day-detail-source">${sourceLabel[ev._source] || esc(ev._source)}</span>` : '';
                    const isHighlighted = highlightId && String(ev.id) === highlightId;
                    const isCustom = ev._source === 'custom';
                    const detail = ev.detail ? `<div class="mc-day-detail-desc">${esc(ev.detail)}</div>` : '';
                    const desc = ev.description ? `<div class="mc-day-detail-desc">${esc(ev.description).substring(0, 150)}</div>` : '';
                    const priColors = { high: '#f44336', medium: '#ff9800', low: '#4caf50' };
                    const priBadge = ev.priority ? `<span style="font-size:0.65rem;padding:1px 6px;border-radius:4px;background:${priColors[ev.priority] || '#888'}22;color:${priColors[ev.priority] || '#888'}">${ev.priority}</span>` : '';
                    const metaParts = [time, ev._recurring ? '\u{1F501} Recurring' : '', ev.category && ev._source === 'custom' ? ev.category : ''].filter(Boolean).join(' \u{2022} ');
                    return `<div class="mc-day-detail-event${isHighlighted ? ' mc-day-detail-hl' : ''}" style="border-left:3px solid ${color}" ${isCustom ? `data-edit-id="${ev.id}"` : ''}>
                        <div class="mc-day-detail-event-top">
                            <span>${catIcon} ${esc(ev.title)}</span>
                            ${priBadge}
                            ${source}
                        </div>
                        ${detail}${desc}
                        ${metaParts ? `<div class="mc-day-detail-meta">${metaParts}</div>` : ''}
                        ${isCustom ? '<div class="mc-day-detail-edit">Click to edit</div>' : ''}
                    </div>`;
                }).join('')}
            </div>
            <div class="mc-day-detail-footer">
                <button class="mc-btn mc-btn-accent mc-btn-sm" id="mc-day-detail-add">+ New Event</button>
            </div>
        </div>`;

    document.body.appendChild(popup);

    // Close
    popup.querySelector('#mc-day-detail-close').addEventListener('click', () => popup.remove());
    popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });

    // Add new event for this day
    popup.querySelector('#mc-day-detail-add').addEventListener('click', () => {
        popup.remove();
        _showEventModal(null, dateStr);
    });

    // Edit custom events
    popup.querySelectorAll('[data-edit-id]').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            const eid = el.dataset.editId;
            const ev = allEvents.find(x => String(x.id) === eid) || _calendarEvents.find(x => x.id === parseInt(eid));
            if (ev) { popup.remove(); _showEventModal(ev); }
        });
    });
}

// ─── Daily Planner Overlay ───────────────────────────────────────────────────

let _plannerEl = null;
let _plannerDate = null;
let _plannerQuickTasks = [];
let _plannerNoteTimer = null;

function _showDailyPlanner(dateStr) {
    _plannerDate = dateStr;
    // Remove any existing planner (tracked reference + orphan safety)
    _plannerEl?.remove();
    document.getElementById('mc-planner-overlay')?.remove();

    const popup = document.createElement('div');
    popup.id = 'mc-planner-overlay';
    popup.className = 'mc-planner-overlay';
    _plannerEl = popup;

    popup.innerHTML = `
    <div class="mc-planner-panel">
        <div class="mc-planner-header">
            <button class="mc-btn mc-btn-sm" id="mc-planner-prev">\u{25C0}</button>
            <h2 id="mc-planner-date-title"></h2>
            <button class="mc-btn mc-btn-sm" id="mc-planner-next">\u{25B6}</button>
            <button class="mc-btn mc-btn-sm" id="mc-planner-add-event" title="Add event">\u{2795} Event</button>
            <button class="mc-overlay-close" id="mc-planner-close">\u{2715}</button>
        </div>
        <div class="mc-planner-tabs">
            <button class="mc-overlay-tab mc-overlay-tab-active" data-planner-tab="schedule">\u{1F552} Schedule</button>
            <button class="mc-overlay-tab" data-planner-tab="tasks">\u{2705} Tasks</button>
            <button class="mc-overlay-tab" data-planner-tab="notes">\u{1F4DD} Notes</button>
        </div>
        <div class="mc-planner-body">
            <div class="mc-planner-tab-content" id="mc-planner-schedule"></div>
            <div class="mc-planner-tab-content" id="mc-planner-tasks" style="display:none"></div>
            <div class="mc-planner-tab-content" id="mc-planner-notes" style="display:none"></div>
        </div>
    </div>`;

    document.body.appendChild(popup);

    // Tab switching
    popup.querySelectorAll('[data-planner-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            popup.querySelectorAll('[data-planner-tab]').forEach(b => b.classList.remove('mc-overlay-tab-active'));
            btn.classList.add('mc-overlay-tab-active');
            popup.querySelectorAll('.mc-planner-tab-content').forEach(c => c.style.display = 'none');
            const target = popup.querySelector('#mc-planner-' + btn.dataset.plannerTab);
            if (target) target.style.display = '';
        });
    });

    // Close
    popup.querySelector('#mc-planner-close').addEventListener('click', () => _closePlanner());
    popup.addEventListener('click', e => { if (e.target === popup) _closePlanner(); });

    // Day navigation
    popup.querySelector('#mc-planner-prev').addEventListener('click', () => _navigatePlanner(-1));
    popup.querySelector('#mc-planner-next').addEventListener('click', () => _navigatePlanner(1));

    // Add event
    popup.querySelector('#mc-planner-add-event').addEventListener('click', () => {
        _closePlanner();
        _showEventModal(null, _plannerDate);
    });

    _loadPlannerData();
}

function _closePlanner() {
    if (_plannerNoteTimer) { clearTimeout(_plannerNoteTimer); _plannerNoteTimer = null; }
    _plannerEl?.remove();
    _plannerEl = null;
}

function _navigatePlanner(delta) {
    const d = new Date(_plannerDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    _plannerDate = d.toISOString().substring(0, 10);
    _loadPlannerData();
}

function _formatPlannerDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
}

async function _loadPlannerData() {
    if (!_plannerEl) return;
    const titleEl = _plannerEl.querySelector('#mc-planner-date-title');
    if (titleEl) titleEl.textContent = _formatPlannerDate(_plannerDate);

    const scope = (_mc && _mc.selectedScope) || 'default';
    const h = { 'X-CSRF-Token': CSRF() };
    const base = '/api/plugin/mission-control';

    // Use already-loaded calendar data (same data the monthly grid uses)
    // This avoids a separate API call and ensures consistency
    const eventsData = {
        events: _calendarEvents,
        timeline: _calendarTimeline,
    };

    // Only fetch plan, notes, and goals (3 calls instead of 4)
    const [planData, noteData, goalsData] = await Promise.all([
        fetch(`${base}/daily-plan?scope=${encodeURIComponent(scope)}&date=${_plannerDate}`, { headers: h }).then(r => r.ok ? r.json() : { plan: null }).catch(() => ({ plan: null })),
        fetch(`${base}/daily-notes?scope=${encodeURIComponent(scope)}&date=${_plannerDate}`, { headers: h }).then(r => r.ok ? r.json() : { note: null }).catch(() => ({ note: null })),
        fetch(`${base}/goals?scope=${encodeURIComponent(scope)}`, { headers: h }).then(r => r.ok ? r.json() : { goals: [] }).catch(() => ({ goals: [] })),
    ]);

    _renderPlannerSchedule(eventsData);
    _renderPlannerTasks(planData, goalsData);
    _renderPlannerNotes(noteData);
}

// ── Schedule Tab ──

function _renderPlannerSchedule(data) {
    const el = _plannerEl?.querySelector('#mc-planner-schedule');
    if (!el) return;

    const allEvts = [
        ...(data.events || []).map(e => ({ ...e, _source: 'custom' })),
        ...(data.timeline || []),
    ].filter(ev => (ev.start_date || '').substring(0, 10) === _plannerDate);

    const withTime = allEvts.filter(e => e.start_time);
    const allDay = allEvts.filter(e => !e.start_time);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = _plannerDate === todayStr;
    const currentHour = now.getHours();

    let html = '';
    if (allDay.length > 0) {
        html += '<div class="mc-planner-allday"><span class="mc-planner-hour-label">All Day</span><div class="mc-planner-hour-events">';
        html += allDay.map(ev => _plannerEventChip(ev)).join('');
        html += '</div></div>';
    }

    html += '<div class="mc-planner-hours">';
    for (let h = 6; h <= 22; h++) {
        const ampm = h < 12 ? 'AM' : 'PM';
        const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const label = `${hr12}:00 ${ampm}`;
        const hourEvts = withTime.filter(ev => {
            const evHour = parseInt((ev.start_time || '').split(':')[0]);
            return evHour === h;
        });
        const isCurrent = isToday && h === currentHour;

        html += `<div class="mc-planner-hour-row${isCurrent ? ' mc-planner-hour-now' : ''}">`;
        html += `<span class="mc-planner-hour-label">${label}</span>`;
        html += '<div class="mc-planner-hour-events">';
        if (hourEvts.length > 0) {
            html += hourEvts.map(ev => _plannerEventChip(ev)).join('');
        }
        html += '</div></div>';
    }
    html += '</div>';

    if (allEvts.length === 0) {
        html = '<div class="mc-empty-sm" style="padding:40px 0;text-align:center">No events scheduled for this day</div>';
    }

    el.innerHTML = html;

    // Click event title to edit (custom only)
    el.querySelectorAll('[data-planner-edit]').forEach(chip => {
        chip.addEventListener('click', (e) => {
            // Don't open editor if clicking action buttons
            if (e.target.closest('[data-planner-delete]') || e.target.closest('[data-planner-complete]')) return;
            const eid = parseInt(chip.dataset.plannerEdit);
            const ev = _calendarEvents.find(x => x.id === eid);
            if (ev) { _closePlanner(); _showEventModal(ev); }
        });
    });

    // Toggle complete/uncomplete event (custom only)
    el.querySelectorAll('[data-planner-complete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const eid = parseInt(btn.dataset.plannerComplete);
            const wasDone = btn.dataset.plannerDone === '1';
            const newStatus = wasDone ? 'active' : 'completed';
            const scope = (_mc && _mc.selectedScope) || 'default';
            try {
                const resp = await fetch('/api/plugin/mission-control/calendar/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: eid, status: newStatus, scope })
                });
                const data = await resp.json();
                if (!wasDone && data.xp_awarded) showToast(`+${data.xp_awarded} XP — Event completed!`, 'success');
                if (wasDone && data.xp_deducted) showToast(`-${data.xp_deducted} XP — Event unchecked`, 'info');
                const ev = _calendarEvents.find(x => x.id === eid);
                if (ev) ev.status = newStatus;
                // Re-render planner schedule to reflect change
                _renderPlannerSchedule({ events: _calendarEvents, timeline: _calendarTimeline });
                _renderTodayTasks();
                _mc?.emit('refresh-data');
            } catch (err) { console.error('[MC] Event toggle failed:', err); }
        });
    });

    // Delete event (custom only)
    el.querySelectorAll('[data-planner-delete]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const eid = parseInt(btn.dataset.plannerDelete);
            if (!confirm('Delete this event?')) return;
            try {
                await fetch('/api/plugin/mission-control/calendar/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: eid })
                });
                // Remove from local cache and re-render
                _calendarEvents = _calendarEvents.filter(x => x.id !== eid);
                _renderPlannerSchedule({ events: _calendarEvents, timeline: _calendarTimeline });
                _renderFullCalendar();
                showToast('Event deleted', 'info');
            } catch (err) { console.error('[MC] Event delete failed:', err); }
        });
    });
}

function _plannerEventChip(ev) {
    const color = ev.color || '#4a9eff';
    const catIcon = _calCatIcon(ev.category || ev._source || 'event');
    const time = ev.start_time ? `<span class="mc-planner-evt-time">${ev.start_time}</span>` : '';
    const isCustom = ev._source === 'custom' && ev.id;
    const editAttr = isCustom ? `data-planner-edit="${ev.id}"` : '';
    const desc = ev.description ? `<div class="mc-planner-evt-desc">${esc(ev.description).substring(0, 80)}</div>` : '';
    const detail = ev.detail ? `<div class="mc-planner-evt-desc">${esc(ev.detail)}</div>` : '';

    // Action buttons: toggle complete + delete (for custom events)
    let actions = '';
    if (isCustom) {
        const isCompleted = ev.status === 'completed';
        actions = `<div class="mc-planner-evt-actions">
            <button class="mc-planner-evt-btn mc-planner-evt-complete${isCompleted ? ' mc-planner-evt-btn-done' : ''}" data-planner-complete="${ev.id}" data-planner-done="${isCompleted ? '1' : '0'}" title="${isCompleted ? 'Uncheck' : 'Mark done'}">${isCompleted ? '\u2705' : '\u2B1C'}</button>
            <button class="mc-planner-evt-btn mc-planner-evt-delete" data-planner-delete="${ev.id}" title="Delete event">\u2715</button>
        </div>`;
    }

    return `<div class="mc-planner-event${ev.status === 'completed' ? ' mc-planner-event-done' : ''}" style="border-left:3px solid ${color};background:${color}12" ${editAttr}>
        <div class="mc-planner-evt-top">${catIcon} <strong>${esc(ev.title)}</strong> ${time} ${actions}</div>
        ${detail || desc}
    </div>`;
}

// ── Tasks Tab ──

function _renderPlannerTasks(planData, goalsData) {
    const el = _plannerEl?.querySelector('#mc-planner-tasks');
    if (!el) return;

    const goals = goalsData.goals || [];
    let planGoalIds = [];
    if (planData.plan) {
        try { planGoalIds = JSON.parse(planData.plan.goal_ids || '[]'); } catch {}
    }
    const planGoals = goals.filter(g => planGoalIds.includes(g.id));

    // Load quick tasks from localStorage
    const scope = (_mc && _mc.selectedScope) || 'default';
    const storageKey = `mc-quicktasks-${_plannerDate}-${scope}`;
    try { _plannerQuickTasks = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { _plannerQuickTasks = []; }

    let html = '';

    // Daily plan goals
    html += '<div class="mc-planner-section-title">\u{1F3AF} Daily Plan Goals</div>';
    if (planGoals.length > 0) {
        html += planGoals.map(g => {
            const done = g.status === 'completed';
            const pri = { high: '\u{1F534}', medium: '\u{1F7E0}', low: '\u{1F7E2}' }[g.priority] || '\u{26AA}';
            return `<div class="mc-planner-task${done ? ' mc-planner-task-done' : ''}" data-goal-id="${g.id}">
                <span class="mc-planner-task-check">${done ? '\u{2705}' : '\u{2B1C}'}</span>
                <span>${pri}</span>
                <span class="mc-planner-task-text">${esc(g.title)}</span>
            </div>`;
        }).join('');
    } else {
        html += '<div class="mc-empty-sm">No daily plan for this date</div>';
    }

    // Quick tasks
    html += '<div class="mc-planner-section-title" style="margin-top:16px">\u{26A1} Quick Tasks</div>';
    html += `<div class="mc-planner-quickadd">
        <input class="mc-input" id="mc-planner-quickadd-input" type="text" placeholder="Add a quick task..." maxlength="200">
        <button class="mc-btn mc-btn-accent mc-btn-sm" id="mc-planner-quickadd-btn">+</button>
    </div>`;
    html += '<div id="mc-planner-quicktasks-list">';
    html += _renderQuickTasks();
    html += '</div>';

    el.innerHTML = html;

    // Goal checkbox clicks
    el.querySelectorAll('[data-goal-id]').forEach(row => {
        row.addEventListener('click', async () => {
            const gid = parseInt(row.dataset.goalId);
            const goal = goals.find(g => g.id === gid);
            if (!goal || goal.status === 'completed') return;
            try {
                const resp = await fetch('/api/plugin/mission-control/goals/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ goal_id: gid, status: 'completed', scope })
                });
                const data = await resp.json();
                if (data.xp_awarded) showToast(`+${data.xp_awarded} XP — Goal completed!`, 'success');
                if (data.daily_bonus) setTimeout(() => showToast(`\u{1F389} +${data.daily_bonus} XP — Daily plan complete!`, 'success', 5000), 800);
                row.classList.add('mc-planner-task-done');
                row.querySelector('.mc-planner-task-check').textContent = '\u{2705}';
                _mc?.emit('refresh-data');
            } catch (e) { console.error('[MC] Goal complete failed:', e); }
        });
    });

    // Quick task add
    const addBtn = el.querySelector('#mc-planner-quickadd-btn');
    const addInput = el.querySelector('#mc-planner-quickadd-input');
    const addTask = () => {
        const text = addInput?.value.trim();
        if (!text) return;
        _plannerQuickTasks.push({ text, done: false });
        _saveQuickTasks();
        addInput.value = '';
        el.querySelector('#mc-planner-quicktasks-list').innerHTML = _renderQuickTasks();
        _bindQuickTaskEvents(el);
    };
    addBtn?.addEventListener('click', addTask);
    addInput?.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
    _bindQuickTaskEvents(el);
}

function _renderQuickTasks() {
    if (_plannerQuickTasks.length === 0) return '<div class="mc-empty-sm">No quick tasks yet</div>';
    return _plannerQuickTasks.map((t, i) => `
        <div class="mc-planner-task${t.done ? ' mc-planner-task-done' : ''}" data-qt-idx="${i}">
            <span class="mc-planner-task-check">${t.done ? '\u{2705}' : '\u{2B1C}'}</span>
            <span class="mc-planner-task-text">${esc(t.text)}</span>
            <button class="mc-card-btn" data-qt-del="${i}" title="Remove">\u{2715}</button>
        </div>`).join('');
}

function _bindQuickTaskEvents(el) {
    el.querySelectorAll('[data-qt-idx]').forEach(row => {
        row.addEventListener('click', e => {
            if (e.target.closest('[data-qt-del]')) return;
            const idx = parseInt(row.dataset.qtIdx);
            _plannerQuickTasks[idx].done = !_plannerQuickTasks[idx].done;
            _saveQuickTasks();
            el.querySelector('#mc-planner-quicktasks-list').innerHTML = _renderQuickTasks();
            _bindQuickTaskEvents(el);
        });
    });
    el.querySelectorAll('[data-qt-del]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.qtDel);
            _plannerQuickTasks.splice(idx, 1);
            _saveQuickTasks();
            el.querySelector('#mc-planner-quicktasks-list').innerHTML = _renderQuickTasks();
            _bindQuickTaskEvents(el);
        });
    });
}

function _saveQuickTasks() {
    const scope = (_mc && _mc.selectedScope) || 'default';
    const key = `mc-quicktasks-${_plannerDate}-${scope}`;
    try { localStorage.setItem(key, JSON.stringify(_plannerQuickTasks)); } catch {}
}

// ── Notes Tab ──

function _renderPlannerNotes(noteData) {
    const el = _plannerEl?.querySelector('#mc-planner-notes');
    if (!el) return;

    const content = noteData.note?.content || '';
    const updatedAt = noteData.note?.updated_at || '';

    el.innerHTML = `
        <textarea class="mc-input mc-planner-notes-area" id="mc-planner-notes-textarea" placeholder="Write your notes for the day...">${esc(content)}</textarea>
        <div class="mc-planner-notes-footer">
            <span class="mc-planner-notes-status" id="mc-planner-notes-status">${updatedAt ? 'Last saved ' + fmtDate(updatedAt) : ''}</span>
            <button class="mc-btn mc-btn-sm" id="mc-planner-notes-save">\u{1F4BE} Save</button>
        </div>`;

    const textarea = el.querySelector('#mc-planner-notes-textarea');
    const statusEl = el.querySelector('#mc-planner-notes-status');
    const saveBtn = el.querySelector('#mc-planner-notes-save');

    const doSave = async () => {
        const scope = (_mc && _mc.selectedScope) || 'default';
        statusEl.textContent = 'Saving...';
        try {
            await fetch('/api/plugin/mission-control/daily-notes/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ date: _plannerDate, content: textarea.value, scope })
            });
            statusEl.textContent = '\u{2705} Saved';
        } catch { statusEl.textContent = '\u{274C} Save failed'; }
    };

    // Auto-save on typing (debounced 1.5s)
    textarea.addEventListener('input', () => {
        statusEl.textContent = 'Unsaved changes...';
        if (_plannerNoteTimer) clearTimeout(_plannerNoteTimer);
        _plannerNoteTimer = setTimeout(doSave, 1500);
    });
    saveBtn.addEventListener('click', () => {
        if (_plannerNoteTimer) clearTimeout(_plannerNoteTimer);
        doSave();
    });
}

// ─── Recurrence Helpers ──────────────────────────────────────────────────────

function _onRecurrenceChange() {
    const pattern = document.getElementById('mc-event-recurrence').value;
    const optionsEl = document.getElementById('mc-recurrence-options');
    const daysEl = document.getElementById('mc-recurrence-days');
    const unitEl = document.getElementById('mc-recurrence-unit');

    if (pattern === 'none') {
        optionsEl.style.display = 'none';
        return;
    }
    optionsEl.style.display = '';
    daysEl.style.display = pattern === 'weekly' ? '' : 'none';

    const units = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)' };
    unitEl.textContent = units[pattern] || 'day(s)';
}

function _getRecurrenceFromModal() {
    const pattern = document.getElementById('mc-event-recurrence').value;
    if (pattern === 'none') return null;

    const interval = parseInt(document.getElementById('mc-recurrence-interval').value) || 1;
    const endDate = document.getElementById('mc-recurrence-end').value || null;

    const result = { pattern, interval, end_date: endDate };

    if (pattern === 'weekly') {
        const selected = [];
        _modalHost.querySelectorAll('.mc-day-btn.mc-day-selected').forEach(btn => {
            selected.push(parseInt(btn.dataset.day));
        });
        // JS day-of-week: 0=Sun..6=Sat → Python weekday: 0=Mon..6=Sun
        result.days_of_week = selected.map(d => d === 0 ? 6 : d - 1);
    }

    if (pattern === 'monthly') {
        const startDate = document.getElementById('mc-event-start').value;
        if (startDate) {
            result.day_of_month = new Date(startDate + 'T12:00:00').getDate();
        }
    }

    return result;
}

function _setRecurrenceInModal(recurrence) {
    const recurrenceSelect = document.getElementById('mc-event-recurrence');
    const intervalInput = document.getElementById('mc-recurrence-interval');
    const endInput = document.getElementById('mc-recurrence-end');

    if (!recurrence || recurrence.pattern === 'none') {
        recurrenceSelect.value = 'none';
        _onRecurrenceChange();
        return;
    }

    recurrenceSelect.value = recurrence.pattern;
    intervalInput.value = recurrence.interval || 1;
    endInput.value = recurrence.end_date || '';

    if (recurrence.pattern === 'weekly' && recurrence.days_of_week) {
        // Python weekday (0=Mon..6=Sun) → JS day (0=Sun..6=Sat)
        const jsDays = recurrence.days_of_week.map(d => d === 6 ? 0 : d + 1);
        _modalHost.querySelectorAll('.mc-day-btn').forEach(btn => {
            const day = parseInt(btn.dataset.day);
            btn.classList.toggle('mc-day-selected', jsDays.includes(day));
        });
    }

    _onRecurrenceChange();
}

let _recurringDialogResolve = null;

function _showRecurringDialog(title, msg) {
    return new Promise(resolve => {
        _recurringDialogResolve = resolve;
        document.getElementById('mc-recurring-dialog-title').textContent = title;
        document.getElementById('mc-recurring-dialog-msg').textContent = msg;
        document.getElementById('mc-recurring-dialog').style.display = 'flex';

        const thisBtn = document.getElementById('mc-recurring-this');
        const futureBtn = document.getElementById('mc-recurring-future');

        const onThis = () => { cleanup(); resolve('this'); };
        const onFuture = () => { cleanup(); resolve('future'); };
        const onCancel = () => { cleanup(); resolve(null); };

        function cleanup() {
            thisBtn.removeEventListener('click', onThis);
            futureBtn.removeEventListener('click', onFuture);
            document.getElementById('mc-recurring-dialog').style.display = 'none';
        }

        thisBtn.addEventListener('click', onThis);
        futureBtn.addEventListener('click', onFuture);
    });
}

function _hideRecurringDialog() {
    document.getElementById('mc-recurring-dialog').style.display = 'none';
    if (_recurringDialogResolve) { _recurringDialogResolve(null); _recurringDialogResolve = null; }
}

// ─── Event Modal ─────────────────────────────────────────────────────────────

let _editingRecurrence = null;  // Stored recurrence info for the event being edited
let _editingEventDate = null;   // Date of the specific occurrence being edited

function _showEventModal(event = null, date = null) {
    // Safety: ensure no planner overlay is blocking the modal
    _closePlanner();
    const modal = document.getElementById('mc-event-modal');
    if (!modal) { console.error('[MC] Event modal element not found'); return; }
    const titleInput = document.getElementById('mc-event-title');
    const descInput = document.getElementById('mc-event-desc');
    const startInput = document.getElementById('mc-event-start');
    const endInput = document.getElementById('mc-event-end');
    const timeInput = document.getElementById('mc-event-time');
    const reminderInput = document.getElementById('mc-event-reminder');
    const chimesInput = document.getElementById('mc-event-chimes');
    const catInput = document.getElementById('mc-event-category');
    const deleteBtn = document.getElementById('mc-event-delete');
    const modalTitle = document.getElementById('mc-event-modal-title');

    if (event) {
        _editingEventId = event._recurring ? event._base_event_id : event.id;
        _editingRecurrence = event.recurrence || (event._recurring ? { _rule_id: event._rule_id, _base_event_id: event._base_event_id } : null);
        _editingEventDate = event._recurring ? (event.start_date || '').substring(0, 10) : null;
        modalTitle.textContent = event._recurring ? '\u{1F501} Edit Recurring Event' : '\u{270F}\u{FE0F} Edit Event';
        titleInput.value = event.title || '';
        descInput.value = event.description || '';
        startInput.value = (event.start_date || '').substring(0, 10);
        endInput.value = (event.end_date || '').substring(0, 10);
        timeInput.value = event.start_time || '09:00';
        reminderInput.value = event.reminder_minutes != null ? String(event.reminder_minutes) : '';
        chimesInput.value = event.chime_count != null ? String(event.chime_count) : '3';
        catInput.value = event.category || 'event';
        deleteBtn.style.display = '';
        const color = event.color || '#4a9eff';
        _modalHost.querySelectorAll('.mc-event-color-opt').forEach(o => {
            o.classList.toggle('mc-event-color-sel', o.dataset.color === color);
        });
        _setRecurrenceInModal(event.recurrence || null);
    } else {
        _editingEventId = null;
        _editingRecurrence = null;
        _editingEventDate = null;
        modalTitle.textContent = '\u{1F4C6} New Event';
        titleInput.value = '';
        descInput.value = '';
        startInput.value = date || new Date().toISOString().substring(0, 10);
        endInput.value = date || new Date().toISOString().substring(0, 10);
        timeInput.value = '09:00';
        reminderInput.value = '';
        chimesInput.value = '3';
        catInput.value = 'event';
        deleteBtn.style.display = 'none';
        _modalHost.querySelectorAll('.mc-event-color-opt').forEach(o => {
            o.classList.toggle('mc-event-color-sel', o.dataset.color === '#4a9eff');
        });
        _setRecurrenceInModal(null);
        _modalHost.querySelectorAll('.mc-day-btn').forEach(b => b.classList.remove('mc-day-selected'));
    }

    modal.style.display = 'flex';
    titleInput.focus();
}

function _hideEventModal() {
    const modal = document.getElementById('mc-event-modal');
    if (modal) modal.style.display = 'none';
    _editingEventId = null;
}

async function _saveCalendarEvent() {
    const title = document.getElementById('mc-event-title').value.trim();
    const description = document.getElementById('mc-event-desc').value.trim();
    const start_date = document.getElementById('mc-event-start').value;
    const end_date = document.getElementById('mc-event-end').value;
    const start_time = document.getElementById('mc-event-time').value || '09:00';
    const reminderVal = document.getElementById('mc-event-reminder').value;
    const reminder_minutes = reminderVal !== '' ? parseInt(reminderVal) : null;
    const chime_count = parseInt(document.getElementById('mc-event-chimes').value) || 3;
    const category = document.getElementById('mc-event-category').value;
    const colorEl = _modalHost.querySelector('.mc-event-color-opt.mc-event-color-sel');
    const color = colorEl ? colorEl.dataset.color : '#4a9eff';
    const recurrence = _getRecurrenceFromModal();

    if (!title || !start_date) return;

    const scope = (_mc && _mc.selectedScope) || 'default';
    const payload = { title, description, start_date, end_date: end_date || start_date, start_time, reminder_minutes, chime_count, color, category, recurrence };

    try {
        if (_editingEventId) {
            // If editing a recurring event occurrence, ask what to edit
            if (_editingRecurrence && _editingEventDate) {
                const choice = await _showRecurringDialog(
                    '\u{270F}\u{FE0F} Edit Recurring Event',
                    'This is a recurring event. How would you like to save changes?'
                );
                if (!choice) return;

                if (choice === 'this') {
                    // Add exception to the rule, create a new standalone event
                    const ruleId = _editingRecurrence._rule_id || _editingRecurrence.rule_id;
                    if (ruleId) {
                        await fetch('/api/plugin/mission-control/calendar/delete', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                            body: JSON.stringify({ id: _editingEventId, mode: 'this', rule_id: ruleId, event_date: _editingEventDate })
                        });
                    }
                    // Create a new non-recurring event for this date
                    const standalonePayload = { ...payload, recurrence: null, scope };
                    await fetch('/api/plugin/mission-control/calendar/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify(standalonePayload)
                    });
                } else {
                    // Edit all future: update the base event + its recurrence rule
                    await fetch('/api/plugin/mission-control/calendar/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({ id: _editingEventId, ...payload })
                    });
                }
            } else {
                // Normal (non-recurring) edit
                await fetch('/api/plugin/mission-control/calendar/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: _editingEventId, ...payload })
                });
            }
        } else {
            await fetch('/api/plugin/mission-control/calendar/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ ...payload, scope })
            });
        }
        _hideEventModal();
        _loadCalendarEvents();
    } catch (e) {
        console.error('[MC] Save event error:', e);
    }
}

async function _deleteCalendarEvent() {
    if (!_editingEventId) return;

    try {
        if (_editingRecurrence && (_editingRecurrence._rule_id || _editingRecurrence.rule_id)) {
            // Recurring event — ask what to delete
            const choice = await _showRecurringDialog(
                '\u{1F5D1}\u{FE0F} Delete Recurring Event',
                'This is a recurring event. What would you like to delete?'
            );
            if (!choice) return;

            const ruleId = _editingRecurrence._rule_id || _editingRecurrence.rule_id;

            if (choice === 'this' && _editingEventDate) {
                await fetch('/api/plugin/mission-control/calendar/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: _editingEventId, mode: 'this', rule_id: ruleId, event_date: _editingEventDate })
                });
            } else {
                // Delete all — remove the base event entirely
                await fetch('/api/plugin/mission-control/calendar/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: _editingEventId, mode: 'all' })
                });
            }
        } else {
            if (!confirm('Delete this event?')) return;
            await fetch('/api/plugin/mission-control/calendar/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ id: _editingEventId })
            });
        }
        _hideEventModal();
        _loadCalendarEvents();
    } catch (e) {
        console.error('[MC] Delete event error:', e);
    }
}

// ─── Reminder System ─────────────────────────────────────────────────────────

function _startReminderPolling() {
    _checkReminders();
    _reminderTimer = setInterval(_checkReminders, 60000);
}

async function _checkReminders() {
    try {
        const resp = await fetch('/api/plugin/mission-control/calendar/reminders', {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        const data = await resp.json();
        for (const r of (data.reminders || [])) _fireReminder(r);
    } catch { /* silent */ }
}

function _fireReminder(event) {
    const title = event.title || 'Calendar Event';
    const time12 = to12h(event.start_time);
    const timeStr = time12 ? ` at ${time12}` : '';
    const chimes = event.chime_count != null ? event.chime_count : 3;

    _playAlarmSound(chimes);
    _showReminderToast(title, timeStr, event.color || '#4a9eff');

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('\u{1F514} Mission Control Reminder', {
            body: `${title}${timeStr}`,
            icon: '/static/favicon.ico',
            tag: `mc-reminder-${event.id}`,
            requireInteraction: true,
        });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

window._alarmLoopTimer = null;

function _playAlarmSound(chimeCount) {
    if (window._alarmLoopTimer) { clearInterval(window._alarmLoopTimer); window._alarmLoopTimer = null; }
    const repeats = chimeCount === -1 ? 3 : (chimeCount || 3);

    function _playChimeBurst() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const notes = [523.25, 659.25, 783.99, 1046.50];
            const chimeLen = notes.length * 0.15 + 0.4;
            const gap = 0.3;
            for (let r = 0; r < repeats; r++) {
                const offset = r * (chimeLen + gap);
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    const t = ctx.currentTime + offset + i * 0.15;
                    gain.gain.setValueAtTime(0, t);
                    gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.5);
                });
            }
        } catch (e) { console.warn('[MC] Audio alarm failed:', e); }
    }

    _playChimeBurst();

    if (chimeCount === -1) {
        const burstDuration = (3 * (0.6 + 0.3) + 1) * 1000;
        window._alarmLoopTimer = setInterval(() => {
            const toasts = document.getElementById('mc-reminder-toasts');
            if (!toasts || !toasts.children.length) {
                clearInterval(window._alarmLoopTimer);
                window._alarmLoopTimer = null;
                return;
            }
            _playChimeBurst();
        }, burstDuration);
    }
}

function _showReminderToast(title, timeStr, color) {
    let container = document.getElementById('mc-reminder-toasts');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mc-reminder-toasts';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'mc-reminder-toast';
    toast.style.cssText = `
        pointer-events:auto; background:#111118; border:1px solid ${color};
        border-left:4px solid ${color}; border-radius:10px; padding:14px 18px;
        min-width:280px; max-width:380px; box-shadow:0 8px 32px rgba(0,0,0,0.5);
        animation: mc-toast-in 0.4s ease-out; display:flex; align-items:flex-start; gap:10px;
    `;
    toast.innerHTML = `
        <span style="font-size:1.4rem;flex-shrink:0">\u{1F514}</span>
        <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:0.85rem;color:#e0e0e0;margin-bottom:2px">Reminder</div>
            <div style="font-size:0.8rem;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}${timeStr}</div>
        </div>
        <button style="background:none;border:none;color:#666;cursor:pointer;font-size:1rem;padding:0 2px;flex-shrink:0" onclick="this.parentElement.remove(); if(window._alarmLoopTimer){clearInterval(window._alarmLoopTimer);window._alarmLoopTimer=null;}">\u{2715}</button>
    `;
    container.appendChild(toast);
}

// ─── Cron Helpers ────────────────────────────────────────────────────────────

function _nextCronFire(cronStr) {
    const parts = cronStr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minF, hrF, , , dowF] = parts;
    const now = new Date();

    if (minF.startsWith('*/')) {
        const interval = parseInt(minF.replace('*/', ''));
        if (!interval) return null;
        const curMin = now.getMinutes();
        const curSec = now.getSeconds();
        let nextMin = Math.ceil((curMin * 60 + curSec + 1) / (interval * 60)) * interval;
        const next = new Date(now);
        next.setSeconds(0, 0);
        next.setMinutes(0);
        next.setMinutes(nextMin);
        return next.getTime();
    }

    if (hrF.startsWith('*/')) {
        const interval = parseInt(hrF.replace('*/', ''));
        if (!interval) return null;
        const min = parseInt(minF) || 0;
        const curHr = now.getHours();
        for (let h = curHr; h < curHr + 24; h++) {
            if (h % interval !== 0) continue;
            const candidate = new Date(now);
            candidate.setSeconds(0, 0);
            if (h >= 24) {
                candidate.setDate(candidate.getDate() + 1);
                candidate.setHours(h - 24, min);
            } else {
                candidate.setHours(h, min);
            }
            if (candidate > now) return candidate.getTime();
        }
        return null;
    }

    const targetMin = parseInt(minF);
    const targetHr = parseInt(hrF);
    if (isNaN(targetMin) || isNaN(targetHr)) return null;

    for (let d = 0; d < 8; d++) {
        const candidate = new Date(now);
        candidate.setDate(candidate.getDate() + d);
        candidate.setHours(targetHr, targetMin, 0, 0);
        if (candidate <= now) continue;

        if (dowF !== '*') {
            const dow = candidate.getDay();
            const allowed = dowF.split(',').flatMap(p => {
                if (p.includes('-')) {
                    const [a, b] = p.split('-').map(Number);
                    const result = [];
                    for (let i = a; i <= b; i++) result.push(i);
                    return result;
                }
                return [parseInt(p)];
            });
            if (!allowed.includes(dow)) continue;
        }
        return candidate.getTime();
    }
    return null;
}
