// reflection.js — Self-Reflection overlays, Bulletin Board, Tools Status, Mind Panel
// Extracted from legacy main.js lines 2520-2752, 3044-3960

import { CSRF } from '../lib/api.js';
import { esc, escHtml, fmtDate, relativeTime } from '../lib/utils.js';

let _mc = null;
let _container = null;

// Caches
let _correctionsCache = [];
let _reflectionsCache = [];
let _rulesCache = [];
let _bulletinsCache = [];
let _capsulesCache = [];
let _mindDataCache = {};

// Glow tracking
let _seenBulletinPending = 0;
let _seenReflectionTotal = 0;

// ─── Public API ──────────────────────────────────────────────────────────────

// Overlay elements appended to body (to escape transform containment in .mc-tab-content)
let _overlayHost = null;
let _refreshHandler = null;

export function init(el, mc) {
    _mc = mc;
    _container = el;

    // Clear stale caches so we always fetch fresh for the current scope
    _correctionsCache = [];
    _reflectionsCache = [];
    _rulesCache = [];
    _bulletinsCache = [];
    _capsulesCache = [];
    _mindDataCache = {};

    el.innerHTML = _buildLayout();

    // Kill all CSS animations/transforms on the tab content and wrapper so
    // position:fixed overlays inside work correctly (transforms create new
    // containing blocks that break fixed positioning).
    el.style.animation = 'none';
    el.style.transform = 'none';
    const wrapper = el.querySelector('.mc-reflection-tab');
    if (wrapper) { wrapper.style.animation = 'none'; wrapper.style.transform = 'none'; }

    // Keep overlays in the DOM tree (no body move) — they use position:fixed
    // which works correctly now that transforms are cleared above.
    _overlayHost = el;

    _bindEvents(el);
    _loadReflectionData();

    // Remove any previous listener to prevent stacking
    if (_refreshHandler) mc.off('refresh-data', _refreshHandler);
    _refreshHandler = () => {
        // Clear caches immediately so stale data from previous scope doesn't linger
        _correctionsCache = [];
        _reflectionsCache = [];
        _rulesCache = [];
        _bulletinsCache = [];
        _capsulesCache = [];
        _mindDataCache = {};
        // Re-render immediately with empty state, then fetch fresh
        _renderCorrections();
        _renderReflections();
        _renderRules();
        _renderBulletins();
        _renderCapsules();
        _updateGlows();
        _loadReflectionData();
    };
    mc.on('refresh-data', _refreshHandler);

    return { destroy, refresh };
}

export function destroy() {
    // _overlayHost is now just el (tab content), managed by _switchTab — don't remove it
    _overlayHost = null;
    if (_refreshHandler && _mc) {
        _mc.off('refresh-data', _refreshHandler);
        _refreshHandler = null;
    }
}

