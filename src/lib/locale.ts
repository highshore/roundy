export type Locale = 'en' | 'ko';

export const localeName: Record<Locale, string> = { en: 'English', ko: '한국어' };

export function tr(locale: Locale, english: string, korean: string) {
  return locale === 'ko' ? korean : english;
}

type EventCopy = { title: string; theme: string; description: string; venue: string; address: string };

const koreanEvents: Record<string, EventCopy> = {
  'saturday-social': {
    title: '토요일 소셜',
    theme: '새로운 시작',
    description: '작은 공간에서 새로운 얼굴들을 만나 보세요. 한 사람씩, 온전히 영어로 나누는 대화가 좋은 연결로 이어집니다.',
    venue: '예시 장소',
    address: '서울 여의도 — 예시 이벤트',
  },
  'sunday-slow-dating': {
    title: '일요일 슬로우 데이팅',
    theme: '천천히, 여유롭게',
    description: '예상하지 못한 연결을 위한 여유를 만들어 보세요. 다정한 호스트와 함께하는 깊이 있는 대화, 잘 보낸 일요일 오후입니다.',
    venue: '예시 장소',
    address: '서울 안암 — 예시 이벤트',
  },
};

export function localizeEvent<T extends { slug: string; title: string; theme: string; description: string; venue: string; address: string }>(event: T, locale: Locale) {
  if (locale !== 'ko' || !koreanEvents[event.slug]) return event;
  return { ...event, ...koreanEvents[event.slug] };
}

const koreanInterests: Record<string, string> = {
  Coffee: '커피', Running: '러닝', Travel: '여행', Food: '맛집', Film: '영화', Music: '음악', Hiking: '하이킹', Art: '예술', Books: '책', Tech: '테크', Cooking: '요리', Design: '디자인', Museums: '미술관', Photography: '사진', Football: '축구', Yoga: '요가',
};

export function localizeInterest(interest: string, locale: Locale) {
  return locale === 'ko' ? koreanInterests[interest] ?? interest : interest;
}

export function dateLabelForLocale(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', weekday: 'short',
  }).format(new Date(value));
}

export function timeLabelForLocale(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: locale === 'en',
  }).format(new Date(value));
}
