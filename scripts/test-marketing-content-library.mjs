import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const store=new Map(),sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
let confirm=true,timer,rows=[],current=null,posts=[],lost=false;
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fetch=async(url,options={})=>{
 const route=String(url).replace('/api/admin/marketing/contents','');const body=options.body?JSON.parse(options.body):null;
 if(body){posts.push({route,body});if(route===''){
  current={content:{id,stage:'copy',status:'queued',state_version:2,version:1,request_payload:body},draft:{id,caption:'',carousel_slides:[],images:[]},photos:[],steps:[],versions:[]};rows=[current.content];
  if(lost){lost=false;throw Error('SIMULATED_RESPONSE_LOSS');}
 }else if(route.endsWith('/edit')){current.content={...current.content,version:2,state_version:8};current.draft.caption=body.caption;}}
 const data=body?{content:current.content}:route===''?{enabled:true,contents:rows,next_cursor:null}:current;
 return {ok:true,json:async()=>structuredClone(data)};
};
const cache=new Map();function load(file){if(cache.has(file))return cache.get(file);
 const context={exports:{},React,URL,Buffer,Intl,Date,AbortSignal,console,crypto:globalThis.crypto,sessionStorage,fetch,
  document:{visibilityState:'visible'},window:{confirm:()=>confirm},setInterval:fn=>{timer=fn;return 1;},clearInterval:()=>{timer=null;},setTimeout,clearTimeout,
  require:n=>{if(n.endsWith('.css'))return {};if(n.startsWith('@/'))return load('src/'+n.slice(2)+'.ts');if(n.startsWith('.'))return load(path.join(path.dirname(file),n)+'.ts');return require(n);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);cache.set(file,context.exports);return context.exports;
}
const {AdminMarketingContentLibrary}=load('src/components/admin-marketing-content-library.tsx');let view,n=0;
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';
const tick=()=>new Promise(r=>setTimeout(r,5));
const mount=async locale=>act(async()=>{view=create(React.createElement(AdminMarketingContentLibrary,{locale}));await tick();});
const click=async label=>{const b=view.root.findAllByType('button').find(b=>text(b)===label);assert.ok(b,label);assert.notEqual(b.props.disabled,true,label+' disabled');await act(async()=>{b.props.onClick?.();await tick();});};
const field=(label,tag)=>view.root.findAllByType('label').find(l=>text(l).startsWith(label)).findByType(tag);
for(const locale of ['ko','en']){
 rows=[];current=null;posts=[];store.clear();await mount(locale);
 await click(locale==='ko'?'새 콘텐츠':'New content');n++;
 const subject=field(locale==='ko'?'구체적인 소재와 참고 자료':'Specific subject and references','textarea');
 await act(async()=>subject.props.onChange({target:{value:'A specific illustrated conversation'}}));
 lost=true;await act(async()=>{view.root.findByType('form').props.onSubmit({preventDefault(){}});await tick();});
 assert.equal(posts.length,1);assert.ok(store.get('roundy:central-content:pending-create'));const key=posts[0].body.request_key;n++;
 await act(async()=>view.unmount());await mount(locale);await click(locale==='ko'?'같은 요청 다시 확인':'Check the same request');
 assert.equal(posts.length,2);assert.equal(posts[1].body.request_key,key);assert.equal(store.size,0);assert.equal(posts.some(p=>p.route.includes('import')),false);n++;
 // The initial version had no copy; arrival of saved copy must initialize editable caption fields.
 current.content={...current.content,status:'blocked',stage:'media',state_version:6,required_action:'photo_approval_required'};rows=[current.content];
 current.draft={...current.draft,caption:'Saved nonempty caption',carousel_slides:[{role:'cover',title:'Saved headline',body:'Saved body',secondary_body:'저장한 본문'},{role:'key_insight',title:'Another line',body:'Another body'},{role:'editorial_closing',title:'Closing',body:'Closing body'},{role:'brand_outro',title:'Roundy',body:'Brand'}]};
 await act(async()=>{timer?.();await tick();});
 const body=field(locale==='ko'?'본문':'Body','textarea');await act(async()=>body.props.onChange({target:{value:'Edited body'}}));
 await click(locale==='ko'?'새 버전으로 저장':'Save a new version');assert.equal(posts.at(-1).body.caption,'Saved nonempty caption');assert.equal(posts.at(-1).body.state_version,6);n++;
 assert.equal(posts.some(p=>p.route.endsWith('/approve')),false);n++;
 // Caption-only edits are saved without a fake slide edit, in both languages.
 current.draft.content_document={caption_ko:'이전 국문 문장.\\n새로운 생각.',caption_en:'An older English line.\\nOne more thought.'};
 await act(async()=>{timer?.();await tick();});
 const captionKoField=field(locale==='ko'?'한국어 캡션':'Korean caption','textarea');
 await act(async()=>captionKoField.props.onChange({target:{value:'바뀐 한국어 훅.\\n다음 대화에서 시도해 볼 말.'}}));
 await click(locale==='ko'?'수정 완료 및 저장':'Finish editing & save');
 assert.equal(posts.at(-1).body.edits.length,0);
 assert.equal(posts.at(-1).body.caption_ko,'바뀐 한국어 훅.\\n다음 대화에서 시도해 볼 말.');
 assert.equal(posts.at(-1).body.caption_en,undefined);n++;
 await act(async()=>view.unmount());
}
console.log('PASS '+n+' Korean/English content-library interaction checks: stable create key across reload, canonical state, asynchronously arriving copy, immutable edits and no implicit publication. Mock HTTP only.');
