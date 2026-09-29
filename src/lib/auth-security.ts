import type { Locale } from './locale';
import { tr } from './locale';

export function maskEmail(email: string) {
  const at = email.lastIndexOf('@');
  return at > 0 ? email.slice(0, 1) + '***' + email.slice(at) : '***';
}

export function passwordRequirements(locale: Locale) {
  return tr(locale, 'Choose a stronger password with at least 8 characters, including letters and numbers.', '영문과 숫자를 포함한 8자 이상의 비밀번호를 입력해 주세요.');
}

export function newPasswordError(password: string, locale: Locale) {
  return password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) ? passwordRequirements(locale) : '';
}

export function passwordMismatch(locale: Locale) {
  return tr(locale, 'Passwords do not match.', '비밀번호가 일치하지 않아요.');
}

export function authSecurityError(error: unknown, locale: Locale) {
  const code = (error as { code?: string })?.code;
  const t = (en: string, ko: string) => tr(locale, en, ko);
  switch (code) {
    case 'invalid_credentials':
    case 'invalid_password':
    case 'current_password_invalid':
    case 'current_password_missing':
      return t('Check your current password and try again.', '현재 비밀번호를 확인하고 다시 시도해 주세요.');
    case 'same_password':
      return t('Choose a different password.', '현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
    case 'weak_password':
      return (error as { reasons?: string[] })?.reasons?.includes('pwned')
        ? t('This password has appeared in a data breach. Choose a different password.', '유출된 적이 있는 비밀번호예요. 다른 비밀번호를 입력해 주세요.')
        : passwordRequirements(locale);
    case 'reauthentication_not_valid':
    case 'otp_expired':
      return t('The code is invalid or expired. Try again or request a new code.', '인증번호가 올바르지 않거나 만료되었어요. 다시 입력하거나 새로 요청해 주세요.');
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return t('Too many requests. Please wait before trying again.', '요청이 많아요. 잠시 후 다시 시도해 주세요.');
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
      return t('Your session has expired. Sign in again to continue.', '로그인이 만료되었어요. 다시 로그인해 주세요.');
    case 'email_exists':
    case 'email_address_invalid':
      return t('This email address cannot be used. Check it and try again.', '사용할 수 없는 이메일이에요. 주소를 확인해 주세요.');
    default:
      return t('We couldn’t complete your request. Please try again.', '요청을 완료하지 못했어요. 다시 시도해 주세요.');
  }
}
