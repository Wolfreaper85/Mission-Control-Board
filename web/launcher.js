// launcher.js — Plugin launcher grid (mc-apps view)
// Discovers installed plugins and renders launchable cards.

import { CSRF } from './lib/api.js';
import { esc } from './lib/utils.js';

let _mc = null;
let _container = null;
let _cards = [];
let _order = [];
let _enabled = {};
let _cardSettings = {};
let _dragCard = null;

export function init(el, mc) {
    _mc = mc;
    _container = el;
    el.innerHTML = `<div class="mc-launcher">${_buildLauncher()}</div>`;
    _loadConfig();

    el.querySelector('#mc-launcher-settings').addEventListener('click', () => {
        _renderSettingsModal();
        document.getElementById('mc-launcher-settings-modal').style.display = '';
    });
    el.querySelector('#mc-launcher-settings-close').addEventListener('click', () => {
        document.getElementById('mc-launcher-settings-modal').style.display = 'none';
        _renderGrid();
    });
    el.querySelector('#mc-launcher-settings-done').addEventListener('click', () => {
        document.getElementById('mc-launcher-settings-modal').style.display = 'none';
        _renderGrid();
    });
    el.querySelector('#mc-launcher-settings-modal').addEventListener('click', e => {
        if (e.target.id === 'mc-launcher-settings-modal') {
            e.target.style.display = 'none';
            _renderGrid();
        }
    });

    _discoverPlugins();
}

