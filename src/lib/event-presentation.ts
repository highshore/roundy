import { tr, type Locale } from './locale';

export const eventLanguageValues = ['either','en','ko'] as const;
export type EventLanguage = typeof eventLanguageValues[number];

export type ParticipantDisclosures = {
  age: boolean;
  job: boolean;
  nationality: boolean;
  height: boolean;
  smoking: boolean;
};

export const defaultParticipantDisclosures = (): ParticipantDisclosures => ({
  age: true,
  job: true,
  nationality: false,
  height: false,
  smoking: false,
});

export function validateEventLanguage(value: unknown): EventLanguage {
  if (value === undefined) return 'either';
  if (typeof value !== 'string' || !eventLanguageValues.includes(value as EventLanguage)) {
    throw new Error('Choose a valid meetup language.');
  }
  return value as EventLanguage;
}

export function validateParticipantDisclosures(value: unknown): ParticipantDisclosures {
  if (value === undefined) return defaultParticipantDisclosures();
  if (!value || typeof value !== 'object') throw new Error('Invalid participant disclosure settings.');
  const source = value as Record<string, unknown>;
  const result = defaultParticipantDisclosures();
  for (const key of Object.keys(result) as (keyof ParticipantDisclosures)[]) {
    if (typeof source[key] !== 'boolean') throw new Error('Invalid participant disclosure settings.');
    result[key] = source[key] as boolean;
  }
  return result;
}

export function eventLanguageLabel(value: EventLanguage | undefined, locale: Locale) {
  if (value === 'ko') return tr(locale, 'Korean only', '한국어만');
  if (value === 'en') return tr(locale, 'English only', '영어만');
  return tr(locale, 'Korean or English', '한국어 또는 영어');
}

export function eventLanguageRequirement(value: EventLanguage | undefined, locale: Locale) {
  if (value === 'ko') return tr(locale, 'This meetup is conducted in Korean only.', '이 모임은 한국어로만 진행됩니다.');
  if (value === 'en') return tr(locale, 'This meetup is conducted in English only.', '이 모임은 영어로만 진행됩니다.');
  return tr(locale, 'Comfortable with short conversations in Korean or English.', '한국어 또는 영어로 짧은 대화를 편하게 나눌 수 있어야 해요.');
}

export function participantDisclosureLabel(key: keyof ParticipantDisclosures, locale: Locale) {
  const labels: Record<keyof ParticipantDisclosures, [string, string]> = {
    age: ['Age range', '연령대'],
    job: ['Job category', '직업군'],
    nationality: ['Nationality flag', '국적 이모지'],
    height: ['Height', '키'],
    smoking: ['Smoking', '흡연 여부'],
  };
  return tr(locale, labels[key][0], labels[key][1]);
}
