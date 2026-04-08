// Mission Control — main.js
// Tab-based shell with always-visible chat panel.
// Auto-loaded by Sapphire. Injects nav items + registers views.

import { registerView, switchView } from '/static/core/router.js';
import { injectTheme } from './styles/theme.js';
import { CSRF } from './lib/api.js';

// ─── Tab Definitions ──────────────────────────────────────────────────────────

const TABS = [
    { id: 'dashboard',  icon: '\u{1F3E0}', label: 'Dashboard' },
    { id: 'goals',      icon: '\u{1F3AF}', label: 'Goals & Notes' },
    { id: 'calendar',   icon: '\u{1F4C5}', label: 'Calendar' },
    { id: 'focus',      icon: '\u{23F1}\u{FE0F}', label: 'Focus' },
    { id: 'reflection', icon: '\u{1F9E0}', label: 'Reflection' },
    { id: 'workshop',   icon: '\u{1F3A8}', label: 'Workshop' },
];

// ─── Shared Context ───────────────────────────────────────────────────────────
// Passed to every tab module and the chat panel so they can communicate.

export const mc = {
    container: null,
    activeTab: null,
    tabModules: {},
    _tabInstances: {},
    bus: new EventTarget(),
    switchView,
    pendingLaunchMsg: null,
};

mc.emit = (name, detail) => mc.bus.dispatchEvent(new CustomEvent(name, { detail }));
mc.on   = (name, fn) => mc.bus.addEventListener(name, fn);
mc.off  = (name, fn) => mc.bus.removeEventListener(name, fn);

// ─── Plugin Entry Point ─────────────────────────────────────────────────────

export default {
    async init() {
        injectTheme();

        // Fetch plugin settings to check if Apps nav button is enabled
        let showApps = false;
        try {
            const res = await fetch('/api/webui/plugins/mission-control/settings');
            if (res.ok) {
                const data = await res.json();
                showApps = data.settings?.show_apps_nav === true;
            }
        } catch {}

        _injectNav(showApps);
        _createViewContainers();
        registerView('mc-apps', {
            init: (el) => _initLauncher(el),
            show: () => _onShowLauncher(),
            hide: () => {},
        });
        registerView('mission-control', {
            init: (el) => _initShell(el),
            show: () => _onShowShell(),
            hide: () => _onHideShell(),
        });
        _unregisterServiceWorker();
    }
};

// ─── Navigation Injection ─────────────────────────────────────────────────────

function _injectNav(showApps = false) {
    const rail = document.getElementById('nav-rail');
    if (!rail) return;
    const spacer = rail.querySelector('.nav-spacer');

    if (showApps) {
        const appsBtn = document.createElement('button');
        appsBtn.className = 'nav-item';
        appsBtn.dataset.view = 'mc-apps';
        appsBtn.innerHTML = '<span class="nav-icon">\u{1F4F1}</span><span class="nav-label">Apps</span>';
        if (spacer) rail.insertBefore(appsBtn, spacer);
        else rail.appendChild(appsBtn);
    }

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

    const appsDiv = document.createElement('div');
    appsDiv.id = 'view-mc-apps';
    appsDiv.className = 'view';
    appsDiv.style.display = 'none';
    app.appendChild(appsDiv);

    const mcDiv = document.createElement('div');
    mcDiv.id = 'view-mission-control';
    mcDiv.className = 'view';
    mcDiv.style.display = 'none';
    app.appendChild(mcDiv);
}

// ─── Launcher (lazy-loaded) ───────────────────────────────────────────────────

let _launcherModule = null;

async function _initLauncher(el) {
    injectTheme();
    if (!_launcherModule) {
        _launcherModule = await import('./launcher.js');
    }
    _launcherModule.init(el, mc);
}

function _onShowLauncher() {
    if (_launcherModule) _launcherModule.show();
}

// ─── Shell Init ───────────────────────────────────────────────────────────────

function _initShell(el) {
    mc.container = el;
    el.innerHTML = _buildShellLayout();
    _bindShellEvents(el);
    _restoreCollapseState();
    _initChatPanel();
    _initPersonaWatcher();
    _initScope().then(() => _switchTab('dashboard'));
}

