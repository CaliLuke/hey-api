import { createSseClient } from '../../client-core/bundle/serverSentEvents';
import type { HttpMethod } from '../../client-core/bundle/types';
import { getValidRequestBody } from '../../client-core/bundle/utils';
import { initializeClient } from './initialization';
import { defaultRequestLifecycle } from './lifecycle';
import type { Client, Config, RequestOptions, ResolvedRequestOptions } from './types';
import {
  buildUrl,
  createConfig,
  createInterceptors,
  getHeadersForValidation,
  getParseAs,
  mergeConfigs,
  mergeHeaders,
  setAuthParams,
} from './utils';

type ReqInit = Omit<RequestInit, 'body' | 'headers'> & {
  body?: any;
  headers: ReturnType<typeof mergeHeaders>;
};

/** Construct and initialize each client before exposing it to callers. */
export function createClient(config: Config = {}): Client {
  let _config = mergeConfigs(createConfig(), config);

  const getConfig = (): Config => ({ ..._config });

  const setConfig = (config: Config): Config => {
    _config = mergeConfigs(_config, config);
    return getConfig();
  };

  const interceptors = createInterceptors<Request, Response, unknown, ResolvedRequestOptions>();

  const beforeRequest = async <
    TData = unknown,
    TResponseStyle extends 'data' | 'fields' = 'fields',
    ThrowOnError extends boolean = boolean,
    Url extends string = string,
  >(
    options: RequestOptions<TData, TResponseStyle, ThrowOnError, Url>,
  ) => {
    const requestContext = (options.requestContext ?? _config.requestContext)?.();
    const bind = <T>(callback: T): T => requestContext?.bind(callback) ?? callback;
    const opts = {
      ..._config,
      ...options,
      fetch: options.fetch ?? _config.fetch ?? globalThis.fetch,
      headers: mergeHeaders(_config.headers, options.headers),
      serializedBody: undefined as string | undefined,
    };

    if (typeof opts.auth === 'function') {
      opts.auth = bind(opts.auth);
    }
    if (opts.security) {
      await setAuthParams(opts);
    }

    if (opts.requestValidator) {
      await bind(opts.requestValidator).call(opts, {
        ...opts,
        headers: getHeadersForValidation(opts.headers, _config.headers, options.headers),
      });
    }

    if (opts.body !== undefined && opts.bodySerializer) {
      opts.serializedBody = bind(opts.bodySerializer).call(opts, opts.body) as string | undefined;
    }

    // remove Content-Type header if body is empty to avoid sending invalid requests
    if (opts.body === undefined || opts.serializedBody === '') {
      opts.headers.delete('Content-Type');
    }

    const resolvedOpts = opts as typeof opts &
      ResolvedRequestOptions<TResponseStyle, ThrowOnError, Url>;
    const url = bind(buildUrl)(resolvedOpts);

    return { opts: resolvedOpts, url };
  };

  const request: Client['request'] = async (options) => {
    const throwOnError = options.throwOnError ?? _config.throwOnError;
    const responseStyle = options.responseStyle ?? _config.responseStyle;

    options = { ...options };
    const timing =
      (options.requestLifecycle ?? _config.requestLifecycle)?.(options) ?? defaultRequestLifecycle;
    let request: Request | undefined;
    let response: Response | undefined;

    try {
      const { opts, url } = await timing.bind(beforeRequest)(options);
      const requestInit: ReqInit = {
        redirect: 'follow',
        ...opts,
        body: getValidRequestBody(opts),
      };

      request = new Request(url, requestInit);
      timing.phase('request_interceptors');

      for (const fn of interceptors.request.fns) {
        if (fn) {
          request = await timing.bind(fn)(request, opts);
        }
      }

      // fetch must be assigned here, otherwise it would throw the error:
      // TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
      const _fetch = opts.fetch!;

      timing.phase('response_headers');
      response = await timing.bind(_fetch)(request);
      timing.phase('response_interceptors');

      for (const fn of interceptors.response.fns) {
        if (fn) {
          response = await timing.bind(fn)(response, request, opts);
        }
      }

      const result = {
        request,
        response,
      };

      if (response.ok) {
        timing.phase('body_read');
        const parseAs =
          (opts.parseAs === 'auto'
            ? getParseAs(response.headers.get('Content-Type'))
            : opts.parseAs) ?? 'json';

        // Decode first, then validate every successful response through one boundary.
        // A 204 has no representation regardless of its media type or parse mode.
        let data: any;
        if (response.status !== 204) {
          const empty = response.headers.get('Content-Length') === '0';
          switch (parseAs) {
            case 'arrayBuffer':
            case 'blob':
            case 'text':
              data = await response[parseAs]();
              break;
            case 'formData':
              data = empty ? new FormData() : await response.formData();
              break;
            case 'json': {
              const text = await response.text();
              timing.phase('json_parse');
              data = text ? JSON.parse(text) : {};
              break;
            }
            case 'stream':
              data = response.body;
              break;
          }
        }

        timing.phase('finalize');
        if (opts.responseValidator) {
          timing.phase('response_validation');
          await timing.bind(opts.responseValidator).call(opts, data);
          timing.phase('finalize');
        }

        if (parseAs === 'json' && opts.responseTransformer) {
          timing.phase('response_transform');
          data = await timing.bind(opts.responseTransformer).call(opts, data);
          timing.phase('finalize');
        }

        timing.finish(
          request,
          response,
          response.status !== 204 && parseAs === 'stream' ? 'stream_open' : 'complete',
        );
        return opts.responseStyle === 'data'
          ? data
          : {
              data,
              ...result,
            };
      }

      timing.phase('error_body_read');
      const textError = await response.text();
      timing.phase('error_json_parse');
      let jsonError: unknown;

      try {
        jsonError = JSON.parse(textError);
      } catch {
        // noop
      }

      throw jsonError ?? textError;
    } catch (error) {
      const signal = request?.signal ?? options.signal;
      timing.finish(
        request,
        response,
        response?.ok !== false && signal?.aborted && Object.is(error, signal.reason)
          ? 'cancelled'
          : 'failed',
        error,
      );
      let finalError = error;

      for (const fn of interceptors.error.fns) {
        if (fn) {
          finalError = await timing.bind(fn)(
            finalError,
            response,
            request,
            options as ResolvedRequestOptions,
          );
        }
      }

      finalError = finalError || {};

      if (throwOnError) {
        throw finalError;
      }

      // TODO: we probably want to return error and improve types
      return responseStyle === 'data'
        ? undefined
        : {
            error: finalError,
            request,
            response,
          };
    }
  };

  const makeMethodFn = (method: Uppercase<HttpMethod>) => (options: RequestOptions) =>
    request({ ...options, method });

  const makeSseFn = (method: Uppercase<HttpMethod>) => async (options: RequestOptions) => {
    const { opts, url } = await beforeRequest(options);
    return createSseClient({
      ...opts,
      body: opts.body as BodyInit | null | undefined,
      method,
      onRequest: async (url, init) => {
        let request = new Request(url, init);
        for (const fn of interceptors.request.fns) {
          if (fn) {
            request = await fn(request, opts);
          }
        }
        return request;
      },
      serializedBody: getValidRequestBody(opts) as BodyInit | null | undefined,
      url,
    });
  };

  const _buildUrl: Client['buildUrl'] = (options) => buildUrl({ ..._config, ...options });

  const client = {
    buildUrl: _buildUrl,
    connect: makeMethodFn('CONNECT'),
    delete: makeMethodFn('DELETE'),
    get: makeMethodFn('GET'),
    getConfig,
    head: makeMethodFn('HEAD'),
    interceptors,
    options: makeMethodFn('OPTIONS'),
    patch: makeMethodFn('PATCH'),
    post: makeMethodFn('POST'),
    put: makeMethodFn('PUT'),
    request,
    setConfig,
    sse: {
      connect: makeSseFn('CONNECT'),
      delete: makeSseFn('DELETE'),
      get: makeSseFn('GET'),
      head: makeSseFn('HEAD'),
      options: makeSseFn('OPTIONS'),
      patch: makeSseFn('PATCH'),
      post: makeSseFn('POST'),
      put: makeSseFn('PUT'),
      trace: makeSseFn('TRACE'),
    },
    trace: makeMethodFn('TRACE'),
  } as Client;
  initializeClient(client);
  return client;
}
