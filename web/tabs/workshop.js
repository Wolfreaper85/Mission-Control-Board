// workshop.js — 16-Bit Pixel Art Engine (Chroma Key + Procedural)
// Extracted from legacy main.js lines 3987-5337

import { CSRF } from '../lib/api.js';

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

// Pixel Pet state
let _petData = null;
let _petFrame = 0;
let _petAnimTimer = null;
let _petCanvas = null;
let _petCtx = null;
let _dustPoofs = [];  // Active poof animations: { x, y, frame, maxFrames }
let _playEmojis = []; // Active play reaction emojis: { x, y, emoji, frame, maxFrames, dx, dy }

// WebGL state
let _glCtx = null;          // WebGL context on main canvas
let _offCv = null;           // Offscreen canvas for 2D sprites
let _offCtx = null;          // Offscreen 2D context
let _glPrg = {};             // Shader programs { room, tex, particle, bright, blur, comp }
let _glBuf = {};             // GL buffers { quad, particles }
let _glFBO = {};             // Framebuffers { scene, bright, blur1 }
let _glTex = {};             // Textures { overlay }
let _glParticles = [];       // Particle array [{x,y,vx,vy,r,g,b,a,life,maxLife,size}]
let _glTime = 0;             // Animation time for shaders
let _glReady = false;        // Whether WebGL init succeeded

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
    _destroyPet();
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
                _destroyPet();
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

// ─── Pixel Pet ──────────────────────────────────────────────────────────────

async function _initPet() {
    const stage = document.querySelector('.mc-pixel-stage');
    const room = document.getElementById('mc-pet-room');
    if (stage) stage.style.display = 'none';
    if (room) room.style.display = '';

    _petCanvas = document.getElementById('mc-pet-canvas');

    // Try WebGL init
    _glReady = false;
    if (_petCanvas) {
        _glReady = _pgInitGL(_petCanvas);
    }

    // Fallback to 2D if WebGL fails
    if (!_glReady && _petCanvas) {
        _petCtx = _petCanvas.getContext('2d');
    }

    // Click handler for clutter + dust
    if (_petCanvas) {
        _petCanvas.addEventListener('click', _onPetCanvasClick);
    }

    // Play button
    const playBtn = document.getElementById('mc-pet-play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', _onPetPlay);
    }

    // Help toggle
    const helpBtn = document.getElementById('mc-pet-help-btn');
    const helpPanel = document.getElementById('mc-pet-help-panel');
    if (helpBtn && helpPanel) {
        helpBtn.addEventListener('click', () => {
            const open = helpPanel.style.display !== 'none';
            helpPanel.style.display = open ? 'none' : '';
            helpBtn.textContent = open ? '? How does this work' : '✕ Close guide';
        });
    }

    await _loadPetData();
    _startPetAnimation();
}

function _destroyPet() {
    if (_petAnimTimer) { clearInterval(_petAnimTimer); _petAnimTimer = null; }
    if (_petCanvas) _petCanvas.removeEventListener('click', _onPetCanvasClick);
    _pgCleanupGL();
    _petData = null;
}

async function _loadPetData() {
    try {
        const scope = (_mc && _mc.selectedScope) || 'default';
        const resp = await fetch(`/api/plugin/mission-control/pet/status?scope=${encodeURIComponent(scope)}`, {
            headers: { 'X-CSRF-Token': typeof CSRF === 'function' ? CSRF() : '' }
        });
        if (resp.ok) {
            _petData = await resp.json();
            _updatePlayCount();
        }
    } catch (e) {
        console.error('[MC] Pet data load failed:', e);
    }
}

function _startPetAnimation() {
    _petFrame = 0;
    if (_petAnimTimer) clearInterval(_petAnimTimer);
    _petAnimTimer = setInterval(() => {
        _petFrame = (_petFrame + 1) % 60;  // 60 frame loop
        _renderPet();
    }, 150);  // ~6.6 fps pixel art style
}

// ─── WebGL Shader Sources ───────────────────────────────────────────────────

const _GL_QUAD_VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const _GL_ROOM_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_hunger;
uniform float u_happiness;
uniform float u_clean;
uniform float u_evo;
uniform float u_tod;  // 0=morning, 1=afternoon, 2=evening, 3=night

float hash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}

