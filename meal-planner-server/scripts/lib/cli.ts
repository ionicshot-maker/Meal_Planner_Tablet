// Tiny helpers shared by the command-line tools in this folder.

export function parseArgs(argv: string[], flags: string[] = []): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`);
    const key = a.slice(2);
    if (flags.includes(key)) { out[key] = true; continue; }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} needs a value`);
    out[key] = value;
  }
  return out;
}

export function need(args: Record<string, string | true>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v) throw new Error(`--${key} is required`);
  return v;
}

/** The password for the account the tool signs in as: from MP_PASSWORD if set, otherwise typed at a prompt that does not echo.
 * (Never taken from the command line, so it does not end up in shell history or a process list.) */
export async function getPassword(user: string): Promise<string> {
  if (process.env.MP_PASSWORD) return process.env.MP_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('No password: set MP_PASSWORD, or run this in a terminal so it can ask.');
  process.stdout.write(`Password for ${user}: `);
  return new Promise((resolve) => {
    let pw = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); resolve(pw); return; }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') pw = pw.slice(0, -1); else pw += c;
      }
    };
    process.stdin.on('data', onData);
  });
}

/** Signs in and returns the session token. */
export async function login(baseUrl: string, username: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  const body = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(`Sign-in failed: ${body.error ?? res.status}`);
  return body.token;
}
