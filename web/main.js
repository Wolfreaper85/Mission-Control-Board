// Mission Control — main.js
// Auto-loaded by Sapphire. Injects nav item + registers dashboard view.

import { registerView, switchView } from '/static/core/router.js';

const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

// ─── Plugin entry point ─────────────────────────────────────────────────────

export default {
    init() {
        _injectNav();
        _createViewContainers();
        registerView('mc-apps', {
            init: (el) => _initLauncher(el),
            show: () => _onShowLauncher(),
            hide: () => {},
        });
        registerView('mission-control', {
            init: (el) => _initDashboard(el),
            show: () => _onShowDashboard(),
            hide: () => _onHideDashboard(),
        });
    }
};

// ─── Navigation injection ───────────────────────────────────────────────────

function _injectNav() {
    const rail = document.getElementById('nav-rail');
    if (!rail) return;
    const spacer = rail.querySelector('.nav-spacer');

    // Apps launcher button
    const appsBtn = document.createElement('button');
    appsBtn.className = 'nav-item';
    appsBtn.dataset.view = 'mc-apps';
    appsBtn.innerHTML = '<span class="nav-icon">\u{1F4F1}</span><span class="nav-label">Apps</span>';
    if (spacer) rail.insertBefore(appsBtn, spacer);
    else rail.appendChild(appsBtn);

    // Mission Control button
    const mcBtn = document.createElement('button');
    mcBtn.className = 'nav-item';
    mcBtn.dataset.view = 'mission-control';
    mcBtn.innerHTML = '<span class="nav-icon">\u{1F3AF}</span><span class="nav-label">Mission</span>';
    if (spacer) rail.insertBefore(mcBtn, spacer);
    else rail.appendChild(mcBtn);
}

function _createViewContainers() {
    const app = document.getElementById('app-content');
    if (!app) return;

    // Apps launcher view
    const appsDiv = document.createElement('div');
    appsDiv.id = 'view-mc-apps';
    appsDiv.className = 'view';
    appsDiv.style.display = 'none';
    app.appendChild(appsDiv);

    // Mission Control dashboard view
    const mcDiv = document.createElement('div');
    mcDiv.id = 'view-mission-control';
    mcDiv.className = 'view';
    mcDiv.style.display = 'none';
    app.appendChild(mcDiv);
}

// ─── State ──────────────────────────────────────────────────────────────────

let _container = null;
let _eventSource = null;
let _refreshInterval = null;
let _chatRefreshInterval = null;
let _goalsCache = [];
let _chatStream = null;
let _isStreaming = false;
let _selectedMemoryScope = '';
let _memoryScopesLoaded = false;
let _mindDataCache = {};
let _deployedGoalId = null;
let _loadGoalsTimer = null;
let _loadStatsTimer = null;
let _lastMemoriesToday = 0;
let _lastMemoriesTotal = 0;
let _lastAbandoned = 0;
let _goalSchedules = {}; // goalId -> taskId mapping
let _loadAgentsTimer = null;

// Launcher state
let _launcherCards = []; // discovered plugins
let _launcherOrder = []; // saved card order
let _launcherEnabled = {}; // which plugins are shown
let _launcherCardSettings = {}; // per-card: { prompt, autoSend }
let _dragCard = null; // currently dragged card
let _pendingLaunchMsg = null; // auto-send after switching to dashboard

// Pixel art canvas state
let _pixelState = 'idle'; // idle, thinking, typing, tool, agent, done
let _pixelIdleTimer = null;
let _pixelFrame = 0;
let _pixelAnimTimer = null;
let _offUser = null, _offAI = null; // offscreen canvases (629×1024, matching image)

// ─── Launcher init ───────────────────────────────────────────────────────────

let _launcherContainer = null;

function _initLauncher(el) {
    _launcherContainer = el;
    _injectStyles();
    el.innerHTML = `<div class="mc-launcher">${_buildLauncher()}</div>`;
    _loadLauncherConfig();

    // Bind launcher events
    el.querySelector('#mc-launcher-settings').addEventListener('click', () => {
        _renderSettingsModal();
        document.getElementById('mc-launcher-settings-modal').style.display = '';
    });
    el.querySelector('#mc-launcher-settings-close').addEventListener('click', () => {
        document.getElementById('mc-launcher-settings-modal').style.display = 'none';
        _renderLauncher();
    });
    el.querySelector('#mc-launcher-settings-done').addEventListener('click', () => {
        document.getElementById('mc-launcher-settings-modal').style.display = 'none';
        _renderLauncher();
    });
    el.querySelector('#mc-launcher-settings-modal').addEventListener('click', e => {
        if (e.target.id === 'mc-launcher-settings-modal') {
            e.target.style.display = 'none';
            _renderLauncher();
        }
    });

    _discoverPlugins();
}

function _onShowLauncher() {
    _discoverPlugins();
}

// ─── Dashboard init ─────────────────────────────────────────────────────────

function _initDashboard(el) {
    _container = el;
    _injectStyles();
    el.innerHTML = _buildLayout();
    _bindEvents(el);
    _restoreCollapseState();
}

