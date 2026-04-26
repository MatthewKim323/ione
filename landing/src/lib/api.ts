import { supabase } from "./supabase";

/**
 * Tiny typed fetcher. Knows the Hono base URL (VITE_API_URL) and how to
 * attach the Supabase JWT as Bearer. Used by tutor + dashboard surfaces.
 *
 * Error contract: the api responds with `{ error: { code, message, details } }`
 * on any non-2xx. We unwrap that into ApiError so callers can dispatch on
 * code (e.g. show a "session already active" toast on conflict, or close the
 * stream on cost_exceeded). Anything that fails to parse falls back to a
 * generic ApiError with code='unknown'.
 */
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8787";

export type ApiErrorCode =
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
  | "internal"
  | "unknown";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export async function authedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export async function authedJson<T = unknown>(
  path: string,
  body?: unknown,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const res = await authedFetch(path, {
    method: init.method ?? "POST",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
  if (!res.ok) {
    throw await readApiError(res);
  }
  return res.json() as Promise<T>;
}

/**
 * Parse a non-2xx Response into an ApiError. Tolerates non-JSON responses
 * (CDN error pages, network glitches, gateway timeouts).
 */
export async function readApiError(res: Response): Promise<ApiError> {
  let code: ApiErrorCode = "unknown";
  let message = `${res.status} ${res.statusText}`;
  let details: Record<string, unknown> | undefined;
  try {
    const j = (await res.json()) as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    if (j?.error) {
      if (typeof j.error.code === "string") code = j.error.code as ApiErrorCode;
      if (typeof j.error.message === "string") message = j.error.message;
      if (j.error.details && typeof j.error.details === "object") details = j.error.details;
    }
  } catch {
    // ignore — keep status-line fallback
  }
  return new ApiError(code, message, res.status, details);
}

export const API_BASE_URL = API_URL;
