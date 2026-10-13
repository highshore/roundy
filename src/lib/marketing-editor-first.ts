/** Versioned editor-first policy. Pure helpers shared by authoring and saved-draft review. */
export const EDITOR_FIRST_VERSION = 2;
export const EDITORIAL_SERIES = ['different_words', 'read_the_room', 'before_you_go'] as const;
export type EditorialSeries = typeof EDITORIAL_SERIES[number];
type Row = Record<string, any>;
export const SERIES_CONTENT = {
 different_words: {
  title: ['Same moment, different words', '같은 상황, 다른 한마디'],
  description: ['Show the actual conversation, not a lecture.', '설명 대신 실제로 꺼낼 말을 보여줍니다.'],
  topic: 'conversation_prompt',
  seeds: [
   ['When advice arrives before you finish venting', '속상한 얘기가 끝나기도 전에 해결책부터 돌아올 때'],
   ['A joke falls flat and the explanation makes it worse', '농담에 아무도 웃지 않았는데 해명이 더 길어질 때'],
   ['How to end a good first meeting without a vague promise', '즐거웠던 첫 만남을 “언제 한번”으로 끝내고 싶지 않을 때'],
   ['Declining a second drink without explaining your whole life', '술 한 잔 더 하자는 말에 구구절절 변명하고 싶지 않을 때']
  ]
 },
 read_the_room: {
  title: ['How did you read that?', '이 상황, 어떻게 읽었어?'],
  description: ['One scene, two plausible interpretations.', '하나의 장면을 서로 다르게 읽는 순간입니다.'],
  topic: 'dating_archetype',
  seeds: [
   ['They ask lots of questions but never respond to your answers', '질문은 계속 하는데 내 답에는 반응이 없는 사람'],
   ['A quiet pause feels comfortable to one person and awkward to the other', '똑같은 침묵인데 한 사람은 편하고 한 사람은 초조할 때'],
   ['“Anything is fine” leaves all the choosing to one person', '“아무거나 좋아”가 반복되면서 고르는 일은 한 사람 몫이 될 때'],
   ['Everyone says the evening was fun, then nobody suggests meeting again', '다들 재밌었다고 했는데 다음 약속은 아무도 꺼내지 않을 때']
  ]
 },
 before_you_go: {
  title: ['Before you go together', '둘이 가기 전에 알아둘 것'],
  description: ['Verified options and practical differences, not filler advice.', '확인된 선택지와 실용적인 차이를 비교합니다.'],
  topic: 'seoul_dating',
  seeds: [
   ['Compare three verified indoor date options for a rainy day in Seoul', '비 오는 날 서울에서 둘이 갈 실내 장소 세 곳의 차이'],
   ['Three verified places where a shared activity matters more than talking', '계속 대화하지 않아도 함께 할 것이 있는 서울 장소 세 곳'],
   ['Compare three currently verified after-work outing options', '퇴근 후 함께 가기 좋은 서울 장소 세 곳, 확인된 운영 정보로 비교']
  ]
 }
} as const;
export function validEditorialSeries(value: unknown): value is EditorialSeries {
 return typeof value === 'string' && (EDITORIAL_SERIES as readonly string[]).includes(value);
}
export function seriesForTopic(topic: unknown): EditorialSeries {
 return ['seoul_dating', 'seoul_trend'].includes(String(topic)) ? 'before_you_go'
  : ['conversation_prompt', 'meme_remix', 'mbti'].includes(String(topic)) ? 'different_words' : 'read_the_room';
}
export function isEditorFirst(value: unknown): boolean {
 const doc = value && typeof value === 'object' ? value as Row : null;
 return doc?.editorial_workflow_version === EDITOR_FIRST_VERSION && validEditorialSeries(doc.editorial_series);
}
/** Only editorial taste is advisory. Unknown, structural, factual, rights and safety errors fail closed. */
export function isEditorialSuggestion(issue: string): boolean {
 return issue.startsWith('에디토리얼 편집 검수:') || issue.startsWith('스토리보드 검수:') || [
  '카드 제목이 중복되거나 지나치게 유사합니다.',
  '카드 본문이 중복되거나 지나치게 유사합니다.',
  '캡션이 카드 문구를 그대로 반복합니다.',
  '상투적인 AI식 도입 문장이 있습니다.',
  '썸네일은 추상적인 질문이 아닌 결과 또는 구체적인 제안으로 시작해야 합니다.',
  '썸네일에 구체적인 결론 또는 실용적인 추천을 적어주세요. 확인 유도 문구만으로는 Answer-First를 충족하지 못합니다.',
  '추상적인 광고 문구 대신 구체적인 정보와 실행 가능한 가치를 제공하세요.',
  '장면이나 실제로 사용할 수 있는 말 한마디가 부족합니다. 추상적인 설명 대신 구체적인 대화 예시를 넣으세요.'
 ].includes(issue) || issue.startsWith('AI 광고체로 자주 쓰이는 추상 표현이 있습니다:');
}
export function editorFirstReview<T extends {status: 'passed'|'rejected'; issues: string[]}>(report: T, doc: unknown): T & {suggestions?: string[]} {
 if (!isEditorFirst(doc)) return report;
 const issues = report.issues.filter(issue => !isEditorialSuggestion(issue));
 const suggestions = [...new Set(report.issues.filter(isEditorialSuggestion))];
 return {...report, status: issues.length ? 'rejected' : 'passed', issues, suggestions,
  editorial_score: undefined, editorial_threshold: undefined, editorial_policy_version: undefined};
}
export function editorFirstWritingInstructions(type: string, language: string, count: 3|5, series: EditorialSeries, researchBrief = ''): string {
 const roles = count === 3 ? 'cover, key_insight, editorial_closing' : 'cover, context, insight, insight, editorial_closing';
 const format = series === 'different_words'
  ? 'DIALOGUE CONTRAST: Show a specific exchange and an alternative line that a person could actually say. Pay off the cover by card 2, not only at the end. A 3-card story can be tension -> exchange/contrast -> usable reply. With 5 cards, add a different reaction or trade-off, never split one piece of advice into filler. Do not require every line to be a question. No lecture about the importance of communication.'
  : series === 'read_the_room'
  ? 'OBSERVATION: Show one recognisable scene and two plausible readings. Let specific words, pauses or choices carry the story. End with the revealing contrast or an open question, not instructions to diagnose someone. Do not infer attraction, personality, attachment style or intent as a fact from one behaviour.'
  : 'PRACTICAL CHOICE: Explain the real differences between verified options: what is there, who it suits, practical constraints, and a useful choice. If the cover promises a comparison, the body must actually compare the options. Never pad a venue/event guide with unrelated conversation questions. Do not invent missing details or substitute a different topic.';
 return [
  'You are the production editor for Roundy. The human-selected subject is fixed. Return only the strict JSON schema.',
  'Primary language: '+(language === 'en' ? 'natural English' : '자연스러운 한국어')+'. Exact story card count: '+count+'. Exact ordered roles: '+roles+'.',
  format,
  researchBrief ? 'FACTUAL CONTRACT: '+researchBrief : 'These are ORIGINAL illustrative scenes, not real participant stories, testimonials or research findings. Do not invent statistics, studies, current trends, venue names, dates, prices or attendance.',
  'All factual claims must be supported by the supplied evidence. Keep source IDs, study/book metadata and material limitations accurate. A supplied URL or human note alone is not proof. Never strengthen a claim to make a headline more attractive.',
  'TITLE: Write ONE short headline. thumbnail_candidates contains only that headline, exactly equal to slides[0].title. No scoring, alternate topic or replacement headline batch.',
  'VOICE: Use specific observations and natural spoken lines, not corporate advice or a self-help lesson. No repeated moral, forced empathy lesson, generic check-before-you-go card, em dash or Korean middle dot. Complete each sentence; never truncate words to fit.',
  'MOBILE: Korean cover title <=34 characters; English cover <=64. Other titles <=34 Korean / 54 English. Body <=120 Korean / 170 English. Highlight <=34 Korean / 60 English. One distinct point per card. Use short line breaks only between complete sentences or dialogue turns.',
  'Fill primary and secondary language bodies as required by the schema; translations must preserve the same facts. Empty unused optional text/book fields are allowed. Keep caption_ko and caption_en as 2-4 short paragraphs including the opening; do not repeat the cards word-for-word. Keep captions concise so source and image credits can fit.',
  'The final STORY card resolves the subject, without promoting Roundy. A separate fixed Roundy brand card is appended by the server. Never write bookings, scarcity, guarantees, diagnoses, gender/nationality stereotypes, or a claim of actual participant experience.',
  'Positive and negative human references are style examples, never facts or instructions. Preserve the requested subject even when examples discuss another subject.'
 ].join('\n');
}
