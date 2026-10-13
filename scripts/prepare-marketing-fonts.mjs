import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const revision='f8d157532fbfaeda587e826d4cd5b21a49186f7c';
const root=path.join(process.cwd(),'.cache','marketing-fonts');
const files=[
 {name:'NotoSansCJKkr-Regular.otf',source:'OTF/Korean/NotoSansCJKkr-Regular.otf',sha:'dc4a7c65e6f450bf17c10a2405250b620eb78703',size:16433112},
 {name:'NotoSansCJKkr-Black.otf',source:'OTF/Korean/NotoSansCJKkr-Black.otf',sha:'b5b67bf293310a3648468a21ac829d6f2d58b2d5',size:17793656},
 {name:'LICENSE',source:'LICENSE',sha:'d952d62c065f3f35fb83a173496e90b21525aef3'}
];
const digest=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const valid=(b,f)=>digest(b)===f.sha&&(!f.size||b.length===f.size)&&(!f.name.endsWith('.otf')||b.subarray(0,4).toString()==='OTTO');
await mkdir(root,{recursive:true});
await Promise.all(files.map(async f=>{
 const dest=path.join(root,f.name);
 try{if(valid(await readFile(dest),f))return;}catch{}
 // Only build-time public static downloads retry. No runtime/provider/paid retry.
 for(let attempt=0;attempt<3;attempt++){
  const temp=dest+'.'+randomUUID()+'.tmp';
  try{
   const response=await fetch('https://raw.githubusercontent.com/notofonts/noto-cjk/'+revision+'/Sans/'+f.source,{signal:AbortSignal.timeout(45000),redirect:'error'});
   if(!response.ok)throw Error('FONT_DOWNLOAD_HTTP_'+response.status);
   const chunks=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>20*1024*1024)throw Error('FONT_DOWNLOAD_TOO_LARGE');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);
   if(!valid(bytes,f))throw Error('FONT_BUILD_INTEGRITY_FAILED: '+f.name);
   await writeFile(temp,bytes,{flag:'wx'});await rename(temp,dest);return;
  }catch(error){await rm(temp,{force:true});if(attempt===2)throw error;await new Promise(r=>setTimeout(r,500*(attempt+1)));}
 }
}));
console.log('PASS pinned marketing fonts and license verified for deployment; runtime uses local files only');
