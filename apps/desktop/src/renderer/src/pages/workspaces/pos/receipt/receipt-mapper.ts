import { currencyFractionDigits } from "../checkout-calculations";
import { formatReceiptQuantity } from "./receipt-formatting";

export interface ReceiptContext {
  businessName: string;
  branchName: string;
  cashierName: string;
}

export interface ReceiptItem {
  productName: string;
  sku: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  discountAmountMinor: number;
  lineTotalMinor: number;
}

export interface ReceiptPayment {
  method: RetailyPaymentMethod;
  amountMinor: number;
  reference: string | null;
}

/** A printer- and channel-independent snapshot of server-confirmed receipt data. */
export interface ReceiptViewModel {
  businessName: string;
  branchName: string;
  cashierName: string;
  receiptNumber: string;
  saleNumber: string;
  completedAt: string;
  currency: string;
  items: ReceiptItem[];
  subtotalMinor: number;
  overallDiscountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  changeMinor: number;
  payments: ReceiptPayment[];
}

export class ReceiptMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptMappingError";
  }
}

export function mapSaleToReceipt(
  sale: RetailySaleResponse,
  context: ReceiptContext,
): ReceiptViewModel {
  if (sale.status !== "completed") {
    throw new ReceiptMappingError("Only completed sales can be previewed as receipts.");
  }
  if (currencyFractionDigits(sale.currency) === null) {
    throw new ReceiptMappingError("The sale currency is invalid. This receipt cannot be displayed safely.");
  }
  for (const item of sale.items) {
    try {
      formatReceiptQuantity(item.quantity);
    } catch {
      throw new ReceiptMappingError(
        "An item quantity is invalid or outside the supported receipt range. This receipt cannot be displayed safely.",
      );
    }
  }

  return {
    businessName: context.businessName,
    branchName: context.branchName,
    cashierName: context.cashierName,
    receiptNumber: sale.receiptNumber,
    saleNumber: sale.saleNumber,
    completedAt: sale.completedAt,
    currency: sale.currency,
    items: sale.items.map((item) => ({
      productName: item.productName,
      sku: item.productSku,
      quantity: item.quantity,
      unit: item.productUnit,
      unitPriceMinor: item.unitPriceMinor,
      discountAmountMinor: item.discountAmountMinor,
      lineTotalMinor: item.lineTotalMinor,
    })),
    subtotalMinor: sale.subtotalMinor,
    overallDiscountMinor: sale.discountAmountMinor,
    totalMinor: sale.totalMinor,
    amountPaidMinor: sale.amountPaidMinor,
    changeMinor: sale.changeMinor,
    payments: sale.payments.map((payment) => ({
      method: payment.paymentMethod,
      amountMinor: payment.amountMinor,
      reference: payment.reference,
    })),
  };
}
