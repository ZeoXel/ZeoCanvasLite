import assert from 'node:assert/strict';
import test from 'node:test';
import { submitCamera3DTask } from './gateway.ts';

test('submitCamera3DTask falls back to v2 endpoint when v1 fetch fails', async () => {
  const calls = [];

  const mockFetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    if (url.includes('/v1/video/generations')) {
      throw new TypeError('fetch failed');
    }

    return new Response(JSON.stringify({ task_id: 'task-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await submitCamera3DTask({
    baseUrl: 'https://api.example.com/',
    apiKey: 'test-key',
    body: { image: 'https://example.com/a.png' },
    fetchImpl: mockFetch,
    timeoutMs: 2000,
  });

  assert.equal(result.taskId, 'task-123');
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/v1\/video\/generations$/);
  assert.match(calls[1], /\/v2\/videos\/generations$/);
});
