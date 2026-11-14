// Reads the Meal Planner tables out of a PostgreSQL `pg_dump` file (the old self-hosted Supabase database) and turns them into the
// app's native backup format -- the same JSON Settings > Data > Export writes, which POST /api/admin/import accepts.
//
// Only the eight data tables are read. Nothing else in the dump (accounts, password hashes, sessions...) is parsed or kept.
import fs from 'node:fs';

/** Reads a dump as text, whatever its encoding. Windows PowerShell 5.1 writes `> file` redirects as UTF-16LE with a BOM, which is
 * how the nightly backup script on the mini PC produces them; pg_dump run directly writes UTF-8. */
export function readDumpText(file) {
  const buf = fs.readFileSync(file);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

/** Undoes COPY text-format escaping for one field (`\N` is NULL and is handled by the caller). */
export function unescapeCopy(s) {
  if (!s.includes('\\')) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[++i];
    switch (n) {
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'n': out += '\n'; break;
      case 'r': out += '\r'; break;
      case 't': out += '\t'; break;
      case 'v': out += '\v'; break;
      case 'x': {
        const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 1));
        if (m) { out += String.fromCharCode(parseInt(m[0], 16)); i += m[0].length; } else out += 'x';
        break;
      }
      default: {
        const m = /^[0-7]{1,3}/.exec(s.slice(i));
        if (m) { out += String.fromCharCode(parseInt(m[0], 8)); i += m[0].length - 1; } else out += n ?? '';
      }
    }
  }
  return out;
}

/** Every `COPY public.<table> (cols) FROM stdin;` block as { table, columns, rows: string[][] } (NULL stays null). */
export function parseCopyBlocks(text) {
  const blocks = [];
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^COPY (?:public\.)?"?([A-Za-z0-9_]+)"? \(([^)]*)\) FROM stdin;$/.exec(lines[i]);
    if (!m || /^COPY [a-z_]+\.[a-z_]+/.test(lines[i]) && !lines[i].startsWith('COPY public.')) continue;
    const columns = m[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (i++; i < lines.length && lines[i] !== '\\.'; i++) {
      rows.push(lines[i].split('\t').map((f) => (f === '\\N' ? null : unescapeCopy(f))));
    }
    blocks.push({ table: m[1], columns, rows });
  }
  return blocks;
}

/** Postgres table -> the app's store name. */
export const TABLE_TO_STORE = {
  ingredients: 'ingredients',
  recipes: 'recipes',
  meal_plans: 'mealPlanDays',
  grocery_lists: 'groceryLists',
  household_items: 'householdItems',
  collections: 'collections',
  kitchen_references: 'references',
  sync_settings: 'settings',
};

/**
 * @param {string} text  the dump
 * @param {{ code?: string }} opts  which household_code to take when the dump holds more than one
 * @returns {{ backup: object, report: string[] }}
 */
export function dumpToBackup(text, opts = {}) {
  const report = [];
  const blocks = parseCopyBlocks(text).filter((b) => b.table in TABLE_TO_STORE && b.rows.length > 0);
  const rowsOf = (b) => b.rows.map((r) => Object.fromEntries(b.columns.map((c, i) => [c, r[i]])));

  // Household codes in play. "<code>:family" rows are the retired Family Share namespace: left behind on purpose.
  const all = blocks.flatMap((b) => rowsOf(b).map((r) => r.household_code).filter((c) => typeof c === 'string'));
  const family = [...new Set(all.filter((c) => c.endsWith(':family')))];
  const codes = [...new Set(all.filter((c) => !c.endsWith(':family')))];
  if (family.length) report.push(`Skipped Family Share rows (${family.join(', ')}): that feature is retired.`);
  let code = opts.code;
  if (!code) {
    if (codes.length > 1) throw new Error(`The dump holds ${codes.length} households (${codes.join(', ')}). Say which with --code.`);
    code = codes[0];
  } else if (!codes.some((c) => c.toLowerCase() === code.toLowerCase())) {
    throw new Error(`No rows for household code "${code}". Found: ${codes.join(', ') || '(none)'}.`);
  }
  // Household codes have drifted in case before (a real household had "Angelo-family-2026" and "angelo-family-2026" side by side).
  const same = (c) => typeof c === 'string' && code && c.toLowerCase() === code.toLowerCase();
  if (code) report.push(`Household code: ${code} (matched case-insensitively).`);

  const backup = { version: 1, scope: 'full', exportedAt: new Date().toISOString(), source: 'pg_dump' };
  for (const b of blocks) {
    const store = TABLE_TO_STORE[b.table];
    const taken = [];
    let skipped = 0;
    for (const r of rowsOf(b)) {
      if (r.household_code != null && !same(r.household_code)) { skipped++; continue; }
      let data;
      try { data = JSON.parse(r.data); } catch { report.push(`Skipped an unreadable ${b.table} row (${r.id}).`); continue; }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        // The row's own timestamp is the sync clock: keep it if the record itself carries none.
        if (!data.updatedAt && r.updated_at) data.updatedAt = new Date(r.updated_at).toISOString();
        taken.push(data);
      }
    }
    if (store === 'settings') {
      if (taken.length > 1) report.push(`Found ${taken.length} settings rows; used the newest.`);
      if (taken.length) backup.settings = taken.sort((a, c) => String(c.updatedAt).localeCompare(String(a.updatedAt)))[0];
    } else {
      backup[store] = taken;
    }
    report.push(`${store}: ${taken.length}${skipped ? ` (left ${skipped} from other household codes)` : ''}`);
  }
  return { backup, report };
}
