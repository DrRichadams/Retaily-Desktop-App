export type StockMovementType =
  | "opening"
  | "purchase"
  | "sale"
  | "sale_void"
  | "customer_return"
  | "supplier_return"
  | "adjustment"
  | "transfer_in"
  | "transfer_out";

export type StockTransferStatus =
  | "draft"
  | "in_transit"
  | "partially_received"
  | "received"
  | "cancelled";

export type StockAdjustmentReason =
  | "damaged"
  | "expired"
  | "lost"
  | "found"
  | "correction"
  | "other";

export interface InventoryListQuery {
  page: number;
  limit: number;
  search?: string;
  branchId?: string;
  categoryId?: string;
  stockStatus: "all" | "in_stock" | "low_stock" | "out_of_stock";
}

export interface InventoryRecord {
  id: string;
  branch_id: string;
  product_id: string;
  quantity_on_hand: number;
  reorder_level: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryResponse {
  id: string;
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: string;
  costPriceMinor: number;
  sellingPriceMinor: number;
  quantityOnHand: number;
  reorderLevel: number;
  stockStatus: "in_stock" | "low_stock" | "out_of_stock";
}

export interface StockMovementResponse {
  id: string;
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  movementType: StockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdByEmployeeId: string | null;
  createdAt: string;
}

export interface ReceiveStockInput {
  branchId: string;
  productId: string;
  quantity: number;
  unitCostMinor?: number;
  notes?: string;
  reference?: string;
}

export interface AdjustStockInput {
  branchId: string;
  productId: string;
  quantityDelta: number;
  reason: StockAdjustmentReason;
  notes: string;
}

export interface CreateStockTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface ReceiveStockTransferInput {
  items: Array<{
    itemId: string;
    quantityReceived: number;
  }>;
  notes?: string;
}
