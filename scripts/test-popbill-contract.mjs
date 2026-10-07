import assert from 'node:assert/strict';
import popbill from 'popbill';
// Replace the SDK transport before any call; no live credential or network use.
popbill.config({LinkID:'ROUNDY_TEST',SecretKey:Buffer.alloc(32).toString('base64'),IsTest:true});
const bank=popbill.EasyFinBankService(),cash=popbill.CashbillService();
const seen=[];
let response={};
for(const service of [bank,cash])service._executeAction=options=>{seen.push(options);options.success(response);};
function invoke(service,method,args){return new Promise((resolve,reject)=>service[method](...args,resolve,reject));}
response={jobID:'123456789012345678'};
assert.equal(await invoke(bank,'requestJob',['1234567890','0004','111122223333','20261007','20261008','member']),response.jobID);
response={jobState:'3',errorCode:1};assert.equal((await invoke(bank,'getJobState',['1234567890','123456789012345678','member'])).jobState,'3');
response={code:1,list:[],pageCount:0};assert.equal((await invoke(bank,'search',['1234567890','123456789012345678',['I'],'',1,1000,'A','member'])).code,1);
response={itemKey:'existing'};assert.equal(await invoke(cash,'checkMgtKeyInUse',['1234567890','RB123']),true);
response={};assert.equal(await invoke(cash,'checkMgtKeyInUse',['1234567890','RB123']),false);
response={stateCode:300,confirmNum:'123456789'};assert.equal((await invoke(cash,'getInfo',['1234567890','RB123','member'])).stateCode,300);
response={code:1,confirmNum:'123456789'};assert.equal((await invoke(cash,'registIssue',['1234567890',{mgtKey:'RB123'},'memo','member',''])).code,1);
assert.equal(seen.length,7);
console.log('PASS pinned Popbill SDK callback contracts: bank request/state/search and receipt existence/info/issue');
