// Component-level tests with mocked Auth APIs; never sends email or changes live accounts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'mock-test-key';
let auth, navigated;
let idAvailable = true;
globalThis.window = { location: { search: '', origin: 'https://roundy.team', assign: path => { navigated = path; } }, setTimeout: (fn, delay) => { if (delay === 450) queueMicrotask(fn); return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {} };
globalThis.fetch = async path => ({ ok: true, json: async () => path === '/auth/settings' ? { email: true, phone: true } : { profile: {} } });
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = id => {
    if (id.endsWith('.css')) return {};
    if (id === '@/lib/supabase/client') return { createClient: () => ({ auth, functions: { invoke: async () => ({ data: { available: idAvailable }, error: null }) } }) };
    if (id === '@/lib/locale') return { tr: (locale, en, ko) => locale === 'ko' ? ko : en };
    if (id === '@/lib/data') return { emptyProfile: {}, profileComplete: () => false };
    if (id.includes('roundy-brand') || id.includes('kakao-login-symbol') || id.includes('noto-animated-emoji')) return new Proxy({}, { get: () => () => null });
    if (id.includes('legal-consent')) return { LegalConsentDialog: ({ onAccept }) => React.createElement('button', { onClick: onAccept }, 'Accept test consent'), recordLegalConsent: async () => {} };
    if (id === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? resolve('src', id.slice(2)) : resolve(dirname(file), id);
      for (const ext of ['.ts', '.tsx']) { try { readFileSync(base + ext); return load(base + ext); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', compiled)(localRequire, module, module.exports);
  return module.exports;
}
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.children ? text(node.children) : '';
let view;
async function mount(component, props) { await act(async () => { view = create(React.createElement(component, props)); }); }
const button = label => view.root.findAllByType('button').find(n => text(n) === label);
async function click(label) { const b = button(label); assert.ok(b, `Button missing: ${label}`); await act(async () => { await b.props.onClick(); }); }
async function fill(index, value) { await act(async () => view.root.findAllByType('input')[index].props.onChange({ target: { value } })); }
async function submit() { await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault() {} }); }); }
async function unmount() { await act(async () => view.unmount()); }
const { PasswordForm } = load('src/components/password-form.tsx');
const updates = []; let sends = 0;
auth = { updateUser: async values => { updates.push(values); return { error: !values.nonce ? { code: 'reauthentication_needed' } : values.nonce === '000000' ? { code: 'reauthentication_not_valid' } : null }; }, reauthenticate: async () => { sends++; return { error: null }; } };
await mount(PasswordForm, { locale: 'en' });
await fill(0, 'current-example'); await fill(1, 'new-example1'); await fill(2, 'wrong-example1'); await submit();
assert.equal(updates.length, 0); assert.match(text(view.toJSON()), /Passwords do not match/);
await fill(2, 'new-example1'); await submit(); assert.equal(sends, 1); assert.match(text(view.toJSON()), /Verify it’s you/);
await fill(0, '000000'); await submit(); assert.match(text(view.toJSON()), /invalid or expired/);
await fill(0, '123456'); await submit(); assert.match(text(view.toJSON()), /Password updated/);
assert.deepEqual(updates.at(-1), { password: 'new-example1', current_password: 'current-example', nonce: '123456' });
assert.equal(view.root.findAllByType('input').length, 0); await unmount();
console.log('PASS password mismatch, stale session, invalid nonce, successful nonce retry and payload');
auth.updateUser = async values => { updates.push(values); return { error: null }; };
await mount(PasswordForm, { locale: 'ko', recovery: true }); await fill(0, 'reset-example1'); await fill(1, 'reset-example1'); await submit();
assert.deepEqual(updates.at(-1), { password: 'reset-example1' }); assert.match(text(view.toJSON()), /비밀번호가 변경/); await unmount();
console.log('PASS recovery does not require the forgotten password; Korean success state');
const { SignIn } = load('src/components/sign-in.tsx');
let signups = 0; let signInError = null;
auth = { signUp: async values => { signups++; assert.match(values.options.emailRedirectTo, /^https:\/\/roundy.team\/auth\/callback/); return { data: { user: {}, session: null }, error: null }; }, signInWithPassword: async () => ({ error: signInError }), resend: async () => ({ error: null }) };
await mount(SignIn, { locale: 'en' }); await click('Continue with ID or email'); await click('Sign up');
await fill(0, 'test-id'); await fill(1, 'test@example.com'); await fill(2, 'test-password1'); await fill(3, 'test-password1'); await submit(); await click('Accept test consent');
assert.equal(signups, 1); assert.equal(navigated, undefined); assert.match(text(view.toJSON()), /Check your email/); assert.equal(view.root.findAllByType('input').length, 0);
assert.equal(view.root.findAllByType('button').find(n => text(n).startsWith('Resend in')).props.disabled, true);
await click('Change email address'); assert.match(text(view.toJSON()), /Create your account/); await click('Log in');
await fill(0, 'test@example.com'); await fill(1, 'test-password1'); signInError = { code: 'email_not_confirmed' }; await submit(); assert.match(text(view.toJSON()), /Check your email/); assert.equal(navigated, undefined);
await click('Back to sign in'); await fill(1, 'test-password1'); signInError = null; await submit(); assert.equal(navigated, '/onboarding/basics'); await unmount();
console.log('PASS signup and unconfirmed login stay unauthenticated; correction and onboarding after sign-in');
// Weak passwords must stay on the form, including server-only rejections after consent.
let rejectedSignups = 0;
auth = { signUp: async () => { rejectedSignups++; return { data: {}, error: { code: 'weak_password' } }; } };
await mount(SignIn, { locale: 'en' }); await click('Continue with ID or email'); await click('Sign up');
await fill(0, 'test-id'); await fill(1, 'test@example.com');
for (const weak of ['short1', 'onlyletters', '123456789']) {
  await fill(2, weak); await fill(3, weak); await submit();
  assert.equal(button('Accept test consent'), undefined);
  assert.equal(view.root.findAllByType('input')[2].props['aria-invalid'], true);
  assert.equal(view.root.findByProps({ id: 'signup-password-feedback' }).props.role, 'alert');
}
assert.equal(rejectedSignups, 0);
await fill(2, 'valid-password1'); await fill(3, 'different1'); await submit();
assert.equal(view.root.findAllByType('input')[3].props['aria-invalid'], true);
assert.equal(button('Accept test consent'), undefined);
await fill(3, 'valid-password1'); await submit(); await click('Accept test consent');
assert.equal(rejectedSignups, 1); assert.equal(button('Accept test consent'), undefined);
assert.match(text(view.root.findByProps({ id: 'signup-password-feedback' })), /at least 8 characters, including letters and numbers/);
assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 1);
await fill(2, 'another-password1'); await fill(3, 'another-password1'); await submit();
assert.equal(rejectedSignups, 2); // Accepted consent survives a password correction.
await unmount();
for (const recovery of [false, true]) {
  auth = { updateUser: async () => ({ error: { code: 'weak_password', reasons: ['pwned'] } }) };
  await mount(PasswordForm, { locale: 'en', recovery });
  const offset = recovery ? 0 : 1;
  if (!recovery) await fill(0, 'old-password');
  await fill(offset, 'letters-only'); await fill(offset + 1, 'letters-only'); await submit();
  assert.match(text(view.root.findByProps({ id: 'new-password-feedback' })), /at least 8 characters, including letters and numbers/);
  await fill(offset, 'valid-password1'); await fill(offset + 1, 'valid-password1'); await submit();
  assert.match(text(view.root.findByProps({ id: 'new-password-feedback' })), /data breach/);
  assert.equal(view.root.findAllByProps({ role: 'alert' }).length, 1);
  await unmount();
}
console.log('PASS inline password validation, consent isolation, server rejection, retry and shared reset/change feedback');
const { AccountSecurity } = load('src/components/account-security.tsx');
let user = { email: 'old@example.com', identities: [{ provider: 'email' }] };
auth = { getUser: async () => ({ data: { user }, error: null }), updateUser: async ({ email }) => { user = { ...user, new_email: email }; return { data: { user }, error: null }; } };
await mount(AccountSecurity, { locale: 'en', mode: 'email' }); await fill(0, 'new@example.com'); await submit();
assert.match(text(view.toJSON()), /o\*\*\*@example.com/); assert.match(text(view.toJSON()), /n\*\*\*@example.com/); assert.match(text(view.toJSON()), /Pending email/);
user = { email: 'new@example.com', identities: [{ provider: 'email' }] }; await click('Refresh status'); assert.doesNotMatch(text(view.toJSON()), /Pending email/); await unmount();
user = { email: 'social@example.com', identities: [{ provider: 'kakao' }] }; await mount(AccountSecurity, { locale: 'en', mode: 'password' }); assert.equal(view.root.findAllByType('input').length, 0); assert.match(text(view.toJSON()), /set or reset a password/); await unmount();
console.log('PASS pending email retains old address, refresh reflects confirmation, social account fallback');

