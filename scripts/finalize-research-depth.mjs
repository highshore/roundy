import fs from 'node:fs';
function patch(path,replacements){
 let s=fs.readFileSync(path,'utf8');
 for(const [from,to] of replacements){
  if(!s.includes(from)) throw new Error(path+' missing expected text: '+from);
  s=s.replace(from,to);
 }
 fs.writeFileSync(path,s);
}
patch('src/components/admin-marketing.tsx',[
 ["basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)?'$0.07':'$0.02'","basis==='growth_carousel'&&['book_insight','trend_research','dating_myth'].includes(topic)?'$0.05':'$0.02'"],
 ["job.operation==='research'?0.07:0.02","job.operation==='research'?0.05:0.02"],
 ["up to three targeted searches and one writing request","up to two targeted searches and one writing request"],
 ["최대 3회와 문구 작성 1회","최대 2회와 문구 작성 1회"]
]);
patch('scripts/test-marketing-generation.mjs',[
 ["p.p_operation==='research'?.07:.02","p.p_operation==='research'?.05:.02"],
 ["h.requests[0].body.max_tool_calls,3","h.requests[0].body.max_tool_calls,2"]
]);
patch('docs/marketing-editorial-quality.md',[
 ["up to three targeted web-search tool calls","up to two targeted web-search tool calls"],
 ["research (up to three targeted searches + one writing call) $0.07","research (up to two targeted searches + one writing call) $0.05"]
]);
console.log('aligned research-depth labels/tests/docs');