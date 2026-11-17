import { createClient } from '../bundle/client';
import { mergeHeaderOptions, mergeHeaders } from '../bundle/utils';

const responseCases = [
  {
    name: 'JSON',
    response: () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
  },
  {
    name: 'empty JSON',
    response: () =>
      new Response(null, {
        headers: { 'Content-Length': '0', 'Content-Type': 'application/json' },
      }),
  },
  {
    name: 'text',
    response: () => new Response('text', { headers: { 'Content-Type': 'text/plain' } }),
  },
  {
    name: 'blob',
    response: () =>
      new Response('file', { headers: { 'Content-Type': 'application/octet-stream' } }),
  },
  { name: 'stream', parseAs: 'stream' as const, response: () => new Response('stream') },
  {
    name: '204 JSON',
    parseAs: 'json' as const,
    response: () => new Response(null, { status: 204 }),
  },
  {
    name: '204 text',
    parseAs: 'text' as const,
    response: () => new Response(null, { status: 204 }),
  },
  {
    name: 'empty form',
    parseAs: 'formData' as const,
    response: () => new Response(null, { headers: { 'Content-Length': '0' } }),
  },
  { name: 'array buffer', parseAs: 'arrayBuffer' as const, response: () => new Response('bytes') },
];

describe('successful response validation', () => {
  for (const responseStyle of ['data', 'fields'] as const) {
    for (const throwOnError of [false, true]) {
      it.each(responseCases)(
        `validates $name once (${responseStyle}, throw ${throwOnError})`,
        async ({ response, ...scenario }) => {
          const failure = new Error('invalid response');
          const responseValidator = vi.fn().mockRejectedValue(failure);
          const responseTransformer = vi.fn();
          const client = createClient({ baseUrl: 'https://example.com' });
          const onError = vi.fn((error) => error);
          client.interceptors.error.use(onError);
          const promise = client.get({
            fetch: async () => response(),
            parseAs: 'parseAs' in scenario ? scenario.parseAs : 'auto',
            responseStyle,
            responseTransformer,
            responseValidator,
            throwOnError,
            url: '/response',
          });
          if (throwOnError) await expect(promise).rejects.toBe(failure);
          else if (responseStyle === 'data') expect(await promise).toBeUndefined();
          else expect(await promise).toMatchObject({ error: failure });
          expect(responseValidator).toHaveBeenCalledTimes(1);
          expect(responseTransformer).not.toHaveBeenCalled();
          expect(onError).toHaveBeenCalledTimes(1);
        },
      );
    }
  }

  it.each(['auto', 'text', 'blob', 'stream'] as const)(
    'validates undefined for a valid 204 in %s mode',
    async (parseAs) => {
      const validator = vi.fn(async (value) => expect(value).toBeUndefined());
      const client = createClient({ baseUrl: 'https://example.com' });
      const result = await client.get({
        fetch: async () => new Response(null, { status: 204 }),
        parseAs,
        responseValidator: validator,
        url: '/empty',
      });
      expect(result.data).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(validator).toHaveBeenCalledTimes(1);
    },
  );
});

