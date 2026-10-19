import { encryptWatchlist, decryptWatchlist } from './crypto.js';
import { normalizeWallets } from '../utils/walletRecords.js';
export const blankWatchlist = () => ({ version: 1, wallets: [], currency: 'USD', theme: 'light', tokens: [], snapshots: [] });
export function validateWatchlist(data) {
  if (data?.version !== 1) throw new Error('Unsupported watchlist version.');
  const tokens = Array.isArray(data.tokens)
    ? data.tokens.slice(0, 30).map((t) => {
        if (!['eth', 'pulse', 'base', 'polygon', 'bsc'].includes(t?.chain) || !/^0x[a-fA-F0-9]{40}$/.test(t?.address || ''))
          throw new Error('Invalid custom token contract.');
        return { chain: t.chain, address: t.address.toLowerCase() };
      })
    : [];
  return {
    version: 1,
    tokens,
    wallets: normalizeWallets(data.wallets, { strict: true }),
    currency: data.currency === 'AUD' ? 'AUD' : 'USD',
    theme: data.theme === 'dark' ? 'dark' : 'light',
    snapshots: []
  };
}
export async function vaultRequest(access, method, body) {
  const response = await fetch('/api/vault', {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Kinko-Account': access.id, Authorization: `Bearer ${access.auth}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Encrypted sync unavailable. Keep this tab open and export an encrypted backup.');
    error.status = response.status;
    throw error;
  }
  return result;
}
export async function createVault(access, data) {
  return vaultRequest(access, 'POST', { envelope: await encryptWatchlist(access, validateWatchlist(data)) });
}
export async function readVault(access) {
  const record = await vaultRequest(access, 'GET');
  return { data: validateWatchlist(await decryptWatchlist(access, record.envelope)), revision: record.revision };
}
export async function saveVault(access, data, revision) {
  return vaultRequest(access, 'PUT', { envelope: await encryptWatchlist(access, validateWatchlist(data)), revision });
}
export function writeLocalEncrypted(access, envelope, revision) {
  // No raw Access Key, names, addresses, or authorization secret in local storage.
  localStorage.setItem(`kinko:vault:${access.id}`, JSON.stringify({ envelope, revision }));
}
export function clearCachedPublicData() {
  for (const key of Object.keys(localStorage))
    if (key.startsWith('kinko:market:') || key.startsWith('kinko:snapshots:')) localStorage.removeItem(key);
}