// ─── Launcher ────────────────────────────────────────────────────────────────

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

        <!-- Settings Modal -->
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
        </div>
    `;
}

function _loadLauncherConfig() {
    try {
        const saved = localStorage.getItem('mc-launcher-order');
        _launcherOrder = saved ? JSON.parse(saved) : [];
    } catch (e) { _launcherOrder = []; }
    try {
        const saved = localStorage.getItem('mc-launcher-enabled');
        _launcherEnabled = saved ? JSON.parse(saved) : {};
    } catch (e) { _launcherEnabled = {}; }
    try {
        const saved = localStorage.getItem('mc-launcher-card-settings');
        _launcherCardSettings = saved ? JSON.parse(saved) : {};
    } catch (e) { _launcherCardSettings = {}; }
}

function _saveLauncherConfig() {
    localStorage.setItem('mc-launcher-order', JSON.stringify(_launcherOrder));
    localStorage.setItem('mc-launcher-enabled', JSON.stringify(_launcherEnabled));
    localStorage.setItem('mc-launcher-card-settings', JSON.stringify(_launcherCardSettings));
}

async function _discoverPlugins() {
    try {
        // Fetch plugin list and auto-detected info in parallel
        const [pluginResp, infoResp] = await Promise.all([
            fetch('/api/webui/plugins', { headers: { 'X-CSRF-Token': CSRF() } }),
            fetch('/api/plugin/mission-control/plugin-info', { headers: { 'X-CSRF-Token': CSRF() } })
        ]);

        if (!pluginResp.ok) return;
        const data = await pluginResp.json();
        const plugins = data.plugins || data || [];

        // Auto-detected info (PLUGIN_PROMPT, plugin_launch, etc.)
        let pluginInfo = {};
        if (infoResp.ok) {
            const infoData = await infoResp.json();
            pluginInfo = infoData.plugins || {};
        }

        _launcherCards = [];

        // Always add Mission Control dashboard as first option
        _launcherCards.push({
            id: 'mission-control-dashboard',
            name: 'Mission Control',
            description: 'Goals board, scheduler, AI chat & monitoring',
            icon: '\u{1F3AF}',
            action: 'dashboard',
            hasPreview: true
        });

        // Add all discovered plugins
        for (const p of plugins) {
            const name = p.name || p.id || '';
            if (name === 'mission-control') continue;

            const cap = p.capabilities || {};
            const hasView = cap.web === true;
            const info = pluginInfo[name] || {};

            // Determine action type:
            // 1. Has web view → 'view' (switch to Sapphire view)
            // 2. Has plugin_launch() → 'launch' (one-click direct launch)
            // 3. Has PLUGIN_PROMPT or user prompt → 'prompt' (pre-fill chat)
            // 4. Default → 'prompt' (user can set custom prompt in settings)
            let action = 'prompt';
            if (hasView) action = 'view';
            else if (info.has_launcher) action = 'launch';

            const card = {
                id: name,
                name: p.display_name || name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                description: p.description || '',
                icon: p.icon || '\u{1F4E6}',
                action: action,
                viewId: hasView ? name : null,
                detectedPrompt: info.prompt || null // from PLUGIN_PROMPT
            };

            _launcherCards.push(card);

            // Set default card settings from auto-detected prompt
            if (!_launcherCardSettings[name]) {
                _launcherCardSettings[name] = {
                    prompt: info.prompt || '',
                    autoSend: false
                };
            } else if (info.prompt && !_launcherCardSettings[name].prompt) {
                // Fill in detected prompt if user hasn't set one
                _launcherCardSettings[name].prompt = info.prompt;
            }
        }

        // Set defaults — Mission Control always on, others off until user enables
        for (const card of _launcherCards) {
            if (_launcherEnabled[card.id] === undefined) {
                _launcherEnabled[card.id] = (card.id === 'mission-control-dashboard');
            }
        }
        _saveLauncherConfig();
        _renderLauncher();
    } catch (e) {
        console.error('[MC] Failed to discover plugins:', e);
        // Still render with what we have
        if (!_launcherCards.length) {
            _launcherCards.push({
                id: 'mission-control-dashboard',
                name: 'Mission Control',
                description: 'Goals board, scheduler, AI chat & monitoring',
                icon: '\u{1F3AF}',
                action: 'dashboard',
                hasPreview: true
            });
        }
        _renderLauncher();
    }
}

function _renderLauncher() {
    const grid = document.getElementById('mc-launcher-grid');
    if (!grid) return;

    // Sort by saved order, then alphabetical for new ones
    const ordered = [..._launcherCards].filter(c => _launcherEnabled[c.id] !== false);
    if (_launcherOrder.length) {
        ordered.sort((a, b) => {
            const ai = _launcherOrder.indexOf(a.id);
            const bi = _launcherOrder.indexOf(b.id);
            if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
    }

    grid.innerHTML = ordered.map(card => {
        const settings = _launcherCardSettings[card.id] || {};
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

    // Bind card clicks
    grid.querySelectorAll('.mc-app-card').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.cardId;
            const card = _launcherCards.find(c => c.id === id);
            if (!card) return;
            if (card.action === 'dashboard') {
                _switchToDashboard();
            } else if (card.action === 'view' && card.viewId) {
                switchView(card.viewId);
            } else if (card.action === 'launch') {
                _launchPlugin(card.id, el);
            } else if (card.action === 'prompt') {
                const settings = _launcherCardSettings[card.id] || {};
                const prompt = settings.prompt || card.detectedPrompt || '';
                if (prompt) {
                    if (settings.autoSend) {
                        // Set pending BEFORE switching so _startDashboardPolling picks it up
                        _pendingLaunchMsg = prompt;
                        _switchToDashboard();
                    } else {
                        // Pre-fill chat, don't auto-send
                        _switchToDashboard();
                        setTimeout(() => {
                            const input = document.getElementById('mc-chat-input');
                            if (input) {
                                input.value = prompt;
                                input.focus();
                                input.dispatchEvent(new Event('input'));
                            }
                        }, 500);
                    }
                } else {
                    _switchToDashboard();
                }
            }
        });

        // Drag & drop reorder
        el.addEventListener('dragstart', e => {
            _dragCard = el.dataset.cardId;
            el.classList.add('mc-app-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('mc-app-dragging');
            _dragCard = null;
        });
        el.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('mc-app-drag-over');
        });
        el.addEventListener('dragleave', () => {
            el.classList.remove('mc-app-drag-over');
        });
        el.addEventListener('drop', e => {
            e.preventDefault();
            el.classList.remove('mc-app-drag-over');
            const targetId = el.dataset.cardId;
            if (_dragCard && _dragCard !== targetId) {
                _reorderCards(_dragCard, targetId);
            }
        });
    });
}

function _reorderCards(fromId, toId) {
    const enabled = _launcherCards.filter(c => _launcherEnabled[c.id] !== false);
    const currentOrder = _launcherOrder.length
        ? [...enabled].sort((a, b) => {
            const ai = _launcherOrder.indexOf(a.id);
            const bi = _launcherOrder.indexOf(b.id);
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
    _launcherOrder = currentOrder;
    _saveLauncherConfig();
    _renderLauncher();
}

function _switchToDashboard() {
    switchView('mission-control');
}

async function _launchPlugin(pluginId, cardEl) {
    // Visual feedback
    if (cardEl) {
        cardEl.style.opacity = '0.6';
        cardEl.style.pointerEvents = 'none';
    }
    try {
        const resp = await fetch('/api/plugin/mission-control/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ plugin: pluginId })
        });
        const data = await resp.json();
        if (data.success) {
            // Brief success flash
            if (cardEl) {
                cardEl.style.borderColor = '#4caf50';
                setTimeout(() => { cardEl.style.borderColor = ''; }, 2000);
            }
        } else {
            console.error('[MC] Launch failed:', data.error);
            if (cardEl) cardEl.style.borderColor = '#f44336';
        }
    } catch (e) {
        console.error('[MC] Launch error:', e);
        if (cardEl) cardEl.style.borderColor = '#f44336';
    } finally {
        if (cardEl) {
            setTimeout(() => {
                cardEl.style.opacity = '';
                cardEl.style.pointerEvents = '';
            }, 1000);
        }
    }
}

function _renderSettingsModal() {
    const list = document.getElementById('mc-launcher-toggle-list');
    if (!list) return;

    list.innerHTML = _launcherCards.map(card => {
        const settings = _launcherCardSettings[card.id] || {};
        const showPromptField = card.action === 'prompt';
        const promptVal = (settings.prompt || '').replace(/"/g, '&quot;');
        const autoChecked = settings.autoSend ? 'checked' : '';

        return `
        <div class="mc-launcher-toggle-item">
            <label class="mc-launcher-toggle-row">
                <span class="mc-launcher-toggle-icon">${card.icon}</span>
                <span class="mc-launcher-toggle-name">${card.name}</span>
                <span class="mc-launcher-type-badge">${card.action === 'launch' ? 'Launch' : card.action === 'view' ? 'App' : 'Prompt'}</span>
                <input type="checkbox" class="mc-launcher-toggle-cb" data-card-id="${card.id}" ${_launcherEnabled[card.id] !== false ? 'checked' : ''}>
                <span class="mc-launcher-toggle-switch"></span>
            </label>
            ${showPromptField ? `
            <div class="mc-launcher-prompt-row" style="${_launcherEnabled[card.id] !== false ? '' : 'display:none'}">
                <input type="text" class="mc-launcher-prompt-input" data-card-id="${card.id}"
                    placeholder="Enter chat prompt for this plugin..." value="${promptVal}">
                <label class="mc-launcher-autosend-label" title="Auto-send prompt on click (skip editing)">
                    <input type="checkbox" class="mc-launcher-autosend-cb" data-card-id="${card.id}" ${autoChecked}>
                    <span class="mc-launcher-autosend-text">Auto</span>
                </label>
            </div>` : ''}
        </div>`;
    }).join('');

    // Bind enable toggles
    list.querySelectorAll('.mc-launcher-toggle-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            _launcherEnabled[cb.dataset.cardId] = cb.checked;
            // Show/hide prompt row
            const promptRow = cb.closest('.mc-launcher-toggle-item').querySelector('.mc-launcher-prompt-row');
            if (promptRow) promptRow.style.display = cb.checked ? '' : 'none';
            _saveLauncherConfig();
        });
    });

    // Bind prompt inputs
    list.querySelectorAll('.mc-launcher-prompt-input').forEach(input => {
        input.addEventListener('change', () => {
            const id = input.dataset.cardId;
            if (!_launcherCardSettings[id]) _launcherCardSettings[id] = { prompt: '', autoSend: false };
            _launcherCardSettings[id].prompt = input.value.trim();
            _saveLauncherConfig();
        });
    });

    // Bind auto-send toggles
    list.querySelectorAll('.mc-launcher-autosend-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = cb.dataset.cardId;
            if (!_launcherCardSettings[id]) _launcherCardSettings[id] = { prompt: '', autoSend: false };
            _launcherCardSettings[id].autoSend = cb.checked;
            _saveLauncherConfig();
        });
    });
}

// ─── Dashboard layout ────────────────────────────────────────────────────────

function _buildLayout() {
    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return `
    <div class="mc-root" id="mc-root">
        <!-- Collapse toggle (visible when chat is collapsed) -->
        <button class="mc-expand-btn" id="mc-expand-btn" title="Open chat panel">\u{1F4AC}</button>

        <!-- ═══ LEFT: Chat Panel ═══ -->
        <div class="mc-chat-panel" id="mc-chat-panel">
            <!-- Persona banner -->
            <div class="mc-persona-bar" id="mc-persona-bar">
                <div class="mc-persona-avatar-wrap" id="mc-persona-click">
                    <img class="mc-persona-avatar" id="mc-persona-avatar" src="" alt="">
                    <div class="mc-persona-avatar-fallback" id="mc-persona-fallback">AI</div>
                </div>
                <div class="mc-persona-info">
                    <span class="mc-persona-name" id="mc-persona-name">Sapphire</span>
                    <span class="mc-persona-label">Active Persona</span>
                </div>
                <button class="mc-persona-switch-btn" id="mc-persona-switch" title="Switch persona">\u{25BC}</button>
                <button class="mc-collapse-btn" id="mc-collapse-btn" title="Collapse chat">\u{25C0}</button>
            </div>
            <!-- Persona dropdown -->
            <div class="mc-persona-dropdown" id="mc-persona-dropdown" style="display:none">
                <div class="mc-persona-grid" id="mc-persona-grid"></div>
            </div>
            <!-- Chat name + controls -->
            <div class="mc-chat-header">
                <span class="mc-chat-header-name" id="mc-chat-name">Chat</span>
                <div class="mc-chat-header-actions">
                    <button class="mc-chat-hdr-btn" id="mc-chat-switcher" title="Switch chat">\u{25BC}</button>
                </div>
            </div>
            <!-- Chat switcher dropdown -->
            <div class="mc-chat-dropdown" id="mc-chat-dropdown" style="display:none">
                <div class="mc-chat-dropdown-header">
                    <span class="mc-dropdown-title">Chats</span>
                    <button class="mc-chat-hdr-btn" id="mc-chat-new" title="New chat">\u{2795}</button>
                </div>
                <div class="mc-chat-list" id="mc-chat-list"></div>
                <div class="mc-chat-dropdown-footer">
                    <button class="mc-chat-action-btn" id="mc-chat-clear" title="Clear current chat">\u{1F5D1} Clear</button>
                    <button class="mc-chat-action-btn" id="mc-chat-export" title="Export chat">\u{1F4E4} Export</button>
                    <button class="mc-chat-action-btn" id="mc-chat-import" title="Import chat">\u{1F4E5} Import</button>
                </div>
            </div>
            <input type="file" id="mc-import-file" accept=".json" style="display:none">
            <div class="mc-chat-messages" id="mc-chat-messages">
                <div class="mc-chat-welcome">
                    <div class="mc-chat-welcome-icon">\u{1F3AF}</div>
                    <div class="mc-chat-welcome-text">Mission Control</div>
                    <div class="mc-chat-welcome-sub">Chat with your AI from here.<br>Agents, goals, and tools \u{2014} all in one view.</div>
                </div>
            </div>
            <div class="mc-chat-input-wrap">
                <div class="mc-chat-streaming-indicator" id="mc-streaming-indicator" style="display:none">
                    <span class="mc-typing-dots"><span></span><span></span><span></span></span>
                    <span>AI is responding...</span>
                    <button class="mc-chat-cancel" id="mc-chat-cancel" title="Cancel">\u{2715}</button>
                </div>
                <div class="mc-chat-input-row">
                    <textarea class="mc-chat-input" id="mc-chat-input" placeholder="Send a message..." rows="1"></textarea>
                    <button class="mc-chat-send" id="mc-chat-send" title="Send">\u{27A4}</button>
                </div>
            </div>
        </div>

        <!-- ═══ RIGHT: Dashboard ═══ -->
        <div class="mc-dash">
            <!-- Header -->
            <header class="mc-header">
                <div class="mc-header-left">
                    <button class="mc-back-btn" id="mc-back-to-launcher" title="Back to apps">\u{2B05}\u{FE0F}</button>
                    <h1 class="mc-greeting">${greeting}</h1>
                    <p class="mc-date">${dateStr} &middot; <span id="mc-tasks-remaining">0 tasks remaining</span></p>
                </div>
                <div class="mc-header-right">
                    <div class="mc-agent-status" id="mc-agent-badge">
                        <span class="mc-status-dot mc-dot-idle"></span>
                        <div class="mc-status-text">
                            <span class="mc-status-name">Agents</span>
                            <span class="mc-status-sub" id="mc-agent-status-text">Idle</span>
                        </div>
                    </div>
                </div>
            </header>

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
                <div class="mc-stat-card mc-border-purple mc-stat-memories mc-stat-mind">
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
                        <button class="mc-mind-btn" data-mind-tab="memories" title="Memories">\u{1F4A1}</button>
                        <button class="mc-mind-btn" data-mind-tab="people" title="People">\u{1F465}</button>
                        <button class="mc-mind-btn" data-mind-tab="human-knowledge" title="Human Knowledge">\u{1F4DA}</button>
                        <button class="mc-mind-btn" data-mind-tab="ai-knowledge" title="AI Knowledge">\u{1F916}</button>
                    </div>
                    <!-- Hidden select to keep existing logic working -->
                    <select id="mc-memory-scope" style="display:none"><option value="">All</option></select>
                </div>
                <div class="mc-stat-card mc-border-blue">
                    <div class="mc-stat-top"><span class="mc-stat-label">AGENTS</span><span class="mc-stat-icon">\u{1F916}</span></div>
                    <div class="mc-stat-num" id="mc-s-agents">0</div>
                </div>
            </div>

            <!-- Mind Drawer (expands when a Mind tab button is clicked) -->
            <div class="mc-mind-drawer" id="mc-mind-drawer" style="display:none">
                <div class="mc-mind-drawer-header">
                    <span class="mc-mind-drawer-title" id="mc-mind-drawer-title">\u{1F4A1} Memories</span>
                    <button class="mc-mind-drawer-close" id="mc-mind-drawer-close" title="Close">\u{2715}</button>
                </div>
                <div class="mc-mind-body" id="mc-mind-body">
                    <div class="mc-mind-content" id="mc-mind-tab-memories"></div>
                    <div class="mc-mind-content" id="mc-mind-tab-people" style="display:none"></div>
                    <div class="mc-mind-content" id="mc-mind-tab-human-knowledge" style="display:none"></div>
                    <div class="mc-mind-content" id="mc-mind-tab-ai-knowledge" style="display:none"></div>
                </div>
            </div>

            <!-- Progress Bar -->
            <div class="mc-progress-bar-wrap">
                <div class="mc-progress-bar" id="mc-progress-bar" style="width:0%"></div>
            </div>

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

            <!-- Goals Board -->
            <div class="mc-board-section">

                <div class="mc-board-header">
                    <h2 class="mc-section-title">\u{1F4CB} Goals Board</h2>
                    <button class="mc-btn mc-btn-accent" id="mc-add-goal">\u{2795} New Goal</button>
                </div>
                <div class="mc-board" id="mc-board">
                    <div class="mc-column" data-status="permanent">
                        <div class="mc-column-head"><span class="mc-col-dot" style="background:#9c27b0"></span> Permanent <span class="mc-col-count" id="mc-col-permanent-count">0</span></div>
                        <div class="mc-column-cards" id="mc-col-permanent"></div>
                    </div>
                    <div class="mc-column" data-status="active">
                        <div class="mc-column-head"><span class="mc-col-dot" style="background:#f44336"></span> Active <span class="mc-col-count" id="mc-col-active-count">0</span></div>
                        <div class="mc-column-cards" id="mc-col-active"></div>
                    </div>
                    <div class="mc-column" data-status="completed">
                        <div class="mc-column-head"><span class="mc-col-dot" style="background:#4caf50"></span> Completed <span class="mc-col-count" id="mc-col-completed-count">0</span></div>
                        <div class="mc-column-cards" id="mc-col-completed"></div>
                    </div>
                    <div class="mc-column" data-status="abandoned">
                        <div class="mc-column-head"><span class="mc-col-dot" style="background:#666"></span> Abandoned <span class="mc-col-count" id="mc-col-abandoned-count">0</span></div>
                        <div class="mc-column-cards" id="mc-col-abandoned"></div>
                    </div>
                </div>
            </div>

            <!-- Schedule Calendar -->
            <div class="mc-calendar-section" id="mc-calendar-section">
                <div class="mc-board-header">
                    <h2 class="mc-section-title">\u{1F4C5} Schedule</h2>
                </div>
                <div class="mc-week-grid" id="mc-week-grid"></div>
                <div class="mc-next-up" id="mc-next-up">
                    <div class="mc-next-up-header">\u{1F4CB} Next Up</div>
                    <div class="mc-next-up-list" id="mc-next-up-list"></div>
                </div>
            </div>

            <!-- Pixel Art Workshop — 16-bit Canvas with image backgrounds -->
            <div class="mc-pixel-section" id="mc-pixel-section">
                <div class="mc-pixel-stage">
                    <div class="mc-pixel-desk">
                        <canvas class="mc-pixel-canvas" id="mc-px-user-cv" width="320" height="520"></canvas>
                    </div>
                    <div class="mc-pixel-hub">
                        <div class="mc-pixel-hub-core" id="mc-pixel-hub">
                            <div class="mc-pixel-hub-ring"></div>
                            <div class="mc-pixel-hub-dot"></div>
                        </div>
                        <div class="mc-pixel-data-stream" id="mc-pixel-stream">
                            <div class="mc-pixel-particle mc-p1"></div>
                            <div class="mc-pixel-particle mc-p2"></div>
                            <div class="mc-pixel-particle mc-p3"></div>
                            <div class="mc-pixel-particle mc-p4"></div>
                        </div>
                        <div class="mc-pixel-status" id="mc-pixel-status">IDLE</div>
                    </div>
                    <div class="mc-pixel-desk">
                        <canvas class="mc-pixel-canvas" id="mc-px-ai-cv" width="320" height="520"></canvas>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- New Goal Modal -->
    <div class="mc-modal-overlay" id="mc-modal" style="display:none">
        <div class="mc-modal">
            <div class="mc-modal-header">
                <h3>New Goal</h3>
                <button class="mc-modal-close" id="mc-modal-close">\u{2715}</button>
            </div>
            <div class="mc-modal-body">
                <label class="mc-label">Title</label>
                <input type="text" class="mc-input" id="mc-goal-title" maxlength="200" placeholder="What needs to be done?">
                <label class="mc-label">Description</label>
                <textarea class="mc-input mc-textarea" id="mc-goal-desc" maxlength="500" placeholder="Optional context or details..."></textarea>
                <label class="mc-label">Priority</label>
                <select class="mc-input" id="mc-goal-priority">
                    <option value="medium" selected>Medium</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                </select>
                <label class="mc-perm-check"><input type="checkbox" id="mc-goal-permanent"> <span>\u267E\uFE0F Permanent Goal</span> <span class="mc-perm-hint">— stays active, cannot be completed or abandoned</span></label>
            </div>
            <div class="mc-modal-footer">
                <button class="mc-btn" id="mc-modal-cancel">Cancel</button>
                <button class="mc-btn mc-btn-accent" id="mc-modal-save">Create Goal</button>
            </div>
        </div>
    </div>

    <!-- Schedule Goal Modal -->
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
                <select class="mc-input" id="mc-sched-persona">
                    <option value="">Default</option>
                </select>

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
    `;
}

function _bindEvents(el) {
    // Dashboard back button
    el.querySelector('#mc-back-to-launcher').addEventListener('click', () => switchView('mc-apps'));

    // Goal modal
    el.querySelector('#mc-add-goal').addEventListener('click', () => _showModal());
    el.querySelector('#mc-modal-close').addEventListener('click', () => _hideModal());
    el.querySelector('#mc-modal-cancel').addEventListener('click', () => _hideModal());
    el.querySelector('#mc-modal-save').addEventListener('click', () => _saveGoal());
    el.querySelector('#mc-modal').addEventListener('click', e => {
        if (e.target.id === 'mc-modal') _hideModal();
    });

    // Schedule modal
    el.querySelector('#mc-sched-close').addEventListener('click', () => _hideScheduleModal());
    el.querySelector('#mc-sched-cancel').addEventListener('click', () => _hideScheduleModal());
    el.querySelector('#mc-sched-save').addEventListener('click', () => _saveSchedule());
    el.querySelector('#mc-sched-remove').addEventListener('click', () => _removeSchedule());
    el.querySelector('#mc-sched-modal').addEventListener('click', e => {
        if (e.target.id === 'mc-sched-modal') _hideScheduleModal();
    });
    el.querySelector('#mc-sched-freq').addEventListener('change', () => _updateSchedUI());
    el.querySelector('#mc-sched-time').addEventListener('change', () => _updateSchedPreview());
    el.querySelector('#mc-sched-interval').addEventListener('input', () => _updateSchedPreview());
    el.querySelector('#mc-sched-cron').addEventListener('input', () => _updateSchedPreview());
    el.querySelector('#mc-sched-mode').addEventListener('change', () => _updateSchedPreview());
    el.querySelectorAll('.mc-day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('mc-day-active');
            _updateSchedPreview();
        });
    });

    // Chat input
    const input = el.querySelector('#mc-chat-input');
    const sendBtn = el.querySelector('#mc-chat-send');
    const cancelBtn = el.querySelector('#mc-chat-cancel');

    sendBtn.addEventListener('click', () => _sendMessage());
    cancelBtn.addEventListener('click', () => _cancelStream());

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _sendMessage();
        }
    });

    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Memory/Mind scope selector
    el.querySelector('#mc-memory-scope').addEventListener('change', e => {
        _selectedMemoryScope = e.target.value;
        _mindDataCache = {};  // Clear mind cache on scope change
        _loadStats();
        // Reload active mind tab if drawer is open
        const drawer = document.getElementById('mc-mind-drawer');
        const activeBtn = el.querySelector('.mc-mind-btn-active');
        if (drawer && drawer.style.display !== 'none' && activeBtn) {
            _loadMindTab(activeBtn.dataset.mindTab);
        }
    });

    // Chat panel collapse/expand
    el.querySelector('#mc-collapse-btn').addEventListener('click', () => _toggleChatPanel(true));
    el.querySelector('#mc-expand-btn').addEventListener('click', () => _toggleChatPanel(false));

    // Persona switcher
    el.querySelector('#mc-persona-switch').addEventListener('click', () => _togglePersonaDropdown());
    el.querySelector('#mc-persona-click').addEventListener('click', () => _togglePersonaDropdown());
    document.addEventListener('click', e => {
        const dd = document.getElementById('mc-persona-dropdown');
        const bar = document.getElementById('mc-persona-bar');
        if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && !bar.contains(e.target)) {
            dd.style.display = 'none';
        }
    });

    // Chat management
    el.querySelector('#mc-chat-switcher').addEventListener('click', () => _toggleChatDropdown());
    el.querySelector('#mc-chat-new').addEventListener('click', () => _createNewChat());
    el.querySelector('#mc-chat-clear').addEventListener('click', () => _clearChat());
    el.querySelector('#mc-chat-export').addEventListener('click', () => _exportChat());
    el.querySelector('#mc-chat-import').addEventListener('click', () => {
        el.querySelector('#mc-import-file').click();
    });
    el.querySelector('#mc-import-file').addEventListener('change', e => _importChat(e));

    // Close dropdown on outside click
    document.addEventListener('click', e => {
        const dropdown = document.getElementById('mc-chat-dropdown');
        const switcher = document.getElementById('mc-chat-switcher');
        if (dropdown && dropdown.style.display !== 'none' && !dropdown.contains(e.target) && e.target !== switcher) {
            dropdown.style.display = 'none';
        }
    });

    // Mind content buttons (ones with data-mind-tab)
    el.querySelectorAll('.mc-mind-btn[data-mind-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.mindTab;
            const drawer = document.getElementById('mc-mind-drawer');
            const activeBtn = el.querySelector('.mc-mind-btn-active[data-mind-tab]');

            // If same button clicked again, close the drawer
            if (activeBtn === btn && drawer.style.display !== 'none') {
                drawer.style.display = 'none';
                btn.classList.remove('mc-mind-btn-active');
                return;
            }

            // Deactivate previous, activate new
            el.querySelectorAll('.mc-mind-btn[data-mind-tab]').forEach(b => b.classList.remove('mc-mind-btn-active'));
            btn.classList.add('mc-mind-btn-active');

            // Switch content
            el.querySelectorAll('.mc-mind-content').forEach(c => c.style.display = 'none');
            const target = document.getElementById('mc-mind-tab-' + tabName);
            if (target) target.style.display = 'block';

            // Update drawer title
            const titles = { 'memories': '\u{1F4A1} Memories', 'people': '\u{1F465} People', 'human-knowledge': '\u{1F4DA} Human Knowledge', 'ai-knowledge': '\u{1F916} AI Knowledge' };
            const titleEl = document.getElementById('mc-mind-drawer-title');
            if (titleEl) titleEl.textContent = titles[tabName] || tabName;

            // Show drawer & load data
            drawer.style.display = 'block';
            _loadMindTab(tabName);
        });
    });

    // Mind scope button + dropdown
    el.querySelector('#mc-mind-scope-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('mc-mind-scope-dropdown');
        if (dd.style.display !== 'none') {
            dd.style.display = 'none';
            return;
        }
        _populateMindScopeDropdown();
        dd.style.display = 'block';
    });

    // Close scope dropdown on outside click
    document.addEventListener('click', e => {
        const dd = document.getElementById('mc-mind-scope-dropdown');
        const btn = document.getElementById('mc-mind-scope-btn');
        if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && e.target !== btn) {
            dd.style.display = 'none';
        }
    });

    // Mind drawer close button
    el.querySelector('#mc-mind-drawer-close').addEventListener('click', () => {
        document.getElementById('mc-mind-drawer').style.display = 'none';
        el.querySelectorAll('.mc-mind-btn[data-mind-tab]').forEach(b => b.classList.remove('mc-mind-btn-active'));
    });
}

// ─── Show/Hide lifecycle ────────────────────────────────────────────────────

function _onShowDashboard() {
    _startDashboardPolling();
    _setPixelState('idle');
    _initPixelArt();
}

function _onHideDashboard() {
    _stopDashboardPolling();
    _stopPixelArt();
}

function _startDashboardPolling() {
    // Clean up any stale intervals/connections first
    if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
    if (_eventSource) { _eventSource.close(); _eventSource = null; }

    _loadAll();
    _loadChatHistory();
    _loadActivePersona();
    _refreshInterval = setInterval(async () => {
        _loadStats();
        _loadAgents();
        _checkScheduleStamps();
        const prevScheduleKeys = Object.keys(_goalSchedules).join(',');
        await _loadGoalSchedules();
        const newScheduleKeys = Object.keys(_goalSchedules).join(',');
        if (prevScheduleKeys !== newScheduleKeys) {
            _loadGoals();
        } else {
            document.querySelectorAll('.mc-countdown').forEach(el => {
                const goalId = el.dataset.goalId;
                const sched = _goalSchedules[goalId];
                if (sched && sched.schedule) el.textContent = _getCountdown(sched.schedule);
            });
        }
    }, 10000);
    _chatRefreshInterval = setInterval(() => {
        if (!_isStreaming) _loadChatHistory();
    }, 30000);
    _connectEvents();

    // Auto-send pending launch message (from launcher card click)
    if (_pendingLaunchMsg) {
        const msg = _pendingLaunchMsg;
        _pendingLaunchMsg = null;
        setTimeout(() => {
            const input = document.getElementById('mc-chat-input');
            if (input) {
                input.value = msg;
                _sendMessage();
            }
        }, 500);
    }
}

function _stopDashboardPolling() {
    if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
    if (_chatRefreshInterval) { clearInterval(_chatRefreshInterval); _chatRefreshInterval = null; }
    if (_eventSource) { _eventSource.close(); _eventSource = null; }
    clearTimeout(_loadGoalsTimer);
    clearTimeout(_loadStatsTimer);
    clearTimeout(_loadAgentsTimer);
}

// ─── Chat Panel ─────────────────────────────────────────────────────────────

async function _loadChatHistory() {
    try {
        const resp = await fetch('/api/history', { headers: { 'X-CSRF-Token': CSRF() } });
        if (resp.status === 429) { console.warn('[MC] History rate-limited, retrying...'); setTimeout(_loadChatHistory, 2000); return; }
        if (!resp.ok) return;
        const data = await resp.json();
        const container = document.getElementById('mc-chat-messages');
        if (!container) return;

        // Set chat name
        const nameEl = document.getElementById('mc-chat-name');
        if (nameEl && data.chat_name) nameEl.textContent = data.chat_name;

        if (!data.messages || data.messages.length === 0) {
            container.innerHTML = `
                <div class="mc-chat-welcome">
                    <div class="mc-chat-welcome-icon">\u{1F3AF}</div>
                    <div class="mc-chat-welcome-text">Mission Control</div>
                    <div class="mc-chat-welcome-sub">Chat with your AI from here.<br>Agents, goals, and tools \u{2014} all in one view.</div>
                </div>`;
            return;
        }

        // Clear welcome screen, render history
        container.innerHTML = '';
        for (const msg of data.messages) {
            if (msg.role === 'user') {
                _appendChatBubble('user', msg.content || '');
            } else if (msg.role === 'assistant') {
                // Parts-based assistant messages (API returns type:"content" with "text" field)
                let text = '';
                if (msg.parts) {
                    for (const part of msg.parts) {
                        if (part.type === 'content') text += part.text || '';
                        else if (part.type === 'tool_call') {
                            text += `\n\u{1F527} ${part.name || 'tool'}...\n`;
                        } else if (part.type === 'tool_result') {
                            const status = part.result?.includes?.('error') ? '\u{274C}' : '\u{2705}';
                            text += ` ${status}\n`;
                        }
                    }
                } else {
                    text = msg.content || '';
                }
                if (text.trim()) _appendChatBubble('assistant', text.trim());
            }
        }
        _scrollChat();
    } catch (e) {
        console.error('[MC] Failed to load chat history:', e);
    }
}

function _appendChatBubble(role, text) {
    const container = document.getElementById('mc-chat-messages');
    if (!container) return;

    // Remove welcome if still present
    const welcome = container.querySelector('.mc-chat-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `mc-bubble mc-bubble-${role}`;

    if (role === 'user') {
        bubble.innerHTML = `<div class="mc-bubble-content">${_esc(text)}</div>`;
    } else {
        // Simple markdown-ish rendering for assistant
        bubble.innerHTML = `<div class="mc-bubble-content">${_renderMarkdown(text)}</div>`;
    }

    container.appendChild(bubble);
    return bubble;
}

function _renderMarkdown(text) {
    // Very lightweight markdown: bold, code, newlines
    let html = _esc(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code class="mc-inline-code">$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

function _scrollChat() {
    const container = document.getElementById('mc-chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
}

// ─── Chat Panel Collapse ─────────────────────────────────────────────────────

function _toggleChatPanel(collapse) {
    const root = document.getElementById('mc-root');
    if (!root) return;
    if (collapse) {
        root.classList.add('mc-chat-collapsed');
        try { localStorage.setItem('mc-chat-collapsed', '1'); } catch {}
    } else {
        root.classList.remove('mc-chat-collapsed');
        try { localStorage.setItem('mc-chat-collapsed', '0'); } catch {}
    }
}

function _restoreCollapseState() {
    try {
        if (localStorage.getItem('mc-chat-collapsed') === '1') {
            const root = document.getElementById('mc-root');
            if (root) root.classList.add('mc-chat-collapsed');
        }
    } catch {}
}

// ─── Persona Management ─────────────────────────────────────────────────────

async function _loadActivePersona() {
    try {
        const [statusResp, personasResp] = await Promise.all([
            fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } }),
            fetch('/api/personas', { headers: { 'X-CSRF-Token': CSRF() } })
        ]);
        const statusData = await statusResp.json();
        const personasData = await personasResp.json();
        const personaName = statusData.chat_settings?.persona || '';
        // Find trim color from persona list
        const trimColor = statusData.chat_settings?.trim_color || '';
        const personaEntry = (personasData.personas || []).find(p => p.name === personaName);
        const color = trimColor || personaEntry?.trim_color || '#4a9eff';
        _setPersonaDisplay(personaName, color);
    } catch (e) {
        console.error('[MC] Failed to load active persona:', e);
    }
}

function _setPersonaDisplay(name, trimColor) {
    const nameEl = document.getElementById('mc-persona-name');
    const avatar = document.getElementById('mc-persona-avatar');
    const fallback = document.getElementById('mc-persona-fallback');
    const wrap = document.querySelector('.mc-persona-avatar-wrap');
    const color = trimColor || '#4a9eff';

    if (nameEl) nameEl.textContent = name || 'Sapphire';
    if (wrap) wrap.style.borderColor = color;

    if (name) {
        const avatarUrl = `/api/personas/${encodeURIComponent(name)}/avatar?_=${Date.now()}`;
        if (avatar) {
            avatar.src = avatarUrl;
            avatar.style.display = '';
            avatar.onerror = () => {
                avatar.style.display = 'none';
                if (fallback) { fallback.style.display = ''; fallback.textContent = name.charAt(0).toUpperCase(); fallback.style.color = color; }
            };
        }
        if (fallback) fallback.style.display = 'none';
    } else {
        if (avatar) avatar.style.display = 'none';
        if (fallback) { fallback.style.display = ''; fallback.textContent = 'S'; fallback.style.color = color; }
    }
}

function _togglePersonaDropdown() {
    const dd = document.getElementById('mc-persona-dropdown');
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    if (isOpen) {
        dd.style.display = 'none';
    } else {
        dd.style.display = '';
        _loadPersonaGrid();
    }
}

async function _loadPersonaGrid() {
    const grid = document.getElementById('mc-persona-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="mc-empty-sm">Loading...</div>';

    try {
        const [personasResp, statusResp] = await Promise.all([
            fetch('/api/personas', { headers: { 'X-CSRF-Token': CSRF() } }),
            fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } })
        ]);
        const personasData = await personasResp.json();
        const statusData = await statusResp.json();
        const personas = personasData.personas || [];
        const activeName = statusData.chat_settings?.persona || '';

        if (personas.length === 0) {
            grid.innerHTML = '<div class="mc-empty-sm">No personas created</div>';
            return;
        }

        grid.innerHTML = personas.map(p => {
            const name = p.name || p;
            const isActive = name === activeName;
            const hasAvatar = p.avatar;
            const tc = p.trim_color || '#4a9eff';
            return `
            <div class="mc-persona-card ${isActive ? 'mc-persona-selected' : ''}" data-name="${_esc(name)}" data-trim="${_esc(tc)}">
                ${hasAvatar
                    ? `<img class="mc-persona-card-img" src="/api/personas/${encodeURIComponent(name)}/avatar" alt="${_esc(name)}" style="border-color:${tc}" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
                    : ''}
                <div class="mc-persona-card-fallback" ${hasAvatar ? 'style="display:none"' : ''} style="border-color:${tc};color:${tc}">${_esc(name.charAt(0).toUpperCase())}</div>
                <span class="mc-persona-card-name">${_esc(name)}</span>
            </div>`;
        }).join('');

        grid.querySelectorAll('.mc-persona-card').forEach(card => {
            card.addEventListener('click', () => {
                const name = card.dataset.name;
                const trim = card.dataset.trim;
                if (name) _loadPersona(name, trim);
            });
        });
    } catch (e) {
        console.error('[MC] Failed to load personas:', e);
        grid.innerHTML = '<div class="mc-empty-sm">Failed to load</div>';
    }
}