void main() {
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
    vec3 col = vec3(0.0);
    float floorLine = 0.65;

    // Time-of-day colors
    vec3 wallCol, floorCol, shelfCol, matCol, lightCol, skyTop, skyBot, frameCol;
    float isMorning = step(-0.5, u_tod) * step(u_tod, 0.5);
    float isAfternoon = step(0.5, u_tod) * step(u_tod, 1.5);
    float isEvening = step(1.5, u_tod) * step(u_tod, 2.5);
    float isNight = step(2.5, u_tod);

    // Wall colors
    wallCol = isMorning * vec3(0.91, 0.87, 0.82)
            + isAfternoon * vec3(0.94, 0.90, 0.83)
            + isEvening * vec3(0.23, 0.18, 0.26)
            + isNight * vec3(0.08, 0.09, 0.13);

    // Floor colors
    floorCol = isMorning * vec3(0.68, 0.62, 0.55)
             + isAfternoon * vec3(0.75, 0.68, 0.60)
             + isEvening * vec3(0.16, 0.13, 0.18)
             + isNight * vec3(0.055, 0.065, 0.09);

    // Shelf
    shelfCol = isMorning * vec3(0.55, 0.45, 0.33)
             + isAfternoon * vec3(0.61, 0.51, 0.40)
             + isEvening * vec3(0.35, 0.29, 0.37)
             + isNight * vec3(0.16, 0.18, 0.23);

    // Rug
    matCol = isMorning * vec3(0.42, 0.55, 0.68)
           + isAfternoon * vec3(0.48, 0.42, 0.60)
           + isEvening * vec3(0.29, 0.23, 0.35)
           + isNight * vec3(0.12, 0.16, 0.23);

    // Window light tint
    lightCol = isMorning * vec3(0.8, 0.7, 0.3)
             + isAfternoon * vec3(0.6, 0.65, 0.7)
             + isEvening * vec3(0.8, 0.4, 0.2)
             + isNight * vec3(0.15, 0.25, 0.45);

    // Sky gradient
    skyTop = isMorning * vec3(0.53, 0.81, 0.92)
           + isAfternoon * vec3(0.36, 0.68, 0.89)
           + isEvening * vec3(1.0, 0.42, 0.21)
           + isNight * vec3(0.04, 0.06, 0.15);
    skyBot = isMorning * vec3(0.85, 0.90, 0.95)
           + isAfternoon * vec3(0.70, 0.85, 0.95)
           + isEvening * vec3(1.0, 0.80, 0.50)
           + isNight * vec3(0.02, 0.04, 0.10);

    // Frame color
    frameCol = (isMorning + isAfternoon) * vec3(0.78, 0.75, 0.70)
             + (isEvening + isNight) * vec3(0.29, 0.30, 0.35);

    if (uv.y < floorLine) {
        // ── Wall ──
        vec2 wuv = vec2(uv.x, uv.y / floorLine);
        col = wallCol;
        // Subtle wood paneling (horizontal lines in lower wall)
        float panelY = wuv.y * 8.0;
        float panelLine = smoothstep(0.48, 0.50, fract(panelY)) * smoothstep(0.52, 0.50, fract(panelY));
        col -= vec3(panelLine * 0.03) * step(0.4, wuv.y);
        // Subtle wall texture
        col += (noise(wuv * 50.0) - 0.5) * 0.015;

        // Baseboard
        if (wuv.y < 0.08) {
            col = shelfCol * 0.8;
            col += vec3(0.02) * step(0.06, wuv.y);
        }

        // ── Window ──
        float wl = 0.74, wr = 0.92, wb = 0.28, wt = 0.82;
        if (wuv.x > wl && wuv.x < wr && wuv.y > wb && wuv.y < wt) {
            vec2 winUV = (wuv - vec2(wl, wb)) / vec2(wr - wl, wt - wb);
            float frameW = 0.04;
            float crossW = 0.02;
            bool isFrame = winUV.x < frameW || winUV.x > 1.0 - frameW ||
                          winUV.y < frameW || winUV.y > 1.0 - frameW ||
                          abs(winUV.x - 0.5) < crossW || abs(winUV.y - 0.5) < crossW;
            if (isFrame) {
                col = frameCol;
                col += vec3(0.04) * smoothstep(0.0, 0.02, winUV.x);
            } else {
                // Sky
                col = mix(skyBot, skyTop, winUV.y);

                // Morning: clouds + sun glow
                if (u_tod < 0.5) {
                    // Drifting cloud
                    float cx = 0.4 + sin(u_time * 0.08) * 0.15;
                    float cd = length((winUV - vec2(cx, 0.55)) * vec2(1.0, 2.5));
                    col = mix(col, vec3(1.0, 1.0, 1.0), smoothstep(0.15, 0.05, cd) * 0.6);
                    float cd2 = length((winUV - vec2(cx + 0.12, 0.52)) * vec2(1.0, 2.8));
                    col = mix(col, vec3(1.0, 1.0, 1.0), smoothstep(0.12, 0.04, cd2) * 0.5);
                    // Warm sun glow
                    float sg = smoothstep(0.5, 0.0, length(winUV - vec2(0.8, 0.85)));
                    col += vec3(0.4, 0.3, 0.1) * sg * 0.3;
                }
                // Afternoon: wispy cloud
                if (u_tod > 0.5 && u_tod < 1.5) {
                    float cx = 0.3 + sin(u_time * 0.05) * 0.2;
                    float cd = length((winUV - vec2(cx, 0.6)) * vec2(1.0, 3.0));
                    col = mix(col, vec3(1.0), smoothstep(0.12, 0.04, cd) * 0.4);
                }
                // Evening: sunset sun
                if (u_tod > 1.5 && u_tod < 2.5) {
                    float sd = length(winUV - vec2(0.5, 0.35));
                    col += vec3(1.0, 0.95, 0.7) * smoothstep(0.12, 0.04, sd) * 0.8;
                    col += vec3(0.5, 0.2, 0.0) * smoothstep(0.25, 0.08, sd) * 0.3;
                }
                // Night: stars + moon
                if (u_tod > 2.5) {
                    for (float i = 0.0; i < 14.0; i += 1.0) {
                        vec2 sp = vec2(hash(vec2(i * 7.3, 1.1)), hash(vec2(1.7, i * 4.3)));
                        float d = length(winUV - sp);
                        float twinkle = sin(u_time * (1.5 + hash(vec2(i, 3.0))) + i * 2.7) * 0.5 + 0.5;
                        col += vec3(0.9, 0.92, 1.0) * smoothstep(0.012, 0.0, d) * (0.4 + 0.6 * twinkle);
                    }
                    // Moon
                    vec2 mp = vec2(0.25, 0.78);
                    float md = length(winUV - mp);
                    col += vec3(0.85, 0.82, 0.72) * smoothstep(0.10, 0.06, md);
                    float md2 = length(winUV - mp - vec2(0.04, 0.02));
                    col -= vec3(0.5) * smoothstep(0.10, 0.06, md2) * 0.6;
                }
            }
        }

        // Window light on wall
        float lightDist = length((wuv - vec2(0.83, 0.50)) * vec2(0.8, 1.3));
        float windowLight = smoothstep(0.55, 0.0, lightDist) * 0.15;
        col += lightCol * windowLight;

        // Morning sunbeam
        if (u_tod < 0.5) {
            float beamX = wuv.x - 0.83;
            float beamFade = smoothstep(0.0, -0.3, beamX) * smoothstep(-0.5, -0.2, beamX);
            float beamY = smoothstep(0.3, 0.5, wuv.y) * smoothstep(0.8, 0.6, wuv.y);
            col += vec3(0.8, 0.65, 0.3) * beamFade * beamY * 0.08;
            // Floating dust motes
            for (float i = 0.0; i < 4.0; i += 1.0) {
                vec2 mp = vec2(0.55 + hash(vec2(i, 7.0)) * 0.3,
                              0.35 + hash(vec2(i, 3.0)) * 0.4);
                mp.x += sin(u_time * 0.3 + i * 2.0) * 0.03;
                mp.y += cos(u_time * 0.2 + i * 1.5) * 0.02;
                float md = length(wuv - mp);
                col += vec3(1.0, 0.9, 0.6) * smoothstep(0.008, 0.0, md) * 0.4;
            }
        }

        // ── Shelf ──
        float shelfY = 0.42;
        if (wuv.x > 0.04 && wuv.x < 0.22) {
            if (wuv.y > shelfY - 0.01 && wuv.y < shelfY + 0.02) {
                col = shelfCol;
                col += vec3(0.03) * noise(wuv * 40.0);
                if (wuv.y < shelfY + 0.005) col += vec3(0.04);
            }
            // Brackets
            if ((wuv.x > 0.06 && wuv.x < 0.075 || wuv.x > 0.185 && wuv.x < 0.20) &&
                wuv.y > shelfY + 0.02 && wuv.y < shelfY + 0.05) {
                col = shelfCol * 0.85;
            }
            // Trophy
            if (u_evo >= 2.0 && wuv.x > 0.07 && wuv.x < 0.11 && wuv.y > shelfY - 0.06 && wuv.y < shelfY - 0.01) {
                col = vec3(1.0, 0.84, 0.0) * (0.7 + 0.15 * sin(u_time * 1.5));
            }
            // Plant
            if (u_evo >= 3.0 && wuv.x > 0.12 && wuv.x < 0.135 && wuv.y > shelfY - 0.05 && wuv.y < shelfY - 0.01) {
                col = vec3(0.3, 0.65, 0.3);
            }
            if (u_evo >= 3.0 && wuv.x > 0.115 && wuv.x < 0.14 && wuv.y > shelfY - 0.03 && wuv.y < shelfY - 0.01) {
                col = vec3(0.47, 0.33, 0.28);
            }
            // Books
            if (u_evo >= 4.0 && wuv.x > 0.15 && wuv.x < 0.20 && wuv.y > shelfY - 0.04 && wuv.y < shelfY - 0.01) {
                col = wuv.x < 0.165 ? vec3(0.91, 0.12, 0.39) : vec3(0.13, 0.59, 0.95);
                if (fract(wuv.x * 100.0) < 0.15) col *= 0.7; // spines
            }
        }

        // ── Picture frame ──
        float pfl = 0.40, pfr = 0.58, pfb = 0.62, pft = 0.82;
        if (wuv.x > pfl && wuv.x < pfr && wuv.y > pfb && wuv.y < pft) {
            vec2 pfuv = (wuv - vec2(pfl, pfb)) / vec2(pfr - pfl, pft - pfb);
            bool pfFrame = pfuv.x < 0.06 || pfuv.x > 0.94 || pfuv.y < 0.06 || pfuv.y > 0.94;
            if (pfFrame) {
                col = shelfCol * 0.9;
            } else {
                // Mini landscape
                vec3 landSky = isEvening * vec3(0.8, 0.4, 0.2)
                             + isNight * vec3(0.08, 0.12, 0.25)
                             + (isMorning + isAfternoon) * vec3(0.53, 0.81, 0.92);
                vec3 landGround = isEvening * vec3(0.3, 0.15, 0.1)
                                + isNight * vec3(0.05, 0.08, 0.05)
                                + (isMorning + isAfternoon) * vec3(0.3, 0.6, 0.3);
                col = pfuv.y > 0.45 ? landSky : landGround;
            }
        }

    } else {
        // ── Floor ──
        vec2 fuv = vec2(uv.x, (uv.y - floorLine) / (1.0 - floorLine));
        col = floorCol;
        // Wood plank pattern
        vec2 plank = fuv * vec2(8.0, 1.0);
        float plankEdge = smoothstep(0.0, 0.02, fract(plank.x)) * smoothstep(0.0, 0.02, 1.0 - fract(plank.x));
        col *= mix(0.90, 1.0, plankEdge);
        // Horizontal joints
        float jointY = fract(fuv.y * 5.0);
        float joint = smoothstep(0.48, 0.50, jointY) * smoothstep(0.52, 0.50, jointY);
        col -= vec3(joint * 0.02);
        // Wood grain texture
        col += (noise(fuv * vec2(4.0, 40.0)) - 0.5) * 0.02;
        col += (hash(floor(plank)) - 0.5) * 0.01;

        // Window light on floor
        float floorLight = smoothstep(0.5, 0.0, length((fuv - vec2(0.82, 0.15)) * vec2(0.9, 3.0)));
        col += lightCol * floorLight * 0.15;

        // Morning: sunbeam on floor
        if (u_tod < 0.5) {
            float beamFloor = smoothstep(0.5, 0.8, fuv.x) * smoothstep(1.0, 0.85, fuv.x);
            beamFloor *= smoothstep(0.0, 0.3, fuv.y) * smoothstep(0.6, 0.3, fuv.y);
            col += vec3(0.8, 0.65, 0.3) * beamFloor * 0.08;
        }

        // Night: moonlight on floor
        if (u_tod > 2.5) {
            float moonFloor = smoothstep(0.5, 0.85, fuv.x) * smoothstep(0.0, 0.4, fuv.y);
            col += vec3(0.15, 0.18, 0.28) * moonFloor * 0.12;
            float caustic = noise(fuv * 15.0 + u_time * 0.3) * noise(fuv * 20.0 - u_time * 0.2);
            col += vec3(0.05, 0.08, 0.15) * caustic * moonFloor * 0.15;
        }

        // ── Rug (oval) ──
        float matDist = length((fuv - vec2(0.50, 0.42)) * vec2(1.0, 3.0));
        float mat = smoothstep(0.28, 0.24, matDist);
        vec3 rugCol = matCol;
        rugCol += vec3(0.02, 0.0, 0.02) * noise(fuv * 30.0);
        col = mix(col, rugCol, mat * 0.7);
        // Inner ring
        float matInner = smoothstep(0.20, 0.16, matDist);
        col = mix(col, matCol * 1.15, matInner * 0.3);
        // Rug edge
        float matEdge = smoothstep(0.26, 0.25, matDist) * smoothstep(0.24, 0.25, matDist);
        col += matCol * 0.5 * matEdge;

        // ── Food bowl ──
        float bowlDist = length((fuv - vec2(0.135, 0.55)) * vec2(1.0, 2.2));
        if (bowlDist < 0.06) {
            col = vec3(0.45, 0.47, 0.52);
            if (bowlDist < 0.045 && fuv.y > 0.55 - u_hunger * 0.0003) {
                float foodG = u_hunger > 50.0 ? 0.6 : u_hunger > 25.0 ? 0.3 : 0.1;
                float foodR = u_hunger > 50.0 ? 0.2 : u_hunger > 25.0 ? 0.8 : 0.9;
                col = vec3(foodR, foodG + 0.1, 0.1);
            }
            if (bowlDist > 0.05) col += vec3(0.06);
        }
        // Bowl shadow
        float bowlShad = length((fuv - vec2(0.135, 0.59)) * vec2(1.0, 4.0));
        col -= vec3(0.03) * smoothstep(0.08, 0.03, bowlShad);

        // ── Water bowl ──
        float wbDist = length((fuv - vec2(0.22, 0.56)) * vec2(1.0, 2.5));
        if (wbDist < 0.045) {
            col = vec3(0.45, 0.47, 0.52);
            if (wbDist < 0.035) {
                col = vec3(0.0, 0.45, 0.75);
                col += vec3(0.1, 0.15, 0.2) * sin(u_time * 2.0 + fuv.x * 30.0) * 0.5;
            }
            if (wbDist > 0.038) col += vec3(0.05);
        }

        // ── Tech display (baby+) ──
        if (u_evo >= 1.0) {
            float dx = 0.85, dy = 0.48;
            if (fuv.x > dx - 0.03 && fuv.x < dx + 0.03 && fuv.y > dy - 0.06 && fuv.y < dy + 0.06) {
                col = vec3(0.06, 0.06, 0.12);
                float screenGlow = 0.3 + sin(u_time * 0.8) * 0.1;
                if (fuv.x > dx - 0.025 && fuv.x < dx + 0.025 && fuv.y > dy - 0.05 && fuv.y < dy + 0.05) {
                    col = vec3(0.0, screenGlow * 0.8, screenGlow);
                    // Screen lines
                    float sl = step(0.4, fract(fuv.y * 40.0));
                    col *= 0.85 + 0.15 * sl;
                }
            }
        }
    }

    // Subtle ambient glow (no vignette here — composite handles it)
    float ambientPulse = sin(u_time * 0.5) * 0.005 + 0.005;
    col += lightCol * ambientPulse * 0.15;

    gl_FragColor = vec4(col, 1.0);
}
`;

const _GL_TEX_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
    vec4 c = texture2D(u_tex, v_uv);
    gl_FragColor = c;
}
`;

