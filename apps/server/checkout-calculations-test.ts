import assert from "node:assert/strict";

import {
  calculateCheckoutTotals,
  calculatePaymentTotals,
  parseMinorAmount,
  type CheckoutLineInput,
  type PaymentDraft,
} from "../desktop/src/renderer/src/pages/workspaces/pos/checkout-calculations.ts";

const noLineDiscount: CheckoutLineInput = {
  unitPriceMinor: 1000,
  quantity: 1,
  discount: { type: "none" },
};

function payment(method: RetailyPaymentMethod, amount: string): PaymentDraft {
  return { method, amount, reference: "", notes: "" };
}

function paymentTotals(entries: PaymentDraft[], total = 1000n) {
  return calculatePaymentTotals(entries, total, 2);
}

function main() {
  assert.equal(parseMinorAmount("12.34", 2), 1234);
  assert.equal(parseMinorAmount("12.345", 2), null);
  assert.equal(parseMinorAmount("90071992547409.92", 2), null);

  const exactCash = paymentTotals([payment("cash", "10.00")]);
  assert.equal(exactCash.validAmounts, true);
  assert.equal(exactCash.enoughToPay, true);
  assert.equal(exactCash.changeMinor, 0n);

  const cashChange = paymentTotals([payment("cash", "12.00")]);
  assert.equal(cashChange.changeMinor, 200n);
  assert.equal(cashChange.cashCoversChange, true);

  for (const method of ["card", "ecocash"] as const) {
    const singleElectronic = paymentTotals([payment(method, "10.00")]);
    assert.equal(singleElectronic.enoughToPay, true, method);
    assert.equal(singleElectronic.cashCoversChange, true, method);
  }

  const splitExact = paymentTotals([
    payment("cash", "4.00"),
    payment("ecocash", "6.00"),
  ]);
  assert.equal(splitExact.paidMinor, 1000n);
  assert.equal(splitExact.enoughToPay, true);

  const splitCashChange = paymentTotals([
    payment("cash", "8.00"),
    payment("ecocash", "5.00"),
  ]);
  assert.equal(splitCashChange.changeMinor, 300n);
  assert.equal(splitCashChange.cashCoversChange, true);

  const underpaid = paymentTotals([payment("cash", "9.99")]);
  assert.equal(underpaid.remainingMinor, 1n);
  assert.equal(underpaid.enoughToPay, false);

  const unfundedChange = paymentTotals([
    payment("card", "12.00"),
    payment("cash", "1.00"),
  ]);
  assert.equal(unfundedChange.changeMinor, 300n);
  assert.equal(unfundedChange.cashCoversChange, false);

  const limitedAllowed = calculateCheckoutTotals(
    [noLineDiscount],
    { type: "percentage", value: 1000 },
    false,
    true,
  );
  assert.equal(limitedAllowed.valid, true);
  assert.equal(limitedAllowed.totalMinor, 900n);

  const limitedRejected = calculateCheckoutTotals(
    [noLineDiscount],
    { type: "percentage", value: 1010 },
    false,
    true,
  );
  assert.equal(limitedRejected.valid, false);

  const fixedItemAndSaleDiscount = calculateCheckoutTotals(
    [{ ...noLineDiscount, discount: { type: "fixed", value: 200 } }],
    { type: "fixed", value: 100 },
    true,
    false,
  );
  assert.equal(fixedItemAndSaleDiscount.itemDiscountMinor, 200n);
  assert.equal(fixedItemAndSaleDiscount.overallDiscountMinor, 100n);
  assert.equal(fixedItemAndSaleDiscount.totalMinor, 700n);

  const fullAllowed = calculateCheckoutTotals(
    [noLineDiscount],
    { type: "percentage", value: 2500 },
    true,
    true,
  );
  assert.equal(fullAllowed.valid, true);
  assert.equal(fullAllowed.totalMinor, 750n);

  const serverRound = calculateCheckoutTotals(
    [{ ...noLineDiscount, unitPriceMinor: 100 }],
    { type: "percentage", value: 50 },
    true,
    false,
  );
  assert.equal(serverRound.overallDiscountMinor, 1n);

  console.log("PASS: isolated POS checkout calculation tests");
}

main();
