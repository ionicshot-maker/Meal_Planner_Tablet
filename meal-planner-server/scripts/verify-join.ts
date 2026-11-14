// "Did anything get lost?" -- the end-to-end check. A brand-new, empty device joins the household exactly the way a tablet would
// (the real sync engine, the real API client, over real HTTP), and what it ends up holding is compared record by record with the
// file that was imported. Nothing on the server is changed: this only reads.
//
//   node --env-file=test/tsx.env --import tsx scripts/verify-join.ts --url http://localhost:19793 --user michael --file export.json
import fs from 'node:fs';
import { ServerApi } from '../../src/sync/api.ts';
import { SyncEngine } from '../../src/sync/engine.ts';
import { StoreCore } from '../../src/sync/storeCore.ts';
import { SYNC_TABLES, type LocalRec } from '../../src/sync/records.ts';
import { MemoryBacking, DEFAULT_SETTINGS } from '../test/memoryBacking.ts';
import { getPassword, need, parseArgs } from './lib/cli.ts';
import { compareBackups, formatComparison } from './lib/compare.ts';

const args = parseArgs(process.argv.slice(2));
const url = need(args, 'url').replace(/\/+$/, '');
const user = need(args, 'user');
const file = need(args, 'file');
const expected = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

let token: string | null = null;
const api = new ServerApi('verify-join', { base: url, tokens: { get: () => token, set: (t) => { token = t; } } });
await api.login(user, await getPassword(user));

const backing = new MemoryBacking();
backing.data.get('settings')!.set('app', { ...DEFAULT_SETTINGS });
const engine = new SyncEngine(new StoreCore(backing, { defaultSettings: DEFAULT_SETTINGS }), api);

const first = await engine.syncOnce();
console.log(`First contact: ${first.status}${first.message ? ` — ${first.message}` : ''}`);
if (first.status !== 'needs-adopt' && first.status !== 'ok') { console.error('Unexpected result; stopping.'); process.exit(1); }
const joined = first.status === 'needs-adopt' ? await engine.adoptServerData() : first;
console.log(`Joined: ${joined.status}; ${joined.pulled} records received.`);
if (joined.status !== 'ok') { console.error(joined.message); process.exit(1); }

const held = await backing.listHeld();
const quiet = await engine.syncOnce();
console.log(`A second cycle changes nothing: pushed ${quiet.pushed}, pulled ${quiet.pulled}, held ${quiet.held}.`);

const got: Record<string, unknown> = {};
for (const t of SYNC_TABLES) {
  const rows = [...backing.data.get(t)!.values()] as LocalRec[];
  if (t === 'settings') { if (rows[0]) got.settings = rows[0]; } else got[t] = rows;
}
const cmp = compareBackups(expected, got, { settingsSubset: true });
console.log('\n' + formatComparison(cmp, 'file', 'device'));
if (held.length) console.log(`\n${held.length} record(s) were held as same-name duplicates (expected only if the file itself contains two records with one name).`);
const problems = !cmp.identical || quiet.pushed > 0 || quiet.pulled > 0 || joined.rejected.length > 0;
if (problems) { console.error('\nVERIFICATION FAILED.'); process.exit(3); }
console.log('\nVERIFIED: a new device receives exactly the data in the file.');
