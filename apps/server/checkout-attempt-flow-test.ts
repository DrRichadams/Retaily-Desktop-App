import assert from "node:assert/strict";

import {
  branchChangeNeedsCartConfirmation,
  canChangeBranch,
  canSubmitAttempt,
  CheckoutOperationGate,
  checkoutRejectionMessage,
  persistAndSubmitAttempt,
  recoverAttempt,
  retryExactAttempt,
} from "../desktop/src/renderer/src/pages/workspaces/pos/checkout-attempt-flow.ts";

const request: RetailyCreateSaleRequest = {
  branchId: "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
  items: [{ productId: "6ba7b811-9dad-41d1-80b4-00c04fd430c8", quantity: 1 }],
  payments: [{ method: "cash", amountMinor: 1200 }],
};
const key = "checkout-flow-test-key";

const sale = {
  id: "6ba7b812-9dad-41d1-80b4-00c04fd430c8",
  businessId: "6ba7b813-9dad-41d1-80b4-00c04fd430c8",
  branchId: request.branchId,
  employeeId: "6ba7b814-9dad-41d1-80b4-00c04fd430c8",
  customerId: null,
  saleNumber: "SAL-TEST",
  receiptNumber: "RCT-TEST",
  status: "completed" as const,
  currency: "USD",
  subtotalMinor: 1000,
  discountType: "none" as const,
  discountValue: 0,
  discountAmountMinor: 0,
  totalMinor: 1000,
  amountPaidMinor: 1200,
  changeMinor: 200,
  notes: null,
  completedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  items: [],
  payments: [],
};

const pendingAttempt: RetailyCheckoutAttempt = {
  idempotencyKey: key,
  status: "pending",
  request,
  saleId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  completedAt: null,
  sale: null,
};

async function main() {
  const calls: string[] = [];
  const api = {
    async saveCheckoutAttempt(input: RetailyCreateSaleRequest, idempotencyKey: string) {
      calls.push(`save:${idempotencyKey}`);
      assert.equal(input, request);
      return { data: pendingAttempt };
    },
    async createSale(input: RetailyCreateSaleRequest, idempotencyKey: string) {
      calls.push(`sale:${idempotencyKey}`);
      assert.equal(input, request);
      return { message: "completed", data: sale };
    },
    async getCheckoutAttempt(idempotencyKey: string) {
      calls.push(`get:${idempotencyKey}`);
      return { data: { ...pendingAttempt, status: "completed" as const, saleId: sale.id, sale } };
    },
  };

  let saved = false;
  let submitting = false;
  const completed = await persistAndSubmitAttempt(
    api,
    request,
    key,
    () => { saved = true; },
    () => { submitting = true; },
  );
  assert.equal(saved, true);
  assert.equal(submitting, true);
  assert.equal(completed.id, sale.id);
  assert.deepEqual(calls, [`save:${key}`, `sale:${key}`]);

  calls.length = 0;
  let failOnce = true;
  const uncertainApi = {
    ...api,
    async createSale(input: RetailyCreateSaleRequest, idempotencyKey: string) {
      calls.push(`sale:${idempotencyKey}`);
      assert.equal(input, request);
      if (failOnce) {
        failOnce = false;
        throw new Error("simulated timeout");
      }
      return { message: "replayed", data: sale };
    },
  };
  await assert.rejects(() => uncertainApi.createSale(request, key));
  const retriedSale = await retryExactAttempt(
    uncertainApi,
    request,
    key,
    "sale",
    () => assert.fail("sale-stage retry must not create a new attempt"),
    () => { submitting = true; },
  );
  assert.equal(retriedSale.id, sale.id);
  assert.deepEqual(calls, [`sale:${key}`, `sale:${key}`]);

  calls.length = 0;
  let saveFailsOnce = true;
  const saveRetryApi = {
    ...api,
    async saveCheckoutAttempt(input: RetailyCreateSaleRequest, idempotencyKey: string) {
      calls.push(`save:${idempotencyKey}`);
      assert.equal(input, request);
      if (saveFailsOnce) {
        saveFailsOnce = false;
        throw new Error("simulated save timeout");
      }
      return { data: pendingAttempt };
    },
    async createSale(input: RetailyCreateSaleRequest, idempotencyKey: string) {
      calls.push(`sale:${idempotencyKey}`);
      assert.equal(input, request);
      return { message: "completed", data: sale };
    },
  };
  await assert.rejects(() => saveRetryApi.saveCheckoutAttempt(request, key));
  const savedRetrySale = await retryExactAttempt(
    saveRetryApi,
    request,
    key,
    "save",
    () => undefined,
    () => undefined,
  );
  assert.equal(savedRetrySale.id, sale.id);
  assert.deepEqual(calls, [`save:${key}`, `save:${key}`, `sale:${key}`]);

  calls.length = 0;
  const completedSaveApi = {
    ...api,
    async saveCheckoutAttempt() {
      calls.push(`save:${key}`);
      return { data: { ...pendingAttempt, status: "completed" as const, saleId: sale.id, sale } };
    },
  };
  const completedFromSave = await persistAndSubmitAttempt(
    completedSaveApi,
    request,
    key,
    () => undefined,
    () => assert.fail("completed attempts must not be resubmitted"),
  );
  assert.equal(completedFromSave.id, sale.id);
  assert.deepEqual(calls, [`save:${key}`]);

  calls.length = 0;
  const recovered = await recoverAttempt(api, key);
  assert.equal(recovered.status, "completed");
  assert.equal(recovered.sale?.id, sale.id);
  assert.deepEqual(calls, [`get:${key}`]);

  const gate = new CheckoutOperationGate();
  assert.equal(gate.tryAcquire(), true);
  assert.equal(gate.tryAcquire(), false);
  gate.release();
  assert.equal(gate.tryAcquire(), true);
  gate.release();
  assert.equal(canSubmitAttempt("pending"), true);
  assert.equal(canSubmitAttempt("unknown"), false);
  assert.equal(canSubmitAttempt("completed"), false);
  assert.equal(canChangeBranch(false), true);
  assert.equal(canChangeBranch(true), false);
  assert.equal(branchChangeNeedsCartConfirmation(true), true);
  assert.equal(branchChangeNeedsCartConfirmation(false), false);
  assert.match(checkoutRejectionMessage("INSUFFICIENT_PAYMENT", "rejected"), /price may have changed/);

  console.log("PASS: isolated POS checkout attempt flow tests");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
