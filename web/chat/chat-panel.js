// chat/chat-panel.js — Always-visible chat panel
// Handles messaging, streaming, persona switching, chat management, tool health, TTS.

import { CSRF } from '../lib/api.js';
import { esc, setText, renderMarkdown } from '../lib/utils.js';

let _mc = null;
let _container = null;
let _chatStream = null;
let _isStreaming = false;
let _toolHealthDismissed = false;
let _deployedGoalId = null;
let _chatRefreshInterval = null;
let _personaApplied = false;

const _FAKE_TOOL_PATTERNS = [
    /<function_call>\s*\{/i,
    /<tool_call>\s*\{/i,
    /<\|tool_call\|>/i,
    /"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"\s*:/i,
    /(?:let me|i'll|i should|i'm going to)\s+(?:call|use|invoke|run)\s+(?:the\s+)?(?:`?[a-z_]+`?\s+)?(?:function|tool)/i,
    /(?:calling|executing|running)\s+`?[a-z_]+\(/i,
];

// ─── Init ──────────────���───────────────────────────��──────────────────────────

export function init(mount, mc) {
    _mc = mc;
    _container = mount;
    mount.innerHTML = _buildHTML();
    _bindEvents(mount);

    // Fetch and display the actual active persona, chat history, and context bar immediately
    _loadActivePersona();
    _loadChatHistory();
    _updateContextBar();

    // Listen for cross-module events
    mc.on('deploy-goal', e => { _deployedGoalId = e.detail?.goalId || null; });
    mc.on('send-message', e => { _autoSendMessage(e.detail?.text); });
    mc.on('prefill-chat', e => { _prefillInput(e.detail?.text); });
}

export function refreshPersona() {
    _loadActivePersona();
}

export function show() {
    _loadChatHistory();
    _loadActivePersona();
    _updateContextBar();
    _chatRefreshInterval = setInterval(() => {
        if (!_isStreaming) _loadChatHistory();
    }, 30000);
}

export function hide() {
    if (_chatRefreshInterval) { clearInterval(_chatRefreshInterval); _chatRefreshInterval = null; }
}

// ─── Layout ───────────���──────────────────────────────���────────────────────────

function _buildHTML() {
    return `
        <!-- Persona banner -->
        <div class="mc-persona-bar" id="mc-persona-bar">
            <div class="mc-persona-avatar-wrap" id="mc-persona-click">
                <img class="mc-persona-avatar" id="mc-persona-avatar" src="" alt="">
                <div class="mc-persona-avatar-fallback" id="mc-persona-fallback">AI</div>
            </div>
            <div class="mc-persona-info">
                <span class="mc-persona-name" id="mc-persona-name">Loading...</span>
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
        <div class="mc-tool-health-bar" id="mc-tool-health-bar" style="display:none">
            <span class="mc-tool-health-icon">\u{26A0}</span>
            <span class="mc-tool-health-text">Tool calling issue detected \u2014 AI may be writing tools as text. A fresh chat may help.</span>
            <button class="mc-tool-health-nudge" id="mc-tool-health-nudge" title="Send a gentle reminder about available tools">\u{1F4A1} Nudge</button>
            <button class="mc-tool-health-dismiss" id="mc-tool-health-dismiss" title="Dismiss">\u{2715}</button>
        </div>
        <div class="mc-chat-messages" id="mc-chat-messages">
            <div class="mc-chat-welcome">
                <div class="mc-chat-welcome-icon">\u{1F3AF}</div>
                <div class="mc-chat-welcome-text">Mission Control</div>
                <div class="mc-chat-welcome-sub">Chat with your AI from here.<br>Agents, goals, and tools \u2014 all in one view.</div>
            </div>
        </div>
        <div class="mc-chat-input-wrap">
            <div class="mc-context-bar" id="mc-context-bar">
                <div class="mc-context-track">
                    <div class="mc-context-fill" id="mc-context-fill" style="width:0%"></div>
                </div>
                <span class="mc-context-label" id="mc-context-label">0%</span>
            </div>
            <div class="mc-chat-streaming-indicator" id="mc-streaming-indicator" style="display:none">
                <span class="mc-typing-dots"><span></span><span></span><span></span></span>
                <span>AI is responding...</span>
                <button class="mc-chat-cancel" id="mc-chat-cancel" title="Cancel">\u{2715}</button>
            </div>
            <div class="mc-chat-input-row">
                <textarea class="mc-chat-input" id="mc-chat-input" placeholder="Send a message..." rows="1"></textarea>
                <button class="mc-chat-send" id="mc-chat-send" title="Send">\u{27A4}</button>
            </div>
        </div>`;
}

// ─── Event Binding ──────────��─────────────────────────────────────────────────

function _bindEvents(el) {
    // Collapse
    el.querySelector('#mc-collapse-btn').addEventListener('click', () => _mc.emit('chat-collapse'));

    // Send / cancel
    el.querySelector('#mc-chat-send').addEventListener('click', () => _sendMessage());
    el.querySelector('#mc-chat-cancel').addEventListener('click', () => _cancelStream());

    // Input
    const input = el.querySelector('#mc-chat-input');
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
    });
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Tool health
    const nudge = el.querySelector('#mc-tool-health-nudge');
    if (nudge) nudge.addEventListener('click', () => _sendToolNudge());
    const dismiss = el.querySelector('#mc-tool-health-dismiss');
    if (dismiss) dismiss.addEventListener('click', () => {
        const bar = document.getElementById('mc-tool-health-bar');
        if (bar) bar.style.display = 'none';
        _toolHealthDismissed = true;
    });

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
    el.querySelector('#mc-chat-import').addEventListener('click', () => el.querySelector('#mc-import-file').click());
    el.querySelector('#mc-import-file').addEventListener('change', e => _importChat(e));

    // Close dropdown on outside click
    document.addEventListener('click', e => {
        const dropdown = document.getElementById('mc-chat-dropdown');
        const switcher = document.getElementById('mc-chat-switcher');
        if (dropdown && dropdown.style.display !== 'none' && !dropdown.contains(e.target) && e.target !== switcher) {
            dropdown.style.display = 'none';
        }
    });
}

// ─── Chat History ─────────────────────────────────────���───────────────────────

async function _loadChatHistory() {
    try {
        const resp = await fetch('/api/history', { headers: { 'X-CSRF-Token': CSRF() } });
        if (resp.status === 429) { setTimeout(_loadChatHistory, 2000); return; }
        if (!resp.ok) return;
        const data = await resp.json();
        const container = document.getElementById('mc-chat-messages');
        if (!container) return;

        const nameEl = document.getElementById('mc-chat-name');
        if (nameEl && data.chat_name) nameEl.textContent = data.chat_name;

        if (!data.messages || data.messages.length === 0) {
            container.innerHTML = `
                <div class="mc-chat-welcome">
                    <div class="mc-chat-welcome-icon">\u{1F3AF}</div>
                    <div class="mc-chat-welcome-text">Mission Control</div>
                    <div class="mc-chat-welcome-sub">Chat with your AI from here.<br>Agents, goals, and tools \u2014 all in one view.</div>
                </div>`;
            return;
        }

        container.innerHTML = '';
        for (const msg of data.messages) {
            if (msg.role === 'user') {
                _appendBubble('user', msg.content || '');
            } else if (msg.role === 'assistant') {
                let text = '';
                if (msg.parts) {
                    for (const part of msg.parts) {
                        if (part.type === 'content') text += part.text || '';
                        else if (part.type === 'tool_call') text += `\n\u{1F527} ${part.name || 'tool'}...\n`;
                        else if (part.type === 'tool_result') {
                            const status = part.result?.includes?.('error') ? '\u{274C}' : '\u{2705}';
                            text += ` ${status}\n`;
                        }
                    }
                } else {
                    text = msg.content || '';
                }
                if (text.trim()) _appendBubble('assistant', text.trim(), msg.metadata || {});
            }
        }
        _scrollChat();
    } catch (e) {
        console.error('[MC] Failed to load chat history:', e);
    }
}

function _appendBubble(role, text, metadata) {
    const container = document.getElementById('mc-chat-messages');
    if (!container) return null;
    const welcome = container.querySelector('.mc-chat-welcome');
    if (welcome) welcome.remove();

    const bubble = document.createElement('div');
    bubble.className = `mc-bubble mc-bubble-${role}`;

    let footerHtml = '';
    if (role === 'assistant') {
        const model = metadata?.model || '';
        const provider = metadata?.provider || '';
        const modelLabel = model || provider || '';
        footerHtml = `<div class="mc-bubble-footer">` +
            (modelLabel ? `<span class="mc-bubble-model" title="${esc(provider + ' / ' + model)}">${esc(modelLabel)}</span>` : '') +
            `<button class="mc-bubble-thumbsdown" title="Mark as bad response">\u{1F44E}</button>` +
            `</div>`;
    }

    bubble.innerHTML = `<div class="mc-bubble-content">${role === 'user' ? esc(text) : renderMarkdown(text)}</div>${footerHtml}`;

    // Thumbs down handler
    const thumbBtn = bubble.querySelector('.mc-bubble-thumbsdown');
    if (thumbBtn) {
        thumbBtn.addEventListener('click', () => {
            if (thumbBtn.classList.contains('mc-thumbed')) return;
            thumbBtn.classList.add('mc-thumbed');
            thumbBtn.textContent = '\u{1F44E} logged';
            _logThumbsDown(text, metadata);
        });
    }

    container.appendChild(bubble);
    return bubble;
}

function _scrollChat() {
    const container = document.getElementById('mc-chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
}

async function _logThumbsDown(responseText, metadata) {
    try {
        const payload = {
            model: metadata?.model || 'unknown',
            provider: metadata?.provider || 'unknown',
            response_preview: (responseText || '').substring(0, 500),
            timestamp: new Date().toISOString()
        };
        await fetch('/api/plugin/mission-control/feedback/thumbsdown', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        console.error('[MC] Thumbs down log error:', e);
    }
}

// ─── Send Message ���─────────────────────────────���──────────────────────────────

async function _sendMessage() {
    const input = document.getElementById('mc-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || _isStreaming) return;

    input.value = '';
    input.style.height = 'auto';

    _appendBubble('user', text);
    _scrollChat();

    _isStreaming = true;
    const indicator = document.getElementById('mc-streaming-indicator');
    if (indicator) indicator.style.display = '';

    // Refresh context bar before sending so user sees current state
    _updateContextBar();

    const bubble = _appendBubble('assistant', '');
    const content = bubble?.querySelector('.mc-bubble-content');
    let fullText = '';
    let streamMeta = {};

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
                        if (content) content.innerHTML = renderMarkdown(fullText);
                        _scrollChat();
                    } else if (evt.type === 'tool_start') {
                        fullText += `\n\u{1F527} Running: ${evt.name || 'tool'}...\n`;
                        if (content) content.innerHTML = renderMarkdown(fullText);
                        _scrollChat();
                    } else if (evt.type === 'tool_end') {
                        fullText += ` ${evt.error ? '\u{274C} failed' : '\u{2705} done'}\n`;
                        if (content) content.innerHTML = renderMarkdown(fullText);
                        _scrollChat();
                    } else if (evt.done || evt.cancelled) {
                        if (evt.model) streamMeta.model = evt.model;
                        if (evt.provider) streamMeta.provider = evt.provider;
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

    // Inject model tag and thumbs down into the streamed bubble
    if (bubble) {
        const modelLabel = streamMeta.model || streamMeta.provider || '';
        const footer = document.createElement('div');
        footer.className = 'mc-bubble-footer';
        footer.innerHTML = (modelLabel ? `<span class="mc-bubble-model" title="${esc((streamMeta.provider || '') + ' / ' + (streamMeta.model || ''))}">${esc(modelLabel)}</span>` : '') +
            `<button class="mc-bubble-thumbsdown" title="Mark as bad response">\u{1F44E}</button>`;
        bubble.appendChild(footer);
        const thumbBtn = footer.querySelector('.mc-bubble-thumbsdown');
        if (thumbBtn) {
            thumbBtn.addEventListener('click', () => {
                if (thumbBtn.classList.contains('mc-thumbed')) return;
                thumbBtn.classList.add('mc-thumbed');
                thumbBtn.textContent = '\u{1F44E} logged';
                _logThumbsDown(fullText, streamMeta);
            });
        }
    }

    _isStreaming = false;
    _chatStream = null;
    if (indicator) indicator.style.display = 'none';
    _updateContextBar();

    if (fullText.trim()) _triggerTTS(fullText);
    _checkToolHealth(fullText);

    // Auto-complete deployed goal
    if (_deployedGoalId) {
        _mc.emit('goal-auto-complete', { goalId: _deployedGoalId });
        _deployedGoalId = null;
    }

    // Tell other tabs to refresh
    setTimeout(() => _mc.emit('refresh-data'), 500);
}

function _autoSendMessage(text) {
    if (!text) return;
    const input = document.getElementById('mc-chat-input');
    if (input) { input.value = text; _sendMessage(); }
}

function _prefillInput(text) {
    if (!text) return;
    const input = document.getElementById('mc-chat-input');
    if (input) { input.value = text; input.focus(); input.dispatchEvent(new Event('input')); }
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

// ─── TTS ──────────���──────────────────────────────────���────────────────────────

async function _triggerTTS(text) {
    try {
        const statusResp = await fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!statusResp.ok) return;
        const status = await statusResp.json();
        if (!status.tts_enabled) return;

        let clean = text;
        clean = clean.replace(/<(?:seed:)?think>.*?<\/(?:seed:think|seed:cot_budget_reflect|think)>\s*/gs, '');
        const orphans = [...clean.matchAll(/<\/(?:seed:think|seed:cot_budget_reflect|think)>/g)];
        if (orphans.length > 0) {
            const last = orphans[orphans.length - 1];
            clean = clean.substring(last.index + last[0].length);
        }
        clean = clean.replace(/\n\u{1F527} Running:.*?\n/gu, '\n');
        clean = clean.replace(/ [\u{2705}\u{274C}] (?:done|failed)\n/gu, '\n');
        clean = clean.trim();
        if (!clean) return;

        await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': CSRF() },
            body: JSON.stringify({ text: clean })
        });
    } catch (e) {
        console.warn('[MC] TTS trigger failed:', e);
    }
}

// ─── Tool Health ──────────��───────────────────────────────────────────────────

function _checkToolHealth(responseText) {
    if (_toolHealthDismissed) return;
    if (!responseText || responseText.length < 30) return;
    const clean = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!clean) return;
    if (_FAKE_TOOL_PATTERNS.some(p => p.test(clean))) {
        const bar = document.getElementById('mc-tool-health-bar');
        if (bar) bar.style.display = '';
    }
}

async function _sendToolNudge() {
    let toolList = '';
    try {
        const resp = await fetch('/api/functions', { headers: { 'X-CSRF-Token': CSRF() } });
        if (resp.ok) {
            const data = await resp.json();
            const tools = [];
            if (data.modules) {
                for (const [modName, mod] of Object.entries(data.modules)) {
                    const enabled = (mod.functions || []).filter(f => f.enabled);
                    if (enabled.length > 0) tools.push(`${modName}: ${enabled.map(f => f.name).join(', ')}`);
                }
            }
            if (tools.length > 0) toolList = '\n\nYour currently available tools by module:\n' + tools.join('\n');
        }
    } catch (e) {
        console.error('[MC] Failed to fetch tool list for nudge:', e);
    }

    const nudgeText = `Hey, just a heads up \u2014 you have tools available that you can execute as function calls. ` +
        `You don't need to write them out as text in your response. ` +
        `Just call them directly the way you normally would.${toolList}`;

    const input = document.getElementById('mc-chat-input');
    if (input) { input.value = nudgeText; _sendMessage(); }
    const bar = document.getElementById('mc-tool-health-bar');
    if (bar) bar.style.display = 'none';
}

// ─── Context Bar ─────────────────────────────────────────────────────────────

async function _updateContextBar() {
    try {
        const resp = await fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } });
        if (!resp.ok) return;
        const data = await resp.json();
        const ctx = data.context;
        if (!ctx) return;

        const pct = Math.min(100, ctx.percent || 0);
        const used = ctx.used || 0;
        const limit = ctx.limit || 0;

        const fill = document.getElementById('mc-context-fill');
        const label = document.getElementById('mc-context-label');
        if (!fill || !label) return;

        fill.style.width = pct + '%';

        // Color shifts: green → yellow → orange → red
        if (pct >= 90) {
            fill.style.background = 'linear-gradient(90deg, #f44336, #ff1744)';
            fill.style.boxShadow = '0 0 8px rgba(244,67,54,0.5)';
        } else if (pct >= 70) {
            fill.style.background = 'linear-gradient(90deg, #ff9800, #f44336)';
            fill.style.boxShadow = '0 0 6px rgba(255,152,0,0.4)';
        } else if (pct >= 50) {
            fill.style.background = 'linear-gradient(90deg, #ffeb3b, #ff9800)';
            fill.style.boxShadow = '0 0 4px rgba(255,235,59,0.3)';
        } else {
            fill.style.background = 'linear-gradient(90deg, var(--mc-cyan), var(--mc-green))';
            fill.style.boxShadow = '0 0 4px rgba(0,240,255,0.2)';
        }

        // Format token counts for display
        const usedK = used >= 1000 ? (used / 1000).toFixed(1) + 'k' : used;
        const limitK = limit >= 1000 ? (limit / 1000).toFixed(1) + 'k' : limit;
        label.textContent = `${usedK} / ${limitK} tokens (${pct}%)`;

        // Pulse animation when critical
        const bar = document.getElementById('mc-context-bar');
        if (bar) bar.classList.toggle('mc-context-critical', pct >= 90);
    } catch (e) {
        // Silent fail — context bar is informational only
    }
}

