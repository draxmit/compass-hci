import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Currency } from '@compass/shared-types';

import { FX_TO_IDR as STATIC_FX_TO_IDR } from '@/shared/utils/fxRates';

/**
 * Live FX rate service. Fetches IDR-anchored rates from a free,
 * no-auth, CORS-friendly public API and caches them in AsyncStorage
 * with a 24h TTL. Falls back to the hardcoded snapshot in
 * `shared/utils/fxRates.ts` when offline / API errors / cache empty.
 *
 * Architecture
 * ============
 *
 *   Boot:
 *     useAuthSubscription → loadCachedRates() (sync from AsyncStorage)
 *                         → maybeRefreshRates()  (background fetch if stale)
 *
 *   Reads:
 *     getLiveOrFallbackRates() — returns the in-memory cache, falling
 *     back to STATIC_FX_TO_IDR if nothing's been loaded yet
 *
 *   convertToIDRMinor / convertFromIDRMinor in shared/utils/fxRates
 *   STILL use the static constant by default — that's the safe fallback
 *   for components that haven't subscribed to the live cache. Components
 *   that want live rates explicitly opt in via getLiveOrFallbackRates().
 *
 *   v2 forward-compat: per-tx amountIDR snapshots already freeze the FX
 *   rate at write-time on the tx doc, so historical reports stay stable
 *   even when live rates drift.
 */

// ---- Constants ----

const STORAGE_KEY = 'fx.rates.cache.v1';
const TTL_MS = 24 * 60 * 60 * 1000;       // 24 hours
// open.er-api.com — completely free, no auth, no rate limit for typical
// personal use. Returns IDR-anchored "1 IDR = X foreign" rates which
// we invert to get our "1 foreign = X IDR" shape. Tried exchangerate.host
// first but they now require a paid access_key for /latest.
const ENDPOINT = 'https://open.er-api.com/v6/latest/IDR';
const FETCH_TIMEOUT_MS = 5000;

// ---- Cache shape ----

export type LiveFxCache = {
  /** Map of foreign currency code → IDR per 1 unit. Mirrors STATIC_FX_TO_IDR shape. */
  rates: Partial<Record<Exclude<Currency, 'IDR'>, number>>;
  /** ms epoch when the cache was last refreshed from the API. */
  fetchedAt: number;
  /** Source of the cache — 'live' (from API) vs 'fallback' (couldn't fetch). */
  source: 'live' | 'fallback';
};

// In-memory cache. Updated by loadCachedRates / refreshRates. Reads
// (getLiveOrFallbackRates) hit this directly so the conversion path
// stays sync.
let memCache: LiveFxCache | null = null;

// ---- Public API ----

/**
 * Read-only accessor. Returns the live cache if present, otherwise
 * the static snapshot wrapped in the same shape with source: 'fallback'.
 * Always sync — call sites don't need to wait.
 */
export function getLiveOrFallbackRates(): LiveFxCache {
  if (memCache) return memCache;
  return {
    rates: { ...STATIC_FX_TO_IDR },
    fetchedAt: 0,
    source: 'fallback',
  };
}

/**
 * Hydrate the in-memory cache from AsyncStorage. Call once at app boot
 * (from useAuthSubscription). Safe to call multiple times — second
 * call is a no-op if memCache already populated.
 */
export async function loadCachedRates(): Promise<void> {
  if (memCache) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as LiveFxCache;
    if (!parsed || typeof parsed !== 'object' || !parsed.rates) return;
    memCache = parsed;
  } catch {
    // Corrupt cache — ignore, next refresh will overwrite.
  }
}

/**
 * Background refresh. If the cache is fresh (<TTL), no-op. Otherwise
 * fetch the latest rates, persist to AsyncStorage, and update the
 * in-memory cache. Errors are swallowed; the static fallback handles
 * offline/API-down cases gracefully.
 *
 * Returns the resulting cache for callers that want to chain off the
 * refresh (e.g. show a "rates updated" toast).
 */
export async function maybeRefreshRates(force = false): Promise<LiveFxCache> {
  const now = Date.now();
  if (!force && memCache && now - memCache.fetchedAt < TTL_MS) {
    return memCache;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(ENDPOINT, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { rates?: Record<string, number> };
    if (!data || typeof data !== 'object' || !data.rates) {
      throw new Error('Malformed rates payload');
    }
    // The endpoint returns rates as "1 IDR = X foreign". We need the
    // inverse (1 foreign = X IDR) to match STATIC_FX_TO_IDR's shape.
    const rates: Partial<Record<Exclude<Currency, 'IDR'>, number>> = {};
    const keys: Exclude<Currency, 'IDR'>[] = ['USD', 'SGD', 'EUR', 'AUD', 'JPY', 'GBP', 'MYR', 'THB', 'CNY'];
    for (const k of keys) {
      const fwd = data.rates[k];
      if (typeof fwd === 'number' && fwd > 0) {
        rates[k] = Math.round(1 / fwd);   // 1 foreign = (1 / fwd) IDR
      }
    }
    if (Object.keys(rates).length === 0) {
      throw new Error('No usable rates in response');
    }
    const fresh: LiveFxCache = { rates, fetchedAt: now, source: 'live' };
    memCache = fresh;
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)).catch(() => {});
    return fresh;
  } catch {
    // Network / parse error. If we already have a cache, keep it.
    // Otherwise return the static fallback so callers see consistent
    // shape.
    if (memCache) return memCache;
    return getLiveOrFallbackRates();
  }
}
