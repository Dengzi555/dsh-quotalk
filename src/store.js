function createSessionStore(ctx,sessionId,core) {
  const bridge=createBridge(ctx,sessionId),listeners=new Set(),threads=new Map();
  let active=true,selected=null,version=0;
  const snapshot=()=>({version,thread:selected});let cached=snapshot();
  const publish=()=>{if(!active)return;version++;cached=snapshot();for(const fn of listeners)fn();};
  const unsubscribe=bridge.subscribe(event=>{
    if(event.type!=='job-update')return;
    const job=event.job;
    for(const thread of threads.values()){
      const entry=thread.entries.find(entry=>entry.jobId===job.id);if(!entry)continue;
      entry.answer=job.text||entry.answer;
      entry.status=job.status;entry.error=job.error||'';
      if(job.status==='done'||job.status==='error'){thread.busy=false;entry.completed=true;}
      publish();break;
    }
  });
  return {
    bridge,sessionId,
    getSnapshot:()=>cached,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    select(selection){
      if(selection.sessionId!==sessionId)throw new Error('所选内容属于其他对话，请重新划词。');
      const key=selection.quote+'\n'+selection.source.currentAnswer;
      if(!threads.has(key))threads.set(key,{key,quote:selection.quote,paragraph:selection.paragraph,source:selection.source,element:selection.element,entries:[],draft:'',scope:'current',busy:false,error:''});
      selected=threads.get(key);publish();
    },
    draft(text){if(selected){selected.draft=text;publish();}},
    scope(value){if(selected&&['current','2','4','all'].includes(value)){selected.scope=value;publish();}},
    async send(question=selected?.draft){
      const thread=selected;
      if(!active||!thread||thread.busy||!question?.trim())return;
      thread.busy=true;thread.error='';thread.draft='';
      const entry={question:question.trim(),answer:'',status:'running',error:'',completed:false};thread.entries.push(entry);publish();
      try{
        // Refresh only this Session. Switching the main view cannot silently rebind a prompt.
        bridge.binding();
        if(thread.element?.isConnected)thread.source=bridge.capture(thread.element,thread.quote,thread.scope,core);
        else if(thread.scope==='current')thread.source={...thread.source,messages:[]};
        const history=thread.entries.slice(0,-1).filter(e=>e.status==='done').map(e=>({question:e.question,answer:e.answer}));
        const prompt=core.prompt(thread.quote,thread.paragraph,entry.question,history,thread.source);
        const result=await bridge.rpc('start',{prompt});entry.jobId=result.id;
        // Catch an unusually fast provider finish that preceded the subscription identity.
        const job=await bridge.rpc('state',{id:result.id});
        if(!entry.completed){entry.answer=job.text;entry.status=job.status;entry.error=job.error||'';if(['done','error'].includes(job.status)){entry.completed=true;thread.busy=false;}publish();}
      }catch(error){entry.status='error';entry.error=error.message;entry.completed=true;thread.busy=false;publish();}
    },
    stop(){const entry=selected?.entries.at(-1);if(entry?.jobId)bridge.cancel(entry.jobId);},
    cancelAll(){bridge.cancelAll();},
    dispose(){active=false;unsubscribe();bridge.dispose();listeners.clear();threads.clear();},
  };
}
