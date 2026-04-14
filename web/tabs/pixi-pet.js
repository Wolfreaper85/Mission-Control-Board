// pixi-pet.js — PixiJS-powered Pixel Pet Engine for Mission Control
// Replaces procedural Canvas/WebGL renderer with a rich, animated pet experience
// Features: behavior AI, eye tracking, weather, particles, dream bubbles, petting

/* ══════════════════════════════════════════════════════════════════
   Section 1: PixiJS CDN Loader
   ══════════════════════════════════════════════════════════════════ */

const PIXI_CDN = 'https://cdn.jsdelivr.net/npm/pixi.js@7.3.3/dist/pixi.min.js';
let _pixiReady = false;

async function _loadPixi() {
    if (window.PIXI) { _pixiReady = true; return; }
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PIXI_CDN;
        s.onload = () => { _pixiReady = true; resolve(); };
        s.onerror = () => reject(new Error('Failed to load PixiJS'));
        document.head.appendChild(s);
    });
}

/* ══════════════════════════════════════════════════════════════════
   Section 2: Constants & Palettes
   ══════════════════════════════════════════════════════════════════ */

const W = 480, H = 400;
const PX = 3;  // pixel scale factor
const FLOOR_Y = 0.72;  // floor line (normalized)
const PET_BASE_Y = H * FLOOR_Y - 10;

const PAL = {
    body:      { hi: '#90e0ff', mid: '#6ec6ff', sh: '#4a90c0', dk: '#2a5a80' },
    master:    { hi: '#b0f0ff', mid: '#80d8ff', sh: '#50a0d0', dk: '#3070a0' },
    skin:      { white: '#ffffff', pupil: '#1a1a2e', blush: '#ff8fab', mouth: '#ff6b9d' },
    crown:     { gold: '#ffd700', mid: '#ffb700', dk: '#cc8800', gem: '#e91e63' },
    cape:      { hi: '#c060ff', mid: '#a000ff', dk: '#7000cc' },
    scarf:     { hi: '#ff4081', mid: '#e91e63', dk: '#c0164e' },
    hair:      { hi: '#5090d0', mid: '#4a80c0', dk: '#365e8a' },
    shoe:      { mid: '#3a3a4a', dk: '#2a2a35' },
    egg:       { hi: '#f0e8d8', mid: '#e8e0d0', sh: '#d4c8b0', spot: '#c8b898' },
    room:      { wall: '#1e1c28', wallLt: '#2a2533', floor: '#3a2e24', floorLt: '#4a3e34',
                 baseboard: '#1a1520', trim: '#2e2838' },
    dust:      { body: '#828290', tuft: '#9696a0', eye: '#222' },
    paper:     { bg: '#e8dcc0', shadow: '#d4c8a0', line: 'rgba(0,0,0,0.15)' },
};

const WEATHERS = ['clear', 'cloudy', 'rain', 'snow'];
const DREAM_ICONS = ['💡', '⭐', '🎮', '🍕', '🎵', '🌈', '🚀', '🐱', '🎯', '📚', '🏆', '🌙'];
const PLAY_EMOJI_SETS = [
    ['❤️','💖','💕'], ['⭐','🌟','✨'], ['🎾','⚽','🎱'],
    ['🎉','🎊','🪅'], ['😍','🥰','😎'], ['🍬','🍪','🍰'],
    ['🎵','🎶','🎼'], ['🌈','💫','🔥'],
];

const BEHAVIOR = {
    IDLE: 'idle', WALK: 'walk', SIT: 'sit', SLEEP: 'sleep',
    PLAY: 'play', STARTLED: 'startled', CELEBRATE: 'celebrate', EAT: 'eat',
};

/* ══════════════════════════════════════════════════════════════════
   Section 3: Texture Factory
   ══════════════════════════════════════════════════════════════════ */

function _tex(w, h, drawFn) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    drawFn(ctx, w, h);
    const tex = PIXI.Texture.from(cv);
    tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    return tex;
}

