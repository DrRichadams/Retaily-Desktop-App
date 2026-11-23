import { z } from "zod";

const idempotencyKeyValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\x21-\x7E]+$/);

export const idempotencyKeySchema = idempotencyKeyValueSchema.optional();

export const checkoutAttemptQuerySchema = z.object({
  idempotencyKey: idempotencyKeyValueSchema,
});

const discountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
  }),

  z.object({
    type: z.literal("fixed"),
    // Fixed discount in the business currency's minor units.
    value: z.number().int().positive(),
  }),

  z.object({
    type: z.literal("percentage"),
    // Basis points: 10000 = 100%, 1250 = 12.5%.
    value: z.number().int().positive().max(10000),
  }),
]);

const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().finite().positive().max(1000000),
  discount: discountSchema.optional().default({
    type: "none",
  }),
});

const salePaymentSchema = z.object({
  method: z.enum([
    "cash",
    "card",
    "ecocash",
    "innbucks",
    "bank_transfer",
    "other",
  ]),

  amountMinor: z.number().int().positive(),

  reference: z.string().trim().max(120).optional(),

  notes: z.string().trim().max(500).optional(),
});

export const createSaleSchema = z
  .object({
    branchId: z.string().uuid(),
    customerId: z.string().uuid().nullable().optional(),
    items: z.array(saleItemSchema).min(1).max(100),
    discount: discountSchema.optional().default({
      type: "none",
    }),
    payments: z.array(salePaymentSchema).min(1).max(10),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    const productIds = data.items.map((item) => item.productId);

    if (new Set(productIds).size !== productIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message:
          "A product can only appear once in a sale. Combine its quantities into one item.",
      });
    }
  });

export const saleIdSchema = z.object({
  id: z.string().uuid(),
});

export const salesListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.enum(["completed", "voided"]).optional(),
  search: z.string().trim().max(100).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const saleReceiptParamsSchema = z.object({
  receiptNumber: z.string().trim().min(1).max(100),
});