async function _initScope() {
    // Determine scope from the active persona's memory_scope setting
    try {
        const statusResp = await fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } });
        if (statusResp.ok) {
            const statusData = await statusResp.json();
            const personaName = statusData.chat_settings?.persona || '';
            console.log('[MC] _initScope: active persona =', JSON.stringify(personaName));
            if (personaName) {
                // Fetch the full persona config to get memory_scope
                const pResp = await fetch(`/api/personas/${encodeURIComponent(personaName)}`, { headers: { 'X-CSRF-Token': CSRF() } });
                if (pResp.ok) {
                    const pData = await pResp.json();
                    const memScope = pData.settings?.memory_scope || 'default';
                    console.log('[MC] _initScope: memory_scope =', JSON.stringify(memScope));
                    mc.selectedScope = memScope;
                    return;
                } else {
                    console.warn('[MC] _initScope: persona fetch failed:', pResp.status);
                }
            } else {
                console.warn('[MC] _initScope: no persona name in chat_settings');
            }
        } else {
            console.warn('[MC] _initScope: status fetch failed:', statusResp.status);
        }
    } catch (e) {
        console.warn('[MC] Failed to fetch active persona scope:', e);
    }
    // Fallback: pick the largest memory scope
    try {
        const resp = await fetch('/api/plugin/mission-control/memory/scopes', { headers: { 'X-CSRF-Token': CSRF() } });
        if (resp.ok) {
            const data = await resp.json();
            const scopes = data.scopes || [];
            if (scopes.length > 0) {
                const largest = scopes.reduce((a, b) => (b.count || 0) > (a.count || 0) ? b : a, scopes[0]);
                mc.selectedScope = largest.name;
                return;
            }
        }
    } catch (e) {
        console.warn('[MC] Failed to fetch memory scopes:', e);
    }
    mc.selectedScope = 'default';
}

function _buildShellLayout() {
    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Good morning' :
                     now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    return `
    <div class="mc-root" id="mc-root">
        <!-- Expand chat button (visible when collapsed) -->
        <button class="mc-expand-btn" id="mc-expand-btn" title="Open chat panel">\u{1F4AC}</button>

        <!-- ═══ LEFT: Chat Panel ═══ -->
        <div class="mc-chat-panel" id="mc-chat-panel">
            <div id="mc-chat-mount"></div>
        </div>

        <!-- ═══ RIGHT: Tabbed Dashboard ═══ -->
        <div class="mc-dash">
            <header class="mc-header">
                <div class="mc-header-left">
                    <button class="mc-back-btn" id="mc-back-to-launcher" title="Back to apps">\u{2B05}\u{FE0F}</button>
                    <h1 class="mc-greeting">${greeting}</h1>
                    <p class="mc-date">${dateStr} &middot; <span id="mc-live-clock"></span></p>
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

            <!-- Tab Bar -->
            <nav class="mc-tab-bar" id="mc-tab-bar">
                ${TABS.map(t => `
                    <button class="mc-tab-btn" data-tab="${t.id}">
                        <span class="mc-tab-icon">${t.icon}</span>
                        <span class="mc-tab-label">${t.label}</span>
                    </button>
                `).join('')}
            </nav>

            <!-- Tab Content -->
            <div class="mc-tab-content" id="mc-tab-content"></div>
        </div>
    </div>`;
}

function _bindShellEvents(el) {
    // Back to launcher
    el.querySelector('#mc-back-to-launcher').addEventListener('click', () => switchView('mc-apps'));

    // Chat panel collapse/expand (expand btn is in shell, collapse btn is in chat module)
    el.querySelector('#mc-expand-btn').addEventListener('click', () => _toggleChatPanel(false));

    // Delegate collapse from chat module
    mc.on('chat-collapse', () => _toggleChatPanel(true));

    // Tab bar clicks
    el.querySelectorAll('.mc-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
    });

    // Start live clock
    _startClock();
}

// ─── Tab Router ───────────────────────────────────────────────────────────────

