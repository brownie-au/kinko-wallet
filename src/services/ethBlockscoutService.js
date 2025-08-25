// src/services/ethBlockscoutService.js
// Ethereum token discovery via Blockscout (no Moralis/Alchemy).
// - Uses env vars: VITE_ETH_BLOCKSCOUT_V2 / VITE_ETH_BLOCKSCOUT_V1
// - Falls back to public eth.blockscout.com if env not set
// - Returns: [{ address, symbol, name, decimals, balanceRaw }]

/* ---------- Endpoint setup from .env ---------- */
const BS_V2 = (import.meta.env.VITE_ETH_BLOCKSCOUT_V2 || 'https://eth.blockscout.com/api/v2').replace(/\/+$/, '');
const BS_V1 = (import.meta.env.VITE_ETH_BLOCKSCOUT_V1 || 'https://eth.blockscout.com/api').replace(/\/+$/, '');
// Host root (e.g., https://eth.blockscout.com)
const BS_HOST =
    (BS_V2 && BS_V2.replace(/\/api\/v2.*/i, '')) ||
    (BS_V1 && BS_V1.replace(/\/api.*/i, '')) ||
    'https://eth.blockscout.com';

/* ---------- tiny cache helpers ---------- */
const lsGet = (k, maxAgeMs) => {
    try {
        const raw = localStorage.getItem(k);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (maxAgeMs && Date.now() - (obj.ts || 0) > maxAgeMs) return null;
        return obj.data ?? null;
    } catch { return null; }
};
const lsSet = (k, data) => {
    try { localStorage.setItem(k, JSON.stringify({ ts: Date.now(), data })); } catch { }
};

/* ---------- normaliser ---------- */
function normaliseItem(it) {
    const t = it.token || it;
    const addr = (t?.address || t?.contract_address || t?.contractAddress || '').toLowerCase();
    const dec = Number(t?.decimals ?? it?.decimals ?? 18);
    const bal = String(it?.value ?? it?.token_balance ?? it?.balance ?? '0');
    return {
        address: addr,
        symbol: t?.symbol || '',
        name: t?.name || '',
        decimals: Number.isFinite(dec) ? dec : 18,
        balanceRaw: bal
    };
}

/* ---------- v2: /api/v2/addresses/{addr}/token-balances (preferred) ---------- */
async function fetchV2TokenBalances(address) {
    // most builds support ?type=ERC-20&filter=positive&page_size=200
    const base = `${BS_V2}/addresses/${address}/token-balances`;
    const out = [];
    let url = `${base}?type=ERC-20&filter=positive&page_size=200`;

    for (let guard = 0; guard < 25; guard++) {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Blockscout v2 HTTP ${res.status}`);
        const json = await res.json();

        const items = Array.isArray(json?.items) ? json.items
            : Array.isArray(json?.token_balances) ? json.token_balances
                : Array.isArray(json) ? json
                    : [];
        for (const it of items) out.push(normaliseItem(it));

        const next = json?.next_page_params || json?.next_page_path || null;
        if (!next) break;
        url = typeof next === 'string'
            ? (next.startsWith('http') ? next : `${BS_HOST}${next}`)
            : `${base}?` + new URLSearchParams(next);
    }
    return out;
}

/* ---------- fallback: Etherscan‑compatible /api?module=account&action=tokenlist ---------- */
async function fetchCompatTokenList(address) {
    const url = `${BS_V1}?module=account&action=tokenlist&address=${address}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Blockscout compat HTTP ${res.status}`);
    const json = await res.json();
    if (json?.status !== '1') return [];
    return (json.result || []).map((t) =>
        normaliseItem({
            token: {
                address: t.contractAddress,
                symbol: t.symbol,
                name: t.name,
                decimals: t.decimals
            },
            balance: t.balance
        })
    );
}

/**
 * Public API: get all ERC‑20 balances for an ETH address from Blockscout.
 * @param {string} address 0x...
 * @param {{cacheMs?: number}} opts
 * @returns {Promise<Array<{address,symbol,name,decimals,balanceRaw}>>}
 */
export async function getEthTokensFromBlockscout(address, opts = {}) {
    const cacheKey = `kw:bs:eth:tokens:${address.toLowerCase()}`;
    const cacheMs = opts.cacheMs ?? 5 * 60 * 1000; // 5 min default
    const cached = lsGet(cacheKey, cacheMs);
    if (cached) return cached;

    let list = [];
    try {
        list = await fetchV2TokenBalances(address);
    } catch {
        list = await fetchCompatTokenList(address);
    }

    const filtered = list.filter(it => it && it.address && it.balanceRaw && it.balanceRaw !== '0');
    lsSet(cacheKey, filtered);
    return filtered;
}

/**
 * Convenience: convert integer string using decimals -> number (for quick UI).
 * For precise math, use BigInt/decimal in your pricing layer.
 */
export function toUnits(balanceRaw, decimals = 18, precision = 6) {
    try {
        const bi = BigInt(balanceRaw);
        const base = 10n ** BigInt(decimals);
        const whole = bi / base;
        const frac = bi % base;
        const fracStr = frac.toString().padStart(decimals, '0').slice(0, precision);
        return Number(`${whole}.${fracStr}`);
    } catch { return 0; }
}
