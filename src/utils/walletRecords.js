export const NETWORKS = ['eth', 'pulse', 'bsc', 'polygon', 'base'];
export const isWalletAddress = (v) => /^0x[0-9a-fA-F]{40}$/.test(String(v || '').trim());
export function normalizeWallets(input, { strict = false } = {}) {
  if (!Array.isArray(input)) throw new Error('Wallet backup must contain a wallet list.');
  if (input.length > 1000) throw new Error('A maximum of 1,000 wallets can be imported.');
  const seen = new Set();
  const out = [];
  for (const w of input) {
    if (!isWalletAddress(w?.address)) {
      if (strict) throw new Error('The wallet list contains an invalid public address.');
      continue;
    }
    const address = w.address.trim();
    const key = address.toLowerCase();
    const networks = Array.isArray(w.networks) ? [...new Set(w.networks.filter((n) => NETWORKS.includes(n)))] : [...NETWORKS];
    if (!networks.length) {
      if (strict) throw new Error('Select at least one supported network for each wallet.');
      networks.push(...NETWORKS);
    }
    if (seen.has(key)) {
      const existing = out.find((item) => item.address.toLowerCase() === key);
      existing.networks = [...new Set([...existing.networks, ...networks])];
      continue;
    }
    seen.add(key);
    out.push({
      address,
      name: String(w.name || '')
        .trim()
        .slice(0, 120),
      hidden: !!w.hidden,
      networks
    });
  }
  return out;
}
export function parseWalletBackup(text) {
  const data = JSON.parse(text);
  if (!Array.isArray(data) && (data?.app !== 'Kinko Wallet' || data.version !== 1)) throw new Error('Unsupported wallet backup.');
  return normalizeWallets(Array.isArray(data) ? data : data.wallets, { strict: true });
}
