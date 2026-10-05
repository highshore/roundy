// Pure presentation contracts: no network, paid model calls, or destructive text truncation.
export type PresentationRow = Record<string, any>;
export const EDITORIAL_PRESET = 'roundy_compact_editorial_v1';
export const ROUNDY_IDENTITY = {
  accent: '#ff6666', ink: '#20211f', paper: '#fffefa', muted: '#6b6f65',
  instagram: '@roundy.meet', website: 'roundy.team',
  ko: '서울에서 만나는 1:1 밍글', en: 'Meet one person at a time in Seoul',
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
export function isCompactDocument(v: PresentationRow) { return v?.design_preset === EDITORIAL_PRESET; }
export function hasObsoletePositioning(text: string) {
  return /english[\s\u2010-\u2015-]*only|영어\s*(?:온리|전용|로만|만\s*(?:사용|진행))|영어로\s*진행되는\s*1\s*:\s*1/i.test(text);
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
    'Roundy is a Seoul-based 1:1 mingle service for Korean and international adults. Korean-Korean meetings are also part of the service. Do not describe the whole service as English-only or as a language class/exchange. Do not invent a particular event language.',
    'Write compact, complete sentences on the FIRST writing call. There is no automatic paid compression/rewrite call. Do not fill the available maximum length. One card = one useful point, one short example, and at most one takeaway.',
    'COVER: aim for a short headline (Korean 8-22 characters / English 3-9 words), plus one short subtitle. Aim for 2-3 striking title lines. No hashtags or source bibliography in the title. Put nuance in the caption rather than repeating the hook.',
    'CONTENT: aim for Korean body 40-90 characters and English body 8-20 words, no more than two short paragraphs. highlight is optional: use one concrete takeaway, or an empty string; never repeat the body verbatim. No generic headings such as 핵심 정리 or 알아보기.',
    language==='en'
      ? 'title/body/highlight are English. secondary_body is a short, faithful Korean rendering of the same idea. The Korean and English must preserve the same uncertainty and limitations.'
      : 'title/body/highlight are Korean. secondary_body is a short, faithful English rendering of the same idea. Only original book titles/authors may remain English on the book card. Use Korean conversation examples for Korean content, not mandatory English lessons.',
    'caption_ko and caption_en are equivalent, concise post captions without source URLs, hashtag lists or section labels. caption is the primary-language caption for compatibility. tagline is one short topic-specific closing line. Suggest relevant hashtags only; do not invent popularity, rankings or search volumes.',
    'Source IDs must stay linked to each sourced idea. Bibliographic facts, limitations and uncertainty must survive compression. Sources will be printed as small footnotes and full links in the caption by the server. Never fabricate a citation or copy a test/example book.',
    'Top-level cta is ONLY the exact short action label '+JSON.stringify(generatedCta(language))+'. It is NOT a paragraph, caption or URL field. The server renders contact details separately.',
    'The final CTA uses server-owned Roundy introduction copy and prints BOTH @roundy.meet and roundy.team. Do not repeat the same brand paragraph on the earlier cards.',
  ].join('\n');
}
export function normalizeCompactDocument(raw: PresentationRow, language: string) {
  if (!isCompactDocument(raw)) return raw; // Legacy snapshots remain readable, not silently rewritten.
  const ko = language !== 'en';
  const caption_ko = clean(raw.caption_ko), caption_en = clean(raw.caption_en);
  const inputSlides = Array.isArray(raw.slides) ? raw.slides : [];
  const slides = inputSlides.map((s: PresentationRow, index: number) => {
    const main = clean(s.body), secondary = clean(s.secondary_body), final=index===inputSlides.length-1;
    if (s.role !== 'cta' && !final) return {...s, title:clean(s.title), body:main, secondary_body:secondary, highlight:clean(s.highlight), body_ko:ko?main:secondary, body_en:ko?secondary:main};
    const bodyKo='한 사람씩 만나고, 대화해보세요.', bodyEn='Meet face to face, one conversation at a time.';
    return {...s, role:'cta', title:ko?ROUNDY_IDENTITY.ko:ROUNDY_IDENTITY.en,
      body:ko?bodyKo:bodyEn, secondary_body:ko?bodyEn:bodyKo, body_ko:bodyKo, body_en:bodyEn,
      highlight:'', options:[], source_ids:[],
      instagram:ROUNDY_IDENTITY.instagram, website:ROUNDY_IDENTITY.website};
  }) : [];
  return {...raw, cta:generatedCta(language), caption_ko, caption_en, caption:ko?caption_ko:caption_en, slides,
    tagline:clean(raw.tagline), hashtags:curateHashtags(raw.post_type, raw.hashtags, raw),
    hashtag_selection:{basis:'topic_relevance_catalog',search_volume_verified:false},
    content_language:ko?'ko':'en'};
}
const TOPIC_TAGS: Record<string, string[]> = {
  prelaunch:['소개팅','서울데이트','서울모임','SeoulDating','첫만남'],
  live_event:['소개팅','서울모임','서울데이트','SeoulEvents','첫만남'],
  book_insight:['독서','책추천','대화법','북스타그램','Bookstagram'],
  trend_research:['심리학','인간관계','대화법','소통','Psychology'],
  dating_myth:['연애','인간관계','소개팅','연애심리','Relationships'],
  conversation_prompt:['대화법','소개팅팁','첫만남','소통','Conversation'],
  mbti:['MBTI','대화법','인간관계','첫만남','소통'],
  dating_archetype:['인간관계','대화법','연애','소통','Relationships'],
  meme_remix:['공감','소개팅','첫만남','연애','Dating'],
  seoul_dating:['서울데이트','서울모임','첫만남','SeoulLife','SeoulDating'],
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
  return [
    clean(c.caption_ko)+(disclaimerKo?'\n'+disclaimerKo:''),
    clean(c.caption_en)+(disclaimerEn?'\n'+disclaimerEn:''),
    '출처 / Sources\n'+(bibliography||'Roundy 자체 작성 / Original editorial, not a research citation'),
    [clean(c.tagline), ROUNDY_IDENTITY.instagram+' | '+ROUNDY_IDENTITY.website, curateHashtags(c.post_type,c.hashtags,c).join(' ')].filter(Boolean).join('\n'),
  ].join('\n\n');
}
export function bilingualCaptionIssues(caption: string) {
  const issues: string[]=[];
  if(caption.length>2000)issues.push('출처를 포함한 캡션이 2,000자를 넘습니다.');
  if(hasObsoletePositioning(caption))issues.push('캡션에서 English-only 포지셔닝을 삭제하세요.');
  if(!/[가-힣]/.test(caption)||!/[A-Za-z]/.test(caption)||!caption.includes('출처 / Sources'))issues.push('국문본문, 영어본문, 출처 순서의 캡션이 필요합니다.');
  return issues;
}
