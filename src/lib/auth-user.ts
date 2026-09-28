// Only server-verified, non-anonymous accounts may enter member routes.
export function isMemberUser(user: { is_anonymous?: boolean; app_metadata: { provider?: string } } | null) {
  return !!user && !user.is_anonymous && ['kakao', 'email', 'phone'].includes(user.app_metadata.provider ?? '');
}
