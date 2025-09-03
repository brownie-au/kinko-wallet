// Remote Portfolio ID sync helpers
// Usage:
//   import { createOrUpdateRemote, importFromRemote } from './services/portfolioRemote';
//   const id = await createOrUpdateRemote(wallets[, id]);
//   const wallets = await importFromRemote(id);

/**
 * @typedef {{ address: string; name?: string }} WalletLite
 */

/**
 * Create or update a remote portfolio entry.
 * @param {WalletLite[]} wallets
 * @param {string=} id Optional existing portfolio ID to update
 * @returns {Promise<string>} The portfolio ID
 */
export async function createOrUpdateRemote(wallets, id) {
  const r = await fetch(`/api/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, wallets })
  });
  if (!r.ok) throw new Error(`Create failed: ${r.status}`);
  const data = await r.json();
  return data.id;
}

/**
 * Import wallets from a remote portfolio by ID.
 * @param {string} id
 * @returns {Promise<WalletLite[]>}
 */
export async function importFromRemote(id) {
  const r = await fetch(`/api/portfolio?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(r.status === 404 ? 'Not found' : `Fetch failed: ${r.status}`);
  const data = await r.json();
  return data.wallets || [];
}

