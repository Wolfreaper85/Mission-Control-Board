// workshop.js — 16-Bit Pixel Art Engine (Chroma Key + Procedural)
// Extracted from legacy main.js lines 3987-5337

import { CSRF } from '../lib/api.js';
import { PixiPetEngine } from './pixi-pet.js';

let _mc = null;
let _container = null;

// ─── State ───────────────────────────────────────────────────────────────────

let _pixelState = 'idle';
let _pixelFrame = 0;
let _pixelAnimTimer = null;
let _pixelIdleTimer = null;
let _pixelStyle = 'chroma';

// Chroma key image state
let _pxImgUser = null, _pxImgAI = null;
let _pxUserMask = null, _pxAIMask = null;
let _pxImgLoaded = { user: false, ai: false };
const _IW = 629, _IH = 1024; // native image resolution

// Procedural state
const _GW = 320, _GH = 520; // game resolution
let _offUser = null, _offAI = null;
let _offUserProc = null, _offAIProc = null;

// PixiJS Pet engine
let _petEngine = null;
let _petData = null;

// ─── Public API ──────────────────────────────────────────────────────────────

export function init(el, mc) {
    _mc = mc;
    _container = el;

    try { _pixelStyle = localStorage.getItem('mc-pixel-style') || 'chroma'; } catch { _pixelStyle = 'chroma'; }

    el.innerHTML = _buildLayout();
    _initPixelArt();
    _bindSSE();
    return { destroy, refresh };
}

export function destroy() {
    _stopPixelArt();
    if (_petEngine) { _petEngine.destroy(); _petEngine = null; }
    if (_mc) _mc.off('sse', _onSSE);
}

export function refresh() {}

// ─── Layout ──────────────────────────────────────────────────────────────────

