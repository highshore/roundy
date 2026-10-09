// Exercise visible states with isolated fixtures; never contacts a live API.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const cache = new Map();
const encoded = [];
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = id => {
    if (id === 'next/link') return ({ children, ...props }) => React.createElement('a', props, children);
    if (id === 'next/image') return props => React.createElement('img', props);
    if (id === 'qrcode') return { toDataURL: async url => { encoded.push(url); return 'data:image/png;base64,fixture'; } };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? resolve('src', id.slice(2)) : resolve(dirname(file), id);
      for (const ext of ['.ts', '.tsx']) { try { readFileSync(base + ext); return load(base + ext); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    }
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}
const { eventPriceLabel, eventCalendarUrl, ticketStateUrl } = load('src/lib/event-experience.ts');
const { ReturningDiscovery, MyEvents } = load('src/components/event-experience.tsx');
const { EventTicket } = load('src/components/event-ticket.tsx');
const future = { id: 'future', slug: 'hongdae', title: 'Hongdae Language Exchange', title_ko: '홍대 언어교환', starts_at: '2099-11-10T10:00:00Z', ends_at: '2099-11-10T12:00:00Z', venue: 'Sample cafe', address: 'Seoul', neighborhood: 'Hongdae', image: '/images/yeouido.webp', status: 'live', theme: 'Language Exchange', gender_split_enabled: false, price_general: 20000, seats_remaining: 4, event_language: 'english' };
const past = { ...future, id: 'past', slug: 'past', title: 'Past event', starts_at: '2000-11-10T10:00:00Z', ends_at: '2000-11-10T12:00:00Z' };
const pending = { ...future, id: 'pending', slug: 'pending', title: 'Pending event', seats_remaining: 0 };
const mingle = { ...future, id: 'mingle', slug: 'mingle', title: 'Mingle event', theme: '1:1 Speed Meetup' };
assert.equal(eventPriceLabel(future, 'en'), '₩20,000');
assert.equal(eventPriceLabel({ ...future, price_general: undefined }, 'en'), 'Price at checkout');
assert.equal(eventPriceLabel({ ...future, price_general: 0 }, 'ko'), '무료');
assert.equal(eventPriceLabel({ ...future, gender_split_enabled: true, price_ladies: 10000, price_gents: 20000 }, 'en'), 'From ₩10,000');
const calendar = new URL(eventCalendarUrl(future, 'en'));
assert.equal(calendar.searchParams.get('dates'), '20991110T100000Z/20991110T120000Z');
assert.equal(calendar.searchParams.get('ctz'), 'Asia/Seoul');
const validQr = 'https://roundy.team/check-in/12345678-1234-1234-1234-123456789abc';
assert.equal(ticketStateUrl(validQr), validQr);
for (const value of [null, 'javascript:alert(1)', 'https://example.com/check-in/123', validQr + '?redirect=evil', validQr.replace('roundy.team', 'roundy.team.evil')]) assert.equal(ticketStateUrl(value), null);
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.children ? text(node.children) : '';
let view;
async function mount(component, props) { await act(async () => { view = create(React.createElement(component, props)); }); }
async function click(label) { const button = view.root.findAllByType('button').find(n => text(n) === label); assert.ok(button, label); await act(async () => button.props.onClick()); }
async function unmount() { await act(async () => view.unmount()); }
await mount(ReturningDiscovery, { events: [future, past, pending, mingle], booked: { hongdae: true }, locale: 'en' });
assert.match(text(view.toJSON()), /Your Next Plan/);
assert.match(text(view.toJSON()), /Sold out/);
assert.doesNotMatch(text(view.toJSON()), /Past event/);
await click('1:1 Mingle');
assert.equal(view.root.findAllByType('a').filter(n => n.props.className === 'compact-event-row').length, 1);
await act(async () => view.root.findByType('input').props.onChange({ target: { value: 'missing' } }));
assert.match(text(view.toJSON()), /No Events Here Yet/);
await unmount();
await mount(MyEvents, { events: [future, past, pending], booked: { hongdae: true, past: true }, pendingPayments: { pending: { status: 'charging', amount: 20000, order_number: 'fixture' } }, locale: 'en' });
assert.equal(view.root.findAllByType('a').filter(n => n.props.href?.startsWith('/ticket/')).length, 1);
assert.match(text(view.toJSON()), /seat is not confirmed/);
await click('Past');
assert.equal(view.root.findAllByType('a').filter(n => n.props.href?.startsWith('/ticket/')).length, 0);
assert.match(text(view.toJSON()), /Past Event/);
assert.doesNotMatch(text(view.toJSON()), /Payment pending/);
await unmount();
let state = { check_in_url: validQr, checked_in_at: null }, failed = false;
globalThis.fetch = async () => ({ ok: !failed, json: async () => ({ state }) });
await mount(EventTicket, { event: future, locale: 'en' });
assert.deepEqual(encoded, [validQr]);
assert.equal(view.root.findAllByType('img').length, 1);
await unmount();
state = { check_in_url: validQr, checked_in_at: '2099-11-10T09:50:00Z' };
await mount(EventTicket, { event: future, locale: 'en' });
assert.match(text(view.toJSON()), /Checked in/);
assert.equal(encoded.length, 1);
assert.equal(view.root.findAllByType('img').length, 0);
await unmount();
failed = true;
await mount(EventTicket, { event: future, locale: 'ko' });
assert.match(text(view.toJSON()), /티켓을 불러오지 못했어요/);
failed = false; state = { check_in_url: 'https://example.com/not-a-ticket', checked_in_at: null };
await click('다시 시도');
assert.equal(encoded.length, 1);
assert.equal(view.root.findAllByType('img').length, 0);
assert.match(text(view.toJSON()), /호스트에게 예약 내역/);
await unmount();
console.log('PASS: discovery filters, sold-out visibility, booking history, pending payments, price/calendar links, server-issued ticket QR, checked-in and retry states');
