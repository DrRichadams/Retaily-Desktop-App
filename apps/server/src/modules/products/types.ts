import type { AuthContext } from "../../middleware/authenticate.js";

export type ProductStatus = "active" | "inactive";

export interface ProductRecord {
  id: string;
  business_id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  sku: string;
  description: string | null;
  unit: string;
  cost_price_minor: number;
  selling_price_minor: number;
  track_stock: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProductBarcodeRecord {
  id: string;
  product_id: string;
  barcode: string;
  is_primary: number;
  created_at: string;
}

export interface ProductResponse {
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
  status: ProductStatus;
  barcodes: Array<{
    id: string;
    barcode: string;
    isPrimary: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListQuery {
  page: number;
  limit: number;
  search?: string;
  categoryId?: string;
  status?: ProductStatus | "all";
}

export interface CreateProductInput {
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

export interface UpdateProductInput {
  name?: string;
  sku?: string;
  categoryId?: string | null;
  description?: string | null;
  unit?: string;
  costPriceMinor?: number;
  sellingPriceMinor?: number;
  trackStock?: boolean;
}

export interface CreateCategoryInput {
  name: string;
  description?: string | null;
  parentCategoryId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  description?: string | null;
  parentCategoryId?: string | null;
}

export interface CategoryRecord {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  parent_category_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ProductServiceContext {
  auth: AuthContext;
}
