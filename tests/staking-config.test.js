import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const canonical = '0x2b591e99afe9f32eaa6214f7b7629768c40eeb39';

test('HEX staking reads the public contract on the correct chain without environment configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kinko-staking-'));
  try {
    for (const env of [{}, { VITE_PLS_HEX_ADDRESS: '' }, { VITE_PLS_HEX_ADDRESS: '0x' + 'a'.repeat(40) }]) {
      const outfile = join(dir, `staking-${Object.keys(env).length}-${env.VITE_PLS_HEX_ADDRESS?.length || 0}.cjs`);
      await build({
        stdin: { contents: `export * from './src/services/kw-hexPulseService'; export * from './src/config/kw-hex-staking-configs'; export { calls } from 'ethers';`, resolveDir: process.cwd() },
        outfile, bundle: true, platform: 'node', format: 'cjs', define: { 'import.meta.env': JSON.stringify(env) },
        plugins: [{ name: 'read-only-rpc', setup(build) {
          build.onResolve({ filter: /^ethers$/ }, () => ({ path: 'ethers', namespace: 'mock' }));
          build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
            export const calls = [];
            class StaticJsonRpcProvider { constructor(url, network) { this.network = network; } }
            class FallbackProvider { constructor(configs) { this.network = configs[0].provider.network; } }
            class Contract { constructor(address, abi, provider) { calls.push({ address, chainId: provider.network.chainId }); } async currentDay() { return 2511; } }
            export const ethers = { providers: { StaticJsonRpcProvider, FallbackProvider }, Contract };
          ` }));
        } }]
      });
      const mod = require(outfile);
      assert.equal(await mod.fetchHexCurrentDay(), 2511);
      assert.deepEqual(mod.calls.pop(), { address: env.VITE_PLS_HEX_ADDRESS || canonical, chainId: 369 });
      assert.equal(await mod.fetchHexCurrentDay(mod.KW_STAKING_EHEX_ETH), 2511);
      assert.deepEqual(mod.calls.pop(), { address: canonical, chainId: 1 });
      await assert.rejects(mod.fetchHexCurrentDay({ hexAddress: 'invalid' }), /Invalid HEX/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
