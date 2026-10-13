import {createHash} from 'node:crypto';
import sharp from 'sharp';
type Row=Record<string,any>;
export type GeneratedAsset={version:1;key:string;path:string;sha256:string;bytes:number};
const hash=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
export const generatedAssetKey=(prompt:string,model:string)=>hash(JSON.stringify(['roundy-ai-card-v1',model,prompt]));
export function savedGeneratedAsset(document:Row|undefined,key:string):GeneratedAsset|null{
 const entry=document?.generated_ai_assets?.[key];if(!entry)return null;
 if(entry.version!==1||entry.key!==key||!/^[a-f0-9]{64}$/.test(key)||
  typeof entry.path!=='string'||!/^generated\/[a-f0-9-]{36}\/[a-f0-9]{64}\.jpg$/.test(entry.path)||
  !entry.path.endsWith('/'+key+'.jpg')||!/^[a-f0-9]{64}$/.test(entry.sha256)||
  !Number.isInteger(entry.bytes)||entry.bytes<100||entry.bytes>5*1024*1024)
  throw new Error('AI_ASSET_RECOVERY_REQUIRED');
 return entry;
}
export async function loadGeneratedAsset(db:any,document:Row|undefined,key:string):Promise<string|null>{
 const entry=savedGeneratedAsset(document,key);if(!entry)return null;
 const result=await db.storage.from('marketing-images').download(entry.path);
 if(result.error||!result.data)throw new Error('AI_ASSET_RECOVERY_REQUIRED');
 const bytes=Buffer.from(await result.data.arrayBuffer());
 if(bytes.length!==entry.bytes||hash(bytes)!==entry.sha256)throw new Error('AI_ASSET_RECOVERY_REQUIRED');
 return 'data:image/jpeg;base64,'+bytes.toString('base64');
}
export async function persistGeneratedAsset(db:any,jobId:string,key:string,encoded:string):Promise<{asset:GeneratedAsset;image:string}>{
 if(!/^[a-f0-9-]{36}$/i.test(jobId)||!/^[a-f0-9]{64}$/.test(key))throw new Error('AI_ASSET_KEY_INVALID');
 const raw=Buffer.from(encoded,'base64');
 if(raw.length<100||raw.length>6*1024*1024)throw new Error('INVALID_GENERATED_AI_THUMBNAIL');
 const meta=await sharp(raw).metadata();
 if(!meta.width||!meta.height||meta.width*meta.height>24_000_000)throw new Error('INVALID_GENERATED_AI_THUMBNAIL');
 const bytes=await sharp(raw).rotate().resize(1080,1350,{fit:'cover'}).jpeg({quality:90}).toBuffer();
 if(bytes.length<100||bytes.length>5*1024*1024)throw new Error('INVALID_GENERATED_AI_THUMBNAIL');
 const asset:GeneratedAsset={version:1,key,path:'generated/'+jobId+'/'+key+'.jpg',sha256:hash(bytes),bytes:bytes.length};
 const result=await db.storage.from('marketing-images').upload(asset.path,bytes,{contentType:'image/jpeg',upsert:false});
 if(result.error)throw new Error('AI_ASSET_SAVE_FAILED');
 return {asset,image:'data:image/jpeg;base64,'+bytes.toString('base64')};
}