export function refresh() {
    _loadReflectionData();
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function _buildLayout() {
    return `
    <div class="mc-reflection-tab">
        <!-- Reflection Action Bar -->
        <div class="mc-reflection-bar">
            <button class="mc-btn mc-btn-accent" id="mc-open-bulletin">
                \u{1F4EC} Bulletin Board <span class="mc-badge" id="mc-bulletin-bar-badge" style="display:none">0</span>
            </button>
            <button class="mc-btn mc-btn-accent" id="mc-open-reflection">
                \u{1F9E0} Self-Reflection
            </button>
            <button class="mc-btn" id="mc-open-tools">
                \u{1F6E0}\u{FE0F} Tools Status
            </button>
            <button class="mc-btn" id="mc-open-feedback">
                \u{1F44E} Model Feedback
            </button>
        </div>

        <!-- Mind Panel -->
        <div class="mc-mind-section">
            <div class="mc-board-header">
                <h2 class="mc-section-title">\u{1F9E0} Mind</h2>
            </div>
            <div class="mc-mind-tabs">
                <button class="mc-mind-tab-btn mc-mind-tab-active" data-mind-tab="memories">\u{1F4A1} Memories</button>
                <button class="mc-mind-tab-btn" data-mind-tab="people">\u{1F465} People</button>
                <button class="mc-mind-tab-btn" data-mind-tab="human-knowledge">\u{1F4DA} Human Knowledge</button>
                <button class="mc-mind-tab-btn" data-mind-tab="ai-knowledge">\u{1F916} AI Knowledge</button>
            </div>
            <div class="mc-mind-content">
                <div class="mc-mind-tab-panel" id="mc-mind-tab-memories"></div>
                <div class="mc-mind-tab-panel" id="mc-mind-tab-people" style="display:none"></div>
                <div class="mc-mind-tab-panel" id="mc-mind-tab-human-knowledge" style="display:none"></div>
                <div class="mc-mind-tab-panel" id="mc-mind-tab-ai-knowledge" style="display:none"></div>
            </div>
        </div>

        <!-- Bulletin Board Overlay -->
        <div class="mc-overlay" id="mc-bulletin-overlay" style="display:none">
            <div class="mc-overlay-panel">
                <div class="mc-overlay-header">
                    <h2>\u{1F4EC} Bulletin Board</h2>
                    <span class="mc-badge" id="mc-bulletin-badge" style="display:none">0</span>
                    <button class="mc-overlay-close" id="mc-bulletin-close">\u{2715}</button>
                </div>
                <div class="mc-overlay-body">
                    <p class="mc-overlay-hint">The AI posts requests here when it wants to propose changes. You approve or deny.</p>
                    <div class="mc-bulletin-list" id="mc-bulletin-list"></div>
                </div>
            </div>
        </div>

        <!-- Self-Reflection Overlay (Tabbed) -->
        <div class="mc-overlay" id="mc-reflection-overlay" style="display:none">
            <div class="mc-overlay-panel mc-overlay-wide">
                <div class="mc-overlay-header">
                    <h2>\u{1F9E0} Self-Reflection</h2>
                    <button class="mc-overlay-close" id="mc-reflection-close">\u{2715}</button>
                </div>
                <div class="mc-overlay-tabs">
                    <button class="mc-overlay-tab mc-overlay-tab-active" data-ref-tab="corrections">\u{1F50D} Corrections <span class="mc-reflect-count" id="mc-corrections-count">0</span></button>
                    <button class="mc-overlay-tab" data-ref-tab="reflections">\u{1F4AD} Reflections <span class="mc-reflect-count" id="mc-reflections-count">0</span></button>
                    <button class="mc-overlay-tab" data-ref-tab="rules">\u{1F4DC} Learned Rules <span class="mc-reflect-count" id="mc-rules-count">0</span></button>
                    <button class="mc-overlay-tab" data-ref-tab="capsules">\u{1F48A} Capsules <span class="mc-reflect-count" id="mc-capsules-count">0</span></button>
                </div>
                <div class="mc-overlay-body">
                    <div class="mc-overlay-tab-content" id="mc-ref-tab-corrections">
                        <div class="mc-corrections-list" id="mc-corrections-list"></div>
                    </div>
                    <div class="mc-overlay-tab-content" id="mc-ref-tab-reflections" style="display:none">
                        <div class="mc-reflections-list" id="mc-reflections-list"></div>
                    </div>
                    <div class="mc-overlay-tab-content" id="mc-ref-tab-rules" style="display:none">
                        <div class="mc-rules-toolbar"><button class="mc-btn mc-btn-sm mc-btn-accent" id="mc-rule-new">\u{2795} Inject Rule</button></div>
                        <div class="mc-rules-list" id="mc-rules-list"></div>
                    </div>
                    <div class="mc-overlay-tab-content" id="mc-ref-tab-capsules" style="display:none">
                        <div class="mc-capsules-grid" id="mc-capsules-grid"></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tools Status Overlay -->
        <div class="mc-overlay" id="mc-tools-overlay" style="display:none">
            <div class="mc-overlay-panel mc-overlay-wide">
                <div class="mc-overlay-header">
                    <h2>\u{1F6E0}\u{FE0F} Mission Control Tools</h2>
                    <button class="mc-overlay-close" id="mc-tools-close">\u{2715}</button>
                </div>
                <div class="mc-overlay-body">
                    <div class="mc-tools-info" id="mc-tools-info"></div>
                    <div class="mc-tools-list" id="mc-tools-list">
                        <div class="mc-empty">Loading tools...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Model Feedback Overlay -->
        <div class="mc-overlay" id="mc-feedback-overlay" style="display:none">
            <div class="mc-overlay-panel mc-overlay-wide">
                <div class="mc-overlay-header">
                    <h2>\u{1F44E} Model Feedback</h2>
                    <button class="mc-overlay-close" id="mc-feedback-close">\u{2715}</button>
                </div>
                <div class="mc-overlay-body">
                    <p class="mc-overlay-hint">Thumbs-down responses logged per model. Use this to spot which models underperform.</p>
                    <div class="mc-feedback-summary" id="mc-feedback-summary"></div>
                    <h3 class="mc-feedback-recent-title">\u{1F552} Recent Feedback</h3>
                    <div class="mc-feedback-list" id="mc-feedback-list"></div>
                </div>
            </div>
        </div>

        <!-- Inject Rule Modal -->
        <div class="mc-modal-overlay" id="mc-rule-modal" style="display:none">
            <div class="mc-modal">
                <div class="mc-modal-header">
                    <h3>\u{1F9E0} Inject Learned Rule</h3>
                    <button class="mc-modal-close" id="mc-rule-modal-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body">
                    <p class="mc-modal-hint">This rule will be injected into the AI's system prompt. Think of it as planting a suggestion \u2014 the AI will follow it as if it always knew.</p>
                    <label class="mc-label">Rule</label>
                    <textarea class="mc-input mc-textarea" id="mc-rule-text" placeholder="e.g. When discussing code, always suggest error handling for network calls..." rows="4" maxlength="2000"></textarea>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn" id="mc-rule-cancel">Cancel</button>
                    <button class="mc-btn mc-btn-accent" id="mc-rule-save">\u{1F9E0} Inject Rule</button>
                </div>
            </div>
        </div>
    </div>`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

function _bindEvents(el) {
    // Overlays are in _overlayHost (appended to body), so query them from there
    const oh = _overlayHost;
    const bulletinOverlay = oh.querySelector('#mc-bulletin-overlay');
    const reflectionOverlay = oh.querySelector('#mc-reflection-overlay');
    const toolsOverlay = oh.querySelector('#mc-tools-overlay');

    // Open overlays
    const _openOverlay = (overlay, name, onOpen) => {
        if (!overlay) { console.error(`[MC] ${name} overlay element is null`); return; }
        try {
            overlay.style.display = 'flex';
            onOpen?.();
        } catch (e) { console.error(`[MC] Error opening ${name}:`, e); }
    };
    el.querySelector('#mc-open-bulletin')?.addEventListener('click', () => {
        _openOverlay(bulletinOverlay, 'Bulletin', () => { _renderBulletins(); _loadReflectionData(); });
    });
    el.querySelector('#mc-open-reflection')?.addEventListener('click', () => {
        _openOverlay(reflectionOverlay, 'Reflection', () => { _renderCorrections(); _renderReflections(); _renderRules(); _renderCapsules(); _loadReflectionData(); });
    });
    el.querySelector('#mc-open-tools')?.addEventListener('click', () => {
        _openOverlay(toolsOverlay, 'Tools', () => { _loadToolStatus(); });
    });

    const feedbackOverlay = oh.querySelector('#mc-feedback-overlay');
    el.querySelector('#mc-open-feedback')?.addEventListener('click', () => {
        _openOverlay(feedbackOverlay, 'Feedback', () => { _loadFeedbackStats(); });
    });

    // Close overlays
    const _closeBulletin = () => {
        bulletinOverlay.style.display = 'none';
        _seenBulletinPending = _bulletinsCache.filter(b => b.status === 'pending').length;
        el.querySelector('#mc-open-bulletin')?.classList.remove('mc-glow-amber');
    };
    const _closeReflection = () => {
        reflectionOverlay.style.display = 'none';
        _seenReflectionTotal = _correctionsCache.length + _reflectionsCache.length + _capsulesCache.length;
        el.querySelector('#mc-open-reflection')?.classList.remove('mc-glow-cyan');
    };

    oh.querySelector('#mc-bulletin-close')?.addEventListener('click', _closeBulletin);
    oh.querySelector('#mc-reflection-close')?.addEventListener('click', _closeReflection);
    oh.querySelector('#mc-tools-close')?.addEventListener('click', () => { toolsOverlay.style.display = 'none'; });
    oh.querySelector('#mc-feedback-close')?.addEventListener('click', () => { feedbackOverlay.style.display = 'none'; });

    bulletinOverlay?.addEventListener('click', e => { if (e.target === bulletinOverlay) _closeBulletin(); });
    reflectionOverlay?.addEventListener('click', e => { if (e.target === reflectionOverlay) _closeReflection(); });
    toolsOverlay?.addEventListener('click', e => { if (e.target === toolsOverlay) toolsOverlay.style.display = 'none'; });
    feedbackOverlay?.addEventListener('click', e => { if (e.target === feedbackOverlay) feedbackOverlay.style.display = 'none'; });

    // Self-Reflection tab switching
    oh.querySelectorAll('.mc-overlay-tab[data-ref-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            oh.querySelectorAll('.mc-overlay-tab[data-ref-tab]').forEach(t => t.classList.remove('mc-overlay-tab-active'));
            tab.classList.add('mc-overlay-tab-active');
            oh.querySelectorAll('.mc-overlay-tab-content').forEach(c => c.style.display = 'none');
            const target = document.getElementById('mc-ref-tab-' + tab.dataset.refTab);
            if (target) target.style.display = '';
        });
    });

    // Rule injection modal
    const ruleModal = oh.querySelector('#mc-rule-modal');
    oh.querySelector('#mc-rule-new')?.addEventListener('click', () => {
        oh.querySelector('#mc-rule-text').value = '';
        ruleModal.style.display = 'flex';
    });
    oh.querySelector('#mc-rule-modal-close').addEventListener('click', () => { ruleModal.style.display = 'none'; });
    oh.querySelector('#mc-rule-cancel').addEventListener('click', () => { ruleModal.style.display = 'none'; });
    oh.querySelector('#mc-rule-save').addEventListener('click', async () => {
        const rule = oh.querySelector('#mc-rule-text').value.trim();
        if (!rule) { alert('Rule text is required.'); return; }
        try {
            await fetch('/api/plugin/mission-control/rules/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify({ rule })
            });
            ruleModal.style.display = 'none';
            _loadReflectionData(true);
        } catch (e) { console.error('[MC] Rule save error:', e); }
    });

    // Mind panel tabs
    el.querySelectorAll('.mc-mind-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            el.querySelectorAll('.mc-mind-tab-btn').forEach(b => b.classList.remove('mc-mind-tab-active'));
            btn.classList.add('mc-mind-tab-active');
            el.querySelectorAll('.mc-mind-tab-panel').forEach(p => p.style.display = 'none');
            const panel = el.querySelector('#mc-mind-tab-' + btn.dataset.mindTab);
            if (panel) panel.style.display = '';
            _loadMindTab(btn.dataset.mindTab);
        });
    });

    // Load initial mind tab
    _loadMindTab('memories');
}