async function _loadPersona(name, trimColor) {
    try {
        await fetch(`/api/personas/${encodeURIComponent(name)}/load`, {
            method: 'POST',
            headers: { 'X-CSRF-Token': CSRF() }
        });
        _setPersonaDisplay(name, trimColor || '#4a9eff');
        document.getElementById('mc-persona-dropdown').style.display = 'none';
    } catch (e) {
        console.error('[MC] Load persona failed:', e);
    }
}

// ─── Chat Management ────────────────────────────────────────────────────────

function _toggleChatDropdown() {
    const dropdown = document.getElementById('mc-chat-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display !== 'none';
    if (isOpen) {
        dropdown.style.display = 'none';
    } else {
        dropdown.style.display = '';
        _loadChatList();
    }
}

async function _loadChatList() {
    const list = document.getElementById('mc-chat-list');
    if (!list) return;
    try {
        const resp = await fetch('/api/chats', { headers: { 'X-CSRF-Token': CSRF() } });
        const data = await resp.json();
        const chats = data.chats || [];
        const activeChat = data.active_chat || '';

        if (chats.length === 0) {
            list.innerHTML = '<div class="mc-empty-sm">No chats</div>';
            return;
        }

        list.innerHTML = chats.map(c => {
            const name = c.name || c;
            const isActive = name === activeChat;
            const displayName = c.display_name || name;
            return `
            <div class="mc-chat-list-item ${isActive ? 'mc-chat-active' : ''}" data-name="${_esc(name)}">
                <span class="mc-chat-list-name">${_esc(displayName)}</span>
                ${!isActive ? `<button class="mc-chat-list-del" data-name="${_esc(name)}" title="Delete">\u{2715}</button>` : ''}
            </div>`;
        }).join('');

        // Switch chat on click
        list.querySelectorAll('.mc-chat-list-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.classList.contains('mc-chat-list-del')) return;
                const name = item.dataset.name;
                if (name) _switchChat(name);
            });
        });

        // Delete chat
        list.querySelectorAll('.mc-chat-list-del').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const name = btn.dataset.name;
                if (name && confirm(`Delete chat "${name}"?`)) _deleteChat(name);
            });
        });
    } catch (e) {
        console.error('[MC] Failed to load chat list:', e);
    }
}

async function _switchChat(name) {
    try {
        await fetch(`/api/chats/${encodeURIComponent(name)}/activate`, {
            method: 'POST',
            headers: { 'X-CSRF-Token': CSRF() }
        });
        _setText('mc-chat-name', name);
        document.getElementById('mc-chat-dropdown').style.display = 'none';
        _loadChatHistory();
    } catch (e) {
        console.error('[MC] Switch chat failed:', e);
    }
}

async function _createNewChat() {
    const name = prompt('New chat name:');
    if (!name || !name.trim()) return;
    try {
        const resp = await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ name: name.trim() })
        });
        if (resp.ok) {
            await _switchChat(name.trim());
            _loadChatList();
        } else {
            const err = await resp.json().catch(() => ({}));
            alert(err.detail || 'Failed to create chat');
        }
    } catch (e) {
        console.error('[MC] Create chat failed:', e);
    }
}

async function _deleteChat(name) {
    try {
        await fetch(`/api/chats/${encodeURIComponent(name)}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': CSRF() }
        });
        _loadChatList();
        _loadChatHistory();
        // Update header with current active chat
        const activeResp = await fetch('/api/chats/active', { headers: { 'X-CSRF-Token': CSRF() } });
        const activeData = await activeResp.json();
        if (activeData.active_chat) _setText('mc-chat-name', activeData.active_chat);
    } catch (e) {
        console.error('[MC] Delete chat failed:', e);
    }
}

async function _clearChat() {
    if (!confirm('Clear all messages in the current chat?')) return;
    try {
        await fetch('/api/history/messages', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ count: -1 })
        });
        document.getElementById('mc-chat-dropdown').style.display = 'none';
        // Reset to welcome screen
        const container = document.getElementById('mc-chat-messages');
        if (container) {
            container.innerHTML = `
                <div class="mc-chat-welcome">
                    <div class="mc-chat-welcome-icon">\u{1F3AF}</div>
                    <div class="mc-chat-welcome-text">Mission Control</div>
                    <div class="mc-chat-welcome-sub">Chat cleared. Ready for new commands.</div>
                </div>`;
        }
    } catch (e) {
        console.error('[MC] Clear chat failed:', e);
    }
}

async function _exportChat() {
    try {
        const resp = await fetch('/api/history/raw', { headers: { 'X-CSRF-Token': CSRF() } });
        const data = await resp.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const chatName = document.getElementById('mc-chat-name')?.textContent || 'chat';
        a.href = url;
        a.download = `${chatName}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
        document.getElementById('mc-chat-dropdown').style.display = 'none';
    } catch (e) {
        console.error('[MC] Export failed:', e);
    }
}

async function _importChat(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const messages = Array.isArray(data) ? data : data.messages || data;
        if (!Array.isArray(messages)) {
            alert('Invalid chat export file');
            return;
        }
        const resp = await fetch('/api/history/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ messages })
        });
        if (resp.ok) {
            document.getElementById('mc-chat-dropdown').style.display = 'none';
            _loadChatHistory();
        } else {
            alert('Import failed');
        }
    } catch (e) {
        console.error('[MC] Import failed:', e);
        alert('Failed to read or import file');
    }
    // Reset file input
    e.target.value = '';
}

async function _sendMessage() {
    const input = document.getElementById('mc-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || _isStreaming) return;

    input.value = '';
    input.style.height = 'auto';

    // Show user message
    _appendChatBubble('user', text);
    _scrollChat();

    // Show streaming indicator
    _isStreaming = true;
    const indicator = document.getElementById('mc-streaming-indicator');
    if (indicator) indicator.style.display = '';

    // Create assistant bubble for streaming
    const bubble = _appendChatBubble('assistant', '');
    const content = bubble?.querySelector('.mc-bubble-content');
    let fullText = '';

    try {
        const resp = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ text })
        });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        _chatStream = reader;
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const evt = JSON.parse(line.slice(6));

                    if (evt.type === 'content' && evt.text) {
                        fullText += evt.text;
                        if (content) content.innerHTML = _renderMarkdown(fullText);
                        _scrollChat();
                    } else if (evt.type === 'tool_start') {
                        const toolLine = `\n\u{1F527} Running: ${evt.name || 'tool'}...\n`;
                        fullText += toolLine;
                        if (content) content.innerHTML = _renderMarkdown(fullText);
                        _scrollChat();
                    } else if (evt.type === 'tool_end') {
                        const status = evt.error ? '\u{274C} failed' : '\u{2705} done';
                        fullText += ` ${status}\n`;
                        if (content) content.innerHTML = _renderMarkdown(fullText);
                        _scrollChat();
                    } else if (evt.done || evt.cancelled) {
                        break;
                    }
                } catch {}
            }
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('[MC] Chat stream error:', e);
            if (content) content.innerHTML += '<br><span style="color:#f44336">Stream error</span>';
        }
    }

    _isStreaming = false;
    _chatStream = null;
    if (indicator) indicator.style.display = 'none';

    // Trigger TTS if enabled — send final response text to Sapphire's TTS engine
    if (fullText.trim()) {
        _triggerTTS(fullText);
    }

    // Auto-complete deployed goal or stamp a completed copy for permanent goals
    if (_deployedGoalId && _goalsCache.length > 0) {
        const goal = _goalsCache.find(g => g.id === _deployedGoalId);
        if (goal) {
            if (goal.permanent) {
                // Permanent goal — create a completed copy as a log entry
                const now = new Date();
                const stamp = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const scope = _selectedMemoryScope || 'default';
                try {
                    await fetch('/api/plugin/mission-control/goals/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                        body: JSON.stringify({
                            title: `${goal.title} — ${stamp} ${time}`,
                            description: `Completed run of permanent goal #${goal.id}`,
                            priority: goal.priority,
                            status: 'completed',
                            scope
                        })
                    });
                } catch (e) { console.error('[MC] Permanent goal stamp failed:', e); }
            } else if (goal.status === 'active') {
                // Regular goal — move to completed
                await _updateGoalStatus(_deployedGoalId, 'completed');
            }
        }
        _deployedGoalId = null;
    }

    // Refresh dashboard data after AI response (goals/agents may have changed)
    setTimeout(() => _loadAll(), 500);
}

async function _cancelStream() {
    try {
        if (_chatStream) { await _chatStream.cancel(); _chatStream = null; }
        await fetch('/api/cancel', { method: 'POST', headers: { 'X-CSRF-Token': CSRF() } });
    } catch {}
    _isStreaming = false;
    const indicator = document.getElementById('mc-streaming-indicator');
    if (indicator) indicator.style.display = 'none';
}

// ─── Data loading ───────────────────────────────────────────────────────────

function _loadAll() {
    _checkScheduleStamps();
    _loadGoalSchedules().then(() => _loadGoals());
    _loadStats();
    _loadAgents();
}

async function _checkScheduleStamps() {
    try {
        const resp = await fetch('/api/plugin/mission-control/schedule/check-stamps', {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.stamped > 0) {
                // New stamps were created, refresh goals
                setTimeout(() => _loadGoals(), 500);
            }
        }
    } catch (e) { /* silent */ }
}

function _loadGoals() {
    clearTimeout(_loadGoalsTimer);
    _loadGoalsTimer = setTimeout(_loadGoalsNow, 300);
}

async function _loadGoalsNow() {
    try {
        const scope = _selectedMemoryScope || 'default';
        const resp = await fetch(`/api/plugin/mission-control/goals?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.status === 429) { console.warn('[MC] Goals rate-limited, retrying...'); setTimeout(_loadGoalsNow, 2000); return; }
        if (!resp.ok) return; // Don't clear cache on errors
        const data = await resp.json();
        _goalsCache = data.goals || [];
        _renderBoard(_goalsCache);
        _renderCharts(_goalsCache);
        _updateImpact(); // Recalc impact now that goals are loaded
    } catch (e) {
        console.error('[MC] Failed to load goals:', e);
    }
}

function _updateImpact() {
    const doneToday = _countCompletedToday(_goalsCache);
    const doneWeek = _countCompletedThisWeek(_goalsCache);
    _setText('mc-imp-done', doneToday);
    _setText('mc-imp-week', doneWeek);
    _setText('mc-imp-progress', _countProgressNotes(_goalsCache));
    _setText('mc-imp-memories', _lastMemoriesTotal);
    _setText('mc-imp-abandoned', _lastAbandoned);
    const todayActions = doneToday + _lastMemoriesToday;
    _setText('mc-impact-badge', `${todayActions} actions today`);
}

function _loadStats() {
    clearTimeout(_loadStatsTimer);
    _loadStatsTimer = setTimeout(_loadStatsNow, 300);
}

async function _loadStatsNow() {
    try {
        // Load memory scopes dropdown (once)
        if (!_memoryScopesLoaded) {
            _memoryScopesLoaded = true;
            _loadMemoryScopes();
        }

        const scope = _selectedMemoryScope || 'default';
        const memScopeParam = _selectedMemoryScope ? `&memory_scope=${encodeURIComponent(_selectedMemoryScope)}` : '';
        const resp = await fetch(`/api/plugin/mission-control/stats?scope=${encodeURIComponent(scope)}${memScopeParam}`, {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.status === 429) { console.warn('[MC] Stats rate-limited, retrying...'); setTimeout(_loadStatsNow, 2000); return; }
        if (!resp.ok) return; // Don't clear display on errors
        const s = await resp.json();
        const total = s.goals_total || 0;
        const completed = s.goals_completed || 0;
        const active = s.goals_active || 0;
        const abandoned = s.goals_abandoned || 0;

        _setText('mc-s-total', total);
        _setText('mc-s-completed', completed);
        _setText('mc-s-active', active);
        _setText('mc-s-memories', s.memories_total || 0);
        _setText('mc-s-agents', s.agents_running || 0);
        _setText('mc-tasks-remaining', `${active} tasks remaining`);


        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const bar = document.getElementById('mc-progress-bar');
        if (bar) bar.style.width = pct + '%';

        const running = s.agents_running || 0;
        const dot = document.querySelector('.mc-status-dot');
        const statusText = document.getElementById('mc-agent-status-text');
        if (dot) { dot.classList.remove('mc-dot-idle', 'mc-dot-active'); dot.classList.add(running > 0 ? 'mc-dot-active' : 'mc-dot-idle'); }
        if (statusText) statusText.textContent = running > 0 ? `${running} running` : 'Idle';

        // Store memories_today for impact recalc after goals load
        _lastMemoriesToday = s.memories_today || 0;
        _lastMemoriesTotal = s.memories_total || 0;
        _lastAbandoned = abandoned;
        _updateImpact();
    } catch (e) {
        console.error('[MC] Failed to load stats:', e);
    }
}

async function _loadMemoryScopes() {
    try {
        const resp = await fetch('/api/plugin/mission-control/memory/scopes', {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        const data = await resp.json();
        const scopes = data.scopes || [];
        const total = data.total || 0;
        const select = document.getElementById('mc-memory-scope');
        if (!select) return;

        // On first load, auto-select the scope with the most memories
        const isFirstLoad = !_selectedMemoryScope;
        if (isFirstLoad && scopes.length > 0) {
            const largest = scopes.reduce((a, b) => b.count > a.count ? b : a, scopes[0]);
            _selectedMemoryScope = largest.name;
        }

        const current = _selectedMemoryScope || select.value;
        select.innerHTML = `<option value="">All (${total})</option>`;
        for (const s of scopes) {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = `${s.name} (${s.count})`;
            if (s.name === current) opt.selected = true;
            select.appendChild(opt);
        }

        // If first load, trigger a full reload with the auto-selected scope
        if (isFirstLoad && _selectedMemoryScope) {
            _loadGoals();
            _loadStats();
        }
    } catch (e) {
        console.error('[MC] Failed to load memory scopes:', e);
    }
}

// ─── Mind Panel ──────────────────────────────────────────────────────────────

async function _populateMindScopeDropdown() {
    const list = document.getElementById('mc-mind-scope-list');
    if (!list) return;
    list.innerHTML = '<div class="mc-mind-scope-item mc-mind-scope-loading">Loading...</div>';
    try {
        const resp = await fetch('/api/memory/scopes', { headers: { 'X-CSRF-Token': CSRF() } });
        const data = await resp.json();
        const scopes = data.scopes || [];
        const currentScope = _selectedMemoryScope;

        let html = `<div class="mc-mind-scope-item ${!currentScope ? 'mc-mind-scope-active' : ''}" data-scope="">
            <span>\u{1F30D} All Scopes</span>
        </div>`;
        for (const s of scopes) {
            const isActive = s.name === currentScope;
            html += `<div class="mc-mind-scope-item ${isActive ? 'mc-mind-scope-active' : ''}" data-scope="${_esc(s.name)}">
                <span>\u{1F464} ${_esc(s.name)}</span>
                <span class="mc-mind-scope-count">${s.count}</span>
            </div>`;
        }
        // Add "+ New Scope" button at bottom
        html += `<div class="mc-mind-scope-divider"></div>
        <div class="mc-mind-scope-item mc-mind-scope-add" id="mc-mind-add-scope">
            <span>\u2795 New Scope</span>
        </div>`;
        list.innerHTML = html;

        // Bind scope clicks
        list.querySelectorAll('.mc-mind-scope-item:not(.mc-mind-scope-add)').forEach(item => {
            item.addEventListener('click', () => {
                const scope = item.dataset.scope;
                _selectedMemoryScope = scope;
                // Update hidden select to keep stats logic working
                const select = document.getElementById('mc-memory-scope');
                if (select) select.value = scope;
                // Update scope button to show active indicator
                const btn = document.getElementById('mc-mind-scope-btn');
                if (btn) btn.classList.toggle('mc-mind-btn-active', !!scope);
                // Close dropdown
                document.getElementById('mc-mind-scope-dropdown').style.display = 'none';
                // Clear cache & reload everything for this scope
                _mindDataCache = {};
                _loadStats();
                _loadGoals();
                // Reload active mind tab if drawer is open
                const drawer = document.getElementById('mc-mind-drawer');
                const activeTab = document.querySelector('.mc-mind-btn-active[data-mind-tab]');
                if (drawer && drawer.style.display !== 'none' && activeTab) {
                    _loadMindTab(activeTab.dataset.mindTab);
                }
            });
        });

        // Bind "+ New Scope" button
        const addBtn = document.getElementById('mc-mind-add-scope');
        if (addBtn) {
            addBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const name = prompt('Enter name for the new scope:');
                if (!name || !name.trim()) return;
                const trimmed = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                if (!trimmed) return;
                try {
                    // Create scope in memory, goals, knowledge, and people
                    const endpoints = [
                        '/api/memory/scopes',
                        '/api/goals/scopes',
                        '/api/knowledge/scopes',
                        '/api/knowledge/people/scopes'
                    ];
                    await Promise.all(endpoints.map(url =>
                        fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                            body: JSON.stringify({ name: trimmed })
                        })
                    ));
                    // Switch to the new scope
                    _selectedMemoryScope = trimmed;
                    const select = document.getElementById('mc-memory-scope');
                    if (select) select.value = trimmed;
                    const btn = document.getElementById('mc-mind-scope-btn');
                    if (btn) btn.classList.add('mc-mind-btn-active');
                    document.getElementById('mc-mind-scope-dropdown').style.display = 'none';
                    _mindDataCache = {};
                    _loadStats();
                    _loadGoals();
                } catch (err) {
                    alert('Failed to create scope');
                }
            });
        }
    } catch (e) {
        list.innerHTML = '<div class="mc-mind-scope-item">Error loading scopes</div>';
    }
}

function _getMindScope() {
    // Use the same scope selector from the Memories/Mind stat card
    const select = document.getElementById('mc-memory-scope');
    return select ? (select.value || 'default') : 'default';
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
                data = await _fetchMindMemories(scope);
                break;
            case 'people':
                data = await _fetchMindPeople(scope);
                break;
            case 'human-knowledge':
                data = await _fetchMindKnowledge(scope, 'user');
                break;
            case 'ai-knowledge':
                data = await _fetchMindKnowledge(scope, 'ai');
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

async function _fetchMindMemories(scope) {
    const resp = await fetch(`/api/memory/list?scope=${encodeURIComponent(scope)}`, {
        headers: { 'X-CSRF-Token': CSRF() }
    });
    return resp.json();
}

async function _fetchMindPeople(scope) {
    const resp = await fetch(`/api/knowledge/people?scope=${encodeURIComponent(scope)}`, {
        headers: { 'X-CSRF-Token': CSRF() }
    });
    return resp.json();
}

async function _fetchMindKnowledge(scope, type) {
    const resp = await fetch(`/api/knowledge/tabs?scope=${encodeURIComponent(scope)}&type=${type}`, {
        headers: { 'X-CSRF-Token': CSRF() }
    });
    return resp.json();
}

function _renderMindTab(tabName, data) {
    const container = document.getElementById('mc-mind-tab-' + tabName);
    if (!container) return;

    switch (tabName) {
        case 'memories':
            _renderMindMemories(container, data);
            break;
        case 'people':
            _renderMindPeople(container, data);
            break;
        case 'human-knowledge':
        case 'ai-knowledge':
            _renderMindKnowledge(container, data, tabName);
            break;
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
                    <span class="mc-mind-group-name">${_esc(label)}</span>
                    <span class="mc-mind-group-count">${count}</span>
                </div>
                <div class="mc-mind-group-items">
                    ${items.slice(0, 20).map(m => `
                        <div class="mc-mind-memory-item">
                            <div class="mc-mind-memory-text">${_esc(m.content)}</div>
                            <div class="mc-mind-memory-time">${_relativeTime(m.timestamp)}</div>
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
        const rel = p.relationship ? `<span class="mc-mind-person-rel">${_esc(p.relationship)}</span>` : '';
        const details = [p.email, p.phone].filter(Boolean).map(d => _esc(d)).join(' \u{2022} ');
        html += `
            <div class="mc-mind-person-card">
                <div class="mc-mind-person-avatar">${(p.name || '?')[0].toUpperCase()}</div>
                <div class="mc-mind-person-info">
                    <div class="mc-mind-person-name">${_esc(p.name)} ${rel}</div>
                    ${details ? `<div class="mc-mind-person-details">${details}</div>` : ''}
                    ${p.notes ? `<div class="mc-mind-person-notes">${_esc(p.notes).substring(0, 100)}${p.notes.length > 100 ? '...' : ''}</div>` : ''}
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
        const desc = tab.description ? `<div class="mc-mind-kb-desc">${_esc(tab.description)}</div>` : '';
        const entryCount = tab.entry_count || 0;
        html += `
            <div class="mc-mind-group">
                <div class="mc-mind-group-header" onclick="this.parentElement.classList.toggle('mc-mind-expanded')">
                    <span class="mc-mind-arrow">\u{25B6}</span>
                    <span class="mc-mind-group-name">\u{1F4C4} ${_esc(tab.name)}</span>
                    <span class="mc-mind-group-count">${entryCount} entries</span>
                </div>
                <div class="mc-mind-group-items">
                    ${desc}
                    <div class="mc-mind-kb-entries" id="mc-mind-kb-${tab.id}">
                        <button class="mc-mind-load-entries" onclick="_loadKnowledgeEntries(${tab.id}, this)">Load entries</button>
                    </div>
                </div>
            </div>`;
    }
    container.innerHTML = html;
}

// Make this globally accessible for onclick
window._loadKnowledgeEntries = async function(tabId, btn) {
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
                <div class="mc-mind-memory-text">${_esc((e.content || '').substring(0, 300))}${(e.content || '').length > 300 ? '...' : ''}</div>
                ${e.source_filename ? `<div class="mc-mind-memory-time">\u{1F4CE} ${_esc(e.source_filename)}</div>` : ''}
            </div>
        `).join('') + (entries.length > 10 ? `<div class="mc-mind-more">+${entries.length - 10} more entries</div>` : '');
    } catch (e) {
        btn.textContent = 'Error loading';
    }
};

