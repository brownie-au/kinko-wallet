import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import { createServer } from 'vite';
import { generateAccessKey, deriveAccess, encryptWatchlist } from '../../src/reimagined/crypto.js';
import { createDeviceSessions } from '../../src/reimagined/deviceSession.js';

test('real-mode warnings follow spam/hide rules, display toggles, wallet scope and completed refreshes', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://kinko.test/', pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  let scrolledTo;
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolledTo = this; };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage, indexedDB, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const addr = n => '0x' + String(n).repeat(40), first = addr(1), second = addr(2), genuine = addr(3), spam = addr(4), hidden = addr(5);
  const key = generateAccessKey(), access = await deriveAccess(key);
  let envelope = await encryptWatchlist(access, { version: 1, wallets: [
    { address: first, name: 'Spam only', networks: ['base'] }, { address: second, name: 'Genuine unpriced', networks: ['base'] }
  ], tokens: [], hiddenTokens: [{ chain: 'base', address: hidden }], currency: 'USD', theme: 'light', snapshots: [] });
  await createDeviceSessions().save(key, false, 'cloud');
  const originalFetch = global.fetch;
  let priceUsd = null, gate, release, reads = 0;
  global.fetch = async (url, opts) => {
    if (url === '/api/vault') {
      if (opts?.method === 'PUT') envelope = JSON.parse(opts.body).envelope;
      return { ok: true, json: async () => ({ envelope, revision: 1 }) };
    }
    const req = JSON.parse(opts.body);
    if (req.action === 'fx') return { ok: true, json: async () => ({ rate: 1.5 }) };
    assert.equal(req.action, 'holdings');
    reads++;
    if (gate) await gate;
    const token = (address, name, price) => ({ chain: 'base', wallet: req.address, address, name, symbol: name,
      amountExact: '2', priceChange24h: price == null ? null : 4.25, priceUsd: price, valueUsd: price == null ? null : price * 2 });
    return { ok: true, json: async () => ({ asOf: Date.now(), discovery: 'complete', notices: [], issues: [], rows: [
      token(null, 'ETH', 2), token(spam, 'claim.scam.site', null), token(hidden, 'Manually hidden', null),
      ...(req.address === second ? [token(genuine, 'GENUINE', priceUsd)] : [])
    ] }) };
  };
  const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  let App; try { ({ App } = await vite.ssrLoadModule('/src/reimagined/main.jsx')); } finally { await vite.close(); }
  const root = createRoot(document.querySelector('#root'));
  const until = async predicate => {
    for (let i = 0; i < 150 && !predicate(); i++) await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    assert.ok(predicate(), 'UI did not settle');
  };
  const click = async element => { assert.ok(element); await act(async () => element.click()); };
  const warning = () => document.querySelector('.provider-notice')?.textContent || '';
  const selectWallet = async value => { await act(async () => {
    const select = document.querySelector('#wallet-filter'); select.value = value;
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }); };
  const refreshButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Refresh');
  try {
    await act(async () => root.render(React.createElement(App)));
    await until(() => document.querySelector('.data-notice-link'));
    assert.equal(reads, 2);
    assert.equal(warning(), '', 'Overview keeps the detailed block off the page');
    const overview = () => [...document.querySelectorAll('nav[aria-label="Main navigation"] button')].find(b => b.textContent === 'Overview');
    await click(document.querySelector('.data-notice-link'));
    const section = document.querySelector('.settings-data-notices');
    assert.equal(section, document.querySelector('.settings-grid').lastElementChild);
    assert.equal(scrolledTo, section);
    assert.equal(section.querySelector('details').open, true);
    assert.equal(document.activeElement, section.querySelector('summary'));
    assert.match(section.textContent, /All wallets · All networks/);
    assert.equal(document.querySelector('.data-notice-link'), null, 'compact link appears only on Overview');
    assert.match(warning(), /Base · 1 wallet · Price unavailable/);
    await click(overview());
    await selectWallet(first); assert.equal(document.querySelector('.data-notice-link'), null);
    await selectWallet(second); assert.ok(document.querySelector('.data-notice-link'));
    await click(document.querySelector('.data-notice-link'));
    assert.equal(document.querySelector('.provider-notice').open, true, 'repeated navigation reopens notices');
    assert.match(document.querySelector('.settings-data-notices').textContent, /Genuine unpriced · All networks/);
    await click([...document.querySelectorAll('nav[aria-label="Main navigation"] button')].find(b => b.textContent === 'Assets'));
    assert.equal(document.querySelectorAll('.asset-row').length, 1);
    assert.match(document.querySelector('.asset-table-head').textContent, /24H CHANGE/);
    assert.equal(document.querySelector('.asset-row .asset-change').textContent, '+4.25%');
    await click(document.querySelector('.asset-filters summary'));
    await click(document.querySelector('input[aria-label="Show unpriced tokens"]'));
    await until(() => document.querySelectorAll('.asset-row').length === 2);
    assert.match(warning(), /1 held token has/);
    await until(() => !document.querySelector('input[aria-label="Show unpriced tokens"]').disabled);
    await click(document.querySelector('input[aria-label="Show unpriced tokens"]'));
    await until(() => document.querySelectorAll('.asset-row').length === 1);
    assert.match(warning(), /1 held token has/);
    gate = new Promise(r => { release = r; });
    await click(refreshButton());
    await until(() => reads === 4);
    assert.equal(warning(), '', 'old unpriced rows must not warn while refresh is pending');
    priceUsd = 3; await act(async () => { release(); }); gate = null;
    await until(() => !!refreshButton());
    assert.equal(warning(), '', 'successful new prices must clear the warning');
    gate = new Promise(r => { release = r; });
    await click(refreshButton()); await until(() => reads === 6);
    await selectWallet(first);
    priceUsd = null; await act(async () => { release(); }); gate = null;
    await until(() => !!refreshButton());
    assert.equal(warning(), '', 'a different wallet completing must not leak a warning into this scope');
    await selectWallet(second); assert.match(warning(), /1 held token has/);
    assert.equal(document.querySelectorAll('.asset-row').length, 1, 'unpriced toggle remains off');
  } finally {
    release?.(); act(() => root.unmount()); global.fetch = originalFetch; dom.window.close();
  }
});
