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
  const envelope = await encryptWatchlist(access, {
    version: 1,
    wallets: [{ address, name: 'Integration test', networks: ['bsc'] }],
    tokens: [],
    currency: 'USD',
    theme: 'light',
    snapshots: []
  });
  await createDeviceSessions().save(key, true, 'cloud');
  const previousFetch = global.fetch;
  let reads = 0,
    root;
  const now = Date.now();
  global.fetch = async (url, options) => ({
    ok: true,
    json: async () => {
      if (url === '/api/vault') return { envelope, revision: 1 };
      const request = JSON.parse(options.body);
      if (request.action === 'fx') return { rate: 1.5, date: '2026-10-20' };
      if (request.action === 'holdings')
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
            }
          ]
        };
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
    act(() => root.unmount());
    t.mock.timers.reset();
    root = createRoot(document.querySelector('#root'));
    await act(async () => root.render(React.createElement(App)));
    await until(() => document.querySelectorAll('.reading-table tbody tr').length >= 2);
    assert.ok(document.querySelector('.history-panel .history-chart'));
    assert.ok(!document.querySelector('.history-panel').textContent.includes('Your history starts here'));
  } finally {
    if (root) act(() => root.unmount());
    t.mock.timers.reset();
    global.fetch = previousFetch;
    dom.window.close();
  }
});
