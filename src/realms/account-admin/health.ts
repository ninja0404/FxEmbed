import type { TwitterCredentials } from '@fxembed/atmosphere/types/proxy-credentials';
import { SearchTimelineQuery } from '@fxembed/atmosphere/providers/twitter/graphql/queries';
import { buildGraphQLUrl } from '@fxembed/atmosphere/providers/twitter/graphql/request';
import { proxyTwitterRequest } from '@fxembed/atmosphere/providers/twitter/proxy/handler';
import {
  classifyAPIErrors,
  twitterResponseLooksEmpty
} from '@fxembed/atmosphere/providers/twitter/proxy/errors';
import { Constants } from '../../constants';

export type AccountStatus =
  'available' | 'session_valid' | 'invalid' | 'restricted' | 'rate_limited' | 'error' | 'unknown';

export type AccountHealth = {
  status: AccountStatus;
  reason: string;
  checkedAt: string | null;
  stage: 'session' | 'query';
  httpStatus?: number;
  errorType?: string;
  latencyMs?: number;
  rateLimitReset?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function classifyAccountResponse(
  httpStatus: number,
  body: unknown
): Pick<AccountHealth, 'status' | 'reason'> {
  const response = record(body);
  const errors = Array.isArray(response.errors) ? response.errors : [];
  const codes = errors.map(error => Number(record(error).code));
  if (httpStatus === 429) return { status: 'rate_limited', reason: 'rate_limit' };
  const data = record(response.data);
  const search = record(data.search_by_raw_query);
  const timeline = record(record(search.search_timeline).timeline);
  const disposition = classifyAPIErrors(body, JSON.stringify(body), httpStatus);
  // Match the query proxy's treatment of nonfatal/downstream errors when real data survives.
  if (
    httpStatus === 200 &&
    Array.isArray(timeline.instructions) &&
    disposition.action === 'ignore'
  ) {
    return { status: 'available', reason: 'query_verified' };
  }
  if (codes.includes(88)) return { status: 'rate_limited', reason: 'rate_limit' };
  if (codes.includes(64)) return { status: 'restricted', reason: 'account_suspended' };
  if (codes.includes(326)) return { status: 'restricted', reason: 'account_verification_required' };
  if (httpStatus === 401 || codes.some(code => [32, 89, 215].includes(code))) {
    return { status: 'invalid', reason: 'authentication_failed' };
  }
  if (httpStatus !== 200 || errors.length > 0) return { status: 'error', reason: 'upstream_error' };
  return {
    status: 'error',
    reason: twitterResponseLooksEmpty(body)
      ? 'empty_upstream_response'
      : 'unexpected_upstream_response'
  };
}

/** Pin the session so another account cannot hide this account's authentication failure. */
export async function checkTwitterAccount(account: TwitterCredentials): Promise<AccountHealth> {
  const checkedAt = new Date().toISOString();
  if (!account.authToken || !account.csrfToken) {
    return { status: 'invalid', reason: 'missing_session_credentials', stage: 'query', checkedAt };
  }
  const started = performance.now();
  let httpStatus: number | undefined;
  try {
    const url = buildGraphQLUrl(SearchTimelineQuery, {
      rawQuery: 'from:jack',
      product: 'Latest',
      count: 1
    });
    const response = await proxyTwitterRequest(
      new Request(url, {
        headers: {
          ...Constants.BASE_HEADERS,
          'authorization': Constants.GUEST_BEARER_TOKEN,
          'x-twitter-auth-type': 'OAuth2Session',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en'
        },
        signal: AbortSignal.timeout(20_000)
      }),
      {},
      account
    );
    httpStatus = response.status;
    const text = await response.text();
    let body: unknown;
    try {
      body = text.trim() ? JSON.parse(text) : {};
    } catch {
      const classification = classifyAccountResponse(httpStatus, {});
      return {
        status: classification.status,
        reason: classification.status === 'error' ? 'upstream_non_json' : classification.reason,
        checkedAt,
        stage: 'query',
        httpStatus,
        latencyMs: Math.round(performance.now() - started)
      };
    }
    const classification = classifyAccountResponse(response.status, body);
    const health: AccountHealth = {
      ...classification,
      reason:
        !text.trim() && classification.status === 'error'
          ? 'empty_upstream_response'
          : classification.reason,
      stage: 'query',
      checkedAt,
      httpStatus: response.status,
      latencyMs: Math.round(performance.now() - started)
    };
    const reset = Number(response.headers.get('x-rate-limit-reset'));
    if (Number.isFinite(reset) && reset > 0 && reset < 10_000_000_000) {
      health.rateLimitReset = new Date(reset * 1000).toISOString();
    }
    return health;
  } catch (error) {
    return {
      status: 'error',
      reason:
        error instanceof Error && /Timeout|Abort/.test(error.name) ? 'timeout' : 'probe_failed',
      stage: 'query',
      checkedAt,
      httpStatus,
      errorType: error instanceof Error ? error.name : 'Error',
      latencyMs: Math.round(performance.now() - started)
    };
  }
}

/** Session changes must not inherit health results from an older credential. */
export async function accountHealthKey(account: TwitterCredentials): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${account.authToken}:${account.csrfToken}`)
  );
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
  return `health:${account.username.toLowerCase()}:${hash}`;
}
