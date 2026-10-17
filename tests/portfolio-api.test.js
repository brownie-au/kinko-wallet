import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/portfolio.js';
function response() { return { headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body?JSON.parse(body):null;} }; }
test('Portfolio API rejects invalid addresses before sending anything to storage', async()=>{
 const res=response();await handler({method:'POST',body:{wallets:[{address:'secret phrase'}]}},res);assert.equal(res.statusCode,400);
});
test('Portfolio API preserves networks, supports Vercel parsed bodies and old saved records',async()=>{
 const fetchOriginal=globalThis.fetch, url=process.env.KV_REST_API_URL, token=process.env.KV_REST_API_TOKEN;
 process.env.KV_REST_API_URL='https://storage.example.test';process.env.KV_REST_API_TOKEN='test-only';
 const address='0x'+'a'.repeat(40), requests=[];
 globalThis.fetch=async(_url,init)=>{
  const command=JSON.parse(init.body);requests.push(command);
  return {ok:true,json:async()=>({result:command[0]==='SET'?'OK':JSON.stringify({value:JSON.stringify({wallets:[{address,name:'Main',networks:['pulse']}]}),px:10})})};
 };
 try {
  const post=response();await handler({method:'POST',body:{id:'ABCDEFGH',wallets:[{address,name:'Main',networks:['pulse']}]}},post);
  assert.equal(post.statusCode,200);assert.equal(requests[0][0],'SET');assert.equal(requests[0][3],'EX');assert.deepEqual(JSON.parse(requests[0][2]).wallets[0].networks,['pulse']);
  const get=response();await handler({method:'GET',query:{id:'ABCDEFGH'}},get);assert.equal(get.statusCode,200);assert.equal(get.body.wallets[0].name,'Main');
 } finally {
  globalThis.fetch=fetchOriginal;
  if(url==null)delete process.env.KV_REST_API_URL;else process.env.KV_REST_API_URL=url;
  if(token==null)delete process.env.KV_REST_API_TOKEN;else process.env.KV_REST_API_TOKEN=token;
 }
});
