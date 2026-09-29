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
globalThis.window = { location: { search: '', origin: 'https://roundy.team', assign: path => { navigated = path; } }, setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {} };
globalThis.fetch = async path => ({ ok: true, json: async () => path === '/auth/settings' ? { email: true, phone: true } : { profile: {} } });
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = id => {
    if (id.endsWith('.css')) return {};
    if (id === '@/lib/supabase/client') return { createClient: () => ({ auth }) };
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
await fill(0, 'current-example'); await fill(1, 'new-example'); await fill(2, 'wrong-example'); await submit();
assert.equal(updates.length, 0); assert.match(text(view.toJSON()), /Passwords do not match/);
await fill(2, 'new-example'); await submit(); assert.equal(sends, 1); assert.match(text(view.toJSON()), /Verify it’s you/);
await fill(0, '000000'); await submit(); assert.match(text(view.toJSON()), /invalid or expired/);
await fill(0, '123456'); await submit(); assert.match(text(view.toJSON()), /Password updated/);
assert.deepEqual(updates.at(-1), { password: 'new-example', current_password: 'current-example', nonce: '123456' });
assert.equal(view.root.findAllByType('input').length, 0); await unmount();
console.log('PASS password mismatch, stale session, invalid nonce, successful nonce retry and payload');
auth.updateUser = async values => { updates.push(values); return { error: null }; };
await mount(PasswordForm, { locale: 'ko', recovery: true }); await fill(0, 'reset-example'); await fill(1, 'reset-example'); await submit();
assert.deepEqual(updates.at(-1), { password: 'reset-example' }); assert.match(text(view.toJSON()), /비밀번호가 변경/); await unmount();
console.log('PASS recovery does not require the forgotten password; Korean success state');
const { SignIn } = load('src/components/sign-in.tsx');
let signups = 0; let signInError = null;
auth = { signUp: async values => { signups++; assert.match(values.options.emailRedirectTo, /^https:\/\/roundy.team\/auth\/callback/); return { data: { user: {}, session: null }, error: null }; }, signInWithPassword: async () => ({ error: signInError }), resend: async () => ({ error: null }) };
await mount(SignIn, { locale: 'en' }); await click('Continue with ID or email'); await click('Sign up');
await fill(0, 'test-id'); await fill(1, 'test@example.com'); await fill(2, 'test-password'); await fill(3, 'test-password'); await submit(); await click('Accept test consent');
assert.equal(signups, 1); assert.equal(navigated, undefined); assert.match(text(view.toJSON()), /Check your email/); assert.equal(view.root.findAllByType('input').length, 0);
assert.equal(view.root.findAllByType('button').find(n => text(n).startsWith('Resend in')).props.disabled, true);
await click('Change email address'); assert.match(text(view.toJSON()), /Create your account/); await click('Log in');
await fill(0, 'test@example.com'); await fill(1, 'test-password'); signInError = { code: 'email_not_confirmed' }; await submit(); assert.match(text(view.toJSON()), /Check your email/); assert.equal(navigated, undefined);
await click('Back to sign in'); await fill(1, 'test-password'); signInError = null; await submit(); assert.equal(navigated, '/onboarding/basics'); await unmount();
console.log('PASS signup and unconfirmed login stay unauthenticated; correction and onboarding after sign-in');
const { AccountSecurity } = load('src/components/account-security.tsx');
let user = { email: 'old@example.com', identities: [{ provider: 'email' }] };
auth = { getUser: async () => ({ data: { user }, error: null }), updateUser: async ({ email }) => { user = { ...user, new_email: email }; return { data: { user }, error: null }; } };
await mount(AccountSecurity, { locale: 'en', mode: 'email' }); await fill(0, 'new@example.com'); await submit();
assert.match(text(view.toJSON()), /o\*\*\*@example.com/); assert.match(text(view.toJSON()), /n\*\*\*@example.com/); assert.match(text(view.toJSON()), /Pending email/);
user = { email: 'new@example.com', identities: [{ provider: 'email' }] }; await click('Refresh status'); assert.doesNotMatch(text(view.toJSON()), /Pending email/); await unmount();
user = { email: 'social@example.com', identities: [{ provider: 'kakao' }] }; await mount(AccountSecurity, { locale: 'en', mode: 'password' }); assert.equal(view.root.findAllByType('input').length, 0); assert.match(text(view.toJSON()), /set or reset a password/); await unmount();
console.log('PASS pending email retains old address, refresh reflects confirmation, social account fallback');
