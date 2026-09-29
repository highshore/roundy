// Change these when the linked documents change and renewed consent is needed.
export const LEGAL_VERSION = '2026-09-30';
export function validLegalConsent(value: unknown): value is { terms: true; privacy: true; version: string } {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return body.terms === true && body.privacy === true && body.version === LEGAL_VERSION;
}