export function show() {
    _discoverPlugins();
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function _buildLauncher() {
    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `
        <div class="mc-launcher-inner">
            <div class="mc-launcher-header">
                <div>
                    <h1 class="mc-launcher-title">${greeting}, Commander</h1>
                    <p class="mc-launcher-date">${dateStr}</p>
                </div>
                <button class="mc-launcher-settings-btn" id="mc-launcher-settings" title="Manage apps">\u{2699}\u{FE0F}</button>
            </div>
            <div class="mc-launcher-grid" id="mc-launcher-grid"></div>
        </div>
        <div class="mc-modal-overlay" id="mc-launcher-settings-modal" style="display:none">
            <div class="mc-modal" style="max-width:500px">
                <div class="mc-modal-header">
                    <h3>\u{2699}\u{FE0F} Manage Apps</h3>
                    <button class="mc-modal-close" id="mc-launcher-settings-close">\u{2715}</button>
                </div>
                <div class="mc-modal-body">
                    <p style="color:#888;font-size:0.8rem;margin-bottom:12px">Toggle which plugins appear on your launcher</p>
                    <div id="mc-launcher-toggle-list" class="mc-launcher-toggle-list"></div>
                </div>
                <div class="mc-modal-footer">
                    <button class="mc-btn" id="mc-launcher-settings-done">Done</button>
                </div>
            </div>
        </div>`;
}

// ─── Config ──────────────────────────────────────────────────────────────────

function _loadConfig() {
    try { _order = JSON.parse(localStorage.getItem('mc-launcher-order')) || []; } catch { _order = []; }
    try { _enabled = JSON.parse(localStorage.getItem('mc-launcher-enabled')) || {}; } catch { _enabled = {}; }
    try { _cardSettings = JSON.parse(localStorage.getItem('mc-launcher-card-settings')) || {}; } catch { _cardSettings = {}; }
}

function _saveConfig() {
    localStorage.setItem('mc-launcher-order', JSON.stringify(_order));
    localStorage.setItem('mc-launcher-enabled', JSON.stringify(_enabled));
    localStorage.setItem('mc-launcher-card-settings', JSON.stringify(_cardSettings));
}

// ─── Plugin Discovery ────────────────────────────────────────────────────────

async function _discoverPlugins() {
    try {
        const [pluginResp, infoResp] = await Promise.all([
            fetch('/api/webui/plugins', { headers: { 'X-CSRF-Token': CSRF() } }),
            fetch('/api/plugin/mission-control/plugin-info', { headers: { 'X-CSRF-Token': CSRF() } })
        ]);

        if (!pluginResp.ok) return;
        const data = await pluginResp.json();
        const plugins = data.plugins || data || [];

        let pluginInfo = {};
        if (infoResp.ok) {
            const infoData = await infoResp.json();
            pluginInfo = infoData.plugins || {};
        }

        _cards = [];
        _cards.push({
            id: 'mission-control-dashboard',
            name: 'Mission Control',
            description: 'Goals board, scheduler, AI chat & monitoring',
            icon: '\u{1F3AF}',
            action: 'dashboard',
            hasPreview: true
        });

        for (const p of plugins) {
            const name = p.name || p.id || '';
            if (name === 'mission-control') continue;

            const cap = p.capabilities || {};
            const hasView = cap.web === true;
            const info = pluginInfo[name] || {};

            let action = 'prompt';
            if (hasView) action = 'view';
            else if (info.has_launcher) action = 'launch';

            const card = {
                id: name,
                name: p.display_name || name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                description: p.description || '',
                icon: p.icon || '\u{1F4E6}',
                action,
                viewId: hasView ? name : null,
                detectedPrompt: info.prompt || null
            };
            _cards.push(card);

            if (!_cardSettings[name]) {
                _cardSettings[name] = { prompt: info.prompt || '', autoSend: false };
            } else if (info.prompt && !_cardSettings[name].prompt) {
                _cardSettings[name].prompt = info.prompt;
            }
        }

        for (const card of _cards) {
            if (_enabled[card.id] === undefined) {
                _enabled[card.id] = (card.id === 'mission-control-dashboard');
            }
        }
        _saveConfig();
        _renderGrid();
    } catch (e) {
        console.error('[MC] Failed to discover plugins:', e);
        if (!_cards.length) {
            _cards.push({
                id: 'mission-control-dashboard',
                name: 'Mission Control',
                description: 'Goals board, scheduler, AI chat & monitoring',
                icon: '\u{1F3AF}',
                action: 'dashboard',
                hasPreview: true
            });
        }
        _renderGrid();
    }
}

// ─── Grid Rendering ──────────────────────────────────────────────────────────

function _renderGrid() {
    const grid = document.getElementById('mc-launcher-grid');
    if (!grid) return;

    const ordered = [..._cards].filter(c => _enabled[c.id] !== false);
    if (_order.length) {
        ordered.sort((a, b) => {
            const ai = _order.indexOf(a.id);
            const bi = _order.indexOf(b.id);
            if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
    }

    grid.innerHTML = ordered.map(card => {
        const settings = _cardSettings[card.id] || {};
        const hasPrompt = settings.prompt || card.detectedPrompt;
        let badge = '';
        if (card.action === 'view') badge = 'App';
        else if (card.action === 'launch') badge = 'Launch';
        else if (card.action === 'prompt' && hasPrompt) badge = settings.autoSend ? 'Auto' : 'Ask';
        else if (card.action === 'prompt') badge = 'Tool';

        return `
        <div class="mc-app-card" data-card-id="${card.id}" draggable="true">
            <div class="mc-app-preview">
                <span class="mc-app-icon-large">${card.icon}</span>
            </div>
            <div class="mc-app-info">
                <div class="mc-app-name">${card.name}</div>
                <div class="mc-app-desc">${card.description || ''}</div>
            </div>
            ${badge ? `<div class="mc-app-badge${badge === 'Auto' ? ' mc-badge-auto' : ''}">${badge}</div>` : ''}
        </div>`;
    }).join('');

    // Card clicks
    grid.querySelectorAll('.mc-app-card').forEach(el => {
        el.addEventListener('click', () => _onCardClick(el));
        el.addEventListener('dragstart', e => { _dragCard = el.dataset.cardId; el.classList.add('mc-app-dragging'); e.dataTransfer.effectAllowed = 'move'; });
        el.addEventListener('dragend', () => { el.classList.remove('mc-app-dragging'); _dragCard = null; });
        el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('mc-app-drag-over'); });
        el.addEventListener('dragleave', () => el.classList.remove('mc-app-drag-over'));
        el.addEventListener('drop', e => {
            e.preventDefault();
            el.classList.remove('mc-app-drag-over');
            if (_dragCard && _dragCard !== el.dataset.cardId) _reorderCards(_dragCard, el.dataset.cardId);
        });
    });
}

function _onCardClick(el) {
    const id = el.dataset.cardId;
    const card = _cards.find(c => c.id === id);
    if (!card) return;

    if (card.action === 'dashboard') {
        _mc.switchView('mission-control');
    } else if (card.action === 'view' && card.viewId) {
        _mc.switchView(card.viewId);
    } else if (card.action === 'launch') {
        _launchPlugin(card.id, el);
    } else if (card.action === 'prompt') {
        const settings = _cardSettings[card.id] || {};
        const prompt = settings.prompt || card.detectedPrompt || '';
        if (prompt && settings.autoSend) {
            _mc.pendingLaunchMsg = prompt;
            _mc.switchView('mission-control');
        } else if (prompt) {
            _mc.switchView('mission-control');
            setTimeout(() => _mc.emit('prefill-chat', { text: prompt }), 500);
        } else {
            _mc.switchView('mission-control');
        }
    }
}

function _reorderCards(fromId, toId) {
    const enabled = _cards.filter(c => _enabled[c.id] !== false);
    const currentOrder = _order.length
        ? [...enabled].sort((a, b) => {
            const ai = _order.indexOf(a.id);
            const bi = _order.indexOf(b.id);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        }).map(c => c.id)
        : enabled.map(c => c.id);

    const fromIdx = currentOrder.indexOf(fromId);
    const toIdx = currentOrder.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    currentOrder.splice(fromIdx, 1);
    currentOrder.splice(toIdx, 0, fromId);
    _order = currentOrder;
    _saveConfig();
    _renderGrid();
}

async function _launchPlugin(pluginId, cardEl) {
    if (cardEl) { cardEl.style.opacity = '0.6'; cardEl.style.pointerEvents = 'none'; }
    try {
        const resp = await fetch('/api/plugin/mission-control/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ plugin: pluginId })
        });
        const data = await resp.json();
        if (data.success) {
            if (cardEl) { cardEl.style.borderColor = '#4caf50'; setTimeout(() => { cardEl.style.borderColor = ''; }, 2000); }
        } else {
            console.error('[MC] Launch failed:', data.error);
            if (cardEl) cardEl.style.borderColor = '#f44336';
        }
    } catch (e) {
        console.error('[MC] Launch error:', e);
        if (cardEl) cardEl.style.borderColor = '#f44336';
    } finally {
        if (cardEl) setTimeout(() => { cardEl.style.opacity = ''; cardEl.style.pointerEvents = ''; }, 1000);
    }
}

