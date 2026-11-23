import type { PaymentDraft } from "./checkout-calculations";

export interface DiscountDraft {
  type: "none" | "fixed" | "percentage";
  value: string;
}

export interface CheckoutDraft {
  itemDiscounts: Record<string, DiscountDraft>;
  overallDiscount: DiscountDraft;
  payments: PaymentDraft[];
}

export type CheckoutDraftAction =
  | { type: "item-discount"; productId: string; patch: Partial<DiscountDraft> }
  | { type: "sale-discount"; patch: Partial<DiscountDraft> }
  | { type: "payment-update"; index: number; patch: Partial<PaymentDraft> }
  | { type: "payment-add" }
  | { type: "payment-remove"; index: number }
  | { type: "discard" };

export const noDiscount: DiscountDraft = { type: "none", value: "" };

export function createCheckoutDraft(): CheckoutDraft {
  return {
    itemDiscounts: {},
    overallDiscount: { ...noDiscount },
    payments: [],
  };
}

export function checkoutDraftReducer(
  state: CheckoutDraft,
  action: CheckoutDraftAction,
): CheckoutDraft {
  switch (action.type) {
    case "item-discount":
      return {
        ...state,
        itemDiscounts: {
          ...state.itemDiscounts,
          [action.productId]: {
            ...(state.itemDiscounts[action.productId] ?? noDiscount),
            ...action.patch,
          },
        },
      };
    case "sale-discount":
      return {
        ...state,
        overallDiscount: { ...state.overallDiscount, ...action.patch },
      };
    case "payment-update":
      return {
        ...state,
        payments: state.payments.map((payment, index) =>
          index === action.index ? { ...payment, ...action.patch } : payment,
        ),
      };
    case "payment-add":
      return state.payments.length >= 10
        ? state
        : {
            ...state,
            payments: [
              ...state.payments,
              { method: "cash", amount: "", reference: "", notes: "" },
            ],
          };
    case "payment-remove":
      return state.payments.length <= 1
        ? state
        : {
            ...state,
            payments: state.payments.filter((_, index) => index !== action.index),
          };
    case "discard":
      return createCheckoutDraft();
  }
}

/** Closing the dialog, including Escape, preserves the in-progress draft. */
export function closeCheckoutDraft(draft: CheckoutDraft) {
  return { isOpen: false, draft };
}

/** A draft is cleared only after an explicit discard has been confirmed. */
export function discardCheckoutDraft(draft: CheckoutDraft, confirmed: boolean) {
  return confirmed
    ? { isOpen: false, draft: checkoutDraftReducer(draft, { type: "discard" }) }
    : { isOpen: true, draft };
}