function _relativeTime(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        const now = new Date();
        const diffMs = now - d;
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString();
    } catch { return ts; }
}

function _loadAgents() {
    clearTimeout(_loadAgentsTimer);
    _loadAgentsTimer = setTimeout(_loadAgentsNow, 300);
}

async function _loadAgentsNow() {
    try {
        const resp = await fetch('/api/plugin/mission-control/agents', {
            headers: { 'X-CSRF-Token': CSRF() }
        });
        if (resp.status === 429) { console.warn('[MC] Agents rate-limited, retrying...'); setTimeout(_loadAgentsNow, 2000); return; }
        if (!resp.ok) return;
        const data = await resp.json();
        _renderAgents(data.agents || []);
    } catch (e) {
        console.error('[MC] Failed to load agents:', e);
    }
}

// ─── Charts ─────────────────────────────────────────────────────────────────

function _renderCharts(goals) {
    const total = goals.filter(g => !g.parent_id).length;
    const completed = goals.filter(g => !g.parent_id && g.status === 'completed').length;
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

    _setText('mc-pri-total', active.length);
}

// ─── Board rendering ────────────────────────────────────────────────────────

function _renderBoard(goals) {
    const columns = { permanent: [], active: [], completed: [], abandoned: [] };
    const subtaskMap = {};

    goals.filter(g => g.parent_id).forEach(g => {
        if (!subtaskMap[g.parent_id]) subtaskMap[g.parent_id] = [];
        subtaskMap[g.parent_id].push(g);
    });

    goals.filter(g => !g.parent_id).forEach(g => {
        if (g.permanent && g.status === 'active') {
            columns.permanent.push(g);
        } else if (columns[g.status]) {
            columns[g.status].push(g);
        }
    });

    for (const [status, items] of Object.entries(columns)) {
        const col = document.getElementById(`mc-col-${status}`);
        const count = document.getElementById(`mc-col-${status}-count`);
        if (!col) continue;
        if (count) count.textContent = items.length;

        if (items.length === 0) {
            col.innerHTML = '<div class="mc-empty-col">No goals</div>';
            continue;
        }

        col.innerHTML = items.map(g => {
            const pri = { high: '\u{1F534}', medium: '\u{1F7E1}', low: '\u{1F7E2}' }[g.priority] || '\u{26AA}';
            const priClass = `mc-card-${g.priority}`;
            const subtasks = subtaskMap[g.id] || [];
            const subHtml = subtasks.length > 0
                ? `<div class="mc-card-sub">\u{1F4CC} ${subtasks.length} subtask${subtasks.length > 1 ? 's' : ''} (${g.subtask_done || 0} done)</div>`
                : '';
            const progressHtml = g.progress && g.progress.length > 0
                ? `<div class="mc-card-progress">${_esc(g.progress[0].note)}</div>`
                : '';
            const permanent = g.permanent ? ' <span class="mc-perm">\u{267E}\u{FE0F}</span>' : '';
            const isPerm = status === 'permanent';
            let timestampHtml = '';
            if ((status === 'completed' || status === 'abandoned') && (g.completed_at || g.updated_at)) {
                const ts = new Date(g.completed_at || g.updated_at);
                const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                timestampHtml = `<div class="mc-card-timestamp">\u{1F552} ${dateStr} at ${timeStr}</div>`;
            } else if (status === 'active' || isPerm) {
                const created = new Date(g.created_at);
                const dateStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                timestampHtml = `<div class="mc-card-timestamp">Created ${dateStr}</div>`;
            }

            return `
            <div class="mc-card ${priClass}" data-id="${g.id}" draggable="${isPerm ? 'false' : 'true'}">
                <div class="mc-card-top">
                    <span>${pri}</span>
                    <span class="mc-card-title">${_esc(g.title)}${permanent}</span>
                </div>
                ${g.description ? `<div class="mc-card-desc">${_esc(g.description)}</div>` : ''}
                ${subHtml}
                ${progressHtml}
                ${timestampHtml}
                <div class="mc-card-actions">
                    ${isPerm || status === 'active' ? `<button class="mc-card-btn mc-act-deploy" data-id="${g.id}" data-title="${_esc(g.title)}" title="Send to agent">\u{1F680}</button>` : ''}
                    ${isPerm || status === 'active' ? `<button class="mc-card-btn mc-act-schedule${_goalSchedules[g.id] ? ' mc-scheduled' : ''}" data-id="${g.id}" data-title="${_esc(g.title)}" title="${_goalSchedules[g.id] ? 'Edit Schedule' : 'Schedule'}">\u{23F0}</button>` : ''}
                    ${_goalSchedules[g.id] ? `<span class="mc-countdown" data-goal-id="${g.id}">${_getCountdown(_goalSchedules[g.id].schedule)}</span>` : ''}
                    ${!isPerm && status === 'active' ? `<button class="mc-card-btn mc-act-perm" data-id="${g.id}" title="Make Permanent">\u{267E}\u{FE0F}</button>` : ''}
                    ${!isPerm && status !== 'completed' ? `<button class="mc-card-btn mc-act-done" data-id="${g.id}" title="Complete">\u{2705}</button>` : ''}
                    ${!isPerm && status !== 'active' ? `<button class="mc-card-btn mc-act-activate" data-id="${g.id}" title="Reactivate">\u{25B6}\u{FE0F}</button>` : ''}
                    <button class="mc-card-btn mc-act-del" data-id="${g.id}" title="Delete">\u{1F5D1}\u{FE0F}</button>
                </div>
            </div>`;
        }).join('');

        col.querySelectorAll('.mc-act-deploy').forEach(btn =>
            btn.addEventListener('click', e => { e.stopPropagation(); _deployGoalToChat(btn.dataset.id, btn.dataset.title); }));
        col.querySelectorAll('.mc-act-schedule').forEach(btn =>
            btn.addEventListener('click', e => { e.stopPropagation(); _showScheduleModal(btn.dataset.id, btn.dataset.title); }));
        col.querySelectorAll('.mc-act-done').forEach(btn =>
            btn.addEventListener('click', e => { e.stopPropagation(); _updateGoalStatus(btn.dataset.id, 'completed'); }));
        col.querySelectorAll('.mc-act-activate').forEach(btn =>
            btn.addEventListener('click', e => { e.stopPropagation(); _updateGoalStatus(btn.dataset.id, 'active'); }));
        col.querySelectorAll('.mc-act-perm').forEach(btn =>
            btn.addEventListener('click', e => { e.stopPropagation(); _makeGoalPermanent(btn.dataset.id); }));
        col.querySelectorAll('.mc-act-del').forEach(btn =>
            btn.addEventListener('click', e => { e.stopPropagation(); _deleteGoal(btn.dataset.id); }));

        col.querySelectorAll('.mc-card').forEach(card => {
            card.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', card.dataset.id);
                card.classList.add('mc-dragging');
            });
            card.addEventListener('dragend', () => card.classList.remove('mc-dragging'));
        });
    }

    document.querySelectorAll('.mc-column-cards').forEach(zone => {
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('mc-drop-hover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('mc-drop-hover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('mc-drop-hover');
            const goalId = e.dataTransfer.getData('text/plain');
            const newStatus = zone.closest('.mc-column').dataset.status;
            if (goalId && newStatus) _updateGoalStatus(goalId, newStatus);
        });
    });
}

