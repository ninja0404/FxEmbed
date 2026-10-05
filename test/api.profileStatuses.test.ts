import { test, expect, vi } from 'vitest';
import type { APITwitterStatus } from '../src/realms/api/schemas';
import { APISearchResults } from '../src/types/types';
import { app } from '../src/worker';
import { botHeaders, twitterBaseUrl } from './helpers/data';
import harness from './helpers/harness';

test('API profile statuses returns tweets and cursors for known user', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/profile/x/statuses', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as APISearchResults;
  expect(response.code).toEqual(200);
  expect(response.results).toBeDefined();
  expect(Array.isArray(response.results)).toBe(true);
  expect(response.results.length).toBeGreaterThan(0);
  expect(response.cursor).toBeDefined();
  expect(response.cursor.top).toBeTruthy();
  expect(response.cursor.bottom).toBeTruthy();
  expect(typeof response.cursor.top).toBe('string');
  expect(typeof response.cursor.bottom).toBe('string');

  const first = response.results[0] as APITwitterStatus;
  expect(first.type).toBe('status');
  expect(first.author.type).toBe('profile');
  expect(first.id).toEqual('2036082537949434164');
  expect(first.quotes).toEqual(383);
  expect(first.text).toBeTruthy();
  expect(first.url).toContain(twitterBaseUrl);
  expect(first.url).toContain('/status/');
  expect(first.author?.screen_name).toBeTruthy();
});

test('API profile statuses with groupthreads=1 returns discriminated results', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/profile/x/statuses?groupthreads=1&count=5', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as {
    code: number;
    results: Array<{ type: 'status' | 'thread' } & Record<string, unknown>>;
  };
  expect(response.code).toEqual(200);
  expect(response.results.length).toBeGreaterThan(0);
  for (const row of response.results) {
    expect(row.type === 'status' || row.type === 'thread').toBe(true);
    if (row.type === 'thread') {
      expect(Array.isArray(row.statuses)).toBe(true);
      expect(typeof row.conversation_id).toBe('string');
      expect(typeof row.truncated).toBe('boolean');
    }
  }
});

test('API profile statuses accepts count and cursor query params', async () => {
  const result = await app.request(
    new Request(
      'https://api.fxtwitter.com/2/profile/x/statuses?count=5&cursor=DAAHCgABHEJR3hu___QLAAIAAAATMjAyODI4MTMx',
      {
        method: 'GET',
        headers: botHeaders
      }
    ),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as APISearchResults;
  expect(response.code).toEqual(200);
  expect(response.results.length).toBeGreaterThan(0);
});

test('API profile statuses returns 404 for unknown user', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/profile/__no_such_user_fxt__/statuses', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(404);
  const response = (await result.json()) as APISearchResults;
  expect(response.code).toEqual(404);
  expect(response.results).toEqual([]);
  expect(response.cursor.top).toBeNull();
  expect(response.cursor.bottom).toBeNull();
});

test('API profile statuses returns 204 when since is after all posts (seconds)', async () => {
  /* Far-future Unix seconds: no posts are newer than this */
  const since = Math.floor(Date.now() / 1000) + 86_400 * 365;
  const result = await app.request(
    new Request(`https://api.fxtwitter.com/2/profile/x/statuses?since=${since}`, {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(204);
  expect((await result.text()).length).toEqual(0);
});

test('API profile statuses returns 200 with since=0', async () => {
  const result = await app.request(
    new Request('https://api.fxtwitter.com/2/profile/x/statuses?since=0', {
      method: 'GET',
      headers: botHeaders
    }),
    undefined,
    harness
  );
  expect(result.status).toEqual(200);
  const response = (await result.json()) as APISearchResults;
  expect(response.code).toEqual(200);
  expect(response.results.length).toBeGreaterThan(0);
});

test('API profile statuses with_replies=1 makes a single ProfileWithRepliesTimeline request', async () => {
  // Top of the weighted range: any lower-weight timeline method would be picked first.
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const operations: string[] = [];
  const env = {
    ...harness,
    TwitterProxy: {
      fetch: (request: string) => {
        operations.push(new URL(request).pathname.split('/').pop() ?? '');
        return harness.TwitterProxy.fetch(request);
      }
    }
  };
  try {
    const result = await app.request(
      new Request('https://api.fxtwitter.com/2/profile/id:783214/statuses?with_replies=1', {
        method: 'GET',
        headers: botHeaders
      }),
      undefined,
      env
    );
    expect(result.status).toEqual(200);
    const response = (await result.json()) as APISearchResults;
    expect(response.results.length).toBeGreaterThan(0);
    expect(operations).toEqual(['ProfileWithRepliesTimeline']);
  } finally {
    random.mockRestore();
  }
});
