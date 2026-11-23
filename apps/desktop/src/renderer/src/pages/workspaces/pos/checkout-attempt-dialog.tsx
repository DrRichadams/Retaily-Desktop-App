import { AlertCircle, Check, LoaderCircle, RefreshCw, SearchCheck } from "lucide-react";

import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import type { SalesServiceError } from "../../../services/sales.service";
import { formatMinor } from "./checkout-calculations";
import { checkoutRejectionMessage } from "./checkout-attempt-flow";
import styles from "./checkout-attempt-dialog.module.scss";

export type AttemptPhase = "saving" | "submitting" | "pending" | "unknown" | "rejected";

export interface ActiveCheckoutAttempt {
  idempotencyKey: string;
  request: RetailyCreateSaleRequest;
  phase: AttemptPhase;
  error?: SalesServiceError;
  message?: string;
  stage?: "save" | "sale";
}

interface CheckoutAttemptDialogProps {
  attempt: ActiveCheckoutAttempt;
  branchName: string;
  productNames: Record<string, string>;
  currency: string;
  isBusy: boolean;
  onSubmit: () => void;
  onRetry: () => void;
  onRecover: () => void;
  onReturnToCart: () => void;
}

function safeAttemptMessage(attempt: ActiveCheckoutAttempt) {
  if (attempt.message) return attempt.message;
  const error = attempt.error;
  if (!error) return "Your checkout attempt is saved and ready to continue.";
  if (error.kind === "session") return "Your session needs attention. Sign in again, then recover this attempt before continuing.";
  if (error.code.includes("IDEMPOTENCY") || error.code.includes("ATTEMPT_CONFLICT")) {
    return "This checkout key conflicts with a different saved request. The original attempt remains unchanged.";
  }
  return checkoutRejectionMessage(error.code, error.message);
}

export default function CheckoutAttemptDialog({
  attempt,
  branchName,
  productNames,
  currency,
  isBusy,
  onSubmit,
  onRetry,
  onRecover,
  onReturnToCart,
}: CheckoutAttemptDialogProps) {
  const pending = attempt.phase === "pending";
  const uncertain = attempt.phase === "unknown";
  const rejected = attempt.phase === "rejected";
  const busy = isBusy || attempt.phase === "saving" || attempt.phase === "submitting";
  const payments = attempt.request.payments;

  return (
    <Modal
      isOpen
      onClose={() => undefined}
      title={uncertain ? "Sale outcome not confirmed" : rejected ? "Checkout was not completed" : "Checkout attempt"}
      description={uncertain
        ? "Keep this attempt and key. Retry or check its saved status."
        : "This saved request cannot be changed. Any revision needs a new attempt."}
      size="large"
      closeOnOverlayClick={false}
      showCloseButton={false}
      footer={(
        <div className={styles.actions}>
          {rejected ? (
            <Button variant="outline" onClick={onReturnToCart}>Return to cart</Button>
          ) : uncertain ? (
            <>
              <Button variant="outline" onClick={onRecover} disabled={busy} leftIcon={<SearchCheck size={16} />}>Check attempt status</Button>
              <Button onClick={onRetry} disabled={busy} leftIcon={<RefreshCw size={16} />}>Retry same attempt</Button>
            </>
          ) : pending ? (
            <Button onClick={onSubmit} loading={busy}>Continue this checkout</Button>
          ) : null}
        </div>
      )}
    >
      <div className={`${styles.status} ${uncertain ? styles.uncertain : rejected ? styles.rejected : styles.pending}`}>
        {busy ? <LoaderCircle size={20} className={styles.spin} /> : uncertain || rejected ? <AlertCircle size={20} /> : <Check size={20} />}
        <div>
          <strong>{busy
            ? attempt.phase === "saving" ? "Saving checkout attempt…" : "Submitting sale…"
            : uncertain ? "No completion has been confirmed"
              : rejected ? "No sale was reported as completed"
                : "Saved checkout attempt"}</strong>
          <span>{safeAttemptMessage(attempt)}</span>
        </div>
      </div>
      <div className={styles.details}>
        <div><span>Branch</span><strong>{branchName}</strong></div>
        <div><span>Attempt key</span><code>{attempt.idempotencyKey}</code></div>
      </div>
      <h3 className={styles.heading}>Exact saved request</h3>
      <div className={styles.items}>
        {attempt.request.items.map((item) => (
          <div key={item.productId}>
            <span>{productNames[item.productId] ?? item.productId} × {item.quantity}</span>
            {item.discount?.type !== "none" && item.discount && <small>Item discount: {item.discount.type === "fixed" ? formatMinor(item.discount.value, currency) : `${(item.discount.value / 100).toFixed(2)}%`}</small>}
          </div>
        ))}
      </div>
      <h3 className={styles.heading}>Tender recorded for this attempt</h3>
      <div className={styles.payments}>
        {payments.map((payment, index) => (
          <div key={`${payment.method}-${index}`}>
            <span>{payment.method.replaceAll("_", " ")}{payment.reference ? ` · ${payment.reference}` : ""}</span>
            <strong>{formatMinor(payment.amountMinor, currency)}</strong>
          </div>
        ))}
      </div>
      {rejected && <p className={styles.retained}>This saved attempt remains on the server. Returning to the cart will not edit or remove it.</p>}
    </Modal>
  );
}
