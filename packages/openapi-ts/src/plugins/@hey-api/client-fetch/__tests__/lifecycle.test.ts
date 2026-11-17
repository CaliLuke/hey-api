import { createClient } from '../bundle/client';
import type { RequestLifecycle, RequestOutcome, RequestPhase } from '../bundle/lifecycle';

/** No async context implementation is assumed by the generated client. */
function observer() {
  const phases: RequestPhase[] = [];
  const finish = vi.fn();
  let active = false;
  const lifecycle: RequestLifecycle = {
    bind<T>(callback: T): T {
      if (typeof callback !== 'function') return callback;
      return new Proxy(callback, {
        apply(target, receiver, args) {
          const previous = active;
          active = true;
          try {
            return Reflect.apply(target, receiver, args);
          } finally {
            active = previous;
          }
        },
      });
    },
    finish,
    phase: (phase) => phases.push(phase),
  };
  return { assertContext: () => expect(active).toBe(true), finish, lifecycle, phases };
}

it('binds preparation and callbacks and reports every success phase', async () => {
  const o = observer();
  const client = createClient({
    auth: async () => {
      o.assertContext();
      return 'token';
    },
    baseUrl: 'https://example.test',
    bodySerializer(body) {
      o.assertContext();
      return JSON.stringify(body);
    },
    fetch: async () => {
      o.assertContext();
      return new Response('{"value":1}');
    },
    parseAs: 'json',
    requestContext: () => {
      o.assertContext();
      return o.lifecycle;
    },
    requestLifecycle: () => o.lifecycle,
    async requestValidator() {
      o.assertContext();
      expect(this.baseUrl).toBe('https://example.test');
    },
    responseTransformer: async (data) => {
      o.assertContext();
      return data;
    },
    responseValidator: async () => {
      o.assertContext();
    },
  });
  client.interceptors.request.use((request) => {
    o.assertContext();
    return request;
  });
  client.interceptors.response.use((response) => {
    o.assertContext();
    return response;
  });
  const result = await client.post({
    body: { value: 1 },
    security: [{ scheme: 'bearer', type: 'http' }],
    url: '/items',
  });
  expect(result.data).toEqual({ value: 1 });
  expect(o.phases).toEqual([
    'request_interceptors',
    'response_headers',
    'response_interceptors',
    'body_read',
    'json_parse',
    'finalize',
    'response_validation',
    'finalize',
    'response_transform',
    'finalize',
  ]);
  expect(o.finish).toHaveBeenCalledExactlyOnceWith(
    expect.any(Request),
    expect.any(Response),
    'complete',
  );
});

it.each(['prepare', 'fetch', 'parse', 'validation', 'http', 'cancel'] as const)(
  'settles %s failure once before error interception',
  async (failure) => {
    const o = observer();
    const error = new Error(failure);
    const controller = new AbortController();
    const client = createClient({
      baseUrl: 'https://example.test',
      fetch: async () => {
        if (failure === 'fetch') throw error;
        if (failure === 'cancel') {
          controller.abort(error);
          throw error;
        }
        return new Response(failure === 'parse' ? '{' : '{}', {
          status: failure === 'http' ? 400 : 200,
        });
      },
      parseAs: 'json',
      requestLifecycle: () => o.lifecycle,
      requestValidator: async () => {
        if (failure === 'prepare') throw error;
      },
      responseValidator: async () => {
        if (failure === 'validation') throw error;
      },
    });
    client.interceptors.error.use((error) => {
      o.assertContext();
      expect(o.finish).toHaveBeenCalledTimes(1);
      return error;
    });
    const result = await client.get({ signal: controller.signal, url: '/items' });
    expect(result.error).toBeDefined();
    expect(o.finish).toHaveBeenCalledTimes(1);
    const outcome: RequestOutcome = failure === 'cancel' ? 'cancelled' : 'failed';
    expect(o.finish.mock.calls[0]![2]).toBe(outcome);
    if (failure === 'prepare') expect(o.finish.mock.calls[0]![0]).toBeUndefined();
  },
);

it('distinguishes a stream handoff from a consumed body', async () => {
  const o = observer();
  const client = createClient({
    baseUrl: 'https://example.test',
    fetch: async () => new Response('stream'),
    requestLifecycle: () => o.lifecycle,
  });
  const result = await client.get({ parseAs: 'stream', url: '/items' });
  expect(result.data).toBeInstanceOf(ReadableStream);
  expect(o.finish.mock.calls[0]![2]).toBe('stream_open');
});
