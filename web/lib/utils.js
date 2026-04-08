// lib/utils.js — Shared utilities for Mission Control modules

// ─── DOM Helpers ───────────────────────────────────────────────────────────

export function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

export function esc(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ─── Time / Date ───────────────────────────────────────────────────────────

export function relativeTime(ts) {
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

export function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts + (ts.includes('Z') ? '' : 'Z'));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function to12h(time24) {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function countCompletedToday(goals) {
    const today = new Date().toISOString().substring(0, 10);
    return goals.filter(g => g.status === 'completed' && g.completed_at && g.completed_at.substring(0, 10) === today).length;
}

export function countCompletedThisWeek(goals) {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return goals.filter(g => g.status === 'completed' && g.completed_at && new Date(g.completed_at) >= monday).length;
}

export function countProgressNotes(goals) {
    return goals.reduce((sum, g) => sum + (g.progress ? g.progress.length : 0), 0);
}

// ─── Markdown Rendering ────────────────────────────────────────────────────

export function renderMarkdown(text) {
    let html = esc(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code class="mc-inline-code">$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

// ─── Toast / Notifications ─────────────────────────────────────────────────

export function showToast(message, type = 'info', duration = 4000) {
    let container = document.getElementById('mc-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mc-toast-container';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }

    const colors = {
        info: { bg: 'rgba(0,240,255,0.1)', border: '#00f0ff' },
        success: { bg: 'rgba(0,255,136,0.1)', border: '#00ff88' },
        warning: { bg: 'rgba(255,215,0,0.1)', border: '#ffd700' },
        error: { bg: 'rgba(255,0,170,0.1)', border: '#ff00aa' },
    };
    const c = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
        pointer-events:auto; background:${c.bg}; border:1px solid ${c.border};
        border-radius:12px; padding:12px 18px; min-width:240px; max-width:380px;
        box-shadow:0 0 20px ${c.border}40, 0 8px 32px rgba(0,0,0,0.4); backdrop-filter:blur(16px) saturate(1.5);
        -webkit-backdrop-filter:blur(16px) saturate(1.5);
        color:#e8e8f0; font-size:0.85rem; animation:mc-toast-in 0.4s cubic-bezier(0.4,0,0.2,1), mc-toast-glow 2s ease-in-out infinite;
        --mc-glow-color:${c.border}40;
    `;
    toast.textContent = message;
    container.appendChild(toast);
    if (duration > 0) {
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px) scale(0.95)';
            toast.style.transition = 'opacity 0.3s, transform 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// ─── Alarm / Chime Sound ───────────────────────────────────────────────────

window._alarmLoopTimer = null;

export function playAlarmSound(chimeCount) {
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

// ─── XP Notification ───────────────────────────────────────────────────────

export function showXPGain(amount, reason) {
    const el = document.createElement('div');
    el.className = 'mc-xp-float';
    el.innerHTML = `<span class="mc-xp-amount">+${amount} XP</span><span class="mc-xp-reason">${esc(reason)}</span>`;
    document.body.appendChild(el);
    // Spawn particles around the notification
    for (let i = 0; i < 6; i++) {
        const p = document.createElement('div');
        const angle = (i / 6) * Math.PI * 2;
        const dist = 40 + Math.random() * 30;
        p.style.cssText = `position:fixed;top:40%;left:50%;width:4px;height:4px;border-radius:50%;
            background:var(--mc-gold);pointer-events:none;z-index:99999;
            box-shadow:0 0 8px var(--mc-gold);
            animation:mc-float-up 1.2s ease-out forwards;
            transform:translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px);
            opacity:0.8;`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1200);
    }
    setTimeout(() => el.remove(), 2000);
}
