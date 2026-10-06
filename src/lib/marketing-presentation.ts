// Pure presentation contracts: no network, paid model calls, or destructive text truncation.
export type PresentationRow = Record<string, any>;
export const EDITORIAL_PRESET = 'roundy_compact_editorial_v1';
export const ROUNDY_IDENTITY = {
  accent: '#ff6666', ink: '#20211f', paper: '#fffefa', muted: '#6b6f65',
  instagram: '@roundy.meet', website: 'roundy.team',
  ko: '서울에서 만나는 로테이션 소개팅', en: 'Rotation Dating in Seoul',
} as const;
export const MAX_MARKETING_CTA_LENGTH=70;
export const generatedCta=(language:string)=>language==='en'?'Explore Roundy':'Roundy 둘러보기';
export function captionCtaIssues(caption:unknown,cta:unknown):string[]{
 const a=typeof caption==='string'?caption.trim():'',b=typeof cta==='string'?cta.trim():'';const issues:string[]=[];
 if(!a)issues.push('캡션이 비어 있습니다.');else if(a.length>2000)issues.push('캡션이 '+a.length+'자로 2,000자 제한을 초과했습니다.');
 if(!b)issues.push('CTA 안내 문구가 비어 있습니다.');else if(b.length>MAX_MARKETING_CTA_LENGTH)issues.push('CTA 안내 문구가 '+b.length+'자로 '+MAX_MARKETING_CTA_LENGTH+'자 제한을 초과했습니다.');
 return issues;
}
const clean = (v: unknown) => typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim() : '';
const CAPTION_ACTION_TYPES=new Set(['mbti','dating_archetype','mini_quiz']);
export function captionAction(postType:string,language:string){
  const ko=language!=='en';
  if(postType==='live_event')return ko?'프로필 링크에서 참가 신청 ↓':'Book through the link in bio ↓';
  if(postType==='prelaunch')return ko?'오픈 소식은 프로필에서 확인하세요.':'Follow the profile for launch updates.';
  if(CAPTION_ACTION_TYPES.has(postType))return ko?'여러분은 어떤 쪽인가요? 댓글로 알려주세요.':'Which one are you? Tell us in the comments.';
  if(postType==='meme_remix')return ko?'떠오르는 친구에게 보내주세요.':'Send this to the friend who came to mind.';
  if(postType==='conversation_prompt')return ko?'저장해두고 다음 대화에서 써보세요.':'Save this for your next conversation.';
  if(postType==='seoul_dating')return ko?'저장해두고 다음 약속 잡을 때 확인하세요.':'Save this for the next time you make plans.';
  if(postType==='seoul_trend')return ko?'저장해두고 이번 주 데이트 아이디어로 써보세요.':'Save this for a date idea this week.';
  return ko?'저장해두고 천천히 다시 읽어보세요.':'Save this and come back to it later.';
}
export function captionCoreIssues(value:unknown,language:string):string[]{
  const text=clean(value),issues:string[]=[];if(!text)return ['캡션 본문이 비어 있습니다.'];
  const parts=text.split(/\n\s*\n|\n+/).map(x=>x.trim()).filter(Boolean),first=parts[0]||'';
  if(parts.length<2||parts.length>4)issues.push('캡션 본문은 훅을 포함해 2~4개의 짧은 문단으로 작성하세요.');
  if(language==='en'){if(first.split(/\s+/).filter(Boolean).length>12)issues.push('영문 캡션 첫 문장은 12단어 이하의 짧은 훅이어야 합니다.');}
  else if(first.length>30)issues.push('국문 캡션 첫 문장은 30자 이하의 짧은 훅이어야 합니다.');
  const emojiCount=(text.match(/\p{Extended_Pictographic}/gu)||[]).length;if(emojiCount>2)issues.push('캡션 이모지는 최대 2개까지만 사용하세요.');
  if(/https?:\/\/|www\.|roundy\.team|@roundy|#[\p{L}\p{N}_]+/iu.test(text))issues.push('캡션 본문에는 URL, 계정명, 해시태그를 넣지 마세요. 서버가 마지막에 자동으로 추가합니다.');
  if(/저장(?:해|하고|하세요|해두)|공유(?:해|하세요)|댓글(?:로|에)|팔로우|참가\s*신청|프로필\s*링크|링크에서\s*신청|라운디\s*둘러보기|save\s+(?:this|it)|share\s+(?:this|it)|tell\s+us\s+in\s+the\s+comments|comment\s+below|follow\s+(?:@?roundy|the\s+profile)|book\s+(?:now|through)|sign\s*up|link\s+in\s+bio|visit\s+roundy/i.test(text))issues.push('캡션 본문에는 CTA를 직접 넣지 마세요. 콘텐츠 유형에 맞는 CTA를 서버가 하나만 자동으로 추가합니다.');
  return [...new Set(issues)];
}

const CAPTION_CORE_CTA_LINE=/저장(?:해|하고|하세요|해두)|공유(?:해|하세요)|댓글(?:로|에)|팔로우|참가\s*신청|프로필\s*링크|링크에서\s*신청|라운디\s*둘러보기|save\s+(?:this|it)|share\s+(?:this|it)|tell\s+us\s+in\s+the\s+comments|comment\s+below|follow\s+(?:@?roundy|the\s+profile)|book\s+(?:now|through)|sign\s+up|link\s+in\s+bio|visit\s+roundy/i;
export function normalizeCaptionCore(value:unknown,language:string):string{
  let text=clean(value)
    .replace(/https?:\/\/\S+|www\.\S+/gi,'')
    .replace(/@roundy(?:\.meet)?/gi,'')
    .replace(/roundy\.team/gi,'')
    .replace(/#[\p{L}\p{N}_]+/gu,'')
    .replace(/[ \t]+\n/g,'\n')
    .trim();
  let emojiSeen=0;
  text=text.replace(/\p{Extended_Pictographic}/gu,m=>(++emojiSeen<=2?m:''));
  let parts=text.split(/\n\s*\n|\n+/).map(x=>x.trim()).filter(Boolean).filter(p=>!CAPTION_CORE_CTA_LINE.test(p));
  if(!parts.length)return '';
  const first=parts[0];
  if(language==='en'){
    const words=first.split(/\s+/).filter(Boolean);
    if(words.length>12){parts=[words.slice(0,12).join(' '),words.slice(12).join(' '),...parts.slice(1)];}
  }else if(first.length>30){
    let cut=first.lastIndexOf(' ',30);if(cut<10)cut=30;
    parts=[first.slice(0,cut).trim(),first.slice(cut).trim(),...parts.slice(1)].filter(Boolean);
  }
  if(parts.length>4)parts=[parts[0],parts[1],parts[2],parts.slice(3).join(' ')].filter(Boolean);
  return parts.join('\n');
}

export function isCompactDocument(v: PresentationRow) { return v?.design_preset === EDITORIAL_PRESET; }
export function hasObsoletePositioning(text: string) {
  return /english[\s\u2010-\u2015-]*only|영어\s*(?:온리|전용|로만|만\s*(?:사용|진행))|영어로\s*진행되는\s*1\s*:\s*1|1\s*:\s*1\s*밍글|1\s*:\s*1\s*mingle/i.test(text);
}

// Extend the existing research/role schema rather than replacing its provenance fields.
export function compactContentSchema(schema: PresentationRow, language: string) {
  const text = (maxLength: number) => ({type:'string', maxLength});
  const ko = language !== 'en';
  return {
    ...schema,
    properties: {
      ...schema.properties,
      design_preset: {type:'string', enum:[EDITORIAL_PRESET]},
      caption:text(ko?400:520),
      cta:{type:'string',enum:[generatedCta(language)],minLength:1,maxLength:MAX_MARKETING_CTA_LENGTH},
      caption_ko: text(400), caption_en: text(520), tagline: text(64),
      hashtags: {type:'array', maxItems:8, items:text(40)},
      slides: {...schema.properties.slides, items: {
        ...schema.properties.slides.items,
        properties: {...schema.properties.slides.items.properties,
          title:text(ko ? 34 : 64), body:text(ko ? 120 : 170),
          secondary_body:text(ko ? 130 : 100), highlight:text(ko ? 34 : 76),
          eyebrow:text(24),
        },
        required:[...schema.properties.slides.items.required, 'secondary_body'],
      }},
    },
    required:[...schema.required, 'design_preset', 'caption_ko', 'caption_en', 'tagline', 'hashtags'],
  };
}
export function compactWritingInstructions(language: string) {
  return [
    'APPROVED VISUAL PRESET: '+EDITORIAL_PRESET+'. Bold Gothic/sans-serif type, coral #ff6666, a photo-led hook, uncluttered content, and a fixed Roundy introduction outro. No sidebar, UI screenshot, fake logo, or decorative chart.',
    'Roundy is a Seoul-based Rotation Dating service for Korean and international adults. Korean-Korean meetings are also part of the service. In Korean, always call the format 로테이션 소개팅. In English, call it Rotation Dating. Never label the service 1:1 Mingle. Do not describe the whole service as English-only or as a language class/exchange. Do not invent a particular event language.',
    'Write compact, complete sentences on the FIRST writing call. There is no automatic paid compression/rewrite call. Do not fill the available maximum length. One card = one useful point, one short example, and at most one takeaway.',
    'COVER: aim for a short headline (Korean 8-22 characters / English 3-9 words), plus ONE short subtitle that can fit on a single line. Aim for 2-3 striking title lines. No hashtags or source bibliography in the title. Put nuance in the caption rather than repeating the hook.',
    'CONTENT: aim for Korean body 40-90 characters and English body 8-20 words, no more than two short paragraphs. highlight is optional: use one concrete takeaway, or an empty string; never repeat the body verbatim. No generic headings such as 핵심 정리 or 알아보기.',
    language==='en'
      ? 'title/body/highlight/options are English. secondary_body is a short, faithful Korean rendering of the same idea for storage and caption parity only; it is NOT visible on the image. The Korean and English must preserve the same uncertainty and limitations.'
      : 'title/body/highlight/options are Korean. secondary_body is a short, faithful English rendering of the same idea for storage and caption parity only; it is NOT visible on the image. Only original book titles/authors may remain English when editorially necessary. Use Korean conversation examples for Korean content, not mandatory English lessons.',
    'caption_ko and caption_en are equivalent, concise Instagram caption CORES, not card-by-card summaries. Use 2-4 short paragraphs: first a hook (Korean <=30 characters / English <=12 words), then 1-3 compact context paragraphs. Do not copy a slide title/body verbatim. Do NOT include CTA language, Roundy handles, URLs, hashtags, source labels or a brand footer in these fields; the server appends exactly one content-type CTA and the fixed @roundy.meet | roundy.team footer after validation. Use at most two informative emoji, preferably none. caption is the primary-language caption for compatibility. tagline is metadata only and is not printed in the final caption. Suggest relevant hashtags only; do not invent popularity, rankings or search volumes.',
    'Source IDs must stay linked to each sourced idea. Bibliographic facts, limitations and uncertainty must survive compression. Sources will be printed as small footnotes and full links in the caption by the server. Never fabricate a citation or copy a test/example book.',
    'Top-level cta is ONLY the exact short action label '+JSON.stringify(generatedCta(language))+'. It is NOT a paragraph, caption or URL field. The server renders contact details separately.',
    'The final CTA uses server-owned Roundy introduction copy and prints BOTH @roundy.meet and roundy.team. Do not repeat the same brand paragraph on the earlier cards.',
  ].join('\n');
}
export function normalizeCompactDocument(raw: PresentationRow, language: string) {
  if (!isCompactDocument(raw)) return raw; // Legacy snapshots remain readable, not silently rewritten.
  const ko = language !== 'en';
  const caption_ko = normalizeCaptionCore(raw.caption_ko,'ko'), caption_en = normalizeCaptionCore(raw.caption_en,'en');
  const inputSlides = Array.isArray(raw.slides) ? raw.slides : [];
  const slides = inputSlides.map((s: PresentationRow, index: number) => {
    const main = clean(s.body), secondary = clean(s.secondary_body), final=index===inputSlides.length-1;
    if (s.role !== 'cta' && !final) return {...s, title:clean(s.title), body:main, secondary_body:secondary, highlight:clean(s.highlight), body_ko:ko?main:secondary, body_en:ko?secondary:main};
    const bodyKo='한 사람씩 만나고, 대화해보세요.', bodyEn='Meet face to face, one conversation at a time.';
    return {...s, role:'cta', title:ko?ROUNDY_IDENTITY.ko:ROUNDY_IDENTITY.en,
      body:ko?bodyKo:bodyEn, secondary_body:ko?bodyEn:bodyKo, body_ko:bodyKo, body_en:bodyEn,
      highlight:'', options:[], source_ids:[],
      instagram:ROUNDY_IDENTITY.instagram, website:ROUNDY_IDENTITY.website};
  });
  return {...raw, cta:generatedCta(language), caption_ko, caption_en, caption:ko?caption_ko:caption_en, slides,
    tagline:clean(raw.tagline), hashtags:curateHashtags(raw.post_type, raw.hashtags, raw),
    hashtag_selection:{basis:'topic_relevance_catalog',search_volume_verified:false},
    content_language:ko?'ko':'en'};
}
const TOPIC_TAGS: Record<string, string[]> = {
  prelaunch:['로테이션소개팅','소개팅','서울데이트','SeoulDating','첫만남'],
  live_event:['로테이션소개팅','소개팅','서울데이트','SeoulEvents','첫만남'],
  book_insight:['독서','책추천','대화법','북스타그램','Bookstagram'],
  trend_research:['심리학','인간관계','대화법','소통','Psychology'],
  dating_myth:['연애','인간관계','소개팅','연애심리','Relationships'],
  conversation_prompt:['대화법','소개팅팁','첫만남','소통','Conversation'],
  mbti:['MBTI','대화법','인간관계','첫만남','소통'],
  dating_archetype:['인간관계','대화법','연애','소통','Relationships'],
  meme_remix:['공감','소개팅','첫만남','연애','Dating'],
  seoul_dating:['서울데이트','서울모임','첫만남','SeoulLife','SeoulDating'],
  seoul_trend:['서울데이트','서울핫플','서울생활','SeoulLife','SeoulDating'],
  mini_quiz:['심리테스트','대화법','인간관계','첫만남','소통'],
};
export function curateHashtags(type: string, suggestions: unknown, _document?: PresentationRow): string[] {
  const catalog=TOPIC_TAGS[type]||TOPIC_TAGS.conversation_prompt;
  const normalize=(v: unknown)=>clean(v).replace(/^#+/,'').normalize('NFKC');
  const allowed=new Map(catalog.map(t=>[t.toLowerCase(),t]));
  const selected=Array.isArray(suggestions)?suggestions.map(normalize).filter(t=>/^[\p{L}\p{N}_]+$/u.test(t)&&allowed.has(t.toLowerCase())).map(t=>allowed.get(t.toLowerCase())!):[];
  return [...new Set(['라운디',...selected,...catalog])].slice(0,5).map(t=>'#'+t);
}
export function compactQualityIssues(c: PresentationRow, language: string): string[] {
  if (!isCompactDocument(c)) return [];
  const issues: string[]=[];
  if (!/[가-힣]/.test(clean(c.caption_ko)) || !/[A-Za-z]/.test(clean(c.caption_en))) issues.push('국문 캡션과 영어 캡션이 모두 필요합니다.');
  if (clean(c.caption_ko).length>400 || clean(c.caption_en).length>520) issues.push('한영 캡션을 더 짧게 작성해야 합니다.');
  for(const issue of captionCoreIssues(c.caption_ko,'ko'))issues.push(issue);
  for(const issue of captionCoreIssues(c.caption_en,'en'))issues.push(issue);
  if(!['prelaunch','live_event'].includes(String(c.post_type))&&/roundy|라운디|@roundy/i.test(clean(c.caption_ko)+' '+clean(c.caption_en)))issues.push('에디토리얼 캡션 본문에서는 브랜드 홍보를 반복하지 마세요. 서버 푸터가 Roundy를 연결합니다.');
  for(const s of c.slides||[]) {
    if (!clean(s.secondary_body)) issues.push('카드의 짧은 번역 문장이 없습니다.');
    const ko=language==='en'?clean(s.secondary_body):clean(s.body),en=language==='en'?clean(s.body):clean(s.secondary_body);
    if (ko.length>120 || en.length>170 || clean(s.highlight).length>(language==='en'?76:34)) issues.push('카드 문구를 더 간결하게 작성해야 합니다.');
    if (s.role!=='book'&&clean(s.title).length>(language==='en'?64:34)) issues.push('카드 제목이 너무 깁니다.');
    if (!/[가-힣]/.test(ko) || !/[A-Za-z]/.test(en)) issues.push('카드의 한국어와 영어 문장을 확인하세요.');
    if (ko.split(/\n\s*\n/).length>2 || en.split(/\n\s*\n/).length>2) issues.push('한 카드에는 짧은 문단 두 개까지만 사용하세요.');
  }
  if (hasObsoletePositioning(JSON.stringify(c))) issues.push('현재 브랜드 소개와 맞지 않는 English-only 문구가 있습니다.');
  return [...new Set(issues)];
}
export function buildBilingualCaption(c: PresentationRow, sources: PresentationRow[], disclaimerKo='', disclaimerEn='') {
  const bibliography=sources.map((s, i)=>'['+(i+1)+'] '+clean(s.title)+'\n'+clean(s.url)).join('\n');
  const ko=[clean(c.caption_ko),disclaimerKo,captionAction(String(c.post_type),'ko')].filter(Boolean).join('\n\n');
  const en=[clean(c.caption_en),disclaimerEn,captionAction(String(c.post_type),'en')].filter(Boolean).join('\n\n');
  return [
    ko,
    en,
    bibliography?'출처 / Sources\n'+bibliography:'',
    [ROUNDY_IDENTITY.instagram+' | '+ROUNDY_IDENTITY.website, curateHashtags(c.post_type,c.hashtags,c).join(' ')].filter(Boolean).join('\n'),
  ].filter(Boolean).join('\n\n');
}
export function bilingualCaptionIssues(caption: string) {
  const issues: string[]=[];
  if(caption.length>2000)issues.push('출처를 포함한 캡션이 2,000자를 넘습니다.');
  if(hasObsoletePositioning(caption))issues.push('캡션에서 English-only 포지셔닝을 삭제하세요.');
  if(!/[가-힣]/.test(caption)||!/[A-Za-z]/.test(caption))issues.push('국문 본문과 영어 본문이 모두 필요합니다.');
  if(!caption.includes(ROUNDY_IDENTITY.instagram)||!caption.includes(ROUNDY_IDENTITY.website))issues.push('캡션에 Roundy 공식 계정과 웹사이트가 필요합니다.');
  return issues;
}