const _GL_PARTICLE_VERT = `
attribute vec2 a_pos;
attribute vec4 a_color;
attribute float a_size;
uniform vec2 u_res;
varying vec4 v_color;
void main() {
    vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    gl_PointSize = a_size;
    v_color = a_color;
}
`;

const _GL_PARTICLE_FRAG = `
precision mediump float;
varying vec4 v_color;
void main() {
    vec2 pc = gl_PointCoord * 2.0 - 1.0;
    float d = dot(pc, pc);
    if (d > 1.0) discard;
    float alpha = smoothstep(1.0, 0.2, d) * v_color.a;
    gl_FragColor = vec4(v_color.rgb, alpha);
}
`;

const _GL_BRIGHT_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_threshold;
void main() {
    vec3 c = texture2D(u_tex, v_uv).rgb;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 bright = c * smoothstep(u_threshold, u_threshold + 0.3, lum);
    gl_FragColor = vec4(bright, 1.0);
}
`;

const _GL_BLUR_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
void main() {
    vec3 c = vec3(0.0);
    c += texture2D(u_tex, v_uv - u_dir * 4.0).rgb * 0.016216;
    c += texture2D(u_tex, v_uv - u_dir * 3.0).rgb * 0.054054;
    c += texture2D(u_tex, v_uv - u_dir * 2.0).rgb * 0.121621;
    c += texture2D(u_tex, v_uv - u_dir * 1.0).rgb * 0.194594;
    c += texture2D(u_tex, v_uv).rgb * 0.227027;
    c += texture2D(u_tex, v_uv + u_dir * 1.0).rgb * 0.194594;
    c += texture2D(u_tex, v_uv + u_dir * 2.0).rgb * 0.121621;
    c += texture2D(u_tex, v_uv + u_dir * 3.0).rgb * 0.054054;
    c += texture2D(u_tex, v_uv + u_dir * 4.0).rgb * 0.016216;
    gl_FragColor = vec4(c, 1.0);
}
`;

