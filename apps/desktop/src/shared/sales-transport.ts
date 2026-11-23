import {
  salesHttpFailure,
  salesSessionFailure,
  salesTransportFailure,
  type SalesIpcError,
  type SalesIpcResult,
} from "./sales-ipc.js";

const PAYMENT_METHODS = new Set([
  "cash",
  "card",
  "ecocash",
  "innbucks",
  "bank_transfer",
  "other",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSalePayment(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    typeof value.paymentMethod === "string" &&
    PAYMENT_METHODS.has(value.paymentMethod) &&
    typeof value.amountMinor === "number" &&
    Number.isSafeInteger(value.amountMinor) &&
    value.amountMinor > 0 &&
    isNonEmptyString(value.createdAt)
  );
}

function isSale(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    isNonEmptyString(value.saleNumber) &&
    isNonEmptyString(value.receiptNumber) &&
    typeof value.branchId === "string" &&
    UUID_PATTERN.test(value.branchId) &&
    isSafeInteger(value.subtotalMinor) &&
    isSafeInteger(value.discountAmountMinor) &&
    isSafeInteger(value.totalMinor) &&
    isSafeInteger(value.amountPaidMinor) &&
    isSafeInteger(value.changeMinor) &&
    Array.isArray(value.payments) &&
    value.payments.length > 0 &&
    value.payments.every(isSalePayment)
  );
}

function isCreateSaleResponse(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.message) &&
    isRecord(value.data) &&
    isSale(value.data)
  );
}

function malformedSuccessFailure(): SalesIpcError {
  return {
    kind: "unknown",
    status: null,
    code: "MALFORMED_SALES_RESPONSE",
    message:
      "The server response could not confirm the sale. Its outcome is unknown; retry or retrieve the same checkout attempt.",
    outcome: "unknown",
  };
}

export async function requestSales<T>(
  url: string,
  options: RequestInit,
  sessionToken: string | null,
  fetcher: typeof fetch = fetch,
  timeoutMs = 30_000,
): Promise<SalesIpcResult<T>> {
  if (!sessionToken) return { ok: false, error: salesSessionFailure() };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(options.headers);
  const isCreate =
    new URL(url).pathname === "/api/sales" && options.method === "POST";
  const idempotencyKey = isCreate
    ? headers.get("Idempotency-Key") ?? undefined
    : undefined;
  const withIdempotencyKey = (error: SalesIpcError): SalesIpcError =>
    idempotencyKey ? { ...error, idempotencyKey } : error;
  let response: Response;
  let bodyText: string;
  try {
    headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${sessionToken}`);
    response = await fetcher(url, { ...options, headers, signal: controller.signal });
    bodyText = await response.text();
  } catch {
    return {
      ok: false,
      error: withIdempotencyKey(
        salesTransportFailure(controller.signal.aborted ? "timeout" : "network"),
      ),
    };
  } finally {
    clearTimeout(timeout);
  }

  let body: unknown;
  let validJson = true;
  try {
    body = bodyText.length ? JSON.parse(bodyText) : null;
  } catch {
    validJson = false;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: withIdempotencyKey(
        salesHttpFailure(response.status, validJson ? body : null),
      ),
    };
  }

  if (!validJson || (isCreate && !isCreateSaleResponse(body))) {
    return { ok: false, error: withIdempotencyKey(malformedSuccessFailure()) };
  }

  return { ok: true, data: body as T };
}
