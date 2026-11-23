import type { SalesIpcError, SalesIpcResult } from "../../../shared/sales-ipc.js";

export {};

declare global {
interface RetailyUser {
  id: string;
  username: string;
  employeeId: string;
  businessId: string;
  fullName: string;
}

interface RetailyAuthContext {
  userId: string;
  username: string;
  employeeId: string;
  businessId: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
  business: {
    id: string;
    name: string;
    currency: string;
  };
}

interface RetailyProductStats {
  totalProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  totalCategories: number;
}

interface RetailyProduct {
  id: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  sku: string;
  description: string | null;
  unit: string;
  costPriceMinor: number;
  sellingPriceMinor: number;
  trackStock: boolean;
  status: "active" | "inactive";
  barcodes: Array<{
    id: string;
    barcode: string;
    isPrimary: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface RetailyCategory {
  id: string;
  name: string;
  description: string | null;
  parentCategoryId: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

interface RetailyProductListResponse {
  data: RetailyProduct[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface RetailyProductInput {
  name: string;
  sku: string;
  categoryId?: string | null;
  description?: string | null;
  unit?: string;
  costPriceMinor: number;
  sellingPriceMinor: number;
  trackStock?: boolean;
  barcode?: string | null;
}

interface RetailyProductUpdate {
  name?: string;
  sku?: string;
  categoryId?: string | null;
  description?: string | null;
  unit?: string;
  costPriceMinor?: number;
  sellingPriceMinor?: number;
  trackStock?: boolean;
}

interface RetailyProductCategoryInput {
  name: string;
  description?: string | null;
  parentCategoryId?: string | null;
}

interface RetailyBranch {
  id: string;
  name: string;
  code: string;
  isHeadquarters: boolean;
}

interface RetailyBranchListResponse {
  success: true;
  data: RetailyBranch[];
}

type RetailyPaymentMethod =
  | "cash"
  | "card"
  | "ecocash"
  | "innbucks"
  | "bank_transfer"
  | "other";

type RetailyDiscount =
  | { type: "none" }
  | { type: "fixed"; value: number }
  | { type: "percentage"; value: number };

interface RetailyCreateSaleRequest {
  branchId: string;
  customerId?: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    discount?: RetailyDiscount;
  }>;
  discount?: RetailyDiscount;
  payments: Array<{
    method: RetailyPaymentMethod;
    amountMinor: number;
    reference?: string;
    notes?: string;
  }>;
  notes?: string;
}

interface RetailySaleItemResponse {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productUnit: string;
  quantity: number;
  unitCostMinor: number;
  unitPriceMinor: number;
  lineSubtotalMinor: number;
  discountType: "none" | "fixed" | "percentage";
  discountValue: number;
  discountAmountMinor: number;
  lineTotalMinor: number;
}

interface RetailySalePaymentResponse {
  id: string;
  paymentMethod: RetailyPaymentMethod;
  amountMinor: number;
  reference: string | null;
  notes: string | null;
  createdAt: string;
}

interface RetailySaleResponse {
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
  discountType: "none" | "fixed" | "percentage";
  discountValue: number;
  discountAmountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  changeMinor: number;
  notes: string | null;
  completedAt: string;
  createdAt: string;
  items: RetailySaleItemResponse[];
  payments: RetailySalePaymentResponse[];
}

interface RetailyCreateSaleResponse {
  message: string;
  data: RetailySaleResponse;
}

interface RetailyCheckoutAttempt {
  idempotencyKey: string;
  status: "pending" | "completed";
  request: RetailyCreateSaleRequest;
  saleId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sale: RetailySaleResponse | null;
}

interface RetailyCheckoutAttemptResponse {
  data: RetailyCheckoutAttempt;
}

interface RetailyCheckoutAttemptListResponse {
  data: RetailyCheckoutAttempt[];
}

type RetailySalesIpcError = SalesIpcError;
type RetailySalesIpcResult<T> = SalesIpcResult<T>;

interface RetailySalesListQuery {
  branchId?: string;
  customerId?: string;
  employeeId?: string;
  status?: "completed" | "voided";
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

interface RetailySalesListItemResponse {
  id: string;
  saleNumber: string;
  receiptNumber: string;
  status: "completed" | "voided";
  branchId: string;
  branchName: string;
  employeeId: string;
  employeeName: string;
  customerId: string | null;
  customerName: string | null;
  currency: string;
  subtotalMinor: number;
  discountAmountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  changeMinor: number;
  completedAt: string;
}

interface RetailySalesListResponse {
  data: RetailySalesListItemResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface RetailyIndividualSaleResponse {
  data: RetailySaleResponse;
}

interface RetailyAPI {
  getVersion(): Promise<string>;

  getServerHealth(): Promise<{
    status: string;
    message?: string;
    application?: string;
    service?: string;
    database?: string;
    schemaVersion?: number;
    onboardingRequired?: boolean;
    timestamp?: string;
  }>;

  login(credentials: { username: string; password: string }): Promise<{
    success: boolean;
    expiresAt: string;
    user: RetailyUser;
  }>;

  getCurrentUser(): Promise<RetailyAuthContext>;

  getOnboardingStatus(): Promise<{
    required: boolean;
  }>;

  logout(): Promise<{
    success: boolean;
  }>;

  createOwner(details: {
    businessName: string;
    ownerName: string;
    username: string;
    password: string;
    email?: string;
    phone?: string;
    branchName: string;
    branchCode: string;
    registerName: string;
    registerCode: string;
    currency: string;
  }): Promise<{
    success: boolean;
    businessId: string;
    branchId: string;
    registerId: string;
    ownerId: string;
  }>;

  branches: {
    list(): Promise<RetailyBranchListResponse>;
  };

  products: {
    request<T>(request: {
      method: "GET" | "POST" | "PATCH";
      endpoint: string;
      body?: unknown;
    }): Promise<T>;
  };

  sales: {
    createSale(
      input: RetailyCreateSaleRequest,
      idempotencyKey: string,
    ): Promise<RetailySalesIpcResult<RetailyCreateSaleResponse>>;
    listSales(
      query?: RetailySalesListQuery,
    ): Promise<RetailySalesIpcResult<RetailySalesListResponse>>;
    getSale(
      id: string,
    ): Promise<RetailySalesIpcResult<RetailyIndividualSaleResponse>>;
    saveCheckoutAttempt(
      input: RetailyCreateSaleRequest,
      idempotencyKey: string,
    ): Promise<RetailySalesIpcResult<RetailyCheckoutAttemptResponse>>;
    listPendingCheckoutAttempts(): Promise<
      RetailySalesIpcResult<RetailyCheckoutAttemptListResponse>
    >;
    getCheckoutAttempt(
      idempotencyKey: string,
    ): Promise<RetailySalesIpcResult<RetailyCheckoutAttemptResponse>>;
  };
}

  interface Window {
    retaily: RetailyAPI;
  }
}
