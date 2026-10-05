import fs from 'node:fs';
const p='scripts/test-marketing-compact-runtime.mjs';let s=fs.readFileSync(p,'utf8');
function replace(from,to){if(!s.includes(from))throw new Error('Harness anchor missing: '+from);s=s.replace(from,()=>to);}
replace('function harness(language){','export function harness(language){');
replace('const requests=[],stored=[],cache={};','const requests=[],stored=[],reservations=[],cache={};');
replace("assert.equal(name,'reserve_marketing_generation');","assert.equal(name,'reserve_marketing_generation');reservations.push(structuredClone(p));");
replace("reserved_usd:p.p_operation==='copy_photo'?.07:.02","reserved_usd:p.p_operation==='render'?0:p.p_operation==='copy_photo'?.07:.02");
replace("return {id,tables,requests,stored,api:load('src/lib/marketing-generation.ts')};","return {id,tables,requests,stored,reservations,copy,api:load('src/lib/marketing-generation.ts'),policy:load('src/lib/marketing-content-policy.ts'),presentation:load('src/lib/marketing-presentation.ts'),recovery:load('src/lib/marketing-output-recovery.ts'),research:load('src/lib/marketing-research-task.ts'),editorial:load('src/lib/marketing-editorial.ts')};");
fs.writeFileSync(p,s);
console.log('Mocked runtime harness extended for saved result recovery tests.');
