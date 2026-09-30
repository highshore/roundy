import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema roundy_private;
create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);`);
await db.exec(await readFile('supabase/migrations/20260928035659_username_signin.sql','utf8'));
await db.exec(await readFile('supabase/migrations/20260930031506_signup_availability.sql','utf8'));
await db.exec(`insert into auth.users values('11111111-1111-4111-8111-111111111111','KakaoUser@example.com','{"username":"taken-id"}');`);
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.query("select public.check_signup_availability(repeat('a',64),null,'kakaouser@example.com')"),/permission denied/);
  await db.exec('reset role');
}
await db.exec('set role service_role');
const check = async (id,email) => (await db.query("select public.check_signup_availability(repeat('a',64),$1,$2) as result",[id,email])).rows[0].result;
assert.deepEqual(await check(' TAKEN-ID ',' kakaouser@example.com '),{username_available:false,email_available:false});
assert.deepEqual(await check('new-id','new@example.com'),{username_available:true,email_available:true});
assert.deepEqual(await check(null,'kakaouser@example.com'),{email_available:false});
assert.deepEqual(await check(null,'bad-email'),{code:'invalid_input'});
for(let i=3;i<30;i++) await check('new-id',null);
assert.deepEqual(await check('new-id',null),{code:'over_request_rate_limit'});
await db.close();
console.log('PASS duplicate email/ID, case normalization, single-field checks, input validation, browser-role denial and rate limit');