async function _switchTab(tabId) {
    if (mc.activeTab === tabId) return;

    // Destroy previous tab instance
    const prev = mc._tabInstances[mc.activeTab];
    if (prev) prev.destroy?.();

    // Update tab bar active state
    mc.container.querySelectorAll('.mc-tab-btn').forEach(btn => {
        btn.classList.toggle('mc-tab-active', btn.dataset.tab === tabId);
    });

    mc.activeTab = tabId;
    const content = document.getElementById('mc-tab-content');
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--mc-text-muted)">Loading...</div>';

    try {
        // Lazy-load tab module (cached after first load)
        if (!mc.tabModules[tabId]) {
            mc.tabModules[tabId] = await import(`./tabs/${tabId}.js`);
        }
        const mod = mc.tabModules[tabId];
        content.innerHTML = '';
        const instance = mod.init(content, mc);
        mc._tabInstances[tabId] = instance || mod;
    } catch (e) {
        console.error(`[MC] Failed to load tab "${tabId}":`, e);
        content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--mc-magenta,#ff00aa)">
            <p>\u{26A0} Failed to load <strong>${tabId}</strong> tab</p>
            <p style="font-size:0.8rem;color:var(--mc-text-muted);margin-top:8px">${e.message}</p>
        </div>`;
    }

    mc.emit('tab-changed', { tab: tabId });
}

// ─── Chat Panel (lazy-loaded, mounted once) ───────────────────────────────────

let _chatModule = null;

async function _initChatPanel() {
    try {
        _chatModule = await import('./chat/chat-panel.js');
        const mount = document.getElementById('mc-chat-mount');
        if (mount) _chatModule.init(mount, mc);
    } catch (e) {
        console.error('[MC] Failed to load chat panel:', e);
        const mount = document.getElementById('mc-chat-mount');
        if (mount) mount.innerHTML = '<div style="padding:20px;color:#888">Chat failed to load</div>';
    }
}

// ─── Show / Hide Lifecycle ────────────────────────────────────────────────────

let _eventSource = null;
let _clockTimer = null;
function _onShowShell() {
    _connectEvents();
    _startClock();

    // Check if persona changed while we were away
    _checkPersonaChange();

    // Refresh active tab
    const inst = mc._tabInstances[mc.activeTab];
    if (inst) inst.refresh?.();

    // Activate chat
    if (_chatModule) _chatModule.show?.();

    // Handle pending launch message from launcher
    if (mc.pendingLaunchMsg) {
        const msg = mc.pendingLaunchMsg;
        mc.pendingLaunchMsg = null;
        setTimeout(() => mc.emit('send-message', { text: msg }), 500);
    }
}

function _onHideShell() {
    _disconnectEvents();
    if (_clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }

    // Pause active tab
    const inst = mc._tabInstances[mc.activeTab];
    if (inst) inst.destroy?.();

    // Pause chat
    if (_chatModule) _chatModule.hide?.();
}

// ─── Persona Change Detection ────────────────────────────────────────────────
// Fires on view show + page focus — no polling needed

function _initPersonaWatcher() {
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) _checkPersonaChange();
    });
    window.addEventListener('focus', () => _checkPersonaChange());
}

async function _checkPersonaChange() {
    try {
        const resp = await fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const data = await resp.json();
        const currentPersona = data.chat_settings?.persona || '';

        // First check — just record it
        if (!mc.activePersonaName) {
            mc.activePersonaName = currentPersona;
            return;
        }

        // Persona changed externally
        if (currentPersona !== mc.activePersonaName) {
            mc.activePersonaName = currentPersona;
            console.log(`[MC] Persona changed externally to "${currentPersona}", updating scope...`);

            // Fetch the persona's memory_scope
            if (currentPersona) {
                try {
                    const pResp = await fetch(`/api/personas/${encodeURIComponent(currentPersona)}`, { headers: { 'X-CSRF-Token': CSRF() } });
                    if (pResp.ok) {
                        const pData = await pResp.json();
                        mc.selectedScope = pData.settings?.memory_scope || 'default';
                    } else {
                        mc.selectedScope = 'default';
                    }
                } catch { mc.selectedScope = 'default'; }
            } else {
                mc.selectedScope = 'default';
            }

            // Update chat panel display
            if (_chatModule && _chatModule.refreshPersona) {
                _chatModule.refreshPersona();
            }

            // Notify all tabs
            mc.emit('refresh-data');
        }
    } catch (e) {
        // Silently ignore — just a poll
    }
}

// ─── SSE Connection ───────────────────────────────────────────────────────────

function _connectEvents() {
    if (_eventSource) _eventSource.close();
    try {
        _eventSource = new EventSource('/api/events?replay=false');
        _eventSource.addEventListener('message', e => {
            try {
                const evt = JSON.parse(e.data);
                if (!evt.type || evt.type === 'keepalive') return;
                // Broadcast to all modules via event bus
                mc.emit('sse', evt);
            } catch {}
        });
    } catch (e) {
        console.error('[MC] EventSource failed:', e);
    }
}

function _disconnectEvents() {
    if (_eventSource) { _eventSource.close(); _eventSource = null; }
}

// ─── Chat Panel Toggle ───────────────────────────────────────────────────────

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

// ─── Live Clock ───────────────────────────────────────────────────────────────

function _startClock() {
    if (_clockTimer) clearInterval(_clockTimer);
    const update = () => {
        const el = document.getElementById('mc-live-clock');
        if (el) el.textContent = new Date().toLocaleTimeString('en-US', {
            hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
        });
    };
    update();
    _clockTimer = setInterval(update, 1000);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

function _unregisterServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            for (const reg of regs) {
                if (reg.scope && reg.scope.includes('mission-control')) {
                    reg.unregister();
                }
            }
        });
    }
}