function _buildLayout() {
    return `
    <div class="mc-pixel-section" id="mc-pixel-section">
        <div class="mc-pixel-header">
            <h2 class="mc-section-title">\u{1F3A8} Workshop</h2>
            <select class="mc-input mc-pixel-style-select" id="mc-pixel-style">
                <option value="chroma"${_pixelStyle === 'chroma' ? ' selected' : ''}>Chroma Key (PNG Overlay)</option>
                <option value="procedural"${_pixelStyle === 'procedural' ? ' selected' : ''}>Procedural Pixel Art</option>
                <option value="tamagotchi"${_pixelStyle === 'tamagotchi' ? ' selected' : ''}>Pixel Pet</option>
            </select>
        </div>
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
        <div class="mc-pet-room" id="mc-pet-room" style="display:none">
            <canvas id="mc-pet-canvas" width="480" height="400"></canvas>
            <div class="mc-pet-interact-bar" id="mc-pet-interact-bar">
                <button class="mc-pet-play-btn" id="mc-pet-play-btn" title="Play with your pet (+1 XP, happiness boost)">\u{1F3BE} Play</button>
                <span class="mc-pet-play-count" id="mc-pet-play-count"></span>
            </div>
            <div class="mc-pet-stats" id="mc-pet-stats"></div>
            <div class="mc-pet-help">
                <button class="mc-pet-help-toggle" id="mc-pet-help-btn">? How does this work</button>
                <div class="mc-pet-help-panel" id="mc-pet-help-panel" style="display:none">
                    <h3>Your Digital Companion</h3>
                    <p>Your pet is a reflection of your productivity and engagement. It thrives when you stay on top of your goals, chat with your AI, and keep its room clean.</p>

                    <div class="mc-pet-help-grid">
                        <div class="mc-pet-help-card">
                            <span class="mc-pet-help-icon">\u{1F356}</span>
                            <strong>Hunger (HGR)</strong>
                            <ul>
                                <li>Complete goals today \u{2192} fills up</li>
                                <li>Finish your daily plan \u{2192} big boost</li>
                                <li>Earn XP \u{2192} snack boost</li>
                                <li>Decays slowly over time if idle</li>
                            </ul>
                        </div>
                        <div class="mc-pet-help-card">
                            <span class="mc-pet-help-icon">\u{1F60A}</span>
                            <strong>Happiness (HAP)</strong>
                            <ul>
                                <li>Level up \u{2192} happier pet</li>
                                <li>Write reflections \u{2192} emotional bond</li>
                                <li>Complete habits \u{2192} routine joy</li>
                                <li>Chat with the AI \u{2192} small boost (+2/chat, max +20/day)</li>
                                <li>Play with your pet \u{2192} instant joy (+5/play, max 5 plays/day)</li>
                                <li>Decays if you don't visit for a while</li>
                            </ul>
                        </div>
                        <div class="mc-pet-help-card">
                            <span class="mc-pet-help-icon">\u{2728}</span>
                            <strong>Cleanliness (CLN)</strong>
                            <ul>
                                <li>Starts at 100, penalized by clutter</li>
                                <li>Abandoned goals \u{2192} cobwebs appear (-8 each)</li>
                                <li>Stale goals (7+ days) \u{2192} papers pile up (-5 each)</li>
                                <li>Dust bunnies appear every hour (max 12) and grow every 30 min \u{2192} bigger = dirtier</li>
                                <li>Click cobwebs/papers X to dismiss them</li>
                                <li>Click dust bunnies to sweep them away (+1 XP)</li>
                            </ul>
                        </div>
                    </div>

                    <div class="mc-pet-help-section">
                        <strong>\u{1F3BE} Interactions</strong>
                        <ul>
                            <li><strong>Play</strong> \u{2014} Hit the Play button to pet/play with your companion. Awards +1 XP and boosts happiness. You get 5 plays per day.</li>
                            <li><strong>Clean</strong> \u{2014} Click dust bunnies hopping around the room to sweep them up. Each cleaning awards +1 XP and restores cleanliness.</li>
                            <li><strong>Chat</strong> \u{2014} Every conversation you have (in any chat) automatically makes your pet a little happier and earns +2 XP.</li>
                        </ul>
                    </div>

                    <div class="mc-pet-help-section">
                        <strong>\u{1F4CA} XP Sources</strong>
                        <ul>
                            <li>\u{1F3AF} Complete goals \u{2192} 15-50 XP (by priority)</li>
                            <li>\u{1F4CB} Finish daily plan \u{2192} 100 XP bonus</li>
                            <li>\u{1F4C5} Complete calendar events \u{2192} 20 XP</li>
                            <li>\u{1F4AC} Chat with the AI \u{2192} 2 XP per message</li>
                            <li>\u{1F3BE} Play with your pet \u{2192} 1 XP per play</li>
                            <li>\u{1F9F9} Clean dust bunnies \u{2192} 1 XP per bunny</li>
                        </ul>
                    </div>

                    <div class="mc-pet-help-section">
                        <strong>Evolution Stages</strong>
                        <div class="mc-pet-evo-row">
                            <span>\u{1F95A} Egg <small>Lv 0</small></span>
                            <span>\u{1F423} Baby <small>Lv 1-2</small></span>
                            <span>\u{1F425} Child <small>Lv 3-5</small></span>
                            <span>\u{1F43E} Teen <small>Lv 6-9</small></span>
                            <span>\u{2B50} Adult <small>Lv 10-14</small></span>
                            <span>\u{1F451} Master <small>Lv 15+</small></span>
                        </div>
                        <p>Your pet evolves permanently based on your XP level. Keep completing goals, chatting, and playing to unlock new forms!</p>
                    </div>

                    <div class="mc-pet-help-section">
                        <strong>Mood</strong>
                        <p>Your pet's expression and animations change based on its lowest stat. A well-fed, happy, clean pet will show hearts and smile. Neglected stats trigger hunger bubbles, frowns, or stink lines.</p>
                    </div>

                    <div class="mc-pet-help-section">
                        <strong>Room Details</strong>
                        <ul>
                            <li>\u{1F305} Room changes with time of day \u{2014} morning sunbeams, afternoon blue sky, evening sunset, nighttime moonlight</li>
                            <li>\u{1F3C6} Trophies appear on the shelf at Child stage+</li>
                            <li>\u{1FAB4} Plant appears on shelf at Teen stage+</li>
                            <li>\u{1F4D5} Books appear at Adult stage+</li>
                            <li>\u{1F4F1} Holographic display appears at Baby stage+</li>
                            <li>\u{1F372} Food bowl level matches your hunger stat</li>
                            <li>\u{1F4A7} Water bowl shimmers</li>
                            <li>\u{1F5BC}\u{FE0F} Wall art changes color with time of day</li>
                            <li>\u{1F407} Dust bunnies hop around the floor when it's time to clean</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ─── SSE Integration ─────────────────────────────────────────────────────────

function _onSSE(e) {
    const evt = e.detail;
    if (!evt) return;
    const map = {
        ai_typing_start: 'thinking', ai_typing_end: 'done',
        tool_executing: 'tool', tool_complete: 'typing',
        agent_spawned: 'agent', agent_completed: 'done', agent_dismissed: 'done',
        message_added: 'typing'
    };
    if (map[evt.type]) _setPixelState(map[evt.type]);
}

function _bindSSE() {
    if (_mc) _mc.on('sse', _onSSE);
}

// ─── Pixel State ─────────────────────────────────────────────────────────────

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

// ─── Drawing Helpers ─────────────────────────────────────────────────────────

function _r(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

function _stCol(st) {
    return { idle:'#4caf50', thinking:'#ffc107', typing:'#4fc3f7', tool:'#ff9800', agent:'#e040fb', done:'#4caf50' }[st] || '#4caf50';
}
function _stLabel(st) {
    return { idle:'IDLE', thinking:'THINKING', typing:'CODING', tool:'RUNNING', agent:'AGENT', done:'DONE' }[st] || 'IDLE';
}
function _stSpeed(st) {
    return { idle: 0.3, thinking: 0.7, typing: 1.0, tool: 0.8, agent: 1.3, done: 0.5 }[st] || 0.3;
}
function _stOpacity(st) {
    return { idle: 0.35, thinking: 0.6, typing: 0.9, tool: 0.8, agent: 1.0, done: 0.7 }[st] || 0.35;
}

// ─── Init / Stop ─────────────────────────────────────────────────────────────

function _initPixelArt() {
    _pixelFrame = 0;
    _pxImgLoaded = { user: false, ai: false };

    _pxImgUser = new Image();
    _pxImgUser.onload = function () { _pxUserMask = _buildChromaMask(_pxImgUser); _pxImgLoaded.user = true; };
    _pxImgUser.src = '/plugin-web/mission-control/Coder-Agent.png';

    _pxImgAI = new Image();
    _pxImgAI.onload = function () { _pxAIMask = _buildChromaMask(_pxImgAI); _pxImgLoaded.ai = true; };
    _pxImgAI.src = '/plugin-web/mission-control/AI-Workstation.png';

    const styleSelect = document.getElementById('mc-pixel-style');
    if (styleSelect) {
        styleSelect.addEventListener('change', () => {
            const prev = _pixelStyle;
            _pixelStyle = styleSelect.value;
            localStorage.setItem('mc-pixel-style', _pixelStyle);
            if (prev === 'tamagotchi' && _pixelStyle !== 'tamagotchi') {
                if (_petEngine) { _petEngine.destroy(); _petEngine = null; }
                const stage = document.querySelector('.mc-pixel-stage');
                const room = document.getElementById('mc-pet-room');
                if (stage) stage.style.display = '';
                if (room) room.style.display = 'none';
            }
            if (_pixelStyle === 'tamagotchi') {
                _initPet();
            } else {
                _renderPixelScenes();
            }
        });
    }

    if (_pixelStyle === 'tamagotchi') {
        _initPet();
    } else {
        if (_pixelAnimTimer) clearInterval(_pixelAnimTimer);
        _pixelAnimTimer = setInterval(function () { _pixelFrame++; _renderPixelScenes(); }, 100);
    }
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

function _renderPixelScenes() {
    if (_pixelStyle === 'procedural') { _renderUserCanvas_proc(); _renderAICanvas_proc(); }
    else { _renderUserCanvas(); _renderAICanvas(); }
}

// ─── Chroma Key Mask Builder ─────────────────────────────────────────────────

function _buildChromaMask(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d');
    tc.drawImage(img, 0, 0);
    const src = tc.getImageData(0, 0, w, h);
    const sd = src.data;

    const maskCv = document.createElement('canvas');
    maskCv.width = w; maskCv.height = h;
    const mc = maskCv.getContext('2d');
    const maskImg = mc.createImageData(w, h);
    const md = maskImg.data;

    const cleanCv = document.createElement('canvas');
    cleanCv.width = w; cleanCv.height = h;
    const cc = cleanCv.getContext('2d');
    const cleanImg = cc.createImageData(w, h);
    const cd = cleanImg.data;

    for (let i = 0; i < sd.length; i += 4) {
        const r = sd[i], g = sd[i + 1], b = sd[i + 2], a = sd[i + 3];
        const isGreen = g > 100 && g > r * 1.2 && g > b * 1.2;
        if (isGreen) {
            md[i] = 255; md[i + 1] = 255; md[i + 2] = 255; md[i + 3] = 255;
            cd[i] = 8; cd[i + 1] = 8; cd[i + 2] = 26; cd[i + 3] = 255;
        } else {
            md[i] = 0; md[i + 1] = 0; md[i + 2] = 0; md[i + 3] = 0;
            cd[i] = r; cd[i + 1] = g; cd[i + 2] = b; cd[i + 3] = a;
        }
    }
    mc.putImageData(maskImg, 0, 0);
    cc.putImageData(cleanImg, 0, 0);
    return { mask: maskCv, clean: cleanCv };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODER AGENT — Chroma Key Scene
// ═══════════════════════════════════════════════════════════════════════════════

function _renderUserCanvas() {
    const cv = document.getElementById('mc-px-user-cv');
    if (!cv || !_pxImgLoaded.user) return;
    _syncCanvasSize(cv);
    if (!_offUser) { _offUser = document.createElement('canvas'); _offUser.width = _IW; _offUser.height = _IH; }
    const c = _offUser.getContext('2d');
    const f = _pixelFrame, st = _pixelState;
    const spd = _stSpeed(st), opac = _stOpacity(st), sc = _stCol(st);
    const act = st === 'typing' || st === 'tool' || st === 'agent';
    const isHot = st !== 'idle';
    c.clearRect(0, 0, _IW, _IH);

    // Step 1: Draw screen animations
    c.globalAlpha = opac;
    _r(c, 0, 0, _IW, _IH, '#1e1e2e');

    // Line numbers gutter
    _r(c, 0, 0, 48, _IH, '#16161e');
    for (let i = 0; i < 90; i++) {
        const ly = (i * 12 - Math.floor(f * spd * 3) % (90 * 12) + 90 * 12) % (90 * 12);
        if (ly < _IH) { c.globalAlpha = opac * 0.4; _r(c, 8, ly, 32, 8, '#5a5a7a'); c.globalAlpha = opac; }
    }

    // Scrolling code lines
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

    // Active line highlight
    { const alY = (Math.floor(f * spd * 0.5) % 40) * 12; c.globalAlpha = opac * 0.15; _r(c, 48, alY, _IW - 48, 12, '#569cd6'); c.globalAlpha = opac; }

    // Blinking cursor
    if (Math.floor(f * 0.5) % 2 === 0) { const curY = (Math.floor(f * spd * 0.5) % 40) * 12; _r(c, 56 + ((f * 3) % 200), curY, 3, 10, '#aeafad'); }

    // Terminal output
    { c.globalAlpha = opac * 0.9; _r(c, 0, _IH * 0.65, _IW, _IH * 0.35, '#0a1a0a');
      const termColors = ['#4caf50', '#4caf50', '#4caf50', '#ff5252', '#ffc107'];
      for (let i = 0; i < 30; i++) {
          const ty = _IH * 0.67 + (i * 11 - Math.floor(f * spd * 5) % (30 * 11) + 30 * 11) % (30 * 11);
          if (ty >= _IH * 0.65 && ty < _IH) { const seed2 = (i * 11 + 7) % 256; const ci2 = seed2 % termColors.length; const tw = 40 + (seed2 % 180); _r(c, 12, ty, 24, 8, '#3a7a3a'); _r(c, 44, ty, tw, 8, termColors[ci2]); }
      } c.globalAlpha = opac; }

    // File tree sidebar
    { c.globalAlpha = opac * 0.7; _r(c, 0, 0, 44, _IH * 0.6, '#181828');
      for (let i = 0; i < 40; i++) { const fy = 8 + i * 14; if (fy > _IH * 0.6) break; const seed3 = (i * 13 + 3) % 64; const ind = (seed3 % 4) * 6; const fcol = (seed3 % 3 === 0) ? '#e8a838' : (seed3 % 3 === 1) ? '#569cd6' : '#9cdcfe'; _r(c, 4 + ind, fy, 8, 8, fcol); _r(c, 14 + ind, fy + 1, 16 + (seed3 % 12), 6, '#6a6a8a'); }
      c.globalAlpha = opac; }

    // Tool state: progress bar
    if (st === 'tool') { const prog = ((f * 2) % 100) / 100; _r(c, 60, _IH * 0.48, _IW - 120, 16, '#1a1a2e'); _r(c, 62, _IH * 0.48 + 2, (_IW - 124) * prog, 12, '#ff9800'); c.globalAlpha = 0.3; _r(c, 62, _IH * 0.48 + 2, (_IW - 124) * prog, 6, '#ffcc80'); c.globalAlpha = opac; }

    // CRT scan line
    { const scanY = (f * 8 * spd) % _IH; c.globalAlpha = 0.06; _r(c, 0, scanY, _IW, 3, '#ffffff'); c.globalAlpha = 0.03; _r(c, 0, scanY - 4, _IW, 2, '#ffffff'); _r(c, 0, scanY + 3, _IW, 2, '#ffffff'); c.globalAlpha = 1; }
    c.globalAlpha = 1;

    // Step 2-3: Clip to green-screen and draw original art behind
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(_pxUserMask.mask, 0, 0);
    c.globalCompositeOperation = 'destination-over';
    c.drawImage(_pxUserMask.clean, 0, 0);
    c.globalCompositeOperation = 'source-over';

    // Step 4: Overlay effects
    if (isHot) { c.globalAlpha = 0.04; _r(c, 60, 40, 500, 280, _stCol(st)); c.globalAlpha = 1; }
    if (st === 'done') { c.globalAlpha = 0.04 + Math.sin(f * 0.2) * 0.02; _r(c, 0, 0, _IW, _IH, '#4caf50'); c.globalAlpha = 1; }

    // Step 5: Blit
    const dc = cv.getContext('2d');
    dc.imageSmoothingEnabled = true;
    dc.clearRect(0, 0, cv.width, cv.height);
    dc.drawImage(_offUser, 0, 0, cv.width, cv.height);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI WORKSTATION — Chroma Key Scene
// ═══════════════════════════════════════════════════════════════════════════════

function _renderAICanvas() {
    const cv = document.getElementById('mc-px-ai-cv');
    if (!cv || !_pxImgLoaded.ai) return;
    _syncCanvasSize(cv);
    if (!_offAI) { _offAI = document.createElement('canvas'); _offAI.width = _IW; _offAI.height = _IH; }
    const c = _offAI.getContext('2d');
    const f = _pixelFrame, st = _pixelState;
    const spd = _stSpeed(st), opac = _stOpacity(st), sc = _stCol(st);
    const act = st === 'typing' || st === 'tool' || st === 'agent';
    const isHot = st !== 'idle';
    c.clearRect(0, 0, _IW, _IH);

    c.globalAlpha = opac;
    _r(c, 0, 0, _IW, _IH, '#0a0a1e');

    // Neural network visualization
    { const layers = [4, 6, 8, 6, 4, 3]; const lx0 = 60, lxSpan = _IW - 120; const ny0 = 40, nySpan = _IH * 0.4;
      c.globalAlpha = opac * 0.25;
      for (let l = 0; l < layers.length - 1; l++) { const x1 = lx0 + (l / (layers.length - 1)) * lxSpan; const x2 = lx0 + ((l + 1) / (layers.length - 1)) * lxSpan;
        for (let n1 = 0; n1 < layers[l]; n1++) { const y1 = ny0 + ((n1 + 0.5) / layers[l]) * nySpan;
          for (let n2 = 0; n2 < layers[l + 1]; n2++) { const y2 = ny0 + ((n2 + 0.5) / layers[l + 1]) * nySpan;
            const pulsePhase = ((f * spd * 0.3 + l * 7 + n1 * 3 + n2 * 5) % 30) / 30;
            const px = x1 + (x2 - x1) * pulsePhase; const py = y1 + (y2 - y1) * pulsePhase;
            c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = act ? '#4a6a9a' : '#2a3a5a'; c.lineWidth = 1; c.stroke();
            if (act || st === 'thinking') { c.globalAlpha = opac * 0.6; c.beginPath(); c.arc(px, py, 3, 0, Math.PI * 2); c.fillStyle = '#4fc3f7'; c.fill(); c.globalAlpha = opac * 0.25; }
          } } }
      c.globalAlpha = opac;
      for (let l = 0; l < layers.length; l++) { const x = lx0 + (l / (layers.length - 1)) * lxSpan;
        for (let n = 0; n < layers[l]; n++) { const y = ny0 + ((n + 0.5) / layers[l]) * nySpan;
          const pulse = Math.sin(f * spd * 0.15 + l + n * 0.7) * 0.3 + 0.7; const radius = act ? 8 * pulse : 5;
          c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fillStyle = act ? '#7c4dff' : '#4a4a6a'; c.fill();
          if (act) { c.globalAlpha = opac * 0.3 * pulse; c.beginPath(); c.arc(x, y, radius + 4, 0, Math.PI * 2); c.fillStyle = '#b388ff'; c.fill(); c.globalAlpha = opac; }
        } } }

    // Attention heatmap
    { const hx0 = 20, hy0 = _IH * 0.42; const cellW = 12, cellH = 10; const cols = Math.floor((_IW - 40) / cellW); const rows = 18;
      const heatPalette = ['#0a0a3a', '#1a1a6a', '#2a4a8a', '#3a8aba', '#4acaca', '#8adada', '#caea4a', '#eaca3a', '#ea8a2a', '#ea4a2a'];
      for (let r = 0; r < rows; r++) for (let cl = 0; cl < cols; cl++) {
          const phase = Math.sin(f * spd * 0.08 + r * 0.3 + cl * 0.4) * 0.5 + 0.5;
          const shift = Math.sin(f * spd * 0.05 + r * 0.7 - cl * 0.2) * 0.3;
          const idx = Math.floor((phase + shift) * (heatPalette.length - 1));
          const ci = Math.max(0, Math.min(heatPalette.length - 1, idx));
          _r(c, hx0 + cl * cellW, hy0 + r * cellH, cellW - 1, cellH - 1, heatPalette[ci]);
      } }

    // Scrolling data
    { c.globalAlpha = opac * 0.85; _r(c, 0, _IH * 0.65, _IW, _IH * 0.2, '#0a0a1e');
      const dataColors = ['#4fc3f7', '#7c4dff', '#b388ff', '#80cbc4', '#ce93d8', '#4dd0e1', '#9fa8da'];
      for (let i = 0; i < 50; i++) { const dy = _IH * 0.66 + (i * 11 - Math.floor(f * spd * 4) % (50 * 11) + 50 * 11) % (50 * 11);
        if (dy >= _IH * 0.65 && dy < _IH * 0.85) { const seed = (i * 17 + 5) % 256; const indent = 8 + (seed % 4) * 12; const segs = 1 + seed % 3; let sx = indent;
          for (let s = 0; s < segs; s++) { const sw = 16 + ((seed * (s + 1) * 7) % 60); const ci = (seed + s * 19) % dataColors.length; _r(c, sx, dy, sw, 8, dataColors[ci]); sx += sw + 6; if (sx > _IW - 20) break; }
      } } c.globalAlpha = opac; }

    // Token stream
    { c.globalAlpha = opac * 0.8; _r(c, 0, _IH * 0.87, _IW, _IH * 0.13, '#08081a');
      const tokColors = ['#4fc3f7', '#ce93d8', '#80cbc4', '#ffab40', '#7c4dff', '#4caf50', '#ef5350'];
      for (let row = 0; row < 6; row++) { const ty = _IH * 0.88 + row * 14; const scrollOff = Math.floor(f * spd * (6 + row * 2));
        for (let t = 0; t < 30; t++) { const tx = (t * 24 - scrollOff % (30 * 24) + 30 * 24) % (30 * 24) - 24;
          if (tx >= -24 && tx < _IW + 24) { const seed = (t * 13 + row * 7) % 256; const tw = 10 + seed % 14; const ci = seed % tokColors.length; _r(c, tx, ty, tw, 10, tokColors[ci]); }
      } } c.globalAlpha = opac; }

    // Tool progress bar
    if (st === 'tool') { const prog = ((f * 2) % 100) / 100; _r(c, 60, _IH * 0.35, _IW - 120, 16, '#1a1a2e'); _r(c, 62, _IH * 0.35 + 2, (_IW - 124) * prog, 12, '#ff9800'); c.globalAlpha = 0.3; _r(c, 62, _IH * 0.35 + 2, (_IW - 124) * prog, 6, '#ffcc80'); c.globalAlpha = opac; }

    // CRT scan line
    { const scanY = (f * 7 * spd) % _IH; c.globalAlpha = 0.06; _r(c, 0, scanY, _IW, 3, '#ffffff'); c.globalAlpha = 0.03; _r(c, 0, scanY - 4, _IW, 2, '#ffffff'); _r(c, 0, scanY + 3, _IW, 2, '#ffffff'); c.globalAlpha = 1; }
    c.globalAlpha = 1;

    // Clip & composite
    c.globalCompositeOperation = 'destination-in'; c.drawImage(_pxAIMask.mask, 0, 0);
    c.globalCompositeOperation = 'destination-over'; c.drawImage(_pxAIMask.clean, 0, 0);
    c.globalCompositeOperation = 'source-over';

    if (isHot) { c.globalAlpha = 0.04; _r(c, 40, 40, 540, 400, _stCol(st)); c.globalAlpha = 1; }
    if (st === 'done') { c.globalAlpha = 0.04 + Math.sin(f * 0.2) * 0.02; _r(c, 0, 0, _IW, _IH, '#4caf50'); c.globalAlpha = 1; }

    const dc = cv.getContext('2d');
    dc.imageSmoothingEnabled = true;
    dc.clearRect(0, 0, cv.width, cv.height);
    dc.drawImage(_offAI, 0, 0, cv.width, cv.height);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CODER AGENT — Procedural Pixel Art
// ═══════════════════════════════════════════════════════════════════════════════

function _renderUserCanvas_proc() {
    const cv = document.getElementById('mc-px-user-cv');
    if (!cv) return;
    _syncCanvasSize(cv);
    if (!_offUserProc) { _offUserProc = document.createElement('canvas'); _offUserProc.width = _GW; _offUserProc.height = _GH; }
    const c = _offUserProc.getContext('2d');
    const f = _pixelFrame, st = _pixelState;
    const act = st === 'typing' || st === 'tool' || st === 'agent';
    const sc = _stCol(st);
    c.clearRect(0, 0, _GW, _GH);

    // Room background
    { const bg = c.createLinearGradient(0, 24, 0, 240); bg.addColorStop(0, '#161830'); bg.addColorStop(1, '#0c0e18'); c.fillStyle = bg; c.fillRect(0, 24, 320, 216); }
    _r(c, 0, 0, 320, 24, '#0c0e18');
    for (let i = 0; i < 18; i++) _r(c, 30, 30 + i * 12, 260, 1, '#1c1e34');
    _r(c, 28, 24, 2, 216, '#1e2038'); _r(c, 290, 24, 2, 216, '#1e2038');

    // Server rack LEFT
    _r(c, 0, 70, 28, 370, '#1a1c26'); _r(c, 0, 70, 2, 370, '#262a36'); _r(c, 26, 70, 2, 370, '#262a36'); _r(c, 0, 70, 28, 2, '#363a48');
    for (let i = 0; i < 14; i++) { const y = 78 + i * 25; _r(c, 3, y, 22, 20, '#242630'); _r(c, 3, y, 22, 2, '#363a48'); _r(c, 5, y + 4, 18, 12, '#1a1c26');
      if ((f + i * 3) % 14 < (act ? 9 : 3)) { _r(c, 7, y + 7, 4, 4, act ? sc : '#4caf50'); c.globalAlpha = 0.3; _r(c, 6, y + 6, 6, 6, act ? sc : '#4caf50'); c.globalAlpha = 1; }
      if ((f + i * 5 + 7) % 16 < (act ? 8 : 2)) _r(c, 15, y + 7, 4, 4, '#4caf50');
      if ((f + i * 7 + 3) % 18 < (act ? 10 : 2)) _r(c, 21, y + 7, 3, 3, '#ff9800'); }

    // Server rack RIGHT
    _r(c, 292, 70, 28, 370, '#1a1c26'); _r(c, 292, 70, 2, 370, '#262a36'); _r(c, 318, 70, 2, 370, '#262a36'); _r(c, 292, 70, 28, 2, '#363a48');
    for (let i = 0; i < 14; i++) { const y = 78 + i * 25; _r(c, 295, y, 22, 20, '#242630'); _r(c, 295, y, 22, 2, '#363a48'); _r(c, 297, y + 4, 18, 12, '#1a1c26');
      if ((f + i * 4 + 2) % 15 < (act ? 9 : 3)) { _r(c, 299, y + 7, 4, 4, act ? sc : '#4caf50'); c.globalAlpha = 0.3; _r(c, 298, y + 6, 6, 6, act ? sc : '#4caf50'); c.globalAlpha = 1; }
      if ((f + i * 6 + 5) % 13 < (act ? 7 : 2)) _r(c, 307, y + 7, 4, 4, '#4caf50');
      if ((f + i * 8 + 1) % 17 < (act ? 9 : 2)) _r(c, 313, y + 7, 3, 3, '#ff9800'); }

    // Shelf
    _r(c, 32, 26, 90, 4, '#363a48'); _r(c, 32, 26, 90, 2, '#444860');
    _r(c, 42, 16, 8, 10, '#3a7a3a'); _r(c, 40, 18, 4, 6, '#2a6a2a'); _r(c, 50, 20, 4, 4, '#4a8a4a'); _r(c, 44, 26, 8, 2, '#6a4a2a');
    _r(c, 68, 18, 6, 8, '#c586c0'); _r(c, 66, 22, 10, 4, '#9a68a0');
    _r(c, 84, 14, 12, 12, '#569cd6'); _r(c, 86, 15, 8, 10, '#3a6a9a'); _r(c, 84, 14, 2, 12, '#4a7abc');
    { const pulse = act ? 0.5 + Math.sin(f * 0.2) * 0.3 : 0.15; c.globalAlpha = pulse; _r(c, 34, 30, 86, 2, act ? sc : '#4a4a6a'); c.globalAlpha = pulse * 0.4; _r(c, 34, 32, 86, 4, act ? sc : '#2a2a4a'); c.globalAlpha = 1; }

    // Picture frame
    _r(c, 200, 30, 44, 32, '#2a2e38'); _r(c, 202, 32, 40, 28, '#1a3a5a'); _r(c, 204, 34, 36, 24, '#0e2848');
    _r(c, 210, 38, 12, 8, '#e040fb'); _r(c, 218, 42, 8, 12, '#4fc3f7'); _r(c, 226, 36, 10, 10, '#ffc107');

    // Monitors
    _r(c, 44, 56, 48, 40, '#16181e'); _r(c, 44, 56, 48, 2, '#2a2e38'); _r(c, 44, 56, 2, 40, '#2a2e38'); _r(c, 46, 58, 44, 36, '#060a14'); _r(c, 64, 96, 8, 6, '#2a2e38'); _r(c, 58, 102, 20, 3, '#363a48');
    _r(c, 108, 46, 108, 60, '#16181e'); _r(c, 108, 46, 108, 2, '#2a2e38'); _r(c, 108, 46, 2, 60, '#2a2e38'); _r(c, 110, 48, 104, 56, '#060a14'); _r(c, 156, 106, 12, 8, '#2a2e38'); _r(c, 146, 114, 32, 3, '#363a48');
    _r(c, 232, 56, 48, 40, '#16181e'); _r(c, 232, 56, 48, 2, '#2a2e38'); _r(c, 232, 56, 2, 40, '#2a2e38'); _r(c, 234, 58, 44, 36, '#060a14'); _r(c, 252, 96, 8, 6, '#2a2e38'); _r(c, 246, 102, 20, 3, '#363a48');

    // Screen: Left — File explorer
    { c.save(); c.beginPath(); c.rect(46, 58, 44, 36); c.clip(); _r(c, 46, 58, 44, 36, '#1e2028');
      const sp = act ? 2 : 0.5; const lH = 5, scroll = Math.floor(f * sp) % lH;
      for (let i = 0; i < 10; i++) { const ly = 58 + i * lH - scroll; if (ly < 54 || ly > 94) continue; const s = i * 23 + 5; const indent = (s % 3) * 6; const isSelected = act && (i === 3);
        if (isSelected) { c.globalAlpha = 0.2; _r(c, 46, ly, 44, lH, '#569cd6'); } c.globalAlpha = act ? 0.65 : 0.3;
        _r(c, 48 + indent, ly + 1, 3, 3, (s % 4 === 0) ? '#dcdcaa' : '#569cd6'); _r(c, 53 + indent, ly + 1, 8 + (s % 12), 3, (s % 4 === 0) ? '#9a8a6a' : '#6a7a8a'); }
      c.globalAlpha = 1; c.restore(); }

    // Screen: Center — Code editor
    { c.save(); c.beginPath(); c.rect(110, 48, 104, 56); c.clip(); _r(c, 110, 48, 104, 56, '#1a1e28');
      const sp = act ? 3 : 1; const lH = 5, scroll = (f * sp) % lH; const syn = ['#569cd6','#ce9178','#dcdcaa','#c586c0','#9cdcfe','#4ec9b0','#d4d4d4'];
      for (let i = 0; i < 14; i++) { const ly = 48 + i * lH - scroll; if (ly < 44 || ly > 104) continue; const s = i * 31 + 7;
        if (act && i === 5) { c.globalAlpha = 0.08; _r(c, 110, ly, 104, lH, '#fff'); } c.globalAlpha = act ? 0.35 : 0.18; _r(c, 112, ly + 1, 6, 3, '#636369'); c.globalAlpha = act ? 0.8 : 0.4;
        let xp = 122 + (s % 3) * 4; for (let t = 0; t < 3 + (s % 3); t++) { const tw = 6 + ((s + t * 13) % 18); _r(c, xp, ly + 1, tw, 3, syn[(s + t) % syn.length]); xp += tw + 3; if (xp > 210) break; } }
      if (act && f % 6 < 4) { c.globalAlpha = 0.9; _r(c, 140, 73, 2, 4, '#aeafad'); }
      if (st === 'tool') { const pg = ((f * 4) % 80) / 80; _r(c, 112, 98, 100, 4, '#1a1c2a'); _r(c, 112, 98, Math.round(100 * pg), 4, sc); _r(c, 112, 98, Math.round(100 * pg), 1, '#fff'); }
      c.globalAlpha = 1; c.restore(); }

    // Screen: Right — Terminal
    { c.save(); c.beginPath(); c.rect(234, 58, 44, 36); c.clip(); _r(c, 234, 58, 44, 36, '#080e08');
      const sp = act ? 2 : 1, lH = 5, scroll = (f * sp) % lH;
      for (let i = 0; i < 10; i++) { const ly = 58 + i * lH - scroll; if (ly < 54 || ly > 94) continue; const s = i * 43 + 11; c.globalAlpha = act ? 0.65 : 0.3; _r(c, 236, ly + 1, 4, 3, '#4ec9b0');
        const isErr = (s % 15) === 0; const isWarn = (s % 11) === 0; const col = isErr ? '#f44747' : isWarn ? '#cca700' : '#4af626'; _r(c, 242, ly + 1, 8 + (s % 28), 3, col); }
      if (act && f % 4 < 3) { c.globalAlpha = 0.8; _r(c, 236, 58 + 28, 6, 4, '#4af626'); } c.globalAlpha = 1; c.restore(); }

    // CRT scan lines
    { const scanF = (f * 3) % 60; c.globalAlpha = 0.06; _r(c, 46, 58 + (scanF % 36), 44, 1, '#fff'); _r(c, 110, 48 + (scanF % 56), 104, 1, '#fff'); _r(c, 234, 58 + (scanF % 36), 44, 1, '#fff'); c.globalAlpha = 1; }

    // Monitor glow
    if (act) { c.globalAlpha = 0.04; _r(c, 40, 30, 56, 20, sc); _r(c, 104, 24, 116, 20, sc); _r(c, 228, 30, 56, 20, sc); c.globalAlpha = 1; }

    // Desk
    _r(c, 30, 240, 260, 4, '#8a7650'); _r(c, 30, 240, 260, 2, '#9a8660'); _r(c, 30, 244, 260, 32, '#5a4830'); _r(c, 30, 275, 260, 2, '#4a3c26');
    _r(c, 60, 256, 14, 3, '#363a48'); _r(c, 246, 256, 14, 3, '#363a48');
    _r(c, 36, 277, 6, 60, '#4a3c26'); _r(c, 278, 277, 6, 60, '#4a3c26');

    // Keyboard
    _r(c, 100, 241, 56, 10, '#26262e'); _r(c, 100, 241, 56, 2, '#3a3a44');
    for (let kx = 0; kx < 10; kx++) for (let ky = 0; ky < 3; ky++) _r(c, 103 + kx * 5, 243 + ky * 3, 4, 2, '#404050');
    if (act) { const glowPulse = 0.15 + Math.sin(f * 0.15) * 0.1; c.globalAlpha = glowPulse; _r(c, 98, 251, 60, 3, sc); c.globalAlpha = 1; }

    // Mouse
    _r(c, 168, 242, 20, 14, '#1a1a24'); _r(c, 174, 243, 8, 10, '#2a2a34'); _r(c, 176, 243, 4, 4, '#3a3a44');

    // Coffee mug
    _r(c, 42, 228, 10, 12, '#8b6e4e'); _r(c, 51, 232, 5, 6, '#8b6e4e'); _r(c, 53, 233, 3, 2, '#0c0e18'); _r(c, 42, 228, 10, 2, '#aaa'); _r(c, 44, 228, 6, 2, '#6b4422');
    if (f % 20 < 14) { c.globalAlpha = 0.3; _r(c, 44 + (f % 3), 222 - (f % 6), 3, 3, '#fff'); _r(c, 48 - (f % 2), 218 - (f % 5), 2, 3, '#fff'); _r(c, 46 + ((f + 2) % 3), 214 - (f % 4), 2, 2, '#fff'); c.globalAlpha = 1; }

    // Phone
    _r(c, 202, 241, 14, 8, '#1a1a24'); _r(c, 204, 242, 10, 6, '#2a3a50'); c.globalAlpha = 0.1; _r(c, 204, 242, 10, 6, '#4fc3f7'); c.globalAlpha = 1;

    // Energy drink
    _r(c, 226, 232, 8, 14, '#1a4a1a'); _r(c, 226, 232, 8, 3, '#c0c0c0'); _r(c, 228, 236, 4, 6, '#4caf50'); _r(c, 227, 238, 6, 2, '#ffc107');

    // Cat
    { const catX = 62, catY = 231; _r(c, catX, catY + 2, 14, 8, '#4a4a52'); _r(c, catX + 1, catY + 1, 12, 6, '#5a5a64'); _r(c, catX + 10, catY, 8, 7, '#5a5a64');
      _r(c, catX + 11, catY - 2, 3, 3, '#5a5a64'); _r(c, catX + 15, catY - 2, 3, 3, '#5a5a64'); _r(c, catX + 12, catY - 1, 1, 1, '#e8a0b0'); _r(c, catX + 16, catY - 1, 1, 1, '#e8a0b0');
      _r(c, catX + 12, catY + 2, 2, 1, '#2a2a32'); _r(c, catX + 16, catY + 2, 2, 1, '#2a2a32');
      const tailWag = (f % 12 < 3) ? 1 : (f % 12 < 6) ? -1 : 0;
      _r(c, catX - 2, catY + 6 + tailWag, 4, 3, '#4a4a52'); _r(c, catX - 5, catY + 5 + tailWag, 4, 2, '#5a5a64'); _r(c, catX + 14, catY + 4, 2, 1, '#e8a0b0'); }

    // Cactus
    _r(c, 250, 236, 6, 10, '#3a7a3a'); _r(c, 248, 240, 4, 4, '#2a6a2a'); _r(c, 254, 238, 4, 6, '#4a8a4a'); _r(c, 249, 246, 8, 4, '#6a4a2a');

    // Character (Coder — behind)
    { const cx = 160; const breathe = st === 'idle' ? Math.round(Math.sin(f * 0.08) * 1) : 0; const by = 198 + breathe;
      _r(c, cx - 12, by, 24, 10, '#5c3a1e'); _r(c, cx - 14, by + 4, 28, 8, '#4a2e16'); _r(c, cx - 16, by + 6, 4, 6, '#c49460'); _r(c, cx + 12, by + 6, 4, 6, '#c49460');
      _r(c, cx - 10, by + 12, 20, 6, '#c49460'); _r(c, cx - 6, by + 18, 12, 6, '#b08450');
      _r(c, cx - 14, by - 2, 28, 4, '#2a2a34'); _r(c, cx - 18, by + 4, 6, 10, '#2a2a34'); _r(c, cx + 12, by + 4, 6, 10, '#2a2a34');
      _r(c, cx - 17, by + 5, 4, 8, '#3a3a4a'); _r(c, cx + 13, by + 5, 4, 8, '#3a3a4a');
      _r(c, cx - 36, by + 24, 72, 10, '#22222e'); _r(c, cx - 36, by + 24, 72, 2, '#2e2e3c');
      _r(c, cx - 32, by + 34, 64, 44, '#2a2a38'); _r(c, cx - 32, by + 34, 8, 16, '#222230'); _r(c, cx + 24, by + 34, 8, 16, '#222230');
      _r(c, cx - 1, by + 34, 2, 44, '#222230'); _r(c, cx - 12, by + 46, 24, 10, '#4a4a5c'); _r(c, cx - 10, by + 48, 20, 6, '#2a2a38'); _r(c, cx - 32, by + 77, 64, 2, '#1e1e2a');
      _r(c, cx - 26, by + 79, 52, 28, '#1e1e2a'); _r(c, cx - 22, by + 107, 44, 12, '#1a1a26');
      const typing = st === 'typing'; const thinking = st === 'thinking'; const done = st === 'done';
      const lWob = typing ? [0, -2, 0, 2][f % 4] : 0; const rWob = typing ? [2, 0, -2, 0][f % 4] : 0;
      if (done) { _r(c, cx-44, by+12, 10, 24, '#22222e'); _r(c, cx-46, by+4, 8, 12, '#22222e'); _r(c, cx-46, by, 6, 6, '#c49460'); _r(c, cx+34, by+12, 10, 24, '#22222e'); _r(c, cx+36, by+4, 8, 12, '#22222e'); _r(c, cx+40, by, 6, 6, '#c49460'); }
      else if (thinking) { _r(c, cx-38, by+28, 8, 28, '#22222e'); _r(c, cx-42, by+24, 8, 8, '#2a2a38'); _r(c, cx-44, by+24, 6, 4, '#c49460'); const thinkF=[0,1,2,1][f%4]; _r(c, cx+30, by+28, 8, 16-thinkF*4, '#22222e'); _r(c, cx+28, by+12+(4-thinkF*2), 10, 12, '#2a2a38'); _r(c, cx+26, by+8+(4-thinkF*2), 6, 6, '#c49460'); }
      else { _r(c, cx-38, by+28, 8, 24+lWob, '#22222e'); _r(c, cx-44, by+26, 10, 6, '#2a2a38'); _r(c, cx-48, by+24+lWob, 6, 4, '#c49460'); _r(c, cx+30, by+28, 8, 24+rWob, '#22222e'); _r(c, cx+34, by+26, 10, 6, '#2a2a38'); _r(c, cx+42, by+24+rWob, 6, 4, '#c49460'); } }

    // Chair
    _r(c, 112, 310, 8, 36, '#1e1e2a'); _r(c, 200, 310, 8, 36, '#1e1e2a'); _r(c, 112, 310, 8, 2, '#2e2e40'); _r(c, 200, 310, 8, 2, '#2e2e40');
    _r(c, 116, 340, 88, 10, '#242434'); _r(c, 116, 340, 88, 2, '#2e2e40'); _r(c, 152, 350, 16, 20, '#1e1e2a'); _r(c, 152, 350, 16, 2, '#2e2e40');
    _r(c, 128, 368, 64, 4, '#2a2c36'); _r(c, 156, 364, 8, 12, '#2a2c36'); _r(c, 128, 372, 8, 6, '#1a1c24'); _r(c, 184, 372, 8, 6, '#1a1c24'); _r(c, 156, 376, 8, 4, '#1a1c24');

    // Floor
    { const floorG = c.createLinearGradient(0, 400, 0, 520); floorG.addColorStop(0, '#0e1018'); floorG.addColorStop(1, '#08090e'); c.fillStyle = floorG; c.fillRect(0, 400, 320, 120); }
    for (let i = 0; i < 6; i++) _r(c, 0, 410 + i * 18, 320, 1, '#12141e');
    _r(c, 40, 410, 60, 2, '#14141e'); _r(c, 100, 410, 2, 50, '#14141e'); _r(c, 100, 460, 60, 2, '#14141e');
    _r(c, 200, 420, 60, 2, '#14141e'); _r(c, 200, 420, 2, 40, '#14141e'); _r(c, 60, 440, 2, 30, '#14141e'); _r(c, 60, 470, 40, 2, '#14141e');
    _r(c, 220, 430, 60, 2, '#14141e'); _r(c, 240, 450, 2, 40, '#14141e'); _r(c, 80, 490, 120, 2, '#14141e');

    // Pizza box
    _r(c, 220, 475, 40, 6, '#8a6a3a'); _r(c, 220, 475, 40, 2, '#a07a44'); _r(c, 222, 477, 36, 2, '#6a5028');
    _r(c, 220, 472, 40, 4, '#9a7a44'); _r(c, 222, 473, 36, 2, '#b08a50'); _r(c, 258, 474, 4, 3, '#e0a040'); _r(c, 259, 475, 2, 1, '#d04030');

    // Title bar
    _r(c, 0, 0, 320, 24, '#0a0c14'); _r(c, 0, 22, 320, 2, '#1a1c2a');
    c.font = 'bold 11px monospace'; c.fillStyle = '#8a8aaa'; c.fillText('CODER AGENT', 8, 16);
    c.beginPath(); c.arc(196, 12, 5, 0, Math.PI * 2); c.fillStyle = sc; c.fill();
    if (act) { c.globalAlpha = 0.4; c.beginPath(); c.arc(196, 12, 8, 0, Math.PI * 2); c.fillStyle = sc; c.fill(); c.globalAlpha = 1; }
    c.font = '10px monospace'; c.fillStyle = '#6a6a8a'; c.fillText('[' + _stLabel(st) + ']', 210, 16);

    // Ambient glow
    if (act) { c.globalAlpha = 0.05; _r(c, 36, 276, 248, 14, sc); c.globalAlpha = 0.025; _r(c, 60, 402, 200, 30, sc); c.globalAlpha = 1; }
    if (st === 'done') { c.globalAlpha = 0.06 + Math.sin(f * 0.2) * 0.03; _r(c, 0, 0, _GW, _GH, '#4caf50'); c.globalAlpha = 1; }

    // Blit
    const dc = cv.getContext('2d'); dc.imageSmoothingEnabled = true; dc.clearRect(0, 0, cv.width, cv.height); dc.drawImage(_offUserProc, 0, 0, cv.width, cv.height);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI WORKSTATION — Procedural Pixel Art
// ═══════════════════════════════════════════════════════════════════════════════

function _renderAICanvas_proc() {
    const cv = document.getElementById('mc-px-ai-cv');
    if (!cv) return;
    _syncCanvasSize(cv);
    if (!_offAIProc) { _offAIProc = document.createElement('canvas'); _offAIProc.width = _GW; _offAIProc.height = _GH; }
    const c = _offAIProc.getContext('2d');
    const f = _pixelFrame, st = _pixelState;
    const act = st !== 'idle'; const isHot = st === 'typing' || st === 'tool' || st === 'agent';
    const sc = _stCol(st);
    c.clearRect(0, 0, _GW, _GH);

    // Room background
    { const bg = c.createLinearGradient(0, 24, 0, 300); bg.addColorStop(0, '#141830'); bg.addColorStop(1, '#0a0c16'); c.fillStyle = bg; c.fillRect(0, 24, 320, 276); }
    _r(c, 0, 0, 320, 24, '#0a0c16'); for (let i = 0; i < 20; i++) _r(c, 0, 30 + i * 14, 320, 1, '#1a1e32'); _r(c, 0, 24, 320, 2, '#1e2236');

    // Lab equipment LEFT
    _r(c, 0, 70, 48, 370, '#1e2028'); _r(c, 0, 70, 2, 370, '#363a48'); _r(c, 46, 70, 2, 370, '#262a36');
    _r(c, 6, 80, 4, 240, '#484858'); _r(c, 38, 80, 4, 240, '#484858'); _r(c, 6, 80, 36, 4, '#585868'); _r(c, 6, 160, 36, 4, '#484858'); _r(c, 6, 240, 36, 4, '#484858'); _r(c, 22, 80, 4, 240, '#484858');
    // Tubes
    _r(c, 10, 90, 8, 60, '#1a3a4a'); { const lv = 36 + Math.round(Math.sin(f * 0.08) * 8); _r(c, 10, 90 + (60 - lv), 8, lv, '#4fc3f7'); c.globalAlpha = 0.3; _r(c, 12, 90 + (60 - lv), 4, 6, '#9ae5ff'); c.globalAlpha = 1; }
    _r(c, 28, 90, 8, 60, '#1a3a4a'); { const lv = 44 + Math.round(Math.cos(f * 0.06) * 10); _r(c, 28, 90 + (60 - lv), 8, lv, '#2a8aaa'); c.globalAlpha = 0.3; _r(c, 30, 90 + (60 - lv), 4, 6, '#6ac8e8'); c.globalAlpha = 1; }
    _r(c, 10, 170, 8, 64, '#1a3a4a'); { const lv = 40 + Math.round(Math.sin(f * 0.1 + 2) * 8); _r(c, 10, 170 + (64 - lv), 8, lv, '#4fc3f7'); }
    // Bubbles
    if (isHot) { const bY1=(f*3)%50, bY2=(f*3+16)%50, bY3=(f*3+33)%50; c.globalAlpha = 0.6;
      c.beginPath(); c.arc(14, 148 - bY1, 2, 0, Math.PI * 2); c.fillStyle = '#9ae5ff'; c.fill();
      c.beginPath(); c.arc(32, 148 - (bY2 % 50), 1.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(16, 148 - (bY3 % 50), 1, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    // Processing units
    _r(c, 4, 250, 40, 60, '#1e2028'); _r(c, 4, 250, 40, 2, '#363a48'); _r(c, 8, 256, 32, 20, '#282c38'); _r(c, 8, 280, 32, 20, '#282c38');
    if ((f+2)%10 < (isHot?8:4)) { c.beginPath(); c.arc(16, 266, 3, 0, Math.PI*2); c.fillStyle='#4fc3f7'; c.fill(); }
    if ((f+5)%12 < (isHot?9:3)) { c.beginPath(); c.arc(28, 266, 3, 0, Math.PI*2); c.fillStyle=act?sc:'#4caf50'; c.fill(); }
    if ((f+1)%8 < (isHot?6:2)) { c.beginPath(); c.arc(16, 290, 3, 0, Math.PI*2); c.fillStyle='#4caf50'; c.fill(); }
    if ((f+3)%9 < (isHot?7:2)) { c.beginPath(); c.arc(28, 290, 3, 0, Math.PI*2); c.fillStyle='#ff9800'; c.fill(); }

    // RIGHT side — bulletin board, palette, equipment
    _r(c, 240, 30, 76, 80, '#8a7350'); _r(c, 240, 30, 76, 2, '#9a8360'); _r(c, 240, 30, 2, 80, '#6a5838');
    _r(c, 246, 36, 28, 18, '#e4dcc8'); _r(c, 248, 38, 24, 2, '#888'); _r(c, 248, 42, 20, 2, '#888'); _r(c, 248, 46, 16, 2, '#888');
    _r(c, 280, 34, 28, 22, '#c8dcd0'); _r(c, 282, 36, 24, 2, '#666'); _r(c, 282, 40, 20, 2, '#666'); _r(c, 282, 44, 22, 2, '#666');
    _r(c, 250, 60, 24, 24, '#ffdca0'); _r(c, 252, 62, 20, 2, '#886'); _r(c, 252, 66, 16, 2, '#886');
    _r(c, 280, 62, 24, 18, '#d8c8e0'); _r(c, 282, 64, 20, 2, '#668'); _r(c, 282, 68, 16, 2, '#668');
    c.beginPath(); c.arc(258, 35, 3, 0, Math.PI*2); c.fillStyle='#e05050'; c.fill();
    c.beginPath(); c.arc(292, 33, 3, 0, Math.PI*2); c.fillStyle='#5050e0'; c.fill();
    c.beginPath(); c.arc(260, 59, 3, 0, Math.PI*2); c.fillStyle='#50b050'; c.fill();
    c.beginPath(); c.arc(290, 61, 3, 0, Math.PI*2); c.fillStyle='#e0e050'; c.fill();
    // Color palette
    _r(c, 244, 118, 68, 32, '#1a1c24'); _r(c, 244, 118, 68, 2, '#2a2e38');
    { const pc = ['#e05050','#e09050','#e0e050','#50e050','#50e0e0','#5050e0','#e050e0','#fff','#802020','#804020','#808020','#208020','#208080','#202080','#802080','#888'];
      for (let py = 0; py < 2; py++) for (let px = 0; px < 8; px++) _r(c, 248 + px * 8, 122 + py * 12, 6, 10, pc[py * 8 + px]); }
    // Equipment panel
    _r(c, 244, 160, 68, 80, '#1e2028'); _r(c, 244, 160, 68, 2, '#363a48');
    for (let i = 0; i < 4; i++) { _r(c, 252 + i * 16, 168, 8, 8, '#282c38');
      if ((f + i * 3) % 10 < (isHot ? 7 : 3)) { c.beginPath(); c.arc(256 + i * 16, 172, 3, 0, Math.PI * 2); c.fillStyle = i % 2 === 0 ? sc : '#4caf50'; c.fill(); } }
    for (let i = 0; i < 3; i++) { _r(c, 252, 186 + i * 16, 52, 4, '#282c38'); const sliderX = 252 + Math.round(20 + Math.sin(f * 0.05 + i) * 16); _r(c, sliderX, 184 + i * 16, 8, 8, '#4a4e60'); }

    // Monitors
    _r(c, 60, 40, 68, 56, '#16181e'); _r(c, 60, 40, 68, 2, '#2a2e38'); _r(c, 60, 40, 2, 56, '#2a2e38'); _r(c, 62, 42, 64, 52, '#060a14'); _r(c, 90, 96, 8, 8, '#2a2e38'); _r(c, 82, 104, 24, 4, '#363a48');
    _r(c, 144, 40, 68, 56, '#16181e'); _r(c, 144, 40, 68, 2, '#2a2e38'); _r(c, 144, 40, 2, 56, '#2a2e38'); _r(c, 146, 42, 64, 52, '#060a14'); _r(c, 174, 96, 8, 8, '#2a2e38'); _r(c, 166, 104, 24, 4, '#363a48');
    _r(c, 60, 116, 68, 60, '#16181e'); _r(c, 60, 116, 68, 2, '#2a2e38'); _r(c, 60, 116, 2, 60, '#2a2e38'); _r(c, 62, 118, 64, 56, '#060a14');
    _r(c, 144, 116, 90, 60, '#16181e'); _r(c, 144, 116, 90, 2, '#2a2e38'); _r(c, 144, 116, 2, 60, '#2a2e38'); _r(c, 146, 118, 86, 56, '#060a14');
    _r(c, 72, 200, 160, 84, '#16181e'); _r(c, 72, 200, 160, 2, '#2a2e38'); _r(c, 72, 200, 2, 84, '#2a2e38'); _r(c, 74, 202, 156, 80, '#060a14'); _r(c, 144, 284, 12, 10, '#2a2e38'); _r(c, 132, 294, 36, 4, '#363a48');

    // Screen: Heatmap
    { c.save(); c.beginPath(); c.rect(62, 42, 64, 52); c.clip();
      for (let hy = 0; hy < 7; hy++) for (let hx = 0; hx < 8; hx++) { const v = (Math.sin((hx + f * 0.15) * 0.7) * Math.cos((hy + f * 0.1) * 0.9) + 1) / 2;
        const r = Math.round(v * 200 + 30), g = Math.round((1 - v) * 100 + 30), b = Math.round((1 - v) * 180 + 40); c.globalAlpha = act ? 0.7 : 0.3; _r(c, 62 + hx * 8, 42 + hy * 7, 8, 7, `rgb(${r},${g},${b})`); }
      c.globalAlpha = 1; c.restore(); }

    // Screen: Token stream
    { c.save(); c.beginPath(); c.rect(146, 42, 64, 52); c.clip(); const tc = ['#569cd6','#ce9178','#4ec9b0','#c586c0','#dcdcaa','#9cdcfe']; const sp = isHot ? 4 : 1;
      for (let i = 0; i < 16; i++) { const tx = 146 + ((i * 16 - f * sp) % 80 + 80) % 80 - 12; c.globalAlpha = act ? 0.7 : 0.25; _r(c, tx, 46 + (i % 6) * 8, 6 + (i % 5), 5, tc[i % tc.length]); }
      c.globalAlpha = 1; c.restore(); }

    // Screen: Wireframe cube
    { c.save(); c.beginPath(); c.rect(62, 118, 64, 56); c.clip(); const cx = 94, cy = 146, sz = 16, a = f * 0.08;
      const co = Math.cos(a), si = Math.sin(a); const vt = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
      const pr = vt.map(v => { const rx = v[0]*co - v[2]*si; return [cx + Math.round(rx * sz), cy + Math.round((v[1]*0.8 - (v[0]*si + v[2]*co)*0.3) * sz)]; });
      const ed = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      c.globalAlpha = act ? 0.7 : 0.3; c.strokeStyle = isHot ? sc : '#4ec9b0'; c.lineWidth = 1.5;
      ed.forEach(e => { c.beginPath(); c.moveTo(pr[e[0]][0], pr[e[0]][1]); c.lineTo(pr[e[1]][0], pr[e[1]][1]); c.stroke(); });
      pr.forEach(p => { c.beginPath(); c.arc(p[0], p[1], 2.5, 0, Math.PI * 2); c.fillStyle = isHot ? '#fff' : '#4ec9b0'; c.fill(); });
      c.globalAlpha = 1; c.restore(); }

    // Screen: Neural network
    { c.save(); c.beginPath(); c.rect(146, 118, 86, 56); c.clip(); const layers = [3, 5, 4, 2], lx = [160, 180, 200, 220], nd = [];
      layers.forEach((cnt, li) => { for (let ni = 0; ni < cnt; ni++) nd.push({ x: lx[li], y: 126 + (56 - cnt * 10) / 2 + ni * 10, l: li }); });
      c.globalAlpha = act ? 0.2 : 0.08; c.strokeStyle = '#4a6080'; c.lineWidth = 1;
      for (let i = 0; i < nd.length; i++) for (let j = i + 1; j < nd.length; j++) if (nd[j].l === nd[i].l + 1) { c.beginPath(); c.moveTo(nd[i].x, nd[i].y); c.lineTo(nd[j].x, nd[j].y); c.stroke(); }
      nd.forEach((n, i) => { c.globalAlpha = act ? 0.5 + Math.sin(f * 0.15 + i * 0.7) * 0.3 : 0.3; c.beginPath(); c.arc(n.x, n.y, 4, 0, Math.PI * 2); c.fillStyle = isHot ? sc : '#4ec9b0'; c.fill(); });
      if (act) { c.globalAlpha = 0.8; const pp = (f * 3) % 60; c.beginPath(); c.arc(160 + pp, 140 + Math.sin(pp * 0.2) * 8, 3, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
      c.globalAlpha = 1; c.restore(); }

    // Screen: Main — Data processing
    { c.save(); c.beginPath(); c.rect(74, 202, 156, 80); c.clip(); _r(c, 74, 202, 156, 80, '#0c1018');
      const sp = isHot ? 3 : 1, lH = 6, scr = (f * sp) % lH; const sn = ['#569cd6','#ce9178','#dcdcaa','#c586c0','#9cdcfe','#4ec9b0','#d4d4d4'];
      for (let i = 0; i < 16; i++) { const ly = 202 + i * lH - scr; if (ly < 198 || ly > 282) continue; const s = i * 37 + 13;
        c.globalAlpha = isHot ? 0.35 : 0.18; _r(c, 76, ly + 1, 8, 4, '#636369'); c.globalAlpha = isHot ? 0.8 : 0.4;
        let xp = 88 + (s % 3) * 4; for (let t = 0; t < 3 + (s % 2); t++) { const tw = 6 + ((s + t * 11) % 20); _r(c, xp, ly + 1, tw, 4, sn[(s + t) % sn.length]); xp += tw + 3; if (xp > 226) break; } }
      if (st === 'tool') { const pg = ((f * 4) % 80) / 80; _r(c, 78, 272, 148, 6, '#1a1c2a'); _r(c, 78, 272, Math.round(148 * pg), 6, sc); _r(c, 78, 272, Math.round(148 * pg), 2, '#fff'); }
      if (isHot && f % 6 < 4) { c.globalAlpha = 0.9; _r(c, 100, 238, 2, 5, '#aeafad'); } c.globalAlpha = 1; c.restore(); }

    // CRT scan lines
    { const sf = (f * 3) % 80; c.globalAlpha = 0.06;
      _r(c, 62, 42 + (sf % 52), 64, 1, '#fff'); _r(c, 146, 42 + (sf % 52), 64, 1, '#fff');
      _r(c, 62, 118 + (sf % 56), 64, 1, '#fff'); _r(c, 146, 118 + (sf % 56), 86, 1, '#fff');
      _r(c, 74, 202 + (sf % 80), 156, 1, '#fff'); c.globalAlpha = 1; }

    // Monitor glow
    if (act) { c.globalAlpha = 0.04; _r(c, 56, 28, 76, 10, sc); _r(c, 140, 28, 76, 10, sc); c.globalAlpha = 1; }

    // Desk
    _r(c, 52, 300, 216, 6, '#6a5a3e'); _r(c, 52, 300, 216, 2, '#7a6a4e'); _r(c, 52, 306, 216, 28, '#4a3c2a'); _r(c, 52, 333, 216, 2, '#3a2e1e');
    _r(c, 58, 336, 6, 54, '#4a3c2a'); _r(c, 256, 336, 6, 54, '#4a3c2a');
    _r(c, 108, 301, 52, 10, '#26262e'); _r(c, 108, 301, 52, 2, '#3a3a44');
    for (let kx = 0; kx < 9; kx++) for (let ky = 0; ky < 3; ky++) _r(c, 111 + kx * 5, 303 + ky * 3, 4, 2, '#404050');
    _r(c, 170, 303, 8, 8, '#2a2a34'); _r(c, 172, 303, 4, 4, '#3a3a44');

    // Coffee mug
    _r(c, 68, 290, 10, 12, '#8b6e4e'); _r(c, 77, 294, 5, 6, '#8b6e4e'); _r(c, 79, 295, 3, 2, '#0a0c16'); _r(c, 68, 290, 10, 2, '#aaa');
    if (f % 20 < 14) { c.globalAlpha = 0.3; _r(c, 71 + (f % 3), 284 - (f % 6), 3, 3, '#fff'); _r(c, 74 - (f % 2), 280 - (f % 5), 2, 3, '#fff'); c.globalAlpha = 1; }

    // Character (AI researcher)
    { const cx = 188, by = 264, br = st === 'idle' ? Math.round(Math.sin(f * 0.07) * 1) : 0;
      _r(c, cx-10, by+br, 20, 10, '#2a1a0e'); _r(c, cx-12, by+4+br, 24, 8, '#1e140a'); _r(c, cx+10, by+8+br, 6, 16, '#2a1a0e'); _r(c, cx+12, by+16+br, 4, 12, '#1e140a');
      _r(c, cx-14, by+6+br, 4, 6, '#c49460'); _r(c, cx+10, by+6+br, 4, 6, '#c49460'); _r(c, cx-8, by+12+br, 16, 6, '#c49460'); _r(c, cx-6, by+18+br, 12, 6, '#b08450');
      _r(c, cx-12, by-2+br, 24, 4, '#2a2a34'); _r(c, cx-16, by+4+br, 6, 10, '#2a2a34'); _r(c, cx+10, by+4+br, 6, 10, '#2a2a34');
      _r(c, cx-32, by+24+br, 68, 10, '#444e36'); _r(c, cx-32, by+24+br, 68, 2, '#5a6848'); _r(c, cx-10, by+24+br, 20, 6, '#6a785a');
      _r(c, cx-28, by+34+br, 60, 44, '#5a6848'); _r(c, cx-28, by+34+br, 8, 20, '#4a5838'); _r(c, cx+20, by+34+br, 8, 20, '#4a5838'); _r(c, cx-1, by+34+br, 2, 44, '#444e36'); _r(c, cx-28, by+77+br, 60, 2, '#3e4a32');
      _r(c, cx-24, by+79+br, 52, 28, '#2a2a34'); _r(c, cx-20, by+107+br, 44, 10, '#222230');
      const tp = st === 'typing', th = st === 'thinking', dn = st === 'done';
      const lw = tp?[0,-2,0,2][f%4]:0, rw = tp?[2,0,-2,0][f%4]:0;
      if (dn) { _r(c, cx-40, by+12, 10, 24, '#444e36'); _r(c, cx-42, by+4, 8, 12, '#5a6848'); _r(c, cx-42, by, 6, 6, '#c49460'); _r(c, cx+30, by+12, 10, 24, '#444e36'); _r(c, cx+32, by+4, 8, 12, '#5a6848'); _r(c, cx+36, by, 6, 6, '#c49460'); }
      else if (th) { _r(c, cx-34, by+28, 8, 28, '#444e36'); _r(c, cx-38, by+24, 8, 8, '#5a6848'); _r(c, cx-40, by+24, 6, 4, '#c49460'); const tf=[0,1,2,1][f%4]; _r(c, cx+26, by+28, 8, 16-tf*4, '#444e36'); _r(c, cx+24, by+12+(4-tf*2), 10, 12, '#5a6848'); _r(c, cx+22, by+8+(4-tf*2), 6, 6, '#c49460'); }
      else { _r(c, cx-34, by+28, 8, 24+lw, '#444e36'); _r(c, cx-40, by+26, 10, 6, '#5a6848'); _r(c, cx-44, by+24+lw, 6, 4, '#c49460'); _r(c, cx+26, by+28, 8, 24+rw, '#444e36'); _r(c, cx+32, by+26, 10, 6, '#5a6848'); _r(c, cx+40, by+24+rw, 6, 4, '#c49460'); } }

    // Chair
    _r(c, 142, 370, 8, 36, '#1e1e2a'); _r(c, 230, 370, 8, 36, '#1e1e2a'); _r(c, 142, 370, 8, 2, '#2e2e40'); _r(c, 230, 370, 8, 2, '#2e2e40');
    _r(c, 148, 400, 84, 10, '#242434'); _r(c, 148, 400, 84, 2, '#2e2e40'); _r(c, 182, 410, 16, 16, '#1e1e2a'); _r(c, 166, 424, 48, 4, '#2a2c36');
    _r(c, 162, 428, 8, 6, '#1a1c24'); _r(c, 210, 428, 8, 6, '#1a1c24');

    // HYDRA server
    _r(c, 10, 420, 80, 64, '#2a2c3a'); _r(c, 10, 420, 80, 2, '#3a3e4e'); _r(c, 10, 420, 2, 64, '#3a3e4e');
    _r(c, 14, 426, 72, 16, '#222430'); _r(c, 14, 446, 72, 16, '#222430'); _r(c, 14, 466, 72, 12, '#222430');
    c.font = 'bold 9px monospace'; c.fillStyle = '#4a6080'; c.fillText('HYDRA', 26, 438);
    for (let i = 0; i < 8; i++) {
      if ((f + i * 4) % 12 < (isHot ? 9 : 4)) { c.beginPath(); c.arc(20 + i * 9, 454, 3, 0, Math.PI * 2); c.fillStyle = i % 2 === 0 ? sc : '#4caf50'; c.fill(); }
      if ((f + i * 3 + 5) % 14 < (isHot ? 8 : 3)) { c.beginPath(); c.arc(20 + i * 9, 472, 3, 0, Math.PI * 2); c.fillStyle = '#4caf50'; c.fill(); } }

    // Floor
    { const floorG = c.createLinearGradient(0, 400, 0, 520); floorG.addColorStop(0, '#0e1018'); floorG.addColorStop(1, '#08090e'); c.fillStyle = floorG; c.fillRect(0, 400, 320, 120); }
    for (let i = 0; i < 6; i++) _r(c, 0, 410 + i * 18, 320, 1, '#12141e');
    _r(c, 120, 416, 80, 2, '#12121e'); _r(c, 120, 416, 2, 40, '#12121e'); _r(c, 200, 430, 2, 30, '#12121e'); _r(c, 160, 460, 60, 2, '#12121e');
    _r(c, 220, 440, 60, 2, '#12121e'); _r(c, 280, 440, 2, 40, '#12121e'); _r(c, 120, 490, 160, 2, '#12121e'); _r(c, 80, 450, 2, 40, '#12121e');

    // Title bar
    _r(c, 0, 0, 320, 24, '#0a0c14'); _r(c, 0, 22, 320, 2, '#1a1c2a');
    c.font = 'bold 11px monospace'; c.fillStyle = '#8a8aaa'; c.fillText('AI WORKSTATION', 8, 16);
    c.beginPath(); c.arc(216, 12, 5, 0, Math.PI * 2); c.fillStyle = sc; c.fill();
    if (act) { c.globalAlpha = 0.4; c.beginPath(); c.arc(216, 12, 8, 0, Math.PI * 2); c.fillStyle = sc; c.fill(); c.globalAlpha = 1; }
    c.font = '10px monospace'; c.fillStyle = '#6a6a8a'; c.fillText('[' + _stLabel(st) + ']', 230, 16);

    // Ambient effects
    if (isHot) { c.globalAlpha = 0.04; _r(c, 56, 28, 168, 12, sc); c.globalAlpha = 0.03; _r(c, 80, 404, 160, 28, sc); c.globalAlpha = 1; }
    if (st === 'done') { c.globalAlpha = 0.06 + Math.sin(f * 0.2) * 0.03; _r(c, 0, 0, _GW, _GH, '#4caf50'); c.globalAlpha = 1; }

    // Blit
    const dc = cv.getContext('2d'); dc.imageSmoothingEnabled = true; dc.clearRect(0, 0, cv.width, cv.height); dc.drawImage(_offAIProc, 0, 0, cv.width, cv.height);
}

// ─── Pixel Pet (PixiJS Engine) ──────────────────────────────────────────────

async function _initPet() {
    const stage = document.querySelector('.mc-pixel-stage');
    const room = document.getElementById('mc-pet-room');
    if (stage) stage.style.display = 'none';
    if (room) room.style.display = '';

    // Destroy any previous engine
    if (_petEngine) { _petEngine.destroy(); _petEngine = null; }


    const scope = () => (_mc && _mc.selectedScope) || 'default';
    const csrfVal = () => typeof CSRF === 'function' ? CSRF() : '';

    _petEngine = new PixiPetEngine(room, {
        onInteract: async (action, payload) => {
            try {
                const resp = await fetch('/api/plugin/mission-control/pet/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfVal() },
                    body: JSON.stringify({ ...payload, action, scope: scope() })
                });
                const data = await resp.json();
                if (data.success) {
                    // Refresh full state after interaction
                    await _loadPetData();
                }
                return data;
            } catch (e) {
                console.error('[MC] Pet interact failed:', e);
                return {};
            }
        },
        onLoadData: async () => {
            try {
                const resp = await fetch(`/api/plugin/mission-control/pet/status?scope=${encodeURIComponent(scope())}`, {
                    headers: { 'X-CSRF-Token': csrfVal() }
                });
                if (resp.ok) return resp.json();
            } catch (e) {
                console.error('[MC] Pet data load failed:', e);
            }
            return null;
        }
    });

    // Bind buttons BEFORE engine init — these should always work
    const playBtn = document.getElementById('mc-pet-play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', _onPetPlay);
    }

    const helpBtn = document.getElementById('mc-pet-help-btn');
    const helpPanel = document.getElementById('mc-pet-help-panel');
    if (helpBtn && helpPanel) {
        helpBtn.addEventListener('click', () => {
            const open = helpPanel.style.display !== 'none';
            helpPanel.style.display = open ? 'none' : '';
            helpBtn.textContent = open ? '? How does this work' : '✕ Close guide';
        });
    }

    // Init PixiJS engine (may fail on GPU-constrained systems)
    try {
        await _petEngine.init();
    } catch (e) {
        console.warn('[MC] PixiJS pet engine failed to init — buttons still work:', e);
    }

    // Load pet data AFTER init so updateData() has initialized properties
    await _loadPetData();
}

async function _loadPetData() {
    try {
        const scope = (_mc && _mc.selectedScope) || 'default';
        const resp = await fetch(`/api/plugin/mission-control/pet/status?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': typeof CSRF === 'function' ? CSRF() : '' }
        });
        if (resp.ok) {
            const data = await resp.json();
            if (data.error) {
                console.error('[MC] Pet status returned error:', data.error);
                return;
            }
            _petData = data;
            console.info(`[MC] Pet loaded: ${data.pet_name} Lv${data.level} (${data.evolution_name}), XP=${data.total_xp}, plays=${data.plays_today}/${data.max_plays}`);
            try {
                if (_petEngine) _petEngine.updateData(_petData);
            } catch (ue) {
                console.warn('[MC] Pet engine updateData error (non-fatal):', ue);
            }
            _updatePlayCount();
        } else {
            console.error('[MC] Pet status API error:', resp.status, resp.statusText);
        }
    } catch (e) {
        console.error('[MC] Pet data load failed:', e);
    }
}

