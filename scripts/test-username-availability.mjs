import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
let handler, limited=false, broken=false, calls=0;
const admin={rpc:async(name,args)=>{
  calls++; assert.equal(name,'check_signup_availability');
  return {data:limited?{code:'over_request_rate_limit'}:{username_available:args.p_username!=='taken-id',email_available:args.p_email!=='taken@example.com'},error:broken?{}:null};
},from:()=>{throw Error('Must not perform another lookup');}};
const source=fs.readFileSync('supabase/functions/roundy-username-login/index.ts','utf8').replace(/^import .*\n/,'');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{createClient:()=>admin,crypto:webcrypto,TextEncoder,Response,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
async function request(body,origin='https://roundy.team'){return handler(new Request('https://example.com',{method:'POST',headers:{origin,'content-type':'application/json','x-forwarded-for':'192.0.2.1'},body:JSON.stringify(body)}));}
let response=await request({action:'check_availability',username:'  Taken-ID  '});
assert.equal(response.status,200);assert.deepEqual(await response.json(),{available:false});
assert.equal(response.headers.get('Access-Control-Max-Age'),'3600');
response=await request({action:'check_signup',username:'new-id',email:' TAKEN@example.com '});
assert.deepEqual(await response.json(),{username_available:true,email_available:false});assert.equal(calls,2);
assert.equal((await request({action:'check_availability',username:'bad@email.com'})).status,401);
limited=true;assert.equal((await request({action:'check_signup',email:'new@example.com'})).status,429);
limited=false;broken=true;assert.equal((await request({action:'check_signup',email:'new@example.com'})).status,503);
assert.equal((await request({action:'check_signup',email:'new@example.com'},'https://evil.example')).status,403);
assert.equal((await request({username:'taken-id'})).status,401);
console.log('PASS compatibility, combined checks, one database call, preflight caching, normalization, throttling and error handling');
