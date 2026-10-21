import { getAddress } from 'ethers';

const folders = { eth: 'ethereum', base: 'base', bsc: 'smartchain', polygon: 'polygon' };
export function tokenIconSource(chain, address) {
  if (typeof address !== 'string' || !/^0x[0-9a-f]{40}$/i.test(address)) return null;
  const checksum = getAddress(address.toLowerCase());
  if (chain === 'pulse')
    return `https://raw.githubusercontent.com/PLS369/pulsechain-assets/main/blockchain/pulsechain/assets/${checksum}/logo.png`;
  if (!Object.hasOwn(folders, chain)) return null;
  return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folders[chain]}/assets/${checksum}/logo.png`;
}

const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
export function isPng(bytes) {
  return bytes.length >= 24 && PNG.every((value, i) => bytes[i] === value) &&
    String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR';
}

export async function readTokenIcon(response) {
  const limit = 512 * 1024;
  if (!/^image\/png(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Not a PNG');
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Icon too large');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('Icon too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  if (!isPng(bytes)) throw new Error('Invalid PNG');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 2048 || height > 2048) throw new Error('Invalid dimensions');
  return bytes;
}
