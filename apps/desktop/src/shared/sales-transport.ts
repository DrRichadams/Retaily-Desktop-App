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

function isDiscountType(value: unknown): boolean {
  return value === "none" || value === "fixed" || value === "percentage";
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
  const isSaleItem = (item: unknown) =>
    isRecord(item) &&
    typeof item.id === "string" && UUID_PATTERN.test(item.id) &&
    typeof item.productId === "string" && UUID_PATTERN.test(item.productId) &&
    isNonEmptyString(item.productName) &&
    isNonEmptyString(item.productSku) &&
    isNonEmptyString(item.productUnit) &&
    typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0 &&
    isSafeInteger(item.unitCostMinor) &&
    isSafeInteger(item.unitPriceMinor) &&
    isSafeInteger(item.lineSubtotalMinor) &&
    isDiscountType(item.discountType) &&
    isSafeInteger(item.discountValue) &&
    isSafeInteger(item.discountAmountMinor) &&
    isSafeInteger(item.lineTotalMinor);

  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    typeof value.businessId === "string" && UUID_PATTERN.test(value.businessId) &&
    typeof value.employeeId === "string" && UUID_PATTERN.test(value.employeeId) &&
    isNonEmptyString(value.saleNumber) &&
    isNonEmptyString(value.receiptNumber) &&
    typeof value.branchId === "string" &&
    UUID_PATTERN.test(value.branchId) &&
    (value.status === "completed" || value.status === "voided") &&
    isNonEmptyString(value.currency) &&
    isSafeInteger(value.subtotalMinor) &&
    isDiscountType(value.discountType) &&
    isSafeInteger(value.discountValue) &&
    isSafeInteger(value.discountAmountMinor) &&
    isSafeInteger(value.totalMinor) &&
    isSafeInteger(value.amountPaidMinor) &&
    isSafeInteger(value.changeMinor) &&
    (value.customerId === null || typeof value.customerId === "string") &&
    (value.notes === null || typeof value.notes === "string") &&
    isNonEmptyString(value.completedAt) &&
    isNonEmptyString(value.createdAt) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(isSaleItem) &&
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
    value.data.status === "completed" &&
    isSale(value.data)
  );
}

function isCreateSaleRequest(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.branchId === "string" && UUID_PATTERN.test(value.branchId) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every((item) =>
      isRecord(item) &&
      typeof item.productId === "string" && UUID_PATTERN.test(item.productId) &&
      typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0,
    ) &&
    Array.isArray(value.payments) &&
    value.payments.length > 0 &&
    value.payments.every((payment) =>
      isRecord(payment) &&
      typeof payment.method === "string" && PAYMENT_METHODS.has(payment.method) &&
      typeof payment.amountMinor === "number" && Number.isSafeInteger(payment.amountMinor) && payment.amountMinor > 0,
    )
  );
}

function isCheckoutAttempt(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.idempotencyKey) ||
    (value.status !== "pending" && value.status !== "completed") ||
    !isCreateSaleRequest(value.request) ||
    !isNonEmptyString(value.createdAt) ||
    !isNonEmptyString(value.updatedAt) ||
    !(value.saleId === null || (typeof value.saleId === "string" && UUID_PATTERN.test(value.saleId))) ||
    !(value.completedAt === null || isNonEmptyString(value.completedAt)) ||
    !(value.sale === null || isSale(value.sale))
  ) return false;

  return value.status === "pending"
    ? value.saleId === null && value.completedAt === null && value.sale === null
    : value.saleId !== null && value.completedAt !== null && isRecord(value.sale) && value.sale.id === value.saleId;
}

function isAttemptEnvelope(value: unknown): boolean {
  return isRecord(value) && isCheckoutAttempt(value.data);
}

function isAttemptListEnvelope(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isCheckoutAttempt);
}

function isSaleEnvelope(value: unknown): boolean {
  return isRecord(value) && isSale(value.data);
}

function isSalesListEnvelope(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) return false;
  return Number.isSafeInteger(value.pagination.page) && Number(value.pagination.page) > 0 &&
    Number.isSafeInteger(value.pagination.limit) && Number(value.pagination.limit) > 0 &&
    Number.isSafeInteger(value.pagination.total) && Number(value.pagination.total) >= 0 &&
    Number.isSafeInteger(value.pagination.totalPages) && Number(value.pagination.totalPages) >= 0;
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
  const requestUrl = new URL(url);
  const pathname = requestUrl.pathname;
  const method = options.method ?? "GET";
  const isCreate = pathname === "/api/sales" && method === "POST";
  const isAttemptSave = pathname === "/api/sales/checkout-attempts" && method === "POST";
  const isAttemptLookup = pathname === "/api/sales/checkout-attempts/by-key";
  const isAttemptList = pathname === "/api/sales/checkout-attempts" && method === "GET";
  const isSaleLookup = /^\/api\/sales\/[0-9a-f-]+$/i.test(pathname);
  const isSalesList = pathname === "/api/sales" && method === "GET";
  const idempotencyKey = isCreate || isAttemptSave
    ? headers.get("Idempotency-Key") ?? undefined
    : isAttemptLookup
      ? requestUrl.searchParams.get("idempotencyKey") ?? undefined
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

  const validSalesResponse =
    (!isCreate || isCreateSaleResponse(body)) &&
    (!isAttemptSave && !isAttemptLookup || isAttemptEnvelope(body)) &&
    (!isAttemptList || isAttemptListEnvelope(body)) &&
    (!isSaleLookup || isSaleEnvelope(body)) &&
    (!isSalesList || isSalesListEnvelope(body));
  if (!validJson || !validSalesResponse) {
    return { ok: false, error: withIdempotencyKey(malformedSuccessFailure()) };
  }

  return { ok: true, data: body as T };
}
