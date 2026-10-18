function installSelectionMenu(ctx,core,onOpen) {
  let current=null,disposed=false,revision=0;
  let state={selection:null,error:'',revision};
  const listeners=new Set();
  const publish=(selection,error='')=>{state={selection,error,revision:++revision};for(const fn of listeners)fn();};
  const hide=()=>{current=null;publish(null);};
  const binding=()=>ctx.uiSession.adapter.current.getSnapshot();
  const capture=event=>{
    if(disposed)return;
    const target=event.target?.nodeType===3?event.target.parentElement:event.target;
    if(target?.closest?.('[data-quotalk-ui],textarea,input,button,nav,aside,[contenteditable="true"]'))return;
    const selection=window.getSelection(),quote=selection?.toString().trim(),element=selection?.anchorNode?.parentElement;
    if(!quote||quote.length<2||!selection.rangeCount||!element){hide();return;}
    const selectedBinding=binding(),sessionId=selectedBinding?.props?.sessionId;
    if(!sessionId){hide();return;}
    const rect=selection.getRangeAt(0).getBoundingClientRect();
    if(!rect.width&&!rect.height){hide();return;}
    const source=captureNative(selectedBinding,element,quote,'current',core);
    let insertion=null;try{insertion=selectedBinding.props.inputActions?.captureInsertion?.();}catch{}
    current={sessionId,quote:quote.slice(0,3000),paragraph:(element.closest('p,li,pre,blockquote')||element).innerText?.slice(0,6000)||'',element,source,insertion,x:Math.max(8,Math.min(window.innerWidth-312,rect.left)),y:rect.bottom+44<window.innerHeight?rect.bottom+8:Math.max(8,rect.top-44)};
    publish(current);
  };
  const outside=event=>{if(!event.target?.closest?.('[data-quotalk-ui="toolbar"]'))hide();};
  const keydown=event=>{if(event.key==='Escape')hide();};
  const scrolled=event=>{if(!event.target?.closest?.('[data-quotalk-ui]'))hide();};
  document.addEventListener('pointerup',capture);
  document.addEventListener('keyup',capture);
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',keydown);
  document.addEventListener('scroll',scrolled,true);
  window.addEventListener('resize',hide);
  const unsubscribe=ctx.uiSession.adapter.current.subscribe(hide);
  return {
    dismiss:hide,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},getSnapshot:()=>state,
    add(){if(!current)return;try{addQuoteToMain(ctx,current);hide();}catch(error){publish(current,error.message);}},
    open(){if(!current)return;try{onOpen(current);hide();}catch(error){publish(current,error.message);}},
    dispose(){disposed=true;unsubscribe();document.removeEventListener('pointerup',capture);document.removeEventListener('keyup',capture);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown);document.removeEventListener('scroll',scrolled,true);window.removeEventListener('resize',hide);listeners.clear();},
  };
}
