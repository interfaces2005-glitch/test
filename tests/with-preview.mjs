import {spawn} from 'node:child_process';
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5175','--strictPort'],{stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<40;i++){if(child.exitCode!==null)throw new Error('Test server could not start on port 5175');try{const res=await fetch('http://127.0.0.1:5175/');if(res.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw new Error('Preview server did not start');
 if(process.argv[2]==='auth')await import('./admin-browser.mjs');else if(process.argv[2]==='cms')await import('./cms-browser.mjs');else if(process.argv[2]==='race')await import('./browser-race.mjs');else if(process.argv[2]==='payments')await import('./payments-browser.mjs');else{await import('./admin-browser.mjs');await import('./browser-check.mjs');await import('./browser-race.mjs');await import('./cms-browser.mjs');await import('./payments-browser.mjs');}
}finally{child.kill();}
