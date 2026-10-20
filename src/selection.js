function installSelectionMenu(ctx,core,onOpen) {
  let current=null,disposed=false,revision=0;
  let state={selection:null,error:'',revision};
  const listeners=new Set();
  const publish=(selection,error='')=>{state={selection,error,revision:++revision};for(const fn of listeners)fn();};
  const hide=()=>{current=null;publish(null);};
  const binding=()=>ctx.uiSession.adapter.current.getSnapshot();
  const elementOf=node=>node?.nodeType===3?node.parentElement:node?.closest?node:node?.parentElement;
  const excluded=node=>{
    const element=elementOf(node);
    return !!element&&(element.isContentEditable||!!element.closest?.('textarea,input,select,[role="textbox"],[data-lexical-editor],[contenteditable]:not([contenteditable="false"]),[data-quotalk-ui],button,nav,aside'));
  };
  const capture=event=>{
    if(disposed)return;
    const target=elementOf(event.target);
    // Preserve the toolbar's own click, but never leave it over an editor.
    if(target?.closest?.('[data-quotalk-ui="toolbar"]'))return;
    if(excluded(target)||(event.composedPath?.()||[]).some(excluded)){hide();return;}
    const selection=window.getSelection(),quote=selection?.toString().trim(),element=elementOf(selection?.anchorNode);
    if(!quote||quote.length<2||!selection.rangeCount||!element){hide();return;}
    const range=selection.getRangeAt(0);
    // Mouseup can land outside the editor, and keyboard events may target its
    // outer shell. Check the actual selection, including cross-boundary ranges.
    if([selection.anchorNode,selection.focusNode,range.startContainer,range.endContainer].some(excluded)){hide();return;}
    const selectedBinding=binding(),sessionId=selectedBinding?.props?.sessionId;
    if(!sessionId){hide();return;}
    const rect=range.getBoundingClientRect();
    if(!rect.width&&!rect.height){hide();return;}
    const source=captureNative(selectedBinding,element,quote,'current',core);
    current={sessionId,quote:quote.slice(0,3000),paragraph:(element.closest('p,li,pre,blockquote')||element).innerText?.slice(0,6000)||'',element,source,x:Math.max(8,Math.min(window.innerWidth-208,rect.left)),y:rect.bottom+44<window.innerHeight?rect.bottom+8:Math.max(8,rect.top-44)};
    publish(current);
  };
  const outside=event=>{if(!event.target?.closest?.('[data-quotalk-ui="toolbar"]'))hide();};
  const keydown=event=>{if(event.key==='Escape')hide();};
  const selectionChanged=()=>{const selection=window.getSelection();if(!selection?.rangeCount||excluded(selection.anchorNode)||excluded(selection.focusNode))hide();};
  const scrolled=event=>{if(!event.target?.closest?.('[data-quotalk-ui]'))hide();};
  document.addEventListener('pointerup',capture);
  document.addEventListener('keyup',capture);
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',keydown);
  document.addEventListener('selectionchange',selectionChanged);
  document.addEventListener('scroll',scrolled,true);
  window.addEventListener('resize',hide);
  const unsubscribe=ctx.uiSession.adapter.current.subscribe(hide);
  return {
    dismiss:hide,
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},getSnapshot:()=>state,
    open(){if(!current)return;try{onOpen(current);hide();}catch(error){publish(current,error.message);}},
    dispose(){disposed=true;unsubscribe();document.removeEventListener('pointerup',capture);document.removeEventListener('keyup',capture);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keydown);document.removeEventListener('selectionchange',selectionChanged);document.removeEventListener('scroll',scrolled,true);window.removeEventListener('resize',hide);listeners.clear();},
  };
}
