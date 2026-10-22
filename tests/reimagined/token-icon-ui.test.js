import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

test('token images retain initials on failure and reset correctly when identity changes', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  let TokenIcon;
  try { ({ TokenIcon } = await server.ssrLoadModule('/src/reimagined/ui.jsx')); }
  finally { await server.close(); }
  const root = createRoot(document.querySelector('#root'));
  const render = (props) => act(() => root.render(React.createElement(TokenIcon, props)));
  try {
    const address = '0x1234567890123456789012345678901234567890';
    render({ symbol: 'HEX', chain: 'base', address });
    let img = document.querySelector('img');
    assert.match(img.src, /chain=base&address=/, 'a HEX ticker alone must not receive the HEX logo');
    assert.equal(img.getAttribute('loading'), 'lazy');
    assert.equal(img.alt, '');
    act(() => img.dispatchEvent(new dom.window.Event('error')));
    assert.equal(document.querySelector('img'), null);
    assert.match(document.querySelector('.token-icon').textContent, /HE/);
    render({ symbol: 'OTHER', chain: 'base', address });
    assert.equal(document.querySelector('img'), null, 'do not retry a known failed URL each render');
    render({ symbol: 'BNB', chain: 'bsc', address: null });
    img = document.querySelector('img');
    assert.equal(img.getAttribute('src'), '/assets/tokens/bnb.png');
    act(() => img.dispatchEvent(new dom.window.Event('load')));
    assert.equal(img.className, 'loaded');
    assert.equal(document.querySelector('.token-initials'), null);
    render({ symbol: 'ETH', chain: 'eth' });
    assert.equal(document.querySelector('img'), null, 'missing address must not become a native asset');
    assert.equal(document.querySelector('.token-initials').textContent, 'ET');
    assert.ok(document.querySelector('.token-icon > i'), 'network marker stays present');
  } finally { act(() => root.unmount()); dom.window.close(); }
});
