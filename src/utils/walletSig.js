// src/utils/walletSig.js
// Create a stable signature for the current wallet set (address + chain + label).
// No external dependencies. Uses FNV-1a 32-bit hash -> base36 string.

function fnv1a32(str) {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619 (FNV prime) using bit ops to stay in 32-bit space
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0); // unsigned
}

export function walletSignature(wallets) {
  const rows = (wallets || []).map((w) => ({
    chain: String(w.chain || '').toLowerCase(),
    address: String(w.address || '').toLowerCase(),
    label: String(w.label || w.name || '')
  }));
  // stable sort
  rows.sort((a, b) => {
    const sa = a.chain + ':' + a.address + ':' + a.label;
    const sb = b.chain + ':' + b.address + ':' + b.label;
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
  const payload = JSON.stringify(rows);
  // return short, deterministic signature
  return fnv1a32(payload).toString(36);
}