const _GL_COMP_FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomStr;
uniform float u_time;
void main() {
    vec3 scene = texture2D(u_scene, v_uv).rgb;
    vec3 bloom = texture2D(u_bloom, v_uv).rgb;
    vec3 col = scene + bloom * u_bloomStr;

    // Gentle vignette (single pass, not too dark)
    float vig = 1.0 - smoothstep(0.5, 1.1, length((v_uv - 0.5) * vec2(1.2, 1.0)));
    col *= 0.82 + 0.18 * vig;

    // Very subtle chromatic aberration
    float dist = length(v_uv - 0.5);
    float aberr = dist * 0.0015;
    float r = texture2D(u_scene, v_uv + vec2(aberr, 0.0)).r;
    float b = texture2D(u_scene, v_uv - vec2(aberr, 0.0)).b;
    col.r = mix(col.r, r, 0.2);
    col.b = mix(col.b, b, 0.2);

    // Light tone mapping (preserve brightness)
    col = col / (1.0 + col * 0.08);

    gl_FragColor = vec4(col, 1.0);
}
`;

// ─── WebGL Infrastructure ───────────────────────────────────────────────────

function _pgCompile(gl, src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[MC GL] Shader compile:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
    }
    return s;
}

function _pgLink(gl, vSrc, fSrc) {
    const vs = _pgCompile(gl, vSrc, gl.VERTEX_SHADER);
    const fs = _pgCompile(gl, fSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('[MC GL] Program link:', gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function _pgCreateFBO(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
}

function _pgDrawQuad(gl) {
    const loc = gl.getAttribLocation(gl.getParameter(gl.CURRENT_PROGRAM), 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, _glBuf.quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function _pgInitGL(canvas) {
    const W = canvas.width, H = canvas.height;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) {
        console.warn('[MC] WebGL not available, using 2D fallback');
        return false;
    }
    _glCtx = gl;

    // Compile shader programs
    _glPrg.room = _pgLink(gl, _GL_QUAD_VERT, _GL_ROOM_FRAG);
    _glPrg.tex = _pgLink(gl, _GL_QUAD_VERT, _GL_TEX_FRAG);
    _glPrg.particle = _pgLink(gl, _GL_PARTICLE_VERT, _GL_PARTICLE_FRAG);
    _glPrg.bright = _pgLink(gl, _GL_QUAD_VERT, _GL_BRIGHT_FRAG);
    _glPrg.blur = _pgLink(gl, _GL_QUAD_VERT, _GL_BLUR_FRAG);
    _glPrg.comp = _pgLink(gl, _GL_QUAD_VERT, _GL_COMP_FRAG);

    // Check all programs compiled
    for (const [name, prg] of Object.entries(_glPrg)) {
        if (!prg) {
            console.error(`[MC GL] Failed to compile ${name} program`);
            _pgCleanupGL();
            return false;
        }
    }

    // Fullscreen quad buffer
    _glBuf.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, _glBuf.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    // Particle buffer (dynamic)
    _glBuf.particles = gl.createBuffer();

    // Framebuffers
    _glFBO.scene = _pgCreateFBO(gl, W, H);
    _glFBO.bright = _pgCreateFBO(gl, Math.floor(W/2), Math.floor(H/2));
    _glFBO.blur1 = _pgCreateFBO(gl, Math.floor(W/2), Math.floor(H/2));

    // Overlay texture (for 2D canvas upload)
    _glTex.overlay = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, _glTex.overlay);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create offscreen 2D canvas for sprite rendering
    _offCv = document.createElement('canvas');
    _offCv.width = W;
    _offCv.height = H;
    _offCtx = _offCv.getContext('2d');

    // Set _petCtx to offscreen so existing draw functions use it
    _petCtx = _offCtx;

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    _glParticles = [];
    _glTime = 0;

    console.log('[MC] WebGL pet renderer initialized');
    return true;
}

function _pgCleanupGL() {
    if (_glCtx) {
        const gl = _glCtx;
        Object.values(_glPrg).forEach(p => { if (p) gl.deleteProgram(p); });
        Object.values(_glBuf).forEach(b => { if (b) gl.deleteBuffer(b); });
        Object.values(_glFBO).forEach(f => { if (f) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex); }});
        Object.values(_glTex).forEach(t => { if (t) gl.deleteTexture(t); });
    }
    _glCtx = null;
    _glPrg = {};
    _glBuf = {};
    _glFBO = {};
    _glTex = {};
    _offCv = null;
    _offCtx = null;
    _glParticles = [];
    _glReady = false;
}

// ─── Particle System ────────────────────────────────────────────────────────

function _pgSpawnParticle(x, y, vx, vy, r, g, b, a, life, size) {
    if (_glParticles.length > 200) return;
    _glParticles.push({ x, y, vx, vy, r, g, b, a, life, maxLife: life, size });
}

function _pgUpdateParticles(dt) {
    for (let i = _glParticles.length - 1; i >= 0; i--) {
        const p = _glParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) { _glParticles.splice(i, 1); }
    }
}

function _pgEmitMoodParticles() {
    if (!_petData) return;
    const W = _petCanvas.width, H = _petCanvas.height;
    const cx = W / 2;
    const baseY = H * 0.65 - 10;
    const evo = _petData.evolution || 0;

    if (_petData.mood === 'happy' && Math.random() < 0.15) {
        _pgSpawnParticle(
            cx + (Math.random() - 0.5) * 40, baseY - evo * 5,
            (Math.random() - 0.5) * 8, -15 - Math.random() * 10,
            1.0, 0.3, 0.5, 0.9,
            80 + Math.random() * 40,
            4 + Math.random() * 3
        );
        if (Math.random() < 0.5) {
            _pgSpawnParticle(
                cx + (Math.random() - 0.5) * 60, baseY - 20 - Math.random() * 30,
                (Math.random() - 0.5) * 15, -5 - Math.random() * 10,
                1.0, 0.95, 0.5, 0.7,
                40 + Math.random() * 20,
                2 + Math.random() * 2
            );
        }
    }

    if (_petData.mood === 'hungry' && Math.random() < 0.08) {
        _pgSpawnParticle(
            cx + 25 + Math.random() * 10, baseY - evo * 6 - 30,
            (Math.random() - 0.5) * 5, -8 - Math.random() * 5,
            1.0, 0.6, 0.0, 0.6,
            60, 3
        );
    }

    if (_petData.mood === 'dirty' && Math.random() < 0.1) {
        _pgSpawnParticle(
            cx + (Math.random() - 0.5) * 30, baseY - evo * 4,
            (Math.random() - 0.5) * 6, -10 - Math.random() * 8,
            0.4, 0.6, 0.2, 0.4,
            70 + Math.random() * 30,
            3 + Math.random() * 3
        );
    }

    // Master sparkles
    if (evo >= 5 && Math.random() < 0.2) {
        _pgSpawnParticle(
            cx + (Math.random() - 0.5) * 50, baseY - 20 + (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 12, -8 + (Math.random() - 0.5) * 8,
            1.0, 0.84, 0.0, 0.8,
            50 + Math.random() * 30,
            2 + Math.random() * 3
        );
    }

    // Ambient dust motes
    if (Math.random() < 0.05) {
        _pgSpawnParticle(
            Math.random() * W, Math.random() * H * 0.65,
            (Math.random() - 0.5) * 3, -2 + Math.random() * 2,
            0.6, 0.6, 0.7, 0.15,
            120 + Math.random() * 60,
            1 + Math.random()
        );
    }

    // Window light dust
    if (Math.random() < 0.08) {
        _pgSpawnParticle(
            W * 0.75 + Math.random() * W * 0.15, Math.random() * H * 0.5,
            (Math.random() - 0.5) * 2, 1 + Math.random() * 3,
            0.5, 0.6, 0.9, 0.2,
            100 + Math.random() * 80,
            1 + Math.random()
        );
    }
}

function _pgDrawParticles(gl) {
    if (_glParticles.length === 0) return;

    const data = new Float32Array(_glParticles.length * 7);
    for (let i = 0; i < _glParticles.length; i++) {
        const p = _glParticles[i];
        const fade = Math.max(0, p.life / p.maxLife);
        const j = i * 7;
        data[j]     = p.x;
        data[j + 1] = p.y;
        data[j + 2] = p.r;
        data[j + 3] = p.g;
        data[j + 4] = p.b;
        data[j + 5] = p.a * fade;
        data[j + 6] = p.size * (0.5 + 0.5 * fade);
    }

    gl.useProgram(_glPrg.particle);
    gl.bindBuffer(gl.ARRAY_BUFFER, _glBuf.particles);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    const aPos = gl.getAttribLocation(_glPrg.particle, 'a_pos');
    const aCol = gl.getAttribLocation(_glPrg.particle, 'a_color');
    const aSize = gl.getAttribLocation(_glPrg.particle, 'a_size');
    const stride = 7 * 4;

    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(aSize);
    gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, stride, 24);

    gl.uniform2f(gl.getUniformLocation(_glPrg.particle, 'u_res'), _petCanvas.width, _petCanvas.height);

    gl.drawArrays(gl.POINTS, 0, _glParticles.length);

    gl.disableVertexAttribArray(aPos);
    gl.disableVertexAttribArray(aCol);
    gl.disableVertexAttribArray(aSize);
}

// ─── Pet Render ─────────────────────────────────────────────────────────────

function _renderPet() {
    if (!_petCanvas) return;

    // 2D Fallback
    if (!_glReady || !_glCtx) {
        const ctx = _petCtx;
        if (!ctx) return;
        const W = _petCanvas.width, H = _petCanvas.height;
        ctx.clearRect(0, 0, W, H);
        if (!_petData) {
            ctx.fillStyle = '#888'; ctx.font = '14px monospace'; ctx.textAlign = 'center';
            ctx.fillText('Loading pet...', W/2, H/2);
            return;
        }
        _drawRoom(ctx, W, H);
        _drawClutter(ctx, W, H);
        _drawPetSprite(ctx, W, H);
        _drawPlayEmojis(ctx, W, H);
        _drawStatBars(ctx, W, H);
        _drawPetInfo(ctx, W, H);
        return;
    }

    // WebGL Render
    const gl = _glCtx;
    const W = _petCanvas.width, H = _petCanvas.height;
    _glTime += 0.15;

    if (!_petData) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
        gl.clearColor(0.04, 0.04, 0.06, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
    }

    // === Pass 1: Render scene to FBO ===
    gl.bindFramebuffer(gl.FRAMEBUFFER, _glFBO.scene.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);

    // Draw procedural room
    gl.useProgram(_glPrg.room);
    gl.uniform1f(gl.getUniformLocation(_glPrg.room, 'u_time'), _glTime);
    gl.uniform1f(gl.getUniformLocation(_glPrg.room, 'u_hunger'), _petData.hunger || 0);
    gl.uniform1f(gl.getUniformLocation(_glPrg.room, 'u_happiness'), _petData.happiness || 0);
    gl.uniform1f(gl.getUniformLocation(_glPrg.room, 'u_clean'), _petData.cleanliness || 0);
    gl.uniform1f(gl.getUniformLocation(_glPrg.room, 'u_evo'), _petData.evolution || 0);
    const _todMap = { morning: 0.0, afternoon: 1.0, evening: 2.0, night: 3.0 };
    gl.uniform1f(gl.getUniformLocation(_glPrg.room, 'u_tod'), _todMap[_getTimeOfDay()] ?? 1.0);
    _pgDrawQuad(gl);

    // Draw 2D sprites as overlay
    _offCtx.clearRect(0, 0, W, H);
    _drawClutter(_offCtx, W, H);
    _drawPetSprite(_offCtx, W, H);
    _drawPlayEmojis(_offCtx, W, H);
    _drawStatBars(_offCtx, W, H);
    _drawPetInfo(_offCtx, W, H);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _glTex.overlay);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _offCv);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.useProgram(_glPrg.tex);
    gl.uniform1i(gl.getUniformLocation(_glPrg.tex, 'u_tex'), 0);
    _pgDrawQuad(gl);

    // Draw particles
    _pgEmitMoodParticles();
    _pgUpdateParticles(1);
    _pgDrawParticles(gl);

    gl.disable(gl.BLEND);

    // === Pass 2: Bloom - brightness extract ===
    gl.bindFramebuffer(gl.FRAMEBUFFER, _glFBO.bright.fb);
    gl.viewport(0, 0, _glFBO.bright.w, _glFBO.bright.h);
    gl.useProgram(_glPrg.bright);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _glFBO.scene.tex);
    gl.uniform1i(gl.getUniformLocation(_glPrg.bright, 'u_tex'), 0);
    gl.uniform1f(gl.getUniformLocation(_glPrg.bright, 'u_threshold'), 0.65);
    _pgDrawQuad(gl);

    // === Pass 3: Horizontal blur ===
    gl.bindFramebuffer(gl.FRAMEBUFFER, _glFBO.blur1.fb);
    gl.useProgram(_glPrg.blur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _glFBO.bright.tex);
    gl.uniform1i(gl.getUniformLocation(_glPrg.blur, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(_glPrg.blur, 'u_dir'), 1.0 / _glFBO.bright.w, 0);
    _pgDrawQuad(gl);

    // === Pass 4: Vertical blur ===
    gl.bindFramebuffer(gl.FRAMEBUFFER, _glFBO.bright.fb);
    gl.useProgram(_glPrg.blur);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _glFBO.blur1.tex);
    gl.uniform1i(gl.getUniformLocation(_glPrg.blur, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(_glPrg.blur, 'u_dir'), 0, 1.0 / _glFBO.bright.h);
    _pgDrawQuad(gl);

    // === Pass 5: Composite to screen ===
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(_glPrg.comp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, _glFBO.scene.tex);
    gl.uniform1i(gl.getUniformLocation(_glPrg.comp, 'u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, _glFBO.bright.tex);
    gl.uniform1i(gl.getUniformLocation(_glPrg.comp, 'u_bloom'), 1);
    gl.uniform1f(gl.getUniformLocation(_glPrg.comp, 'u_bloomStr'), 0.6);
    gl.uniform1f(gl.getUniformLocation(_glPrg.comp, 'u_time'), _glTime);
    _pgDrawQuad(gl);
}

function _getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
}

const _roomThemes = {
    morning: {
        wall: '#e8ddd0',    wallAccent: 'rgba(255,200,100,0.08)',
        floor: '#c4b8a8',   floorAccent: 'rgba(255,255,255,0.06)',
        shelf: '#8b7355',   shelfBracket: '#a0896b',
        mat: '#6b8cae',     matInner: '#7d9ec0',
        bowl: '#7a8690',    windowSky: '#87ceeb',
        windowGlow: 'rgba(255,220,100,0.25)',
        sunbeam: true,      stars: false,
        wallLine: 'rgba(0,0,0,0.04)',
        floorLine: 'rgba(0,0,0,0.04)',
    },
    afternoon: {
        wall: '#f0e6d4',    wallAccent: 'rgba(255,180,60,0.06)',
        floor: '#d4c4ae',   floorAccent: 'rgba(255,255,255,0.05)',
        shelf: '#9b8365',   shelfBracket: '#b09878',
        mat: '#7a6b9a',     matInner: '#8c7dac',
        bowl: '#8a9098',    windowSky: '#5dade2',
        windowGlow: 'rgba(255,255,200,0.15)',
        sunbeam: false,     stars: false,
        wallLine: 'rgba(0,0,0,0.03)',
        floorLine: 'rgba(0,0,0,0.03)',
    },
    evening: {
        wall: '#3a2e42',    wallAccent: 'rgba(255,100,50,0.06)',
        floor: '#2a2230',   floorAccent: 'rgba(255,150,80,0.03)',
        shelf: '#5a4a5e',   shelfBracket: '#6a5a6e',
        mat: '#4a3a5a',     matInner: '#5a4a6a',
        bowl: '#5a5e6a',    windowSky: '#ff7b4a',
        windowGlow: 'rgba(255,120,50,0.2)',
        sunbeam: false,     stars: false,
        wallLine: 'rgba(255,255,255,0.02)',
        floorLine: 'rgba(255,255,255,0.02)',
        sunset: true,
    },
    night: {
        wall: '#141822',    wallAccent: 'rgba(0,150,255,0.03)',
        floor: '#0e1118',   floorAccent: 'rgba(0,200,255,0.02)',
        shelf: '#2a2e3a',   shelfBracket: '#3a3e4a',
        mat: '#1e2a3a',     matInner: '#253545',
        bowl: '#3a3e4a',    windowSky: '#0a1628',
        windowGlow: 'rgba(100,150,255,0.08)',
        sunbeam: false,     stars: true,
        wallLine: 'rgba(255,255,255,0.02)',
        floorLine: 'rgba(255,255,255,0.02)',
        moonlight: true,
    },
};

function _drawRoom(ctx, W, H) {
    const tod = _getTimeOfDay();
    const t = _roomThemes[tod];
    const floorY = H * 0.65;

    // ── Back wall ──
    ctx.fillStyle = t.wall;
    ctx.fillRect(0, 0, W, floorY);

    // Wall accent gradient
    if (t.wallAccent) {
        ctx.fillStyle = t.wallAccent;
        ctx.fillRect(0, 0, W, floorY);
    }

    // Subtle horizontal paneling
    ctx.strokeStyle = t.wallLine;
    ctx.lineWidth = 1;
    for (let y = floorY * 0.6; y < floorY; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }

    // Baseboard
    ctx.fillStyle = t.shelf;
    ctx.fillRect(0, floorY - 4, W, 4);

    // ── Window (right side) ──
    const wx = W - 90, wy = 25, ww = 60, wh = 75;
    // Window recess shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    // Sky
    ctx.fillStyle = t.windowSky;
    ctx.fillRect(wx, wy, ww, wh);

    if (t.sunset) {
        // Sunset gradient
        const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        grad.addColorStop(0, '#ff6b35');
        grad.addColorStop(0.4, '#ff9a56');
        grad.addColorStop(0.7, '#ffcc80');
        grad.addColorStop(1, '#ffe0b2');
        ctx.fillStyle = grad;
        ctx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        // Sun
        ctx.fillStyle = '#fff5cc';
        ctx.beginPath();
        ctx.arc(wx + ww / 2, wy + wh * 0.6, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    if (t.stars) {
        // Night sky with moon and stars
        const starPositions = [
            [wx+10, wy+12], [wx+42, wy+8], [wx+22, wy+48], [wx+48, wy+35],
            [wx+15, wy+30], [wx+35, wy+20], [wx+50, wy+55], [wx+8, wy+58],
        ];
        ctx.fillStyle = '#fff';
        starPositions.forEach(([sx, sy]) => {
            const twinkle = Math.sin(_petFrame * 0.15 + sx * 0.5) > 0.2 ? 2 : 1;
            ctx.fillRect(sx, sy, twinkle, twinkle);
        });
    }

    if (t.moonlight) {
        // Moon
        ctx.fillStyle = '#e8e4d8';
        ctx.beginPath();
        ctx.arc(wx + 15, wy + 18, 8, 0, Math.PI * 2);
        ctx.fill();
        // Moon shadow (crescent)
        ctx.fillStyle = t.windowSky;
        ctx.beginPath();
        ctx.arc(wx + 18, wy + 16, 7, 0, Math.PI * 2);
        ctx.fill();
        // Moonlight beam on floor
        ctx.fillStyle = 'rgba(150,180,220,0.04)';
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh);
        ctx.lineTo(wx - 60, H);
        ctx.lineTo(wx + ww + 20, H);
        ctx.lineTo(wx + ww, wy + wh);
        ctx.fill();
    }

    if (tod === 'morning') {
        // Clouds in window
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const cloudX = wx + 8 + Math.sin(_petFrame * 0.03) * 8;
        ctx.beginPath(); ctx.arc(cloudX, wy + 20, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cloudX + 8, wy + 18, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cloudX + 16, wy + 20, 5, 0, Math.PI * 2); ctx.fill();
    }

    if (tod === 'afternoon') {
        // Blue sky with a wispy cloud
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        const cloudX = wx + 5 + Math.sin(_petFrame * 0.02) * 10;
        ctx.beginPath(); ctx.arc(cloudX + 10, wy + 30, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cloudX + 18, wy + 28, 6, 0, Math.PI * 2); ctx.fill();
    }

    // Window glow
    ctx.fillStyle = t.windowGlow;
    ctx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);

    // Window frame (white wood)
    ctx.strokeStyle = tod === 'night' || tod === 'evening' ? '#4a4e5a' : '#c8c0b4';
    ctx.lineWidth = 2;
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.beginPath(); ctx.moveTo(wx + ww/2, wy); ctx.lineTo(wx + ww/2, wy + wh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(wx, wy + wh/2); ctx.lineTo(wx + ww, wy + wh/2); ctx.stroke();

    // ── Sunbeam (morning) ──
    if (t.sunbeam) {
        ctx.fillStyle = 'rgba(255,220,120,0.06)';
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh);
        ctx.lineTo(wx - 80, H);
        ctx.lineTo(wx + ww + 30, H);
        ctx.lineTo(wx + ww, wy + wh);
        ctx.fill();
        // Dust motes in sunbeam
        ctx.fillStyle = 'rgba(255,230,150,0.3)';
        for (let m = 0; m < 5; m++) {
            const mx = wx - 30 + Math.sin(_petFrame * 0.05 + m * 2) * 40;
            const my = wy + wh + 20 + m * 25 + Math.cos(_petFrame * 0.03 + m) * 10;
            ctx.fillRect(mx, my, 2, 2);
        }
    }

    // ── Shelf on left wall ──
    ctx.fillStyle = t.shelf;
    ctx.fillRect(20, 50, 80, 6);
    // Shelf brackets
    ctx.fillStyle = t.shelfBracket;
    ctx.fillRect(28, 56, 3, 10);
    ctx.fillRect(89, 56, 3, 10);

    // Items on shelf based on evolution
    if (_petData && _petData.evolution >= 2) {
        // Trophy
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(30, 40, 8, 10);
        ctx.fillRect(27, 38, 14, 4);
        // Trophy shine
        ctx.fillStyle = 'rgba(255,255,200,0.4)';
        ctx.fillRect(31, 41, 2, 4);
    }
    if (_petData && _petData.evolution >= 4) {
        // Book
        ctx.fillStyle = '#e91e63';
        ctx.fillRect(55, 42, 12, 8);
        ctx.fillStyle = '#c2185b';
        ctx.fillRect(55, 42, 2, 8);
        // Second book
        ctx.fillStyle = '#2196f3';
        ctx.fillRect(69, 43, 10, 7);
        ctx.fillStyle = '#1976d2';
        ctx.fillRect(69, 43, 2, 7);
    }
    if (_petData && _petData.evolution >= 3) {
        // Small plant
        ctx.fillStyle = '#795548';
        ctx.fillRect(45, 44, 6, 6);
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(44, 38, 3, 6);
        ctx.fillRect(49, 36, 3, 8);
        ctx.fillRect(46, 34, 3, 6);
    }

    // ── Decorative picture frame on wall ──
    ctx.strokeStyle = tod === 'night' || tod === 'evening' ? '#4a4050' : '#a09080';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 20, 25, 40, 30);
    // Picture content — little landscape
    ctx.fillStyle = tod === 'evening' ? '#5a3a2a' : tod === 'night' ? '#1a2a3a' : '#6aaa6a';
    ctx.fillRect(W / 2 - 18, 27, 36, 18);
    ctx.fillStyle = tod === 'evening' ? '#ff9a56' : tod === 'night' ? '#2a3a5a' : '#87ceeb';
    ctx.fillRect(W / 2 - 18, 27, 36, 10);

    // ── Floor ──
    ctx.fillStyle = t.floor;
    ctx.fillRect(0, floorY, W, H - floorY);

    // Wooden floor planks
    ctx.strokeStyle = t.floorLine;
    ctx.lineWidth = 1;
    for (let px = 0; px < W; px += 48) {
        ctx.beginPath();
        ctx.moveTo(px, floorY);
        ctx.lineTo(px, H);
        ctx.stroke();
    }
    // Horizontal plank joints
    for (let py = floorY + 20; py < H; py += 20) {
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(W, py);
        ctx.stroke();
    }

    // ── Cozy round rug (center floor) ──
    const rugCx = W / 2, rugCy = floorY + 55;
    const rugRx = 50, rugRy = 14;
    // Rug shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(rugCx, rugCy + 2, rugRx + 2, rugRy + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Outer ring
    ctx.fillStyle = t.mat;
    ctx.beginPath();
    ctx.ellipse(rugCx, rugCy, rugRx, rugRy, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner ring
    ctx.fillStyle = t.matInner;
    ctx.beginPath();
    ctx.ellipse(rugCx, rugCy, rugRx - 8, rugRy - 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Center accent
    ctx.fillStyle = t.mat;
    ctx.beginPath();
    ctx.ellipse(rugCx, rugCy, rugRx - 18, rugRy - 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Food bowl (left) ──
    const bowlX = 60, bowlY = floorY + 50;
    // Bowl shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(bowlX + 12, bowlY + 14, 14, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Bowl body
    ctx.fillStyle = t.bowl;
    ctx.fillRect(bowlX, bowlY, 24, 12);
    ctx.fillRect(bowlX - 2, bowlY + 12, 28, 4);
    // Food level based on hunger
    if (_petData) {
        const foodH = Math.floor((_petData.hunger / 100) * 8);
        ctx.fillStyle = _petData.hunger > 50 ? '#4caf50' : _petData.hunger > 25 ? '#ff9800' : '#f44336';
        ctx.fillRect(bowlX + 2, bowlY + (10 - foodH), 20, foodH);
    }

    // ── Water bowl (right of food) ──
    const waterX = 100, waterY = floorY + 52;
    ctx.fillStyle = t.bowl;
    ctx.fillRect(waterX, waterY, 18, 10);
    ctx.fillRect(waterX - 2, waterY + 10, 22, 3);
    ctx.fillStyle = 'rgba(0,150,255,0.5)';
    ctx.fillRect(waterX + 2, waterY + 3, 14, 5);
    // Water shimmer
    ctx.fillStyle = 'rgba(200,230,255,0.3)';
    ctx.fillRect(waterX + 4 + Math.sin(_petFrame * 0.1) * 3, waterY + 4, 4, 1);

    // ── Small tech detail (right side floor) — holographic display ──
    if (_petData && _petData.evolution >= 1) {
        const hx = W - 70, hy = floorY + 45;
        // Small screen/tablet
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(hx, hy, 22, 16);
        ctx.strokeStyle = '#3a3e5a';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx, hy, 22, 16);
        // Screen glow
        const glowAlpha = 0.3 + Math.sin(_petFrame * 0.1) * 0.1;
        ctx.fillStyle = `rgba(0,240,255,${glowAlpha})`;
        ctx.fillRect(hx + 2, hy + 2, 18, 12);
        // Screen lines
        ctx.fillStyle = 'rgba(0,200,255,0.3)';
        ctx.fillRect(hx + 4, hy + 4, 10, 1);
        ctx.fillRect(hx + 4, hy + 7, 14, 1);
        ctx.fillRect(hx + 4, hy + 10, 8, 1);
    }
}

function _drawPetSprite(ctx, W, H) {
    if (!_petData) return;
    const stage = _petData.evolution || 0;
    const mood = _petData.mood || 'content';
    const cx = W / 2;
    const cy = H * 0.65 + 10;  // sitting on the floor area

    // Bounce animation
    const bounce = Math.sin(_petFrame * 0.3) * 3;
    const breathe = Math.sin(_petFrame * 0.15) * 1;

    if (stage === 0) {
        // Egg — wobble animation
        const wobble = Math.sin(_petFrame * 0.25) * 3;
        ctx.save();
        ctx.translate(cx, cy + 20);
        ctx.rotate(wobble * Math.PI / 180);
        // Egg body
        ctx.fillStyle = '#e8e0d0';
        ctx.fillRect(-12, -20, 24, 28);
        ctx.fillRect(-10, -22, 20, 2);
        ctx.fillRect(-10, 8, 20, 2);
        // Egg spots
        ctx.fillStyle = '#d4c8b0';
        ctx.fillRect(-6, -14, 6, 6);
        ctx.fillRect(4, -4, 4, 4);
        ctx.fillRect(-2, 0, 5, 5);
        // Crack when close to hatching (level > 0 somehow got egg)
        ctx.restore();

    } else if (stage === 1) {
        // Baby — small blob with eyes
        const by = cy + bounce;
        // Body
        ctx.fillStyle = '#6ec6ff';
        ctx.fillRect(cx - 10, by - 8, 20, 16);
        ctx.fillRect(cx - 12, by - 4, 24, 8);
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 7, by - 6, 5, 5);
        ctx.fillRect(cx + 2, by - 6, 5, 5);
        // Pupils — follow mood
        const px = mood === 'sad' ? 0 : (mood === 'happy' ? 1 : 0);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(cx - 6 + px, by - 5, 3, 3);
        ctx.fillRect(cx + 3 + px, by - 5, 3, 3);
        // Mouth
        if (mood === 'happy' || mood === 'content') {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 3, by + 2, 6, 2);
        } else {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 2, by + 3, 4, 1);
        }
        // Little feet
        ctx.fillStyle = '#5ab0e0';
        ctx.fillRect(cx - 8, by + 8, 5, 3);
        ctx.fillRect(cx + 3, by + 8, 5, 3);

    } else if (stage === 2) {
        // Child — recognizable creature with limbs
        const by = cy + bounce - 5;
        // Body
        ctx.fillStyle = '#6ec6ff';
        ctx.fillRect(cx - 12, by - 14, 24, 22);
        ctx.fillRect(cx - 14, by - 10, 28, 14);
        // Head
        ctx.fillStyle = '#7ed4ff';
        ctx.fillRect(cx - 10, by - 22, 20, 12);
        ctx.fillRect(cx - 12, by - 20, 24, 8);
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 8, by - 19, 6, 6);
        ctx.fillRect(cx + 2, by - 19, 6, 6);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(cx - 6, by - 18, 3, 4);
        ctx.fillRect(cx + 4, by - 18, 3, 4);
        // Smile / frown
        if (mood === 'happy') {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 4, by - 11, 8, 2);
            ctx.fillRect(cx - 3, by - 10, 6, 1);
        } else if (mood === 'sad' || mood === 'hungry') {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 3, by - 10, 6, 1);
            ctx.fillRect(cx - 4, by - 11, 8, 1);
        } else {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 3, by - 11, 6, 2);
        }
        // Arms
        const armWave = Math.sin(_petFrame * 0.4) * 4;
        ctx.fillStyle = '#5ab0e0';
        ctx.fillRect(cx - 18, by - 8 + armWave, 6, 10);
        ctx.fillRect(cx + 12, by - 8 - armWave, 6, 10);
        // Legs
        ctx.fillRect(cx - 8, by + 8, 6, 8);
        ctx.fillRect(cx + 2, by + 8, 6, 8);
        // Feet
        ctx.fillStyle = '#4a9cd4';
        ctx.fillRect(cx - 10, by + 14, 8, 3);
        ctx.fillRect(cx + 2, by + 14, 8, 3);

    } else if (stage === 3) {
        // Teen — larger, more detailed, accessories
        const by = cy + bounce - 12;
        // Body
        ctx.fillStyle = '#6ec6ff';
        ctx.fillRect(cx - 14, by - 16, 28, 28);
        ctx.fillRect(cx - 16, by - 12, 32, 20);
        // Head
        ctx.fillStyle = '#7ed4ff';
        ctx.fillRect(cx - 12, by - 28, 24, 16);
        ctx.fillRect(cx - 14, by - 26, 28, 12);
        // Hair/spikes
        ctx.fillStyle = '#4a80c0';
        ctx.fillRect(cx - 10, by - 32, 4, 6);
        ctx.fillRect(cx - 3, by - 34, 4, 8);
        ctx.fillRect(cx + 4, by - 32, 4, 6);
        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 9, by - 24, 7, 7);
        ctx.fillRect(cx + 2, by - 24, 7, 7);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(cx - 7, by - 23, 4, 5);
        ctx.fillRect(cx + 4, by - 23, 4, 5);
        // Highlight in eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 7, by - 23, 2, 2);
        ctx.fillRect(cx + 4, by - 23, 2, 2);
        // Mouth
        if (mood === 'happy') {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 5, by - 15, 10, 2);
            ctx.fillRect(cx - 4, by - 14, 8, 2);
        } else {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 4, by - 15, 8, 2);
        }
        // Scarf/bandana
        ctx.fillStyle = '#e91e63';
        ctx.fillRect(cx - 14, by - 16, 28, 4);
        // Arms
        const armSwing = Math.sin(_petFrame * 0.3) * 5;
        ctx.fillStyle = '#5ab0e0';
        ctx.fillRect(cx - 22, by - 10 + armSwing, 8, 14);
        ctx.fillRect(cx + 14, by - 10 - armSwing, 8, 14);
        // Hands
        ctx.fillStyle = '#7ed4ff';
        ctx.fillRect(cx - 22, by + 2 + armSwing, 8, 5);
        ctx.fillRect(cx + 14, by + 2 - armSwing, 8, 5);
        // Legs
        ctx.fillStyle = '#4a80c0';
        ctx.fillRect(cx - 10, by + 12, 8, 12);
        ctx.fillRect(cx + 2, by + 12, 8, 12);
        // Shoes
        ctx.fillStyle = '#333';
        ctx.fillRect(cx - 12, by + 22, 10, 4);
        ctx.fillRect(cx + 2, by + 22, 10, 4);

    } else if (stage >= 4) {
        // Adult / Master — full size, detailed
        const by = cy + bounce - 18;
        const isMaster = stage >= 5;

        // Master glow aura
        if (isMaster) {
            ctx.fillStyle = `rgba(255,215,0,${0.05 + Math.sin(_petFrame * 0.2) * 0.03})`;
            ctx.fillRect(cx - 30, by - 40, 60, 70);
        }

        // Body
        ctx.fillStyle = isMaster ? '#80d8ff' : '#6ec6ff';
        ctx.fillRect(cx - 16, by - 18, 32, 32);
        ctx.fillRect(cx - 18, by - 14, 36, 24);
        // Head
        ctx.fillStyle = isMaster ? '#90e0ff' : '#7ed4ff';
        ctx.fillRect(cx - 14, by - 34, 28, 20);
        ctx.fillRect(cx - 16, by - 32, 32, 16);

        // Crown for master
        if (isMaster) {
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(cx - 10, by - 40, 20, 4);
            ctx.fillRect(cx - 10, by - 44, 4, 6);
            ctx.fillRect(cx - 2, by - 46, 4, 8);
            ctx.fillRect(cx + 6, by - 44, 4, 6);
            // Gem
            ctx.fillStyle = '#e91e63';
            ctx.fillRect(cx - 1, by - 42, 2, 2);
        }

        // Hair
        ctx.fillStyle = isMaster ? '#5090d0' : '#4a80c0';
        ctx.fillRect(cx - 12, by - 38, 4, 8);
        ctx.fillRect(cx - 5, by - 40, 4, 10);
        ctx.fillRect(cx + 2, by - 39, 4, 9);
        ctx.fillRect(cx + 8, by - 38, 4, 8);

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 10, by - 30, 8, 8);
        ctx.fillRect(cx + 2, by - 30, 8, 8);
        ctx.fillStyle = isMaster ? '#0a47a0' : '#1a1a2e';
        ctx.fillRect(cx - 8, by - 29, 5, 6);
        ctx.fillRect(cx + 4, by - 29, 5, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx - 8, by - 29, 2, 2);
        ctx.fillRect(cx + 4, by - 29, 2, 2);

        // Mouth
        if (mood === 'happy') {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 5, by - 20, 10, 2);
            ctx.fillRect(cx - 4, by - 19, 8, 2);
            ctx.fillRect(cx - 3, by - 18, 6, 1);
        } else if (mood === 'sad' || mood === 'hungry' || mood === 'dirty') {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 3, by - 18, 6, 1);
            ctx.fillRect(cx - 4, by - 19, 8, 1);
            ctx.fillRect(cx - 5, by - 20, 10, 1);
        } else {
            ctx.fillStyle = '#ff6b9d';
            ctx.fillRect(cx - 4, by - 20, 8, 2);
        }

        // Cape for master
        if (isMaster) {
            ctx.fillStyle = `rgba(160,0,255,${0.4 + Math.sin(_petFrame * 0.15) * 0.1})`;
            ctx.fillRect(cx - 18, by - 14, 4, 30);
            ctx.fillRect(cx + 14, by - 14, 4, 30);
            ctx.fillRect(cx - 20, by + 10, 40, 6);
        }

        // Arms
        const armSwing = Math.sin(_petFrame * 0.25) * 6;
        ctx.fillStyle = isMaster ? '#70c0e8' : '#5ab0e0';
        ctx.fillRect(cx - 24, by - 12 + armSwing, 8, 18);
        ctx.fillRect(cx + 16, by - 12 - armSwing, 8, 18);
        ctx.fillStyle = isMaster ? '#90e0ff' : '#7ed4ff';
        ctx.fillRect(cx - 24, by + 4 + armSwing, 8, 6);
        ctx.fillRect(cx + 16, by + 4 - armSwing, 8, 6);

        // Legs
        ctx.fillStyle = '#4a80c0';
        ctx.fillRect(cx - 12, by + 14, 10, 14);
        ctx.fillRect(cx + 2, by + 14, 10, 14);
        // Shoes
        ctx.fillStyle = isMaster ? '#444' : '#333';
        ctx.fillRect(cx - 14, by + 26, 12, 5);
        ctx.fillRect(cx + 2, by + 26, 12, 5);

        // Master particles
        if (isMaster && _petFrame % 8 < 4) {
            ctx.fillStyle = 'rgba(255,215,0,0.6)';
            const px1 = cx - 25 + Math.sin(_petFrame * 0.5) * 15;
            const py1 = by - 10 + Math.cos(_petFrame * 0.3) * 20;
            ctx.fillRect(px1, py1, 3, 3);
            const px2 = cx + 15 + Math.cos(_petFrame * 0.4) * 15;
            const py2 = by - 5 + Math.sin(_petFrame * 0.35) * 20;
            ctx.fillRect(px2, py2, 2, 2);
        }
    }

    // Mood indicator — floating emoji-style
    if (_petData.mood === 'hungry') {
        // Hunger bubble
        const bx = cx + 20, bby = cy - 30 + Math.sin(_petFrame * 0.2) * 3;
        ctx.fillStyle = 'rgba(30,30,40,0.8)';
        ctx.fillRect(bx, bby, 20, 16);
        ctx.fillStyle = '#ff9800';
        // drumstick icon
        ctx.fillRect(bx + 6, bby + 3, 8, 4);
        ctx.fillRect(bx + 4, bby + 5, 4, 6);
    } else if (_petData.mood === 'dirty') {
        // Stink lines
        ctx.strokeStyle = 'rgba(100,200,50,0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const sx = cx - 10 + i * 10;
            const sy = cy - 30 - (stage * 4);
            const wave = Math.sin(_petFrame * 0.3 + i) * 5;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + wave, sy - 10);
            ctx.lineTo(sx - wave, sy - 18);
            ctx.stroke();
        }
    } else if (_petData.mood === 'happy') {
        // Hearts
        if (_petFrame % 20 < 10) {
            ctx.fillStyle = 'rgba(255,100,150,0.7)';
            const hx = cx + 18 + Math.sin(_petFrame * 0.4) * 5;
            const hy = cy - 25 - (stage * 3) - (_petFrame % 20) * 1.5;
            ctx.fillRect(hx, hy, 3, 3);
            ctx.fillRect(hx + 4, hy, 3, 3);
            ctx.fillRect(hx + 1, hy + 2, 5, 3);
            ctx.fillRect(hx + 2, hy + 4, 3, 2);
        }
    }
}

function _drawClutter(ctx, W, H) {
    // Always draw active dust poofs even if no clutter remains
    _drawDustPoofs(ctx);

    if (!_petData || !_petData.clutter || _petData.clutter.length === 0) return;

    // Store clutter positions for click detection
    _petData._clutterHitboxes = [];

    const floorY = H * 0.65;
    const clutter = _petData.clutter;

    clutter.forEach((item, i) => {
        // Distribute across the floor
        const x = 30 + (i * 70) % (W - 80);
        const y = floorY + 20 + ((i * 37) % 60);

        if (item.type === 'cobweb') {
            // Cobweb — gray dusty blob
            ctx.fillStyle = 'rgba(150,150,160,0.4)';
            ctx.fillRect(x, y, 18, 14);
            ctx.fillRect(x + 2, y - 2, 14, 2);
            ctx.strokeStyle = 'rgba(150,150,160,0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 8); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 18, y); ctx.lineTo(x + 24, y - 6); ctx.stroke();
        } else if (item.type === 'papers') {
            // Stacked papers
            ctx.fillStyle = '#d4c8a0';
            ctx.fillRect(x + 2, y + 2, 16, 12);
            ctx.fillStyle = '#e8dcc0';
            ctx.fillRect(x, y, 16, 12);
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.strokeRect(x, y, 16, 12);
            // Lines on paper
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(x + 3, y + 3, 10, 1);
            ctx.fillRect(x + 3, y + 6, 8, 1);
            ctx.fillRect(x + 3, y + 9, 10, 1);
        } else if (item.type === 'dust') {
            // Dust bunny — fluffy gray ball with tiny eyes, hops around
            // Size 1=small, 2=medium, 3=large (grows every 30 min)
            const sz = item.size || 1;
            const scale = 0.7 + sz * 0.3;  // 1.0, 1.3, 1.6
            const bodyR = 8 * scale;
            const hopPhase = (_petFrame * 0.15 + i * 1.7) % (Math.PI * 2);
            const hopH = (10 - sz * 2) || 4;  // smaller bunnies hop higher
            const hopY = -Math.abs(Math.sin(hopPhase)) * hopH;
            const hopX = Math.sin(_petFrame * 0.08 + i * 3) * (4 - sz);  // big ones drift less
            const squish = hopY < -2 ? 0.85 : 1;
            const dx = x + 9 + hopX;
            const dy = y + 7 + hopY;

            ctx.save();
            ctx.translate(dx, dy);
            ctx.scale(1 / squish, squish);

            // Main body — gets darker/more opaque as it grows
            const bodyAlpha = 0.4 + sz * 0.1;
            ctx.fillStyle = `rgba(130,130,140,${bodyAlpha})`;
            ctx.beginPath();
            ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
            ctx.fill();
            // Fuzzy tufts
            ctx.fillStyle = `rgba(150,150,160,${0.2 + sz * 0.05})`;
            ctx.beginPath(); ctx.arc(-6 * scale, -3 * scale, 4 * scale, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(6 * scale, -2 * scale, 3 * scale, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(-1 * scale, -6 * scale, 3 * scale, 0, Math.PI * 2); ctx.fill();
            // Extra tuft for large bunnies
            if (sz >= 3) {
                ctx.beginPath(); ctx.arc(0, 5 * scale, 3.5 * scale, 0, Math.PI * 2); ctx.fill();
            }
            // Tiny eyes
            ctx.fillStyle = '#222';
            const eyeSize = 1.5 + sz * 0.5;
            ctx.fillRect(-3 * scale, -2 * scale, eyeSize, eyeSize);
            ctx.fillRect(2 * scale, -2 * scale, eyeSize, eyeSize);

            ctx.restore();

            // Landing shadow (bigger when higher up + scales with size)
            const shadowAlpha = 0.1 + Math.abs(hopY) * 0.015;
            const shadowW = (10 + Math.abs(hopY) * 0.5) * scale;
            ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
            ctx.beginPath();
            ctx.ellipse(x + 9 + hopX, y + 12, shadowW, 2 * scale, 0, 0, Math.PI * 2);
            ctx.fill();

            // Dust bunnies are clickable — hitbox scales with size
            const hitW = 24 * scale;
            const hitH = 24 * scale;
            _petData._clutterHitboxes.push({ x: dx - hitW / 2, y: dy - hitH / 2, w: hitW, h: hitH, id: item.id });
        }

        // Small X button (only for cobwebs and papers, not dust)
        if (item.type !== 'dust') {
            ctx.fillStyle = 'rgba(244,67,54,0.7)';
            ctx.fillRect(x + 14, y - 4, 8, 8);
            ctx.fillStyle = '#fff';
            ctx.font = '7px monospace';
            ctx.fillText('x', x + 16, y + 2);

            // Store hitbox
            _petData._clutterHitboxes.push({ x: x + 14, y: y - 4, w: 8, h: 8, id: item.id });
        }
    });
}

function _spawnDustPoof(x, y) {
    _dustPoofs.push({ x, y, frame: 0, maxFrames: 18 });
}

function _drawDustPoofs(ctx) {
    _dustPoofs = _dustPoofs.filter(p => p.frame < p.maxFrames);
    for (const p of _dustPoofs) {
        const progress = p.frame / p.maxFrames;  // 0 → 1
        const alpha = 1 - progress;
        const expand = 1 + progress * 2.5;

        // Multiple particles expanding outward
        for (let j = 0; j < 6; j++) {
            const angle = (j / 6) * Math.PI * 2 + p.frame * 0.1;
            const dist = progress * 16;
            const px = p.x + Math.cos(angle) * dist;
            const py = p.y + Math.sin(angle) * dist - progress * 8;  // float upward
            const size = (3 + Math.random()) * (1 - progress * 0.5);

            ctx.fillStyle = `rgba(160,155,145,${alpha * 0.6})`;
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Central poof cloud
        ctx.fillStyle = `rgba(180,175,165,${alpha * 0.4})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y - progress * 5, 8 * expand, 0, Math.PI * 2);
        ctx.fill();

        p.frame++;
    }
}

