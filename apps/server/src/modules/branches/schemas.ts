import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().trim().min(2).max(100),

  code: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Branch code may only contain letters, numbers, hyphens and underscores.",
    ),

  address: z.string().trim().max(250).optional().or(z.literal("")),
});

export const branchIdSchema = z.object({
  id: z.string().uuid(),
});
