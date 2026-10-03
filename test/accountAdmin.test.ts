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
const auth = { Authorization: 'Bearer test-admin-secret' };

beforeEach(() => {
  records.clear();
  failWrite = false;
});

describe('account admin access and persistence', () => {
  it('denies requests without the bearer token', async () => {
    for (const headers of [
      {},
      { Authorization: 'Bearer wrong' },
      { Authorization: 'test-admin-secret' }
    ]) {
      const api = await app.request(origin + '/admin/api/accounts', { headers }, env);
      expect(api.status).toBe(401);
      expect(await api.text()).not.toContain('test_account');
      expect(api.headers.get('cache-control')).toContain('no-store');
    }
    expect(
      (
        await app.request(
          origin + '/admin/api/accounts/test_account/check',
          { method: 'POST' },
          env
        )
      ).status
    ).toBe(401);
    expect(records.size).toBe(0);
  });
  it('fails closed without the admin secret or state storage', async () => {
    expect((await app.request(origin + '/admin/api/accounts', { headers: auth }, {})).status).toBe(
      503
    );
  });
  it('no longer serves the browser dashboard', async () => {
    for (const path of ['/admin/accounts', '/admin/login'])
      expect((await app.request(origin + path, { headers: auth }, env)).status).toBe(404);
  });
  it('never returns account credentials', async () => {
    const result = await app.request(origin + '/admin/api/accounts', { headers: auth }, env);
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
  it('persists a single-account check and reloads its saved result', async () => {
    const check = await app.request(
      origin + '/admin/api/accounts/test_account/check',
      { method: 'POST', headers: auth },
      env
    );
    expect(check.status).toBe(200);
    expect(records.size).toBe(1);
    const list = await app.request(origin + '/admin/api/accounts', { headers: auth }, env);
    expect(
      ((await list.json()) as { accounts: { health: { status: string } }[] }).accounts[0].health
        .status
    ).toBe('available');
    expect(
      (
        await app.request(
          origin + '/admin/api/accounts/missing/check',
          { method: 'POST', headers: auth },
          env
        )
      ).status
    ).toBe(404);
  });
  it('reports failed persistence instead of claiming the check was saved', async () => {
    failWrite = true;
    expect(
      (
        await app.request(
          origin + '/admin/api/accounts/test_account/check',
          { method: 'POST', headers: auth },
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
