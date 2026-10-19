import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { addPrices, holdings } from '../../src/reimagined/blockchain.js';
import { indexedDiscovery, createIndexerPacer } from '../../src/server/tokenDiscovery.js';
import handler from '../../api/data.js';
const wallet = '0x' + '1'.repeat(40), contract = '0x' + '2'.repeat(40);
const address = (n) => '0x' + n.toString(16).padStart(40, '0');
const ok = (data) => ({ ok: true, json: async () => data });
async function withFetch(fetch, task) {
  const prior = global.fetch;
  // These tests exercise the Token API fallback; Portfolio API is covered separately.
  global.fetch = (url, ...args) => url.includes('/assets/tokens/by-address') ? Promise.resolve({ ok: false, status: 404 }) : fetch(url, ...args);
  try { await task(); } finally { global.fetch = prior; }
}
const pair = (chain, token, price = '2', liquidity = 20000) => ({ chainId: chain, baseToken: { address: token }, priceUsd: price, liquidity: { usd: liquidity } });

test('price recovery covers every batch past 30 and preserves exact quantities', async () => {
  const tokens = Array.from({length: 65}, (_, i) => ({address: address(i + 1), amountExact: '1.23456789'})), batches = [];
  await withFetch(async (url) => {
    if (url.includes('llama.fi')) return ok({ coins: {} });
    assert.match(url, /tokens\/v1\/pulsechain\//);
    const contracts = url.split('/').at(-1).split(','); batches.push(contracts.length);
    return ok(contracts.map((c) => pair('pulsechain', c.toUpperCase().replace('0X', '0x'))));
  }, async () => {
    const rows = await addPrices('pulse', tokens);
    assert.deepEqual(batches, [30,30,5]);
    assert.equal(rows.filter((r) => r.priceUsd === 2).length, 65);
    assert.equal(rows[64].valueExact, '2.46913578');
    assert.equal(rows[64].amountExact, '1.23456789');
  });
});
test('all networks recover missing/stale prices without cross-chain, quote-side or illiquid contamination', async () => {
  for (const [chain, dex] of [['eth','ethereum'], ['base','base'], ['polygon','polygon'], ['bsc','bsc'], ['pulse','pulsechain']]) {
    await withFetch(async (url) => {
      if (url.includes('llama.fi')) return ok({coins: {[`${chain === 'eth' ? 'ethereum' : chain === 'pulse' ? 'pulsechain' : chain}:${contract}`]: {price: 999, timestamp: Date.now()/1000 - 30000}}});
      assert.match(url, new RegExp(`/tokens/v1/${dex}/`));
      return ok([pair('wrong',contract,'999'), {...pair(dex,address(3),'999'), quoteToken:{address:contract}}, pair(dex,contract,'999',9999), pair(dex,contract,'Infinity',900000), pair(dex,contract,'3',30000), pair(dex,contract,'2',20000)]);
    }, async () => {
      const [row] = await addPrices(chain, [{address:contract,amountExact:'2'}]);
      assert.equal(row.priceUsd, 3); assert.equal(row.valueExact,'6'); assert.equal(row.priceSource,'Dexscreener');
    });
  }
});
test('a failed DEX batch does not prevent later batches and fresh primary prices remain primary', async () => {
  const tokens = Array.from({length:32}, (_,i)=>({address:address(i+1),amountExact:'1'}));
  let calls=0;
  await withFetch(async (url) => {
    if (url.includes('llama.fi')) return ok({coins:{[`ethereum:${address(1)}`]:{price:7,timestamp:Date.now()/1000}}});
    if (++calls === 1) return {ok:false,status:503};
    return ok([pair('ethereum',address(32),'4')]);
  }, async () => {
    const rows=await addPrices('eth',tokens);
    assert.equal(rows[0].priceUsd,7); assert.equal(rows[0].priceSource,'DefiLlama');
    assert.equal(rows[1].priceUsd,null); assert.equal(rows.at(-1).priceUsd,4);
  });
});
test('missing explorer decimals are repaired with pinned on-chain balance and precision', async () => {
  const abi = new Interface(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function name() view returns(string)']);
  await withFetch(async (url, options) => {
    if (url.includes('/addresses/')) return ok({items:[{value:'999999999999999999',token:{type:'ERC-20',address_hash:contract,decimals:null}}]});
    if (!options?.body) return ok({coins:{}});
    const req=JSON.parse(options.body);
    if(req.method==='eth_chainId') return ok({result:'0x171'});
    if(req.method==='eth_blockNumber') return ok({result:'0x123'});
    if(req.method==='eth_getBalance') return ok({result:'0x0'});
    assert.equal(req.params[1],'0x123');
    const call=abi.parseTransaction({data:req.params[0].data});
    const result=call.name==='decimals'?[6]:call.name==='balanceOf'?[1234567]:[call.name==='symbol'?'REAL':'Real token'];
    return ok({result:abi.encodeFunctionResult(call.name,result)});
  }, async () => {
    const result=await holdings('pulse',wallet);
    assert.equal(result.rows.find(r=>r.address===contract).amountExact,'1.234567');
    assert.equal(result.discovery,'complete');
    assert.equal(result.notices.some(n=>n.code==='discovery-metadata'),false);
  });
});
test('metadata repair stays bounded and unresolved records retain their notice', async()=>{
  const abi = new Interface(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function name() view returns(string)']);
  const queried=new Set();
  await withFetch(async(url,options)=>{
    if(url.includes('/addresses/'))return ok({items:Array.from({length:20},(_,i)=>({value:'1',token:{type:'ERC-20',address_hash:address(i+20),decimals:null}}))});
    if(!options?.body)return ok({coins:{}});
    const req=JSON.parse(options.body);
    if(req.method==='eth_chainId')return ok({result:'0x171'});
    if(req.method==='eth_blockNumber')return ok({result:'0x123'});
    if(req.method==='eth_getBalance')return ok({result:'0x0'});
    queried.add(req.params[0].to);
    const call=abi.parseTransaction({data:req.params[0].data});
    if(call.name==='decimals'&&req.params[0].to===address(20))throw Error('unreadable');
    return ok({result:abi.encodeFunctionResult(call.name,call.name==='decimals'?[18]:call.name==='balanceOf'?[0]:['TOKEN'])});
  },async()=>{
    const result=await holdings('pulse',wallet);
    assert.equal(queried.size,13); // 12 metadata candidates plus mandatory HEX.
    assert.equal(result.discovery,'partial'); assert.equal(result.notices.find(n=>n.code==='discovery-metadata').skipped,9);
  });
});
const indexed = (c=contract, more={}) => ({contractAddress:c,tokenBalance:'0x12d687',...more});
const metadata = {decimals:6,symbol:'TEST',name:'Test'};
const request=(options)=>JSON.parse(options.body);
test('authenticated discovery verifies chain and wallet, paginates, deduplicates and keeps credentials server-side',async()=>{
  let pages=0;
  await withFetch(async(url,options)=>{
    assert.equal(url,'https://bnb-mainnet.g.alchemy.com/v2/test-server-key');assert.equal(options.redirect,'error');
    const req=request(options);
    if(req.method==='eth_chainId')return ok({result:'0x38'});
    if(req.method==='alchemy_getTokenMetadata')return ok({result:metadata});
    assert.equal(req.method,'alchemy_getTokenBalances');assert.equal(req.params[0],wallet);assert.equal(req.params[1],'erc20');
    if(++pages===1)return ok({result:{address:wallet,tokenBalances:[indexed(),indexed(address(3),{tokenBalance:'0x0'})],pageKey:'next + /'}});
    assert.equal(req.params[2].pageKey,'next + /');
    return ok({result:{address:wallet,tokenBalances:[indexed(),indexed(address(5))]}});
  },async()=>{
    const result=await indexedDiscovery('bsc',wallet,'test-server-key');assert.equal(result.status,'complete');assert.equal(result.tokens.length,2);
    assert.equal(result.tokens[0].amountExact,'1.234567');assert.equal(JSON.stringify(result).includes('test-server-key'),false);
  });
});
test('indexer rate limits, malformed pages and wrong wallet/chain never create trusted balances',async()=>{
  for(const failure of [{ok:false,status:429},ok({result:{unexpected:true}})]){
    let calls=0;
    await withFetch(async(url,opts)=>{
      const req=request(opts);
      if(req.method==='eth_chainId')return ok({result:'0x2105'});
      if(req.method==='alchemy_getTokenMetadata')return ok({result:metadata});
      return ++calls===1?ok({result:{address:wallet,tokenBalances:[indexed()],pageKey:'next'}}):failure;
    },async()=>{
      const result=await indexedDiscovery('base',wallet,'test-key');assert.equal(result.status,'partial');assert.equal(result.tokens.length,1);assert.equal(result.notices[0].code,'discovery-indexer');
    });
  }
  await withFetch(async()=>({ok:false,status:401}),async()=>{const r=await indexedDiscovery('polygon',wallet,'test-key');assert.equal(r.status,'unavailable');assert.match(r.issues[0],/site owner/);});
  await withFetch(async()=>ok({result:'0x1'}),async()=>{const r=await indexedDiscovery('base',wallet,'test-key');assert.equal(r.status,'unavailable');assert.equal(r.tokens.length,0);});
  await withFetch(async(url,opts)=>ok({result:request(opts).method==='eth_chainId'?'0x2105':{address:address(9),tokenBalances:[indexed()]}}),async()=>{const r=await indexedDiscovery('base',wallet,'test-key');assert.equal(r.status,'unavailable');assert.equal(r.tokens.length,0);});
});
test('indexer invalid metadata and repeated cursors cannot silently claim complete coverage',async()=>{
  let pages=0;
  await withFetch(async(url,opts)=>{
    const req=request(opts);
    if(req.method==='eth_chainId')return ok({result:'0x89'});
    if(req.method==='alchemy_getTokenMetadata')return ok({result:{decimals:null}});
    return ok({result:{address:wallet,tokenBalances:[indexed(address(70))]}});
  },async()=>{const r=await indexedDiscovery('polygon',wallet,'test-key');assert.equal(r.status,'partial');assert.equal(r.notices[0].skipped,1);});
  await withFetch(async(url,opts)=>{
    const req=request(opts);
    if(req.method==='eth_chainId')return ok({result:'0x2105'});
    if(req.method==='alchemy_getTokenMetadata')return ok({result:metadata});
    pages++;return ok({result:{address:wallet,tokenBalances:[indexed()],pageKey:'same'}});
  },async()=>{const r=await indexedDiscovery('base',wallet,'test-key');assert.equal(pages,2);assert.equal(r.status,'partial');assert.equal(r.notices[0].code,'discovery-limit');});
});
test('API uses configured discovery without exposing the key or accepting a client provider URL',async()=>{
  const prior=process.env.ALCHEMY_API_KEY;process.env.ALCHEMY_API_KEY='test-api-server-key';
  try{
    await withFetch(async(url,opts)=>{
      if(url.includes('alchemy.com')){
        assert.ok(url.endsWith('/test-api-server-key'));const req=request(opts);
        return ok({result:req.method==='eth_chainId'?'0x38':req.method==='alchemy_getTokenMetadata'?metadata:{address:wallet,tokenBalances:[indexed()]}});
      }
      if(opts?.body){const req=request(opts);return ok({result:req.method==='eth_chainId'?'0x38':req.method==='eth_blockNumber'?'0x123':'0x0'});}
      assert.ok(!url.includes('attacker.invalid'));return ok({coins:{}});
    },async()=>{
      let body;const res={setHeader(){},end(raw){body=JSON.parse(raw);}};
      await handler({method:'POST',headers:{'x-forwarded-for':'provider-integration'},body:{action:'holdings',chain:'bsc',address:wallet,providerUrl:'https://attacker.invalid'}},res);
      assert.equal(res.statusCode,200);assert.equal(body.discovery,'complete');assert.equal(body.rows.find(r=>r.address===contract).amountExact,'1.234567');
      assert.equal(JSON.stringify(body).includes('test-api-server-key'),false);assert.equal(body.notices.length,0);
    });
  }finally{if(prior===undefined)delete process.env.ALCHEMY_API_KEY;else process.env.ALCHEMY_API_KEY=prior;}
});
test('indexer pagination is bounded and metadata caching does not cache balances',async()=>{
  let pages=0,metaCalls=0;
  await withFetch(async(url,opts)=>{
    const req=request(opts);
    if(req.method==='eth_chainId')return ok({result:'0x2105'});
    if(req.method==='alchemy_getTokenMetadata'){metaCalls++;return ok({result:metadata});}
    pages++;return ok({result:{address:wallet,tokenBalances:[indexed(address(80+pages))],pageKey:String(pages)}});
  },async()=>{
    const r=await indexedDiscovery('base',wallet,'test-key');assert.equal(pages,5);assert.equal(r.tokens.length,5);assert.equal(r.status,'partial');assert.equal(r.notices[0].code,'discovery-limit');
  });
  const first=metaCalls;
  await withFetch(async(url,opts)=>{
    const req=request(opts);
    if(req.method==='eth_chainId')return ok({result:'0x2105'});
    if(req.method==='alchemy_getTokenMetadata'){metaCalls++;return ok({result:metadata});}
    return ok({result:{address:wallet,tokenBalances:[indexed(address(81),{tokenBalance:'0x1'})]}});
  },async()=>{const r=await indexedDiscovery('base',wallet,'test-key');assert.equal(r.tokens[0].amountExact,'0.000001');assert.equal(metaCalls,first);});
});
test('native balance and price complete while discovery is still waiting',async()=>{
  const events=[];
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const fallback=setTimeout(release,500);
  try{
    await withFetch(async(url,opts)=>{
      if(url.includes('/addresses/')){await gate;events.push('discovery-returned');return ok({items:[]});}
      if(!opts?.body){events.push('native-price');release();return ok({coins:{'coingecko:ethereum':{price:2000,timestamp:Date.now()/1000}}});}
      const req=request(opts);
      return ok({result:req.method==='eth_chainId'?'0x2105':req.method==='eth_blockNumber'?'0x123':'0xde0b6b3a7640000'});
    },async()=>{
      const result=await holdings('base',wallet);
      assert.equal(result.rows[0].valueUsd,2000);
      assert.deepEqual(events,['native-price','discovery-returned']);
    });
  }finally{clearTimeout(fallback);release();}
});

test('shared indexer pacing spaces concurrent work and a cancelled request cannot poison the queue', async () => {
  let clock = 1000;
  const starts = [], waits = [];
  const pace = createIndexerPacer({ interval: 250, now: () => clock, wait: async (ms) => { waits.push(ms); clock += ms; } });
  await Promise.all(Array.from({ length: 4 }, async () => { await pace(); starts.push(clock); }));
  assert.deepEqual(waits, [250, 250, 250]);
  assert.equal(starts.length, 4);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(pace(controller.signal), { name: 'AbortError' });
  await pace();
  assert.equal(clock, 2000);
});
test('a temporary indexer metadata 429 retries once and restores a usable token', async () => {
  let metadataCalls = 0;
  await withFetch(async (url, opts) => {
    const req = request(opts);
    if (req.method === 'eth_chainId') return ok({ result: '0x89' });
    if (req.method === 'alchemy_getTokenMetadata') return ++metadataCalls === 1 ? { ok: false, status: 429 } : ok({ result: metadata });
    return ok({ result: { address: wallet, tokenBalances: [indexed(address(101))] } });
  }, async () => {
    const result = await indexedDiscovery('polygon', wallet, 'test-key');
    assert.equal(metadataCalls, 2); assert.equal(result.status, 'complete'); assert.equal(result.tokens[0].amountExact, '1.234567');
    assert.equal(result.notices.length, 0);
  });
});
test('exhausted metadata throttling remains a retryable read issue rather than invalid contract metadata', async () => {
  let calls = 0;
  await withFetch(async (url, opts) => {
    const req = request(opts);
    if (req.method === 'eth_chainId') return ok({ result: '0x89' });
    if (req.method === 'alchemy_getTokenMetadata') { calls++; return { ok: false, status: 429 }; }
    return ok({ result: { address: wallet, tokenBalances: [indexed(address(102))] } });
  }, async () => {
    const result = await indexedDiscovery('polygon', wallet, 'test-key');
    assert.equal(calls, 2); assert.equal(result.status, 'partial');
    assert.equal(result.notices[0].code, 'discovery-metadata-unavailable');
    assert.equal(result.notices[0].action, 'retry'); assert.match(result.notices[0].message, /rate limit/);
  });
});
test('a slow indexer leaves the holdings deadline available for pricing retained tokens', { timeout: 22000 }, async () => {
  const prior = process.env.ALCHEMY_API_KEY;
  process.env.ALCHEMY_API_KEY = 'test-budget-key';
  const started = Date.now();
  try {
    await withFetch(async (url, opts) => {
      if (url.includes('alchemy.com')) {
        const req = request(opts);
        if (req.method === 'eth_chainId') return ok({ result: '0x2105' });
        if (req.method === 'alchemy_getTokenBalances') return ok({ result: { address: wallet, tokenBalances: Array.from({ length: 6 }, (_, i) => indexed(address(200 + i))) } });
        if ([address(200), address(204)].includes(req.params[0])) return ok({ result: metadata });
        return new Promise((resolve, reject) => {
          if (opts.signal.aborted) reject(opts.signal.reason);
          else opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true });
        });
      }
      if (opts?.body) {
        const req = request(opts);
        return ok({ result: req.method === 'eth_chainId' ? '0x2105' : req.method === 'eth_blockNumber' ? '0x123' : '0xde0b6b3a7640000' });
      }
      return ok({ coins: { 'coingecko:ethereum': { price: 2000, timestamp: Date.now()/1000 }, [`base:${address(200)}`]: { price: 2, timestamp: Date.now()/1000 } } });
    }, async () => {
      let body;
      const res = { setHeader() {}, end(raw) { body = JSON.parse(raw); } };
      await handler({ method: 'POST', headers: { 'x-forwarded-for': 'budget-test' }, body: { action: 'holdings', chain: 'base', address: wallet } }, res);
      assert.equal(res.statusCode, 200);
      assert.ok(Date.now() - started < 17500);
      assert.equal(body.discovery, 'partial');
      assert.equal(body.rows.find(r => r.address === null).priceUsd, 2000);
      assert.equal(body.rows.find(r => r.address === address(200)).priceUsd, 2);
      assert.equal(body.notices.length, 1);
      assert.equal(body.notices[0].code, 'discovery-timeout');
      assert.match(body.notices[0].message, /time limit/);
    });
  } finally {
    if (prior === undefined) delete process.env.ALCHEMY_API_KEY;
    else process.env.ALCHEMY_API_KEY = prior;
  }
});