const { ResetPassword } = load('src/components/reset-password.tsx');
auth = { getUser: async () => ({ data: { user: null }, error: null }) };
await mount(ResetPassword, { locale: 'en' });
assert.match(text(view.toJSON()), /Open the password reset link/);
assert.equal(view.root.findAllByType('main').length, 0); // The shared App owns the main landmark.
await act(async () => view.update(React.createElement(ResetPassword, { locale: 'ko' })));
assert.match(text(view.toJSON()), /이메일의 비밀번호 재설정 링크/);
await unmount();
auth = { getUser: async () => ({ data: { user: {} }, error: null }) };
await mount(ResetPassword, { locale: 'en' });
assert.equal(view.root.findAllByType('input').length, 2);
assert.match(text(view.toJSON()), /Reset password/);
await unmount();
auth = { signUp: async () => ({ data: { user: { identities: [] }, session: null }, error: null }) };
await mount(SignIn, { locale: 'en' }); await click('Continue with ID or email'); await click('Sign up');
await fill(0, 'test-id'); await fill(1, 'test@example.com'); await fill(2, 'test-password1'); await fill(3, 'test-password1'); await submit(); await click('Accept test consent');
assert.match(text(view.toJSON()), /If this email needs confirmation/);
assert.doesNotMatch(text(view.toJSON()), /Open the link sent to/);
await click('Reset password');
assert.match(text(view.toJSON()), /Forgot your password/);
assert.equal(view.root.findByType('input').props.value, 'test@example.com');
await unmount();
console.log('PASS recovery locale, shared main landmark, recovery fields and duplicate-safe signup guidance');

signups = 0;
auth = { signUp: async () => { signups++; return { data: { session: null }, error: null }; } };
await mount(SignIn, { locale: 'en' }); await click('Continue with ID or email'); await click('Sign up');
idAvailable = false;
await fill(0, 'taken-id'); await fill(1, 'test@example.com'); await fill(2, 'test-password1'); await fill(3, 'test-password1');
assert.equal(button('Create account').props.disabled, true); assert.match(text(view.toJSON()), /Already taken/);
await submit(); assert.equal(signups, 0); assert.equal(button('Accept test consent'), undefined);
idAvailable = true; await fill(0, 'free-id'); await submit(); assert.ok(button('Accept test consent'));
idAvailable = false; await click('Accept test consent'); assert.equal(signups, 0); assert.match(text(view.toJSON()), /Already taken/);
idAvailable = true; await fill(0, 'another-free-id'); await submit(); assert.equal(signups, 1);
await unmount();
console.log('PASS taken IDs disable signup and consent-time conflicts are caught');
