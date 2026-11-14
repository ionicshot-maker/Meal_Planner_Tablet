// Tests for the one-time migration tools: the pg_dump converter, the backup comparison, the browser export snippet, and (end to
// end, over real HTTP) the import and verify-join command-line tools.
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
// @ts-expect-error plain .mjs without types
import { dumpToBackup, parseCopyBlocks, readDumpText, unescapeCopy } from '../scripts/lib/pgdump.mjs';
import { compareBackups, formatComparison } from '../scripts/lib/compare.ts';
import { getRawDB } from '../../src/db/schema.ts';
import { makeServer, setupOwner, PW } from './helpers.js';
import { ingredient, recipe } from './clientHarness.ts';

const serverDir = path.resolve(import.meta.dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mp-tools-'));

// ============================================================ pg_dump parsing
test('COPY text escaping is undone exactly (tabs, newlines, backslashes, quotes, octal/hex)', () => {
  assert.equal(unescapeCopy('plain'), 'plain');
  assert.equal(unescapeCopy('a\\tb\\nc\\\\d'), 'a\tb\nc\\d');
  assert.equal(unescapeCopy('\\"quoted\\"'), '"quoted"');
  assert.equal(unescapeCopy('\\x41\\101'), 'AA');
  assert.equal(unescapeCopy('bell\\b'), 'bell\b');
  // what a jsonb value containing a newline looks like in a dump: the JSON escape (\n) is itself backslash-escaped
  assert.equal(JSON.parse(unescapeCopy('{"note":"line1\\\\nline2"}')).note, 'line1\nline2');
});

const dump = (rows: { ingredients?: string[][]; recipes?: string[][]; settings?: string[][]; households?: string[][] } = {}) => `--
-- PostgreSQL database dump
--
SET statement_timeout = 0;

COPY auth.users (id, email, encrypted_password) FROM stdin;
u1\tsomeone@example.com\t$2a$10$secrethashsecrethashsecrethash
\\.

COPY public.households (id, code, name, created_by) FROM stdin;
${(rows.households ?? [['h1', 'Angelo-family-2026', 'Angelo', 'u1']]).map((r) => r.join('\t')).join('\n')}
\\.

COPY public.ingredients (id, household_code, data, updated_at) FROM stdin;
${(rows.ingredients ?? []).map((r) => r.join('\t')).join('\n')}
\\.

COPY public.recipes (id, household_code, data, updated_at) FROM stdin;
${(rows.recipes ?? []).map((r) => r.join('\t')).join('\n')}
\\.

COPY public.sync_settings (id, household_code, data, updated_at) FROM stdin;
${(rows.settings ?? []).map((r) => r.join('\t')).join('\n')}
\\.
`;
const ing = (id: string, code: string, extra: Record<string, unknown> = {}, ts = '2026-11-01 10:00:00+00') =>
  [id, code, JSON.stringify({ id, name: `Ingredient ${id}`, variants: [], ...extra }).replace(/\\/g, '\\\\'), ts];

test('the converter reads the data tables, ignores everything else, and never touches accounts', () => {
  const text = dump({
    ingredients: [ing('i1', 'Angelo-family-2026'), ing('i2', 'angelo-family-2026', { updatedAt: '2026-10-01T00:00:00.000Z' }), ing('x1', 'Someone-else-9')],
    recipes: [['r1', 'angelo-family-2026', JSON.stringify({ id: 'r1', name: 'Soup', notes: 'line1\nline2\ttab \\ back' }).replace(/\\/g, '\\\\'), '2026-11-02 08:00:00+00']],
    settings: [['singleton', 'angelo-family-2026', JSON.stringify({ householdName: 'Angelo Family', aiProvider: 'gemini' }), '2026-11-03 09:00:00+00']],
  });
  const { backup, report } = dumpToBackup(text, { code: 'Angelo-Family-2026' });
  assert.deepEqual((backup.ingredients as { id: string }[]).map((i) => i.id), ['i1', 'i2'], 'case-insensitive household match; other household left out');
  assert.equal((backup.ingredients as { updatedAt: string }[])[0].updatedAt, '2026-11-01T10:00:00.000Z', 'the row timestamp fills a missing updatedAt');
  assert.equal((backup.ingredients as { updatedAt: string }[])[1].updatedAt, '2026-10-01T00:00:00.000Z', 'a record\'s own updatedAt wins');
  assert.equal((backup.recipes as { notes: string }[])[0].notes, 'line1\nline2\ttab \\ back');
  assert.equal((backup.settings as { householdName: string }).householdName, 'Angelo Family');
  assert.doesNotMatch(JSON.stringify(backup), /secrethash|someone@example/);
  assert.match(report.join('\n'), /left 1 from other household codes/);
  assert.equal(backup.version, 1);
});

test('the converter refuses to guess between households, and drops retired Family Share rows', () => {
  const two = dump({ ingredients: [ing('a', 'code-one'), ing('b', 'code-two')] });
  assert.throws(() => dumpToBackup(two), /2 households.*--code/);
  assert.throws(() => dumpToBackup(two, { code: 'nope' }), /No rows for household code "nope"/);
  const fam = dump({ ingredients: [ing('a', 'code-one'), ing('f', 'code-one:family')] });
  const { backup, report } = dumpToBackup(fam);
  assert.deepEqual((backup.ingredients as { id: string }[]).map((i) => i.id), ['a']);
  assert.match(report.join('\n'), /Skipped Family Share rows \(code-one:family\)/);
});

test('NULLs and unreadable rows are handled without crashing', () => {
  const text = dump({ ingredients: [ing('ok', 'c'), ['bad', 'c', '{not json', '2026-11-01 00:00:00+00'], ['nul', 'c', '\\N', '\\N']] });
  const { backup, report } = dumpToBackup(text);
  assert.deepEqual((backup.ingredients as { id: string }[]).map((i) => i.id), ['ok']);
  assert.match(report.join('\n'), /Skipped an unreadable ingredients row \(bad\)/);
});

test('both UTF-8 and the UTF-16 files the nightly PowerShell backup writes are read', () => {
  const dir = tmp();
  try {
    const text = dump({ ingredients: [ing('i1', 'c')] });
    const utf8 = path.join(dir, 'a.sql'), utf16 = path.join(dir, 'b.sql'), bom = path.join(dir, 'c.sql');
    fs.writeFileSync(utf8, text);
    fs.writeFileSync(utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]));
    fs.writeFileSync(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]));
    for (const f of [utf8, utf16, bom]) assert.equal(parseCopyBlocks(readDumpText(f)).find((b: { table: string }) => b.table === 'ingredients').rows.length, 1, f);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ============================================================ comparison
