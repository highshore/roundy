/**
 * Context-aware licensed photo discovery. Matching search metadata is NOT
 * proof a photo depicts a named event. Explicit human approval is still required.
 */
type Row=Record<string,any>;
type Cue={id:string;re:RegExp;query:string;reuse:RegExp;strong:boolean};
const CUES:readonly Cue[]=[
 {id:'night',re:/(?:밤|야간|야경|달빛|빛조각|빛축제|조명|밤산책|night|after.dark|illuminat|light festival|lantern)/i,query:'night illuminated light installation',reuse:/night|evening|after.dark|illuminat|lantern|light installation/i,strong:true},
 {id:'exhibition',re:/(?:전시|도슨트|갤러리|미술관|작품|설치미술|exhibit|gallery|art installation|museum)/i,query:'art exhibition installation',reuse:/exhibit|art installation|gallery|museum|art exhibition/i,strong:true},
 {id:'riverside',re:/(?:당현천|청계천|한강|물길|수변|하천|강변|천변|riverside|river|stream|waterfront)/i,query:'riverside stream walk',reuse:/riverside|river|stream|waterfront|han river/i,strong:false},
 {id:'autumn',re:/(?:가을|단풍|autumn|foliage|fall leaves)/i,query:'autumn foliage',reuse:/autumn|fall foliage|fall leaves/i,strong:true},
 {id:'spring',re:/(?:벚꽃|봄꽃|봄날|cherry blossom|spring flowers)/i,query:'spring cherry blossoms',reuse:/spring|cherry blossom/i,strong:true},
 {id:'cafe',re:/(?:카페|커피|cafe|coffee)/i,query:'cafe conversation',reuse:/cafe|coffee/i,strong:false},
 {id:'market',re:/(?:시장|마켓|팝업|market|popup shop)/i,query:'street market',reuse:/market|popup|pop.up/i,strong:false},
 {id:'park',re:/(?:공원|산책로|걷기|잔디|park|garden)/i,query:'city park walking',reuse:/park|garden|walking/i,strong:false}
];
const clean=(value:unknown)=>typeof value==='string'?value.trim():'';
function sceneText(draft:Row,slot:number){
 const doc=draft.content_document||{};
 const slides=Array.isArray(draft.carousel_slides)&&draft.carousel_slides.length
  ?draft.carousel_slides:Array.isArray(doc.slides)?doc.slides:[];
 const cover=slides[0]||{},slide=slides[slot]||{},trend=doc.trend||{},seoul=doc.seoul||{};
 return [cover.title,cover.body,slide.title,slide.body,slide.highlight,
  trend.display_name,trend.summary,seoul.theme].map(clean).filter(Boolean).join(' ');
}
export function photoSceneIntent(draft:Row,slot:number){
 const text=sceneText(draft,slot),cues=CUES.filter(cue=>cue.re.test(text)).slice(0,3);
 const query=['Seoul South Korea',...cues.map(cue=>cue.query),'authentic editorial photo'].join(' ').slice(0,100);
 return {query,scene_ids:cues.map(cue=>cue.id),strict_ids:cues.filter(cue=>cue.strong).map(cue=>cue.id)};
}
export function approvedPhotoFitsScene(draft:Row,slot:number,asset:Row):boolean{
 const topic=draft.draft_kind==='growth_carousel'
  ?String(draft.growth_topic_type||''):String(draft.content_mode||'');
 if(!['seoul_trend','seoul_dating'].includes(topic))return true;
 const intent=photoSceneIntent(draft,slot);
 // A broadly tagged approved city photo is not enough to match an outing.
 if(!intent.scene_ids.length)return false;
 const recorded=clean(asset.search_query);
 if(!recorded)return false;
 const required=intent.strict_ids.length?intent.strict_ids:intent.scene_ids.slice(0,1);
 return required.every(id=>Boolean(CUES.find(cue=>cue.id===id)?.reuse.test(recorded)));
}
