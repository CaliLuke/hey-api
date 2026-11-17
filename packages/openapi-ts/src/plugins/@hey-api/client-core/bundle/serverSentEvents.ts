import type { Config } from './types';

export type ServerSentEventsOptions<TData = unknown> = Omit<RequestInit, 'method'> &
  Pick<Config, 'method' | 'responseTransformer' | 'responseValidator'> & {
    /**
     * Fetch API implementation. You can use this option to provide a custom
     * fetch instance.
     *
     * @default globalThis.fetch
     */
    fetch?: typeof fetch;
    /**
     * Implementing clients can call request interceptors inside this hook.
     */
    onRequest?: (url: string, init: RequestInit) => Promise<Request>;
    /**
     * Callback invoked when a network or parsing error occurs during streaming.
     *
     * This option applies only if the endpoint returns a stream of events.
     *
     * @param error The error that occurred.
     */
    onSseError?: (error: unknown) => void;
    /**
     * Callback invoked when an event is streamed from the server.
     *
     * This option applies only if the endpoint returns a stream of events.
     *
     * @param event Event streamed from the server.
     * @returns Nothing (void).
     */
    onSseEvent?: (event: StreamEvent<TData>) => void;
    serializedBody?: RequestInit['body'];
    /**
     * Default retry delay in milliseconds.
     *
     * This option applies only if the endpoint returns a stream of events.
     *
     * @default 3000
     */
    sseDefaultRetryDelay?: number;
    /**
     * Maximum number of retry attempts before giving up.
     */
    sseMaxRetryAttempts?: number;
    /**
     * Maximum retry delay in milliseconds.
     *
     * Applies only when exponential backoff is used.
     *
     * This option applies only if the endpoint returns a stream of events.
     *
     * @default 30000
     */
    sseMaxRetryDelay?: number;
    /**
     * Optional sleep function for retry backoff.
     *
     * Defaults to using `setTimeout`.
     */
    sseSleepFn?: (ms: number) => Promise<void>;
    url: string;
  };

export interface StreamEvent<TData = unknown> {
  data: TData;
  event?: string;
  id?: string;
  retry?: number;
}

export type ServerSentEventsResult<TData = unknown, TReturn = void, TNext = unknown> = {
  stream: AsyncGenerator<
    TData extends Record<string, unknown> ? TData[keyof TData] : TData,
    TReturn,
    TNext
  >;
};

