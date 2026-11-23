export class CheckoutOperationGate {
  private locked = false;

  get isLocked() {
    return this.locked;
  }

  tryAcquire() {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  release() {
    this.locked = false;
  }
}

export type CheckoutStage = "save" | "sale";

interface CheckoutSalesApi {
  saveCheckoutAttempt(
    request: RetailyCreateSaleRequest,
    idempotencyKey: string,
  ): Promise<RetailyCheckoutAttemptResponse>;
  createSale(
    request: RetailyCreateSaleRequest,
    idempotencyKey: string,
  ): Promise<RetailyCreateSaleResponse>;
  getCheckoutAttempt(idempotencyKey: string): Promise<RetailyCheckoutAttemptResponse>;
}

export async function persistAndSubmitAttempt(
  api: CheckoutSalesApi,
  request: RetailyCreateSaleRequest,
  idempotencyKey: string,
  onSaved: (attempt: RetailyCheckoutAttempt) => void,
  onSubmitting: () => void,
): Promise<RetailySaleResponse> {
  const saved = await api.saveCheckoutAttempt(request, idempotencyKey);
  onSaved(saved.data);
  if (saved.data.status === "completed" && saved.data.sale) return saved.data.sale;
  onSubmitting();
  return (await api.createSale(request, idempotencyKey)).data;
}

export async function retryExactAttempt(
  api: CheckoutSalesApi,
  request: RetailyCreateSaleRequest,
  idempotencyKey: string,
  stage: CheckoutStage,
  onSaved: (attempt: RetailyCheckoutAttempt) => void,
  onSubmitting: () => void,
): Promise<RetailySaleResponse> {
  if (stage === "save") {
    const saved = await api.saveCheckoutAttempt(request, idempotencyKey);
    onSaved(saved.data);
    if (saved.data.status === "completed" && saved.data.sale) return saved.data.sale;
  }
  onSubmitting();
  return (await api.createSale(request, idempotencyKey)).data;
}

export async function submitSavedAttempt(
  api: CheckoutSalesApi,
  request: RetailyCreateSaleRequest,
  idempotencyKey: string,
): Promise<RetailySaleResponse> {
  return (await api.createSale(request, idempotencyKey)).data;
}

export function canSubmitAttempt(phase: string): boolean {
  return phase === "pending";
}

export function checkoutRejectionMessage(code: string | undefined, safeMessage: string): string {
  if (code === "INSUFFICIENT_PAYMENT") {
    return "The current product price may have changed. Review the cart and prepare a new checkout attempt with updated payment amounts.";
  }
  return safeMessage;
}

export function canChangeBranch(checkoutLocked: boolean): boolean {
  return !checkoutLocked;
}

export function branchChangeNeedsCartConfirmation(hasCart: boolean): boolean {
  return hasCart;
}

export async function recoverAttempt(
  api: CheckoutSalesApi,
  idempotencyKey: string,
): Promise<RetailyCheckoutAttempt> {
  return (await api.getCheckoutAttempt(idempotencyKey)).data;
}