// ─── Reflection Data ─────────────────────────────────────────────────────────

let _loadTimer = null;

function _loadReflectionData() {
    // Debounce rapid calls to avoid hitting rate limits
    if (_loadTimer) clearTimeout(_loadTimer);
    _loadTimer = setTimeout(_doLoadReflectionData, 200);
}

async function _doLoadReflectionData() {
    const base = '/api/plugin/mission-control';
    const h = { 'X-CSRF-Token': CSRF() };
    const scope = (_mc && _mc.selectedScope) || 'default';
    const sq = `?scope=${encodeURIComponent(scope)}`;

    try {
        const resp = await fetch(`${base}/reflection/batch${sq}`, { headers: h });
        if (!resp.ok) throw new Error(`${resp.status}`);
        const d = await resp.json();
        if (d.corrections) _correctionsCache = d.corrections;
        if (d.reflections) _reflectionsCache = d.reflections;
        if (d.rules) _rulesCache = d.rules;
        if (d.bulletins) _bulletinsCache = d.bulletins;
        if (d.capsules) _capsulesCache = d.capsules;
    } catch (e) {
        console.warn('[MC] Reflection batch load failed:', e);
    }
    _renderCorrections();
    _renderReflections();
    _renderRules();
    _renderBulletins();
    _renderCapsules();
    _updateGlows();
}