function _px(ctx, x, y, c, w = 1, h = 1) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function _oval(ctx, cx, cy, rx, ry, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(Math.round(cx), Math.round(cy), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
}

function _roundBody(ctx, x, y, w, h, colors) {
    // Pixel art rounded rectangle with highlight/shadow
    const { hi, mid, sh } = colors;
    for (let row = 0; row < h; row++) {
        const indent = row === 0 || row === h - 1 ? 2 : (row === 1 || row === h - 2 ? 1 : 0);
        const c = row < 2 ? hi : (row >= h - 2 ? sh : mid);
        _px(ctx, x + indent, y + row, c, w - indent * 2);
    }
}

/* ── Egg Textures ─────────────────────────────────────────────── */

function _makeEgg() {
    return _tex(12, 16, (ctx) => {
        // Egg body
        _roundBody(ctx, 1, 0, 10, 16, PAL.egg);
        // Spots
        _px(ctx, 3, 3, PAL.egg.spot, 3, 2);
        _px(ctx, 7, 7, PAL.egg.spot, 2, 2);
        _px(ctx, 4, 11, PAL.egg.spot, 2, 2);
    });
}

function _makeEggCracked() {
    return _tex(12, 16, (ctx) => {
        _roundBody(ctx, 1, 0, 10, 16, PAL.egg);
        _px(ctx, 3, 3, PAL.egg.spot, 3, 2);
        _px(ctx, 7, 7, PAL.egg.spot, 2, 2);
        // Crack lines
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(5, 6); ctx.lineTo(7, 8); ctx.lineTo(5, 10);
        ctx.stroke();
    });
}

/* ── Baby Textures ────────────────────────────────────────────── */

function _makeBabyBody() {
    return _tex(16, 14, (ctx) => {
        // Round body
        _oval(ctx, 8, 7, 7, 6, PAL.body.mid);
        _oval(ctx, 8, 5, 6, 4, PAL.body.hi);
        // Cheek blush
        _px(ctx, 2, 7, PAL.skin.blush, 2, 1);
        _px(ctx, 12, 7, PAL.skin.blush, 2, 1);
        // Feet
        _px(ctx, 3, 12, PAL.body.sh, 3, 2);
        _px(ctx, 10, 12, PAL.body.sh, 3, 2);
    });
}

/* ── Child Textures ───────────────────────────────────────────── */

function _makeChildBody() {
    return _tex(20, 26, (ctx) => {
        // Head
        _roundBody(ctx, 4, 0, 12, 10, { hi: PAL.body.hi, mid: PAL.body.hi, sh: PAL.body.mid });
        // Body
        _roundBody(ctx, 3, 9, 14, 10, PAL.body);
        // Arms
        _px(ctx, 0, 10, PAL.body.sh, 3, 8);
        _px(ctx, 17, 10, PAL.body.sh, 3, 8);
        // Legs
        _px(ctx, 5, 19, PAL.body.sh, 4, 5);
        _px(ctx, 11, 19, PAL.body.sh, 4, 5);
        // Shoes
        _px(ctx, 4, 23, PAL.shoe.mid, 5, 3);
        _px(ctx, 11, 23, PAL.shoe.mid, 5, 3);
    });
}

/* ── Teen Textures ────────────────────────────────────────────── */

function _makeTeenBody() {
    return _tex(24, 32, (ctx) => {
        // Hair spikes
        _px(ctx, 6, 0, PAL.hair.mid, 3, 4);
        _px(ctx, 10, 0, PAL.hair.mid, 3, 5);
        _px(ctx, 14, 0, PAL.hair.mid, 3, 4);
        // Head
        _roundBody(ctx, 5, 3, 14, 12, { hi: PAL.body.hi, mid: PAL.body.hi, sh: PAL.body.mid });
        // Scarf
        _px(ctx, 4, 14, PAL.scarf.mid, 16, 3);
        _px(ctx, 16, 15, PAL.scarf.dk, 5, 4); // trailing end
        // Body
        _roundBody(ctx, 4, 16, 16, 10, PAL.body);
        // Arms
        _px(ctx, 0, 17, PAL.body.sh, 4, 10);
        _px(ctx, 20, 17, PAL.body.sh, 4, 10);
        // Hands
        _px(ctx, 0, 26, PAL.body.hi, 4, 3);
        _px(ctx, 20, 26, PAL.body.hi, 4, 3);
        // Legs
        _px(ctx, 6, 26, PAL.hair.dk, 5, 8);
        _px(ctx, 13, 26, PAL.hair.dk, 5, 8);
        // Shoes
        _px(ctx, 5, 30, PAL.shoe.dk, 6, 2);
        _px(ctx, 13, 30, PAL.shoe.dk, 6, 2);
    });
}

/* ── Adult Textures ───────────────────────────────────────────── */

function _makeAdultBody() {
    return _tex(28, 38, (ctx) => {
        // Hair
        _px(ctx, 7, 0, PAL.hair.mid, 3, 5);
        _px(ctx, 11, 0, PAL.hair.mid, 3, 6);
        _px(ctx, 15, 0, PAL.hair.mid, 3, 5);
        _px(ctx, 19, 0, PAL.hair.mid, 3, 4);
        // Head
        _roundBody(ctx, 5, 4, 18, 14, { hi: PAL.body.hi, mid: PAL.body.hi, sh: PAL.body.mid });
        // Body
        _roundBody(ctx, 4, 17, 20, 14, PAL.body);
        // Arms
        _px(ctx, 0, 18, PAL.body.sh, 4, 12);
        _px(ctx, 24, 18, PAL.body.sh, 4, 12);
        _px(ctx, 0, 29, PAL.body.hi, 4, 3);
        _px(ctx, 24, 29, PAL.body.hi, 4, 3);
        // Legs
        _px(ctx, 7, 31, PAL.hair.dk, 6, 10);
        _px(ctx, 15, 31, PAL.hair.dk, 6, 10);
        // Shoes
        _px(ctx, 6, 36, PAL.shoe.dk, 7, 2);
        _px(ctx, 15, 36, PAL.shoe.dk, 7, 2);
    });
}

/* ── Master Textures ──────────────────────────────────────────── */

function _makeMasterBody() {
    return _tex(32, 42, (ctx) => {
        // Crown
        _px(ctx, 10, 0, PAL.crown.gold, 12, 3);
        _px(ctx, 10, 0, PAL.crown.gold, 3, 5);
        _px(ctx, 15, 0, PAL.crown.gold, 3, 6);
        _px(ctx, 20, 0, PAL.crown.gold, 3, 5);
        _px(ctx, 16, 1, PAL.crown.gem, 2, 2);
        // Hair
        _px(ctx, 8, 5, PAL.hair.hi, 3, 5);
        _px(ctx, 12, 4, PAL.hair.hi, 3, 6);
        _px(ctx, 17, 4, PAL.hair.hi, 3, 6);
        _px(ctx, 21, 5, PAL.hair.hi, 3, 5);
        // Head
        _roundBody(ctx, 6, 7, 20, 14, { hi: PAL.master.hi, mid: PAL.master.mid, sh: PAL.master.sh });
        // Body
        _roundBody(ctx, 5, 20, 22, 14, PAL.master);
        // Cape sides
        ctx.fillStyle = PAL.cape.mid;
        ctx.globalAlpha = 0.7;
        _px(ctx, 2, 20, PAL.cape.mid, 4, 18);
        _px(ctx, 26, 20, PAL.cape.mid, 4, 18);
        _px(ctx, 3, 36, PAL.cape.dk, 26, 4);
        ctx.globalAlpha = 1.0;
        // Arms
        _px(ctx, 1, 21, PAL.master.sh, 5, 12);
        _px(ctx, 26, 21, PAL.master.sh, 5, 12);
        _px(ctx, 1, 32, PAL.master.hi, 5, 3);
        _px(ctx, 26, 32, PAL.master.hi, 5, 3);
        // Legs
        _px(ctx, 9, 34, PAL.hair.dk, 6, 10);
        _px(ctx, 17, 34, PAL.hair.dk, 6, 10);
        // Shoes
        _px(ctx, 8, 40, PAL.shoe.dk, 7, 2);
        _px(ctx, 17, 40, PAL.shoe.dk, 7, 2);
    });
}

/* ── Eyes & Mouth (shared across stages) ──────────────────────── */

function _makeEyes(w, h, pupilSize, open = true) {
    return _tex(w, h, (ctx) => {
        const hw = Math.floor(w / 2);
        const eyeW = Math.max(3, Math.floor(w * 0.3));
        const eyeH = open ? eyeW : 1;
        const gap = Math.max(1, Math.floor(w * 0.08));
        const lx = hw - eyeW - gap;
        const rx = hw + gap;
        const ey = Math.floor((h - eyeH) / 2);
        // White
        _px(ctx, lx, ey, PAL.skin.white, eyeW, eyeH);
        _px(ctx, rx, ey, PAL.skin.white, eyeW, eyeH);
        if (open) {
            // Pupil (centered)
            const px = Math.floor((eyeW - pupilSize) / 2);
            const py = Math.floor((eyeH - pupilSize) / 2);
            _px(ctx, lx + px, ey + py, PAL.skin.pupil, pupilSize, pupilSize);
            _px(ctx, rx + px, ey + py, PAL.skin.pupil, pupilSize, pupilSize);
            // Highlight
            if (pupilSize >= 2) {
                _px(ctx, lx + px, ey + py, PAL.skin.white, 1, 1);
                _px(ctx, rx + px, ey + py, PAL.skin.white, 1, 1);
            }
        } else {
            // Closed eyes — line
            _px(ctx, lx, ey, PAL.skin.pupil, eyeW, 1);
            _px(ctx, rx, ey, PAL.skin.pupil, eyeW, 1);
        }
    });
}

function _makeMouth(w, h, mood) {
    return _tex(w, h, (ctx) => {
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);
        if (mood === 'happy') {
            _px(ctx, cx - 3, cy - 1, PAL.skin.mouth, 6, 1);
            _px(ctx, cx - 2, cy, PAL.skin.mouth, 4, 1);
        } else if (mood === 'sad' || mood === 'hungry') {
            _px(ctx, cx - 2, cy, PAL.skin.mouth, 4, 1);
            _px(ctx, cx - 3, cy - 1, PAL.skin.mouth, 6, 1);
        } else {
            _px(ctx, cx - 2, cy, PAL.skin.mouth, 4, 1);
        }
    });
}

/* ── Room Background ──────────────────────────────────────────── */

