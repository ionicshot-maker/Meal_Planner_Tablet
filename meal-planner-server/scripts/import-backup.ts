// One-time bootstrap: put an exported backup of the household's data onto a Meal Planner server.
//
//   node --env-file=test/tsx.env --import tsx scripts/import-backup.ts --url http://localhost:19793 --user michael --file export.json
//
// The account must be an OWNER. The server refuses to import over data it already holds (add --allow-non-empty to override), and
// secrets in the settings are stripped by the server whatever the file contains. Afterwards the tool asks the server for its own
// per-table counts and checks them against the file, so a silent short import cannot go unnoticed.
import fs from 'node:fs';
import { getPassword, login, need, parseArgs } from './lib/cli.ts';
import { compareBackups } from './lib/compare.ts';
import { SYNC_TABLES } from '../../src/sync/records.ts';

const args = parseArgs(process.argv.slice(2), ['allow-non-empty']);
const url = need(args, 'url').replace(/\/+$/, '');
const user = need(args, 'user');
const file = need(args, 'file');
const backup = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

const expected: Record<string, number> = {};
for (const t of SYNC_TABLES) {
  const raw = backup[t];
  const n = t === 'settings' ? (raw ? 1 : 0) : Array.isArray(raw) ? raw.length : 0;
  if (n) expected[t] = n;
}
console.log(`File: ${file}\n  will import: ${Object.entries(expected).map(([t, n]) => `${n} ${t}`).join(', ') || '(nothing!)'}`);

const token = await login(url, user, await getPassword(user));
const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const res = await fetch(`${url}/api/admin/import${args['allow-non-empty'] ? '?allowNonEmpty=true' : ''}`, { method: 'POST', headers: auth, body: JSON.stringify(backup) });
const body = (await res.json()) as { tables?: Record<string, number>; total?: number; rev?: number; error?: string };
if (!res.ok) { console.error(`Import refused (HTTP ${res.status}): ${body.error}`); process.exit(1); }
console.log(`Server accepted ${body.total} records (now at revision ${body.rev}).`);

const stats = (await (await fetch(`${url}/api/admin/stats`, { headers: auth })).json()) as { tables: Record<string, { live: number; deleted: number }> };
let ok = true;
for (const [t, n] of Object.entries(expected)) {
  const live = stats.tables[t]?.live ?? 0;
  const line = `  ${t.padEnd(16)} file ${String(n).padEnd(6)} server ${live}`;
  if (live < n) { ok = false; console.error(`${line}   <-- SHORT`); } else console.log(line);
}
if (!ok) { console.error('The server holds fewer records than the file. Do not go on until this is understood.'); process.exit(2); }
console.log('Counts match. Next: scripts/verify-join.ts proves a device joining the household ends up with exactly this data.');