// ─── Agents rendering ───────────────────────────────────────────────────────

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
            <span class="mc-agent-name">${_esc(a.name || 'Agent')}</span>
            <span class="mc-agent-mission">${_esc((a.mission || '').substring(0, 60))}</span>
            <span class="mc-agent-elapsed">${elapsed}</span>
        </div>`;
    }).join('');
}

// ─── 16-Bit Pixel Art Engine (Chroma Key) ───────────────────────────────────

function _setPixelState(state) {
    if (_pixelState === state) return;
    _pixelState = state;
    const section = document.getElementById('mc-pixel-section');
    if (!section) return;
    const states = ['idle', 'thinking', 'typing', 'tool', 'agent', 'done'];
    states.forEach(s => section.classList.remove('mc-px-' + s));
    section.classList.add('mc-px-' + state);

    const statusEl = document.getElementById('mc-pixel-status');
    if (statusEl) {
        const labels = { idle:'IDLE', thinking:'THINKING...', typing:'RESPONDING', tool:'USING TOOLS', agent:'AGENT ACTIVE', done:'COMPLETE' };
        statusEl.textContent = labels[state] || 'IDLE';
    }
    clearTimeout(_pixelIdleTimer);
    if (state === 'done') _pixelIdleTimer = setTimeout(() => _setPixelState('idle'), 4000);
}

function _updatePixelFromEvent(evt) {
    const map = { ai_typing_start:'thinking', ai_typing_end:'done', tool_executing:'tool', tool_complete:'typing', agent_spawned:'agent', agent_completed:'done', agent_dismissed:'done', message_added:'typing' };
    if (map[evt.type]) _setPixelState(map[evt.type]);
}

/* ══════════════════════════════════════════════════════════════════════════════
   Chroma Key Hybrid Pixel Art Engine
   Loads hand-painted PNG backgrounds, detects green-screen areas via chroma key,
   and draws pixel-art-styled animations ONLY inside the green screen regions.
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Image / mask state ── */
let _pxImgUser = null, _pxImgAI = null;
let _pxUserMask = null, _pxAIMask = null;
let _pxImgLoaded = { user: false, ai: false };
const _IW = 629, _IH = 1024; // native image resolution

/* ── Drawing helpers ── */
function _r(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

function _stCol(st) {
    return { idle:'#4caf50', thinking:'#ffc107', typing:'#4fc3f7', tool:'#ff9800', agent:'#e040fb', done:'#4caf50' }[st] || '#4caf50';
}
function _stLabel(st) {
    return { idle:'IDLE', thinking:'THINKING', typing:'CODING', tool:'RUNNING', agent:'AGENT', done:'DONE' }[st] || 'IDLE';
}

/* ══════════════════════════════════════════════════════════════════════════════
   Chroma Key Mask Builder
   Scans image for green-screen pixels (G>160, R<120, B<120).
   Returns { mask, clean } canvases at native image resolution.
   ══════════════════════════════════════════════════════════════════════════════ */
function _buildChromaMask(img) {
    const w = img.width, h = img.height;

    // Draw source image to temp canvas to read pixels
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d');
    tc.drawImage(img, 0, 0);
    const src = tc.getImageData(0, 0, w, h);
    const sd = src.data;

    // Mask canvas: white where green was, transparent elsewhere
    const maskCv = document.createElement('canvas');
    maskCv.width = w; maskCv.height = h;
    const mc = maskCv.getContext('2d');
    const maskImg = mc.createImageData(w, h);
    const md = maskImg.data;

    // Clean canvas: original with green pixels replaced by dark color
    const cleanCv = document.createElement('canvas');
    cleanCv.width = w; cleanCv.height = h;
    const cc = cleanCv.getContext('2d');
    const cleanImg = cc.createImageData(w, h);
    const cd = cleanImg.data;

    for (let i = 0; i < sd.length; i += 4) {
        const r = sd[i], g = sd[i + 1], b = sd[i + 2], a = sd[i + 3];
        const isGreen = g > 160 && r < 120 && b < 120;
        if (isGreen) {
            // Mask: opaque white
            md[i] = 255; md[i + 1] = 255; md[i + 2] = 255; md[i + 3] = 255;
            // Clean: dark fill
            cd[i] = 8; cd[i + 1] = 8; cd[i + 2] = 26; cd[i + 3] = 255;
        } else {
            // Mask: transparent
            md[i] = 0; md[i + 1] = 0; md[i + 2] = 0; md[i + 3] = 0;
            // Clean: original pixel
            cd[i] = r; cd[i + 1] = g; cd[i + 2] = b; cd[i + 3] = a;
        }
    }
    mc.putImageData(maskImg, 0, 0);
    cc.putImageData(cleanImg, 0, 0);
    return { mask: maskCv, clean: cleanCv };
}

/* ══════════════════════════════════════════════════════════════════════════════
   Init / Stop / Sync
   ══════════════════════════════════════════════════════════════════════════════ */
function _initPixelArt() {
    _pixelFrame = 0;
    _pxImgLoaded = { user: false, ai: false };

    // Load Coder Agent image
    _pxImgUser = new Image();
    _pxImgUser.onload = function () {
        _pxUserMask = _buildChromaMask(_pxImgUser);
        _pxImgLoaded.user = true;
    };
    _pxImgUser.src = '/plugin-web/mission-control/Coder-Agent.png';

    // Load AI Workstation image
    _pxImgAI = new Image();
    _pxImgAI.onload = function () {
        _pxAIMask = _buildChromaMask(_pxImgAI);
        _pxImgLoaded.ai = true;
    };
    _pxImgAI.src = '/plugin-web/mission-control/AI-Workstation.png';

    // Start animation loop at 10fps
    if (_pixelAnimTimer) clearInterval(_pixelAnimTimer);
    _pixelAnimTimer = setInterval(function () { _pixelFrame++; _renderPixelScenes(); }, 100);
}

function _stopPixelArt() {
    if (_pixelAnimTimer) { clearInterval(_pixelAnimTimer); _pixelAnimTimer = null; }
}

function _syncCanvasSize(cv) {
    const rect = cv.getBoundingClientRect();
    const dw = Math.round(rect.width) || 320;
    const dh = Math.round(rect.height) || 520;
    if (cv.width !== dw || cv.height !== dh) { cv.width = dw; cv.height = dh; }
}

function _renderPixelScenes() { _renderUserCanvas(); _renderAICanvas(); }

/* ── State speed / opacity helpers ── */
function _stSpeed(st) {
    return { idle: 0.3, thinking: 0.7, typing: 1.0, tool: 0.8, agent: 1.3, done: 0.5 }[st] || 0.3;
}
function _stOpacity(st) {
    return { idle: 0.35, thinking: 0.6, typing: 0.9, tool: 0.8, agent: 1.0, done: 0.7 }[st] || 0.35;
}
function _stGlowCol(st) {
    return { idle: null, thinking: 'rgba(255,193,7,0.08)', typing: 'rgba(79,195,247,0.10)', tool: 'rgba(255,152,0,0.10)', agent: 'rgba(224,64,251,0.12)', done: 'rgba(76,175,80,0.12)' }[st] || null;
}

/* ══════════════════════════════════════════════════════════════════════════════
   CODER AGENT — Hybrid chroma-key pixel art scene
   ══════════════════════════════════════════════════════════════════════════════ */
function _renderUserCanvas() {
    const cv = document.getElementById('mc-px-user-cv');
    if (!cv || !_pxImgLoaded.user) return;
    _syncCanvasSize(cv);
    if (!_offUser) { _offUser = document.createElement('canvas'); _offUser.width = _IW; _offUser.height = _IH; }
    const c = _offUser.getContext('2d');
    const f = _pixelFrame, st = _pixelState;
    const spd = _stSpeed(st);
    const opac = _stOpacity(st);
    const sc = _stCol(st);
    const act = st === 'typing' || st === 'tool' || st === 'agent';
    const isHot = st !== 'idle';
    c.clearRect(0, 0, _IW, _IH);


    // ══════════════════════════════════════════════════════════════════════════
    // Step 1: Draw screen animations at full resolution (629x1024)
    // These fill the entire canvas; the chroma mask clips them to monitor areas
    // ══════════════════════════════════════════════════════════════════════════
    c.globalAlpha = opac;

    // ── Code editor background (dark) ──
    _r(c, 0, 0, _IW, _IH, '#1e1e2e');

    // ── Line numbers gutter ──
    _r(c, 0, 0, 48, _IH, '#16161e');
    for (let i = 0; i < 90; i++) {
        const ly = (i * 12 - Math.floor(f * spd * 3) % (90 * 12) + 90 * 12) % (90 * 12);
        if (ly < _IH) {
            c.globalAlpha = opac * 0.4;
            _r(c, 8, ly, 32, 8, '#5a5a7a');
            c.globalAlpha = opac;
        }
    }

    // ── Scrolling code lines (syntax-highlighted bars) ──
    const codeColors = ['#569cd6', '#ce9178', '#dcdcaa', '#c586c0', '#9cdcfe', '#4ec9b0', '#d4d4d4', '#808080'];
    for (let i = 0; i < 90; i++) {
        const ly = (i * 12 - Math.floor(f * spd * 3) % (90 * 12) + 90 * 12) % (90 * 12);
        if (ly >= 0 && ly < _IH) {
            const seed = (i * 7 + 13) % 256;
            const indent = 56 + ((seed % 5) * 16);
            const segs = 2 + (seed % 4);
            let sx = indent;
            for (let s = 0; s < segs; s++) {
                const sw = 20 + ((seed * (s + 1) * 3) % 80);
                const ci = (seed + s * 37) % codeColors.length;
                _r(c, sx, ly, sw, 8, codeColors[ci]);
                sx += sw + 8;
                if (sx > _IW - 40) break;
            }
        }
    }

    // ── Active line highlight ──
    {
        const alY = (Math.floor(f * spd * 0.5) % 40) * 12;
        c.globalAlpha = opac * 0.15;
        _r(c, 48, alY, _IW - 48, 12, '#569cd6');
        c.globalAlpha = opac;
    }

    // ── Blinking cursor ──
    if (Math.floor(f * 0.5) % 2 === 0) {
        const curY = (Math.floor(f * spd * 0.5) % 40) * 12;
        _r(c, 56 + ((f * 3) % 200), curY, 3, 10, '#aeafad');
    }

    // ── Terminal output (bottom portion) ──
    {
        c.globalAlpha = opac * 0.9;
        _r(c, 0, _IH * 0.65, _IW, _IH * 0.35, '#0a1a0a');
        const termColors = ['#4caf50', '#4caf50', '#4caf50', '#ff5252', '#ffc107'];
        for (let i = 0; i < 30; i++) {
            const ty = _IH * 0.67 + (i * 11 - Math.floor(f * spd * 5) % (30 * 11) + 30 * 11) % (30 * 11);
            if (ty >= _IH * 0.65 && ty < _IH) {
                const seed2 = (i * 11 + 7) % 256;
                const ci2 = seed2 % termColors.length;
                const tw = 40 + (seed2 % 180);
                _r(c, 12, ty, 24, 8, '#3a7a3a');
                _r(c, 44, ty, tw, 8, termColors[ci2]);
            }
        }
        c.globalAlpha = opac;
    }

    // ── File tree sidebar (left strip) ──
    {
        c.globalAlpha = opac * 0.7;
        _r(c, 0, 0, 44, _IH * 0.6, '#181828');
        for (let i = 0; i < 40; i++) {
            const fy = 8 + i * 14;
            if (fy > _IH * 0.6) break;
            const seed3 = (i * 13 + 3) % 64;
            const ind = (seed3 % 4) * 6;
            const fcol = (seed3 % 3 === 0) ? '#e8a838' : (seed3 % 3 === 1) ? '#569cd6' : '#9cdcfe';
            _r(c, 4 + ind, fy, 8, 8, fcol);
            _r(c, 14 + ind, fy + 1, 16 + (seed3 % 12), 6, '#6a6a8a');
        }
        c.globalAlpha = opac;
    }

    // ── Tool state: progress bar ──
    if (st === 'tool') {
        const prog = ((f * 2) % 100) / 100;
        _r(c, 60, _IH * 0.48, _IW - 120, 16, '#1a1a2e');
        _r(c, 62, _IH * 0.48 + 2, (_IW - 124) * prog, 12, '#ff9800');
        c.globalAlpha = 0.3;
        _r(c, 62, _IH * 0.48 + 2, (_IW - 124) * prog, 6, '#ffcc80');
        c.globalAlpha = opac;
    }

    // ── CRT scan line sweep ──
    {
        const scanY = (f * 8 * spd) % _IH;
        c.globalAlpha = 0.06;
        _r(c, 0, scanY, _IW, 3, '#ffffff');
        c.globalAlpha = 0.03;
        _r(c, 0, scanY - 4, _IW, 2, '#ffffff');
        _r(c, 0, scanY + 3, _IW, 2, '#ffffff');
        c.globalAlpha = 1;
    }

    c.globalAlpha = 1;

    // ══════════════════════════════════════════════════════════════════════════
    // Step 2: Clip animations to green-screen areas using mask
    // ══════════════════════════════════════════════════════════════════════════
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(_pxUserMask.mask, 0, 0);

    // ══════════════════════════════════════════════════════════════════════════
    // Step 3: Draw original art BEHIND the clipped animations
    // ══════════════════════════════════════════════════════════════════════════
    c.globalCompositeOperation = 'destination-over';
    c.drawImage(_pxUserMask.clean, 0, 0);

    // ══════════════════════════════════════════════════════════════════════════
    // Step 4: Overlay effects (glow, scan lines) drawn on top
    // ══════════════════════════════════════════════════════════════════════════
    c.globalCompositeOperation = 'source-over';

    // Monitor glow — subtle, only near top monitor area
    if (isHot) {
        c.globalAlpha = 0.04;
        _r(c, 60, 40, 500, 280, _stCol(st));
        c.globalAlpha = 1;
    }

    // Done state: green flash
    if (st === 'done') {
        c.globalAlpha = 0.04 + Math.sin(f * 0.2) * 0.02;
        _r(c, 0, 0, _IW, _IH, '#4caf50');
        c.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Step 5: Blit offscreen to display canvas
    // ══════════════════════════════════════════════════════════════════════════
    const dc = cv.getContext('2d');
    dc.imageSmoothingEnabled = true;
    dc.clearRect(0, 0, cv.width, cv.height);
    dc.drawImage(_offUser, 0, 0, cv.width, cv.height);
}

/* ══════════════════════════════════════════════════════════════════════════════
   AI WORKSTATION — Hybrid chroma-key pixel art scene
   ══════════════════════════════════════════════════════════════════════════════ */
function _renderAICanvas() {
    const cv = document.getElementById('mc-px-ai-cv');
    if (!cv || !_pxImgLoaded.ai) return;
    _syncCanvasSize(cv);
    if (!_offAI) { _offAI = document.createElement('canvas'); _offAI.width = _IW; _offAI.height = _IH; }
    const c = _offAI.getContext('2d');
    const f = _pixelFrame, st = _pixelState;
    const spd = _stSpeed(st);
    const opac = _stOpacity(st);
    const sc = _stCol(st);
    const act = st === 'typing' || st === 'tool' || st === 'agent';
    const isHot = st !== 'idle';
    c.clearRect(0, 0, _IW, _IH);

    // ══════════════════════════════════════════════════════════════════════════
    // Step 1: Draw screen animations at full resolution
    // ══════════════════════════════════════════════════════════════════════════
    c.globalAlpha = opac;

    // ── Dark base for all monitors ──
    _r(c, 0, 0, _IW, _IH, '#0a0a1e');

    // ── Neural network visualization (upper portion) ──
    {
        const layers = [4, 6, 8, 6, 4, 3];
        const lx0 = 60, lxSpan = _IW - 120;
        const ny0 = 40, nySpan = _IH * 0.4;
        // Draw connections first
        c.globalAlpha = opac * 0.25;
        for (let l = 0; l < layers.length - 1; l++) {
            const x1 = lx0 + (l / (layers.length - 1)) * lxSpan;
            const x2 = lx0 + ((l + 1) / (layers.length - 1)) * lxSpan;
            for (let n1 = 0; n1 < layers[l]; n1++) {
                const y1 = ny0 + ((n1 + 0.5) / layers[l]) * nySpan;
                for (let n2 = 0; n2 < layers[l + 1]; n2++) {
                    const y2 = ny0 + ((n2 + 0.5) / layers[l + 1]) * nySpan;
                    // Data pulse traveling along connections
                    const pulsePhase = ((f * spd * 0.3 + l * 7 + n1 * 3 + n2 * 5) % 30) / 30;
                    const px = x1 + (x2 - x1) * pulsePhase;
                    const py = y1 + (y2 - y1) * pulsePhase;
                    c.beginPath();
                    c.moveTo(x1, y1);
                    c.lineTo(x2, y2);
                    c.strokeStyle = act ? '#4a6a9a' : '#2a3a5a';
                    c.lineWidth = 1;
                    c.stroke();
                    // Pulse dot
                    if (act || st === 'thinking') {
                        c.globalAlpha = opac * 0.6;
                        c.beginPath();
                        c.arc(px, py, 3, 0, Math.PI * 2);
                        c.fillStyle = '#4fc3f7';
                        c.fill();
                        c.globalAlpha = opac * 0.25;
                    }
                }
            }
        }
        c.globalAlpha = opac;
        // Draw nodes
        for (let l = 0; l < layers.length; l++) {
            const x = lx0 + (l / (layers.length - 1)) * lxSpan;
            for (let n = 0; n < layers[l]; n++) {
                const y = ny0 + ((n + 0.5) / layers[l]) * nySpan;
                const pulse = Math.sin(f * spd * 0.15 + l + n * 0.7) * 0.3 + 0.7;
                const radius = act ? 8 * pulse : 5;
                c.beginPath();
                c.arc(x, y, radius, 0, Math.PI * 2);
                c.fillStyle = act ? '#7c4dff' : '#4a4a6a';
                c.fill();
                // Glow
                if (act) {
                    c.globalAlpha = opac * 0.3 * pulse;
                    c.beginPath();
                    c.arc(x, y, radius + 4, 0, Math.PI * 2);
                    c.fillStyle = '#b388ff';
                    c.fill();
                    c.globalAlpha = opac;
                }
            }
        }
    }

    // ── Attention heatmap (middle portion) ──
    {
        const hx0 = 20, hy0 = _IH * 0.42;
        const cellW = 12, cellH = 10;
        const cols = Math.floor((_IW - 40) / cellW);
        const rows = 18;
        const heatPalette = ['#0a0a3a', '#1a1a6a', '#2a4a8a', '#3a8aba', '#4acaca', '#8adada', '#caea4a', '#eaca3a', '#ea8a2a', '#ea4a2a'];
        for (let r = 0; r < rows; r++) {
            for (let cl = 0; cl < cols; cl++) {
                const phase = Math.sin(f * spd * 0.08 + r * 0.3 + cl * 0.4) * 0.5 + 0.5;
                const shift = Math.sin(f * spd * 0.05 + r * 0.7 - cl * 0.2) * 0.3;
                const idx = Math.floor((phase + shift) * (heatPalette.length - 1));
                const ci = Math.max(0, Math.min(heatPalette.length - 1, idx));
                _r(c, hx0 + cl * cellW, hy0 + r * cellH, cellW - 1, cellH - 1, heatPalette[ci]);
            }
        }
    }

    // ── Scrolling data/code (cyan/purple theme, lower portion) ──
    {
        c.globalAlpha = opac * 0.85;
        _r(c, 0, _IH * 0.65, _IW, _IH * 0.2, '#0a0a1e');
        const dataColors = ['#4fc3f7', '#7c4dff', '#b388ff', '#80cbc4', '#ce93d8', '#4dd0e1', '#9fa8da'];
        for (let i = 0; i < 50; i++) {
            const dy = _IH * 0.66 + (i * 11 - Math.floor(f * spd * 4) % (50 * 11) + 50 * 11) % (50 * 11);
            if (dy >= _IH * 0.65 && dy < _IH * 0.85) {
                const seed = (i * 17 + 5) % 256;
                const indent = 8 + (seed % 4) * 12;
                const segs = 1 + seed % 3;
                let sx = indent;
                for (let s = 0; s < segs; s++) {
                    const sw = 16 + ((seed * (s + 1) * 7) % 60);
                    const ci = (seed + s * 19) % dataColors.length;
                    _r(c, sx, dy, sw, 8, dataColors[ci]);
                    sx += sw + 6;
                    if (sx > _IW - 20) break;
                }
            }
        }
        c.globalAlpha = opac;
    }

    // ── Token stream (horizontal flowing blocks, bottom strip) ──
    {
        c.globalAlpha = opac * 0.8;
        _r(c, 0, _IH * 0.87, _IW, _IH * 0.13, '#08081a');
        const tokColors = ['#4fc3f7', '#ce93d8', '#80cbc4', '#ffab40', '#7c4dff', '#4caf50', '#ef5350'];
        for (let row = 0; row < 6; row++) {
            const ty = _IH * 0.88 + row * 14;
            const scrollOff = Math.floor(f * spd * (6 + row * 2));
            for (let t = 0; t < 30; t++) {
                const tx = (t * 24 - scrollOff % (30 * 24) + 30 * 24) % (30 * 24) - 24;
                if (tx >= -24 && tx < _IW + 24) {
                    const seed = (t * 13 + row * 7) % 256;
                    const tw = 10 + seed % 14;
                    const ci = seed % tokColors.length;
                    _r(c, tx, ty, tw, 10, tokColors[ci]);
                }
            }
        }
        c.globalAlpha = opac;
    }

    // ── Tool state: progress bar ──
    if (st === 'tool') {
        const prog = ((f * 2) % 100) / 100;
        _r(c, 60, _IH * 0.35, _IW - 120, 16, '#1a1a2e');
        _r(c, 62, _IH * 0.35 + 2, (_IW - 124) * prog, 12, '#ff9800');
        c.globalAlpha = 0.3;
        _r(c, 62, _IH * 0.35 + 2, (_IW - 124) * prog, 6, '#ffcc80');
        c.globalAlpha = opac;
    }

    // ── CRT scan line sweep ──
    {
        const scanY = (f * 7 * spd) % _IH;
        c.globalAlpha = 0.06;
        _r(c, 0, scanY, _IW, 3, '#ffffff');
        c.globalAlpha = 0.03;
        _r(c, 0, scanY - 4, _IW, 2, '#ffffff');
        _r(c, 0, scanY + 3, _IW, 2, '#ffffff');
        c.globalAlpha = 1;
    }

    c.globalAlpha = 1;

    // ══════════════════════════════════════════════════════════════════════════
    // Step 2: Clip animations to green-screen areas using mask
    // ══════════════════════════════════════════════════════════════════════════
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(_pxAIMask.mask, 0, 0);

    // ══════════════════════════════════════════════════════════════════════════
    // Step 3: Draw original art BEHIND the clipped animations
    // ══════════════════════════════════════════════════════════════════════════
    c.globalCompositeOperation = 'destination-over';
    c.drawImage(_pxAIMask.clean, 0, 0);

    // ══════════════════════════════════════════════════════════════════════════
    // Step 4: Overlay effects
    // ══════════════════════════════════════════════════════════════════════════
    c.globalCompositeOperation = 'source-over';

    // Monitor glow — subtle, only near monitor area
    if (isHot) {
        c.globalAlpha = 0.04;
        _r(c, 40, 40, 540, 400, _stCol(st));
        c.globalAlpha = 1;
    }

    // Done state: green flash
    if (st === 'done') {
        c.globalAlpha = 0.04 + Math.sin(f * 0.2) * 0.02;
        _r(c, 0, 0, _IW, _IH, '#4caf50');
        c.globalAlpha = 1;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Step 5: Blit offscreen to display canvas
    // ══════════════════════════════════════════════════════════════════════════
    const dc = cv.getContext('2d');
    dc.imageSmoothingEnabled = true;
    dc.clearRect(0, 0, cv.width, cv.height);
    dc.drawImage(_offAI, 0, 0, cv.width, cv.height);
}

// ─── Event stream ───────────────────────────────────────────────────────────

function _connectEvents() {
    if (_eventSource) _eventSource.close();
    try {
        _eventSource = new EventSource('/api/events?replay=false');
        const TRACKED = [
            'agent_spawned', 'agent_completed', 'agent_dismissed',
            'tool_executing', 'tool_complete',
            'ai_typing_start', 'ai_typing_end',
            'message_added', 'chat_switched',
        ];
        _eventSource.addEventListener('message', e => {
            try {
                const evt = JSON.parse(e.data);
                if (!evt.type || evt.type === 'keepalive') return;
                if (!TRACKED.includes(evt.type)) return;
                _addActivity(evt);
                _updatePixelFromEvent(evt);
                if (evt.type.startsWith('agent_')) _loadAgents();
            } catch {}
        });
    } catch (e) {
        console.error('[MC] EventSource failed:', e);
    }
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
    item.innerHTML = `<span class="mc-log-icon">${icon}</span><span class="mc-log-text">${_esc(label)}</span><span class="mc-log-time">${time}</span>`;
    feed.insertBefore(item, feed.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => item.classList.remove('mc-log-new')));
    while (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

// ─── Goal actions ───────────────────────────────────────────────────────────

function _deployGoalToChat(goalId, goalTitle) {
    // Track which goal was deployed so we can auto-complete after AI responds
    _deployedGoalId = goalId ? parseInt(goalId) : null;

    // Expand chat panel if collapsed
    const root = document.getElementById('mc-root');
    if (root && root.classList.contains('mc-chat-collapsed')) {
        _toggleChatPanel(false);
    }

    const input = document.getElementById('mc-chat-input');
    if (!input) return;

    input.value = `Work on this goal: "${goalTitle}"`;
    input.focus();
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';

    // Scroll chat to bottom so user sees the pre-filled input
    _scrollChat();
}

async function _updateGoalStatus(goalId, status) {
    try {
        await fetch('/api/plugin/mission-control/goals/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ goal_id: parseInt(goalId), status })
        });

        // Auto-complete parent if all subtasks are now done (skip permanent goals)
        if (status === 'completed' && _goalsCache) {
            const goal = _goalsCache.find(g => g.id === parseInt(goalId));
            if (goal && goal.parent_id) {
                const parent = _goalsCache.find(g => g.id === goal.parent_id);
                if (parent && parent.status === 'active' && !parent.permanent) {
                    const siblings = _goalsCache.filter(g => g.parent_id === parent.id);
                    const allDone = siblings.every(s =>
                        s.id === parseInt(goalId) ? true : s.status === 'completed'
                    );
                    if (allDone && siblings.length > 0) {
                        await fetch('/api/plugin/mission-control/goals/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                            body: JSON.stringify({ goal_id: parent.id, status: 'completed' })
                        });
                    }
                }
            }
        }

        _loadGoals(); _loadStats();
    } catch (e) { console.error('[MC] Update failed:', e); }
}

async function _makeGoalPermanent(goalId) {
    try {
        await fetch('/api/plugin/mission-control/goals/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ goal_id: parseInt(goalId), permanent: 1 })
        });
        _loadGoals(); _loadStats();
    } catch (e) { console.error('[MC] Make permanent failed:', e); }
}

async function _deleteGoal(goalId) {
    if (!confirm('Delete this goal and all subtasks?')) return;
    try {
        await fetch('/api/plugin/mission-control/goals/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ goal_id: parseInt(goalId) })
        });
        _loadGoals(); _loadStats();
    } catch (e) { console.error('[MC] Delete failed:', e); }
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

async function _triggerTTS(text) {
    try {
        // Check if TTS is enabled via Sapphire status endpoint
        const statusResp = await fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!statusResp.ok) return;
        const status = await statusResp.json();
        if (!status.tts_enabled) return;

        // Clean up text — strip tool output lines, think blocks
        let clean = text;
        clean = clean.replace(/<(?:seed:)?think>.*?<\/(?:seed:think|seed:cot_budget_reflect|think)>\s*/gs, '');
        // Remove orphaned think closing tags
        const orphans = [...clean.matchAll(/<\/(?:seed:think|seed:cot_budget_reflect|think)>/g)];
        if (orphans.length > 0) {
            const last = orphans[orphans.length - 1];
            clean = clean.substring(last.index + last[0].length);
        }
        clean = clean.replace(/\n\u{1F527} Running:.*?\n/gu, '\n');
        clean = clean.replace(/ [\u{2705}\u{274C}] (?:done|failed)\n/gu, '\n');
        clean = clean.trim();

        if (!clean) return;

        // Send to Sapphire's TTS engine (plays server-side)
        await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ text: clean })
        });
    } catch (e) {
        console.warn('[MC] TTS trigger failed:', e);
    }
}

// ─── Schedule ────────────────────────────────────────────────────────────────

let _schedGoalId = null;
let _schedGoalTitle = '';

let _allScheduledTasks = [];

async function _loadGoalSchedules() {
    try {
        const resp = await fetch('/api/continuity/tasks', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const data = await resp.json();
        _goalSchedules = {};
        _allScheduledTasks = [];
        for (const t of (data.tasks || [])) {
            // Store all enabled tasks for calendar
            const isSingleUseTask = t.source && t.source.endsWith(':once');
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

                // Auto-delete single-use tasks that have already run
                if (isSingleUse && t.last_run) {
                    try {
                        await fetch(`/api/continuity/tasks/${t.id}`, {
                            method: 'DELETE',
                            headers: { 'X-CSRF-Token': CSRF() }
                        });
                    } catch (e) { /* ignore */ }
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
        _renderCalendar();
    } catch (e) { console.error('[MC] Failed to load schedules:', e); }
}

function _cronMatchesDay(cron, dayOfWeek) {
    const parts = cron.split(/\s+/);
    if (parts.length < 5) return false;
    const dow = parts[4];
    if (dow === '*') return true;
    // Handle ranges like 1-5
    if (dow.includes('-')) {
        const [start, end] = dow.split('-').map(Number);
        return dayOfWeek >= start && dayOfWeek <= end;
    }
    // Handle lists like 1,3,5
    if (dow.includes(',')) {
        return dow.split(',').map(d => parseInt(d.trim())).includes(dayOfWeek);
    }
    return parseInt(dow) === dayOfWeek;
}

function _cronGetTime(cron) {
    const parts = cron.split(/\s+/);
    if (parts.length < 5) return null;
    const [min, hr] = parts;
    // Skip interval-based (*/N)
    if (hr.includes('/') || min.includes('/')) {
        // For interval crons, show them but with a different label
        if (hr.includes('/')) return { display: `Every ${hr.replace('*/','')}h`, sort: 0 };
        if (min.includes('/')) return { display: `Every ${min.replace('*/','')}m`, sort: 0 };
    }
    const h = parseInt(hr);
    const m = parseInt(min);
    if (isNaN(h) || isNaN(m)) return null;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { display: `${h12}:${String(m).padStart(2,'0')} ${ampm}`, sort: h * 60 + m };
}

// Task colors based on name hash
function _taskColor(name) {
    const colors = ['#f44336','#e91e63','#9c27b0','#673ab7','#3f51b5','#2196f3','#00bcd4','#009688','#4caf50','#ff9800','#ff5722','#795548'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
    return colors[Math.abs(hash) % colors.length];
}

function _renderCalendar() {
    const grid = document.getElementById('mc-week-grid');
    const nextUpList = document.getElementById('mc-next-up-list');
    if (!grid || !nextUpList) return;

    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date().getDay();

    // Build week grid
    let html = '';
    for (let d = 0; d < 7; d++) {
        const isToday = d === today;
        html += `<div class="mc-cal-day${isToday ? ' mc-cal-today' : ''}">`;
        html += `<div class="mc-cal-day-label">${dayLabels[d]}</div>`;

        // Find tasks for this day
        const dayTasks = [];
        for (const t of _allScheduledTasks) {
            // Single-use tasks only show on today
            if (t.singleUse && d !== today) continue;
            if (_cronMatchesDay(t.schedule, d)) {
                const time = _cronGetTime(t.schedule);
                if (time) {
                    const label = t.singleUse ? '⚡ ' + t.name : t.name;
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
            html += `<div class="mc-cal-empty">—</div>`;
        }
        html += '</div>';
    }
    grid.innerHTML = html;

    // Build "Next Up" list — upcoming tasks sorted by time
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

                upcoming.push({
                    name: t.name,
                    timeStr,
                    diff,
                    color: _taskColor(t.name)
                });
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

function _showScheduleModal(goalId, goalTitle) {
    _schedGoalId = goalId;
    _schedGoalTitle = goalTitle;
    const m = document.getElementById('mc-sched-modal');
    if (m) m.style.display = '';
    document.getElementById('mc-sched-goal-name').textContent = goalTitle;
    document.getElementById('mc-sched-freq').value = 'daily';
    document.getElementById('mc-sched-time').value = '09:00';
    document.getElementById('mc-sched-interval').value = '2';
    document.getElementById('mc-sched-cron').value = '';
    document.getElementById('mc-sched-mode').value = 'background';
    document.getElementById('mc-sched-toolset').value = 'all';
    // Reset day picker to weekdays default
    document.querySelectorAll('.mc-day-btn').forEach(btn => {
        const d = parseInt(btn.dataset.day);
        btn.classList.toggle('mc-day-active', d >= 1 && d <= 5);
    });

    // Show/hide remove button
    const removeBtn = document.getElementById('mc-sched-remove');
    if (_goalSchedules[goalId]) {
        removeBtn.style.display = '';
        document.getElementById('mc-sched-save').textContent = '\u{23F0} Update';
        // Load existing task settings
        _loadExistingSchedule(goalId);
    } else {
        removeBtn.style.display = 'none';
        document.getElementById('mc-sched-save').textContent = '\u{23F0} Schedule';
    }

    _loadSchedPersonas();
    _updateSchedUI();
    _updateSchedPreview();
}

function _hideScheduleModal() {
    const m = document.getElementById('mc-sched-modal');
    if (m) m.style.display = 'none';
    _schedGoalId = null;
}

async function _loadExistingSchedule(goalId) {
    const sched = _goalSchedules[goalId];
    if (!sched) return;
    const taskId = sched.taskId;
    try {
        const resp = await fetch(`/api/continuity/tasks/${taskId}`, { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const t = await resp.json();
        const cron = t.schedule || '0 9 * * *';
        const isSingleUse = t.source && t.source.endsWith(':once');

        // Parse cron back into UI fields
        const parts = cron.split(/\s+/);
        if (parts.length === 5) {
            const [min, hr, , , dow] = parts;
            if (isSingleUse) {
                document.getElementById('mc-sched-freq').value = 'once';
                document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`;
            } else if (min.startsWith('*/')) {
                document.getElementById('mc-sched-freq').value = 'minutes';
                document.getElementById('mc-sched-interval').value = min.replace('*/', '');
            } else if (hr.startsWith('*/')) {
                document.getElementById('mc-sched-freq').value = 'hourly';
                document.getElementById('mc-sched-interval').value = hr.replace('*/', '');
            } else if (dow === '1-5') {
                document.getElementById('mc-sched-freq').value = 'weekdays';
                document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`;
            } else if (dow !== '*' && dow.includes(',')) {
                // Custom day selection like 1,3,5
                document.getElementById('mc-sched-freq').value = 'selectdays';
                document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`;
                // Restore day buttons
                document.querySelectorAll('.mc-day-btn').forEach(btn => btn.classList.remove('mc-day-active'));
                dow.split(',').forEach(d => {
                    const btn = document.querySelector(`.mc-day-btn[data-day="${d.trim()}"]`);
                    if (btn) btn.classList.add('mc-day-active');
                });
            } else if (dow === '*' && hr !== '*') {
                document.getElementById('mc-sched-freq').value = 'daily';
                document.getElementById('mc-sched-time').value = `${hr.padStart(2,'0')}:${min.padStart(2,'0')}`;
            } else {
                document.getElementById('mc-sched-freq').value = 'custom';
                document.getElementById('mc-sched-cron').value = cron;
            }
        }

        document.getElementById('mc-sched-mode').value = !t.chat_target ? 'background' : (t.chat_target === 'default' ? 'default' : 'mission_control');
        document.getElementById('mc-sched-toolset').value = t.toolset || 'all';
        if (t.persona) {
            const sel = document.getElementById('mc-sched-persona');
            for (const opt of sel.options) {
                if (opt.value === t.persona) { opt.selected = true; break; }
            }
        }
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
            opt.value = name;
            opt.textContent = name;
            if (name === current) opt.selected = true;
            sel.appendChild(opt);
        }
    } catch (e) { console.error('[MC] Failed to load personas for schedule:', e); }
}

