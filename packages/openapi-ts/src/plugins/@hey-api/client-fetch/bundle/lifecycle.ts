/** Context restoration is supplied by the application, without a tracing dependency. */
export interface RequestContext {
  bind<T>(callback: T): T;
}

/** Bounded phases of a unary Fetch invocation, including pre-transport failures. */
export type RequestPhase =
  | 'prepare'
  | 'request_interceptors'
  | 'response_headers'
  | 'response_interceptors'
  | 'body_read'
  | 'json_parse'
  | 'response_validation'
  | 'response_transform'
  | 'error_body_read'
  | 'error_json_parse'
  | 'finalize';

export type RequestOutcome = 'complete' | 'stream_open' | 'failed' | 'cancelled';

/**
 * One observer per unary invocation. Methods must not throw. `stream_open` ends
 * at body handoff; stream consumption/reconnection belongs to its consumer.
 * The terminal notification precedes error interceptors and retains the original
 * failure. bind() must preserve function arguments, return types and receivers.
 */
export interface RequestLifecycle extends RequestContext {
  finish(
    request: Request | undefined,
    response: Response | undefined,
    outcome: RequestOutcome,
    error?: unknown,
  ): void;
  phase(phase: RequestPhase): void;
}

/** Unconfigured clients have no observable lifecycle side effects. */
export const defaultRequestLifecycle: RequestLifecycle = {
  bind: <T>(callback: T): T => callback,
  finish() {},
  phase() {},
};
