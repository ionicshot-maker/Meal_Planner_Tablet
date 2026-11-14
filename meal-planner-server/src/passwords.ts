import crypto from 'node:crypto';

// scrypt from node:crypto: no native add-on to build on Windows. Format: scrypt$N$r$p$saltB64$hashB64
const N = 1 << 15, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

const scrypt = (pw: string, salt: Buffer, n = N, r = R, p = P) =>
  new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(pw.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? reject(e) : resolve(k))));

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(pw, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Burned on unknown usernames so "no such user" and "wrong password" take the same time. */
export const DUMMY_HASH = await hashPassword('not-a-real-password');

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Password is required.';
  if (pw.length < 10) return 'Use at least 10 characters (a few words strung together works well).';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}
