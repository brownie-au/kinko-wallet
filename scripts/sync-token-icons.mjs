// Refresh only the small bundled seed set; additional tokens load on demand.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readTokenIcon } from '../src/server/tokenIconSource.js';

const seeds = JSON.parse(await readFile(new URL('./token-icon-seeds.json', import.meta.url), 'utf8'));
const receipts = await Promise.all(Object.entries(seeds).map(async ([name, source]) => {
  const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const bytes = await readTokenIcon(response);
  await writeFile(new URL(`../public/assets/tokens/${name}.png`, import.meta.url), bytes);
  return { name, source, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
await writeFile(new URL('../docs/token-icon-sources.json', import.meta.url), JSON.stringify(receipts, null, 2) + '\n');
console.log(`Updated ${receipts.length} bundled icons. Review the image changes before committing.`);
