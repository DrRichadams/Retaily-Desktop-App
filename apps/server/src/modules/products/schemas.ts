import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const productListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
});

export const productIdSchema = z.object({
  id: z.string().uuid(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(150),
  sku: z.string().trim().min(1).max(60),
  categoryId: z.string().uuid().nullable().optional(),
  description: optionalText(2000),
  unit: z.string().trim().min(1).max(30).default("each"),
  costPriceMinor: z.number().int().min(0).max(999999999999),
  sellingPriceMinor: z.number().int().min(0).max(999999999999),
  trackStock: z.boolean().default(true),
  barcode: z.string().trim().min(1).max(100).nullable().optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    sku: z.string().trim().min(1).max(60).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    description: optionalText(2000),
    unit: z.string().trim().min(1).max(30).optional(),
    costPriceMinor: z.number().int().min(0).max(999999999999).optional(),
    sellingPriceMinor: z.number().int().min(0).max(999999999999).optional(),
    trackStock: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const productStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: optionalText(1000),
  parentCategoryId: z.string().uuid().nullable().optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: optionalText(1000),
    parentCategoryId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const createBarcodeSchema = z.object({
  barcode: z.string().trim().min(1).max(100),
  isPrimary: z.boolean().default(false),
});
