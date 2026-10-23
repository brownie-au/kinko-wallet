import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { createHistoryProviders, coalesce, boundedMap } from '../../src/server/historyProviders.js';
import { collectBackfill, backfillAnchor } from '../../src/reimagined/historyBackfill.js';
const address = '0x' + '1'.repeat(40), token = '0x' + '2'.repeat(40), sold = '0x' + '3'.repeat(40);
const abi = new Interface(['function balanceOf(address) view returns(uint256)', 'function decimals() view returns(uint8)']);
const time = Date.now() - 20 * 86400000;
const ok = (data) => ({ ok:true, status:200, json: async()=> data });
test('archive fixture values historical balances, including sold tokens, using chain/contract identity', async () => {
  const calls=[];
  const providers = createHistoryProviders({fetcher: async(url, options)=>{
    calls.push({url,body: options?.body && JSON.parse(options.body)});
    if(url.includes('/block/')) return ok({height:123});
    if(url.includes('/token-transfers')) return ok({items:[{token:{type:'ERC-20',address_hash:sold}}]});
    if(url.includes('/prices/')) return ok({coins:{'coingecko:ethereum':{price:100,timestamp:time/1000,confidence:.99}, [`ethereum:${token}`]:{price:2,timestamp:time/1000,confidence:.99}}});
    const r=JSON.parse(options.body);
    if(r.method==='eth_chainId')return ok({result:'0x1'});
    if(r.method==='eth_getBlockByNumber')return ok({result:{number:'0x7b',timestamp:'0x'+Math.floor(time/1000).toString(16)}});
    if(r.method==='eth_getBalance'){assert.equal(r.params[1],'0x7b');return ok({result:'0x1bc16d674ec80000'});}
    assert.equal(r.params[1],'0x7b');
    const call=abi.parseTransaction({data:r.params[0].data});
    return ok({result:abi.encodeFunctionResult(call.name,call.name==='decimals'?[6]:[1234567])});
  }});
  const s=await providers.snapshot({chain:'eth',address,contracts:[token],time,range:'1M'});
  // 2 historical BNB * $100 + 1.234567 tokens * $2 = $202.469134 (not today's holdings).
  assert.equal(s.valueExact,'202.469134');assert.equal(s.value,202.469134);
  assert.equal(s.positions[1].amount,'1.234567');assert.equal(s.partial,true);assert.equal(s.positions.find(p=>p.asset===sold).valueExact,null);
  assert.match(s.limitations.join(','),/HEX/);
  assert.ok(calls.every(c=>!c.body?.params?.includes('latest')));
});
test('timestamps and identity: prices outside tolerance or without confidence remain unknown', async()=>{
  const providers=createHistoryProviders({fetcher:async()=>ok({coins:{'coingecko:ethereum':{price:500,timestamp:time/1000-7200,confidence:.99},[`ethereum:${token}`]:{price:9,timestamp:time/1000}}})});
  const p=await providers.prices('eth',['native',token],time,'1H');
  assert.equal(p.native,null);assert.equal(p[token],null);
});
test('concurrent identical reads coalesce; bounded workers and retry-after respect quotas',async()=>{
  let calls=0, release;
  const task=()=>{calls++; return new Promise(r=>{release=r;});};
  const a=coalesce('fixture',task),b=coalesce('fixture',task);await Promise.resolve();release(4);
  assert.deepEqual(await Promise.all([a,b]),[4,4]);assert.equal(calls,1);
  let active=0,max=0;
  await boundedMap([1,2,3,4],2,async()=>{active++;max=Math.max(max,active);await Promise.resolve();active--;});assert.equal(max,2);
  let tries=0,waits=[];
  const provider=createHistoryProviders({sleep:async ms=>waits.push(ms),fetcher:async()=>++tries===1?{ok:false,status:429,headers:new Headers({'retry-after':'1'})}:ok({worked:true})});
  assert.deepEqual(await provider.request('https://fixture.test/retry'),{worked:true});assert.deepEqual(waits,[1000]);
});
test('failed networks, missing prices, real zero balances and repeated backfill remain distinct',async()=>{
  const jobs=[{chain:'eth',address},{chain:'base',address}];
  let count=0;
  const request=async j=>{if(j.chain==='base')throw Error('offline'); count++;return {...j,value:20,excluded:1,positions:[{asset:token,valueExact:'20',amount:'2',price:10},{asset:sold,valueExact:null,amount:'4'}]};};
  const a=await collectBackfill({jobs,time,range:'1M',scope:'s',request});
  const b=await collectBackfill({jobs,time,range:'1M',scope:'s',request});
  assert.equal(a.value,20);assert.equal(a.coverage,b.coverage);assert.equal(a.provenance.networksUnavailable,1);
  assert.equal(a.provenance.positions[1].valueExact,null);assert.equal(a.partial,true);
  assert.equal(await collectBackfill({jobs,time,range:'1M',scope:'s',request:async()=>{throw Error('no');}}),null);
  assert.ok(backfillAnchor('MAX') < Date.now()-300*86400000);
});
test('native Polygon identity follows the dated MATIC/POL migration, not ticker matching',async()=>{
  const {historicalPriceKey}=await import('../../src/server/historyProviders.js');
  assert.equal(historicalPriceKey('polygon','native',Date.parse('2024-07-28T00:00Z')),'coingecko:matic-network');
  assert.equal(historicalPriceKey('polygon','native',Date.parse('2024-09-04T12:00Z')),null);
  assert.equal(historicalPriceKey('polygon','native',Date.parse('2024-09-05T00:00Z')),'coingecko:polygon-ecosystem-token');
  assert.notEqual(historicalPriceKey('eth',token,time),historicalPriceKey('base',token,time));
});