test('comparing backups: identical, missing, extra and changed records are told apart; timestamps and secrets are not differences', () => {
  const a = {
    ingredients: [ingredient('i1', 'Butter', { updatedAt: '2026-01-01T00:00:00.000Z' }), ingredient('i2', 'Flour'), ingredient('i3', 'Sugar')],
    mealPlanDays: [{ date: '2026-11-14', meals: [], updatedAt: 'x' }],
    settings: { householdName: 'A', fontSizePt: 14, geminiApiKey: 'SECRET', updatedAt: 't1' },
    macroLogs: [{ id: 'm1' }],
  };
  const b = {
    ingredients: [ingredient('i1', 'Butter', { updatedAt: '2030-01-01T00:00:00.000Z' }), ingredient('i2', 'Flour', { name: 'Flour (changed)' }), ingredient('i4', 'Salt')],
    mealPlanDays: [{ date: '2026-11-14', meals: [], updatedAt: 'y' }],
    settings: { householdName: 'A', fontSizePt: 22, geminiApiKey: 'DIFFERENT', updatedAt: 't2' },
  };
  const c = compareBackups(a, b);
  const ing = c.stores.find((s) => s.store === 'ingredients')!;
  assert.deepEqual([ing.a, ing.b, ing.onlyA, ing.onlyB, ing.changed], [3, 3, ['i3'], ['i4'], ['i2']]);
  assert.equal(c.stores.find((s) => s.store === 'mealPlanDays')!.changed.length, 0);
  assert.equal(c.stores.find((s) => s.store === 'settings')!.changed.length, 0, 'device-local settings are not compared');
  assert.deepEqual(c.notSynced, { macroLogs: [1, 0] });
  assert.equal(c.identical, false);
  assert.match(formatComparison(c, 'file', 'device'), /ingredients\s+3\s+3\s+1 only in file, 1 only in device, 1 differ/);
  assert.equal(compareBackups(a, a).identical, true);
});

