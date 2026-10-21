import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import { createServer } from 'vite';
import { generateAccessKey, deriveAccess, encryptWatchlist } from '../../src/reimagined/crypto.js';
import { createDeviceSessions } from '../../src/reimagined/deviceSession.js';

test('real-mode app displays its first partial reading, refreshes automatically, and restores encrypted readings on remount', async (t) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://kinko.test/',
    pretendToBeVisual: true
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  dom.window.scrollTo = () => {};
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.indexedDB = indexedDB;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const address = '0x' + '1'.repeat(40),
    key = generateAccessKey(),
    access = await deriveAccess(key);
  let envelope = await encryptWatchlist(access, {
    version: 1,
    wallets: [{ address, name: 'Integration test', networks: ['bsc'] }],
    tokens: [],
    currency: 'USD',
    theme: 'light',
    snapshots: []
  });
  await createDeviceSessions().save(key, true, 'cloud');
  const previousFetch = global.fetch;
  let failHoldings = false, holdHoldings = false, releaseHoldings;
  let reads = 0,
    root;
  const now = Date.now();
  global.fetch = async (url, options) => ({
    ok: true,
    json: async () => {
      if (url === '/api/vault') {
        if (options?.method === 'PUT') envelope = JSON.parse(options.body).envelope;
        return { envelope, revision: 1 };
      }
      const request = JSON.parse(options.body);
      if (request.action === 'fx') return { rate: 1.5, date: '2026-10-20' };
      if (request.action === 'holdings') {
        if (holdHoldings) await new Promise((resolve) => { releaseHoldings = resolve; });
        if (failHoldings) throw new Error('Network unavailable');
        return {
          asOf: now + reads++ * 61000,
          discovery: 'manual',
          issues: ['Manual token discovery'],
          notices: [
            {
              code: 'discovery-manual',
              kind: 'limitation',
              message: 'Native balance available; discovery is manual.',
              action: 'track-token'
            }
          ],
          filtered: [{ address: '0x' + '4'.repeat(40), symbol: 'FLAGGED', reason: 'Flagged by the token provider' }],
          rows: [
            {
              chain: 'bsc',
              wallet: address,
              address: null,
              symbol: 'BNB',
              name: 'BNB',
              amountExact: '2',
              priceUsd: 100,
              valueUsd: 200,
              valueExact: '200'
            },
            { chain: 'bsc', wallet: address, address: '0x' + '2'.repeat(40), symbol: 'DUST', name: 'Legitimate dust', amountExact: '0.0001', priceUsd: 1, valueUsd: 0.0001, valueExact: '0.0001' },
            ...Array.from({ length: 200 }, (_, i) => ({ chain: 'bsc', wallet: address, address: '0x' + (1000 + i).toString(16).padStart(40, '0'), symbol: `UNKNOWN${i}`, name: 'Unknown airdrop', amountExact: '100', priceUsd: null, valueUsd: null, valueExact: null })),
            { chain: 'bsc', wallet: address, address: '0x' + '3'.repeat(40), symbol: 'SCAM', name: 'Claim: scam.site', amountExact: '1', priceUsd: 1000, valueUsd: 1000, valueExact: '1000' }
          ]
        };
      }
      return { stakes: [] };
    }
  });
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  let App;
  try {
    ({ App } = await server.ssrLoadModule('/src/reimagined/main.jsx'));
  } finally {
    await server.close();
  }
  const until = async (predicate) => {
    for (let i = 0; i < 100 && !predicate(); i++)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    assert.ok(predicate(), 'application state did not settle');
  };
  try {
    t.mock.timers.enable({ apis: ['setInterval'] });
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(App)));
    await until(() => document.querySelectorAll('.reading-table tbody tr').length === 1);
    assert.match(document.querySelector('.chart-amount').textContent, /200\.00/);
    assert.equal(document.querySelector('.provider-notice').open, false);
    assert.match(document.querySelector('.reading-table').textContent, /Partial/);
    await act(async () => t.mock.timers.tick(120000));
    await until(() => document.querySelectorAll('.reading-table tbody tr').length === 2);
    assert.equal(reads, 2);
    assert.ok(document.querySelector('.history-panel .history-chart'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    const stored = Object.keys(localStorage).find((k) => k.startsWith('kinko:portfolio-history:'));
    assert.ok(stored);
    assert.ok(!localStorage.getItem(stored).includes('Integration test'));
    assert.ok(!localStorage.getItem(stored).includes('all:all'));
    failHoldings = true;
    await act(async () => t.mock.timers.tick(120000));
    await until(() => document.querySelector('.history-status')?.textContent.includes('Some networks unavailable'));
    assert.ok(document.querySelector('.history-panel .history-chart'), 'failed refresh retains the chart');
    assert.equal(document.querySelectorAll('.reading-table tbody tr').length, 2);
    failHoldings = false;
    holdHoldings = true;
    act(() => root.unmount());
    t.mock.timers.reset();
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(App)));
    await until(() => document.querySelectorAll('.reading-table tbody tr').length >= 2);
    assert.ok(document.querySelector('.history-panel .history-chart'));
    assert.ok(!document.querySelector('.history-panel').textContent.includes('Your history starts here'));
    await until(() => !!releaseHoldings);
    assert.match(document.querySelector('.history-status').textContent, /Updating/);
    assert.equal(reads, 2, 'saved chart restores before fresh network balances finish');
    holdHoldings = false;
    await act(async () => releaseHoldings());
    await until(() => !document.querySelector('.history-status').textContent.includes('Updating'));
    const click = async (element) => { assert.ok(element); await act(async () => element.click()); };
    await click([...document.querySelectorAll('nav[aria-label="Main navigation"] button')].find((b) => b.textContent.includes('Assets')));
    assert.equal(document.querySelectorAll('.asset-row').length, 1);
    assert.ok(![...document.querySelectorAll('.asset-row')].some((r) => r.textContent.includes('SCAM')));
    assert.match(document.querySelector('.filtered-tokens summary').textContent, /2 filtered/);
    assert.equal(document.querySelector('.asset-filters').open, false);
    await click(document.querySelector('.asset-filters summary'));
    assert.equal(document.querySelector('.asset-filters').open, true);
    assert.match(document.querySelector('.asset-filters').textContent, /Show unpriced tokens \(200\)/);
    await click(document.querySelector('input[aria-label="Show unpriced tokens"]'));
    await until(() => document.querySelectorAll('.asset-row').length === 201);
    await until(() => !document.querySelector('input[aria-label="Show unpriced tokens"]').disabled);
    await click(document.querySelector('input[aria-label="Show unpriced tokens"]'));
    await until(() => document.querySelectorAll('.asset-row').length === 1);
    await until(() => !document.querySelector('input[aria-label="Show unpriced tokens"]').disabled);
    act(() => root.unmount());
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(App)));
    await until(() => document.querySelectorAll('.reading-table tbody tr').length >= 2);
    await click([...document.querySelectorAll('nav[aria-label="Main navigation"] button')].find((b) => b.textContent.includes('Assets')));
    assert.equal(document.querySelector('.asset-filters').open, false);
    await click(document.querySelector('.asset-filters summary'));
    assert.equal(document.querySelector('input[aria-label="Show unpriced tokens"]').checked, false);
    assert.equal(document.querySelectorAll('.asset-row').length, 1);

    assert.equal(document.querySelector('input[aria-label="Hide dust balances"]').checked, true);
    assert.equal(document.querySelectorAll('.asset-row').length, 1);
    await click(document.querySelector('.asset-row'));
    assert.ok(![...document.querySelectorAll('.modal button')].some((b) => b.textContent === 'Hide token'));
    await click(document.querySelector('button[aria-label="Close dialog"]'));
    await click(document.querySelector('input[aria-label="Hide dust balances"]'));
    assert.equal(document.querySelector('input[aria-label="Hide dust balances"]').checked, false);
    assert.equal(document.querySelectorAll('.asset-row').length, 2);
    await click([...document.querySelectorAll('.asset-row')].find((r) => r.textContent.includes('DUST')));
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Hide token'));
    await until(() => document.querySelectorAll('.asset-row').length === 1 && !document.querySelector('button[aria-label="Close dialog"]'));
    assert.match(document.querySelector('.filtered-tokens').textContent, /Hidden by you/);
    await click([...document.querySelectorAll('.filtered-tokens button')].find((b) => b.textContent === 'Restore'));
    await until(() => document.querySelectorAll('.asset-row').length === 2);
    await click(document.querySelector('.filtered-tokens button'));
    assert.equal(document.querySelector('#token-chain').value, 'bsc');
    assert.match(document.querySelector('#token-contract').value, /^0x[34]{40}$/);

  } finally {
    if (root) act(() => root.unmount());
    t.mock.timers.reset();
    global.fetch = previousFetch;
    dom.window.close();
  }
});
