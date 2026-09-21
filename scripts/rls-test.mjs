// Runs the project's REAL migrations in an in-process Postgres (PGlite) and tests the family-permission
// rules: what each user can read and write, enforced by row level security. Run: npm run test:rls
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const MIG = fileURLToPath(new URL('../supabase/migrations', import.meta.url))
const db = new PGlite()

// ---- stand-ins for what Supabase provides -------------------------------------
await db.exec(`
  create schema auth; create schema storage;
  create role anon nologin; create role authenticated nologin;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id serial primary key, bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/') $$;
  grant usage on schema auth, storage, public to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
`)

const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  try { await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8')) }
  catch (e) { console.error('MIGRATION FAILED', f, e.message); process.exit(1) }
}
console.log(`ran ${files.length} migrations OK (incl. ${files.at(-1)})`)
// run 0015 a second time: it must be safe to re-run
await db.exec(fs.readFileSync(path.join(MIG, files.at(-1)), 'utf8'))
console.log('re-running 0015 is safe (idempotent)')

const OWNER = '11111111-1111-1111-1111-111111111111'
const WIFE = '22222222-2222-2222-2222-222222222222'
const KID = '33333333-3333-3333-3333-333333333333'
const STRANGER = '44444444-4444-4444-4444-444444444444'
for (const [id, e] of [[OWNER, 'owner@x'], [WIFE, 'wife@x'], [KID, 'kid@x'], [STRANGER, 'stranger@x']])
  await db.exec(`insert into auth.users values ('${id}','${e}')`)

/** Run SQL as a signed-in user (RLS applies), or as the table owner when uid is null. */
async function as(uid, sql, params) {
  if (uid === null) return db.query(sql, params)
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}', false)`)
  try { return await db.query(sql, params) } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub','', false)`) }
}
const tryAs = async (uid, sql) => { try { return { ok: true, res: await as(uid, sql) } } catch (e) { return { ok: false, err: e.message } } }

let n = 0
const test = async (name, fn) => { try { await fn(); n++; console.log('  ok  ', name) } catch (e) { console.error('  FAIL', name, '\n      ', e.message); process.exitCode = 1 } }

// ---- data, created by the owner (through RLS) ------------------------------------
await as(OWNER, `insert into accounts (id,user_id,name,type,balance) values
  ('acc-me',$1,'FAB Thomas','bank',100),('acc-wife',$1,'FAB Wife','bank',200),('acc-joint',$1,'Joint','bank',300)`, [OWNER])
await as(OWNER, `insert into transactions (id,user_id,type,date,description,category,account_id,amount) values
  ('t-me',$1,'expense','2026-09-01','Mine','Food','acc-me',10),
  ('t-wife',$1,'expense','2026-09-01','Hers','Food','acc-wife',20),
  ('t-joint',$1,'expense','2026-09-01','Joint','Food','acc-joint',30)`, [OWNER])
await as(OWNER, `insert into loans (id,user_id,name,lender,outstanding,principal,emi,next_payment) values ('l1',$1,'Car','FAB',1,1,1,'2026-10-01')`, [OWNER])
await as(OWNER, `insert into assets (id,user_id,name,category,current_value) values ('as1',$1,'Flat','Property',100)`, [OWNER])
await as(OWNER, `insert into transfers (id,user_id,date,from_account_id,to_kind,to_id,amount) values
  ('tr-ok',$1,'2026-09-02','acc-wife','account','acc-joint',5),('tr-bad',$1,'2026-09-02','acc-me','account','acc-joint',6)`, [OWNER])
await as(OWNER, `insert into settings (user_id,user_name) values ($1,'Thomas')`, [OWNER])

// wife: may see transactions + shopping, only for her account and the joint one, and may edit.
// kid: view-only, transactions only, only their own (none) — plus an inactive stranger member.
await db.exec(`
  insert into household_members (owner_id,member_id,name,email,active,can_edit,sections,account_ids) values
   ('${OWNER}','${WIFE}','Wife','wife@x',true,true,array['transactions','shopping','accounts'],array['acc-wife','acc-joint']),
   ('${OWNER}','${KID}','Kid','kid@x',true,false,array['transactions'],null),
   ('${OWNER}','${STRANGER}','Off','off@x',false,true,array['*'],null);
`)