async function _onPetPlay() {
    const playBtn = document.getElementById('mc-pet-play-btn');

    if (!_petData) {
        console.warn('[MC] Pet play: no pet data loaded yet');
        // Try to load data first
        await _loadPetData();
        if (!_petData) {
            if (playBtn) {
                playBtn.style.background = 'rgba(244,67,54,0.3)';
                playBtn.textContent = '\u274C No pet data';
                setTimeout(() => { playBtn.style.background = ''; playBtn.textContent = '\uD83C\uDFBE Play'; }, 1500);
            }
            return;
        }
    }

    const scope = (_mc && _mc.selectedScope) || 'default';

    // Disable button during API call
    if (playBtn) playBtn.disabled = true;

    try {
        const resp = await fetch('/api/plugin/mission-control/pet/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof CSRF === 'function' ? CSRF() : '' },
            body: JSON.stringify({ action: 'play', scope })
        });

        if (!resp.ok) {
            console.error('[MC] Pet play API error:', resp.status, resp.statusText);
            if (playBtn) {
                playBtn.style.background = 'rgba(244,67,54,0.3)';
                playBtn.textContent = `\u274C ${resp.status}`;
                setTimeout(() => { playBtn.style.background = ''; playBtn.textContent = '\uD83C\uDFBE Play'; }, 2000);
            }
            return;
        }

        const data = await resp.json();

        if (data.error) {
            console.error('[MC] Pet play error:', data.error);
            if (playBtn) {
                playBtn.style.background = 'rgba(244,67,54,0.3)';
                playBtn.textContent = '\u274C Error';
                setTimeout(() => { playBtn.style.background = ''; playBtn.textContent = '\uD83C\uDFBE Play'; }, 2000);
            }
            return;
        }

        if (data.success) {
            _petData.happiness = Math.min(100, _petData.happiness + 5);
            _petData.plays_today = data.plays_today;
            _petData.total_xp = (_petData.total_xp || 0) + (data.xp_awarded || 1);
            _petData.today_xp = (_petData.today_xp || 0) + (data.xp_awarded || 1);
            // Trigger play animation in PixiJS engine
            if (_petEngine) _petEngine.playReaction();
            if (playBtn) {
                playBtn.style.background = 'rgba(76,175,80,0.3)';
                playBtn.textContent = '\u2728 +1 XP!';
                setTimeout(() => { playBtn.style.background = ''; playBtn.textContent = '\uD83C\uDFBE Play'; }, 1200);
            }
        } else if (data.message) {
            if (playBtn) {
                playBtn.style.background = 'rgba(255,193,7,0.3)';
                playBtn.textContent = '\uD83D\uDE34 Tired!';
                playBtn.title = data.message;
                setTimeout(() => { playBtn.style.background = ''; playBtn.textContent = '\uD83C\uDFBE Play'; }, 1500);
            }
        }
        _updatePlayCount();
    } catch (err) {
        console.error('[MC] Pet play failed:', err);
        if (playBtn) {
            playBtn.style.background = 'rgba(244,67,54,0.3)';
            playBtn.textContent = '\u274C Failed';
            setTimeout(() => { playBtn.style.background = ''; playBtn.textContent = '\uD83C\uDFBE Play'; }, 2000);
        }
    } finally {
        if (playBtn) playBtn.disabled = false;
    }
}

function _updatePlayCount() {
    const el = document.getElementById('mc-pet-play-count');
    if (!el || !_petData) return;
    const plays = _petData.plays_today || 0;
    const max = _petData.max_plays || 5;
    const totalXp = _petData.total_xp || 0;
    const level = _petData.level || 0;

    // XP thresholds for each level: level = floor(sqrt(xp/100))
    // Next level needs (level+1)^2 * 100 XP
    const nextLevelXp = Math.pow(level + 1, 2) * 100;
    const xpProgress = totalXp >= nextLevelXp ? 'MAX' : `${totalXp}/${nextLevelXp} XP`;

    el.textContent = `${plays}/${max} plays \u00B7 Lv${level} (${xpProgress})`;
    el.style.color = plays >= max ? '#ff9800' : '#888';
}
