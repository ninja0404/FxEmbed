import { readFileSync } from 'node:fs';

const name = 'FXEMBED_ENCRYPTED_CREDENTIALS';

/** Cloudflare Builds limits each secret to 5 KB; numbered fragments extend the first value. */
export function readEncryptedCredentials(env = process.env, file = 'credentials.enc.json') {
  const suffixes = Object.keys(env).filter(key => key.startsWith(`${name}_`));
  if (env[name] === undefined && suffixes.length === 0) return readFileSync(file, 'utf8');
  if (!env[name]) throw new Error(`${name}: missing or empty first fragment`);
  if (suffixes.some(key => !/^[1-9]\d*$/.test(key.slice(name.length + 1)))) {
    throw new Error(`${name}: fragment suffixes must be positive integers`);
  }
  suffixes.sort((a, b) => Number(a.slice(name.length + 1)) - Number(b.slice(name.length + 1)));
  const parts = [env[name]];
  for (let i = 0; i < suffixes.length; i++) {
    const key = `${name}_${i + 1}`;
    if (suffixes[i] !== key || !env[key]) {
      throw new Error(`${name}: missing or empty fragment ${i + 1}`);
    }
    parts.push(env[key]);
  }
  return parts.join('');
}
