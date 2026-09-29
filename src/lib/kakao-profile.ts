export const KAKAO_PROFILE_SCOPES = [
  'profile_nickname',
  'profile_image',
  'account_email',
  'name',
  'gender',
  'birthday',
  'birthyear',
  'phone_number',
].join(' ');

export type KakaoAccount = {
  profile?: {
    nickname?: string | null;
    profile_image_url?: string | null;
    is_default_image?: boolean | null;
  } | null;
  email?: string | null;
  name?: string | null;
  birthyear?: string | null;
  birthday?: string | null;
  birthday_type?: 'SOLAR' | 'LUNAR' | string | null;
  gender?: 'female' | 'male' | string | null;
  phone_number?: string | null;
};

export type KakaoUserInfo = {
  kakao_account?: KakaoAccount | null;
};

export type KakaoProfilePrefill = {
  full_name: string;
  birth_date: string;
  gender: string;
  phone: string;
  profile_image_url: string;
  nickname: string;
  email: string;
};

export function kakaoBirthDate(account?: KakaoAccount | null) {
  if (!account || account.birthday_type !== 'SOLAR') return '';
  const year = account.birthyear ?? '';
  const birthday = account.birthday ?? '';
  if (!/^\d{4}$/.test(year) || !/^\d{4}$/.test(birthday)) return '';

  const month = birthday.slice(0, 2);
  const day = birthday.slice(2, 4);
  const value = `${year}-${month}-${day}`;
  const parsed = new Date(value + 'T00:00:00Z');
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) return '';
  return value;
}

export function kakaoKoreanPhone(value?: string | null) {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('82')) digits = digits.slice(2);
  if (digits.startsWith('10')) digits = '0' + digits;
  if (!/^010\d{8}$/.test(digits)) return '';
  return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
}

export function kakaoProfilePrefill(info: KakaoUserInfo): KakaoProfilePrefill {
  const account = info.kakao_account ?? {};
  const profile = account.profile ?? {};
  return {
    full_name: typeof account.name === 'string' ? account.name.trim().slice(0, 200) : '',
    birth_date: kakaoBirthDate(account),
    gender: account.gender === 'female' || account.gender === 'male' ? account.gender : '',
    phone: kakaoKoreanPhone(account.phone_number),
    profile_image_url:
      profile.is_default_image === true || typeof profile.profile_image_url !== 'string'
        ? ''
        : profile.profile_image_url,
    nickname: typeof profile.nickname === 'string' ? profile.nickname.trim().slice(0, 200) : '',
    email: typeof account.email === 'string' ? account.email.trim().slice(0, 254) : '',
  };
}