function _makeRoomBg(tod, weather, evo) {
    return _tex(W, H, (ctx) => {
        // Sky colors by time of day
        const skies = {
            morning:   { top: '#4a7fb5', bot: '#89b4d6', sun: '#ffe066' },
            afternoon: { top: '#3a8fd4', bot: '#6db8e8', sun: '#fff5cc' },
            evening:   { top: '#d45a2a', bot: '#f5a060', sun: '#ff7733' },
            night:     { top: '#0a0e1a', bot: '#151b2e', sun: null },
        };
        const sky = skies[tod] || skies.afternoon;

        // Wall background
        const grad = ctx.createLinearGradient(0, 0, 0, H * FLOOR_Y);
        grad.addColorStop(0, PAL.room.wallLt);
        grad.addColorStop(1, PAL.room.wall);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H * FLOOR_Y);

        // Wood paneling hint (horizontal lines)
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        for (let y = 20; y < H * FLOOR_Y; y += 12) {
            ctx.fillRect(0, y, W, 1);
        }

        // Floor
        const floorGrad = ctx.createLinearGradient(0, H * FLOOR_Y, 0, H);
        floorGrad.addColorStop(0, PAL.room.floorLt);
        floorGrad.addColorStop(1, PAL.room.floor);
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, H * FLOOR_Y, W, H * (1 - FLOOR_Y));

        // Floorboards
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        for (let y = H * FLOOR_Y + 15; y < H; y += 15) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        // Baseboard
        ctx.fillStyle = PAL.room.baseboard;
        ctx.fillRect(0, H * FLOOR_Y - 2, W, 6);
        ctx.fillStyle = PAL.room.trim;
        ctx.fillRect(0, H * FLOOR_Y - 3, W, 2);

        // ── Window ──
        const wx = W * 0.72, wy = 30, ww = 80, wh = 100;
        // Sky through window
        const skyGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        skyGrad.addColorStop(0, sky.top);
        skyGrad.addColorStop(1, sky.bot);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(wx + 4, wy + 4, ww - 8, wh - 8);

        // Sun/Moon
        if (sky.sun) {
            ctx.fillStyle = sky.sun;
            ctx.beginPath();
            ctx.arc(wx + ww * 0.6, wy + 25, 10, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Moon
            ctx.fillStyle = '#c8cce0';
            ctx.beginPath();
            ctx.arc(wx + ww * 0.6, wy + 25, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = sky.top;
            ctx.beginPath();
            ctx.arc(wx + ww * 0.6 + 3, wy + 23, 7, 0, Math.PI * 2);
            ctx.fill();
            // Stars
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 8; i++) {
                const sx = wx + 8 + (i * 11) % (ww - 16);
                const sy = wy + 8 + (i * 7 + 3) % (wh - 20);
                ctx.fillRect(sx, sy, 1, 1);
            }
        }

        // Clouds (not at night)
        if (tod !== 'night') {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.beginPath();
            ctx.ellipse(wx + 20, wy + 40, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            if (weather === 'cloudy' || weather === 'rain' || weather === 'snow') {
                ctx.fillStyle = 'rgba(180,180,200,0.5)';
                ctx.beginPath();
                ctx.ellipse(wx + 45, wy + 35, 18, 7, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(wx + 30, wy + 50, 16, 5, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Window frame
        ctx.strokeStyle = '#5a5060';
        ctx.lineWidth = 4;
        ctx.strokeRect(wx, wy, ww, wh);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(wx + ww / 2, wy);
        ctx.lineTo(wx + ww / 2, wy + wh);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh / 2);
        ctx.lineTo(wx + ww, wy + wh / 2);
        ctx.stroke();

        // ── Window light on wall ──
        if (tod === 'morning' || tod === 'afternoon') {
            ctx.fillStyle = 'rgba(255,240,200,0.04)';
            ctx.beginPath();
            ctx.moveTo(wx - 20, wy + wh);
            ctx.lineTo(wx - 60, H * FLOOR_Y);
            ctx.lineTo(wx + ww + 60, H * FLOOR_Y);
            ctx.lineTo(wx + ww + 20, wy + wh);
            ctx.closePath();
            ctx.fill();
        }

        // ── Shelf ──
        const shelfY = H * 0.38;
        ctx.fillStyle = '#4a3828';
        ctx.fillRect(20, shelfY, 180, 5);
        ctx.fillStyle = '#3a2818';
        ctx.fillRect(20, shelfY + 5, 180, 2);

        // Shelf items based on evolution
        if (evo >= 1) {
            // Small plant
            ctx.fillStyle = '#3a7a3a';
            ctx.fillRect(160, shelfY - 12, 4, 12);
            ctx.fillStyle = '#4a9a4a';
            ctx.beginPath();
            ctx.arc(162, shelfY - 14, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#6a4a30';
            ctx.fillRect(157, shelfY - 5, 10, 5);
        }
        if (evo >= 2) {
            // Books
            ctx.fillStyle = '#c44040'; ctx.fillRect(30, shelfY - 16, 5, 16);
            ctx.fillStyle = '#4060c0'; ctx.fillRect(36, shelfY - 14, 5, 14);
            ctx.fillStyle = '#40a060'; ctx.fillRect(42, shelfY - 18, 5, 18);
            ctx.fillStyle = '#c0a040'; ctx.fillRect(48, shelfY - 12, 5, 12);
        }
        if (evo >= 3) {
            // Trophy
            ctx.fillStyle = '#c8a020';
            ctx.fillRect(102, shelfY - 4, 8, 4);
            ctx.fillRect(104, shelfY - 12, 4, 8);
            ctx.fillRect(100, shelfY - 14, 12, 3);
            ctx.fillRect(98, shelfY - 14, 3, 5);
            ctx.fillRect(111, shelfY - 14, 3, 5);
        }
        if (evo >= 4) {
            // Photo frame
            ctx.fillStyle = '#6a5a4a';
            ctx.strokeStyle = '#5a4a3a';
            ctx.lineWidth = 2;
            ctx.strokeRect(72, shelfY - 18, 16, 14);
            ctx.fillStyle = '#8aaabe';
            ctx.fillRect(74, shelfY - 16, 12, 10);
        }

        // ── Food & Water bowls ──
        const bowlY = H * FLOOR_Y + 25;
        // Food bowl
        ctx.fillStyle = '#a04040';
        ctx.beginPath();
        ctx.ellipse(80, bowlY, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c05050';
        ctx.beginPath();
        ctx.ellipse(80, bowlY - 2, 12, 4, 0, 0, Math.PI);
        ctx.fill();
        // Water bowl
        ctx.fillStyle = '#4060a0';
        ctx.beginPath();
        ctx.ellipse(120, bowlY, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5080c0';
        ctx.beginPath();
        ctx.ellipse(120, bowlY - 2, 10, 4, 0, 0, Math.PI);
        ctx.fill();

        // ── Rug ──
        if (evo >= 2) {
            const rugColors = { morning: '#5a3a4a', afternoon: '#4a3a5a', evening: '#5a4a3a', night: '#3a3a4a' };
            ctx.fillStyle = rugColors[tod] || '#4a3a5a';
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.ellipse(W / 2, H * 0.82, 80, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // ── Master room decorations ──
        if (evo >= 5) {
            // Glowing runes on wall
            ctx.fillStyle = 'rgba(160,0,255,0.08)';
            ctx.font = '16px serif';
            ctx.textAlign = 'center';
            ctx.fillText('✦', 40, 80);
            ctx.fillText('✧', W - 40, 60);
            ctx.fillText('✦', 60, 180);
        }
    });
}

/* ══════════════════════════════════════════════════════════════════
   Section 4: Behavior State Machine
   ══════════════════════════════════════════════════════════════════ */

class BehaviorAI {
    constructor() {
        this.state = BEHAVIOR.IDLE;
        this.timer = 0;
        this.duration = 0;
        this.walkDir = 1;
        this.walkTarget = 0;
        this.prevState = BEHAVIOR.IDLE;
    }

    enter(state, duration = 0) {
        this.prevState = this.state;
        this.state = state;
        this.timer = 0;
        this.duration = duration || this._defaultDuration(state);
    }

    _defaultDuration(state) {
        switch (state) {
            case BEHAVIOR.IDLE:      return 300 + Math.random() * 400;
            case BEHAVIOR.WALK:      return 150 + Math.random() * 200;
            case BEHAVIOR.SIT:       return 400 + Math.random() * 600;
            case BEHAVIOR.SLEEP:     return 1000 + Math.random() * 2000;
            case BEHAVIOR.PLAY:      return 120;
            case BEHAVIOR.STARTLED:  return 40;
            case BEHAVIOR.CELEBRATE: return 180;
            case BEHAVIOR.EAT:       return 100;
            default: return 300;
        }
    }

    update(tod, mood) {
        this.timer++;
        if (this.timer < this.duration) return;

        // Transition logic
        if (this.state === BEHAVIOR.STARTLED || this.state === BEHAVIOR.CELEBRATE ||
            this.state === BEHAVIOR.PLAY || this.state === BEHAVIOR.EAT) {
            this.enter(BEHAVIOR.IDLE);
            return;
        }

        const r = Math.random();
        const isNight = tod === 'night';
        const isEvening = tod === 'evening';

        if (this.state === BEHAVIOR.SLEEP) {
            if (!isNight) this.enter(BEHAVIOR.IDLE);
            else this.duration += 500;  // keep sleeping
            return;
        }

        if (this.state === BEHAVIOR.SIT) {
            if (isNight && r < 0.4) this.enter(BEHAVIOR.SLEEP);
            else if (r < 0.3) this.enter(BEHAVIOR.WALK);
            else this.enter(BEHAVIOR.IDLE);
            return;
        }

        if (this.state === BEHAVIOR.WALK) {
            if (r < 0.3) this.enter(BEHAVIOR.SIT);
            else this.enter(BEHAVIOR.IDLE);
            return;
        }

        // IDLE transitions
        if (isNight && r < 0.3) {
            this.enter(BEHAVIOR.SLEEP);
        } else if (isEvening && r < 0.2) {
            this.enter(BEHAVIOR.SIT);
        } else if (r < 0.35) {
            this.walkDir = Math.random() < 0.5 ? -1 : 1;
            this.walkTarget = W * (0.2 + Math.random() * 0.6);
            this.enter(BEHAVIOR.WALK);
        } else if (r < 0.5) {
            this.enter(BEHAVIOR.SIT);
        } else {
            this.enter(BEHAVIOR.IDLE);
        }
    }
}

/* ══════════════════════════════════════════════════════════════════
   Section 5: Particle Pool
   ══════════════════════════════════════════════════════════════════ */

class ParticlePool {
    constructor(container, max = 200) {
        this._container = container;
        this._pool = [];
        this._active = [];
        this._max = max;
    }

    spawn(x, y, vx, vy, color, size, life, opts = {}) {
        if (this._active.length >= this._max) return;

        let p;
        if (this._pool.length > 0) {
            p = this._pool.pop();
        } else {
            p = { gfx: new PIXI.Graphics() };
            this._container.addChild(p.gfx);
        }

        p.x = x; p.y = y; p.vx = vx; p.vy = vy;
        p.color = color; p.size = size;
        p.life = life; p.maxLife = life;
        p.gravity = opts.gravity || 0;
        p.fadeIn = opts.fadeIn || false;
        p.spin = opts.spin || 0;
        p.shape = opts.shape || 'circle';  // 'circle', 'square', 'star'
        p.gfx.visible = true;
        p.gfx.alpha = p.fadeIn ? 0 : 1;
        this._active.push(p);
        return p;
    }

    update() {
        for (let i = this._active.length - 1; i >= 0; i--) {
            const p = this._active[i];
            p.life--;
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.99;

            const progress = 1 - p.life / p.maxLife;
            let alpha;
            if (p.fadeIn && progress < 0.2) alpha = progress / 0.2;
            else alpha = Math.max(0, 1 - progress * progress);

            p.gfx.clear();
            p.gfx.beginFill(p.color, alpha);
            const s = p.size * (0.5 + 0.5 * (p.life / p.maxLife));
            if (p.shape === 'square') {
                p.gfx.drawRect(-s / 2, -s / 2, s, s);
            } else {
                p.gfx.drawCircle(0, 0, s);
            }
            p.gfx.endFill();
            p.gfx.x = p.x;
            p.gfx.y = p.y;
            p.gfx.rotation += p.spin;

            if (p.life <= 0) {
                p.gfx.visible = false;
                this._active.splice(i, 1);
                this._pool.push(p);
            }
        }
    }

    clear() {
        for (const p of this._active) {
            p.gfx.visible = false;
            this._pool.push(p);
        }
        this._active.length = 0;
    }

    destroy() {
        for (const p of [...this._active, ...this._pool]) {
            p.gfx.destroy();
        }
        this._active.length = 0;
        this._pool.length = 0;
    }
}

/* ══════════════════════════════════════════════════════════════════
   Section 6: Emoji Burst (Play Reactions)
   ══════════════════════════════════════════════════════════════════ */

class EmojiBurst {
    constructor(container) {
        this._container = container;
        this._emojis = [];
    }

    fire(x, y) {
        const set = PLAY_EMOJI_SETS[Math.floor(Math.random() * PLAY_EMOJI_SETS.length)];
        const count = 5 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
            const emoji = set[Math.floor(Math.random() * set.length)];
            const angle = Math.PI + Math.random() * Math.PI;
            const speed = 1.5 + Math.random() * 2.5;
            const txt = new PIXI.Text(emoji, { fontSize: 14 + Math.floor(Math.random() * 8) });
            txt.anchor.set(0.5);
            txt.x = x + (Math.random() - 0.5) * 20;
            txt.y = y;
            this._container.addChild(txt);
            this._emojis.push({
                txt, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.5,
                life: 45 + Math.floor(Math.random() * 15), maxLife: 60,
                spin: (Math.random() - 0.5) * 0.1,
            });
        }
    }

    update() {
        for (let i = this._emojis.length - 1; i >= 0; i--) {
            const e = this._emojis[i];
            e.life--;
            e.txt.x += e.vx;
            e.txt.y += e.vy;
            e.vy += 0.04;
            e.txt.rotation += e.spin;
            const p = 1 - e.life / e.maxLife;
            e.txt.alpha = p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85);
            if (e.life <= 0) {
                this._container.removeChild(e.txt);
                e.txt.destroy();
                this._emojis.splice(i, 1);
            }
        }
    }

    destroy() {
        for (const e of this._emojis) { e.txt.destroy(); }
        this._emojis.length = 0;
    }
}

/* ══════════════════════════════════════════════════════════════════
   Section 7: Dream Bubbles
   ══════════════════════════════════════════════════════════════════ */

class DreamBubble {
    constructor(container) {
        this._container = container;
        this._bubble = null;
        this._icon = null;
        this._timer = 0;
        this._visible = false;
    }

    show(x, y) {
        if (!this._bubble) {
            this._bubble = new PIXI.Graphics();
            this._container.addChild(this._bubble);
            this._icon = new PIXI.Text('', { fontSize: 14 });
            this._icon.anchor.set(0.5);
            this._container.addChild(this._icon);
        }
        this._visible = true;
        this._timer = 0;
        this._baseX = x;
        this._baseY = y;
        this._changeIcon();
    }

    hide() {
        this._visible = false;
        if (this._bubble) this._bubble.visible = false;
        if (this._icon) this._icon.visible = false;
    }

    _changeIcon() {
        if (this._icon) {
            this._icon.text = DREAM_ICONS[Math.floor(Math.random() * DREAM_ICONS.length)];
        }
    }

    update() {
        if (!this._visible || !this._bubble) return;
        this._timer++;

        // Change dream icon periodically
        if (this._timer % 120 === 0) this._changeIcon();

        const float = Math.sin(this._timer * 0.03) * 3;
        const pulse = 1 + Math.sin(this._timer * 0.05) * 0.05;
        const bx = this._baseX + 20;
        const by = this._baseY - 35 + float;

        // Draw thought bubble
        this._bubble.clear();
        this._bubble.beginFill(0xffffff, 0.85);
        this._bubble.drawRoundedRect(bx - 16, by - 12, 32, 24, 8);
        this._bubble.endFill();
        // Small circles leading to pet
        this._bubble.beginFill(0xffffff, 0.6);
        this._bubble.drawCircle(bx - 10, by + 16, 4);
        this._bubble.endFill();
        this._bubble.beginFill(0xffffff, 0.4);
        this._bubble.drawCircle(bx - 6, by + 22, 2);
        this._bubble.endFill();
        this._bubble.visible = true;
        this._bubble.scale.set(pulse);

        this._icon.x = bx;
        this._icon.y = by;
        this._icon.visible = true;
    }

    destroy() {
        if (this._bubble) this._bubble.destroy();
        if (this._icon) this._icon.destroy();
    }
}

/* ══════════════════════════════════════════════════════════════════
   Section 8: Dust Bunny Sprites
   ══════════════════════════════════════════════════════════════════ */

class DustBunnyManager {
    constructor(container, onClean) {
        this._container = container;
        this._bunnies = [];
        this._onClean = onClean;  // callback(id)
    }

    sync(clutterList) {
        const dustItems = (clutterList || []).filter(c => c.type === 'dust');
        const existingIds = new Set(this._bunnies.map(b => b.id));
        const newIds = new Set(dustItems.map(d => d.id));

        // Remove old
        this._bunnies = this._bunnies.filter(b => {
            if (!newIds.has(b.id)) {
                this._container.removeChild(b.sprite);
                b.sprite.destroy();
                return false;
            }
            return true;
        });

        // Add new
        for (const item of dustItems) {
            if (existingIds.has(item.id)) continue;
            const sz = item.size || 1;
            const scale = 0.7 + sz * 0.3;
            const baseR = 8 * scale;

            const gfx = new PIXI.Graphics();
            // Main body
            gfx.beginFill(0x828290, 0.4 + sz * 0.1);
            gfx.drawCircle(0, 0, baseR);
            gfx.endFill();
            // Tufts
            gfx.beginFill(0x9696a0, 0.2 + sz * 0.05);
            gfx.drawCircle(-5 * scale, -3 * scale, 4 * scale);
            gfx.drawCircle(5 * scale, -2 * scale, 3 * scale);
            gfx.drawCircle(0, -5 * scale, 3 * scale);
            gfx.endFill();
            // Eyes
            gfx.beginFill(0x222222);
            const eyeS = 1.5 + sz * 0.5;
            gfx.drawRect(-3 * scale, -2 * scale, eyeS, eyeS);
            gfx.drawRect(2 * scale, -2 * scale, eyeS, eyeS);
            gfx.endFill();

            gfx.eventMode = 'static';
            gfx.cursor = 'pointer';
            const id = item.id;
            gfx.on('pointerdown', () => this._cleanDust(id));

            this._container.addChild(gfx);
            this._bunnies.push({
                id: item.id, sprite: gfx, size: sz, scale,
                baseX: 60 + (this._bunnies.length * 55) % (W - 120),
                baseY: H * FLOOR_Y + 30 + ((this._bunnies.length * 23) % 40),
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    _cleanDust(id) {
        const idx = this._bunnies.findIndex(b => b.id === id);
        if (idx < 0) return;
        const bunny = this._bunnies[idx];

        // Poof animation — spawn particles at bunny location
        if (this._onClean) this._onClean(id, bunny.sprite.x, bunny.sprite.y);

        this._container.removeChild(bunny.sprite);
        bunny.sprite.destroy();
        this._bunnies.splice(idx, 1);
    }

    update(frame) {
        for (const b of this._bunnies) {
            const hopPhase = (frame * 0.04 + b.phase) % (Math.PI * 2);
            const hopH = (12 - b.size * 3) || 4;
            const hopY = -Math.abs(Math.sin(hopPhase)) * hopH;
            const drift = Math.sin(frame * 0.015 + b.phase * 2) * (5 - b.size);

            b.sprite.x = b.baseX + drift;
            b.sprite.y = b.baseY + hopY;

            // Squash/stretch on landing
            const squish = hopY < -2 ? 0.88 : 1;
            b.sprite.scale.set(1 / squish, squish);
        }
    }

    destroy() {
        for (const b of this._bunnies) b.sprite.destroy();
        this._bunnies.length = 0;
    }
}

/* ══════════════════════════════════════════════════════════════════
   Section 9: Weather Effects
   ══════════════════════════════════════════════════════════════════ */

function _getWeather() {
    // Deterministic weather based on date
    const d = new Date();
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const hash = ((seed * 2654435761) >>> 0) % 100;
    if (hash < 55) return 'clear';
    if (hash < 75) return 'cloudy';
    if (hash < 90) return 'rain';
    return 'snow';
}

function _getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 6 && h < 12)  return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
}

/* ══════════════════════════════════════════════════════════════════
   Section 10: Main PixiPet Engine
   ══════════════════════════════════════════════════════════════════ */

export class PixiPetEngine {
    constructor(container, callbacks = {}) {
        this._el = container;
        this._cb = callbacks;  // { onInteract, onLoadData }
        this._app = null;
        this._data = null;
        this._frame = 0;
        this._destroyed = false;

        // Layers
        this._layers = {};

        // Subsystems
        this._behavior = new BehaviorAI();
        this._particles = null;
        this._emojis = null;
        this._dreams = null;
        this._dustMgr = null;

        // Pet display
        this._petContainer = null;
        this._petBody = null;
        this._petEyesOpen = null;
        this._petEyesClosed = null;
        this._petMouths = {};
        this._petPupils = { left: null, right: null };

        // State
        this._petX = W / 2;
        this._petY = PET_BASE_Y;
        this._blinkTimer = 0;
        this._blinkDuration = 0;
        this._isBlinking = false;
        this._mouseX = W / 2;
        this._mouseY = H / 2;
        this._lastTod = '';
        this._lastWeather = '';
        this._lastEvo = -1;
        this._petting = false;
        this._petTimer = 0;

        // UI elements
        this._statBars = {};
        this._nameText = null;
        this._levelText = null;
        this._todayText = null;
    }

    async init() {
        await _loadPixi();
        if (this._destroyed) return;

        // Detect if WebGL is actually usable (GPU may be out of VRAM)
        let useCanvas = false;
        try {
            const testC = document.createElement('canvas');
            const gl = testC.getContext('webgl2') || testC.getContext('webgl');
            if (!gl || gl.isContextLost()) useCanvas = true;
            // Release test context
            const ext = gl && gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
        } catch { useCanvas = true; }

        if (useCanvas) console.info('[PixiPet] WebGL unavailable — using Canvas2D renderer');

        this._app = new PIXI.Application({
            width: W, height: H,
            backgroundColor: 0x0a0a10,
            antialias: false,
            resolution: 1,
            autoDensity: true,
            forceCanvas: useCanvas,
        });

        // PixiJS v7: app.view is the canvas
        const canvas = this._app.view;
        canvas.style.width = '100%';
        canvas.style.maxWidth = W + 'px';
        canvas.style.imageRendering = 'pixelated';
        canvas.style.borderRadius = '8px';

        // Clear any existing canvas
        const existing = this._el.querySelector('canvas');
        if (existing) existing.remove();
        this._el.prepend(canvas);

        // Build scene layers
        this._layers.bg = new PIXI.Container();         // room background
        this._layers.furniture = new PIXI.Container();   // shelf items, bowls
        this._layers.clutter = new PIXI.Container();     // dust bunnies, papers
        this._layers.pet = new PIXI.Container();         // the pet
        this._layers.fx = new PIXI.Container();          // particles, weather
        this._layers.emojis = new PIXI.Container();      // play reaction emojis
        this._layers.ui = new PIXI.Container();          // stat bars, info

        for (const layer of Object.values(this._layers)) {
            this._app.stage.addChild(layer);
        }

        // Init subsystems
        this._particles = new ParticlePool(this._layers.fx);
        this._emojis = new EmojiBurst(this._layers.emojis);
        this._dreams = new DreamBubble(this._layers.fx);
        this._dustMgr = new DustBunnyManager(this._layers.clutter, (id, x, y) => {
            this._spawnDustPoof(x, y);
            if (this._cb.onInteract) this._cb.onInteract('clean_dust', { dust_id: id });
        });

        // Build room
        this._buildRoom();

        // Build pet
        this._buildPet();

        // Build UI
        this._buildUI();

        // Mouse tracking
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this._mouseX = (e.clientX - rect.left) / rect.width * W;
            this._mouseY = (e.clientY - rect.top) / rect.height * H;
        });

        // Click pet to react
        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) / rect.width * W;
            const my = (e.clientY - rect.top) / rect.height * H;
            this._handleClick(mx, my);
        });

        canvas.addEventListener('mouseup', () => { this._petting = false; });
        canvas.addEventListener('mouseleave', () => { this._petting = false; });

        // Main loop
        this._app.ticker.add(this._tick, this);
    }

    /* ── Room ─────────────────────────────────────────────────── */

    _buildRoom() {
        const tod = _getTimeOfDay();
        const weather = _getWeather();
        this._lastTod = tod;
        this._lastWeather = weather;

        const tex = _makeRoomBg(tod, weather, this._data?.evolution || 0);
        this._roomSprite = new PIXI.Sprite(tex);
        this._layers.bg.addChild(this._roomSprite);
    }

    _refreshRoom() {
        const tod = _getTimeOfDay();
        const weather = _getWeather();
        const evo = this._data?.evolution || 0;

        if (tod === this._lastTod && weather === this._lastWeather && evo === this._lastEvo) return;
        this._lastTod = tod;
        this._lastWeather = weather;
        this._lastEvo = evo;

        if (this._roomSprite) {
            this._roomSprite.texture.destroy(true);
            this._roomSprite.texture = _makeRoomBg(tod, weather, evo);
        }
    }

    /* ── Pet Construction ─────────────────────────────────────── */

    _buildPet() {
        this._petContainer = new PIXI.Container();
        this._petContainer.x = this._petX;
        this._petContainer.y = this._petY;
        this._layers.pet.addChild(this._petContainer);

        // Shadow under pet
        this._shadow = new PIXI.Graphics();
        this._shadow.beginFill(0x000000, 0.15);
        this._shadow.drawEllipse(0, 0, 20, 5);
        this._shadow.endFill();
        this._shadow.y = 10;
        this._petContainer.addChild(this._shadow);

        this._rebuildPetSprites();
    }

    _rebuildPetSprites() {
        // Remove old sprites (keep shadow)
        while (this._petContainer.children.length > 1) {
            const child = this._petContainer.children[this._petContainer.children.length - 1];
            this._petContainer.removeChild(child);
            child.destroy();
        }

        const evo = this._data?.evolution || 0;
        const mood = this._data?.mood || 'content';
        let bodyTex, eyeW, eyeH, pupilSize, eyeOffsetY, mouthW, mouthH, mouthOffsetY;

        if (evo === 0) {
            bodyTex = _makeEgg();
            this._petBody = new PIXI.Sprite(bodyTex);
            this._petBody.anchor.set(0.5, 1);
            this._petBody.scale.set(PX);
            this._petContainer.addChild(this._petBody);
            return;  // Egg has no eyes/mouth
        }

        if (evo === 1) {
            bodyTex = _makeBabyBody();
            eyeW = 12; eyeH = 6; pupilSize = 2; eyeOffsetY = -24; mouthW = 8; mouthH = 4; mouthOffsetY = -14;
        } else if (evo === 2) {
            bodyTex = _makeChildBody();
            eyeW = 14; eyeH = 8; pupilSize = 2; eyeOffsetY = -56; mouthW = 8; mouthH = 4; mouthOffsetY = -42;
        } else if (evo === 3) {
            bodyTex = _makeTeenBody();
            eyeW = 16; eyeH = 8; pupilSize = 3; eyeOffsetY = -72; mouthW = 10; mouthH = 4; mouthOffsetY = -56;
        } else if (evo === 4) {
            bodyTex = _makeAdultBody();
            eyeW = 18; eyeH = 10; pupilSize = 3; eyeOffsetY = -88; mouthW = 10; mouthH = 4; mouthOffsetY = -68;
        } else {
            bodyTex = _makeMasterBody();
            eyeW = 20; eyeH = 10; pupilSize = 3; eyeOffsetY = -100; mouthW = 10; mouthH = 4; mouthOffsetY = -78;
        }

        // Body sprite
        this._petBody = new PIXI.Sprite(bodyTex);
        this._petBody.anchor.set(0.5, 1);
        this._petBody.scale.set(PX);
        this._petContainer.addChild(this._petBody);

        // Eyes (open)
        this._petEyesOpen = new PIXI.Sprite(_makeEyes(eyeW, eyeH, pupilSize, true));
        this._petEyesOpen.anchor.set(0.5);
        this._petEyesOpen.y = eyeOffsetY;
        this._petContainer.addChild(this._petEyesOpen);

        // Eyes (closed, for blinking)
        this._petEyesClosed = new PIXI.Sprite(_makeEyes(eyeW, eyeH, pupilSize, false));
        this._petEyesClosed.anchor.set(0.5);
        this._petEyesClosed.y = eyeOffsetY;
        this._petEyesClosed.visible = false;
        this._petContainer.addChild(this._petEyesClosed);

        // Pupil overlays for eye tracking
        const pSize = pupilSize;
        this._petPupils.left = new PIXI.Graphics();
        this._petPupils.left.beginFill(0x1a1a2e);
        this._petPupils.left.drawRect(-pSize / 2, -pSize / 2, pSize, pSize);
        this._petPupils.left.endFill();
        this._petPupils.left.y = eyeOffsetY;
        this._petContainer.addChild(this._petPupils.left);

        this._petPupils.right = new PIXI.Graphics();
        this._petPupils.right.beginFill(0x1a1a2e);
        this._petPupils.right.drawRect(-pSize / 2, -pSize / 2, pSize, pSize);
        this._petPupils.right.endFill();
        this._petPupils.right.y = eyeOffsetY;
        this._petContainer.addChild(this._petPupils.right);

        // Mouth
        this._petMouths = {};
        for (const m of ['happy', 'sad', 'content', 'hungry', 'dirty']) {
            const spr = new PIXI.Sprite(_makeMouth(mouthW, mouthH, m));
            spr.anchor.set(0.5);
            spr.y = mouthOffsetY;
            spr.visible = m === mood;
            this._petContainer.addChild(spr);
            this._petMouths[m] = spr;
        }

        // Master aura filter
        if (evo >= 5) {
            try {
                const glow = new PIXI.BlurFilter(3, 2);
                glow.padding = 10;
                this._petBody.filters = [glow];
            } catch (e) { /* filter not available */ }
        }

        this._eyeW = eyeW;
        this._pupilSize = pupilSize;
    }

    /* ── UI Construction ──────────────────────────────────────── */

    _buildUI() {
        // Stat bars background
        const barBg = new PIXI.Graphics();
        barBg.beginFill(0x0c0e14, 0.8);
        barBg.drawRoundedRect(0, 0, 110, 62, 6);
        barBg.endFill();
        barBg.lineStyle(1, 0x3c4150, 0.5);
        barBg.drawRoundedRect(0, 0, 110, 62, 6);
        barBg.x = W - 120;
        barBg.y = 8;
        this._layers.ui.addChild(barBg);

        const barDefs = [
            { key: 'hunger', label: 'HGR', y: 15 },
            { key: 'happiness', label: 'HAP', y: 33 },
            { key: 'cleanliness', label: 'CLN', y: 51 },
        ];

        const textStyle = new PIXI.TextStyle({ fontSize: 9, fontFamily: 'monospace', fill: '#aaa' });
        const valStyle = new PIXI.TextStyle({ fontSize: 7, fontFamily: 'monospace', fill: '#ddd' });

        for (const def of barDefs) {
            // Label
            const label = new PIXI.Text(def.label, textStyle);
            label.x = W - 115;
            label.y = def.y - 5;
            this._layers.ui.addChild(label);

            // Track
            const track = new PIXI.Graphics();
            track.beginFill(0x1a1d26);
            track.drawRect(0, 0, 80, 8);
            track.endFill();
            track.lineStyle(1, 0x3a3e4a);
            track.drawRect(0, 0, 80, 8);
            track.x = W - 90;
            track.y = def.y;
            this._layers.ui.addChild(track);

            // Fill bar
            const fill = new PIXI.Graphics();
            fill.x = W - 89;
            fill.y = def.y + 1;
            this._layers.ui.addChild(fill);

            // Value text
            const val = new PIXI.Text('0', valStyle);
            val.anchor.set(0.5, 0);
            val.x = W - 50;
            val.y = def.y - 1;
            this._layers.ui.addChild(val);

            this._statBars[def.key] = { fill, val };
        }

        // Pet info panel (bottom center)
        const infoBg = new PIXI.Graphics();
        infoBg.beginFill(0x0c0e14, 0.8);
        infoBg.drawRoundedRect(0, 0, 190, 42, 6);
        infoBg.endFill();
        infoBg.lineStyle(1, 0x3c4150, 0.5);
        infoBg.drawRoundedRect(0, 0, 190, 42, 6);
        infoBg.x = (W - 190) / 2;
        infoBg.y = H - 48;
        this._layers.ui.addChild(infoBg);

        this._nameText = new PIXI.Text('', new PIXI.TextStyle({
            fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold', fill: '#ddd',
        }));
        this._nameText.anchor.set(0.5, 0);
        this._nameText.x = W / 2;
        this._nameText.y = H - 44;
        this._layers.ui.addChild(this._nameText);

        this._levelText = new PIXI.Text('', new PIXI.TextStyle({
            fontSize: 9, fontFamily: 'monospace', fill: '#aaa',
        }));
        this._levelText.anchor.set(0.5, 0);
        this._levelText.x = W / 2;
        this._levelText.y = H - 30;
        this._layers.ui.addChild(this._levelText);

        this._todayText = new PIXI.Text('', new PIXI.TextStyle({
            fontSize: 8, fontFamily: 'monospace', fill: '#777',
        }));
        this._todayText.anchor.set(0.5, 0);
        this._todayText.x = W / 2;
        this._todayText.y = H - 18;
        this._layers.ui.addChild(this._todayText);
    }

    _updateUI() {
        if (!this._data) return;

        const stats = {
            hunger:      { value: this._data.hunger || 0 },
            happiness:   { value: this._data.happiness || 0 },
            cleanliness: { value: this._data.cleanliness || 0 },
        };

        for (const [key, s] of Object.entries(stats)) {
            const bar = this._statBars[key];
            if (!bar) continue;

            const v = Math.max(0, Math.min(100, s.value));
            const color = v > 50 ? (key === 'hunger' ? 0x4caf50 : key === 'happiness' ? 0x2196f3 : 0x9c27b0)
                        : v > 25 ? 0xff9800 : 0xf44336;

            bar.fill.clear();
            bar.fill.beginFill(color);
            bar.fill.drawRect(0, 0, (v / 100) * 78, 6);
            bar.fill.endFill();

            bar.val.text = String(v);
        }

        const evoNames = ['Egg', 'Baby', 'Child', 'Teen', 'Adult', 'Master'];
        this._nameText.text = this._data.pet_name || 'Byte';
        this._levelText.text = `Lv.${this._data.level || 0} ${evoNames[this._data.evolution] || 'Egg'}`;
        this._todayText.text = `${this._data.goals_today || 0} goals · ${this._data.today_xp || 0} XP`;
    }

    /* ── Data Update ──────────────────────────────────────────── */

    updateData(data) {
        if (!data) return;
        const prevEvo = this._data ? this._data.evolution : undefined;
        this._data = data;

        if (prevEvo !== data.evolution) {
            this._rebuildPetSprites();
            // Celebrate real evolution changes, not the initial load
            if (prevEvo !== undefined) this._behavior.enter(BEHAVIOR.CELEBRATE, 180);
        }

        if (this._dustMgr) this._dustMgr.sync(data.clutter);
        if (this._statBars && Object.keys(this._statBars).length) this._updateUI();
        if (this._petMouths && Object.keys(this._petMouths).length) this._updateMouth();
    }

    _updateMouth() {
        const mood = this._data?.mood || 'content';
        for (const [key, spr] of Object.entries(this._petMouths)) {
            spr.visible = key === mood;
        }
    }

    /* ── Interactions ─────────────────────────────────────────── */

    _handleClick(mx, my) {
        // Check if clicking on pet
        const px = this._petContainer.x;
        const py = this._petContainer.y;
        const evo = this._data?.evolution || 0;
        const hitW = 30 + evo * 8;
        const hitH = 40 + evo * 12;

        if (mx > px - hitW && mx < px + hitW && my > py - hitH && my < py + 10) {
            this._petting = true;
            this._petTimer = 0;

            // Startled jump if idle
            if (this._behavior.state === BEHAVIOR.IDLE || this._behavior.state === BEHAVIOR.WALK) {
                this._behavior.enter(BEHAVIOR.STARTLED, 30);
            }
        }
    }

    playReaction() {
        if (this._behavior) this._behavior.enter(BEHAVIOR.PLAY, 120);
        if (this._emojis && this._petContainer) {
            this._emojis.fire(this._petContainer.x, this._petContainer.y - 30);
        }
    }

    /* ── Particle Helpers ─────────────────────────────────────── */

    _spawnDustPoof(x, y) {
        for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * Math.PI * 2;
            this._particles.spawn(
                x, y,
                Math.cos(angle) * 1.5, Math.sin(angle) * 1.5 - 0.5,
                0xa09b91, 3 + Math.random() * 2, 30 + Math.random() * 15,
                { gravity: -0.02 }
            );
        }
    }

    _emitMoodParticles() {
        if (!this._data) return;
        const mood = this._data.mood;
        const px = this._petContainer.x;
        const py = this._petContainer.y - 20;
        const evo = this._data.evolution || 0;

        if (mood === 'happy' && Math.random() < 0.06) {
            this._particles.spawn(
                px + (Math.random() - 0.5) * 30, py,
                (Math.random() - 0.5) * 0.8, -0.8 - Math.random() * 0.5,
                0xff6b9d, 3, 60, { gravity: -0.01 }
            );
        }
        if (mood === 'dirty' && Math.random() < 0.04) {
            this._particles.spawn(
                px + (Math.random() - 0.5) * 20, py,
                (Math.random() - 0.5) * 0.3, -0.6,
                0x64c832, 2, 50, { gravity: -0.01 }
            );
        }
        if (mood === 'hungry' && Math.random() < 0.03) {
            this._particles.spawn(
                px + 15, py - 10, 0.2, -0.5,
                0xff9800, 2.5, 40
            );
        }

        // Master sparkles
        if (evo >= 5 && Math.random() < 0.08) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 15;
            this._particles.spawn(
                px + Math.cos(angle) * dist, py + Math.sin(angle) * dist,
                Math.cos(angle) * 0.3, Math.sin(angle) * 0.3,
                0xffd700, 2 + Math.random() * 2, 50,
                { shape: 'square', spin: 0.05 }
            );
        }

        // Ambient dust motes
        if (Math.random() < 0.015) {
            this._particles.spawn(
                Math.random() * W, Math.random() * H * 0.6,
                (Math.random() - 0.5) * 0.3, -0.1 + Math.random() * 0.2,
                0x9696a0, 1.5, 120,
                { fadeIn: true }
            );
        }

        // Fireflies at night
        const tod = _getTimeOfDay();
        if (tod === 'night' && Math.random() < 0.02) {
            this._particles.spawn(
                50 + Math.random() * (W - 100), 50 + Math.random() * (H * 0.5),
                (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3,
                0xffee88, 2, 100 + Math.random() * 60,
                { fadeIn: true }
            );
        }

        // Weather particles through window area
        const weather = _getWeather();
        const wx = W * 0.72 + 10, wy = 30, ww = 60, wh = 90;
        if (weather === 'rain' && Math.random() < 0.15) {
            this._particles.spawn(
                wx + Math.random() * ww, wy + 5,
                -0.2, 2 + Math.random(),
                0x6688aa, 1, 35
            );
        }
        if (weather === 'snow' && Math.random() < 0.08) {
            this._particles.spawn(
                wx + Math.random() * ww, wy + 5,
                (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3,
                0xddddee, 2, 80
            );
        }

        // Petting hearts
        if (this._petting) {
            this._petTimer++;
            if (this._petTimer % 6 === 0) {
                this._particles.spawn(
                    px + (Math.random() - 0.5) * 30, py - 10,
                    (Math.random() - 0.5) * 1, -1.2 - Math.random() * 0.5,
                    0xff4488, 3 + Math.random() * 2, 40
                );
            }
        }
    }

    /* ── Main Tick ────────────────────────────────────────────── */

    _tick(delta) {
        this._frame++;

        // Refresh room every ~5 seconds
        if (this._frame % 300 === 0) this._refreshRoom();

        // Behavior AI update (every ~1 second at 60fps)
        if (this._frame % 60 === 0) {
            this._behavior.update(_getTimeOfDay(), this._data?.mood);
        }

        // Pet animation
        this._animatePet(delta);

        // Eye tracking
        this._updateEyeTracking();

        // Blinking
        this._updateBlink();

        // Particles
        this._emitMoodParticles();
        this._particles.update();

        // Emojis
        this._emojis.update();

        // Dreams
        if (this._behavior.state === BEHAVIOR.SLEEP) {
            this._dreams.show(this._petContainer.x, this._petContainer.y - 40);
            this._dreams.update();
        } else {
            this._dreams.hide();
        }

        // Dust bunnies
        this._dustMgr.update(this._frame);
    }

    _animatePet(delta) {
        if (!this._petContainer || !this._data) return;
        const state = this._behavior.state;
        const t = this._frame;
        const evo = this._data.evolution || 0;

        // Smooth position towards target
        let targetX = this._petX;
        let targetY = PET_BASE_Y;
        let scaleX = PX;
        let scaleY = PX;
        let bodyRotation = 0;

        switch (state) {
            case BEHAVIOR.IDLE: {
                // Gentle breathing
                const breathe = Math.sin(t * 0.05) * 0.02;
                scaleY = PX * (1 + breathe);
                // Subtle sway
                const sway = Math.sin(t * 0.02) * 0.5;
                targetX = this._petX + sway;
                break;
            }
            case BEHAVIOR.WALK: {
                // Move towards walk target
                const diff = this._behavior.walkTarget - this._petX;
                const step = Math.sign(diff) * Math.min(Math.abs(diff), 1.2);
                this._petX += step;
                this._petX = Math.max(50, Math.min(W - 50, this._petX));
                targetX = this._petX;
                // Walk bounce
                const walkBounce = Math.abs(Math.sin(t * 0.15)) * 4;
                targetY = PET_BASE_Y - walkBounce;
                // Face walking direction
                scaleX = step < 0 ? -PX : PX;
                break;
            }
            case BEHAVIOR.SIT: {
                // Squat down
                scaleY = PX * 0.85;
                targetY = PET_BASE_Y + 5;
                break;
            }
            case BEHAVIOR.SLEEP: {
                scaleY = PX * 0.8;
                targetY = PET_BASE_Y + 8;
                // Slow breathing
                const sleepBreath = Math.sin(t * 0.03) * 0.03;
                scaleY = PX * (0.8 + sleepBreath);
                break;
            }
            case BEHAVIOR.PLAY: {
                // Excited bouncing
                const playBounce = Math.abs(Math.sin(t * 0.3)) * 15;
                targetY = PET_BASE_Y - playBounce;
                const playSquash = playBounce < 3 ? 0.9 : 1.1;
                scaleY = PX * playSquash;
                scaleX = PX * (1 / playSquash);
                // Spin occasionally
                if (this._behavior.timer > 30 && this._behavior.timer < 80) {
                    bodyRotation = Math.sin(t * 0.2) * 0.15;
                }
                break;
            }
            case BEHAVIOR.STARTLED: {
                // Jump up
                const jumpProgress = this._behavior.timer / this._behavior.duration;
                const jumpArc = Math.sin(jumpProgress * Math.PI);
                targetY = PET_BASE_Y - jumpArc * 25;
                // Squish on landing
                if (jumpProgress > 0.7) {
                    scaleY = PX * (0.85 + jumpProgress * 0.15);
                    scaleX = PX * (1.15 - jumpProgress * 0.15);
                }
                break;
            }
            case BEHAVIOR.CELEBRATE: {
                // Victory dance
                const celebBounce = Math.abs(Math.sin(t * 0.2)) * 12;
                targetY = PET_BASE_Y - celebBounce;
                scaleX = PX * (Math.sin(t * 0.1) > 0 ? 1 : -1);

                // Celebration particles
                if (this._behavior.timer % 8 === 0) {
                    const angle = Math.random() * Math.PI * 2;
                    this._particles.spawn(
                        this._petContainer.x + Math.cos(angle) * 20,
                        this._petContainer.y - 20 + Math.sin(angle) * 15,
                        Math.cos(angle) * 1.5, -1.5,
                        [0xffd700, 0xff6b9d, 0x4caf50, 0x2196f3][Math.floor(Math.random() * 4)],
                        3, 40, { shape: 'square', spin: 0.1 }
                    );
                }
                break;
            }
            case BEHAVIOR.EAT: {
                // Bob towards food bowl
                targetX = 80;
                const eatBob = Math.sin(t * 0.3) * 3;
                targetY = PET_BASE_Y + eatBob;
                break;
            }
        }

        // Smooth interpolation
        const lerp = 0.12;
        this._petContainer.x += (targetX - this._petContainer.x) * lerp;
        this._petContainer.y += (targetY - this._petContainer.y) * lerp;

        if (this._petBody) {
            // Maintain direction but smooth scale transitions
            const currentSX = this._petBody.scale.x;
            const targetSX = scaleX;
            this._petBody.scale.x += (targetSX - currentSX) * 0.15;
            this._petBody.scale.y += (scaleY - this._petBody.scale.y) * 0.15;
            this._petBody.rotation += (bodyRotation - this._petBody.rotation) * 0.2;
        }

        // Shadow follows pet and scales with height
        if (this._shadow) {
            const heightAboveFloor = PET_BASE_Y - this._petContainer.y;
            const shadowScale = Math.max(0.5, 1 - heightAboveFloor * 0.01);
            this._shadow.scale.set(shadowScale, shadowScale * 0.5);
            this._shadow.alpha = 0.15 * shadowScale;
            this._shadow.y = PET_BASE_Y - this._petContainer.y + 10;
        }

        // Egg wobble
        if (evo === 0 && this._petBody) {
            this._petBody.rotation = Math.sin(t * 0.06) * 0.08;
        }

        // Arm swing for non-egg stages (done via body tilt for now)
        // More detailed arm animation would need separate arm sprites
    }

    _updateEyeTracking() {
        if (!this._petPupils.left || !this._petPupils.right) return;
        if (this._behavior.state === BEHAVIOR.SLEEP || this._isBlinking) {
            this._petPupils.left.visible = false;
            this._petPupils.right.visible = false;
            return;
        }
        this._petPupils.left.visible = true;
        this._petPupils.right.visible = true;

        const px = this._petContainer.x;
        const py = this._petContainer.y + (this._petPupils.left.y || 0);
        const dx = this._mouseX - px;
        const dy = this._mouseY - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxOffset = 2;

        let ox = 0, oy = 0;
        if (dist > 10) {
            ox = (dx / dist) * maxOffset;
            oy = (dy / dist) * maxOffset * 0.6;
        }

        const eyeGap = (this._eyeW || 14) * 0.2;
        this._petPupils.left.x = -eyeGap + ox;
        this._petPupils.right.x = eyeGap + ox;
        // Y is set during sprite build; just offset for tracking
        const baseEyeY = this._petPupils.left.y;
        // Slight vertical tracking
        this._petPupils.left.y = baseEyeY;
        this._petPupils.right.y = baseEyeY;
    }

    _updateBlink() {
        if (!this._petEyesOpen || this._behavior.state === BEHAVIOR.SLEEP) {
            // Keep eyes closed when sleeping
            if (this._petEyesOpen) this._petEyesOpen.visible = false;
            if (this._petEyesClosed) this._petEyesClosed.visible = true;
            return;
        }

        this._blinkTimer++;
        if (this._isBlinking) {
            this._blinkDuration++;
            if (this._blinkDuration > 8) {
                this._isBlinking = false;
                this._petEyesOpen.visible = true;
                this._petEyesClosed.visible = false;
                this._blinkTimer = 0;
            }
        } else {
            // Random blink every 2-5 seconds
            if (this._blinkTimer > 120 + Math.random() * 180) {
                this._isBlinking = true;
                this._blinkDuration = 0;
                this._petEyesOpen.visible = false;
                this._petEyesClosed.visible = true;
            }
        }
    }

    /* ── Public API ───────────────────────────────────────────── */

    async loadData() {
        if (this._cb.onLoadData) {
            const data = await this._cb.onLoadData();
            this.updateData(data);
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._app) {
            this._app.ticker.remove(this._tick, this);
        }
        if (this._particles) this._particles.destroy();
        if (this._emojis) this._emojis.destroy();
        if (this._dreams) this._dreams.destroy();
        if (this._dustMgr) this._dustMgr.destroy();
        if (this._app) {
            this._app.destroy(true, { children: true, texture: true, baseTexture: true });
        }
        this._app = null;
    }
}
