import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
let handler, allowed = true, lookupError = null, calls = [], authReads = 0;
const client = {
  rpc: async (name, args) => { calls.push(args); return { data: allowed, error: null }; },
  from: table => ({ select: column => ({ eq: (key, value) => ({ maybeSingle: async () => {
    assert.equal(table, 'account_usernames'); assert.equal(column, 'username'); assert.equal(key, 'username');
    return { data: value === 'taken-id' ? { username: value } : null, error: lookupError };
  } }) }) }),
  auth: { admin: { getUserById: () => { authReads++; throw new Error('Unexpected private lookup'); } } },
};
const source = readFileSync('supabase/functions/roundy-username-login/index.ts', 'utf8').replace(/^import .*\n/, '');
new Function('Deno', 'createClient', ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText)(
  { serve: fn => { handler = fn; }, env: { get: () => 'mock' } }, () => client,
);
async function check(username, origin = 'https://roundy.team') {
  return handler(new Request('https://example.invalid', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'availability', username }) }));
}
let response = await check(' Taken-ID '); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { available: false });
response = await check('free-id'); assert.deepEqual(await response.json(), { available: true });
assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(authReads, 0);
const checks = calls.length;
assert.equal((await check('a@b.com')).status, 400); assert.equal(calls.length, checks);
assert.equal((await check('free-id', 'https://evil.example')).status, 403);
allowed = false; assert.equal((await check('free-id')).status, 429);
allowed = true; lookupError = { message: 'offline' }; assert.equal((await check('free-id')).status, 503);
assert.ok(calls.every(c => c.p_limit === 30));
console.log('PASS ID normalization, taken/free, email rejection, privacy, origin policy, rate limit and database errors');
