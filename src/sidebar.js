function createComponents(React,menu,storeFor) {
  const h=React.createElement;
  const css=`
  .qt-toolbar{position:fixed;z-index:2147483000;display:flex;align-items:center;max-width:calc(100vw - 16px);padding:4px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:12px;background:Canvas;color:CanvasText;box-shadow:0 4px 18px #0002;font:13px/1.4 inherit;pointer-events:auto}
  .qt-toolbar button{border:0;background:transparent;color:inherit;padding:7px 9px;border-radius:8px;cursor:pointer;white-space:nowrap;font:inherit}
  .qt-toolbar button:hover,.qt-chip:hover{background:color-mix(in srgb,CanvasText 7%,transparent)}
  .qt-toolbar-error{position:absolute;left:0;top:100%;padding:7px 10px;margin-top:5px;border:1px solid color-mix(in srgb,CanvasText 12%,transparent);border-radius:8px;background:Canvas;color:#c55;font-size:12px;max-width:300px}
  .qt-side{height:100%;min-height:0;min-width:0;display:flex;flex-direction:column;overflow:hidden;color:inherit;background:transparent;font:inherit;line-height:1.65}
  .qt-context{margin:12px 14px 0;padding:9px 12px;border-left:2px solid color-mix(in srgb,currentColor 28%,transparent);background:color-mix(in srgb,currentColor 4%,transparent);border-radius:0 8px 8px 0;flex-shrink:0}
  .qt-context summary{cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px;opacity:.75}
  .qt-context pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;overflow:auto;margin:8px 0 0;font-size:12px}
  .qt-chat{flex:1;min-height:0;overflow:auto;padding:18px 16px;overscroll-behavior:contain;scrollbar-width:thin}
  .qt-empty{max-width:230px;margin:12vh auto;color:inherit;opacity:.5;font-size:13px;text-align:center}
  .qt-entry{margin-bottom:26px;overflow-wrap:anywhere;font-size:13px}
  .qt-question{padding:9px 12px;margin:0 0 15px auto;max-width:92%;border-radius:12px;background:color-mix(in srgb,currentColor 7%,transparent);white-space:pre-wrap}
  .qt-answer{white-space:pre-wrap;tab-size:2;font-size:13px;line-height:1.8}
  .qt-status{font-size:11px;opacity:.5;margin-top:8px}.qt-error{color:#c55;opacity:1}
  .qt-composer{padding:10px 12px 12px;border-top:1px solid color-mix(in srgb,currentColor 9%,transparent);flex-shrink:0}
  .qt-input-wrap{border:1px solid color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,currentColor 3%,transparent);border-radius:14px;padding:10px}
  .qt-input-wrap:focus-within{border-color:color-mix(in srgb,currentColor 36%,transparent)}
  .qt-input{display:block;box-sizing:border-box;resize:vertical;width:100%;min-height:60px;max-height:180px;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1.6}
  .qt-actions{display:flex;align-items:center;gap:5px;padding-top:6px}.qt-chip{border:0;background:transparent;border-radius:6px;color:inherit;opacity:.7;cursor:pointer;font:inherit;font-size:11px;padding:4px 5px}.qt-chip:disabled{opacity:.3;cursor:default}
  .qt-submit{margin-left:auto;flex-shrink:0;border:0;border-radius:50%;width:30px;height:30px;background:CanvasText;color:Canvas;cursor:pointer;font-size:19px;line-height:1}.qt-submit:disabled{opacity:.3;cursor:default}
  .qt-meta{display:flex;gap:8px;align-items:center;margin-top:7px;font-size:10px;opacity:.6}.qt-meta select{font:inherit;color:inherit;background:Canvas;border:0;min-width:0;max-width:45%;outline-offset:2px}.qt-meta span{margin-left:auto;white-space:nowrap}
  .qt-jump{display:block;margin:0 auto 8px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:20px;background:Canvas;color:CanvasText;cursor:pointer;font-size:11px;padding:4px 9px}
  @media(prefers-reduced-motion:no-preference){.qt-toolbar{animation:qt-in .1s ease-out}@keyframes qt-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}}
  `;
  function Toolbar(){
    const state=React.useSyncExternalStore(menu.subscribe,menu.getSnapshot);
    if(!state.selection)return null;
    return h(React.Fragment,null,h('style',null,css),h('div',{'data-quotalk-ui':'toolbar',className:'qt-toolbar',role:'toolbar','aria-label':'所选文字操作',style:{left:state.selection.x,top:state.selection.y},onPointerDown:event=>event.preventDefault(),onKeyDown:event=>{event.stopPropagation();if(event.key==='Escape')menu.dismiss();}},
      h('button',{type:'button',onClick:()=>menu.open()},'在侧边聊天中提问'),
      state.error?h('div',{className:'qt-toolbar-error',role:'alert'},state.error):null));
  }
  function Sidebar(props){
    const store=storeFor(props.sessionId),state=React.useSyncExternalStore(store.subscribe,store.getSnapshot),thread=state.thread;
    const body=React.useRef(null),input=React.useRef(null),following=React.useRef(true),[above,setAbove]=React.useState(false);
    React.useEffect(()=>{if(following.current&&body.current)body.current.scrollTop=body.current.scrollHeight;},[state.version]);
    React.useEffect(()=>{following.current=true;setAbove(false);input.current?.focus();},[thread?.key]);
    if(!thread)return h('section',{'data-quotalk-ui':'sidebar',className:'qt-side'},h('style',null,css),h('div',{className:'qt-empty'},'选中主对话里的一段文字，再选择“在侧边聊天中提问”。'));
    const send=()=>void store.send(),last=thread.entries.at(-1);
    return h('section',{'data-quotalk-ui':'sidebar',className:'qt-side','aria-label':'侧边追问',onKeyDown:event=>event.stopPropagation()},h('style',null,css),
      h('details',{className:'qt-context',key:thread.key},h('summary',null,thread.quote),h('pre',null,thread.quote)),
      h('div',{className:'qt-chat',ref:body,onScroll:()=>{const el=body.current;following.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;setAbove(!following.current);}},
        thread.entries.length?thread.entries.map((entry,i)=>h('article',{className:'qt-entry',key:i},
          h('div',{className:'qt-question'},entry.question),
          h('div',{className:'qt-answer','aria-busy':!entry.completed},entry.answer||(!entry.completed?'正在思考…':'')),
          h('div',{className:'qt-status'+(entry.error?' qt-error':''),role:entry.error?'alert':'status'},entry.error||(!entry.completed?'正在回答…':'回答完成')))):
          h('div',{className:'qt-empty'},'哪里没看懂，就从这里问。')),
      above?h('button',{className:'qt-jump',type:'button',onClick:()=>{following.current=true;body.current.scrollTop=body.current.scrollHeight;setAbove(false);}},'↓ 回到最新'):null,
      h('div',{className:'qt-composer'},h('div',{className:'qt-input-wrap'},
        h('textarea',{className:'qt-input',ref:input,value:thread.draft,placeholder:'围绕这段内容问点什么…','aria-label':'追问内容',onChange:event=>store.draft(event.target.value),onKeyDown:event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();if(!thread.busy)send();}}}),
        h('div',{className:'qt-actions'},h('button',{className:'qt-chip',type:'button',disabled:thread.busy,onClick:()=>void store.send('请用通俗的语言解释这段内容。')},'解释一下'),h('button',{className:'qt-chip',type:'button',disabled:thread.busy,onClick:()=>void store.send('请举一个具体例子说明这段内容。')},'举个例子'),
          h('button',{className:'qt-submit',type:'button','aria-label':thread.busy?'停止回答':'发送追问',title:thread.busy?'停止回答':'发送追问',disabled:!thread.busy&&!thread.draft.trim(),onClick:()=>thread.busy?store.stop():send()},thread.busy?'■':'↑'))),
        h('div',{className:'qt-meta'},h('select',{'aria-label':'关联上下文',value:thread.scope,onChange:event=>store.scope(event.target.value)},[['current','仅当前回答'],['2','最近 2 轮'],['4','最近 4 轮'],['all','已加载全部对话']].map(([value,label])=>h('option',{key:value,value},label))),h('span',null,'Enter 发送 · Shift + Enter 换行'))));
  }
  return {Toolbar,Sidebar};
}
