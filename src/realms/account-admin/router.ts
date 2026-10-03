import { Hono } from 'hono';
import { initCredentials, getTwitterAccounts } from '../../providers/twitter/proxy/credentials';
import { accountHealthKey, checkTwitterAccount, type AccountHealth } from './health';
import { validAdminToken } from './auth';

export type AccountAdminEnv = {
  Bindings: {
    ACCOUNT_ADMIN_TOKEN?: string;
    ACCOUNT_HEALTH?: KVNamespace;
    CREDENTIAL_KEY?: string;
  };
};

// Server-to-server JSON API; the account dashboard lives in solana-monitor.
export const accountAdmin = new Hono<AccountAdminEnv>();
accountAdmin.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Robots-Tag', 'noindex, nofollow');
  if (!c.env?.ACCOUNT_ADMIN_TOKEN || !c.env?.ACCOUNT_HEALTH) {
    return c.json({ error: '账号管理尚未配置，请检查管理口令和状态存储绑定。' }, 503);
  }
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!(await validAdminToken(token, c.env.ACCOUNT_ADMIN_TOKEN))) {
    return c.json({ error: '管理口令不正确。' }, 401);
  }
  await next();
});

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
