import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
import { generateAccessKey, deriveAccess, encryptWatchlist } from '../src/reimagined/crypto.js';
import { createDeviceSessions } from '../src/reimagined/deviceSession.js';
// Authentication/storage are test doubles; holdings requests use the supplied live Preview.
const preview = process.argv[2];
assert.ok(preview && /^https:\/\/[^/]+\.vercel\.app$/.test(preview), 'Pass the HTTPS Preview origin without a trailing slash');
const nativeFetch=global.fetch;
const html=await(await nativeFetch(preview)).text();
assert.ok(html.includes('Kinko Wallet'),'Preview must serve Kinko');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://kinko.test/',pretendToBeVisual:true});
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')};
dom.window.scrollTo=()=>{};
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,indexedDB,IS_REACT_ACT_ENVIRONMENT:true});
const {createRoot}=await import('react-dom/client');
const key=generateAccessKey(),access=await deriveAccess(key),wallet='0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
let envelope=await encryptWatchlist(access,{version:1,wallets:[{address:wallet,name:'Public test wallet',networks:['base','polygon','bsc']}],tokens:[],hiddenTokens:[],showUnpricedTokens:true,currency:'USD',theme:'light',snapshots:[]});
await createDeviceSessions().save(key,false,'cloud');
const results={};
global.fetch=async(url,options)=>{
  if(url==='/api/vault'){
    if(options?.method==='PUT')envelope=JSON.parse(options.body).envelope;
    return {ok:true,json:async()=>({envelope,revision:1})};
  }
  assert.equal(url,'/api/data');
  const req=JSON.parse(options.body),start=Date.now();
  const response=await nativeFetch(preview+url,options);
  const data=await response.clone().json();
  if(req.action==='holdings')results[req.chain]={http:response.status,ms:Date.now()-start,data};
  return response;
};
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
let App;try{({App}=await vite.ssrLoadModule('/src/reimagined/main.jsx'))}finally{await vite.close()}
const root=createRoot(document.querySelector('#root'));
const until=async predicate=>{const deadline=Date.now()+65000;while(!predicate()&&Date.now()<deadline)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,100))});assert.ok(predicate(),'UI did not settle')};
const click=async element=>{assert.ok(element);await act(async()=>element.click())};
try{
 await act(async()=>root.render(React.createElement(App)));
 await until(()=>Object.keys(results).length===3&&document.body.textContent.includes('Updated'));
 await click([...document.querySelectorAll('nav[aria-label="Main navigation"] button')].find(b=>b.textContent==='Assets'));
 for(const [chain,name]of[['base','Base'],['polygon','Polygon'],['bsc','BNB']]){
  const r=results[chain],d=r.data;
  assert.equal(r.http,200);assert.match(d.discoveryProvider,/^alchemy-(token|portfolio)-api$/);
  assert.ok(d.rows.some(t=>t.address&&Number(t.amountExact)>0));
  assert.ok(d.rows.every(t=>t.chain===chain&&t.wallet===wallet.toLowerCase()));
  assert.ok(!JSON.stringify(d).match(/g\.alchemy\.com|ALCHEMY_API_KEY|rejected access|HTTP 403/));
  await click([...document.querySelectorAll('[aria-label="Filter by network"] button')].find(b=>b.textContent===name));
  await until(()=>document.querySelectorAll('.asset-row').length===d.rows.length);
  assert.equal(document.querySelectorAll('.asset-row').length,d.rows.length);
  if(d.rows.some(t=>t.priceUsd==null&&Number(t.amountExact)>0))assert.match(document.querySelector('.provider-notice').textContent,/Price unavailable/);
  console.log(JSON.stringify({chain,http:r.http,ms:r.ms,provider:d.discoveryProvider,status:d.discovery,renderedAssets:document.querySelectorAll('.asset-row').length,filtered:d.filtered.length,notices:d.notices.map(n=>n.code)}));
 }
 await writeFile(process.env.KINKO_TEST_OUTPUT || '/tmp/kinko-routing-live.json',JSON.stringify(results));
 console.log('PASS: real-mode React client rendered live Preview holdings for all three networks; authentication/storage were isolated test doubles.');
}finally{
 act(()=>root.unmount());global.fetch=nativeFetch;dom.window.close();
}

process.exit(0); // Vite dependency workers may otherwise keep this one-shot check alive.