function _updateGlows() {
    const bulletinBtn = document.getElementById('mc-open-bulletin');
    if (bulletinBtn) {
        const pending = _bulletinsCache.filter(b => b.status === 'pending').length;
        bulletinBtn.classList.toggle('mc-glow-amber', pending > _seenBulletinPending);
    }
    const refBtn = document.getElementById('mc-open-reflection');
    if (refBtn) {
        const total = _correctionsCache.length + _reflectionsCache.length + _capsulesCache.length;
        refBtn.classList.toggle('mc-glow-cyan', total > _seenReflectionTotal);
    }
}

// ─── Bulletin Board ──────────────────────────────────────────────────────────

function _renderBulletins() {
    const el = document.getElementById('mc-bulletin-list');
    if (!el) return;
    const badge = document.getElementById('mc-bulletin-badge');
    const barBadge = document.getElementById('mc-bulletin-bar-badge');
    const pending = _bulletinsCache.filter(b => b.status === 'pending');
    [badge, barBadge].forEach(b => {
        if (b) { b.textContent = pending.length; b.style.display = pending.length > 0 ? 'inline-block' : 'none'; }
    });
    if (_bulletinsCache.length === 0) {
        el.innerHTML = '<div class="mc-empty-sm">No requests yet \u2014 the AI will post here when it wants to propose changes</div>';
        return;
    }
    const statusIcon = { pending: '\u{23F3}', approved: '\u{2705}', denied: '\u{274C}' };
    const typeIcon = { standing_order: '\u{1F4E5}', rule_promotion: '\u{2B06}\u{FE0F}', schedule: '\u{23F0}', capability: '\u{1F527}' };
    const statusColor = { pending: '#ffc107', approved: '#4caf50', denied: '#666' };

    el.innerHTML = _bulletinsCache.map(b => {
        const desc = b.description ? escHtml(b.description) : '';
        const reason = b.reason ? escHtml(b.reason) : '';
        const descTrunc = desc.length > 300;
        const reasonTrunc = reason.length > 200;
        const descPreview = descTrunc ? desc.substring(0, 300) + '…' : desc;
        const reasonPreview = reasonTrunc ? reason.substring(0, 200) + '…' : reason;
        return `
        <div class="mc-bulletin-card mc-bulletin-${b.status}" data-id="${b.id}">
            <div class="mc-bulletin-top">
                <span class="mc-bulletin-type">${typeIcon[b.request_type] || '\u{1F4CB}'} ${b.request_type.replace(/_/g, ' ')}</span>
                <span class="mc-bulletin-status" style="color:${statusColor[b.status] || '#888'}">${statusIcon[b.status] || ''} ${b.status}</span>
            </div>
            <div class="mc-bulletin-title">${escHtml(b.title)}</div>
            ${desc ? `<div class="mc-bulletin-desc mc-trunc-collapsed" data-full="${desc.replace(/"/g, '&quot;')}" data-preview="${descPreview.replace(/"/g, '&quot;')}">${descPreview}</div>` : ''}
            ${reason ? `<div class="mc-bulletin-reason mc-trunc-collapsed" data-full="\u{1F4A1} ${reason.replace(/"/g, '&quot;')}" data-preview="\u{1F4A1} ${reasonPreview.replace(/"/g, '&quot;')}">\u{1F4A1} ${reasonPreview}</div>` : ''}
            ${descTrunc || reasonTrunc ? '<div class="mc-trunc-toggle mc-capsule-expand">▼ show more</div>' : ''}
            <div class="mc-bulletin-footer">
                <span class="mc-bulletin-date">${fmtDate(b.created_at)}</span>
                ${b.status === 'pending' ? `
                    <div class="mc-bulletin-actions">
                        <button class="mc-btn mc-btn-sm mc-btn-approve" data-id="${b.id}" title="Approve">\u{2705} Approve</button>
                        <button class="mc-btn mc-btn-sm mc-btn-deny" data-id="${b.id}" title="Deny">\u{274C} Deny</button>
                        <button class="mc-btn mc-btn-sm mc-btn-resend" data-id="${b.id}" data-title="${escHtml(b.title).replace(/"/g, '&quot;')}" title="Ask for more details">\u{1F4DD} Resend</button>
                    </div>
                ` : ''}
                <button class="mc-card-btn mc-bulletin-del" data-id="${b.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>
            </div>
        </div>`;
    }).join('');

    // Expand/collapse truncated bulletin text
    el.querySelectorAll('.mc-trunc-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.mc-bulletin-card');
            const fields = card.querySelectorAll('.mc-trunc-collapsed, .mc-trunc-expanded');
            const isCollapsed = fields[0]?.classList.contains('mc-trunc-collapsed');
            fields.forEach(f => {
                f.textContent = isCollapsed ? f.dataset.full : f.dataset.preview;
                f.classList.toggle('mc-trunc-collapsed');
                f.classList.toggle('mc-trunc-expanded');
            });
            btn.textContent = isCollapsed ? '▲ show less' : '▼ show more';
        });
    });

    el.querySelectorAll('.mc-btn-approve').forEach(btn => {
        btn.addEventListener('click', () => _updateBulletinStatus(btn.dataset.id, 'approved'));
    });
    el.querySelectorAll('.mc-btn-deny').forEach(btn => {
        btn.addEventListener('click', () => _updateBulletinStatus(btn.dataset.id, 'denied'));
    });
    el.querySelectorAll('.mc-btn-resend').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const title = btn.dataset.title;
            const msg = `Your bulletin board request [${id}] "${title}" was sent back for more detail. Do NOT create a new bulletin — call edit_bulletin exactly like this:\n\nedit_bulletin(bulletin_id=${id}, description="<your detailed description here — what specifically happens, when, and how>")\n\nFill in the description with real detail, then let me know what you updated.`;
            // Send as a chat message
            if (_mc && _mc.emit) _mc.emit('send-message', { text: msg });
            // Also close the overlay so they can see the chat
            const overlay = document.getElementById('mc-bulletin-overlay');
            if (overlay) overlay.style.display = 'none';
        });
    });
    el.querySelectorAll('.mc-bulletin-del').forEach(btn => {
        btn.addEventListener('click', () => _deleteBulletin(btn.dataset.id));
    });
}