console.log('\nRow level security')
await test('the owner sees all of their own rows', async () => {
  assert.equal((await as(OWNER, `select count(*)::int c from transactions`)).rows[0].c, 3)
})
await test('a stranger (not in the household) sees nothing', async () => {
  const stranger = '99999999-9999-9999-9999-999999999999'
  await db.exec(`insert into auth.users values ('${stranger}','s@x')`)
  assert.equal((await as(stranger, `select count(*)::int c from transactions`)).rows[0].c, 0)
  assert.equal((await as(stranger, `select count(*)::int c from accounts`)).rows[0].c, 0)
})
await test('wife sees only transactions on HER account and the joint one', async () => {
  const r = await as(WIFE, `select id from transactions order by id`)
  assert.deepEqual(r.rows.map((x) => x.id), ['t-joint', 't-wife'])
})
await test('wife sees only her permitted accounts', async () => {
  const r = await as(WIFE, `select id from accounts order by id`)
  assert.deepEqual(r.rows.map((x) => x.id), ['acc-joint', 'acc-wife'])
})
await test('wife cannot read sections she was not given (loans, assets)', async () => {
  assert.equal((await as(WIFE, `select count(*)::int c from loans`)).rows[0].c, 0)
  assert.equal((await as(WIFE, `select count(*)::int c from assets`)).rows[0].c, 0)
})
await test('wife sees a transfer only if both of its accounts are hers to see', async () => {
  const r = await as(WIFE, `select id from transfers order by id`)
  assert.deepEqual(r.rows.map((x) => x.id), ['tr-ok'])
})
await test('wife CAN add a transaction to her own account, stamped with the owner', async () => {
  const r = await tryAs(WIFE, `insert into transactions (id,user_id,type,date,description,category,account_id,amount) values ('t-new','${OWNER}','expense','2026-09-03','Grocery','Food','acc-wife',7)`)
  assert.ok(r.ok, r.err)
})
await test('wife CANNOT write to an account she was not given', async () => {
  const r = await tryAs(WIFE, `insert into transactions (id,user_id,type,date,description,category,account_id,amount) values ('t-x','${OWNER}','expense','2026-09-03','Sneaky','Food','acc-me',7)`)
  assert.equal(r.ok, false)
})
await test('wife CANNOT write into a section she was not given (loans)', async () => {
  const r = await tryAs(WIFE, `insert into loans (id,user_id,name,lender,outstanding,principal,emi,next_payment) values ('l-x','${OWNER}','x','y',1,1,1,'2026-10-01')`)
  assert.equal(r.ok, false)
})
await test('wife CANNOT change or delete the owner\'s data outside her scope', async () => {
  await as(WIFE, `update transactions set amount = 999 where id = 't-me'`)
  await as(WIFE, `delete from transactions where id = 't-me'`)
  assert.equal((await as(OWNER, `select amount::int a from transactions where id='t-me'`)).rows[0].a, 10)
})
await test('wife CANNOT impersonate: writing rows under her own user id gives her no access to the owner\'s data', async () => {
  const r = await tryAs(WIFE, `insert into transactions (id,user_id,type,date,description,category,account_id,amount) values ('t-own','${WIFE}','expense','2026-09-03','Own','Food','acc-wife',1)`)
  assert.ok(r.ok) // allowed: it is her own row in her own space…
  assert.equal((await as(OWNER, `select count(*)::int c from transactions where id='t-own'`)).rows[0].c, 0) // …and the owner never sees it
})
await test('a view-only member can read but not write', async () => {
  assert.equal((await as(KID, `select count(*)::int c from transactions`)).rows[0].c, 4) // all four (view-only, no account limit)
  const r = await tryAs(KID, `insert into transactions (id,user_id,type,date,description,category,account_id,amount) values ('t-k','${OWNER}','expense','2026-09-03','k','Food','acc-me',1)`)
  assert.equal(r.ok, false)
  await as(KID, `delete from transactions where id = 't-me'`)
  assert.equal((await as(OWNER, `select count(*)::int c from transactions where id='t-me'`)).rows[0].c, 1)
})
await test('an INACTIVE member sees nothing at all', async () => {
  assert.equal((await as(STRANGER, `select count(*)::int c from transactions`)).rows[0].c, 0)
  assert.equal((await as(STRANGER, `select count(*)::int c from accounts`)).rows[0].c, 0)
})
await test('members cannot change the household settings, only read them', async () => {
  assert.equal((await as(WIFE, `select count(*)::int c from settings`)).rows[0].c, 1)
  await as(WIFE, `update settings set user_name = 'Hacked' where user_id = '${OWNER}'`)
  assert.equal((await as(OWNER, `select user_name from settings`)).rows[0].user_name, 'Thomas')
})
await test('a member cannot grant themselves more access', async () => {
  await as(WIFE, `update household_members set sections = array['*'], account_ids = null where member_id = '${WIFE}'`)
  const r = await db.query(`select sections, account_ids from household_members where member_id = '${WIFE}'`)
  assert.deepEqual(r.rows[0].sections, ['transactions', 'shopping', 'accounts'])
  const ins = await tryAs(WIFE, `insert into household_members (owner_id,member_id,name,email,sections) values ('${OWNER}','${WIFE}','x','y',array['*'])`)
  assert.equal(ins.ok, false)
})
await test('a member can read only their own membership row', async () => {
  const r = await as(WIFE, `select member_id from household_members`)
  assert.deepEqual(r.rows.map((x) => x.member_id), [WIFE])
})
await test('the owner can list and manage all members', async () => {
  assert.equal((await as(OWNER, `select count(*)::int c from household_members`)).rows[0].c, 3)
})

