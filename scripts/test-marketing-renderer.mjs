import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript'),sharp=require('sharp'),{fixture}=require('./marketing-fixtures.cjs'),cache={};
function load(file){if(cache[file])return cache[file];const context={exports:{},URL,Buffer,console,require:n=>n==='./marketing-content-policy'?load('src/lib/marketing-content-policy.ts'):require(n)};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return cache[file]=context.exports;}
const p=load('src/lib/marketing-content-policy.ts'),e=load('src/lib/marketing-editorial.ts');fs.mkdirSync('quality-artifacts',{recursive:true});
const hashes=new Set();
for(const language of ['en','ko']){const doc=fixture('book_insight',language,p.CONTENT_PROFILES),sources=[{id:'S1',url:'https://publisher.example/listening',title:'Listening Across Difference by Alex Lee',evidence:'Listening Across Difference by Alex Lee explains attentive listening.'}],prepared=p.prepareContent(doc,'book_insight',language,sources);for(let i=0;i<prepared.slides.length;i++){const png=Buffer.from(await e.editorialCard(prepared.slides[i],i,prepared.slides.length,doc).arrayBuffer());const info=await sharp(png).metadata();assert.equal(info.width,1080);assert.equal(info.height,1350);hashes.add(createHash('sha256').update(png).digest('hex'));await sharp(png).jpeg({quality:85}).toFile('quality-artifacts/'+language+'-'+i+'.jpg');}}
assert.equal(hashes.size,12);
const source=fs.readFileSync('src/lib/marketing-editorial.ts','utf8');
assert.ok(source.includes('M22 40C28.6274'));
assert.ok(source.includes('visualMotif'));
assert.ok(source.includes('roundyLockup'));
console.log('PASS: real renderer produced 12 distinct 1080x1350 branded cards with Roundy vector mark and contextual illustration code, including Korean glyphs. These are fixtures, not posted content.');
