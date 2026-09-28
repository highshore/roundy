import { type Locale } from './locale';
export const ratingKeys = ['overall', 'connection', 'return', 'recommend'] as const;
export type RatingKey = typeof ratingKeys[number];
export type FeedbackSurvey = Record<RatingKey, number> & { difficulty: string; improvement: string; locale: Locale; version?: number };
export type FeedbackContext = { submitted: boolean; eligible: boolean; event: { id: string; title: string; theme: string; starts_at: string; ends_at: string } | null };
export const feedbackQuestions = {
 overall: ['How was your first Roundy?', '첫 라운디 모임은 어땠나요?'],
 connection: ['Did you get to know people beyond their profiles?', '프로필 너머의 사람을 알아갈 수 있었나요?'],
 return: ['Would you come to another Roundy event?', '라운디 모임에 다시 참여하고 싶나요?'],
 recommend: ['Would you recommend Roundy to a friend?', '친구에게 라운디를 추천하고 싶나요?'],
 difficulty: ['What made it harder to connect?', '대화를 나누거나 가까워지는 데 어려웠던 점이 있나요?'],
 improvement: ['What could we do better next time?', '다음 모임에서 개선했으면 하는 점이 있나요?'],
} as const;
export function validFeedback(value: unknown): value is FeedbackSurvey {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const s = value as Record<string, unknown>;
 return ratingKeys.every(k => typeof s[k] === 'number' && Number.isInteger(s[k]) && s[k] >= 1 && s[k] <= 5)
  && ['difficulty', 'improvement'].every(k => typeof s[k] === 'string' && (s[k] as string).length <= 1500)
  && (s.locale === 'en' || s.locale === 'ko');
}
