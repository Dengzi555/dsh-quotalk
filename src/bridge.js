// Included inside the native Client factory; no global chrome shim is installed.
function textBlocks(blocks) {
  return (blocks || []).filter(b => b.type === 'text' || b.kind === 'text').map(b => b.text || '').join('\n');
}
function readConversation(binding) {
  const conversation = binding?.hooks?.conversation?.getSnapshot?.();
  const chat = binding?.hooks?.chat?.getSnapshot?.() || conversation?.views?.get?.('chat');
  // RC.2 exposes the legacy slice; newer Chat exposes it under `legacy`.
  const raw = chat?.legacy?.nodes || chat?.nodes || conversation?.nodes || [];
  const list = Array.isArray(raw) ? raw : [];
  const messages = list.flatMap(node => {
    if (node.kind === 'assistant') return [{ role:'assistant', text:textBlocks(node.blocks), config:node.requestConfig || node.providerMetadata }];
    if (node.kind === 'user' || node.kind === 'steering') return [{ role:'user', text:textBlocks(node.content) }];
    return [];
  }).filter(m => m.text.trim());
  const partial = chat?.legacy?.partial || chat?.partial || conversation?.partial;
  const partialText = textBlocks(partial?.blocks);
  if (partialText) messages.push({role:'assistant',text:partialText});
  let model;
  try {
    const projected = binding?.keyedHooks?.projection?.('modelSelection')?.getSnapshot?.();
    const value = projected?.value || projected;
    model = value?.next || value?.lastUsed;
  } catch { /* older projections: use the last completed request's route */ }
  model ||= [...messages].reverse().find(m => m.config?.provider && m.config?.model)?.config;
  return {messages,model};
}

function captureNative(binding, element, quote, scope, core) {
  const {messages} = readConversation(binding);
  const matches = messages.map((m,i) => m.role === 'assistant' && (!quote || m.text.includes(quote)) ? i : -1).filter(i => i >= 0);
  const index = matches.at(-1);
  let raw = index === undefined ? '' : messages[index].text;
  // Fall back only to the selected paragraph; do not collect the whole app DOM.
  if (!raw && element) raw = (element.closest('pre,p,li,blockquote') || element).innerText || '';
  let prior = scope === 'current' ? [] : messages.filter((_,i) => i !== index);
  if (scope === '2' || scope === '4') {
    const starts = prior.flatMap((m,i) => m.role === 'user' ? [i] : []);
    prior = prior.slice(starts[Math.max(0,starts.length-Number(scope))] ?? 0);
  }
  const packed = core.packMessages(prior);
  return {messages:packed.messages,currentAnswer:core.shorten(raw,18000,quote),truncated:packed.truncated || raw.length>18000,recognized:!!raw || !!prior.length};
}

function createBridge(ctx, sessionId) {
  let active = true, tokenPromise;
  const clientHeaders = typeof location!=='undefined' && location.protocol==='dsh-app:' && location.host==='app' ? {'x-quotalk-client':'dsh-desktop'} : {};
  const listeners = new Set(), jobs = new Map(), controllers = new Set();
  const binding = () => {
    const value=ctx.uiSession.adapter.current.getSnapshot();
    if(sessionId && value?.props?.sessionId!==sessionId)throw new Error('请先切回这条追问对应的主对话。');
    return value;
  };
  const publish = job => {
    job.updated = Math.max(Date.now(),(job.updated || 0)+1);
    for (const listener of listeners) listener({type:'job-update',job:{...job}});
  };
  async function token() {
    if (!tokenPromise) tokenPromise = fetch('/dsh-quotalk/bootstrap',{headers:clientHeaders,cache:'no-store',credentials:'same-origin'}).then(async response => {
      const value = await response.json(); if (!response.ok || !value.token) throw new Error(value.error || '无法连接 Quotalk 插件。'); return value.token;
    }).catch(error => {tokenPromise=null;throw error;});
    return tokenPromise;
  }
  async function run(job, prompt, route) {
    const controller = new AbortController(); controllers.add(controller);job.controller=controller;
    try {
      const key = await token(); if (!active) return;
      const response = await fetch('/dsh-quotalk/ask',{
        method:'POST',headers:{...clientHeaders,'content-type':'application/json','x-quotalk-token':key},credentials:'same-origin',
        body:JSON.stringify({prompt,provider:route.provider,model:route.model,reasoningEffort:route.reasoningEffort}),signal:controller.signal,
      });
      if (!response.ok) {const error=await response.json().catch(()=>({}));if(response.status===403)tokenPromise=null;throw new Error(error.error || 'DSH 追问服务暂不可用。');}
      if (!response.body) throw new Error('当前客户端不支持读取流式回答。');
      const reader=response.body.getReader(), decoder=new TextDecoder();let pending='',finished=false;
      const accept = line => {
        if (!line.trim() || finished) return;
        const event=JSON.parse(line);
        if (event.type==='error') throw new Error(event.error);
        if (event.type==='text') {job.text=event.text;job.status='streaming';publish(job);}
        if (event.type==='done') {job.text=event.text;job.status='done';finished=true;publish(job);}
      };
      try {
        while(active&&!finished) {
          const {done,value}=await reader.read(); pending+=decoder.decode(value || new Uint8Array(),{stream:!done});
          const lines=pending.split('\n');pending=lines.pop();for(const line of lines)accept(line);
          if(done){if(pending)accept(pending);break;}
        }
        if (!finished && active) throw new Error('回答流意外中断，请重试。');
      } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
    } catch (error) {
      if(active){job.status='error';job.error=error.name==='AbortError'?'已停止回答。':error.message || '追问失败。';publish(job);}
    } finally {controllers.delete(controller);delete job.controller;}
  }
  return {
    binding,
    capture(element,quote,scope,core){return captureNative(binding(),element,quote,scope,core);},
    async rpc(type,payload={}) {
      if (!active) throw new Error('Quotalk 已关闭。');
      if (type==='prepare') return {};
      if (type==='state') {const job=jobs.get(payload.id);if(!job)throw new Error('追问已结束或窗口已刷新。');return {...job};}
      if (type==='start') {
        const route=readConversation(binding()).model;
        if (!route?.provider || !route?.model) throw new Error('请先在 DSH 当前对话选择模型并完成一次对话，再使用追问。');
        // Each request has its own id; an earlier result can never overwrite a new quote.
        const id=crypto.randomUUID(),job={id,revision:1,status:'running',stage:'waiting',requestStarted:true,text:'',error:'',updated:Date.now()};
        jobs.set(id,job);while(jobs.size>120){const oldest=[...jobs].find(([,v])=>['done','error'].includes(v.status));if(!oldest)break;jobs.delete(oldest[0]);}
        void run(job,payload.prompt,{...route});return {id,revision:1};
      }
      throw new Error('不支持的 Quotalk 操作：'+type);
    },
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    show(){for(const listener of listeners)listener({type:'show'});},
    cancel(id){jobs.get(id)?.controller?.abort();},
    cancelAll(){for(const controller of controllers)controller.abort();},
    dispose(){active=false;for(const controller of controllers)controller.abort();controllers.clear();listeners.clear();jobs.clear();},
  };
}