describe('header input contracts', () => {
  const cases = [
    { headers: { 'X-Name': '' }, name: 'record' },
    { headers: { 'X-Name': '   ' }, name: 'whitespace record' },
    { headers: [['X-Name', '   ']] as [string, string][], name: 'whitespace tuple' },
    { headers: new Headers({ 'X-Name': '   ' }), name: 'whitespace Headers' },
    { headers: new Headers({ 'X-Name': '' }), name: 'Headers' },
    { headers: [['X-Name', '']] as [string, string][], name: 'tuples' },
  ];
  it.each(cases)(
    'rejects invalid $name values before transport with case-insensitive lookup',
    async ({ headers }) => {
      const fetch = vi.fn();
      const client = createClient({ baseUrl: 'https://example.com' });
      const result = await client.post({
        body: '{}',
        fetch,
        headers,
        requestValidator: async (data) => {
          const values = (data as { headers: Record<string, unknown> }).headers;
          expect('X-Name' in values).toBe(true);
          expect(values['X-NAME']).toBe('');
          if (values['X-Name'] === '') throw new Error('empty header');
        },
        url: '/headers',
      });
      expect(result.error).toBeInstanceOf(Error);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('retains typed values through configuration and includes auth headers', async () => {
    const client = createClient({
      baseUrl: 'https://example.com',
      headers: { 'X-Count': 2 },
    });
    const result = await client.post({
      auth: 'new',
      body: '{}',
      fetch: async () => new Response(null, { status: 204 }),
      requestValidator: async (data) => {
        const values = (data as { headers: Record<string, unknown> }).headers;
        expect(values['X-Count']).toBe(2);
        expect(values['X-Token']).toBe('new');
      },
      security: [{ in: 'header', name: 'X-Token', type: 'apiKey' }],
      url: '/headers',
    });
    expect(result.error).toBeUndefined();
  });

  it('preserves deletion markers until client defaults merge and lets the browser set multipart boundaries', async () => {
    const headers = mergeHeaderOptions({ 'Content-Type': null }, [['X-Test', 'yes']], {
      'X-Inherited': undefined,
      'x-removed': null,
    });
    const body = new FormData();
    body.append('file', new Blob(['bytes']), 'file.txt');
    let request: Request | undefined;
    const client = createClient({
      baseUrl: 'https://example.com',
      headers: { 'Content-Type': 'application/json', 'X-Inherited': 'keep', 'X-Removed': 'remove' },
    });
    const result = await client.post({
      body,
      bodySerializer: null,
      fetch: async (input) => {
        request = input as Request;
        return new Response(null, { status: 204 });
      },
      headers,
      url: '/upload',
    });
    expect(result.error).toBeUndefined();
    expect(request?.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(request?.headers.get('X-Test')).toBe('yes');
    expect(request?.headers.get('X-Inherited')).toBe('keep');
    expect(request?.headers.has('X-Removed')).toBe(false);
  });

  it('merges tuple duplicates and overrides without numeric header names', () => {
    const merged = mergeHeaders({ 'X-Test': 'old' }, [
      ['x-test', 'one'],
      ['X-Test', 'two'],
    ]);
    expect([...merged.entries()]).toEqual([['x-test', 'one, two']]);
    expect(
      mergeHeaderOptions(
        { 'Content-Type': 'application/json' },
        new Headers({ 'content-type': 'text/plain' }),
      ),
    ).toEqual({ 'content-type': 'text/plain' });
  });
});

it('preserves serialized object headers when setConfig appends values', async () => {
  const client = createClient({ baseUrl: 'https://example.com', headers: { 'X-Meta': { a: 1 } } });
  client.setConfig({ headers: { 'x-meta': ['extra'] } });
  let observed: string | null = null;
  await client.get({
    fetch: async (request) => {
      observed = (request as Request).headers.get('X-Meta');
      return new Response(null, { status: 204 });
    },
    url: '/headers',
  });
  expect(observed).toBe('{"a":1}, extra');
});

it('normalizes string array members without erasing other header element types', async () => {
  const client = createClient({ baseUrl: 'https://example.com' });
  const fetch = vi.fn(async () => new Response(null, { status: 204 }));
  const result = await client.post({
    body: '{}',
    fetch,
    headers: { 'X-Empty': ['   '], 'X-Mixed': [2, ' padded ', true] },
    requestValidator: async (data) => {
      const values = (data as { headers: Record<string, unknown> }).headers;
      expect(values['X-Mixed']).toEqual([2, 'padded', true]);
      expect(values['X-Empty']).toEqual(['']);
      throw new Error('empty array member');
    },
    url: '/headers',
  });
  expect(result.error).toBeInstanceOf(Error);
  expect(fetch).not.toHaveBeenCalled();
});