export function createSseClient<TData = unknown>({
  onRequest,
  onSseError,
  onSseEvent,
  responseTransformer,
  responseValidator,
  sseDefaultRetryDelay,
  sseMaxRetryAttempts,
  sseMaxRetryDelay,
  sseSleepFn,
  url,
  ...options
}: ServerSentEventsOptions): ServerSentEventsResult<TData> {
  let lastEventId: string | undefined;

  const sleep = sseSleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  const createStream = async function* () {
    let retryDelay: number = sseDefaultRetryDelay ?? 3000;
    let attempt = 0;
    const signal = options.signal ?? new AbortController().signal;

    while (true) {
      if (signal.aborted) break;

      attempt++;

      const headers =
        options.headers instanceof Headers
          ? options.headers
          : new Headers(options.headers as Record<string, string> | undefined);

      if (lastEventId !== undefined) {
        headers.set('Last-Event-ID', lastEventId);
      }

      try {
        const requestInit: RequestInit = {
          redirect: 'follow',
          ...options,
          body: options.serializedBody,
          headers,
          signal,
        };
        let request = new Request(url, requestInit);
        if (onRequest) {
          request = await onRequest(url, requestInit);
        }
        // fetch must be assigned here, otherwise it would throw the error:
        // TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
        const _fetch = options.fetch ?? globalThis.fetch;
        const response = await _fetch(request);

        if (!response.ok) throw new Error(`SSE failed: ${response.status} ${response.statusText}`);

        if (!response.body) throw new Error('No body in SSE response');

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

        // The parser touches each character once. A chunk is scanned for its
        // own line terminators, and the pieces of a line that spans chunks are
        // kept in a list until the terminator arrives, so an event costs time
        // linear in its size. Re-scanning or re-copying the whole buffer on
        // every chunk costs the square of the event size, which stalls a
        // client for minutes on an event of a few hundred megabytes.
        const lineTerminator = /\r\n|\r|\n/g;
        // Pieces of the line that the previous chunks ended in the middle of.
        let lineParts: Array<string> = [];
        // Whether the previous chunk ended with '\r', so that a '\n' at the
        // start of the next chunk completes a CRLF terminator.
        let afterCarriageReturn = false;
        // Fields of the event being assembled, and how many lines it has.
        let dataLines: Array<string> = [];
        let eventName: string | undefined;
        // An interrupted frame must not advance the replay cursor or retry policy.
        let eventId: string | undefined;
        let eventRetry: number | undefined;
        let eventLines = 0;

        const abortHandler = () => {
          try {
            void reader.cancel().catch(() => undefined);
          } catch {
            // noop
          }
        };

        signal.addEventListener('abort', abortHandler);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            let start = 0;
            if (afterCarriageReturn && value.startsWith('\n')) {
              start = 1;
            }
            afterCarriageReturn = false;
            lineTerminator.lastIndex = start;

            let match: RegExpExecArray | null;
            while ((match = lineTerminator.exec(value)) !== null) {
              const piece = value.slice(start, match.index);
              const line = lineParts.length ? lineParts.join('') + piece : piece;
              lineParts = [];
              start = match.index + match[0].length;
              afterCarriageReturn = match[0] === '\r' && start === value.length;

              if (line !== '') {
                eventLines++;
                if (line.startsWith('data:')) {
                  dataLines.push(line.replace(/^data: ?/, ''));
                } else if (line.startsWith('event:')) {
                  eventName = line.replace(/^event: ?/, '');
                } else if (line.startsWith('id:')) {
                  eventId = line.replace(/^id: ?/, '');
                } else if (line.startsWith('retry:')) {
                  const parsed = Number.parseInt(line.replace(/^retry: ?/, ''), 10);
                  if (!Number.isNaN(parsed)) {
                    eventRetry = parsed;
                  }
                }
                continue;
              }

              // An empty line ends the event. One that follows no line at all
              // is a blank line between two events, not an event.
              if (eventLines === 0) continue;
              if (eventId !== undefined) lastEventId = eventId;
              if (eventRetry !== undefined) retryDelay = eventRetry;
              eventId = undefined;
              eventRetry = undefined;
              const eventDataLines = dataLines;
              const eventEventName = eventName;
              dataLines = [];
              eventName = undefined;
              eventLines = 0;

              let data: unknown;
              let parsedJson = false;

              if (eventDataLines.length) {
                const rawData = eventDataLines.join('\n');
                try {
                  data = JSON.parse(rawData);
                  parsedJson = true;
                } catch {
                  data = rawData;
                }
              }

              if (parsedJson) {
                if (responseValidator) {
                  await responseValidator(data);
                }

                if (responseTransformer) {
                  data = await responseTransformer(data);
                }
              }

              onSseEvent?.({
                data,
                event: eventEventName,
                id: lastEventId,
                retry: retryDelay,
              });

              if (eventDataLines.length) {
                yield data as any;
              }
            }

            if (start < value.length) {
              lineParts.push(value.slice(start));
            }
          }
        } finally {
          signal.removeEventListener('abort', abortHandler);
          reader.releaseLock();
        }

        break; // exit loop on normal completion
      } catch (error) {
        // connection failed or aborted; retry after delay
        onSseError?.(error);

        if (sseMaxRetryAttempts !== undefined && attempt >= sseMaxRetryAttempts) {
          break; // stop after firing error
        }

        // exponential backoff: double retry each attempt, cap at 30s
        const backoff = Math.min(retryDelay * 2 ** (attempt - 1), sseMaxRetryDelay ?? 30000);
        await sleep(backoff);
      }
    }
  };

  const stream = createStream();

  return { stream };
}
