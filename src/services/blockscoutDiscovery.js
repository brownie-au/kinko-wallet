import { isWalletAddress } from '../utils/walletRecords.js';

// Blockscout exposes token balances as an array or paginated items.
export async function discoverBlockscoutTokens(base, address, { maxPages = 25 } = {}) {
  if (!isWalletAddress(address)) throw new Error('Invalid public wallet address');
  const endpoint = `${base.replace(/\/+$/, '')}/addresses/${address}/token-balances`;
  let url = `${endpoint}?type=ERC-20`;
  const seen = new Set();
  const tokens = new Map();
  for (let page = 0; page < maxPages; page++) {
    if (seen.has(url)) throw new Error('Token discovery returned a repeated page; coverage is incomplete.');
    seen.add(url);
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`Token discovery unavailable (HTTP ${res.status})`);
    const data = await res.json();
    const items = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(items)) throw new Error('Invalid token discovery response');
    for (const item of items) {
      const t = item?.token || item;
      if (t.type && t.type !== 'ERC-20') continue;
      const contract = String(t.address_hash || t.address || t.contract_address || '').toLowerCase();
      const raw = String(item.value ?? item.balance ?? '');
      if (t.decimals == null && /^\d+$/.test(raw) && BigInt(raw) > 0n && isWalletAddress(contract))
        throw new Error('Token decimals unavailable; discovery is incomplete.');
      const decimals = Number(t.decimals);
      if (!isWalletAddress(contract) || !/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) continue;
      if (BigInt(raw) === 0n) continue;
      tokens.set(contract, {
        address: contract,
        name: String(t.name || 'Token').slice(0, 200),
        symbol: String(t.symbol || '').slice(0, 40),
        decimals,
        balanceRaw: raw,
        priceUsd: Number(t.exchange_rate) > 0 ? Number(t.exchange_rate) : null,
        possible_spam: t.is_spam === true,
        iconUrl: t.icon_url || null
      });
    }
    const next = data?.next_page_params;
    if (!next) return [...tokens.values()];
    url = `${endpoint}?${new URLSearchParams({ ...next, type: 'ERC-20' })}`;
  }
  throw new Error('Token discovery page limit reached; coverage is incomplete.');
}