async function _updateBulletinStatus(id, status) {
    try {
        await fetch('/api/plugin/mission-control/bulletins/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ id: parseInt(id), status })
        });
        _loadReflectionData(true);
    } catch (e) { console.error('[MC] Bulletin update error:', e); }
}

async function _deleteBulletin(id) {
    if (!confirm('Delete this request?')) return;
    try {
        await fetch('/api/plugin/mission-control/bulletins/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ id: parseInt(id) })
        });
        _loadReflectionData(true);
    } catch (e) { console.error('[MC] Bulletin delete error:', e); }
}

// ─── Corrections ─────────────────────────────────────────────────────────────

function _renderCorrections() {
    const el = document.getElementById('mc-corrections-list');
    const countEl = document.getElementById('mc-corrections-count');
    if (!el) return;
    if (countEl) countEl.textContent = _correctionsCache.length;
    if (_correctionsCache.length === 0) {
        el.innerHTML = '<div class="mc-empty-sm">No corrections detected yet</div>';
        return;
    }
    el.innerHTML = _correctionsCache.slice(0, 30).map(c => {
        const catLabel = (c.category || 'unknown').replace(/_/g, ' ');
        return `<div class="mc-correction-card" data-id="${c.id}">
            <div class="mc-correction-top">
                <span class="mc-correction-cat">${catLabel}</span>
                <span class="mc-correction-date">${fmtDate(c.created_at)}</span>
                <button class="mc-card-btn mc-correction-del" data-id="${c.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>
            </div>
            <div class="mc-correction-text">${escHtml(c.user_message).substring(0, 300)}</div>
        </div>`;
    }).join('');

    el.querySelectorAll('.mc-correction-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this correction?')) return;
            try {
                await fetch('/api/plugin/mission-control/corrections/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: parseInt(btn.dataset.id) })
                });
                _loadReflectionData(true);
            } catch (e) { console.error('[MC] Correction delete error:', e); }
        });
    });
}

// ─── Reflections ─────────────────────────────────────────────────────────────

function _renderReflections() {
    const el = document.getElementById('mc-reflections-list');
    const countEl = document.getElementById('mc-reflections-count');
    if (!el) return;
    if (countEl) countEl.textContent = _reflectionsCache.length;
    if (_reflectionsCache.length === 0) {
        el.innerHTML = '<div class="mc-empty-sm">No reflections yet \u2014 the AI will self-evaluate after complex tasks</div>';
        return;
    }
    el.innerHTML = _reflectionsCache.slice(0, 20).map(r => `
        <div class="mc-reflection-card" data-id="${r.id}">
            <div class="mc-reflection-top">
                <span class="mc-reflection-context">${escHtml((r.task_context || '').substring(0, 100))}</span>
                <span class="mc-reflection-date">${fmtDate(r.created_at)}</span>
                <button class="mc-card-btn mc-reflection-del" data-id="${r.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>
            </div>
            ${r.what_worked ? `<div class="mc-reflection-good">\u{2705} ${escHtml(r.what_worked)}</div>` : ''}
            ${r.what_didnt ? `<div class="mc-reflection-bad">\u{26A0}\u{FE0F} ${escHtml(r.what_didnt)}</div>` : ''}
            <div class="mc-reflection-lesson">\u{1F4A1} ${escHtml(r.lesson)}</div>
        </div>
    `).join('');

    el.querySelectorAll('.mc-reflection-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this reflection?')) return;
            try {
                await fetch('/api/plugin/mission-control/reflections/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: parseInt(btn.dataset.id) })
                });
                _loadReflectionData(true);
            } catch (e) { console.error('[MC] Reflection delete error:', e); }
        });
    });
}

// ─── Learned Rules ───────────────────────────────────────────────────────────

