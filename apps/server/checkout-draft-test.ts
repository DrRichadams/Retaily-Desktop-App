import assert from "node:assert/strict";

import {
  checkoutDraftReducer,
  closeCheckoutDraft,
  createCheckoutDraft,
  discardCheckoutDraft,
} from "../desktop/src/renderer/src/pages/workspaces/pos/checkout-draft.ts";

function main() {
  let draft = createCheckoutDraft();
  draft = checkoutDraftReducer(draft, { type: "payment-add" });
  draft = checkoutDraftReducer(draft, {
    type: "payment-update",
    index: 0,
    patch: { amount: "12.34", reference: "terminal-42" },
  });
  draft = checkoutDraftReducer(draft, {
    type: "item-discount",
    productId: "product-1",
    patch: { type: "percentage", value: "5.00" },
  });
  draft = checkoutDraftReducer(draft, {
    type: "sale-discount",
    patch: { type: "fixed", value: "1.25" },
  });

  // Back, Escape, and the modal close button all use the same non-destructive close transition.
  const closed = closeCheckoutDraft(draft);
  assert.equal(closed.isOpen, false);
  assert.strictEqual(closed.draft, draft);
  const reopened = { isOpen: true, draft: closed.draft };
  assert.equal(reopened.draft.payments[0].amount, "12.34");
  assert.equal(reopened.draft.itemDiscounts["product-1"].value, "5.00");
  assert.equal(reopened.draft.overallDiscount.value, "1.25");

  const notConfirmed = discardCheckoutDraft(reopened.draft, false);
  assert.equal(notConfirmed.isOpen, true);
  assert.strictEqual(notConfirmed.draft, reopened.draft);

  const changedDraft = checkoutDraftReducer(reopened.draft, {
    type: "payment-update",
    index: 0,
    patch: { amount: "99.99" },
  });
  assert.equal(changedDraft.payments[0].amount, "99.99");

  const discarded = discardCheckoutDraft(changedDraft, true);
  assert.equal(discarded.isOpen, false);
  assert.deepEqual(discarded.draft, createCheckoutDraft());

  console.log("PASS: POS checkout draft close, retain, and discard tests");
}

main();
