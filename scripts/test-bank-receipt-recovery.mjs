import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
const load=async(file,require)=>{const exports={};new Function('exports','require',ts.transpile(await readFile(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(exports,require);return exports;};
const core=await load('src/lib/payments/bank-transfer.ts',()=>{});
process.env.BANK_RECEIPT_ENCRYPTION_KEY='1'.repeat(64);
const encryption=await load('src/lib/payments/bank-transfer.server.ts',id=>id==='node:crypto'?crypto:id==='./bank-transfer'?core:{});
const encrypted=encryption.encryptIdentity('01012345678','order1');
assert.equal(encryption.decryptIdentity(encrypted,'order1'),'01012345678');
assert.notEqual(encrypted,encryption.encryptIdentity('01012345678','order1'));
assert.throws(()=>encryption.decryptIdentity(encrypted,'order2'),'Ciphertext is bound to order');
assert.throws(()=>encryption.decryptIdentity(encrypted.slice(0,-2)+'00','order1'));

// Exercise the actual worker with a durable provider document and a lost HTTP
// response: the retry discovers the same document and MUST NOT reissue it.
class ProviderError extends Error{constructor(code){super(code);this.code=code;}}
const order='RNDY-B-test';let issues=0,exists=false,providerState=300;
let receipt={order_number:order,mgt_key:'RB123',status:'queued',attempts:0,next_attempt_at:new Date(0).toISOString(),confirm_num:null};
let sync={id:true,account_number:'12345678901',job_id:'123456789012345678',job_started_at:new Date().toISOString(),next_page:1};
const request={receipt_kind:'personal',identity_cipher:'cipher',tax_mode:'taxable'};
let payment={status:'completed',amount:49000};
const db={
 rpc:async()=>({data:true,error:null}),
 from(table){let update=null,one=false;return {
  select(){return this;},eq(){return this;},in(){return this;},lte(){return this;},order(){return this;},limit(){return this;},
  single(){one=true;return this;},update(value){update=value;return this;},
  then(resolve,reject){
   try{
    const row=table==='bank_transfer_sync'?sync:table==='event_payment_orders'?payment:table==='bank_transfer_requests'?request:receipt;
    if(update)Object.assign(row,update);
    resolve({data:update?null:one?{...row}:[{...row}],error:null});
   }catch(e){reject(e);}
  }
 };}
};
const providerCall=async(kind,method,args)=>{
 if(method==='getJobState')return {jobState:'2',errorCode:1};
 if(method==='checkMgtKeyInUse')return exists;
 if(method==='registIssue'){
  issues++;exists=true;
  assert.equal(args[1].mgtKey,'RB123');assert.equal(args[1].smssendYN,false);assert.equal(args[1].email,undefined);
  throw new ProviderError('timeout');
 }
 if(method==='getInfo')return {stateCode:providerState,confirmNum:'123456789',tradeDate:'20261008',totalAmount:'49000',orderNumber:order,ntsresultCode:providerState===304?'0000':undefined};
 throw new Error('Unexpected SDK call '+method);
};
const worker=await load('src/lib/payments/bank-worker.server.ts',id=>({
 'node:crypto':crypto,'@/lib/supabase/service':{createServiceRoleClient:()=>db},
 './bank-transfer.server':{bankSettings:()=>({enabled:true,account:'12345678901'}),decryptIdentity:()=> '01012345678'},
 './bank-transfer':core,'./popbill.server':{providerCall,ProviderError},'server-only':{},
}[id]??(()=>{throw new Error('Unexpected import '+id);})()));
await worker.runBankWorker();assert.equal(issues,1);assert.equal(receipt.status,'queued');assert.equal(receipt.attempts,1);
await worker.runBankWorker();assert.equal(issues,1);assert.equal(receipt.status,'issued');assert.equal(receipt.confirm_num,'123456789');
providerState=304;await worker.runBankWorker();assert.equal(issues,1);assert.equal(receipt.status,'reported');
providerState=305;await worker.runBankWorker();assert.equal(receipt.status,'review');assert.equal(issues,1);
payment={status:'refunded',amount:49000};receipt={...receipt,status:'queued'};await worker.runBankWorker();assert.equal(receipt.status,'review');assert.equal(issues,1,'Never issue against refunded payment');
console.log('PASS cash receipt worker: AES-GCM order binding, ambiguous timeout recovery, same management key, no duplicate issuance, no unsolicited messages, NTS rejection and refund safety');
