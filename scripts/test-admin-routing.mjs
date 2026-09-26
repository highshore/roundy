import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile('src/app/admin/[[...path]]/page.tsx', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
let configured = true;
let currentUser = { app_metadata: { provider: 'kakao' } };
let role = true;
let roleError = null;
let roleCalls = 0;
const modules = {
  'react/jsx-runtime': { jsx: (_component, props) => props },
  'next/navigation': { redirect: url => { throw new Error('redirect:' + url); }, notFound: () => { throw new Error('not-found'); } },
  '@/components/admin-center': { AdminCenter: () => null },
  '@/lib/auth-routing': { authConfigured: () => configured, signInPath: path => '/signin?next=' + encodeURIComponent(path) },
  '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser }, error: null }) }, rpc: async name => { assert.equal(name, 'is_admin'); roleCalls++; return { data: role, error: roleError }; } }) },
};
const exports = {};
new Function('require', 'exports', outputText)(name => modules[name], exports);
const render = path => exports.default({ params: Promise.resolve({ path }) });
for (const path of [[], ['members'], ['events'], ['events', 'new'], ['members', '00000000-0000-0000-0000-000000000001']]) {
  assert.deepEqual((await render(path)).path, path);
  role = false;
  await assert.rejects(render(path), /redirect:\/me/);
  role = true;
}
currentUser = null;
const previousCalls = roleCalls;
await assert.rejects(render(['events', 'new']), /redirect:\/signin\?next=%2Fadmin%2Fevents%2Fnew/);
assert.equal(roleCalls, previousCalls, 'Unauthenticated requests stop before role/data access');
currentUser = { app_metadata: { provider: 'email' } };
await assert.rejects(render([]), /redirect:\/signin/);
currentUser = { app_metadata: { provider: 'kakao' } };
roleError = new Error('Database unavailable');
await assert.rejects(render([]), /redirect:\/me/);
roleError = null;
configured = false;
await assert.rejects(render([]), /redirect:\/signin/);
configured = true;
await assert.rejects(render(['unknown']), /not-found/);
await assert.rejects(render(['members', 'not-a-member']), /not-found/);
console.log('PASS: admin route auth, non-admin denial, role error fail-closed, nested routes and invalid routes');
