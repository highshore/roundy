import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const jsx=(type,props)=>({type,props:props||{}});
let requests=0;
const cache={};
function load(file){
 if(cache[file])return cache[file];
 const context={exports:{},console,Date,window:{confirm:()=>true},fetch:()=>{requests++;throw Error('Unexpected request');},require:name=>{
  if(name.endsWith('.css'))return {};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(name==='react')return {useState:value=>[typeof value==='function'?value():value,()=>{}],useEffect:()=>{},useRef:value=>({current:value})};
  if(name==='lucide-react')return Object.fromEntries(['Check','PenLine','RefreshCw','Image','AlertTriangle'].map(icon=>[icon,icon]));
  if(name==='@/lib/locale')return {tr:(locale,en,ko)=>locale==='ko'?ko:en};
  if(name.startsWith('@/lib/'))return load('src/lib/'+name.slice(6)+'.ts');
  if(name.startsWith('./'))return load('src/lib/'+name.slice(2)+'.ts');
  return require(name);
 }};
 const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});
 assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file+' syntax');
 vm.runInNewContext(compiled.outputText,context,{filename:file});return cache[file]=context.exports;
}
function nodes(tree,ancestors=[]){
 if(tree==null||typeof tree==='boolean')return [];
 if(Array.isArray(tree))return tree.flatMap(child=>nodes(child,ancestors));
 if(typeof tree!=='object')return [];
 return [{node:tree,ancestors},...nodes(tree.props?.children,[...ancestors,tree])];
}
function label(tree){if(tree==null||typeof tree==='boolean')return '';if(Array.isArray(tree))return tree.map(label).join('');if(typeof tree!=='object')return String(tree);return label(tree.props?.children);}
const {AdminMarketingEditorialStudio}=load('src/components/admin-marketing-editorial-studio.tsx');
const {MarketingWorkflowSteps}=load('src/components/marketing-workflow-nav.tsx');
const draft={id:'draft',revision:2,status:'needs_approval',content_language:'ko',caption:'Original caption',images:Array.from({length:4},(_,i)=>'https://example.invalid/'+i+'.jpg'),carousel_slides:Array.from({length:4},(_,i)=>({title:'Title '+i,body:'Original body '+i})),content_document:{design_preset:'roundy_magazine_editorial_v2',brand_outro_version:1,thumbnail_candidates:['A','B'],editorial_engagement_policy:{},editorial_storyboard_review:{reserved_count:3,suggested_count:3,issues:['Review note']}},quality_report:{status:'passed'}};
const props={draft,locale:'ko',disabled:false,onUpdated:()=>{},onRequestAiEdit:()=>{},onRequestPhotoEdit:()=>{},onRerenderCover:()=>{}};
let count=0;const check=(name,fn)=>{fn();count++;};
for(const locale of ['ko','en']){
 const tree=AdminMarketingEditorialStudio({...props,locale}),all=nodes(tree);
 check(locale+' preview before diagnostics',()=>assert.ok(all.findIndex(x=>x.node.props['data-editorial-preview'])<all.findIndex(x=>x.node.props['data-editorial-diagnostics'])));
 check(locale+' optional feedback collapsed',()=>assert.equal(all.find(x=>String(x.node.props.className).includes('roundy-editorial-feedback'))?.node.props.open,false));
 check(locale+' alternate titles support two options',()=>assert.equal(all.filter(x=>String(x.node.props.className||'').split(' ').includes('roundy-editorial-headline')).length,2));
 check(locale+' exactly one card visible',()=>assert.equal(all.filter(x=>x.node.type==='article'&&!x.node.props.hidden).length,1));
 check(locale+' brand card has no redundant actions',()=>{const brand=all.filter(x=>x.node.type==='article').at(-1).node;assert.equal(nodes(brand).filter(x=>x.node.type==='button').length,0);});
}
check('duplicate cover choices show an actionable editor, not selection of identical titles',()=>{
 const repeated={...draft,content_document:{...draft.content_document,
  thumbnail_candidates:Array(5).fill('같은 표지 제목이 반복됩니다')}};
 const tree=AdminMarketingEditorialStudio({...props,draft:repeated}),all=nodes(tree);
 assert.equal(all.find(x=>x.node.props['data-testid']==='headline-choice-panel')?.node.props.open,true);
 assert.ok(all.some(x=>String(x.node.props.className||'').includes('roundy-editorial-headline-warning')));
 assert.ok(all.some(x=>x.node.props['data-testid']==='headline-edit-tools'));
 const editor=all.find(x=>x.node.type==='button'&&label(x.node)==='표지 제목 후보 전체 수정');
 assert.ok(editor);assert.equal(editor.node.props.disabled,false);
 assert.ok(all.filter(x=>String(x.node.props.className||'').includes('roundy-editorial-headline')).some(x=>
  x.node.props.className==='roundy-editorial-headline'&&nodes(x.node).some(b=>b.node.type==='button'&&b.node.props.disabled)));
});
check('render blocker visible without title candidates',()=>{
 const tree=AdminMarketingEditorialStudio({...props,draft:{...draft,content_document:{...draft.content_document,thumbnail_candidates:[],thumbnail_render_pending:true}}});
 const action=nodes(tree).find(x=>x.node.props.id==='roundy-editorial-render-action');
 assert.ok(action);assert.equal(action.ancestors.some(x=>x.type==='details'),false);
 assert.ok(nodes(tree).some(x=>x.node.props.className==='roundy-editorial-stale-label'));
});
check('render action only invokes existing callback on click',()=>{
 let renders=0;const tree=AdminMarketingEditorialStudio({...props,onRerenderCover:()=>renders++,draft:{...draft,content_document:{...draft.content_document,thumbnail_render_pending:true}}});
 assert.equal(renders,0);const action=nodes(tree).find(x=>x.node.props.id==='roundy-editorial-render-action').node;
 nodes(action).find(x=>x.node.type==='button').node.props.onClick();assert.equal(renders,1);
});
check('editorial remediation remains open',()=>{const tree=AdminMarketingEditorialStudio({...props,draft:{...draft,content_document:{...draft.content_document,editorial_review_required:true}}});assert.equal(nodes(tree).find(x=>String(x.node.props.className).includes('roundy-editorial-feedback')).node.props.open,true);});
check('source review cannot be accepted from UI',()=>{const tree=AdminMarketingEditorialStudio({...props,draft:{...draft,content_document:{...draft.content_document,source_review_required:true}}});const action=nodes(tree).find(x=>x.node.type==='button'&&label(x.node)==='원고만 확인 완료');assert.equal(action.node.props.disabled,true);});
check('busy rerender disabled',()=>{const tree=AdminMarketingEditorialStudio({...props,disabled:true,draft:{...draft,content_document:{...draft.content_document,thumbnail_render_pending:true}}});const action=nodes(tree).find(x=>x.node.props.id==='roundy-editorial-render-action').node;assert.equal(nodes(action).find(x=>x.node.type==='button').node.props.disabled,true);});
for(const status of ['published','scheduled','running','uncertain'])check(status+' has no misleading next button',()=>assert.equal(nodes(MarketingWorkflowSteps({draft:{...draft,status},locale:'ko'})).filter(x=>x.node.type==='button').length,0));
check('ready has three visual steps',()=>assert.equal(nodes(MarketingWorkflowSteps({draft,locale:'ko'})).filter(x=>x.node.type==='li').length,3));
check('rendering component never calls an API',()=>assert.equal(requests,0));
check('draft data not mutated',()=>{const before=JSON.stringify(draft);AdminMarketingEditorialStudio(props);assert.equal(JSON.stringify(draft),before);});
check('CSS preserves image contain and hidden cards',()=>{const css=fs.readFileSync('src/components/admin-marketing-editorial-studio.css','utf8');assert.match(css,/object-fit:contain/);assert.match(css,/\.roundy-editorial-card\[hidden\]\{display:none\}/);assert.match(css,/@media\(max-width:465px\)/);});
console.log(`PASS ${count} KO/EN component-tree assertions. Mocked React rendering only; no browser E2E or publishing test.`);
