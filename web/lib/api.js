// lib/api.js — Centralized fetch wrapper with token bucket rate limiter
// All API calls go through this module to respect the 30 req/60s plugin limit.

const CSRF = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

// ─── Token Bucket Rate Limiter ─────────────────────────────────────────────
// Allows bursts up to 5 but sustains max 25 req/60s to leave headroom.

const _bucket = {
    tokens: 5,
    max: 5,
    rate: 25 / 60,        // tokens per second (~0.417)
    lastRefill: Date.now(),
};

function _refill() {
    const now = Date.now();
    const elapsed = (now - _bucket.lastRefill) / 1000;
    _bucket.tokens = Math.min(_bucket.max, _bucket.tokens + elapsed * _bucket.rate);
    _bucket.lastRefill = now;
}

async function _waitForToken() {
    _refill();
    if (_bucket.tokens >= 1) {
        _bucket.tokens -= 1;
        return;
    }
    // Wait until a token is available
    const waitMs = ((1 - _bucket.tokens) / _bucket.rate) * 1000;
    await new Promise(r => setTimeout(r, Math.ceil(waitMs)));
    _refill();
    _bucket.tokens -= 1;
}

// ─── Fetch Wrapper ─────────────────────────────────────────────────────────

/**
 * Rate-limited fetch for plugin API calls.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @param {object} [extra] - { skipRateLimit: bool, retryOn429: bool }
 */
export async function apiFetch(url, opts = {}, extra = {}) {
    if (!extra.skipRateLimit) await _waitForToken();

    const headers = { 'X-CSRF-Token': CSRF(), ...opts.headers };
    const resp = await fetch(url, { ...opts, headers });

    if (resp.status === 429 && extra.retryOn429 !== false) {
        // Back off and retry once
        await new Promise(r => setTimeout(r, 2000));
        _refill();
        return fetch(url, { ...opts, headers });
    }

    return resp;
}

/**
 * Rate-limited JSON fetch.
 */
export async function apiJson(url, opts = {}, extra = {}) {
    const resp = await apiFetch(url, opts, extra);
    if (!resp.ok) throw new Error(`API ${resp.status}: ${url}`);
    return resp.json();
}

/**
 * POST JSON helper.
 */
export async function apiPost(url, body, extra = {}) {
    return apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }, extra);
}

/**
 * POST JSON and return parsed response.
 */
export async function apiPostJson(url, body, extra = {}) {
    const resp = await apiPost(url, body, extra);
    return resp.json();
}

export { CSRF };
