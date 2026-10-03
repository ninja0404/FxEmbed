const encoder = new TextEncoder();

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