function _updateSchedUI() {
    const freq = document.getElementById('mc-sched-freq').value;
    document.getElementById('mc-sched-time-row').style.display = (freq === 'once' || freq === 'daily' || freq === 'weekdays' || freq === 'selectdays') ? '' : 'none';
    document.getElementById('mc-sched-days-row').style.display = freq === 'selectdays' ? '' : 'none';
    document.getElementById('mc-sched-interval-row').style.display = (freq === 'hourly' || freq === 'minutes') ? '' : 'none';
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
        case 'once': return `${m} ${h} * * *`;
        case 'daily': return `${m} ${h} * * *`;
        case 'weekdays': return `${m} ${h} * * 1-5`;
        case 'selectdays': {
            const days = _getSelectedDays();
            return `${m} ${h} * * ${days.length ? days.join(',') : '*'}`;
        }
        case 'hourly': return `0 */${interval} * * *`;
        case 'minutes': return `*/${interval} * * * *`;
        case 'custom': return document.getElementById('mc-sched-cron').value || '0 9 * * *';
        default: return '0 9 * * *';
    }
}

function _getSelectedDays() {
    const days = [];
    document.querySelectorAll('.mc-day-btn.mc-day-active').forEach(btn => {
        days.push(parseInt(btn.dataset.day));
    });
    return days.sort();
}

const _dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function _updateSchedPreview() {
    const cron = _buildCron();
    const freq = document.getElementById('mc-sched-freq').value;
    const mode = document.getElementById('mc-sched-mode').value;
    let desc = '';
    const time = document.getElementById('mc-sched-time').value || '09:00';
    const interval = parseInt(document.getElementById('mc-sched-interval').value) || 2;

    switch (freq) {
        case 'once': desc = `Once at ${time} (auto-removes after)`; break;
        case 'daily': desc = `Every day at ${time}`; break;
        case 'weekdays': desc = `Weekdays at ${time}`; break;
        case 'selectdays': {
            const days = _getSelectedDays();
            const names = days.map(d => _dayNames[d]);
            desc = names.length ? `${names.join(', ')} at ${time}` : `No days selected`;
            break;
        }
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
    const scope = _selectedMemoryScope || 'default';

    const freq = document.getElementById('mc-sched-freq').value;
    const isSingleUse = freq === 'once';

    const taskData = {
        type: 'task',
        name: `\u{1F3AF} ${_schedGoalTitle}`,
        enabled: true,
        schedule: cron,
        initial_message: _schedGoalTitle,
        chat_target: mode === 'background' ? '' : mode,
        persona: persona,
        toolset: toolset,
        tts_enabled: true,
        memory_scope: scope,
        knowledge_scope: scope,
        people_scope: scope,
        goal_scope: scope,
        source: `mc-goal:${_schedGoalId}${isSingleUse ? ':once' : ''}`,
        inject_datetime: true
    };

    try {
        const existingSched = _goalSchedules[_schedGoalId];
        const existingTaskId = existingSched ? existingSched.taskId : null;
        let resp;
        if (existingTaskId) {
            // Sapphire's update_task doesn't allow changing 'source' field,
            // so always delete + recreate to ensure source (with :once flag) is correct
            await fetch(`/api/continuity/tasks/${existingTaskId}`, {
                method: 'DELETE',
                headers: { 'X-CSRF-Token': CSRF() }
            });
            resp = await fetch('/api/continuity/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify(taskData)
            });
        } else {
            // Create new
            resp = await fetch('/api/continuity/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
                body: JSON.stringify(taskData)
            });
        }
        if (resp.ok) {
            await _loadGoalSchedules();
            _loadGoals(); // Re-render cards with schedule indicator
        }
    } catch (e) { console.error('[MC] Failed to save schedule:', e); }

    _hideScheduleModal();
}

