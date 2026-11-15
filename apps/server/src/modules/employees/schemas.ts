import { z } from "zod";

const roleSchema = z.enum(["owner", "manager", "supervisor", "teller"]);

export const employeeIdSchema = z.object({
  id: z.uuid(),
});

export const employeeListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  role: roleSchema.optional(),
  branchId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),

    username: z
      .string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[a-zA-Z0-9._-]+$/),

    password: z.string().min(12).max(128),

    email: z.email().optional().or(z.literal("")),

    phone: z.string().trim().max(30).optional(),

    role: roleSchema.refine((role) => role !== "owner", {
      message: "An owner role cannot be assigned through employee creation.",
    }),

    branchIds: z.array(z.uuid()).min(1).max(100),

    primaryBranchId: z.uuid(),
  })
  .refine((input) => input.branchIds.includes(input.primaryBranchId), {
    message: "The primary branch must be included in the assigned branches.",
    path: ["primaryBranchId"],
  });

export const updateEmployeeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100).optional(),

    email: z.email().nullable().optional(),

    phone: z.string().trim().max(30).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field must be provided.",
  });

export const employeeStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

export const employeeAccountAccessSchema = z
  .object({
    action: z.enum(["suspend", "restore"]),
    reason: z.enum(["admin", "security"]).optional(),
  })
  .refine(
    (input) =>
      input.action === "restore" ||
      input.reason === "admin" ||
      input.reason === "security",
    {
      message: "A suspension reason is required.",
      path: ["reason"],
    },
  )
  .refine((input) => input.action !== "restore" || input.reason === undefined, {
    message: "A reason must not be supplied when restoring an account.",
    path: ["reason"],
  });

export const assignEmployeeRolesSchema = z.object({
  roles: z
    .array(roleSchema)
    .min(1)
    .max(4)
    .refine((roles) => new Set(roles).size === roles.length, {
      message: "Duplicate roles are not allowed.",
    }),
});

export const assignEmployeeBranchesSchema = z
  .object({
    branchIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Duplicate branch assignments are not allowed.",
      }),

    primaryBranchId: z.uuid(),
  })
  .refine((input) => input.branchIds.includes(input.primaryBranchId), {
    message: "The primary branch must be included in the assigned branches.",
    path: ["primaryBranchId"],
  });

export const resetEmployeePasswordSchema = z.object({
  password: z.string().min(12).max(128),
});