// ─── Persona Management ─────────────────────────────��────────────────────────

async function _loadActivePersona() {
    try {
        const [statusResp, personasResp] = await Promise.all([
            fetch('/api/status', { headers: { 'X-CSRF-Token': CSRF() } }),
            fetch('/api/personas', { headers: { 'X-CSRF-Token': CSRF() } })
        ]);
        const statusData = await statusResp.json();
        const personasData = await personasResp.json();
        const personaName = statusData.chat_settings?.persona || '';
        const trimColor = statusData.chat_settings?.trim_color || '';
        const personaEntry = (personasData.personas || []).find(p => p.name === personaName);
        const color = trimColor || personaEntry?.trim_color || '#4a9eff';
        _setPersonaDisplay(personaName, color);

        // Sync persona grid highlight if it's been rendered
        const grid = document.getElementById('mc-persona-grid');
        if (grid) {
            grid.querySelectorAll('.mc-persona-card').forEach(c => {
                c.classList.toggle('mc-persona-selected', c.dataset.name === personaName);
            });
        }

        // Ensure TTS voice/pitch/speed are applied server-side — but only once per session.
        // On restart the TTS client resets to defaults; this re-applies persona settings.
        // We skip subsequent calls to avoid re-triggering provider switches (which restart
        // the TTS server and cause 15-30s of silence while models reload).
        if (personaName && !_personaApplied) {
            _personaApplied = true;
            try {
                await fetch(`/api/personas/${encodeURIComponent(personaName)}/load`, {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': CSRF() }
                });
            } catch {}
        }
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
    if (dd.style.display !== 'none') { dd.style.display = 'none'; }
    else { dd.style.display = ''; _loadPersonaGrid(); }
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

        if (!personas.length) { grid.innerHTML = '<div class="mc-empty-sm">No personas created</div>'; return; }

        grid.innerHTML = personas.map(p => {
            const name = p.name || p;
            const isActive = name === activeName;
            const hasAvatar = p.avatar;
            const tc = p.trim_color || '#4a9eff';
            return `
            <div class="mc-persona-card ${isActive ? 'mc-persona-selected' : ''}" data-name="${esc(name)}" data-trim="${esc(tc)}">
                ${hasAvatar
                    ? `<img class="mc-persona-card-img" src="/api/personas/${encodeURIComponent(name)}/avatar" alt="${esc(name)}" style="border-color:${tc}" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
                    : ''}
                <div class="mc-persona-card-fallback" ${hasAvatar ? 'style="display:none"' : ''} style="border-color:${tc};color:${tc}">${esc(name.charAt(0).toUpperCase())}</div>
                <span class="mc-persona-card-name">${esc(name)}</span>
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
        _personaApplied = true;
        _setPersonaDisplay(name, trimColor || '#4a9eff');
        document.getElementById('mc-persona-dropdown').style.display = 'none';
        // Update persona grid selection immediately so highlight follows the click
        const grid = document.getElementById('mc-persona-grid');
        if (grid) {
            grid.querySelectorAll('.mc-persona-card').forEach(c => {
                c.classList.toggle('mc-persona-selected', c.dataset.name === name);
            });
        }
        // Track persona name so external-change poll doesn't double-fire
        if (_mc) _mc.activePersonaName = name;
        // Fetch the persona's memory_scope and update all tabs
        if (_mc) {
            try {
                const pResp = await fetch(`/api/personas/${encodeURIComponent(name)}`, { headers: { 'X-CSRF-Token': CSRF() } });
                if (pResp.ok) {
                    const pData = await pResp.json();
                    _mc.selectedScope = pData.settings?.memory_scope || 'default';
                } else {
                    _mc.selectedScope = 'default';
                }
            } catch { _mc.selectedScope = 'default'; }
            _mc.emit('refresh-data');
        }
    } catch (e) {
        console.error('[MC] Load persona failed:', e);
    }
}

// ��── Chat Management ───────────���──────────────────────────────────────────────

function _toggleChatDropdown() {
    const dropdown = document.getElementById('mc-chat-dropdown');
    if (!dropdown) return;
    if (dropdown.style.display !== 'none') { dropdown.style.display = 'none'; }
    else { dropdown.style.display = ''; _loadChatList(); }
}

async function _loadChatList() {
    const list = document.getElementById('mc-chat-list');
    if (!list) return;
    try {
        const resp = await fetch('/api/chats', { headers: { 'X-CSRF-Token': CSRF() } });
        const data = await resp.json();
        const chats = data.chats || [];
        const activeChat = data.active_chat || '';

        if (!chats.length) { list.innerHTML = '<div class="mc-empty-sm">No chats</div>'; return; }

        list.innerHTML = chats.map(c => {
            const name = c.name || c;
            const isActive = name === activeChat;
            const displayName = c.display_name || name;
            return `
            <div class="mc-chat-list-item ${isActive ? 'mc-chat-active' : ''}" data-name="${esc(name)}">
                <span class="mc-chat-list-name">${esc(displayName)}</span>
                ${!isActive ? `<button class="mc-chat-list-del" data-name="${esc(name)}" title="Delete">\u{2715}</button>` : ''}
            </div>`;
        }).join('');

        list.querySelectorAll('.mc-chat-list-item').forEach(item => {
            item.addEventListener('click', e => {
                if (e.target.classList.contains('mc-chat-list-del')) return;
                if (item.dataset.name) _switchChat(item.dataset.name);
            });
        });
        list.querySelectorAll('.mc-chat-list-del').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (btn.dataset.name && confirm(`Delete chat "${btn.dataset.name}"?`)) _deleteChat(btn.dataset.name);
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
        setText('mc-chat-name', name);
        document.getElementById('mc-chat-dropdown').style.display = 'none';
        _toolHealthDismissed = false;
        const healthBar = document.getElementById('mc-tool-health-bar');
        if (healthBar) healthBar.style.display = 'none';
        _loadChatHistory();
        _updateContextBar();
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
        const activeResp = await fetch('/api/chats/active', { headers: { 'X-CSRF-Token': CSRF() } });
        const activeData = await activeResp.json();
        if (activeData.active_chat) setText('mc-chat-name', activeData.active_chat);
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
        a.href = url;
        a.download = `${document.getElementById('mc-chat-name')?.textContent || 'chat'}-export.json`;
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
        if (!Array.isArray(messages)) { alert('Invalid chat export file'); return; }
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
    } catch (err) {
        console.error('[MC] Import failed:', err);
        alert('Failed to read or import file');
    }
    e.target.value = '';
}
