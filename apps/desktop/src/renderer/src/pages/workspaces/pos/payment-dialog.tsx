import { useMemo, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import {
  calculateCheckoutTotals,
  calculatePaymentTotals,
  currencyFractionDigits,
  formatMinor,
  parseMinorAmount,
  type CheckoutDiscount,
  type PaymentDraft,
} from "./checkout-calculations";
import {
  type CheckoutDraft,
  type CheckoutDraftAction,
  type DiscountDraft,
  noDiscount,
} from "./checkout-draft";
import styles from "./payment-dialog.module.scss";

type CartItem = { product: RetailyProduct; quantity: number };
interface PaymentDialogProps {
  isOpen: boolean;
  branch: RetailyBranch;
  currency: string;
  cart: CartItem[];
  permissions: string[];
  draft: CheckoutDraft;
  dispatchDraft: (action: CheckoutDraftAction) => void;
  onClose: () => void;
  onDiscard: () => void;
  onSubmit: (request: RetailyCreateSaleRequest) => void;
}

const paymentOptions = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "EcoCash", value: "ecocash" },
  { label: "InnBucks", value: "innbucks" },
  { label: "Bank transfer", value: "bank_transfer" },
  { label: "Other", value: "other" },
];

function toBps(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  if (whole.length > 3) return null;
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  return bps > 0n && bps <= 10000n ? Number(bps) : null;
}

function toCheckoutDiscount(
  draft: DiscountDraft,
  currency: string,
): CheckoutDiscount | null {
  if (draft.type === "none") return { type: "none" };
  if (draft.type === "percentage") {
    const value = toBps(draft.value);
    return value === null ? null : { type: "percentage", value };
  }
  const fractionDigits = currencyFractionDigits(currency);
  if (fractionDigits === null) return null;
  const value = parseMinorAmount(draft.value, fractionDigits);
  return value === null || value <= 0 ? null : { type: "fixed", value };
}

function amountInput(minor: bigint, fractionDigits: number) {
  const scale = 10n ** BigInt(fractionDigits);
  const whole = minor / scale;
  const fraction = (minor % scale).toString().padStart(fractionDigits, "0");
  return fractionDigits ? `${whole}.${fraction}` : whole.toString();
}

