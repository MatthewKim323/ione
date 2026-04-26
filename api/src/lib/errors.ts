/**
 * Typed application errors. The HTTP layer maps `code` to a status and a
 * machine-readable error envelope. Never throw raw `Error` from a route —
 * wrap it in AppError so the client gets a stable error contract.
 */

export type AppErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "cost_exceeded"
  | "upstream_error"
  | "validation_error"
  | "agent_parse_error"
  | "internal";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  cost_exceeded: 429,
  upstream_error: 502,
  validation_error: 422,
  agent_parse_error: 502,
  internal: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  toJSON() {
    return {
      error: { code: this.code, message: this.message, details: this.details },
    };
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Wrap any thrown value into an AppError suitable for response. */
export function toAppError(e: unknown, fallbackMessage = "internal error"): AppError {
  if (isAppError(e)) return e;
  if (e instanceof Error)
    return new AppError("internal", e.message || fallbackMessage, { cause: e });
  return new AppError("internal", fallbackMessage, { cause: e });
}
