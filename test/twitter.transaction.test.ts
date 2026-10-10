import { afterEach, expect, test, vi } from 'vitest';
import { ClientTransaction } from '@fxembed/atmosphere/providers/twitter/proxy/transaction/transaction';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const base = 'https://abs.twimg.com/x-web/x-web/';
const entry = `${base}entry-client-logged-out-fixture.js`;
const row = '64 64 64 128 128 128 64 64 64 64 64';
const path = `M00000000${Array.from({ length: 16 }, () => row).join('C')}`;
const home = `<meta name="twitter-site-verification" content="${btoa(String.fromCharCode(...Array(48).fill(1)))}">
  <script type="module" src="${entry}"></script>
  ${Array.from({ length: 4 }, (_, i) => `<svg id="loading-x-anim-${i}"><g><path/><path d="${path}"/></g></svg>`).join('')}`;

test.each([
  ['transaction plugin', 'client-transaction-id-plugin-fixture.js'],
  ['legacy sentry module', 'sentry-filter-fixture.js']
])('loads signing indices through the %s without account cookies', async (_, moduleName) => {
  const resources: Record<string, string> = {
    'https://x.com/home': home,
    [entry]: `import './assets/${moduleName}';`,
    [`${base}assets/${moduleName}`]: 'import("./sign.o-fixture.js")',
    [`${base}assets/sign.o-fixture.js`]:
      'parseInt(k[28],16); parseInt(k[0],16); parseInt(k[14],16); parseInt(k[41],16);'
  };
  const requests: Request[] = [];
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: Request) => {
      requests.push(input);
      const source = resources[input.url];
      if (source === undefined) throw new Error(`Unexpected resource: ${input.url}`);
      return new Response(source);
    })
  );
  const transaction = await ClientTransaction.create();
  const signature = await transaction.generateTransactionId(
    'GET',
    '/graphql/fixture/SearchTimeline'
  );
  expect(signature).toMatch(/^[A-Za-z0-9+/]+$/);
  expect(requests.map(request => request.url)).toEqual(Object.keys(resources));
  expect(requests.every(request => !request.headers.has('cookie'))).toBe(true);
});

test('rejects a changed signing layout instead of inventing indices', async () => {
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (input: Request) =>
        new Response(input.url === 'https://x.com/home' ? home : 'export default {};')
    )
  );
  await expect(ClientTransaction.create()).rejects.toThrow("Couldn't get on-demand file index");
});
