// Compare two exported backups (for example: the live app's browser export vs. a pg_dump conversion, or an old export vs a new one).
//
//   node --env-file=test/tsx.env --import tsx scripts/compare-exports.ts --a live.json --b other.json
//
// Exit status 1 when they differ.
import fs from 'node:fs';
import { need, parseArgs } from './lib/cli.ts';
import { compareBackups, formatComparison } from './lib/compare.ts';

const args = parseArgs(process.argv.slice(2));
const a = need(args, 'a');
const b = need(args, 'b');
const result = compareBackups(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8')));
console.log(formatComparison(result, 'a', 'b'));
process.exit(result.identical ? 0 : 1);
