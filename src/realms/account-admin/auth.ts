import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const encoder = new TextEncoder();
const cookieName = 'fxembed_admin';
const lifetime = 8 * 60 * 60;

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function validAdminToken(input: string, secret: string): Promise<boolean> {
  if (input.length > 256) return false;
  const [a, b] = await Promise.all(
    [input, secret].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value)))
  );
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function issueAdminSession(c: Context, secret: string): Promise<void> {
  const payload = `${Math.floor(Date.now() / 1000) + lifetime}.${crypto.randomUUID()}`;
  const signature = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload));
  const hex = Array.from(new Uint8Array(signature), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  setCookie(c, cookieName, `${payload}.${hex}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/admin',
    maxAge: lifetime
  });
}

export async function hasAdminSession(c: Context, secret: string): Promise<boolean> {
  const value = getCookie(c, cookieName) ?? '';
  const parts = value.split('.');
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[2]))
    return false;
  const expires = Number(parts[0]);
  const now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + lifetime) return false;
  const signature = Uint8Array.from(parts[2].match(/../g) ?? [], hex => parseInt(hex, 16));
  return crypto.subtle.verify(
    'HMAC',
    await key(secret),
    signature,
    encoder.encode(`${parts[0]}.${parts[1]}`)
  );
}

export function clearAdminSession(c: Context): void {
  setCookie(c, cookieName, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/admin',
    maxAge: 0
  });
}

export function sameOrigin(c: Context): boolean {
  return c.req.header('Origin') === new URL(c.req.url).origin;
}
