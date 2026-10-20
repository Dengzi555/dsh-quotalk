import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [bundle,selectionSource,storeSource,bridgeSource,coreSource,sidebarSource]=await Promise.all(['lib/client.js','src/selection.js','src/store.js','src/bridge.js','src/core.js','src/sidebar.js'].map(read));
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function events(){const handlers=new Map();return{handlers,addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn);},removeEventListener(type,fn){handlers.get(type)?.delete(fn);},fire(type,event={}){for(const fn of handlers.get(type)||[])fn(event);}};}
function harness(){
  const document=events(),window=Object.assign(events(),{innerWidth:1000,innerHeight:700}),effects=[],slots=[],opens=[];
  let binding={props:{sessionId:'s1'},hooks:{conversation:{getSnapshot:()=>({views:{get:()=>({legacy:{nodes:[{kind:'user',content:[{type:'text',text:'学 Python'}]},{kind:'assistant',blocks:[{kind:'text',text:'for 完整回答'}],requestConfig:{provider:'test',model:'chosen'}}]}})}})}}};
  const sourceEvents=new Set(),current={getSnapshot:()=>binding,subscribe(fn){sourceEvents.add(fn);return()=>sourceEvents.delete(fn);}};
  const element={innerText:'for 完整回答',closest:()=>null,isConnected:true},selection={toString:()=> 'for',rangeCount:1,anchorNode:{parentElement:element},getRangeAt:()=>({getBoundingClientRect:()=>({left:20,top:30,bottom:50,width:30,height:20})})};
  window.getSelection=()=>selection;
  const refs=[];
  const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children:children.flat()}),useSyncExternalStore:(_subscribe,get)=>get(),useRef:value=>{const ref={current:value};refs.push(ref);return ref;},useEffect:()=>{},useState:value=>[value,()=>{}]};
  const ctx={slots:{inject(_name,fn){fn();},register(options,component){slots.push({options,component});return()=>{};}},effect(fn){const cleanup=fn();if(typeof cleanup==='function')effects.push(cleanup);},sidebarRight:{openTab:kind=>opens.push(kind)},sidebarRightTabs:{register:definition=>{assert.equal(definition.kind,'quotalk');return()=>{};}},uiSession:{adapter:{current}}};
  let module;window.__ModuleLoader__={load:value=>module=value};
  vm.runInNewContext(bundle,{window,document,console,crypto:{randomUUID},AbortController,TextDecoder});module.factory(()=>React).apply(ctx);
  const toolbar=()=>slots.find(s=>s.options.name==='shell.overlay').component();
  const sidebar=()=>slots.find(s=>s.options.name==='sidebar.right.pane.tab').component({sessionId:binding.props.sessionId});
  const flatten=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flatMap(flatten)];
  return {document,window,slots,opens,element,selection,ctx,toolbar,sidebar,flatten,refs,capture(){document.fire('pointerup',{target:element});},setBinding(value){binding=value;for(const fn of sourceEvents)fn();},get binding(){return binding;},dispose(){for(const cleanup of effects.reverse())cleanup();}};
}
test('selection toolbar opens a native side tab; there is no pet or floating chat',()=>{
  const h=harness();try{
    assert.equal(h.toolbar(),null);h.capture();const nodes=h.flatten(h.toolbar());
    assert.deepEqual(nodes.filter(n=>n.type==='button').map(n=>n.children[0]),['在侧边聊天中提问']);
    nodes.find(n=>n.type==='button'&&n.children[0]==='在侧边聊天中提问').props.onClick();
    assert.deepEqual(h.opens,['quotalk']);assert.equal(h.toolbar(),null);
    const side=h.flatten(h.sidebar());assert.equal(side.find(n=>n.type==='summary').children[0],'for');
    assert.ok(side.some(n=>n.type==='textarea'));assert.ok(!side.some(n=>n.type==='video'));
  }finally{h.dispose();}
});
test('selection and sidebar opening never access the main composer write API',()=>{
  const h=harness();let accessed=0;
  Object.defineProperty(h.binding.props,'inputActions',{get(){accessed++;return {};}});
  try{h.capture();h.flatten(h.toolbar()).find(n=>n.type==='button').props.onClick();assert.equal(accessed,0);assert.deepEqual(h.opens,['quotalk']);}finally{h.dispose();}
});
test('inherited editable selection is excluded when mouseup or keyup lands outside it',()=>{
  const h=harness();try{
    const editor={isContentEditable:true,closest:()=>null};
    for(const type of ['pointerup','keyup']){
      h.selection.anchorNode={parentElement:h.element};h.capture();assert.ok(h.toolbar());
      h.selection.anchorNode={nodeType:3,parentElement:editor};
      h.document.fire(type,{target:h.element});assert.equal(h.toolbar(),null);
    }
  }finally{h.dispose();}
});
test('ranges ending in an editor and selectionchange hide the menu without intercepting input events',()=>{
  const h=harness();let prevented=false,stopped=false;try{
    h.capture();h.selection.focusNode={nodeType:3,parentElement:{isContentEditable:true,closest:()=>null}};
    h.document.fire('keyup',{target:h.element,preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
    assert.equal(h.toolbar(),null);assert.equal(prevented,false);assert.equal(stopped,false);
    delete h.selection.focusNode;h.capture();h.selection.anchorNode={nodeType:3,parentElement:{isContentEditable:true,closest:()=>null}};
    h.document.fire('selectionchange');assert.equal(h.toolbar(),null);
  }finally{h.dispose();}
});
test('input target clears an existing answer menu even while the old answer range remains',()=>{
  const h=harness();try{
    h.capture();const input={closest:selector=>selector.includes('textarea')?input:null};
    h.document.fire('pointerup',{target:input});assert.equal(h.toolbar(),null);
  }finally{h.dispose();}
});
test('escape, scroll and switching Sessions dismiss the selection menu; disposal removes handlers',()=>{
  const h=harness();h.capture();h.document.fire('keydown',{key:'Escape'});assert.equal(h.toolbar(),null);
  h.capture();h.document.fire('scroll',{target:{closest:()=>null}});assert.equal(h.toolbar(),null);
  h.capture();h.setBinding({props:{sessionId:'s2'}});assert.equal(h.toolbar(),null);
  h.dispose();assert.equal([...h.document.handlers.values()].reduce((n,set)=>n+set.size,0),0);assert.equal([...h.window.handlers.values()].reduce((n,set)=>n+set.size,0),0);
});
test('side input protects IME composition, sends plain Enter, and preserves Shift+Enter',()=>{
  const h=harness();try{
    h.capture();h.flatten(h.toolbar()).find(n=>n.type==='button'&&n.children[0]==='在侧边聊天中提问').props.onClick();
    const input=h.flatten(h.sidebar()).find(n=>n.type==='textarea');let prevented=false;
    input.props.onKeyDown({key:'Enter',isComposing:true,preventDefault(){prevented=true;}});assert.equal(prevented,false);
    input.props.onKeyDown({key:'Enter',shiftKey:true,preventDefault(){prevented=true;}});assert.equal(prevented,false);
    input.props.onKeyDown({key:'Enter',preventDefault(){prevented=true;}});assert.equal(prevented,true);
  }finally{h.dispose();}
});
test('store streams by request identity, keeps separate quotes, and includes follow-up history',async()=>{
  const subscribers=new Set(),jobs=new Map(),requests=[];let next=0;
  const fakeBridge={binding:()=>({}),capture:()=>({messages:[],currentAnswer:'完整回答'}),subscribe(fn){subscribers.add(fn);return()=>subscribers.delete(fn);},async rpc(type,data){if(type==='start'){const id='job'+(++next);requests.push(data);jobs.set(id,{id,status:'running',text:''});return{id};}return jobs.get(data.id);},cancel(){},cancelAll(){},dispose(){}};
  const helpers=vm.runInNewContext(storeSource+'\n;({createSessionStore})',{createBridge:()=>fakeBridge});
  const store=helpers.createSessionStore({},'s1',{prompt:(_q,_p,question,history)=>JSON.stringify({question,history})});
  const pick=quote=>({sessionId:'s1',quote,paragraph:'',source:{currentAnswer:'原文'},element:{isConnected:true}});
  store.select(pick('first'));await store.send('why');store.select(pick('second'));
  for(const fn of subscribers)fn({type:'job-update',job:{id:'job1',status:'done',text:'first answer'}});
  assert.equal(store.getSnapshot().thread.quote,'second');assert.equal(store.getSnapshot().thread.entries.length,0);
  store.select(pick('first'));assert.equal(store.getSnapshot().thread.entries[0].answer,'first answer');await store.send('example');
  assert.deepEqual(JSON.parse(requests[1].prompt).history,[{question:'why',answer:'first answer'}]);store.dispose();
});