// ============================================================ the browser export snippet
const snippetSource = fs.readFileSync(path.resolve(serverDir, '../deploy/export-live-data.js'), 'utf8');

async function runSnippet(opts: { dbName?: string } = {}) {
  const saved: { name: string; text: Promise<string> }[] = [];
  const logs: string[] = [];
  const ctx = vm.createContext({
    indexedDB, Blob, JSON, Date, Array, Object, Promise, Error, Math,
    URL: { createObjectURL: (b: Blob) => { (ctx as any).__last = b; return 'blob:x'; } },
    document: {
      body: { appendChild() {} },
      createElement: () => ({ click() { saved.push({ name: (this as any).download, text: ((ctx as any).__last as Blob).text() }); }, remove() {}, set href(_v: string) {}, set download(v: string) { (this as any)._d = v; }, get download() { return (this as any)._d; } }),
    },
    console: { log: (...a: unknown[]) => logs.push(a.join(' ')), warn: (...a: unknown[]) => logs.push(`WARN ${a.join(' ')}`), error: (...a: unknown[]) => logs.push(`ERROR ${a.join(' ')}`), table: (o: unknown) => logs.push(`TABLE ${JSON.stringify(o)}`) },
  });
  if (opts.dbName) {
    vm.runInContext(snippetSource.slice(0, snippetSource.indexOf('(async () => {')), ctx);
    return { result: await vm.runInContext(`mealPlannerExport(${JSON.stringify(opts.dbName)})`, ctx), saved, logs };
  }
  vm.runInContext(snippetSource, ctx);
  for (let i = 0; i < 50 && saved.length === 0 && !logs.some((l) => l.startsWith('ERROR')); i++) await new Promise((r) => setTimeout(r, 20));
  return { saved, logs, result: null };
}

async function seedAppDb() {
  const db = (await getRawDB()) as any;
  for (const s of Array.from(db.objectStoreNames) as string[]) await db.clear(s);
  for (let i = 0; i < 25; i++) await db.put('ingredients', ingredient(`i${i}`, `Ingredient ${i}`, { updatedAt: `2026-10-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` }));
  for (let i = 0; i < 5; i++) await db.put('recipes', recipe(`r${i}`, `Recipe ${i}`, { updatedAt: '2026-10-05T00:00:00.000Z', ingredients: [{ ingredientId: `i${i}`, quantity: 1 }], notes: 'two\nlines\tand a tab' }));
  await db.put('mealPlanDays', { date: '2026-11-14', meals: { dinner: [{ recipeId: 'r1' }] }, updatedAt: '2026-11-01T00:00:00.000Z' });
  await db.put('groceryLists', { id: 'g1', name: 'Weekly', generatedAt: '2026-11-01T00:00:00.000Z', items: [], manualItems: [], remainderItems: [], updatedAt: '2026-11-01T00:00:00.000Z' });
  await db.put('householdItems', { id: 'h1', name: 'Soap', updatedAt: '2026-11-01T00:00:00.000Z' });
  await db.put('collections', { id: 'c1', name: 'Weeknights', recipeIds: ['r1', 'r2'], updatedAt: '2026-11-01T00:00:00.000Z' });
  await db.put('references', { id: 'x1', title: 'Oven temps', photo: 'A'.repeat(50_000), updatedAt: '2026-11-01T00:00:00.000Z' });
  await db.put('mealPlanTemplates', { id: 't1', name: 'Week A', days: [] });
  await db.put('macroLogs', { id: 'm1', date: '2026-11-13', personId: 'p1', calories: 500 });
  await db.put('processedReceipts', { id: 'pr1' });
  await db.put('settings', {
    householdName: 'Angelo Family', unitSystem: 'imperial', fontSizePt: 18, geminiApiKey: 'AIza-SECRET', usdaApiKey: 'USDA-SECRET',
    ai: { provider: 'gemini', apiKey: 'AI-SECRET' }, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'ANON-SECRET', householdSyncCode: 'angelo-family-2026',
    familyShareCode: 'fam', stores: ['Aldi'], people: [], updatedAt: '2026-11-02T00:00:00.000Z',
  } as never, 'app');
}

