import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { accountAdmin, type AccountAdminEnv } from '../src/realms/account-admin/router';
import { classifyAccountResponse } from '../src/realms/account-admin/health';

vi.mock('../src/providers/twitter/proxy/credentials', () => ({
  initCredentials: async () => {},
  getTwitterAccounts: () => [
    {
      username: 'test_account',
      authToken: 'private-test-token',
      csrfToken: 'private-test-csrf',
      source: 'import',
      bootstrapHealth: {
        status: 'session_valid',
        reason: 'identity_and_ct0_verified',
        checkedAt: '2026-10-01T17:00:00Z',
        stage: 'session'
      }
    }
  ]
}));
vi.mock('../src/realms/account-admin/health', async () => ({
  ...(await vi.importActual('../src/realms/account-admin/health')),
  checkTwitterAccount: async () => ({
    status: 'available',
    reason: 'query_verified',
    checkedAt: '2026-10-01T18:00:00Z',
    stage: 'query',
    httpStatus: 200
  })
}));

const app = new Hono<AccountAdminEnv>().route('/admin', accountAdmin);
const origin = 'https://example.test';
const records = new Map<string, unknown>();
let failWrite = false;
const env = {
  ACCOUNT_ADMIN_TOKEN: 'test-admin-secret',
  CREDENTIAL_KEY: 'test-credential-key',
  ACCOUNT_HEALTH: {
    list: async () => ({
      keys: [...records].map(([name, metadata]) => ({ name, metadata })),
      list_complete: true
    }),
    put: async (name: string, _value: string, options: { metadata: unknown }) => {
      if (failWrite) throw new Error('Storage unavailable');
      records.set(name, options.metadata);
    }
  } as unknown as KVNamespace
};
async function login() {
  return app.request(
    origin + '/admin/login',
    {
      method: 'POST',
      headers: { 'Origin': origin, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=test-admin-secret'
    },
    env
  );
}

beforeEach(() => {
  records.clear();
  failWrite = false;
});

describe('account admin access and persistence', () => {
  it('denies anonymous API access and redirects the page to login', async () => {
    const api = await app.request(origin + '/admin/api/accounts', {}, env);
    expect(api.status).toBe(401);
    expect(await api.text()).not.toContain('test_account');
    expect(api.headers.get('cache-control')).toContain('no-store');
    const page = await app.request(origin + '/admin/accounts', {}, env);
    expect(page.headers.get('location')).toBe('/admin/login');
  });
  it('fails closed without the admin secret or state storage', async () => {
    expect((await app.request(origin + '/admin/api/accounts', {}, {})).status).toBe(503);
  });
  it('preserves browser form origins on login and logout pages', async () => {
    const loginPage = await app.request(origin + '/admin/login', {}, env);
    expect(loginPage.headers.get('referrer-policy')).toBe('same-origin');
    const cookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    const dashboard = await app.request(
      origin + '/admin/accounts',
      { headers: { Cookie: cookie } },
      env
    );
    expect(dashboard.headers.get('referrer-policy')).toBe('same-origin');
    const logout = await app.request(
      origin + '/admin/logout',
      { method: 'POST', headers: { Cookie: cookie, Origin: origin } },
      env
    );
    expect(logout.status).toBe(303);
    expect(logout.headers.get('location')).toBe('/admin/login');
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('rejects login and logout when the browser origin is null or absent', async () => {
    const cookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    for (const browserOrigin of [undefined, 'null']) {
      const headers: Record<string, string> = {
        'Cookie': cookie,
        'Content-Type': 'application/x-www-form-urlencoded'
      };
      if (browserOrigin !== undefined) headers.Origin = browserOrigin;
      for (const path of ['/admin/login', '/admin/logout']) {
        expect(
          (
            await app.request(
              origin + path,
              { method: 'POST', headers, body: 'token=test-admin-secret' },
              env
            )
          ).status
        ).toBe(403);
      }
    }
  });
  it('rejects wrong tokens and cross-origin login or check requests', async () => {
    expect(
      (
        await app.request(
          origin + '/admin/login',
          {
            method: 'POST',
            headers: { 'Origin': origin, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'token=wrong'
          },
          env
        )
      ).status
    ).toBe(401);
    expect(
      (
        await app.request(
          origin + '/admin/login',
          {
            method: 'POST',
            headers: { Origin: 'https://evil.test' },
            body: 'token=test-admin-secret'
          },
          env
        )
      ).status
    ).toBe(403);
    expect(
      (
        await app.request(
          origin + '/admin/api/accounts/test_account/check',
          { method: 'POST' },
          env
        )
      ).status
    ).toBe(403);
  });
  it('issues a secure session and never returns account credentials', async () => {
    const response = await login();
    expect(response.status).toBe(303);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    const result = await app.request(
      origin + '/admin/api/accounts',
      { headers: { Cookie: cookie.split(';')[0] } },
      env
    );
    const text = await result.text();
    expect(result.status).toBe(200);
    expect(text).toContain('test_account');
    for (const secret of [
      'private-test-token',
      'private-test-csrf',
      'authToken',
      'csrfToken',
      'ACCOUNT_ADMIN_TOKEN'
    ])
      expect(text).not.toContain(secret);
  });
  it('rejects expired or tampered sessions', async () => {
    const response = await login();
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    for (const value of [
      cookie.replace(/=\d+\./, '=1.'),
      cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0')
    ]) {
      expect(
        (await app.request(origin + '/admin/api/accounts', { headers: { Cookie: value } }, env))
          .status
      ).toBe(401);
    }
  });
  it('persists a single-account check and reloads its saved result', async () => {
    const cookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    const check = await app.request(
      origin + '/admin/api/accounts/test_account/check',
      { method: 'POST', headers: { Cookie: cookie, Origin: origin } },
      env
    );
    expect(check.status).toBe(200);
    expect(records.size).toBe(1);
    const list = await app.request(
      origin + '/admin/api/accounts',
      { headers: { Cookie: cookie } },
      env
    );
    expect(
      ((await list.json()) as { accounts: { health: { status: string } }[] }).accounts[0].health
        .status
    ).toBe('available');
    expect(
      (
        await app.request(
          origin + '/admin/api/accounts/missing/check',
          { method: 'POST', headers: { Cookie: cookie, Origin: origin } },
          env
        )
      ).status
    ).toBe(404);
  });
  it('reports failed persistence instead of claiming the check was saved', async () => {
    const cookie = (await login()).headers.get('set-cookie')!.split(';')[0];
    failWrite = true;
    expect(
      (
        await app.request(
          origin + '/admin/api/accounts/test_account/check',
          { method: 'POST', headers: { Cookie: cookie, Origin: origin } },
          env
        )
      ).status
    ).toBe(500);
  });
});

describe('account result classification', () => {
  it('accepts downstream rate-limit and nonfatal errors when FxTwitter still has query data', () => {
    const data = { search_by_raw_query: { search_timeline: { timeline: { instructions: [] } } } };
    expect(classifyAccountResponse(200, { data, errors: [{ code: 88 }] }).status).toBe('available');
    expect(classifyAccountResponse(200, { data, errors: [{ kind: 'NonFatal' }] }).status).toBe(
      'available'
    );
  });
  it('accepts a real search envelope, including an empty result page', () => {
    expect(
      classifyAccountResponse(200, {
        data: { search_by_raw_query: { search_timeline: { timeline: { instructions: [] } } } }
      }).status
    ).toBe('available');
    expect(classifyAccountResponse(200, {}).status).toBe('error');
  });
  it('distinguishes invalid sessions, restricted accounts, and rate limits even on HTTP 200', () => {
    expect(classifyAccountResponse(200, { errors: [{ code: 32 }] }).status).toBe('invalid');
    expect(classifyAccountResponse(200, { errors: [{ code: 326 }] }).status).toBe('restricted');
    expect(classifyAccountResponse(429, {}).status).toBe('rate_limited');
    expect(classifyAccountResponse(403, {}).status).toBe('error');
  });
});