function _renderRules() {
    const el = document.getElementById('mc-rules-list');
    const countEl = document.getElementById('mc-rules-count');
    if (!el) return;
    if (countEl) countEl.textContent = _rulesCache.length;
    if (_rulesCache.length === 0) {
        el.innerHTML = '<div class="mc-empty-sm">No rules yet \u2014 add one manually or approve a bulletin board promotion</div>';
        return;
    }
    el.innerHTML = _rulesCache.map(r => {
        const sourceIcon = r.source === 'manual' ? '\u{1F9E0}' : '\u{1F916}';
        const activeClass = r.active ? 'mc-rule-active' : 'mc-rule-inactive';
        const vfmColor = r.vfm_score >= 0.8 ? '#4caf50' : r.vfm_score >= 0.5 ? '#ffc107' : '#666';
        return `<div class="mc-rule-card ${activeClass}" data-id="${r.id}">
            <div class="mc-rule-top">
                <label class="mc-rule-toggle"><input type="checkbox" ${r.active ? 'checked' : ''} data-id="${r.id}" class="mc-rule-check"> <span class="mc-rule-toggle-label">${r.active ? 'Active' : 'Inactive'}</span></label>
                <span class="mc-rule-source">${sourceIcon} ${r.source}</span>
                <span class="mc-rule-vfm" style="color:${vfmColor}">VFM: ${r.vfm_score.toFixed(2)}</span>
                <span class="mc-rule-seen">Seen ${r.times_seen}x</span>
                <button class="mc-card-btn mc-rule-del" data-id="${r.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>
            </div>
            <div class="mc-rule-text">${escHtml(r.rule)}</div>
            <div class="mc-rule-dates">${fmtDate(r.first_seen)} \u{2192} ${fmtDate(r.last_seen)}</div>
        </div>`;
    }).join('');

    el.querySelectorAll('.mc-rule-check').forEach(cb => {
        cb.addEventListener('change', async () => {
            try {
                await fetch('/api/plugin/mission-control/rules/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: parseInt(cb.dataset.id), active: cb.checked })
                });
                _loadReflectionData(true);
            } catch (e) { console.error('[MC] Rule toggle error:', e); }
        });
    });

    el.querySelectorAll('.mc-rule-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this rule?')) return;
            try {
                await fetch('/api/plugin/mission-control/rules/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: parseInt(btn.dataset.id) })
                });
                _loadReflectionData(true);
            } catch (e) { console.error('[MC] Rule delete error:', e); }
        });
    });
}

// ─── Capsules ────────────────────────────────────────────────────────────────

function _renderCapsules() {
    const el = document.getElementById('mc-capsules-grid');
    const countEl = document.getElementById('mc-capsules-count');
    if (!el) return;
    if (countEl) countEl.textContent = _capsulesCache.length;
    if (_capsulesCache.length === 0) {
        el.innerHTML = '<div class="mc-empty-sm">No reasoning capsules captured yet</div>';
        return;
    }
    el.innerHTML = _capsulesCache.slice(0, 20).map(c => {
        const full = escHtml(c.reasoning_pattern);
        const needsTrunc = full.length > 200;
        const preview = needsTrunc ? full.substring(0, 200) + '…' : full;
        return `
        <div class="mc-capsule-card" data-id="${c.id}">
            <div class="mc-capsule-top">
                <span class="mc-capsule-type">${escHtml(c.problem_type)}</span>
                <span class="mc-capsule-uses">\u{1F504} ${c.success_count}x</span>
                <button class="mc-card-btn mc-capsule-del" data-id="${c.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>
            </div>
            <div class="mc-capsule-pattern mc-capsule-collapsed" data-full="${full.replace(/"/g, '&quot;')}" data-preview="${preview.replace(/"/g, '&quot;')}">${preview}</div>
            ${needsTrunc ? '<div class="mc-capsule-expand">▼ show more</div>' : ''}
            <div class="mc-capsule-date">${fmtDate(c.last_used || c.created_at)}</div>
        </div>`;
    }).join('');

    // Expand/collapse capsule text on click
    el.querySelectorAll('.mc-capsule-expand').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.mc-capsule-card');
            const pat = card.querySelector('.mc-capsule-pattern');
            const isCollapsed = pat.classList.contains('mc-capsule-collapsed');
            pat.textContent = isCollapsed ? pat.dataset.full : pat.dataset.preview;
            pat.classList.toggle('mc-capsule-collapsed');
            pat.classList.toggle('mc-capsule-expanded');
            btn.textContent = isCollapsed ? '▲ show less' : '▼ show more';
        });
    });

    el.querySelectorAll('.mc-capsule-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this capsule?')) return;
            try {
                await fetch('/api/plugin/mission-control/capsules/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                    body: JSON.stringify({ id: parseInt(btn.dataset.id) })
                });
                _loadReflectionData(true);
            } catch (e) { console.error('[MC] Capsule delete error:', e); }
        });
    });
}

// ─── Tools Status ────────────────────────────────────────────────────────────

async function _loadToolStatus() {
    const infoEl = document.getElementById('mc-tools-info');
    const listEl = document.getElementById('mc-tools-list');
    if (!listEl) return;

    listEl.innerHTML = '<div class="mc-empty">Loading...</div>';

    try {
        const resp = await fetch('/api/plugin/mission-control/tools/status', { headers: { 'X-CSRF-Token': CSRF() } });
        const data = await resp.json();

        if (data.error) {
            listEl.innerHTML = `<div class="mc-empty">Error: ${esc(data.error)}</div>`;
            return;
        }

        const ts = data.toolset || {};
        if (infoEl) {
            const enabledCount = (data.tools || []).filter(t => t.enabled).length;
            const totalCount = (data.tools || []).length;
            infoEl.innerHTML = `
                <div class="mc-tools-banner">
                    <span class="mc-tools-toolset">Toolset: <strong>${esc(ts.toolset_name || 'unknown')}</strong></span>
                    <span class="mc-tools-counts">${enabledCount}/${totalCount} MC tools active</span>
                </div>
            `;
        }

        const tools = data.tools || [];
        if (tools.length === 0) {
            listEl.innerHTML = '<div class="mc-empty">No tools registered.</div>';
            return;
        }

        listEl.innerHTML = tools.map(t => {
            const statusClass = t.enabled ? 'mc-tool-enabled' : 'mc-tool-disabled';
            const statusIcon = t.enabled ? '\u{2705}' : '\u{274C}';
            const statusText = t.enabled ? 'Active' : 'Not in toolset';
            const params = t.params && t.params.length ? t.params.map(p => `<span class="mc-tool-param">${esc(p)}</span>`).join('') : '<span class="mc-tool-param mc-tool-param-none">none</span>';
            return `
                <div class="mc-tool-card ${statusClass}">
                    <div class="mc-tool-header">
                        <span class="mc-tool-status-icon">${statusIcon}</span>
                        <span class="mc-tool-name">${esc(t.name)}</span>
                        <span class="mc-tool-status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="mc-tool-desc">${esc(t.description)}</div>
                    <div class="mc-tool-params">Params: ${params}</div>
                </div>
            `;
        }).join('');
    } catch (e) {
        listEl.innerHTML = '<div class="mc-empty">Failed to load tool status.</div>';
        console.error('[MC] Tool status error:', e);
    }
}