console.log('\nFile storage')
await db.exec(`insert into storage.objects (bucket_id,name) values
  ('cloudbasket','${OWNER}/documents/visa.pdf'),('cloudbasket','${STRANGER}/documents/other.pdf')`)
await test('the owner can read files in their own folder only', async () => {
  const r = await as(OWNER, `select name from storage.objects order by name`)
  assert.deepEqual(r.rows.map((x) => x.name), [`${OWNER}/documents/visa.pdf`])
})
await test('a member WITHOUT the documents section cannot read the owner\'s files', async () => {
  assert.equal((await as(WIFE, `select count(*)::int c from storage.objects`)).rows[0].c, 0)
})
await test('a member WITH the documents section can', async () => {
  await db.exec(`update household_members set sections = array['transactions','documents'] where member_id = '${KID}'`)
  assert.equal((await as(KID, `select count(*)::int c from storage.objects`)).rows[0].c, 1)
})
await test('a view-only member cannot upload', async () => {
  const r = await tryAs(KID, `insert into storage.objects (bucket_id,name) values ('cloudbasket','${OWNER}/documents/x.pdf')`)
  assert.equal(r.ok, false)
})
await test('nobody can upload into a stranger\'s folder', async () => {
  const r = await tryAs(OWNER, `insert into storage.objects (bucket_id,name) values ('cloudbasket','${STRANGER}/documents/x.pdf')`)
  assert.equal(r.ok, false)
})

console.log('\nPublic site config')
await as(OWNER, `insert into site_config (user_id, seo, analytics) values ($1,'{"siteName":"X"}','{"ga4":"G-TEST12345"}')`, [OWNER])
await test('anonymous visitors can read the public config but nothing else', async () => {
  await db.exec(`set role anon`)
  try {
    assert.equal((await db.query(`select count(*)::int c from site_config`)).rows[0].c, 1)
    let denied = false
    try { await db.query(`select * from transactions`) } catch { denied = true }
    assert.ok(denied, 'anon must not read transactions')
  } finally { await db.exec(`reset role`) }
})
await test('only the owner can change site config', async () => {
  await as(WIFE, `update site_config set seo = '{"siteName":"Hacked"}'`)
  assert.equal((await db.query(`select seo->>'siteName' s from site_config`)).rows[0].s, 'X')
})

console.log(`\n${n} passed${process.exitCode ? ', some FAILED' : ''}`)
