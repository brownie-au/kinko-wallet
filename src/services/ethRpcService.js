// Reads native ETH balance using public RPCs from .env (no API key)
const RPCS = (import.meta.env.VITE_ETH_RPC_URLS || import.meta.env.VITE_ETH_RPC_URL || 'https://cloudflare-eth.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

async function rpc(url, method, params) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    if (!res.ok) throw new Error(`RPC ${url} HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(`RPC ${url} ${j.error.message}`);
    return j.result;
}

export async function getEthNativeBalance(address) {
    let lastErr;
    for (const url of RPCS) {
        try {
            const hex = await rpc(url, 'eth_getBalance', [address, 'latest']);
            // hex -> number (keep 6 decimals for display)
            const bi = BigInt(hex);
            const whole = bi / (10n ** 18n);
            const frac = (bi % (10n ** 18n)).toString().padStart(18, '0').slice(0, 6);
            return Number(`${whole}.${frac}`);
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No working ETH RPC');
}