// ─── Model Feedback ─────────────────────────────────────────────────────────

async function _loadFeedbackStats() {
    const summaryEl = document.getElementById('mc-feedback-summary');
    const listEl = document.getElementById('mc-feedback-list');
    if (!summaryEl || !listEl) return;

    summaryEl.innerHTML = '<div class="mc-empty">Loading...</div>';
    listEl.innerHTML = '';

    try {
        const resp = await fetch('/api/plugin/mission-control/feedback/stats', { headers: { 'X-CSRF-Token': CSRF() } });
        const data = await resp.json();

        if (data.error) {
            summaryEl.innerHTML = `<div class="mc-empty">Error: ${escHtml(data.error)}</div>`;
            return;
        }

        const stats = data.stats || [];
        if (stats.length === 0) {
            summaryEl.innerHTML = '<div class="mc-empty-sm">No feedback logged yet \u2014 use the \u{1F44E} button on chat messages to flag bad responses</div>';
            listEl.innerHTML = '';
            return;
        }

        // Summary: bar chart of per-model counts
        const maxCount = Math.max(...stats.map(s => s.count), 1);
        summaryEl.innerHTML = `
            <div class="mc-feedback-bars">
                ${stats.map(s => {
                    const pct = Math.round((s.count / maxCount) * 100);
                    const label = s.model || 'unknown';
                    const provider = s.provider && s.provider !== 'unknown' ? ` (${escHtml(s.provider)})` : '';
                    return `
                    <div class="mc-feedback-bar-row">
                        <span class="mc-feedback-bar-label">${escHtml(label)}${provider}</span>
                        <div class="mc-feedback-bar-track">
                            <div class="mc-feedback-bar-fill" style="width:${pct}%"></div>
                        </div>
                        <span class="mc-feedback-bar-count">${s.count}</span>
                    </div>`;
                }).join('')}
            </div>`;

        // Recent entries
        const recent = data.recent || [];
        if (recent.length === 0) {
            listEl.innerHTML = '<div class="mc-empty-sm">No recent entries</div>';
        } else {
            listEl.innerHTML = recent.map(r => {
                const preview = r.response_preview ? escHtml(r.response_preview).substring(0, 200) : '<em>no preview</em>';
                const model = r.model || 'unknown';
                const ts = r.timestamp ? fmtDate(r.timestamp) : '';
                return `
                <div class="mc-feedback-entry">
                    <div class="mc-feedback-entry-top">
                        <span class="mc-feedback-entry-model">${escHtml(model)}</span>
                        <span class="mc-feedback-entry-date">${ts}</span>
                    </div>
                    <div class="mc-feedback-entry-preview">${preview}</div>
                </div>`;
            }).join('');
        }
    } catch (e) {
        summaryEl.innerHTML = '<div class="mc-empty">Failed to load feedback stats.</div>';
        console.error('[MC] Feedback stats error:', e);
    }
}

// ─── Mind Panel ──────────────────────────────────────────────────────────────

function _getMindScope() {
    return (_mc && _mc.selectedScope) || 'default';
}

async function _loadMindTab(tabName) {
    const scope = _getMindScope();
    const cacheKey = `${tabName}:${scope}`;
    if (_mindDataCache[cacheKey]) {
        _renderMindTab(tabName, _mindDataCache[cacheKey]);
        return;
    }
    const container = document.getElementById('mc-mind-tab-' + tabName);
    if (container) container.innerHTML = '<div class="mc-mind-loading">Loading...</div>';

    try {
        let data;
        switch (tabName) {
            case 'memories':
                data = await fetch(`/api/memory/list?scope=${encodeURIComponent(scope)}`, { headers: { 'X-CSRF-Token': CSRF() } }).then(r => r.json());
                break;
            case 'people':
                data = await fetch(`/api/knowledge/people?scope=${encodeURIComponent(scope)}`, { headers: { 'X-CSRF-Token': CSRF() } }).then(r => r.json());
                break;
            case 'human-knowledge':
                data = await fetch(`/api/knowledge/tabs?scope=${encodeURIComponent(scope)}&type=user`, { headers: { 'X-CSRF-Token': CSRF() } }).then(r => r.json());
                break;
            case 'ai-knowledge':
                data = await fetch(`/api/knowledge/tabs?scope=${encodeURIComponent(scope)}&type=ai`, { headers: { 'X-CSRF-Token': CSRF() } }).then(r => r.json());
                break;
        }
        _mindDataCache[cacheKey] = data;
        _renderMindTab(tabName, data);
    } catch (e) {
        console.error(`[MC] Failed to load mind tab ${tabName}:`, e);
        const container = document.getElementById('mc-mind-tab-' + tabName);
        if (container) container.innerHTML = '<div class="mc-mind-empty">Failed to load data</div>';
    }
}

function _renderMindTab(tabName, data) {
    const container = document.getElementById('mc-mind-tab-' + tabName);
    if (!container) return;

    switch (tabName) {
        case 'memories': _renderMindMemories(container, data); break;
        case 'people': _renderMindPeople(container, data); break;
        case 'human-knowledge':
        case 'ai-knowledge': _renderMindKnowledge(container, data, tabName); break;
    }
}