// ─── Settings Modal ──────────────────────────────────────────────────────────

function _renderSettingsModal() {
    const list = document.getElementById('mc-launcher-toggle-list');
    if (!list) return;

    list.innerHTML = _cards.map(card => {
        const settings = _cardSettings[card.id] || {};
        const showPromptField = card.action === 'prompt';
        const promptVal = (settings.prompt || '').replace(/"/g, '&quot;');
        const autoChecked = settings.autoSend ? 'checked' : '';

        return `
        <div class="mc-launcher-toggle-item">
            <label class="mc-launcher-toggle-row">
                <span class="mc-launcher-toggle-icon">${card.icon}</span>
                <span class="mc-launcher-toggle-name">${card.name}</span>
                <span class="mc-launcher-type-badge">${card.action === 'launch' ? 'Launch' : card.action === 'view' ? 'App' : 'Prompt'}</span>
                <input type="checkbox" class="mc-launcher-toggle-cb" data-card-id="${card.id}" ${_enabled[card.id] !== false ? 'checked' : ''}>
                <span class="mc-launcher-toggle-switch"></span>
            </label>
            ${showPromptField ? `
            <div class="mc-launcher-prompt-row" style="${_enabled[card.id] !== false ? '' : 'display:none'}">
                <input type="text" class="mc-launcher-prompt-input" data-card-id="${card.id}"
                    placeholder="Enter chat prompt for this plugin..." value="${promptVal}">
                <label class="mc-launcher-autosend-label" title="Auto-send prompt on click (skip editing)">
                    <input type="checkbox" class="mc-launcher-autosend-cb" data-card-id="${card.id}" ${autoChecked}>
                    <span class="mc-launcher-autosend-text">Auto</span>
                </label>
            </div>` : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('.mc-launcher-toggle-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            _enabled[cb.dataset.cardId] = cb.checked;
            const promptRow = cb.closest('.mc-launcher-toggle-item').querySelector('.mc-launcher-prompt-row');
            if (promptRow) promptRow.style.display = cb.checked ? '' : 'none';
            _saveConfig();
        });
    });

    list.querySelectorAll('.mc-launcher-prompt-input').forEach(input => {
        input.addEventListener('change', () => {
            const id = input.dataset.cardId;
            if (!_cardSettings[id]) _cardSettings[id] = { prompt: '', autoSend: false };
            _cardSettings[id].prompt = input.value.trim();
            _saveConfig();
        });
    });

    list.querySelectorAll('.mc-launcher-autosend-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.cardId;
            if (!_cardSettings[id]) _cardSettings[id] = { prompt: '', autoSend: false };
            _cardSettings[id].autoSend = cb.checked;
            _saveConfig();
        });
    });
}
