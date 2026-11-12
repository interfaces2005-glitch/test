import React,{useEffect,useRef} from 'react';
let locks=0,previousOverflow='';
export default function Dialog({title,onClose,children,variant=''}){
 const ref=useRef(),closeRef=useRef(onClose),backdropDown=useRef(false);closeRef.current=onClose;
 useEffect(()=>{if(ref.current)ref.current.scrollTop=0;},[title]);
 useEffect(()=>{const el=ref.current,focus=document.activeElement;if(locks++===0){previousOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';}el.showModal();el.focus({preventScroll:true});const fn=e=>{e.preventDefault();closeRef.current();};el.addEventListener('cancel',fn);return()=>{el.removeEventListener('cancel',fn);el.close();if(--locks===0)document.documentElement.style.overflow=previousOverflow;if(focus?.isConnected)focus.focus({preventScroll:true});};},[]);
 const outside=e=>{const r=ref.current.getBoundingClientRect();return e.target===ref.current&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
 return <dialog ref={ref} tabIndex={-1} aria-label={title} className={'dialog '+variant} onPointerDown={e=>{backdropDown.current=outside(e);}} onClick={e=>{if(backdropDown.current&&outside(e))onClose();backdropDown.current=false;}}><div className="dialog-header"><h3>{title}</h3><button className="icon" onClick={onClose} aria-label="Закрыть">×</button></div>{children}</dialog>;
}
