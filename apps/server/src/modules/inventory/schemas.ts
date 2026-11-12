import { z } from "zod";

// ==========================================
// SHARED VALIDATION
// ==========================================

const uuidSchema = z.string().uuid();

const quantitySchema = z.number().finite().positive().max(1_000_000_000);

const notesSchema = z.string().trim().max(500).optional();

const referenceSchema = z.string().trim().max(100).optional();

// ==========================================
// INVENTORY LIST
// GET /api/inventory
// ==========================================

export const inventoryListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(25),

  search: z.string().trim().max(100).optional(),

  branchId: uuidSchema.optional(),

  categoryId: uuidSchema.optional(),

  stockStatus: z
    .enum(["all", "in_stock", "low_stock", "out_of_stock"])
    .default("all"),
});

// ==========================================
// INVENTORY PRODUCT DETAILS
// GET /api/inventory/:productId
// ==========================================

export const inventoryProductParamsSchema = z.object({
  productId: uuidSchema,
});

// ==========================================
// STOCK MOVEMENT HISTORY
// GET /api/inventory/movements
// ==========================================

export const stockMovementListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce.number().int().min(1).max(100).default(25),

    branchId: uuidSchema.optional(),

    productId: uuidSchema.optional(),

    movementType: z
      .enum([
        "opening",
        "purchase",
        "sale",
        "sale_void",
        "customer_return",
        "supplier_return",
        "adjustment",
        "transfer_in",
        "transfer_out",
      ])
      .optional(),

    startDate: z.string().datetime().optional(),

    endDate: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      if (!data.startDate || !data.endDate) return true;

      return new Date(data.startDate) <= new Date(data.endDate);
    },
    {
      message: "Start date must be before or equal to end date.",
      path: ["startDate"],
    },
  );

// ==========================================
// RECEIVE STOCK
// POST /api/inventory/receive
// ==========================================

export const receiveStockSchema = z.object({
  branchId: uuidSchema,

  productId: uuidSchema,

  quantity: quantitySchema,

  unitCostMinor: z.number().int().min(0).optional(),

  notes: notesSchema,

  reference: referenceSchema,
});

// ==========================================
// STOCK ADJUSTMENT
// POST /api/inventory/adjustments
// ==========================================

export const adjustStockSchema = z.object({
  branchId: uuidSchema,

  productId: uuidSchema,

  quantityDelta: z
    .number()
    .finite()
    .refine((value) => value !== 0, {
      message: "Adjustment quantity cannot be zero.",
    })
    .refine((value) => Math.abs(value) <= 1_000_000_000, {
      message: "Adjustment quantity is too large.",
    }),

  reason: z.enum([
    "damaged",
    "expired",
    "lost",
    "found",
    "correction",
    "other",
  ]),

  notes: z.string().trim().min(1).max(500),
});

// ==========================================
// UPDATE REORDER LEVEL
// PATCH /api/inventory/:productId/reorder-level
// ==========================================

export const updateReorderLevelSchema = z.object({
  branchId: uuidSchema,

  reorderLevel: z.number().finite().min(0).max(1_000_000_000),
});

// ==========================================
// CREATE STOCK TRANSFER
// POST /api/inventory/transfers
// ==========================================

const transferItemSchema = z.object({
  productId: uuidSchema,

  quantity: quantitySchema,
});

export const createStockTransferSchema = z
  .object({
    sourceBranchId: uuidSchema,

    destinationBranchId: uuidSchema,

    notes: notesSchema,

    items: z.array(transferItemSchema).min(1).max(500),
  })
  .refine((data) => data.sourceBranchId !== data.destinationBranchId, {
    message: "Source and destination branches must be different.",
    path: ["destinationBranchId"],
  })
  .refine(
    (data) => {
      const productIds = data.items.map((item) => item.productId);

      return new Set(productIds).size === productIds.length;
    },
    {
      message: "A product can only appear once in a transfer.",
      path: ["items"],
    },
  );

// ==========================================
// DISPATCH STOCK TRANSFER
// POST /api/inventory/transfers/:transferId/dispatch
// ==========================================

export const stockTransferParamsSchema = z.object({
  transferId: uuidSchema,
});

// ==========================================
// RECEIVE STOCK TRANSFER
// POST /api/inventory/transfers/:transferId/receive
// ==========================================

const transferReceiptItemSchema = z.object({
  itemId: uuidSchema,

  quantityReceived: quantitySchema,
});

export const receiveStockTransferSchema = z
  .object({
    items: z.array(transferReceiptItemSchema).min(1).max(500),

    notes: notesSchema,
  })
  .refine(
    (data) => {
      const itemIds = data.items.map((item) => item.itemId);

      return new Set(itemIds).size === itemIds.length;
    },
    {
      message: "A transfer item can only appear once per receipt.",
      path: ["items"],
    },
  );

// ==========================================
// CANCEL STOCK TRANSFER
// POST /api/inventory/transfers/:transferId/cancel
// ==========================================

export const cancelStockTransferSchema = z.object({
  notes: z.string().trim().min(1).max(500),
});
