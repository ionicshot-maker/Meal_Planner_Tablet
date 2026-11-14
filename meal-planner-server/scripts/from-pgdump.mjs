// Converts a pg_dump of the old self-hosted Supabase database into the app's backup format (what POST /api/admin/import takes).
//
//   node scripts/from-pgdump.mjs --in mealplanner-2026-11-13_021502.sql --out export.json [--code angelo-family-2026]
//
// The dump must already be unzipped. Both UTF-8 and the UTF-16 files the nightly PowerShell backup writes are read. Only the eight
// data tables are touched; accounts, password hashes and sessions in the dump are never read.
import fs from 'node:fs';
import { dumpToBackup, readDumpText } from './lib/pgdump.mjs';

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const input = get('in'), out = get('out');
if (!input || !out) { console.error('Usage: node scripts/from-pgdump.mjs --in <dump.sql> --out <export.json> [--code <household code>]'); process.exit(2); }

const { backup, report } = dumpToBackup(readDumpText(input), { code: get('code') });
fs.writeFileSync(out, JSON.stringify(backup));
console.log(report.join('\n'));
console.log(`Wrote ${out}`);