function _renderMindMemories(container, data) {
    const grouped = data.memories || {};
    const total = data.total || 0;
    const labels = Object.keys(grouped).sort();

    if (labels.length === 0) {
        container.innerHTML = '<div class="mc-mind-empty">\u{1F4A1} No memories in this scope</div>';
        return;
    }

    let html = `<div class="mc-mind-summary">${total} memories across ${labels.length} labels</div>`;
    for (const label of labels) {
        const items = grouped[label];
        const count = items.length;
        html += `
            <div class="mc-mind-group">
                <div class="mc-mind-group-header" onclick="this.parentElement.classList.toggle('mc-mind-expanded')">
                    <span class="mc-mind-arrow">\u{25B6}</span>
                    <span class="mc-mind-group-name">${esc(label)}</span>
                    <span class="mc-mind-group-count">${count}</span>
                </div>
                <div class="mc-mind-group-items">
                    ${items.slice(0, 20).map(m => `
                        <div class="mc-mind-memory-item">
                            <div class="mc-mind-memory-text">${esc(m.content)}</div>
                            <div class="mc-mind-memory-time">${relativeTime(m.timestamp)}</div>
                        </div>
                    `).join('')}
                    ${count > 20 ? `<div class="mc-mind-more">+${count - 20} more...</div>` : ''}
                </div>
            </div>`;
    }
    container.innerHTML = html;
}

function _renderMindPeople(container, data) {
    const people = data.people || [];
    if (people.length === 0) {
        container.innerHTML = '<div class="mc-mind-empty">\u{1F465} No people in this scope</div>';
        return;
    }

    let html = `<div class="mc-mind-summary">${people.length} people</div><div class="mc-mind-people-grid">`;
    for (const p of people) {
        const rel = p.relationship ? `<span class="mc-mind-person-rel">${esc(p.relationship)}</span>` : '';
        const details = [p.email, p.phone].filter(Boolean).map(d => esc(d)).join(' \u{2022} ');
        html += `
            <div class="mc-mind-person-card">
                <div class="mc-mind-person-avatar">${(p.name || '?')[0].toUpperCase()}</div>
                <div class="mc-mind-person-info">
                    <div class="mc-mind-person-name">${esc(p.name)} ${rel}</div>
                    ${details ? `<div class="mc-mind-person-details">${details}</div>` : ''}
                    ${p.notes ? `<div class="mc-mind-person-notes">${esc(p.notes).substring(0, 100)}${p.notes.length > 100 ? '...' : ''}</div>` : ''}
                </div>
            </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function _renderMindKnowledge(container, data, tabName) {
    const tabs = data.tabs || [];
    const typeLabel = tabName === 'human-knowledge' ? 'Human Knowledge' : 'AI Knowledge';
    if (tabs.length === 0) {
        container.innerHTML = `<div class="mc-mind-empty">\u{1F4DA} No ${typeLabel.toLowerCase()} in this scope</div>`;
        return;
    }

    let html = `<div class="mc-mind-summary">${tabs.length} ${typeLabel.toLowerCase()} tabs</div>`;
    for (const tab of tabs) {
        const desc = tab.description ? `<div class="mc-mind-kb-desc">${esc(tab.description)}</div>` : '';
        const entryCount = tab.entry_count || 0;
        html += `
            <div class="mc-mind-group">
                <div class="mc-mind-group-header" onclick="this.parentElement.classList.toggle('mc-mind-expanded')">
                    <span class="mc-mind-arrow">\u{25B6}</span>
                    <span class="mc-mind-group-name">\u{1F4C4} ${esc(tab.name)}</span>
                    <span class="mc-mind-group-count">${entryCount} entries</span>
                </div>
                <div class="mc-mind-group-items">
                    ${desc}
                    <div class="mc-mind-kb-entries" id="mc-mind-kb-${tab.id}">
                        <button class="mc-mind-load-entries" data-tab-id="${tab.id}">Load entries</button>
                    </div>
                </div>
            </div>`;
    }
    container.innerHTML = html;

    // Bind load entries buttons
    container.querySelectorAll('.mc-mind-load-entries').forEach(btn => {
        btn.addEventListener('click', () => _loadKnowledgeEntries(parseInt(btn.dataset.tabId), btn));
    });
}

async function _loadKnowledgeEntries(tabId, btn) {
    const scope = _getMindScope();
    btn.textContent = 'Loading...';
    btn.disabled = true;
    try {
        const resp = await fetch(`/api/knowledge/tabs/${tabId}?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        const data = await resp.json();
        const entries = data.entries || [];
        const container = document.getElementById('mc-mind-kb-' + tabId);
        if (!container) return;
        if (entries.length === 0) {
            container.innerHTML = '<div class="mc-mind-empty" style="padding:8px">No entries</div>';
            return;
        }
        container.innerHTML = entries.slice(0, 10).map(e => `
            <div class="mc-mind-memory-item">
                <div class="mc-mind-memory-text">${esc((e.content || '').substring(0, 300))}${(e.content || '').length > 300 ? '...' : ''}</div>
                ${e.source_filename ? `<div class="mc-mind-memory-time">\u{1F4CE} ${esc(e.source_filename)}</div>` : ''}
            </div>
        `).join('') + (entries.length > 10 ? `<div class="mc-mind-more">+${entries.length - 10} more entries</div>` : '');
    } catch {
        btn.textContent = 'Error loading';
    }
}
