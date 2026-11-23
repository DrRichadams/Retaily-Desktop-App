import assert from "node:assert/strict";

import {
  SalesServiceError,
  unwrapSalesResult,
} from "../desktop/src/shared/sales-ipc.ts";
import { requestSales } from "../desktop/src/shared/sales-transport.ts";

const createUrl = "http://127.0.0.1:4317/api/sales";
const createOptions: RequestInit = {
  method: "POST",
  headers: { "Idempotency-Key": "transport-test-key" },
  body: JSON.stringify({ items: [] }),
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function expectFailure(
  result: Awaited<ReturnType<typeof requestSales>>,
  expected: Partial<Pick<SalesServiceError, "kind" | "status" | "code" | "outcome" | "idempotencyKey">>,
) {
  assert.equal(result.ok, false);
  assert.throws(
    () => unwrapSalesResult(result),
    (error: unknown) => {
      assert.ok(error instanceof SalesServiceError);
      for (const [field, value] of Object.entries(expected)) {
        assert.equal(error[field as keyof SalesServiceError], value, field);
      }
      assert.equal(error.message.includes("stack"), false);
      return true;
    },
  );
}

async function main() {
  const cases = [
    { status: 400, kind: "http", code: "VALIDATION_ERROR", outcome: "rejected" },
    { status: 401, kind: "session", code: "AUTHENTICATION_REQUIRED", outcome: "rejected" },
    { status: 403, kind: "http", code: "PERMISSION_DENIED", outcome: "rejected" },
    { status: 404, kind: "http", code: "NOT_FOUND", outcome: "rejected" },
    { status: 409, kind: "http", code: "SALE_IDEMPOTENCY_CONFLICT", outcome: "rejected" },
    { status: 500, kind: "http", code: "INTERNAL_ERROR", outcome: "unknown" },
  ] as const;

  for (const item of cases) {
    const result = await requestSales(
      createUrl,
      createOptions,
      "test-session",
      async () => jsonResponse(item.status, {
        code: item.status === 409 ? item.code : item.status === 500 ? item.code : undefined,
        error: item.status === 500
          ? "Error: confidential detail\n    at private/path"
          : "safe server message",
      }),
    );
    await expectFailure(result, {
      kind: item.kind,
      status: item.status,
      code: item.code,
      outcome: item.outcome,
    });
    if (item.status === 500 && result.ok === false) {
      assert.equal(result.error.message.includes("confidential"), false);
    }
  }

  await expectFailure(
    await requestSales(createUrl, createOptions, null),
    { kind: "session", status: null, code: "SESSION_REQUIRED", outcome: "rejected" },
  );

  await expectFailure(
    await requestSales(createUrl, createOptions, "test-session", async () =>
      new Response("not-json", { status: 400 }),
    ),
    { kind: "http", status: 400, code: "VALIDATION_ERROR", outcome: "rejected" },
  );

  await expectFailure(
    await requestSales(createUrl, createOptions, "test-session", async () => {
      throw new TypeError("private network detail");
    }),
    { kind: "network", status: null, code: "NETWORK_ERROR", outcome: "unknown", idempotencyKey: "transport-test-key" },
  );

  await expectFailure(
    await requestSales(
      createUrl,
      createOptions,
      "test-session",
      (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }),
      5,
    ),
    { kind: "timeout", status: null, code: "REQUEST_TIMEOUT", outcome: "unknown", idempotencyKey: "transport-test-key" },
  );

  await expectFailure(
    await requestSales(createUrl, createOptions, "test-session", async () =>
      new Response("broken-json", { status: 201 }),
    ),
    { kind: "unknown", status: null, code: "MALFORMED_SALES_RESPONSE", outcome: "unknown", idempotencyKey: "transport-test-key" },
  );

  await expectFailure(
    await requestSales(createUrl, createOptions, "test-session", async () =>
      jsonResponse(201, { data: {} }),
    ),
    { kind: "unknown", status: null, code: "MALFORMED_SALES_RESPONSE", outcome: "unknown", idempotencyKey: "transport-test-key" },
  );

  const validSaleResponse = {
    message: "Sale completed successfully.",
    data: {
      id: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
      saleNumber: "SAL-001",
      receiptNumber: "RCT-001",
      branchId: "6ba7b811-9dad-41d1-80b4-00c04fd430c8",
      subtotalMinor: 100,
      discountAmountMinor: 0,
      totalMinor: 100,
      amountPaidMinor: 100,
      changeMinor: 0,
      payments: [{
        id: "6ba7b812-9dad-41d1-80b4-00c04fd430c8",
        paymentMethod: "cash",
        amountMinor: 100,
        createdAt: "2026-01-01T00:00:00.000Z",
      }],
    },
  };
  const validResult = await requestSales(
    createUrl,
    createOptions,
    "test-session",
    async () => jsonResponse(201, validSaleResponse),
  );
  assert.equal(validResult.ok, true);
  assert.deepEqual(unwrapSalesResult(validResult), validSaleResponse);

  console.log("PASS: structured sales transport and response validation tests");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
