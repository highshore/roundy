import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema roundy_private;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb);`);
await db.exec(await readFile('supabase/migrations/20260928035447_username_signin.sql','utf8'));
await db.query(`insert into auth.users values('11111111-1111-4111-8111-111111111111','{"username":"Review_User"}')`);
assert.equal((await db.query('select username from public.account_usernames')).rows[0].username,'review_user');
await assert.rejects(db.query(`insert into auth.users values('22222222-2222-4222-8222-222222222222','{"username":"REVIEW_USER"}')`),/unique/);
await assert.rejects(db.query(`insert into auth.users values('22222222-2222-4222-8222-222222222222','{"username":"x@evil"}')`),/Invalid username/);
await db.query(`update auth.users set raw_user_meta_data='{"username":"stolen_alias"}'`);
assert.equal((await db.query('select username from public.account_usernames')).rows[0].username,'review_user');
for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`);
 await assert.rejects(db.query('select * from public.account_usernames'),/permission denied/);
 await assert.rejects(db.query("select public.consume_username_login_attempt(repeat('a',64),10)"),/permission denied/);
 await db.exec('reset role');
}
await db.exec('set role service_role');
for(let n=1;n<=11;n++)assert.equal((await db.query("select public.consume_username_login_attempt(repeat('a',64),10) as allowed")).rows[0].allowed,n<=10);
await db.exec('reset role');
await db.query("update public.username_login_attempts set expires_at=now()-interval '1 second'");
await db.exec('set role service_role');
assert.equal((await db.query("select public.consume_username_login_attempt(repeat('a',64),10) as allowed")).rows[0].allowed,true);
await db.close();
console.log('PASS: username uniqueness, validation, metadata immutability, lookup privacy, throttling and expiry');
