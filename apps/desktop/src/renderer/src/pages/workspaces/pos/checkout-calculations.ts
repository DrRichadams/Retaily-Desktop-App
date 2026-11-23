export type CheckoutDiscount =
  | { type: "none" }
  | { type: "fixed"; value: number }
  | { type: "percentage"; value: number };

export interface CheckoutLineInput {
  unitPriceMinor: number;
  quantity: number;
  discount: CheckoutDiscount;
}

export interface PaymentDraft {
  method: RetailyPaymentMethod;
  amount: string;
  reference: string;
  notes: string;
}

export interface CheckoutTotals {
  valid: boolean;
  originalSubtotalMinor: bigint;
  itemDiscountMinor: bigint;
  subtotalAfterItemsMinor: bigint;
  overallDiscountMinor: bigint;
  totalMinor: bigint;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.trim().toUpperCase(),
    }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function parseMinorAmount(value: string, fractionDigits: number): number | null {
  const input = value.trim();
  if (!input || !/^\d+(?:\.\d*)?$/.test(input)) return null;
  const [wholeText, fractionText = ""] = input.split(".");
  if (wholeText.length > 16 || fractionText.length > fractionDigits) return null;
  const scale = 10n ** BigInt(fractionDigits);
  const fraction = fractionDigits
    ? BigInt((fractionText || "0").padEnd(fractionDigits, "0"))
    : 0n;
  const result = BigInt(wholeText) * scale + fraction;
  return result <= MAX_SAFE ? Number(result) : null;
}

export function formatMinor(amountMinor: bigint | number, currency: string): string {
  const safeCurrency = currency.trim().toUpperCase();
  let code = safeCurrency;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
  } catch {
    code = "USD";
  }
  const amount = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
  const digits = currencyFractionDigits(code);
  const scale = 10n ** BigInt(digits);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(digits, "0");
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .formatToParts(whole)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

function discountFor(subtotal: bigint, discount: CheckoutDiscount): bigint | null {
  if (discount.type === "none") return 0n;
  if (!Number.isSafeInteger(discount.value) || discount.value <= 0) return null;
  if (discount.type === "fixed") {
    const value = BigInt(discount.value);
    return value <= subtotal ? value : null;
  }
  if (discount.value > 10000) return null;
  // Match the server's Math.round for non-negative integer values.
  return (subtotal * BigInt(discount.value) + 5000n) / 10000n;
}

export function calculateCheckoutTotals(
  lines: CheckoutLineInput[],
  overallDiscount: CheckoutDiscount,
  canDiscountFull: boolean,
  canDiscountLimited: boolean,
): CheckoutTotals {
  let originalSubtotalMinor = 0n;
  let itemDiscountMinor = 0n;
  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.unitPriceMinor) ||
      line.unitPriceMinor < 0 ||
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0
    ) {
      return {
        valid: false,
        originalSubtotalMinor,
        itemDiscountMinor,
        subtotalAfterItemsMinor: 0n,
        overallDiscountMinor: 0n,
        totalMinor: 0n,
      };
    }
    const lineSubtotal = BigInt(line.unitPriceMinor) * BigInt(line.quantity);
    const lineDiscount = discountFor(lineSubtotal, line.discount);
    if (lineDiscount === null) {
      return {
        valid: false,
        originalSubtotalMinor,
        itemDiscountMinor,
        subtotalAfterItemsMinor: 0n,
        overallDiscountMinor: 0n,
        totalMinor: 0n,
      };
    }
    originalSubtotalMinor += lineSubtotal;
    itemDiscountMinor += lineDiscount;
  }

  const subtotalAfterItemsMinor = originalSubtotalMinor - itemDiscountMinor;
  const overallDiscountMinor = discountFor(subtotalAfterItemsMinor, overallDiscount);
  const totalMinor =
    overallDiscountMinor === null
      ? 0n
      : subtotalAfterItemsMinor - overallDiscountMinor;
  const totalDiscountMinor = itemDiscountMinor + (overallDiscountMinor ?? 0n);
  const withinLimitedCap = totalDiscountMinor <= (originalSubtotalMinor * 1000n) / 10000n;
  const permissionAllows =
    totalDiscountMinor === 0n ||
    canDiscountFull ||
    (canDiscountLimited && withinLimitedCap);

  return {
    valid:
      lines.length > 0 &&
      originalSubtotalMinor <= MAX_SAFE &&
      totalMinor > 0n &&
      totalMinor <= MAX_SAFE &&
      overallDiscountMinor !== null &&
      permissionAllows,
    originalSubtotalMinor,
    itemDiscountMinor,
    subtotalAfterItemsMinor,
    overallDiscountMinor: overallDiscountMinor ?? 0n,
    totalMinor,
  };
}

export interface PaymentTotals {
  amounts: Array<number | null>;
  paidMinor: bigint;
  cashMinor: bigint;
  remainingMinor: bigint;
  changeMinor: bigint;
  validAmounts: boolean;
  enoughToPay: boolean;
  cashCoversChange: boolean;
  safeTotals: boolean;
}

export function calculatePaymentTotals(
  entries: PaymentDraft[],
  totalMinor: bigint,
  fractionDigits: number,
): PaymentTotals {
  const amounts = entries.map((entry) => parseMinorAmount(entry.amount, fractionDigits));
  const validAmounts = entries.length > 0 && amounts.every(
    (amount) => amount !== null && amount > 0,
  );
  let paidMinor = 0n;
  let cashMinor = 0n;
  entries.forEach((entry, index) => {
    const amount = amounts[index];
    if (amount === null || amount <= 0) return;
    paidMinor += BigInt(amount);
    if (entry.method === "cash") cashMinor += BigInt(amount);
  });
  const safeTotals = paidMinor <= MAX_SAFE && cashMinor <= MAX_SAFE;
  const remainingMinor = paidMinor < totalMinor ? totalMinor - paidMinor : 0n;
  const changeMinor = paidMinor > totalMinor ? paidMinor - totalMinor : 0n;
  return {
    amounts,
    paidMinor,
    cashMinor,
    remainingMinor,
    changeMinor,
    validAmounts,
    enoughToPay: paidMinor >= totalMinor,
    cashCoversChange: changeMinor <= cashMinor,
    safeTotals,
  };
}