function _spawnPlayReaction() {
    if (!_petCanvas) return;
    const W = _petCanvas.width, H = _petCanvas.height;
    const cx = W / 2;
    const cy = H * 0.65 + 10;

    const emojiSets = [
        ['\u{2764}\u{FE0F}', '\u{1F496}', '\u{1F495}'],       // hearts
        ['\u{2B50}', '\u{1F31F}', '\u{2728}'],                 // stars
        ['\u{1F3BE}', '\u{26BD}', '\u{1F3B1}'],                // sports balls
        ['\u{1F389}', '\u{1F38A}', '\u{1FA85}'],               // party
        ['\u{1F60D}', '\u{1F970}', '\u{1F60E}'],               // faces
        ['\u{1F36D}', '\u{1F36A}', '\u{1F370}'],               // treats
        ['\u{1F3B5}', '\u{1F3B6}', '\u{1F3BC}'],               // music
        ['\u{1F308}', '\u{1F4AB}', '\u{1F525}'],               // effects
    ];
    const set = emojiSets[Math.floor(Math.random() * emojiSets.length)];

    // Spawn 5-7 emojis bursting from the pet
    const count = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
        const emoji = set[Math.floor(Math.random() * set.length)];
        const angle = (Math.random() * Math.PI) + Math.PI;  // upward arc (PI to 2PI)
        const speed = 1.5 + Math.random() * 2;
        _playEmojis.push({
            x: cx + (Math.random() - 0.5) * 20,
            y: cy - 10,
            emoji,
            frame: 0,
            maxFrames: 35 + Math.floor(Math.random() * 15),
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed - 1,  // bias upward
            size: 12 + Math.floor(Math.random() * 8),
            spin: (Math.random() - 0.5) * 0.15,
            rotation: 0,
        });
    }
}

