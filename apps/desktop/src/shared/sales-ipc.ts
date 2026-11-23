export interface SalesIpcError {
  kind: "http" | "session" | "network" | "timeout" | "unknown";
  status: number | null;
  code: string;
  message: string;
  outcome: "rejected" | "unknown";
  idempotencyKey?: string;
  details?: unknown;
}

export type SalesIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SalesIpcError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fallbackHttpCode(status: number) {
  if (status === 400) return "VALIDATION_ERROR";
  if (status === 401) return "AUTHENTICATION_REQUIRED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status >= 500) return "SERVER_ERROR";
  return "HTTP_ERROR";
}

export function salesHttpFailure(status: number, body: unknown): SalesIpcError {
  const payload = isRecord(body) ? body : {};
  const publicMessage =
    typeof payload.error === "string" &&
    payload.error.length <= 300 &&
    !/[\r\n]|(?:^|\s)at\s.+(?:\(|$)|[A-Za-z]:\\/.test(payload.error)
      ? payload.error
      : `The server rejected the request (${status}).`;
  return {
    kind: status === 401 ? "session" : "http",
    status,
    code:
      typeof payload.code === "string"
        ? payload.code
        : fallbackHttpCode(status),
    message: publicMessage,
    outcome: status >= 500 ? "unknown" : "rejected",
  };
}

export function salesSessionFailure(): SalesIpcError {
  return {
    kind: "session",
    status: null,
    code: "SESSION_REQUIRED",
    message: "Sign in again before continuing.",
    outcome: "rejected",
  };
}

export function salesTransportFailure(
  kind: "network" | "timeout" | "unknown",
): SalesIpcError {
  if (kind === "timeout") {
    return {
      kind,
      status: null,
      code: "REQUEST_TIMEOUT",
      message:
        "The request timed out. Its outcome is not confirmed; retry the same checkout attempt.",
      outcome: "unknown",
    };
  }

  if (kind === "network") {
    return {
      kind,
      status: null,
      code: "NETWORK_ERROR",
      message:
        "The local server could not be reached. Its outcome may be unknown; retry the same checkout attempt.",
      outcome: "unknown",
    };
  }

  return {
    kind,
    status: null,
    code: "REQUEST_FAILED",
    message: "The request could not be completed.",
    outcome: "unknown",
  };
}

export function salesLocalFailure(
  message: string,
  code = "VALIDATION_ERROR",
): SalesIpcError {
  return {
    kind: "http",
    status: 400,
    code,
    message,
    outcome: "rejected",
  };
}

export class SalesServiceError extends Error {
  readonly kind: SalesIpcError["kind"];
  readonly status: number | null;
  readonly code: string;
  readonly outcome: SalesIpcError["outcome"];
  readonly idempotencyKey?: string;
  readonly details?: unknown;

  constructor(failure: SalesIpcError) {
    super(failure.message);
    this.name = "SalesServiceError";
    this.kind = failure.kind;
    this.status = failure.status;
    this.code = failure.code;
    this.outcome = failure.outcome;
    this.idempotencyKey = failure.idempotencyKey;
    this.details = failure.details;
  }
}

export function unwrapSalesResult<T>(result: SalesIpcResult<T>): T {
  if (result.ok === false) throw new SalesServiceError(result.error);
  return result.data;
}
