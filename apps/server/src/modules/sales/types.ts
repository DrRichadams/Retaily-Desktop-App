import type { z } from "zod";

import type { createSaleSchema, salesListQuerySchema } from "./schemas.js";

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export type SalesListQuery = z.infer<typeof salesListQuerySchema>;

export type PaymentMethod =
  | "cash"
  | "card"
  | "ecocash"
  | "innbucks"
  | "bank_transfer"
  | "other";

export type DiscountType = "none" | "fixed" | "percentage";

export interface SaleItemResponse {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  quantity: number;
  unitCostMinor: number;
  unitPriceMinor: number;
  lineSubtotalMinor: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmountMinor: number;
  lineTotalMinor: number;
}

export interface SalePaymentResponse {
  id: string;
  paymentMethod: PaymentMethod;
  amountMinor: number;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SaleResponse {
  id: string;
  businessId: string;
  branchId: string;
  employeeId: string;
  customerId: string | null;
  saleNumber: string;
  receiptNumber: string;
  status: "completed" | "voided";
  currency: string;
  subtotalMinor: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  changeMinor: number;
  notes: string | null;
  completedAt: string;
  createdAt: string;
  items: SaleItemResponse[];
  payments: SalePaymentResponse[];
}
