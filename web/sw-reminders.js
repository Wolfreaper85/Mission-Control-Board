// Mission Control — Reminder Service Worker
// Runs in the background so calendar reminders fire even when the tab isn't focused.
// Handles notification clicks to bring the user back to Sapphire.

const SW_VERSION = '1.0';

// ─── Lifecycle ──────────────────────────────────────────────────────────────

self.addEventListener('install', (e) => {
    // Activate immediately — don't wait for old SW to die
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // Claim all open tabs so we handle their notifications right away
    e.waitUntil(self.clients.claim());
});

// ─── Notification Click ────────────────────────────────────────────────────

self.addEventListener('notificationclick', (e) => {
    e.notification.close();

    // Focus existing Sapphire tab or open a new one
    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Try to find and focus an existing Sapphire tab
            for (const client of clients) {
                if (client.url && !client.url.includes('sw-reminders')) {
                    client.focus();
                    // Tell the page to switch to Mission Control
                    client.postMessage({ type: 'mc-reminder-click', eventId: e.notification.data?.eventId });
                    return;
                }
            }
            // No existing tab — open one
            return self.clients.openWindow('/');
        })
    );
});

// ─── Message Handler — Polling from background ─────────────────────────────

let _pollTimer = null;
let _csrfToken = '';
let _baseUrl = '';

self.addEventListener('message', (e) => {
    const msg = e.data;

    if (msg.type === 'init') {
        // Main.js tells us the base URL and CSRF token
        _baseUrl = msg.baseUrl || '';
        _csrfToken = msg.csrf || '';

        // Start background polling if not already running
        if (!_pollTimer) {
            _pollTimer = setInterval(() => _checkReminders(), 30000);
            _checkReminders(); // Immediate first check
        }
    }

    if (msg.type === 'update-csrf') {
        _csrfToken = msg.csrf || '';
    }

    if (msg.type === 'stop') {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }
});

// ─── Background Reminder Check ─────────────────────────────────────────────

async function _checkReminders() {
    if (!_baseUrl) return;

    try {
        const resp = await fetch(`${_baseUrl}/api/plugin/mission-control/calendar/reminders`, {
            headers: { 'X-CSRF-Token': _csrfToken },
            credentials: 'same-origin',
        });
        if (!resp.ok) return;

        const data = await resp.json();
        const reminders = data.reminders || [];

        for (const r of reminders) {
            const time12 = _to12h(r.start_time);
            const timeStr = time12 ? ` at ${time12}` : '';

            await self.registration.showNotification('Mission Control Reminder', {
                body: `${r.title || 'Calendar Event'}${timeStr}`,
                icon: `${_baseUrl}/static/favicon.ico`,
                badge: `${_baseUrl}/static/favicon.ico`,
                tag: `mc-reminder-${r.id}`,
                data: { eventId: r.id },
                requireInteraction: true, // Stay visible until user interacts
                vibrate: [200, 100, 200],
            });

            // Notify the page to play the chime and show toast
            const clients = await self.clients.matchAll({ type: 'window' });
            for (const client of clients) {
                client.postMessage({ type: 'mc-reminder-fire', event: r });
            }
        }
    } catch (e) {
        // Silent fail — will retry next interval
    }
}

function _to12h(time24) {
    if (!time24) return '';
    const parts = time24.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${period}`;
}
