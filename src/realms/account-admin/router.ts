import { Hono } from 'hono';
import { initCredentials, getTwitterAccounts } from '../../providers/twitter/proxy/credentials';
import { accountHealthKey, checkTwitterAccount, type AccountHealth } from './health';
import {
  hasAdminSession,
  issueAdminSession,
  validAdminToken,
  clearAdminSession,
  sameOrigin
} from './auth';
import { loginPage, dashboardPage } from './page';

export type AccountAdminEnv = {
  Variables: { pageNonce: string };
  Bindings: {
    ACCOUNT_ADMIN_TOKEN?: string;
    ACCOUNT_HEALTH?: KVNamespace;
    CREDENTIAL_KEY?: string;
  };
};

export const accountAdmin = new Hono<AccountAdminEnv>();
accountAdmin.use('*', async (c, next) => {
  const nonce = crypto.randomUUID();
  c.header('Cache-Control', 'private, no-store');
  c.header(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`
  );
  c.header('X-Content-Type-Options', 'nosniff');
  // Native form POSTs need a non-null Origin for the CSRF check.
  c.header('Referrer-Policy', 'same-origin');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  c.set('pageNonce', nonce);
  if (!c.env?.ACCOUNT_ADMIN_TOKEN || !c.env?.ACCOUNT_HEALTH) {
    return c.json({ error: '账号管理尚未配置，请检查管理口令和状态存储绑定。' }, 503);
  }
  if (c.req.method !== 'GET' && !sameOrigin(c)) return c.json({ error: '请求来源不正确。' }, 403);
  if (
    new URL(c.req.url).pathname !== '/admin/login' &&
    !(await hasAdminSession(c, c.env.ACCOUNT_ADMIN_TOKEN))
  ) {
    return new URL(c.req.url).pathname.startsWith('/admin/api/')
      ? c.json({ error: '请先登录账号管理。' }, 401)
      : c.redirect('/admin/login');
  }
  await next();
});

accountAdmin.get('/login', async c => {
  if (await hasAdminSession(c, c.env.ACCOUNT_ADMIN_TOKEN!)) return c.redirect('/admin/accounts');
  return c.html(loginPage(c.get('pageNonce')));
});
accountAdmin.post('/login', async c => {
  const form = await c.req.parseBody();
  if (
    typeof form.token !== 'string' ||
    !(await validAdminToken(form.token, c.env.ACCOUNT_ADMIN_TOKEN!))
  ) {
    return c.html(loginPage(c.get('pageNonce'), '管理口令不正确，请重试。'), 401);
  }
  await issueAdminSession(c, c.env.ACCOUNT_ADMIN_TOKEN!);
  return c.redirect('/admin/accounts', 303);
});
accountAdmin.post('/logout', c => {
  clearAdminSession(c);
  return c.redirect('/admin/login', 303);
});
accountAdmin.get('/', c => c.redirect('/admin/accounts'));
accountAdmin.get('/accounts', c => c.html(dashboardPage(c.get('pageNonce'))));

accountAdmin.get('/api/accounts', async c => {
  await initCredentials(c.env.CREDENTIAL_KEY);
  const accounts = getTwitterAccounts();
  if (!accounts.length) return c.json({ error: '账号池尚未配置。' }, 503);
  const health = new Map<string, AccountHealth>();
  let cursor: string | undefined;
  do {
    const result = await c.env.ACCOUNT_HEALTH!.list<AccountHealth>({ prefix: 'health:', cursor });
    for (const item of result.keys) if (item.metadata) health.set(item.name, item.metadata);
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  const rows = await Promise.all(
    accounts.map(async account => ({
      username: account.username,
      source: account.source ?? 'previous',
      sessionConfigured: Boolean(account.authToken && account.csrfToken),
      health: health.get(await accountHealthKey(account)) ??
        account.bootstrapHealth ?? {
          status: 'unknown',
          reason: 'not_checked',
          stage: 'query',
          checkedAt: null
        }
    }))
  );
  return c.json({ total: rows.length, accounts: rows });
});

accountAdmin.post('/api/accounts/:username/check', async c => {
  await initCredentials(c.env.CREDENTIAL_KEY);
  const account = getTwitterAccounts().find(
    row => row.username.toLowerCase() === c.req.param('username').toLowerCase()
  );
  if (!account) return c.json({ error: '没有这个账号。' }, 404);
  const health = await checkTwitterAccount(account);
  await c.env.ACCOUNT_HEALTH!.put(await accountHealthKey(account), JSON.stringify(health), {
    metadata: health
  });
  return c.json({ username: account.username, health });
});

accountAdmin.all('*', c => c.json({ error: '页面不存在。' }, 404));
accountAdmin.onError((_error, c) => c.json({ error: '账号管理请求失败，请稍后重试。' }, 500));
