import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPrices } from '../../src/reimagined/blockchain.js';
import { NETWORKS } from '../../src/reimagined/networks.js';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const ok = data => ({ ok: true, json: async () => data });
const address = n => '0x' + n.toString(16).padStart(40, '0');

test('same-source 24h changes preserve signs and zero; missing, stale or invalid history stays unavailable', async () => {
  const original = global.fetch, now = Math.floor(Date.now()/1000);
  const previous = [80, 100, 100, null, 0, Infinity, 100];
  global.fetch = async url => {
    const historical = url.includes('/historical/');
    return ok({coins: Object.fromEntries(previous.map((p,i) => [`ethereum:${address(i+1)}`, {
      price: historical ? p : [100,80,100,100,100,100,100][i],
      timestamp: historical ? now-86400-(i===6 ? 7200 : 0) : now
    }]))});
  };
  try {
    const rows = await addPrices('eth', previous.map((_,i)=>({address:address(i+1),amountExact:'2'})));
    assert.deepEqual(rows.map(r => r.priceChange24h == null ? null : Math.round(r.priceChange24h)), [25,-20,0,null,null,null,null]);
    assert.equal(rows[0].valueUsd,200);
    global.fetch = async url => url.includes('/historical/') ? {ok:false,status:503} : ok({coins:{'coingecko:ethereum':{price:2000,timestamp:now}}});
    const [native] = await addPrices('base',[{address:null,amountExact:'1'}]);
    assert.equal(native.priceUsd,2000);
    assert.equal(native.priceChange24h,null);
  } finally { global.fetch=original; }
});

test('DEX changes use the chosen liquid base-token market on all networks including native coins', async () => {
  const original=global.fetch;
  try {
    for (const [chain,n] of Object.entries(NETWORKS)) {
      global.fetch=async url => url.includes('llama.fi') ? ok({coins:{}}) : ok([
        {chainId:'wrong',baseToken:{address:n.wrappedNative},priceUsd:'99',liquidity:{usd:900000},priceChange:{h24:999}},
        {chainId:n.dex,baseToken:{address:n.wrappedNative},priceUsd:'3',liquidity:{usd:9000},priceChange:{h24:999}},
        {chainId:n.dex,baseToken:{address:n.wrappedNative},priceUsd:'2',liquidity:{usd:20000},priceChange:{h24:-7.25}},
        ...[null,0,'bad',Infinity].map((h24,i)=>({chainId:n.dex,baseToken:{address:address(i+1)},priceUsd:'1',liquidity:{usd:20000},priceChange:{h24}}))
      ]);
      const rows=await addPrices(chain,[{address:null,amountExact:'2'},...[1,2,3,4].map(i=>({address:address(i),amountExact:'1'}))]);
      assert.deepEqual(rows.map(r=>r.priceChange24h),[-7.25,null,0,null,null]);
      assert.equal(rows[0].valueUsd,4);
      assert.equal(rows[0].change24hSource,'Dexscreener');
    }
  } finally { global.fetch=original; }
});

test('24h display distinguishes gains, losses, unchanged and missing data without negative zero', async () => {
  const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  let PriceChange; try { ({PriceChange}=await vite.ssrLoadModule('/src/reimagined/ui.jsx')); } finally { await vite.close(); }
  const render=token=>renderToStaticMarkup(React.createElement(PriceChange,{token:{priceUsd:1,...token}}));
  assert.match(render({priceChange24h:12.345}), /gain.*\+12.35%/);
  assert.match(render({priceChange24h:-2}), /loss.*-2.00%/);
  assert.match(render({priceChange24h:0}), /neutral.*0.00%/);
  assert.doesNotMatch(render({priceChange24h:-0.001}), /-0.00/);
  for (const value of [null,undefined,NaN,Infinity]) assert.match(render({priceChange24h:value}), /unavailable.*—/);
  assert.match(render({priceChange24h:5,stale:true}), /cached/);
  assert.match(render({priceChange24h:5,priceUsd:null}), /unavailable/);
});
