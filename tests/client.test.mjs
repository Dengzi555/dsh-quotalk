import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';

const source=await readFile(new URL('../src/bridge.js',import.meta.url),'utf8');
const coreSource=await readFile(new URL('../src/core.js',import.meta.url),'utf8');
const helpers=vm.runInNewContext(source+'\n;({readConversation,captureNative,createBridge})',{console,AbortController,TextDecoder,crypto:{randomUUID}});
const block=text=>({type:'text',text});
const user=text=>({kind:'user',content:[block(text)]});
const assistant=text=>({kind:'assistant',blocks:[{kind:'text',text},{kind:'reasoning',text:'do not send'}],requestConfig:{provider:'deepseek',model:'chosen'}});
function binding(messages){return {props:{sessionId:'test'},hooks:{conversation:{getSnapshot:()=>({views:{get:()=>({legacy:{nodes:messages,partial:null}})}})}}};}
function coreFor(current){
  const context={globalThis:{},bridge:{capture(element,quote,scope,core){return helpers.captureNative(current,element,quote,scope,core);}}};
  vm.runInNewContext(coreSource,context);const core=context.globalThis.MarginCore;core.captureContext=(element,quote,_root,scope)=>helpers.captureNative(current,element,quote,scope,core);return core;
}
test('native RC.2 Chat snapshot returns visible text and its configured model',()=>{
  const result=helpers.readConversation(binding([user('learn Python'),assistant('for循环')]));
  assert.equal(result.model.model,'chosen');assert.equal(result.messages[1].text,'for循环');assert.doesNotMatch(JSON.stringify(result.messages),/do not send/);
});
test('current answer scope excludes previous turns and preserves the selected full answer',()=>{
  const core=coreFor(binding([user('background'),assistant('for循环的完整解释')]));
  const captured=core.captureContext(null,'for',null,'current');
  assert.equal(captured.messages.length,0);assert.equal(captured.currentAnswer,'for循环的完整解释');
});
test('two-round and all scopes include only the requested loaded conversation with bounded text',()=>{
  const messages=[];for(let i=0;i<6;i++)messages.push(user('Q'+i),assistant('A'+i));
  const core=coreFor(binding(messages)),two=core.captureContext(null,'A5',null,'2');
  assert.equal(two.messages.length,3);assert.equal(two.messages[0].text,'Q4');
  assert.equal(core.captureContext(null,'A5',null,'all').messages.length,11);
  const big=coreFor(binding([user('x'.repeat(20000)),assistant('A')]));
  const captured=big.captureContext(null,'A',null,'all');assert.equal(captured.truncated,true);assert.ok(captured.messages.reduce((n,m)=>n+m.text.length,0)<15000);
});
test('new model selection takes precedence over the last completed request',()=>{
  const current=binding([assistant('text')]);current.keyedHooks={projection:()=>({getSnapshot:()=>({value:{next:{provider:'pi-ai',model:'new'}}})})};
  assert.equal(helpers.readConversation(current).model.model,'new');
});
test('unknown snapshot never pulls arbitrary app content; quote falls back to selected paragraph',()=>{
  const core=coreFor({hooks:{}}),element={closest:()=>({innerText:'selected paragraph'})};
  const captured=core.captureContext(element,'selected',null,'all');assert.equal(captured.currentAnswer,'selected paragraph');assert.equal(captured.messages.length,0);
});
test('client consumes split UTF-8 NDJSON and finish without waiting for stream closure',async()=>{
  let cancel=false,requestBody;
  const bytes=new TextEncoder().encode(JSON.stringify({type:'text',text:'鲸鱼'})+'\n'+JSON.stringify({type:'done',text:'鲸鱼'})+'\n');
  const queue=[bytes.slice(0,25),bytes.slice(25,29),bytes.slice(29)];
  const fetch=async(url,options)=>{
    if(url.endsWith('bootstrap'))return {ok:true,json:async()=>({token:'nonce'})};
    requestBody=JSON.parse(options.body);
    return {ok:true,body:{getReader:()=>({read:async()=>({value:queue.shift(),done:false}),cancel:async()=>{cancel=true;},releaseLock(){}})}};
  };
  const h=vm.runInNewContext(source+'\n;({createBridge})',{fetch,AbortController,TextDecoder,crypto:{randomUUID}});
  const bridge=h.createBridge({uiSession:{adapter:{current:{getSnapshot:()=>binding([assistant('source')])}}}});
  const events=[];let complete;const done=new Promise(resolve=>complete=resolve);
  bridge.subscribe(event=>{events.push(event);if(event.job.status==='done')complete();});
  await bridge.rpc('start',{prompt:'question'});await done;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(events.at(-1).job.text,'鲸鱼');assert.equal(cancel,true);assert.equal(requestBody.model,'chosen');bridge.dispose();
});
test('native bundle registers through ModuleLoader and uses host React without browser extension globals',async()=>{
  const bundle=await readFile(new URL('../lib/client.js',import.meta.url),'utf8');let module;
  vm.runInNewContext(bundle,{window:{__ModuleLoader__:{load(value){module=value;}}}});
  assert.equal(module.id,'dsh-quotalk');
  const plugin=module.factory(name=>{assert.equal(name,'react');return {};});
  // Full registration and UI behavior are covered by the native UI harness.
  assert.deepEqual(Array.from(plugin.inject),['slots','uiSession','sidebarRight','sidebarRightTabs']);
  assert.doesNotMatch(bundle,/chrome\.tabs|chrome\.runtime\.sendMessage|chat\.deepseek\.com|ds-margin-worker|pet-with-you|webm/);
});