async function _removeSchedule() {
    if (!_schedGoalId) return;
    const sched = _goalSchedules[_schedGoalId];
    if (!sched) return;
    const taskId = sched.taskId;

    try {
        await fetch(`/api/continuity/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'X-CSRF-Token': CSRF() }
        });
        delete _goalSchedules[_schedGoalId];
        _loadGoals();
    } catch (e) { console.error('[MC] Failed to remove schedule:', e); }

    _hideScheduleModal();
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function _showModal() {
    const m = document.getElementById('mc-modal'); if (m) m.style.display = '';
    const t = document.getElementById('mc-goal-title'); if (t) { t.value = ''; t.focus(); }
    const d = document.getElementById('mc-goal-desc'); if (d) d.value = '';
    const p = document.getElementById('mc-goal-priority'); if (p) p.value = 'medium';
    const perm = document.getElementById('mc-goal-permanent'); if (perm) perm.checked = false;
}

function _hideModal() {
    const m = document.getElementById('mc-modal'); if (m) m.style.display = 'none';
}

async function _saveGoal() {
    const title = document.getElementById('mc-goal-title')?.value?.trim();
    if (!title) return;
    const description = document.getElementById('mc-goal-desc')?.value?.trim();
    const priority = document.getElementById('mc-goal-priority')?.value || 'medium';
    const permanent = document.getElementById('mc-goal-permanent')?.checked || false;
    const scope = _selectedMemoryScope || 'default';
    try {
        await fetch('/api/plugin/mission-control/goals/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ title, description, priority, scope, permanent })
        });
        _hideModal(); _loadGoals(); _loadStats();
    } catch (e) { console.error('[MC] Create failed:', e); }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function _setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function _getCountdown(cronStr) {
    try {
        const next = _nextCronFire(cronStr);
        if (!next) return '';
        // Add 30s buffer to account for Sapphire's scheduler check interval
        const diff = next - Date.now() + 30000;
        if (diff <= 0) return 'soon';
        const totalSecs = Math.floor(diff / 1000);
        const mins = Math.floor(totalSecs / 60);
        const hrs = Math.floor(mins / 60);
        const days = Math.floor(hrs / 24);
        if (days > 0) return `${days}d ${hrs % 24}h`;
        if (hrs > 0) return `${hrs}h ${mins % 60}m`;
        if (mins <= 1) return '<1m';
        return `${mins}m`;
    } catch (e) { return ''; }
}

function _nextCronFire(cronStr) {
    const parts = cronStr.trim().split(/\s+/);
    if (parts.length !== 5) return null;
    const [minF, hrF, , , dowF] = parts;
    const now = new Date();

    // Every X minutes: */N * * * *
    if (minF.startsWith('*/')) {
        const interval = parseInt(minF.replace('*/', ''));
        if (!interval) return null;
        // Find next minute that's divisible by interval
        const curMin = now.getMinutes();
        const curSec = now.getSeconds();
        let nextMin = Math.ceil((curMin * 60 + curSec + 1) / (interval * 60)) * interval;
        const next = new Date(now);
        next.setSeconds(0, 0);
        next.setMinutes(0);
        next.setMinutes(nextMin);
        return next.getTime();
    }

    // Every X hours: M */N * * *
    if (hrF.startsWith('*/')) {
        const interval = parseInt(hrF.replace('*/', ''));
        if (!interval) return null;
        const min = parseInt(minF) || 0;
        const curHr = now.getHours();
        // Find next hour divisible by interval where we haven't passed :min yet
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

    // Fixed time: M H * * DOW
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

function _esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function _countCompletedToday(goals) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return goals.filter(g => g.status === 'completed' && g.completed_at && g.completed_at.startsWith(today)).length;
}
function _countCompletedThisWeek(goals) {
    const wa = new Date(Date.now() - 7 * 86400000);
    const weekAgo = `${wa.getFullYear()}-${String(wa.getMonth() + 1).padStart(2, '0')}-${String(wa.getDate()).padStart(2, '0')}`;
    return goals.filter(g => g.status === 'completed' && g.completed_at && g.completed_at >= weekAgo).length;
}
function _countProgressNotes(goals) {
    return goals.reduce((sum, g) => sum + (g.progress ? g.progress.length : 0), 0);
}

// ─── Styles ─────────────────────────────────────────────────────────────────

function _injectStyles() {
    if (document.getElementById('mc-styles')) return;
    const style = document.createElement('style');
    style.id = 'mc-styles';
    style.textContent = `
/* ═══ Mission Control — Dashboard with Command Chat ═══ */

/* Launcher */
.mc-launcher { height: 100%; overflow-y: auto; background: #0a0a0f; }
.mc-launcher-inner { max-width: 1200px; margin: 0 auto; padding: 40px 32px; }
.mc-launcher-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
.mc-launcher-title { font-size: 2rem; font-weight: 700; color: #fff; margin: 0; font-style: italic; }
.mc-launcher-date { color: #666; font-size: 0.85rem; margin-top: 4px; }
.mc-launcher-settings-btn { background: none; border: none; font-size: 1.5rem; cursor: pointer; opacity: 0.5; transition: opacity 0.2s; padding: 8px; }
.mc-launcher-settings-btn:hover { opacity: 1; }

.mc-launcher-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 20px;
}
.mc-app-card {
    background: #111118;
    border: 1px solid #1a1a24;
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.25s ease;
    position: relative;
}
.mc-app-card:hover {
    border-color: #333;
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.mc-app-card.mc-app-dragging {
    opacity: 0.4;
    transform: scale(0.95);
}
.mc-app-card.mc-app-drag-over {
    border-color: #4fc3f7;
    box-shadow: 0 0 16px rgba(79,195,247,0.2);
}
.mc-app-preview {
    height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0d0d14 0%, #1a1a2e 100%);
    border-bottom: 1px solid #1a1a24;
}
.mc-app-icon-large {
    font-size: 3.5rem;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
}
.mc-app-info {
    padding: 14px 16px;
}
.mc-app-name {
    font-size: 0.95rem;
    font-weight: 700;
    color: #eee;
    margin-bottom: 4px;
}
.mc-app-desc {
    font-size: 0.72rem;
    color: #666;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.mc-app-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: #333;
    color: #888;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 8px;
    text-transform: uppercase;
}

/* Launcher toggle list */
.mc-launcher-toggle-list { max-height: 400px; overflow-y: auto; }
.mc-launcher-toggle-item {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    border-bottom: 1px solid #1a1a24;
    transition: background 0.15s;
}
.mc-launcher-toggle-item:hover { background: #1a1a2408; }
.mc-launcher-toggle-icon { font-size: 1.2rem; margin-right: 12px; flex-shrink: 0; }
.mc-launcher-toggle-name { flex: 1; color: #ccc; font-size: 0.85rem; font-weight: 600; }
.mc-launcher-toggle-cb { display: none; }
.mc-launcher-toggle-switch {
    width: 40px; height: 22px;
    background: #333;
    border-radius: 11px;
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
}
.mc-launcher-toggle-switch::after {
    content: '';
    position: absolute;
    width: 16px; height: 16px;
    background: #888;
    border-radius: 50%;
    top: 3px; left: 3px;
    transition: all 0.2s;
}
.mc-launcher-toggle-cb:checked + .mc-launcher-toggle-switch {
    background: #4fc3f7;
}
.mc-launcher-toggle-cb:checked + .mc-launcher-toggle-switch::after {
    left: 21px;
    background: #fff;
}
.mc-launcher-toggle-row { display: flex; align-items: center; width: 100%; cursor: pointer; }
.mc-launcher-type-badge {
    font-size: 0.6rem; font-weight: 700; color: #666; background: #1a1a24;
    padding: 2px 8px; border-radius: 6px; margin-right: 10px; text-transform: uppercase;
}
.mc-launcher-prompt-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0 2px 34px; /* indent to align with name */
}
.mc-launcher-prompt-input {
    flex: 1; background: #0d0d14; border: 1px solid #2a2a3a; border-radius: 6px;
    color: #ccc; padding: 6px 10px; font-size: 0.78rem; outline: none;
    transition: border-color 0.2s;
}
.mc-launcher-prompt-input:focus { border-color: #4fc3f7; }
.mc-launcher-prompt-input::placeholder { color: #444; }
.mc-launcher-autosend-label {
    display: flex; align-items: center; gap: 4px; cursor: pointer;
    white-space: nowrap; flex-shrink: 0;
}
.mc-launcher-autosend-cb { width: 14px; height: 14px; accent-color: #4fc3f7; cursor: pointer; }
.mc-launcher-autosend-text { font-size: 0.7rem; color: #666; }
.mc-badge-auto { background: #4fc3f7; color: #0a0a0f; }

/* Dashboard wrapper */
.mc-dashboard-wrap { height: 100%; }

/* Back button */
.mc-back-btn {
    background: none;
    border: none;
    font-size: 1.3rem;
    cursor: pointer;
    padding: 4px 8px;
    margin-right: 8px;
    opacity: 0.6;
    transition: opacity 0.2s;
    vertical-align: middle;
}
.mc-back-btn:hover { opacity: 1; }

/* Root layout: chat left, dashboard right */
.mc-root {
    display: flex;
    height: 100%;
    overflow: hidden;
    background: #0a0a0f;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    position: relative;
}

/* Collapse button (inline in persona bar) */
.mc-collapse-btn {
    background: none;
    border: 1px solid #222;
    color: #555;
    border-radius: 4px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.6rem;
    flex-shrink: 0;
    margin-left: 2px;
    transition: color 0.15s, border-color 0.15s;
}
.mc-collapse-btn:hover { color: #fff; border-color: #444; }

/* Expand button (visible when collapsed, pinned to left edge) */
.mc-expand-btn {
    display: none;
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    z-index: 20;
    background: #111118;
    border: 1px solid #1a1a24;
    border-left: none;
    border-radius: 0 8px 8px 0;
    color: #888;
    padding: 14px 8px;
    cursor: pointer;
    font-size: 1.1rem;
    transition: color 0.15s, background 0.15s;
    writing-mode: vertical-lr;
}
.mc-expand-btn:hover { color: #fff; background: #1a1a2e; }

/* ── Collapsed state ── */
.mc-chat-collapsed .mc-chat-panel {
    width: 0;
    min-width: 0;
    max-width: 0;
    overflow: hidden;
    border-right: none;
    opacity: 0;
    pointer-events: none;
}
.mc-chat-collapsed .mc-expand-btn {
    display: flex;
}
.mc-chat-collapsed .mc-collapse-btn {
    display: none;
}

/* Dashboard expands: bigger stat numbers, wider columns */
.mc-chat-collapsed .mc-stat-num { font-size: 2.8rem; }
.mc-chat-collapsed .mc-stat-card { padding: 20px 22px; }
.mc-chat-collapsed .mc-impact-num { font-size: 2rem; }
.mc-chat-collapsed .mc-donut-wrap { width: 190px; height: 190px; }
.mc-chat-collapsed .mc-chart-card { padding: 24px; }
.mc-chat-collapsed .mc-side-stack { max-width: 420px; }
.mc-chat-collapsed .mc-greeting { font-size: 2.2rem; }

/* Smooth transitions */
.mc-chat-panel {
    transition: width 0.3s ease, min-width 0.3s ease, max-width 0.3s ease, opacity 0.2s ease;
}
.mc-stat-num, .mc-stat-card, .mc-impact-num, .mc-donut-wrap, .mc-chart-card, .mc-greeting {
    transition: all 0.3s ease;
}

/* ══════════════════════════════════════════════════════
   CHAT PANEL (left side)
   ══════════════════════════════════════════════════════ */
.mc-chat-panel {
    width: 340px;
    min-width: 280px;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    position: relative;
    background: #09090e;
    border-right: 1px solid #1a1a24;
    flex-shrink: 0;
}

/* Persona bar */
.mc-persona-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #0d0d14;
    border-bottom: 1px solid #1a1a24;
    flex-shrink: 0;
    cursor: pointer;
}
.mc-persona-avatar-wrap {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid #4a9eff; /* default, overridden by trim_color */
    flex-shrink: 0;
    position: relative;
    background: #111118;
    transition: border-color 0.3s;
}
.mc-persona-avatar {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}
.mc-persona-avatar-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    font-weight: 700;
    color: #4a9eff;
    background: #111118;
}
.mc-persona-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
}
.mc-persona-name {
    font-weight: 700;
    font-size: 0.92rem;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.mc-persona-label {
    font-size: 0.65rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
.mc-persona-switch-btn {
    background: none;
    border: 1px solid #222;
    color: #666;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
    font-size: 0.7rem;
    transition: color 0.15s, border-color 0.15s;
    flex-shrink: 0;
}
.mc-persona-switch-btn:hover { color: #fff; border-color: #444; }

/* Persona dropdown grid */
.mc-persona-dropdown {
    background: #0d0d14;
    border-bottom: 1px solid #1a1a24;
    padding: 12px;
    flex-shrink: 0;
    max-height: 320px;
    overflow-y: auto;
}
.mc-persona-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}
.mc-persona-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    border: 1px solid transparent;
}
.mc-persona-card:hover { background: #151520; }
.mc-persona-selected {
    background: #1a1a2e;
    border-color: #4a9eff;
}
.mc-persona-card-img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #222;
    transition: border-color 0.15s;
}
.mc-persona-selected .mc-persona-card-img { border-color: #4a9eff; }
.mc-persona-card-fallback {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: 700;
    color: #888;
    background: #1a1a24;
    border: 2px solid #222;
}
.mc-persona-selected .mc-persona-card-fallback { border-color: #4a9eff; color: #4a9eff; }
.mc-persona-card-name {
    font-size: 0.7rem;
    color: #aaa;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 80px;
}
.mc-persona-selected .mc-persona-card-name { color: #fff; font-weight: 600; }

.mc-chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #1a1a24;
    flex-shrink: 0;
}
.mc-chat-header-name {
    font-weight: 700;
    font-size: 0.95rem;
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}
.mc-chat-header-actions { display: flex; gap: 4px; }
.mc-chat-hdr-btn {
    background: none;
    border: 1px solid #222;
    color: #888;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
    font-size: 0.72rem;
    transition: color 0.15s, border-color 0.15s;
}
.mc-chat-hdr-btn:hover { color: #fff; border-color: #444; }

/* Chat dropdown */
.mc-chat-dropdown {
    background: #0d0d14;
    border-bottom: 1px solid #1a1a24;
    flex-shrink: 0;
    max-height: 300px;
    display: flex;
    flex-direction: column;
}
.mc-chat-dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #1a1a24;
}
.mc-dropdown-title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #666; font-weight: 600; }
.mc-chat-list {
    overflow-y: auto;
    flex: 1;
    padding: 4px 0;
}
.mc-chat-list-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    cursor: pointer;
    font-size: 0.82rem;
    color: #aaa;
    transition: background 0.1s;
}
.mc-chat-list-item:hover { background: #151520; }
.mc-chat-active { color: #fff; background: #1a1a2e; border-left: 2px solid #f44336; }
.mc-chat-list-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-chat-list-del {
    background: none; border: none; color: #444; cursor: pointer;
    font-size: 0.72rem; padding: 2px 4px; border-radius: 3px;
    opacity: 0; transition: opacity 0.15s, color 0.15s;
}
.mc-chat-list-item:hover .mc-chat-list-del { opacity: 1; }
.mc-chat-list-del:hover { color: #f44336; }

.mc-chat-dropdown-footer {
    display: flex;
    gap: 2px;
    padding: 6px 8px;
    border-top: 1px solid #1a1a24;
}
.mc-chat-action-btn {
    flex: 1;
    background: none;
    border: 1px solid #1a1a24;
    color: #777;
    padding: 5px 4px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.68rem;
    text-align: center;
    transition: background 0.15s, color 0.15s;
}
.mc-chat-action-btn:hover { background: #1a1a24; color: #ddd; }

/* Messages area */
.mc-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* Welcome screen */
.mc-chat-welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    gap: 8px;
}
.mc-chat-welcome-icon { font-size: 2.5rem; opacity: 0.3; }
.mc-chat-welcome-text { font-size: 1.1rem; font-weight: 700; color: #555; }
.mc-chat-welcome-sub { font-size: 0.78rem; color: #444; line-height: 1.5; }

/* Chat bubbles */
.mc-bubble { max-width: 95%; word-wrap: break-word; }
.mc-bubble-user {
    align-self: flex-end;
    background: #1a1a2e;
    border: 1px solid #252540;
    border-radius: 12px 12px 4px 12px;
    padding: 8px 12px;
}
.mc-bubble-assistant {
    align-self: flex-start;
    background: #111118;
    border: 1px solid #1a1a24;
    border-radius: 12px 12px 12px 4px;
    padding: 8px 12px;
    border-left: 2px solid #f44336;
}
.mc-bubble-content {
    font-size: 0.82rem;
    color: #ddd;
    line-height: 1.5;
}
.mc-bubble-user .mc-bubble-content { color: #bbb; }
.mc-inline-code {
    background: #0a0a0f;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.78rem;
    color: #f44336;
}

/* Input area */
.mc-chat-input-wrap {
    border-top: 1px solid #1a1a24;
    padding: 10px 12px;
    flex-shrink: 0;
}
.mc-chat-input-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
}
.mc-chat-input {
    flex: 1;
    background: #111118;
    border: 1px solid #222;
    border-radius: 8px;
    padding: 8px 12px;
    color: #e0e0e0;
    font-size: 0.85rem;
    font-family: inherit;
    resize: none;
    max-height: 120px;
    line-height: 1.4;
}
.mc-chat-input:focus { border-color: #f44336; outline: none; box-shadow: 0 0 0 2px #f4433622; }
.mc-chat-input::placeholder { color: #444; }
.mc-chat-send {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: #f44336;
    color: #fff;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
}
.mc-chat-send:hover { background: #d32f2f; }

/* Streaming indicator */
.mc-chat-streaming-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 0.75rem;
    color: #888;
}
.mc-typing-dots { display: flex; gap: 3px; }
.mc-typing-dots span {
    width: 5px; height: 5px; border-radius: 50%; background: #f44336;
    animation: mc-dot-bounce 1.4s infinite;
}
.mc-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
.mc-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes mc-dot-bounce {
    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.2); }
}
.mc-chat-cancel {
    margin-left: auto;
    background: none;
    border: 1px solid #333;
    color: #888;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 0.75rem;
}
.mc-chat-cancel:hover { color: #f44336; border-color: #f44336; }

/* ══════════════════════════════════════════════════════
   DASHBOARD (right side)
   ══════════════════════════════════════════════════════ */
.mc-dash {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 24px 40px;
    color: #e0e0e0;
}

/* Header */
.mc-header-left { display: flex; align-items: center; }
.mc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 28px 0 20px;
}
.mc-greeting { font-size: 1.8rem; font-weight: 700; margin: 0; color: #fff; font-style: italic; }
.mc-date { margin: 4px 0 0; color: #888; font-size: 0.85rem; }
.mc-agent-status {
    display: flex; align-items: center; gap: 10px;
    background: #111118; border: 1px solid #222; border-radius: 10px; padding: 10px 16px;
}
.mc-status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.mc-dot-idle { background: #555; }
.mc-dot-active { background: #4caf50; box-shadow: 0 0 8px #4caf50; animation: mc-pulse 2s infinite; }
@keyframes mc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
.mc-status-text { display: flex; flex-direction: column; }
.mc-status-name { font-size: 0.82rem; font-weight: 600; color: #ccc; }
.mc-status-sub { font-size: 0.72rem; color: #888; }

/* Stats Row */
.mc-stats-row { display: flex; gap: 12px; margin-bottom: 6px; }
.mc-stat-card {
    flex: 1; background: #111118; border: 1px solid #1a1a24; border-radius: 10px;
    padding: 16px 18px; border-top: 3px solid #333; transition: border-color 0.2s, box-shadow 0.2s;
}
.mc-stat-card:hover { box-shadow: 0 0 20px rgba(0,0,0,0.5); }
.mc-border-red { border-top-color: #f44336; }
.mc-border-green { border-top-color: #4caf50; }
.mc-border-yellow { border-top-color: #ff9800; }
.mc-border-purple { border-top-color: #9c27b0; }
.mc-border-blue { border-top-color: #4a9eff; }
.mc-stat-top { display: flex; justify-content: space-between; align-items: center; }
.mc-stat-label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 600; }
.mc-stat-icon { font-size: 1.1rem; opacity: 0.5; }
.mc-stat-num { font-size: 2.2rem; font-weight: 800; color: #fff; margin-top: 6px; line-height: 1; }

/* Progress Bar */
.mc-progress-bar-wrap { height: 4px; background: #1a1a24; border-radius: 4px; margin: 12px 0 16px; overflow: hidden; }
.mc-progress-bar { height: 100%; background: linear-gradient(90deg, #4caf50, #8bc34a); border-radius: 4px; transition: width 0.6s ease; }

/* AI Impact */
.mc-impact-section { background: #111118; border: 1px solid #1a1a24; border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
.mc-impact-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.mc-impact-icon { font-size: 1rem; }
.mc-impact-title { font-weight: 600; font-size: 0.95rem; color: #ccc; }
.mc-impact-badge { background: #f4433622; color: #f44336; font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 12px; margin-left: 8px; }
.mc-impact-stats { display: flex; gap: 0; }
.mc-impact-stat { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 8px; border-right: 1px solid #1a1a24; }
.mc-impact-stat:last-child { border-right: none; }
.mc-impact-stat-icon { font-size: 1rem; margin-bottom: 4px; }
.mc-impact-num { font-size: 1.6rem; font-weight: 800; color: #fff; line-height: 1; }
.mc-impact-label { font-size: 0.68rem; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.04em; }

/* Charts Row */
.mc-charts-row { display: flex; gap: 12px; margin-bottom: 16px; }
.mc-chart-card { flex: 1; background: #111118; border: 1px solid #1a1a24; border-radius: 10px; padding: 20px; display: flex; flex-direction: column; align-items: center; }
.mc-chart-title { margin: 0 0 12px; font-size: 0.9rem; font-weight: 600; color: #ccc; align-self: flex-start; }
.mc-donut-wrap { width: 160px; height: 160px; }
.mc-donut { width: 100%; height: 100%; transform: rotate(-90deg); }
.mc-donut-bg { fill: none; stroke: #1a1a24; stroke-width: 10; }
.mc-donut-ring { fill: none; stroke-width: 10; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
.mc-donut-red { stroke: #f44336; }
.mc-donut-seg-low { stroke: #4caf50; }
.mc-donut-seg-med { stroke: #ff9800; }
.mc-donut-seg-high { stroke: #f44336; }
.mc-donut-text { font-size: 1.6rem; font-weight: 800; fill: #fff; text-anchor: middle; dominant-baseline: middle; transform: rotate(90deg); transform-origin: 60px 60px; }
.mc-donut-sub { font-size: 0.6rem; fill: #888; text-anchor: middle; dominant-baseline: middle; transform: rotate(90deg); transform-origin: 60px 60px; text-transform: uppercase; letter-spacing: 0.05em; }
.mc-legend { display: flex; gap: 14px; margin-top: 12px; }
.mc-legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; color: #aaa; }
.mc-leg-dot { width: 8px; height: 8px; border-radius: 50%; }

/* Side Stack */
.mc-side-stack { flex: 1; display: flex; flex-direction: column; gap: 12px; max-width: 340px; }
.mc-side-card { background: #111118; border: 1px solid #1a1a24; border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; }
.mc-side-card-log { flex: 1; min-height: 160px; }
.mc-side-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.mc-side-icon { font-size: 1rem; }
.mc-side-count { font-size: 1.4rem; font-weight: 800; color: #f44336; }
.mc-side-label { font-size: 0.82rem; color: #aaa; }

/* Agent rows */
.mc-agents-list { display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; }
.mc-agent-row { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; background: #0a0a0f; font-size: 0.78rem; }
.mc-astat-running { border-left: 2px solid #4caf50; }
.mc-astat-pending { border-left: 2px solid #ff9800; }
.mc-astat-done { border-left: 2px solid #555; opacity: 0.6; }
.mc-astat-failed { border-left: 2px solid #f44336; }
.mc-agent-name { font-weight: 600; color: #ddd; }
.mc-agent-mission { flex: 1; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mc-agent-elapsed { color: #666; font-size: 0.72rem; }

/* AI Log */
.mc-activity-feed { display: flex; flex-direction: column; gap: 2px; max-height: 180px; overflow-y: auto; }
.mc-log-entry { display: flex; align-items: center; gap: 6px; padding: 5px 8px; font-size: 0.75rem; border-bottom: 1px solid #1a1a24; transition: background 0.4s; }
.mc-log-new { background: #f4433611; }
.mc-log-icon { flex-shrink: 0; }
.mc-log-text { flex: 1; color: #bbb; }
.mc-log-time { color: #555; font-size: 0.68rem; white-space: nowrap; }
.mc-empty-sm { color: #555; font-size: 0.78rem; text-align: center; padding: 12px; }

/* Mind Buttons (inside Memories stat card) */
.mc-stat-mind { position: relative; }
.mc-mind-btns { display: flex; gap: 4px; margin-top: 8px; justify-content: center; }
.mc-mind-btn {
    background: #0a0a0f; border: 1px solid #1a1a24; border-radius: 5px;
    padding: 4px 8px; font-size: 0.82rem; cursor: pointer; transition: all 0.2s;
    line-height: 1; opacity: 0.5;
}
.mc-mind-btn:hover { opacity: 0.9; border-color: #333; background: #15151f; }
.mc-mind-btn-active { opacity: 1; border-color: #9c27b0; background: #1a1a2e; box-shadow: 0 0 6px #9c27b022; }

/* Mind Scope Dropdown */
.mc-mind-scope-anchor { position: relative; display: inline-block; }
.mc-mind-scope-dropdown {
    position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
    background: #111118; border: 1px solid #1a1a24; border-radius: 8px;
    min-width: 160px; max-height: 240px; overflow-y: auto; z-index: 100;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6); padding: 4px;
}
.mc-mind-scope-dropdown::-webkit-scrollbar { width: 4px; }
.mc-mind-scope-dropdown::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
.mc-mind-scope-item {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 7px 10px; border-radius: 5px; cursor: pointer; font-size: 0.75rem;
    color: #aaa; transition: background 0.15s; white-space: nowrap;
}
.mc-mind-scope-item:hover { background: #1a1a2e; color: #ccc; }
.mc-mind-scope-active { background: #1a1a2e; color: #9c27b0; font-weight: 600; }
.mc-mind-scope-count { font-size: 0.65rem; color: #666; background: #0a0a0f; padding: 1px 6px; border-radius: 8px; }
.mc-mind-scope-loading { color: #555; font-style: italic; justify-content: center; }
.mc-mind-scope-divider { height: 1px; background: #1a1a24; margin: 4px 6px; }
.mc-mind-scope-add { color: #4caf50 !important; font-weight: 500; }
.mc-mind-scope-add:hover { background: #0a2010 !important; color: #66bb6a !important; }

/* Mind Drawer */
.mc-mind-drawer {
    background: #111118; border: 1px solid #1a1a24; border-radius: 10px;
    padding: 12px 16px; margin-bottom: 6px; animation: mc-drawer-slide 0.2s ease-out;
}
@keyframes mc-drawer-slide { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 500px; } }
.mc-mind-drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.mc-mind-drawer-title { font-size: 0.85rem; font-weight: 600; color: #ccc; }
.mc-mind-drawer-close {
    background: none; border: none; color: #666; cursor: pointer; font-size: 0.85rem;
    padding: 2px 6px; border-radius: 4px; transition: color 0.15s;
}
.mc-mind-drawer-close:hover { color: #f44336; }

.mc-mind-body { max-height: 350px; overflow-y: auto; }
.mc-mind-body::-webkit-scrollbar { width: 5px; }
.mc-mind-body::-webkit-scrollbar-track { background: transparent; }
.mc-mind-body::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
.mc-mind-content { min-height: 60px; }
.mc-mind-loading { color: #666; font-size: 0.8rem; text-align: center; padding: 20px; }
.mc-mind-empty { color: #555; font-size: 0.82rem; text-align: center; padding: 24px 12px; }
.mc-mind-summary { font-size: 0.7rem; color: #666; margin-bottom: 8px; padding: 0 2px; text-transform: uppercase; letter-spacing: 0.05em; }

/* Mind - Memory groups (accordion) */
.mc-mind-group { border: 1px solid #1a1a24; border-radius: 6px; margin-bottom: 4px; overflow: hidden; }
.mc-mind-group-header {
    display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer;
    background: #0d0d14; transition: background 0.2s; user-select: none;
}
.mc-mind-group-header:hover { background: #15151f; }
.mc-mind-arrow { font-size: 0.55rem; color: #666; transition: transform 0.2s; display: inline-block; }
.mc-mind-expanded > .mc-mind-group-header .mc-mind-arrow { transform: rotate(90deg); }
.mc-mind-group-name { flex: 1; font-size: 0.82rem; font-weight: 600; color: #ccc; }
.mc-mind-group-count {
    background: #1a1a2e; color: #888; font-size: 0.65rem; font-weight: 700;
    padding: 2px 8px; border-radius: 10px; min-width: 18px; text-align: center;
}
.mc-mind-group-items { display: none; padding: 4px 8px 8px; }
.mc-mind-expanded > .mc-mind-group-items { display: block; }

/* Mind - Memory items */
.mc-mind-memory-item {
    padding: 8px 10px; margin: 3px 0; background: #0a0a0f; border-radius: 5px;
    border-left: 2px solid #1a1a24; font-size: 0.78rem; line-height: 1.4;
}
.mc-mind-memory-text { color: #bbb; word-break: break-word; }
.mc-mind-memory-time { color: #555; font-size: 0.65rem; margin-top: 4px; }
.mc-mind-more { color: #666; font-size: 0.72rem; text-align: center; padding: 6px; font-style: italic; }

/* Mind - People grid */
.mc-mind-people-grid { display: flex; flex-direction: column; gap: 4px; }
.mc-mind-person-card {
    display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px;
    background: #0d0d14; border-radius: 6px; border: 1px solid #1a1a24;
}
.mc-mind-person-avatar {
    width: 32px; height: 32px; border-radius: 50%; background: #1a1a2e; color: #f44336;
    display: flex; align-items: center; justify-content: center; font-weight: 700;
    font-size: 0.85rem; flex-shrink: 0;
}
.mc-mind-person-info { flex: 1; min-width: 0; }
.mc-mind-person-name { font-size: 0.82rem; font-weight: 600; color: #ccc; }
.mc-mind-person-rel {
    font-size: 0.65rem; color: #888; background: #1a1a2e; padding: 1px 6px;
    border-radius: 8px; margin-left: 6px; font-weight: 400;
}
.mc-mind-person-details { font-size: 0.7rem; color: #666; margin-top: 2px; }
.mc-mind-person-notes { font-size: 0.72rem; color: #888; margin-top: 4px; line-height: 1.3; }

/* Mind - Knowledge entries */
.mc-mind-kb-desc { font-size: 0.75rem; color: #888; padding: 4px 0 8px; line-height: 1.3; }
.mc-mind-load-entries {
    background: #1a1a2e; color: #888; border: 1px solid #1a1a24; border-radius: 5px;
    padding: 4px 14px; font-size: 0.72rem; cursor: pointer; font-family: inherit;
    transition: all 0.2s;
}
.mc-mind-load-entries:hover { color: #ccc; border-color: #333; }

/* Goals Board */
.mc-board-section { background: #111118; border: 1px solid #1a1a24; border-radius: 10px; padding: 16px 20px; }
.mc-board-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.mc-section-title { margin: 0; font-size: 1rem; font-weight: 600; color: #ccc; }
.mc-board { display: flex; gap: 12px; }
.mc-column { flex: 1; min-width: 180px; }
.mc-column-head { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; font-weight: 600; color: #aaa; padding: 8px 10px; background: #0a0a0f; border-radius: 8px 8px 0 0; border: 1px solid #1a1a24; border-bottom: none; }
.mc-col-dot { width: 8px; height: 8px; border-radius: 50%; }
.mc-col-count { margin-left: auto; font-size: 0.72rem; color: #666; background: #1a1a24; padding: 1px 8px; border-radius: 8px; }
.mc-column-cards { background: #0a0a0f; border: 1px solid #1a1a24; border-radius: 0 0 8px 8px; padding: 8px; min-height: 80px; max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.mc-empty-col { color: #444; font-size: 0.78rem; text-align: center; padding: 20px; }

/* Cards */
.mc-card { background: #111118; border: 1px solid #1a1a24; border-radius: 6px; padding: 10px 12px; cursor: grab; transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s; border-left: 3px solid #333; }
.mc-card:hover { border-color: #333; box-shadow: 0 2px 12px rgba(0,0,0,0.4); }
.mc-card.mc-dragging { opacity: 0.3; }
.mc-drop-hover { background: #f4433611 !important; }
.mc-card-high { border-left-color: #f44336; }
.mc-card-medium { border-left-color: #ff9800; }
.mc-card-low { border-left-color: #4caf50; }
.mc-card-top { display: flex; align-items: center; gap: 6px; }
.mc-card-title { font-weight: 600; font-size: 0.82rem; color: #eee; }
.mc-card-desc { font-size: 0.75rem; color: #777; margin-top: 4px; line-height: 1.3; }
.mc-card-sub { font-size: 0.7rem; color: #666; margin-top: 5px; }
.mc-card-progress { font-size: 0.7rem; color: #888; margin-top: 4px; font-style: italic; border-left: 2px solid #333; padding-left: 6px; }
.mc-card-timestamp { font-size: 0.65rem; color: #555; margin-top: 4px; }
.mc-card-actions { display: flex; gap: 4px; margin-top: 8px; justify-content: flex-end; }
.mc-card-btn { background: none; border: none; cursor: pointer; font-size: 0.75rem; padding: 2px 4px; border-radius: 4px; opacity: 0.4; transition: opacity 0.15s; }
.mc-card-btn:hover { opacity: 1; }
.mc-act-deploy { opacity: 0.7; }
.mc-act-deploy:hover { opacity: 1; filter: drop-shadow(0 0 4px #f44336); }
.mc-perm { font-size: 0.65rem; vertical-align: middle; }

/* Buttons */
.mc-btn { padding: 7px 16px; border-radius: 6px; border: 1px solid #333; background: #1a1a24; color: #ccc; cursor: pointer; font-size: 0.82rem; transition: background 0.15s; }
.mc-btn:hover { background: #222; }
.mc-btn-accent { background: #f44336; color: #fff; border-color: #f44336; }
.mc-btn-accent:hover { background: #d32f2f; }

/* Modal */
.mc-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.mc-modal { background: #111118; border: 1px solid #222; border-radius: 12px; width: 440px; max-width: 92vw; box-shadow: 0 12px 48px rgba(0,0,0,0.6); }
.mc-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #1a1a24; }
.mc-modal-header h3 { margin: 0; font-size: 1rem; color: #fff; }
.mc-modal-close { background: none; border: none; color: #666; cursor: pointer; font-size: 1.1rem; }
.mc-modal-close:hover { color: #fff; }
.mc-modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
.mc-modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid #1a1a24; }
.mc-perm-check { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #bbb; cursor: pointer; padding: 4px 0; }
.mc-perm-check input[type="checkbox"] { accent-color: #9c27b0; width: 16px; height: 16px; cursor: pointer; }

/* Schedule */
.mc-scheduled { color: #4fc3f7 !important; text-shadow: 0 0 8px rgba(79,195,247,0.6), 0 0 16px rgba(79,195,247,0.3); filter: drop-shadow(0 0 4px rgba(79,195,247,0.5)); }
.mc-countdown { font-size: 0.65rem; color: #4fc3f7; background: #4fc3f714; padding: 2px 6px; border-radius: 8px; white-space: nowrap; margin-left: 2px; }
.mc-sched-goal-name { font-size: 0.95rem; font-weight: 600; color: #f44336; padding: 6px 10px; background: #f4433612; border-radius: 6px; margin-bottom: 4px; }
.mc-sched-row { margin-top: 2px; }
.mc-sched-preview { margin-top: 8px; padding: 8px 12px; background: #0d0d14; border: 1px solid #1a1a24; border-radius: 8px; font-size: 0.8rem; color: #4fc3f7; }
.mc-day-picker { display: flex; gap: 6px; margin: 4px 0 8px; }
.mc-day-btn { background: #1a1a24; border: 1px solid #2a2a3a; color: #888; padding: 6px 10px; border-radius: 6px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s; font-weight: 600; }
.mc-day-btn:hover { border-color: #4fc3f7; color: #ccc; }
.mc-day-btn.mc-day-active { background: #4fc3f7; color: #0a0a0f; border-color: #4fc3f7; }

/* Schedule Calendar */
.mc-calendar-section { background: #111118; border: 1px solid #1a1a24; border-radius: 10px; padding: 16px 20px; margin-top: 16px; }
.mc-week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 16px; }
.mc-cal-day { background: #0d0d14; border: 1px solid #1a1a24; border-radius: 8px; padding: 8px; min-height: 80px; }
.mc-cal-today { border-color: #4fc3f7; box-shadow: 0 0 8px rgba(79,195,247,0.15); }
.mc-cal-day-label { font-size: 0.7rem; font-weight: 700; color: #666; text-transform: uppercase; text-align: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #1a1a24; }
.mc-cal-today .mc-cal-day-label { color: #4fc3f7; }
.mc-cal-task { background: #1a1a24; border-radius: 5px; padding: 4px 6px; margin-bottom: 4px; }
.mc-cal-task-name { font-size: 0.65rem; color: #ccc; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mc-cal-task-time { font-size: 0.6rem; color: #666; }
.mc-cal-empty { font-size: 0.65rem; color: #333; text-align: center; padding: 8px 0; }

/* Next Up */
.mc-next-up { background: #0d0d14; border: 1px solid #1a1a24; border-radius: 8px; padding: 10px 14px; }
.mc-next-up-header { font-size: 0.8rem; font-weight: 700; color: #888; margin-bottom: 8px; }
.mc-next-item { display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid #111118; }
.mc-next-item:last-child { border-bottom: none; }
.mc-next-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-right: 10px; }
.mc-next-name { flex: 1; font-size: 0.78rem; color: #4fc3f7; font-weight: 600; }
.mc-next-time { font-size: 0.72rem; color: #666; margin-left: 10px; }
.mc-btn-danger { background: #b71c1c; color: #fff; border-color: #b71c1c; }
.mc-btn-danger:hover { background: #d32f2f; }
.mc-perm-hint { color: #555; font-size: 0.7rem; }
.mc-label { font-size: 0.78rem; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.mc-input { width: 100%; padding: 9px 12px; background: #0a0a0f; border: 1px solid #222; border-radius: 6px; color: #e0e0e0; font-size: 0.85rem; box-sizing: border-box; }
.mc-input:focus { border-color: #f44336; outline: none; box-shadow: 0 0 0 2px #f4433622; }
.mc-textarea { resize: vertical; min-height: 60px; font-family: inherit; }
select.mc-input { cursor: pointer; }

/* Scrollbar styling */
.mc-chat-messages::-webkit-scrollbar,
.mc-dash::-webkit-scrollbar,
.mc-column-cards::-webkit-scrollbar,
.mc-agents-list::-webkit-scrollbar,
.mc-activity-feed::-webkit-scrollbar {
    width: 5px;
}
.mc-chat-messages::-webkit-scrollbar-track,
.mc-dash::-webkit-scrollbar-track,
.mc-column-cards::-webkit-scrollbar-track,
.mc-agents-list::-webkit-scrollbar-track,
.mc-activity-feed::-webkit-scrollbar-track {
    background: transparent;
}
.mc-chat-messages::-webkit-scrollbar-thumb,
.mc-dash::-webkit-scrollbar-thumb,
.mc-column-cards::-webkit-scrollbar-thumb,
.mc-agents-list::-webkit-scrollbar-thumb,
.mc-activity-feed::-webkit-scrollbar-thumb {
    background: #222;
    border-radius: 4px;
}

/* ─── 16-Bit Pixel Art Workshop ─── */
.mc-pixel-section { background: #111118; border: 1px solid #1a1a24; border-radius: 10px; padding: 12px; margin-top: 16px; overflow: hidden; }
.mc-pixel-stage { display: flex; align-items: center; justify-content: center; gap: 0; position: relative; border-radius: 8px; border: 1px solid #1a1a24; overflow: hidden; background: #080810; }
.mc-pixel-stage::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 6px); z-index: 10; mix-blend-mode: multiply; border-radius: 8px; }
.mc-pixel-desk { flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; z-index: 1; min-width: 0; overflow: hidden; }
.mc-pixel-canvas { width: 100%; aspect-ratio: 629 / 1024; display: block; }

/* Hub / connection center */
.mc-pixel-hub { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 80px; flex-shrink: 0; z-index: 5; position: relative; }
.mc-pixel-hub-core { width: 44px; height: 44px; border-radius: 50%; position: relative; display: flex; align-items: center; justify-content: center; }
.mc-pixel-hub-ring { position: absolute; inset: 0; border: 2px solid #2a2a44; border-radius: 50%; transition: all 0.5s; }
.mc-pixel-hub-dot { width: 14px; height: 14px; background: #333; border-radius: 50%; transition: all 0.5s; box-shadow: 0 0 6px transparent; }
.mc-pixel-status { font-size: 0.55rem; font-weight: 800; letter-spacing: 0.15em; color: #555; margin-top: 8px; transition: color 0.3s; }
.mc-pixel-data-stream { position: absolute; top: 50%; left: -30px; right: -30px; height: 2px; }
.mc-pixel-particle { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #333; opacity: 0; top: -1px; }

/* ─── Hub State Styles ─── */
.mc-px-idle .mc-pixel-hub-dot { background: #444; animation: mc-idle-breathe 3s ease-in-out infinite; }
.mc-px-idle .mc-pixel-hub-ring { animation: mc-idle-ring 4s ease-in-out infinite; }

.mc-px-thinking .mc-pixel-hub-dot { background: #ffc107; box-shadow: 0 0 12px rgba(255,193,7,0.6); }
.mc-px-thinking .mc-pixel-hub-ring { border-color: #ffc107; animation: mc-hub-spin 2s linear infinite; }
.mc-px-thinking .mc-pixel-status { color: #ffc107; }
.mc-px-thinking .mc-pixel-particle { background: #ffc107; animation: mc-particle-flow-r 1.2s linear infinite; }
.mc-px-thinking .mc-p2 { animation-delay: 0.3s; }
.mc-px-thinking .mc-p3 { animation-delay: 0.6s; }
.mc-px-thinking .mc-p4 { animation-delay: 0.9s; }

.mc-px-typing .mc-pixel-hub-dot { background: #4fc3f7; box-shadow: 0 0 12px rgba(79,195,247,0.6); }
.mc-px-typing .mc-pixel-hub-ring { border-color: #4fc3f7; }
.mc-px-typing .mc-pixel-status { color: #4fc3f7; }
.mc-px-typing .mc-pixel-particle { background: #4fc3f7; animation: mc-particle-flow-l 1s linear infinite; }
.mc-px-typing .mc-p2 { animation-delay: 0.25s; }
.mc-px-typing .mc-p3 { animation-delay: 0.5s; }
.mc-px-typing .mc-p4 { animation-delay: 0.75s; }

.mc-px-tool .mc-pixel-hub-dot { background: #ff9800; box-shadow: 0 0 14px rgba(255,152,0,0.7); }
.mc-px-tool .mc-pixel-hub-ring { border-color: #ff9800; animation: mc-hub-pulse 0.6s ease-in-out infinite; }
.mc-px-tool .mc-pixel-status { color: #ff9800; }
.mc-px-tool .mc-pixel-particle { background: #ff9800; animation: mc-particle-burst 0.8s ease-out infinite; }
.mc-px-tool .mc-p2 { animation-delay: 0.2s; }
.mc-px-tool .mc-p3 { animation-delay: 0.4s; }
.mc-px-tool .mc-p4 { animation-delay: 0.6s; }

.mc-px-agent .mc-pixel-hub-dot { background: #e040fb; box-shadow: 0 0 16px rgba(224,64,251,0.7); }
.mc-px-agent .mc-pixel-hub-ring { border-color: #e040fb; animation: mc-hub-spin 1s linear infinite; }
.mc-px-agent .mc-pixel-status { color: #e040fb; }
.mc-px-agent .mc-pixel-particle { background: #e040fb; animation: mc-particle-flow-r 0.6s linear infinite; }
.mc-px-agent .mc-p2 { animation-delay: 0.15s; }
.mc-px-agent .mc-p3 { animation-delay: 0.3s; }
.mc-px-agent .mc-p4 { animation-delay: 0.45s; }

.mc-px-done .mc-pixel-hub-dot { background: #4caf50; box-shadow: 0 0 14px rgba(76,175,80,0.7); }
.mc-px-done .mc-pixel-hub-ring { border-color: #4caf50; }
.mc-px-done .mc-pixel-status { color: #4caf50; }

/* ─── Hub Keyframes ─── */
@keyframes mc-idle-breathe { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.05); } }
@keyframes mc-idle-ring { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }
@keyframes mc-hub-spin { to { transform: rotate(360deg); } }
@keyframes mc-hub-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
@keyframes mc-particle-flow-r {
    0% { left: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { left: 100%; opacity: 0; }
}
@keyframes mc-particle-flow-l {
    0% { right: 0%; left: auto; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { right: 100%; left: auto; opacity: 0; }
}
@keyframes mc-particle-burst {
    0% { left: 50%; opacity: 0; transform: scale(0.5); } 30% { opacity: 1; transform: scale(1.5); } 100% { opacity: 0; transform: scale(0.5); }
}

/* Responsive */
@media (max-width: 1100px) {
    .mc-chat-panel { width: 280px; min-width: 240px; }
    .mc-charts-row { flex-wrap: wrap; }
    .mc-side-stack { max-width: none; }
}
@media (max-width: 800px) {
    .mc-root { flex-direction: column; }
    .mc-chat-panel { width: 100%; max-width: none; height: 300px; border-right: none; border-bottom: 1px solid #1a1a24; }
    .mc-dash { padding: 0 12px 24px; }
    .mc-board { flex-direction: column; }
    .mc-stats-row { flex-wrap: wrap; }
    .mc-stat-card { min-width: 120px; }
    .mc-greeting { font-size: 1.3rem; }
    .mc-week-grid { grid-template-columns: repeat(4, 1fr); }
    .mc-pixel-stage { max-height: 60vh; }
    .mc-pixel-hub { width: 50px; }
}
`;
    document.head.appendChild(style);
}
