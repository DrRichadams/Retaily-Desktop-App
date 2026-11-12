export {};

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

  products: {
    request<T>(request: {
      method: "GET" | "POST" | "PATCH";
      endpoint: string;
      body?: unknown;
    }): Promise<T>;
  };
}

declare global {
  interface Window {
    retaily: RetailyAPI;
  }
}
