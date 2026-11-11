// One IndexedDB transaction owns each read/change/write across all browser tabs.
// localStorage is only a compatibility mirror; it is never the booking authority.
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('madinlashes-state',1);req.onupgradeneeded=()=>req.result.createObjectStore('root');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('Не удалось открыть данные студии в браузере'));});}
export async function accessState(hydrate,change,onCommit){
 const db=await database();return new Promise((resolve,reject)=>{
  const tx=db.transaction('root',change?'readwrite':'readonly'),store=tx.objectStore('root'),get=store.get('state');let result,next,missing=false,failed;
  get.onsuccess=()=>{try{missing=get.result===undefined;next=hydrate(get.result);result=change?change(next):next;if(change){next.stateVersion=(next.stateVersion||0)+1;store.put(next,'state');}}catch(e){failed=e;tx.abort();}};
  tx.oncomplete=async()=>{db.close();if(!change&&missing){try{resolve(await accessState(hydrate,d=>d,onCommit));}catch(e){reject(e);}return;}if(change)onCommit(next);resolve(result);};
  tx.onabort=tx.onerror=()=>{db.close();reject(failed||new Error('Не удалось сохранить изменения. Проверьте доступное место в браузере.'));};
 });
}
