import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {apply,streamAnswer,trustedRequest} from '../lib/index.js';

const payload={provider:'test',model:'small',prompt:'解释一下 Python 的 for 循环'};
const text=text=>({type:'text-delta',index:0,text});
const finished={type:'finish',reason:'stop'};
const fakeLlm=chunks=>({async *stream(options){this.options=options;yield* chunks;}});
const signal=()=>new AbortController().signal;

test('streams visible text immediately and marks complete on the finish event',async()=>{
  let downstream=false;
  const llm={async *stream(options){this.options=options;yield text('你好');yield {type:'reasoning-delta',index:1,text:'private thinking'};yield {type:'block-end',index:0,block:{type:'text',text:'你好，Python'}};yield finished;downstream=true;}};
  const events=[];await streamAnswer(llm,payload,e=>events.push(e),signal());
  assert.deepEqual(events.map(e=>e.type),['text','text','done']);assert.equal(events.at(-1).text,'你好，Python');
  assert.equal(JSON.stringify(events).includes('private thinking'),false);assert.equal(downstream,false);
  assert.deepEqual(llm.options.tools,[]);assert.equal(llm.options.messages[0].content[0].text,payload.prompt);assert.equal(llm.options.sessionId,undefined);
});
test('multiple text blocks stay ordered without duplicating block-end content',async()=>{
  const events=[];await streamAnswer(fakeLlm([{...text('后'),index:1},text('前'),{type:'block-end',index:0,block:{type:'text',text:'前'}},finished]),payload,e=>events.push(e),signal());
  assert.equal(events.at(-1).text,'前后');
});
test('stream errors, empty output, cancellation and missing finish never become success',async()=>{
  for(const chunks of [[text('partial')],[text('partial'),{type:'finish',reason:'error'}],[finished]]){
    const events=[];await assert.rejects(streamAnswer(fakeLlm(chunks),payload,e=>events.push(e),signal()));assert.ok(!events.some(e=>e.type==='done'));
  }
  const controller=new AbortController();controller.abort();await assert.rejects(streamAnswer(fakeLlm([text('bad')]),payload,()=>{},controller.signal),/取消/);
});
test('invalid or oversized prompts and absent model routes cannot call the provider',async()=>{
  const llm=fakeLlm([]);
  for(const bad of [{...payload,prompt:''},{...payload,prompt:'x'.repeat(80001)},{...payload,model:''}])await assert.rejects(streamAnswer(llm,bad,()=>{},signal()));
  assert.equal(llm.options,undefined);
});

function request(path,{method='GET',body='',headers={},ip='127.0.0.1'}={}){
  const req=Readable.from(body?[Buffer.from(body)]:[]);Object.assign(req,{url:'/dsh-quotalk'+path,method,headers:{host:'127.0.0.1:3080','sec-fetch-site':'same-origin',...headers},socket:{remoteAddress:ip}});return req;
}
class Response extends EventEmitter{
  constructor(){super();this.parts=[];this.headersSent=false;this.writableEnded=false;}
  writeHead(code,headers){this.code=code;this.headers=headers;this.headersSent=true;}
  flushHeaders(){}
  write(value){this.parts.push(Buffer.from(value));return true;}
  end(value){if(value)this.write(value);this.writableEnded=true;}
  text(){return Buffer.concat(this.parts).toString();}
}
function harness(llm=fakeLlm([text('OK'),finished])){
  const routes=new Map(),cleanups=[];
  apply({llm,effect(fn){const cleanup=fn();if(typeof cleanup==='function')cleanups.push(cleanup);},webServer:{register(route){routes.set(route.path,route);return()=>routes.delete(route.path);}}});
  return {llm,routes,cleanups,async call(path,options){const res=new Response();await routes.get('/dsh-quotalk'+(path.startsWith('/assets/')?'/assets':path)).handler(request(path,options),res);return res;},close(){for(const cleanup of cleanups.reverse())cleanup();}};
}
test('local same-origin requests only; cross-origin and forwarded hosts are rejected',()=>{
  assert.equal(trustedRequest(request('/bootstrap')),true);
  for(const options of [{ip:'10.0.0.2'},{headers:{'sec-fetch-site':'cross-site'}},{headers:{origin:'https://evil.example'}},{headers:{host:'evil.example:3080'}},{headers:{'sec-fetch-site':undefined}}])assert.equal(trustedRequest(request('/bootstrap',options)),false);
});
test('official dsh-app forwarding works without Origin or Sec-Fetch-Site and still rejects foreign webpages',async()=>{
  const headers={'sec-fetch-site':undefined,'x-quotalk-client':'dsh-desktop'};
  assert.equal(trustedRequest(request('/bootstrap',{headers})),true);
  assert.equal(trustedRequest(request('/bootstrap',{headers:{...headers,'sec-fetch-site':'cross-site'}})),false);
  assert.equal(trustedRequest(request('/bootstrap',{headers:{...headers,origin:'https://evil.example'}})),false);
  assert.equal(trustedRequest(request('/bootstrap',{headers,ip:'10.0.0.2'})),false);
  const h=harness();try{
    const token=JSON.parse((await h.call('/bootstrap',{headers})).text()).token;
    const res=await h.call('/ask',{method:'POST',headers:{...headers,'x-quotalk-token':token,'content-type':'application/json'},body:JSON.stringify(payload)});
    assert.equal(res.code,200);assert.match(res.text(),/"type":"done"/);
  }finally{h.close();}
});
test('bootstrap token gates generation and provider errors do not expose secrets',async()=>{
  const h=harness({async *stream(){throw new Error('secret-key-in-provider-url');}});
  try {
    const token=JSON.parse((await h.call('/bootstrap')).text()).token;
    assert.equal((await h.call('/ask',{method:'POST',body:JSON.stringify(payload)})).code,403);
    const res=await h.call('/ask',{method:'POST',headers:{'x-quotalk-token':token,'content-type':'application/json'},body:JSON.stringify(payload)});
    assert.match(res.text(),/"type":"error"/);assert.doesNotMatch(res.text(),/secret-key/);
  }finally{h.close();}
});
test('real route emits incremental NDJSON and exposes no asset or file-reading routes',async()=>{
  const h=harness();try{
    const token=JSON.parse((await h.call('/bootstrap')).text()).token;
    const res=await h.call('/ask',{method:'POST',headers:{'x-quotalk-token':token,'content-type':'application/json'},body:JSON.stringify(payload)});
    assert.equal(res.code,200);assert.deepEqual(res.text().trim().split('\n').map(s=>JSON.parse(s).type),['text','done']);
    assert.equal(h.routes.size,2);assert.equal(h.routes.has('/dsh-quotalk/assets'),false);
  }finally{h.close();assert.equal(h.routes.size,0);}
});