test('the browser snippet saves every store (collections and kitchen references included) without keys, and writes nothing', async () => {
  await seedAppDb();
  const before = JSON.stringify(await Promise.all(['ingredients', 'recipes', 'settings'].map(async (s) => (await ((await getRawDB()) as any).getAll(s)))));
  const { saved, logs } = await runSnippet();
  assert.equal(saved.length, 1, logs.join('\n'));
  assert.match(saved[0].name, /^meal-planner-live-export-\d{4}-\d{2}-\d{2}\.json$/);
  const text = await saved[0].text;
  const backup = JSON.parse(text);
  const counts = (k: string) => backup[k].length;
  assert.deepEqual(['ingredients', 'recipes', 'mealPlanDays', 'groceryLists', 'householdItems', 'collections', 'references', 'mealPlanTemplates', 'macroLogs', 'processedReceipts'].map(counts), [25, 5, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(backup.version, 1);
  assert.doesNotMatch(text, /AIza-SECRET|USDA-SECRET|AI-SECRET|ANON-SECRET|supabase\.co|angelo-family-2026|"fam"/);
  assert.equal(backup.settings.householdName, 'Angelo Family');
  assert.equal(backup.settings.fontSizePt, 18);
  assert.equal(backup.settings.ai.provider, 'gemini');
  assert.equal(backup.settings.ai.apiKey, '');
  assert.match(logs.join('\n'), /TABLE .*"ingredients":25/);
  const after = JSON.stringify(await Promise.all(['ingredients', 'recipes', 'settings'].map(async (s) => (await ((await getRawDB()) as any).getAll(s)))));
  assert.equal(after, before, 'read-only: the database is exactly as it was');
  const ownSettings = (await ((await getRawDB()) as any).get('settings', 'app'));
  assert.equal(ownSettings.geminiApiKey, 'AIza-SECRET', 'the app keeps its own keys');
});

test('the snippet copes with an older browser database that lacks some stores, and warns about an empty one', async () => {
  const name = 'OldMealPlannerDB';
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(name, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('ingredients', { keyPath: 'id' }).put({ id: 'o1', name: 'Old' });
      db.createObjectStore('recipes', { keyPath: 'id' });
      db.createObjectStore('settings');
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
  const { result } = await runSnippet({ dbName: name });
  assert.deepEqual(JSON.parse(JSON.stringify(result.counts)), { ingredients: 1, recipes: 0 }); // (vm objects have another realm's prototype)
  assert.ok(result.missing.includes('collections') && result.missing.includes('references'));
  assert.equal(result.backup.settings, undefined);
});

// ============================================================ end to end: snippet -> real CLI import -> real CLI verify-join
function runTool(script: string, args: string[], env: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--env-file=test/tsx.env', '--import', 'tsx', `scripts/${script}`, ...args], { cwd: serverDir, env: { ...process.env, ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${script} timed out\n${stdout}\n${stderr}`)); }, 90_000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}

test('the whole move, over real HTTP: export from the browser database, import with the CLI, a new device joins, nothing differs', async () => {
  await seedAppDb();
  const { saved } = await runSnippet();
  const dir = tmp();
  const { app } = makeServer();
  try {
    const file = path.join(dir, 'export.json');
    fs.writeFileSync(file, await saved[0].text);
    await setupOwner(app);
    await app.listen({ host: '127.0.0.1', port: 0 });
    const url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const env = { MP_PASSWORD: PW };

    const imp = await runTool('import-backup.ts', ['--url', url, '--user', 'michael', '--file', file], env);
    assert.equal(imp.status, 0, imp.stdout + imp.stderr);
    assert.match(imp.stdout, /ingredients\s+file 25\s+server 25/);
    assert.match(imp.stdout, /collections\s+file 1\s+server 1/);
    assert.match(imp.stdout, /references\s+file 1\s+server 1/);
    assert.match(imp.stdout, /Counts match/);

    const again = await runTool('import-backup.ts', ['--url', url, '--user', 'michael', '--file', file], env);
    assert.equal(again.status, 1, 'importing a second time over existing data is refused');
    assert.match(again.stderr, /already holds data/);

    const ver = await runTool('verify-join.ts', ['--url', url, '--user', 'michael', '--file', file], env);
    assert.equal(ver.status, 0, ver.stdout + ver.stderr);
    assert.match(ver.stdout, /VERIFIED: a new device receives exactly the data in the file/);
    assert.match(ver.stdout, /IDENTICAL/);
    assert.doesNotMatch(ver.stdout + ver.stderr, /SECRET/);

    // the verification has teeth: a file with one record the server does not hold fails
    const tampered = JSON.parse(fs.readFileSync(file, 'utf8'));
    tampered.recipes.push(recipe('ghost', 'Never imported', { updatedAt: '2026-11-01T00:00:00.000Z' }));
    const tamperedFile = path.join(dir, 'tampered.json');
    fs.writeFileSync(tamperedFile, JSON.stringify(tampered));
    const bad = await runTool('verify-join.ts', ['--url', url, '--user', 'michael', '--file', tamperedFile], env);
    assert.equal(bad.status, 3, bad.stdout);
    assert.match(bad.stdout, /1 only in file/);
    assert.match(bad.stderr, /VERIFICATION FAILED/);
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('settings subset rule: extra defaults on a device are fine, but a shared setting that differs or is missing is caught', () => {
  const file = { settings: { householdName: 'A', stores: ['Aldi'], updatedAt: 't' } };
  const withDefaults = { settings: { householdName: 'A', stores: ['Aldi'], brands: [], people: [], updatedAt: 'u' } };
  assert.equal(compareBackups(file, withDefaults).identical, false, 'strict comparison sees the extra keys');
  assert.equal(compareBackups(file, withDefaults, { settingsSubset: true }).identical, true);
  assert.equal(compareBackups(file, { settings: { householdName: 'B', stores: ['Aldi'] } }, { settingsSubset: true }).identical, false);
  assert.equal(compareBackups(file, { settings: { householdName: 'A' } }, { settingsSubset: true }).identical, false, 'a shared setting present in the file but missing on the device');
});

test('the CLI tools refuse bad input clearly', async () => {
  const dir = tmp();
  try {
    const f = path.join(dir, 'x.json');
    fs.writeFileSync(f, '{}');
    const noUrl = await runTool('import-backup.ts', ['--user', 'u', '--file', f], { MP_PASSWORD: 'x' });
    assert.notEqual(noUrl.status, 0);
    assert.match(noUrl.stderr, /--url is required/);
    const a = path.join(dir, 'a.json'), b = path.join(dir, 'b.json');
    fs.writeFileSync(a, JSON.stringify({ ingredients: [ingredient('i1', 'A')] }));
    fs.writeFileSync(b, JSON.stringify({ ingredients: [ingredient('i1', 'A')] }));
    assert.equal((await runTool('compare-exports.ts', ['--a', a, '--b', b], {})).status, 0);
    fs.writeFileSync(b, JSON.stringify({ ingredients: [ingredient('i2', 'B')] }));
    const diff = await runTool('compare-exports.ts', ['--a', a, '--b', b], {});
    assert.equal(diff.status, 1);
    assert.match(diff.stdout, /DIFFERENT/);
    const conv = spawnSync(process.execPath, ['scripts/from-pgdump.mjs', '--in', path.join(dir, 'missing.sql'), '--out', path.join(dir, 'o.json')], { cwd: serverDir, encoding: 'utf8' });
    assert.notEqual(conv.status, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
