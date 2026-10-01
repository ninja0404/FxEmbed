import { afterEach, expect, test, vi } from 'vitest';
import { proxyTwitterRequest } from '@fxembed/atmosphere/providers/twitter/proxy/handler';
import { setTwitterProxyRuntime } from '@fxembed/atmosphere/providers/twitter-runtime';

afterEach(() => vi.unstubAllGlobals());

test('a pinned health request reports its failed session without retrying another account', async () => {
  const selection = vi.fn(() => {
    throw new Error('Unexpected account rotation');
  });
  setTwitterProxyRuntime({
    initCredentials: async () => {},
    hasBundledEncryptedCredentials: () => true,
    hasDecryptedCredentials: () => true,
    getRandomTwitterAccount: selection
  });
  const fetchSpy = vi.fn(
    async () => new Response(JSON.stringify({ errors: [{ code: 32 }] }), { status: 401 })
  );
  vi.stubGlobal('fetch', fetchSpy);
  const response = await proxyTwitterRequest(
    new Request('https://api.x.com/1.1/account/settings.json'),
    {},
    { username: 'fixture', authToken: 'fixture-token', csrfToken: 'fixture-csrf' }
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ errors: [{ code: 32 }] });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(selection).not.toHaveBeenCalled();
});

test('a pinned malformed GraphQL session fails before any upstream request', async () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  const response = await proxyTwitterRequest(
    new Request('https://api.x.com/graphql/fixture/UserByScreenName'),
    {},
    { username: 'fixture', authToken: 'fixture-token', csrfToken: '' }
  );
  expect(response.status).toBe(400);
  expect(fetchSpy).not.toHaveBeenCalled();
});
