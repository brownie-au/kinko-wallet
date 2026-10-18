import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('exact balances remain readable without hover; network filters expose their selected state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kinko-ui-'));
  try {
    const outfile = join(dir, 'ui.cjs');
    await build({
      stdin: { contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import ExactAmount from './src/components/ExactAmount.jsx';
        import { ChainSelector } from './src/components/ChainUI.jsx';
        export const exact = renderToStaticMarkup(<ExactAmount value="9007199254740993.000000000000000001">9Q</ExactAmount>);
        export const zero = renderToStaticMarkup(<ExactAmount value="0">0</ExactAmount>);
        export const missing = renderToStaticMarkup(<ExactAmount value={null}>Unavailable</ExactAmount>);
        export const filters = renderToStaticMarkup(<ChainSelector value="pulse" />);
      `, resolveDir: process.cwd(), loader: 'jsx' },
      outfile, bundle: true, format: 'cjs', platform: 'node', jsx: 'automatic'
    });
    const result = require(outfile);
    assert.match(result.exact, /<details/);
    assert.match(result.exact, /<summary/);
    assert.match(result.exact, />9007199254740993\.000000000000000001<\/span>/);
    assert.match(result.zero, />0<\/span>/);
    assert.equal(result.missing, '<span>Unavailable</span>');
    assert.equal((result.filters.match(/aria-pressed="true"/g) || []).length, 1);
    assert.match(result.filters, /aria-pressed="true"[^>]*>PulseChain<\/button>/);
    assert.match(result.filters, /aria-label="Filter by network"/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
