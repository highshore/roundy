// Heuristic editorial review for NEW magazine documents only. No external or paid API calls.
// Scores are production guardrails, not predictions of Instagram reach or engagement.
export const EDITORIAL_ENGAGEMENT_POLICY = 1;
export const EDITORIAL_ENGAGEMENT_THRESHOLD = 80;

export type EditorialEngagementResult = {
  version: number;
  score: number;
  threshold: number;
  issues: string[];
};

type Slide = { title?: unknown; body?: unknown; highlight?: unknown };
type Document = { slides?: Slide[] };
const word = (v: unknown) => typeof v === 'string' ? v.trim() : '';

export function evaluateEditorialEngagement(value: unknown, language: string): EditorialEngagementResult {
  const doc = value && typeof value === 'object' ? value as Document : null;
  const slides = Array.isArray(doc?.slides) ? doc.slides : [];
  if (slides.length < 3) return {
    version: EDITORIAL_ENGAGEMENT_POLICY, score: 0, threshold: EDITORIAL_ENGAGEMENT_THRESHOLD,
    issues: ['콘텐츠 카드가 부족해 독자 가치를 검토할 수 없습니다.']
  };

  const ko = language !== 'en';
  const cover = word(slides[0]?.title);
  const middle = slides.slice(1, -1);
  const closing = [word(slides.at(-1)?.title), word(slides.at(-1)?.body)].join(' ');
  const bodyText = middle.map(s => [word(s.title), word(s.body), word(s.highlight)].join(' ')).join(' ');
  const issues: string[] = [];
  let score = 100;
  const deduct = (points: number, explanation: string) => {
    score = Math.max(0, score - points);
    issues.push(explanation);
  };

  // Signals are deliberately conservative: punctuation alone never proves originality.
  const genericHeadline = ko
    ? /(?:^(?:좋은|더\s*나은|자연스러운|즐거운|성공적인|의미\s*있는)\s*(?:대화|질문|만남|관계)|(?:꺼내는|시작하는|이어가는|나누는)\s*(?:첫\s*)?(?:질문|대화|방법)$)/i
    : /(?:^(?:better|natural|good|great|easy|simple)\s+(?:conversations?|questions?|connections?)|(?:ways?\s+to\s+(?:start|continue)\s+(?:a\s+)?conversation)$)/i;
  const hookTension = ko
    ? /(?:왜|이유|진짜|의외|착각|실수|반전|차이|말고|대신|면접|불편|어색|공통점|순간|피하|그래도|정말|[?？!]|\d)/
    : /(?:why|reason|mistake|awkward|instead|without|actually|surprising|never|difference|versus|vs\.|what\s+if|[?!]|\d)/i;
  if (genericHeadline.test(cover)) deduct(25, '표지가 흔한 대화 팁 제목입니다. 독자가 궁금해할 갈등, 관찰, 반전 또는 구체적인 효용을 드러내세요.');
  if (!hookTension.test(cover)) deduct(15, '표지에 다음 장을 확인할 만한 구체적인 궁금증이나 예상 밖의 관찰이 부족합니다.');

  const perspective = ko
    ? /(?:하지만|반면|사실|알고\s*보면|오히려|때문|그런데|대신|차라리|보다는|아니라|의외|달리|그래서|차이|이유)/
    : /(?:but|however|actually|rather|instead|because|unlike|versus|compared|on\s+the\s+other\s+hand|the\s+reason|the\s+difference)/i;
  const hasPerspective = perspective.test(bodyText);
  if (!hasPerspective) deduct(25, '카드 내용이 행동 지시나 평범한 설명에 머무릅니다. 왜 그런지, 무엇이 다른지, 독자가 미처 생각하지 못한 관찰을 하나 넣으세요.');

  const instructionalEnding = ko
    ? /(?:물어보세요|이어가세요|골라보세요|해보세요|보세요|하세요|골라요|이어가요|말해보세요)(?:[.!?。]|\s*$)/i
    : /(?:ask|try|choose|remember|make\s+sure|start\s+with|follow\s+up)(?:[^.!?]{0,30})[.!?]?\s*$/i;
  const genericAdviceCards = middle.filter(s => instructionalEnding.test(word(s.body))).length;
  if (genericAdviceCards >= 2 && !hasPerspective) {
    deduct(20, '비슷한 지시문이 여러 장 반복됩니다. 질문 예시를 늘리기보다 실제 상황에서 생기는 차이를 보여주세요.');
  }

  const thinCards = middle.filter(s => word(s.body).length < (ko ? 17 : 38)).length;
  if (thinCards >= 2) deduct(15, '정보가 거의 없는 본문 카드가 반복됩니다. 슬라이드 수를 줄이거나 서로 다른 실제 사례를 보강하세요.');

  const genericClosing = ko
    ? /(?:주변을\s*묻고|답에서\s*이어|질문을\s*이어|자연스럽게\s*대화|서로를\s*알아|작은\s*대화가)/
    : /(?:keep\s+the\s+conversation\s+going|ask\s+and\s+listen|connect\s+naturally|better\s+conversations\s+start)/i;
  if (genericClosing.test(closing)) deduct(15, '마지막 장이 앞선 조언을 반복합니다. 저장할 만한 구체적인 한 문장으로 끝내세요.');

  return {
    version: EDITORIAL_ENGAGEMENT_POLICY,
    score,
    threshold: EDITORIAL_ENGAGEMENT_THRESHOLD,
    issues: score < EDITORIAL_ENGAGEMENT_THRESHOLD ? issues : []
  };
}