function _drawPlayEmojis(ctx) {
    _playEmojis = _playEmojis.filter(e => e.frame < e.maxFrames);
    for (const e of _playEmojis) {
        const progress = e.frame / e.maxFrames;
        const alpha = progress < 0.2 ? progress / 0.2 : 1 - ((progress - 0.2) / 0.8);  // fade in then out

        e.x += e.dx;
        e.y += e.dy;
        e.dy += 0.04;  // gentle gravity
        e.rotation += e.spin;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rotation);
        ctx.font = `${e.size}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(e.emoji, 0, 0);
        ctx.restore();

        e.frame++;
    }
    ctx.globalAlpha = 1;  // reset
}

function _drawStatBars(ctx, W, H) {
    if (!_petData) return;

    const barW = 80, barH = 8, startX = W - barW - 20, startY = 15, gap = 18;
    const stats = [
        { label: 'HGR', value: _petData.hunger, color: _petData.hunger > 50 ? '#4caf50' : _petData.hunger > 25 ? '#ff9800' : '#f44336' },
        { label: 'HAP', value: _petData.happiness, color: _petData.happiness > 50 ? '#2196f3' : _petData.happiness > 25 ? '#ff9800' : '#f44336' },
        { label: 'CLN', value: _petData.cleanliness, color: _petData.cleanliness > 50 ? '#9c27b0' : _petData.cleanliness > 25 ? '#ff9800' : '#f44336' },
    ];

    // Dark backdrop behind stat bars
    const padX = 30, padY = 6;
    const boxX = startX - padX;
    const boxY = startY - padY;
    const boxW = barW + padX + 12;
    const boxH = stats.length * gap + padY;
    ctx.fillStyle = 'rgba(12, 14, 20, 0.75)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 65, 80, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.stroke();

    stats.forEach((s, i) => {
        const y = startY + i * gap;
        // Label
        ctx.fillStyle = '#aaa';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(s.label, startX - 6, y + 7);

        // Track
        ctx.fillStyle = '#1a1d26';
        ctx.fillRect(startX, y, barW, barH);
        ctx.strokeStyle = '#3a3e4a';
        ctx.lineWidth = 1;
        ctx.strokeRect(startX, y, barW, barH);

        // Fill
        const fillW = (s.value / 100) * (barW - 2);
        ctx.fillStyle = s.color;
        ctx.fillRect(startX + 1, y + 1, fillW, barH - 2);

        // Value text
        ctx.fillStyle = '#ddd';
        ctx.font = '7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s.value, startX + barW / 2, y + 7);
    });

    ctx.textAlign = 'left';  // reset
}

function _drawPetInfo(ctx, W, H) {
    if (!_petData) return;

    // Dark backdrop behind pet info
    const infoW = 180, infoH = 38;
    const infoX = (W - infoW) / 2;
    const infoY = H - infoH - 2;
    ctx.fillStyle = 'rgba(12, 14, 20, 0.75)';
    ctx.beginPath();
    ctx.roundRect(infoX, infoY, infoW, infoH, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 65, 80, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(infoX, infoY, infoW, infoH, 6);
    ctx.stroke();

    // Pet name + evolution
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(_petData.pet_name || 'Byte', W / 2, H - 30);

    // Evolution label
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    const evoNames = ['Egg', 'Baby', 'Child', 'Teen', 'Adult', 'Master'];
    ctx.fillText(`Lv.${_petData.level || 0} ${evoNames[_petData.evolution] || 'Egg'}`, W / 2, H - 16);

    // Today's stats
    ctx.fillStyle = '#777';
    ctx.font = '8px monospace';
    ctx.fillText(`${_petData.goals_today || 0} goals today \u00B7 ${_petData.today_xp || 0} XP`, W / 2, H - 4);

    ctx.textAlign = 'left';
}

async function _onPetCanvasClick(e) {
    if (!_petData || !_petData._clutterHitboxes) return;
    const rect = _petCanvas.getBoundingClientRect();
    const scaleX = _petCanvas.width / rect.width;
    const scaleY = _petCanvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const hb of _petData._clutterHitboxes) {
        if (mx >= hb.x && mx <= hb.x + hb.w && my >= hb.y && my <= hb.y + hb.h) {
            const scope = (_mc && _mc.selectedScope) || 'default';
            const isDust = typeof hb.id === 'string' && hb.id.startsWith('dust_');
            try {
                if (isDust) {
                    // Spawn dust poof at the bunny's center
                    _spawnDustPoof(hb.x + hb.w / 2, hb.y + hb.h / 2);
                    // Clean dust bunny
                    await fetch('/api/plugin/mission-control/pet/interact', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof CSRF === 'function' ? CSRF() : '' },
                        body: JSON.stringify({ action: 'clean_dust', dust_id: hb.id, scope })
                    });
                } else {
                    // Dismiss goal clutter
                    await fetch('/api/plugin/mission-control/pet/interact', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof CSRF === 'function' ? CSRF() : '' },
                        body: JSON.stringify({ action: 'dismiss_clutter', goal_id: hb.id, scope })
                    });
                }
                // Remove from local data
                _petData.clutter = _petData.clutter.filter(c => c.id !== hb.id);
                _petData._clutterHitboxes = _petData._clutterHitboxes.filter(h => h.id !== hb.id);
                // Bump cleanliness locally
                _petData.cleanliness = Math.min(100, _petData.cleanliness + (isDust ? 6 : 5));
            } catch (err) {
                console.error('[MC] Clutter dismiss failed:', err);
            }
            break;
        }
    }
}

async function _onPetPlay() {
    if (!_petData) return;
    const scope = (_mc && _mc.selectedScope) || 'default';
    const playBtn = document.getElementById('mc-pet-play-btn');

    try {
        const resp = await fetch('/api/plugin/mission-control/pet/interact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof CSRF === 'function' ? CSRF() : '' },
            body: JSON.stringify({ action: 'play', scope })
        });
        const data = await resp.json();

        if (data.success) {
            // Local happiness boost
            _petData.happiness = Math.min(100, _petData.happiness + 5);
            _petData.plays_today = data.plays_today;
            // Burst of emojis from the pet
            _spawnPlayReaction();
            // Flash the button green briefly
            if (playBtn) {
                playBtn.style.background = 'rgba(76,175,80,0.3)';
                setTimeout(() => { playBtn.style.background = ''; }, 600);
            }
        } else if (data.message) {
            // Maxed out — flash amber
            if (playBtn) {
                playBtn.style.background = 'rgba(255,193,7,0.3)';
                playBtn.title = data.message;
                setTimeout(() => { playBtn.style.background = ''; }, 600);
            }
        }
        _updatePlayCount();
    } catch (err) {
        console.error('[MC] Pet play failed:', err);
    }
}

function _updatePlayCount() {
    const el = document.getElementById('mc-pet-play-count');
    if (!el || !_petData) return;
    const plays = _petData.plays_today || 0;
    const max = _petData.max_plays || 5;
    el.textContent = `${plays}/${max}`;
    el.style.color = plays >= max ? '#ff9800' : '#888';
}
