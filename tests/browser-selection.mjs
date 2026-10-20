// Optional real-DOM regression: node tests/browser-selection.mjs
// Uses an isolated headless Edge/Chromium profile, never the user's DSH window.
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
const browser=process.env.BROWSER_PATH || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
if(!browser)throw new Error('Set BROWSER_PATH to an installed Chromium-based browser.');
const profile=await mkdtemp(join(tmpdir(),'quotalk-browser-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
try{
  let port;
  for(let i=0;i<150;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  if(!port)throw new Error('Browser debugging endpoint did not start.');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const source=await readFile(new URL('../src/selection.js',import.meta.url),'utf8');
  const suite=String(function(source){
    document.body.innerHTML='<p id="answer">正常回答用于划词</p><div contenteditable="true" id="true"><span>输入框文字</span></div><div contenteditable="" id="empty"><span>输入框文字</span></div><div contenteditable="plaintext-only" id="plain"><span>输入框文字</span></div><div role="textbox" id="role"><span>输入框文字</span></div><textarea id="textarea">输入框文字</textarea><div data-lexical-editor="true" id="lexical"><span>输入框文字</span></div><div data-quotalk-ui="sidebar" id="side"><span>侧边栏文字</span></div>';
    const captureNative=()=>({messages:[],currentAnswer:'正常回答用于划词'});
    const install=eval(source+'\n;installSelectionMenu');
    const ctx={uiSession:{adapter:{current:{getSnapshot:()=>({props:{sessionId:'s1'}}),subscribe:()=>()=>{}}}}};
    const menu=install(ctx,{},()=>{}),results=[];
    function select(element,target=element,event='pointerup'){
      const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(element);selection.removeAllRanges();selection.addRange(range);
      const emitted=event==='keyup'?new KeyboardEvent(event,{bubbles:true,cancelable:true,key:'ArrowLeft',shiftKey:true}):new PointerEvent(event,{bubbles:true,cancelable:true});
      target.dispatchEvent(emitted);return emitted;
    }
    select(document.getElementById('answer'));results.push({case:'normal answer keeps follow-up',pass:!!menu.getSnapshot().selection});
    for(const id of ['true','empty','plain','role','lexical','side']){
      select(document.getElementById('answer'));
      const element=document.querySelector('#'+id+' span'),html=element.parentElement.innerHTML;
      const event=select(element);
      results.push({case:'selection inside '+id+' has no plugin menu or event interception',pass:!menu.getSnapshot().selection&&!event.defaultPrevented&&element.parentElement.innerHTML===html});
    }
    const editor=document.querySelector('#empty span');select(editor,document.body,'keyup');results.push({case:'editor keyboard selection with outer event target',pass:!menu.getSnapshot().selection});
    select(document.getElementById('answer'));const input=document.getElementById('textarea');input.focus();input.setSelectionRange(0,input.value.length);input.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,cancelable:true}));results.push({case:'textarea hides old answer menu',pass:!menu.getSnapshot().selection});
    const answer=document.getElementById('answer'),selection=window.getSelection(),range=document.createRange();range.setStart(answer.firstChild,0);range.setEnd(editor.firstChild,2);selection.removeAllRanges();selection.addRange(range);document.body.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));results.push({case:'range crossing into editor is excluded',pass:!menu.getSnapshot().selection});
    menu.dispose();return results;
  });
  const response=await call('Runtime.evaluate',{expression:'('+suite+')('+JSON.stringify(source)+')',returnByValue:true});
  if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  const results=response.result.value;for(const result of results)console.log((result.pass?'PASS ':'FAIL ')+result.case);
  try{await call('Browser.close');}catch{}
  if(results.some(result=>!result.pass))process.exitCode=1;
}finally{
  socket?.close();if(child.exitCode===null)child.kill();
  const target=resolve(profile),parent=resolve(tmpdir());
  if(!target.startsWith(parent+sep)||!target.split(sep).at(-1).startsWith('quotalk-browser-'))throw new Error('Unsafe profile cleanup path.');
  await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}
