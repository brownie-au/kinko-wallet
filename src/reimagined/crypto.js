// Access keys restore Kinko data only. Never accepts a cryptocurrency key.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const hex = (bytes) => [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g) || [], (n) => parseInt(n, 16));
const b64 = (a) => btoa(String.fromCharCode(...new Uint8Array(a)));
const unb64 = (a) => Uint8Array.from(atob(a), (c) => c.charCodeAt(0));
export function generateAccessKey() {
  return (
    'KINKO-' +
    hex(crypto.getRandomValues(new Uint8Array(32)))
      .toUpperCase()
      .match(/.{8}/g)
      .join('-')
  );
}
export function normalizeKey(input) {
  const value = String(input).trim().toUpperCase();
  // The explicit prefix prevents accidentally accepting a 64-digit crypto private key.
  if (!/^KINKO-(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/.test(value))
    throw new Error('Enter a Kinko Access Key beginning KINKO-. Never enter a seed phrase or cryptocurrency private key.');
  return value;
}
export async function deriveAccess(input) {
  const key = normalizeKey(input);
  const material = await crypto.subtle.importKey('raw', unhex(key.slice(6).replaceAll('-', '')), 'HKDF', false, ['deriveBits']);
  const derive = async (label) =>
    crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('Kinko Wallet vault v1'), info: enc.encode(label) },
      material,
      256
    );
  const [id, auth, raw] = await Promise.all(['lookup', 'authorization', 'encryption'].map(derive));
  const encryptionKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { id: hex(id), auth: hex(auth), encryptionKey };
}
export async function encryptWatchlist(access, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(`kinko:v1:${access.id}`) },
    access.encryptionKey,
    enc.encode(JSON.stringify(data))
  );
  return { version: 1, iv: b64(iv), ciphertext: b64(ciphertext) };
}
export async function decryptWatchlist(access, envelope) {
  if (envelope?.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string')
    throw new Error('Unsupported encrypted backup.');
  try {
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(envelope.iv), additionalData: enc.encode(`kinko:v1:${access.id}`) },
      access.encryptionKey,
      unb64(envelope.ciphertext)
    );
    return JSON.parse(dec.decode(bytes));
  } catch {
    throw new Error('This key cannot unlock the watchlist, or the encrypted data is damaged.');
  }
}