export default function PaymentDialog({
  isOpen,
  branch,
  currency,
  cart,
  permissions,
  draft,
  dispatchDraft,
  onClose,
  onDiscard,
  onSubmit,
}: PaymentDialogProps) {
  const canDiscountFull = permissions.includes("*") || permissions.includes("sales.discount_full");
  const canDiscountLimited = permissions.includes("sales.discount_limited");
  const canDiscount = canDiscountFull || canDiscountLimited;
  const fractionDigits = currencyFractionDigits(currency);
  const currencyValid = fractionDigits !== null;
  const { itemDiscounts, overallDiscount, payments } = draft;
  const [entryError, setEntryError] = useState("");

  const convertedItems = useMemo(() => cart.map(({ product, quantity }) => {
    const draft = itemDiscounts[product.id] ?? noDiscount;
    return {
      product,
      quantity,
      discount: toCheckoutDiscount(draft, currency),
      draft,
    };
  }), [cart, currency, itemDiscounts]);
  const convertedOverallDiscount = toCheckoutDiscount(overallDiscount, currency);
  const totals = calculateCheckoutTotals(
    convertedItems.map(({ product, quantity, discount }) => ({
      unitPriceMinor: product.sellingPriceMinor,
      quantity,
      discount: discount ?? { type: "none" },
    })),
    convertedOverallDiscount ?? { type: "none" },
    canDiscountFull,
    canDiscountLimited,
  );
  const paymentTotals = calculatePaymentTotals(payments, totals.totalMinor, fractionDigits);

  function updatePayment(index: number, patch: Partial<PaymentDraft>) {
    dispatchDraft({ type: "payment-update", index, patch });
  }

  function setItemDiscount(productId: string, patch: Partial<DiscountDraft>) {
    dispatchDraft({ type: "item-discount", productId, patch });
  }

  function setSaleDiscount(patch: Partial<DiscountDraft>) {
    dispatchDraft({ type: "sale-discount", patch });
  }

  function addPayment() {
    dispatchDraft({ type: "payment-add" });
  }

  function submit() {
    if (!currencyValid) {
      setEntryError("The business currency is invalid. Correct the currency configuration before taking payment.");
      return;
    }
    if (!totals.valid || !convertedOverallDiscount || convertedItems.some((item) => !item.discount)) {
      setEntryError(
        canDiscountLimited && !canDiscountFull
          ? "Check discount amounts. Your role can discount up to 10% of the original sale value."
          : "Check that each discount is valid and does not exceed its item or sale subtotal.",
      );
      return;
    }
    if (!paymentTotals.validAmounts || !paymentTotals.safeTotals) {
      setEntryError("Enter a positive, valid amount for every payment entry.");
      return;
    }
    if (!paymentTotals.enoughToPay) {
      setEntryError("Payments must cover the full sale total. No outstanding balance is allowed.");
      return;
    }
    if (!paymentTotals.cashCoversChange) {
      setEntryError("Change due must be covered by cash tender.");
      return;
    }

    const items = convertedItems.map(({ product, quantity, discount }) => ({
      productId: product.id,
      quantity,
      discount: discount!,
    }));
    const request: RetailyCreateSaleRequest = {
      branchId: branch.id,
      items,
      discount: convertedOverallDiscount,
      payments: payments.map((payment, index) => ({
        method: payment.method,
        amountMinor: paymentTotals.amounts[index]!,
        ...(payment.reference.trim() ? { reference: payment.reference.trim() } : {}),
        ...(payment.notes.trim() ? { notes: payment.notes.trim() } : {}),
      })),
    };
    setEntryError("");
    onSubmit(request);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Take payment"
      description="Review discounts and record how the customer paid."
      size="extraLarge"
      closeOnOverlayClick={false}
      footer={(
        <div className={styles.footer}>
          <Button variant="outline" onClick={onDiscard}>Discard draft</Button>
          <Button variant="outline" onClick={onClose}>Back to cart</Button>
          <Button onClick={submit} disabled={!currencyValid || !totals.valid || payments.length === 0}>
            Save attempt and complete sale
          </Button>
        </div>
      )}
    >
      <div className={styles.layout}>
        {!currencyValid && <div className={styles.formError} role="alert">The configured business currency is invalid. Payment is disabled until it is corrected.</div>}
        <section className={styles.main}>
          <div className={styles.branch}><span>Branch</span><strong>{branch.name}</strong><small>{branch.code}</small></div>
          <div className={styles.sectionHeading}><div><h3>Sale items</h3><p>Prices are confirmed by the server at checkout.</p></div><span>{cart.length} lines</span></div>
          <div className={styles.items}>
            {convertedItems.map(({ product, quantity, draft }) => (
              <div className={styles.item} key={product.id}>
                <div className={styles.itemHeading}>
                  <div><strong>{product.name}</strong><small>{quantity} × {formatMinor(product.sellingPriceMinor, currency)}</small></div>
                  <b>{formatMinor(BigInt(product.sellingPriceMinor) * BigInt(quantity), currency)}</b>
                </div>
                {canDiscount && (
                  <div className={styles.discountRow}>
                    <label>
                      <span>Item discount</span>
                      <select
                        value={draft.type}
                        onChange={(event) => setItemDiscount(product.id, {
                          type: event.target.value as DiscountDraft["type"], value: "",
                        })}
                      >
                        <option value="none">None</option>
                        <option value="fixed">Fixed amount</option>
                        <option value="percentage">Percentage</option>
                      </select>
                    </label>
                    {draft.type !== "none" && (
                      <label className={styles.discountValue}>
                        <span>{draft.type === "fixed" ? `Amount (${currency})` : "Percent"}</span>
                        <input
                          inputMode="decimal"
                          value={draft.value}
                          onChange={(event) => setItemDiscount(product.id, { value: event.target.value })}
                          placeholder={draft.type === "fixed" ? "0.00" : "0.00"}
                          aria-label={`${product.name} item discount value`}
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {canDiscount && (
            <div className={styles.overallDiscount}>
              <div><h3>Overall discount</h3><p>{canDiscountFull ? "Full discount permission" : "Limited to 10% of original sale value"}</p></div>
              <label>
                <span>Type</span>
                <select value={overallDiscount.type} onChange={(event) => setSaleDiscount({
                  type: event.target.value as DiscountDraft["type"], value: "",
                })}>
                  <option value="none">None</option>
                  <option value="fixed">Fixed amount</option>
                  <option value="percentage">Percentage</option>
                </select>
              </label>
              {overallDiscount.type !== "none" && (
                <label>
                  <span>{overallDiscount.type === "fixed" ? `Amount (${currency})` : "Percent"}</span>
                  <input inputMode="decimal" value={overallDiscount.value} onChange={(event) => setSaleDiscount({ value: event.target.value })} placeholder="0.00" />
                </label>
              )}
            </div>
          )}

          <div className={styles.paymentHeading}><div><h3>Payment entries</h3><p>Card details and PINs are never collected here.</p></div><Button variant="outline" size="small" onClick={addPayment} disabled={payments.length >= 10} leftIcon={<Plus size={15} />}>Add payment</Button></div>
          <div className={styles.paymentList}>
            {payments.map((payment, index) => (
              <div className={styles.paymentRow} key={index}>
                <Select
                  label="Method"
                  value={payment.method}
                  options={paymentOptions}
                  placeholder="Payment method"
                  onChange={(event) => updatePayment(index, { method: event.target.value as RetailyPaymentMethod })}
                />
                <Input label={`Amount (${currency})`} inputMode="decimal" value={payment.amount} onChange={(event) => updatePayment(index, { amount: event.target.value })} placeholder="0.00" />
                <Input label="Reference (optional)" value={payment.reference} maxLength={120} onChange={(event) => updatePayment(index, { reference: event.target.value })} />
                <Input label="Notes (optional)" value={payment.notes} maxLength={500} onChange={(event) => updatePayment(index, { notes: event.target.value })} />
                <button type="button" className={styles.removePayment} aria-label={`Remove payment ${index + 1}`} onClick={() => dispatchDraft({ type: "payment-remove", index })} disabled={payments.length <= 1}><Trash2 size={17} /></button>
              </div>
            ))}
            {payments.length === 0 && <div className={styles.emptyPayments}><Minus size={16} /> Add a payment entry to continue.</div>}
          </div>
          {entryError && <div className={styles.formError} role="alert">{entryError}</div>}
        </section>

        <aside className={styles.summary}>
          <span className={styles.summaryEyebrow}>CHECKOUT SUMMARY</span>
          <div><span>Subtotal</span><strong>{formatMinor(totals.originalSubtotalMinor, currency)}</strong></div>
          {totals.itemDiscountMinor > 0n && <div><span>Item discounts</span><strong>−{formatMinor(totals.itemDiscountMinor, currency)}</strong></div>}
          {totals.subtotalAfterItemsMinor !== totals.originalSubtotalMinor && <div><span>After item discounts</span><strong>{formatMinor(totals.subtotalAfterItemsMinor, currency)}</strong></div>}
          <div><span>Overall discount</span><strong>−{formatMinor(totals.overallDiscountMinor, currency)}</strong></div>
          <div className={styles.total}><span>Total payable</span><strong>{formatMinor(totals.totalMinor, currency)}</strong></div>
          <div><span>Amount tendered</span><strong>{formatMinor(paymentTotals.paidMinor, currency)}</strong></div>
          {paymentTotals.remainingMinor > 0n ? (
            <div className={styles.balance}><span>Remaining balance</span><strong>{formatMinor(paymentTotals.remainingMinor, currency)}</strong></div>
          ) : paymentTotals.changeMinor > 0n ? (
            <div className={styles.change}><span>Change due</span><strong>{formatMinor(paymentTotals.changeMinor, currency)}</strong></div>
          ) : null}
          {paymentTotals.changeMinor > 0n && !paymentTotals.cashCoversChange && <p className={styles.cashWarning}>Change must be funded by cash tender.</p>}
          {canDiscountLimited && !canDiscountFull && <p className={styles.permissionNote}>Discount limit includes item and overall discounts and is checked again by the server.</p>}
        </aside>
      </div>
    </Modal>
  );
}
