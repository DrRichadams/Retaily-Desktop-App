import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { hashPassword } from "../authentication/password.js";

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2).max(100),

  ownerName: z.string().trim().min(2).max(100),

  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/),

  password: z.string().min(12).max(128),

  email: z.email().optional().or(z.literal("")),

  phone: z.string().max(30).optional(),

  branchName: z.string().trim().min(2).max(100),

  branchCode: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/),

  registerName: z.string().trim().min(2).max(100),

  registerCode: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/),

  currency: z.string().length(3).default("USD"),
});

const roleTemplates = {
  owner: {
    name: "Owner",
    permissions: "*",
  },

  manager: {
    name: "Manager",
    permissions: [
      "dashboard.view",
      "sales.create",
      "sales.view_own",
      "sales.view_all",
      "sales.refund",
      "sales.discount_limited",
      "sales.discount_full",
      "products.view",
      "products.manage",
      "inventory.view",
      "inventory.manage",
      "customers.view",
      "customers.manage",
      "employees.view",
      "employees.manage",
      "reports.view_basic",
      "reports.view_full",
      "settings.view",
    ],
  },

  supervisor: {
    name: "Supervisor",
    permissions: [
      "dashboard.view",
      "sales.create",
      "sales.view_own",
      "sales.view_all",
      "sales.refund",
      "sales.discount_limited",
      "sales.discount_full",
      "products.view",
      "inventory.view",
      "customers.view",
      "employees.view",
      "reports.view_basic",
    ],
  },

  teller: {
    name: "Teller",
    permissions: [
      "dashboard.view",
      "sales.create",
      "sales.view_own",
      "sales.discount_limited",
      "products.view",
      "customers.view",
    ],
  },
} as const;

export function registerOnboardingRoutes(
  server: FastifyInstance,
  db: Database.Database,
) {
  server.get("/api/onboarding/status", async () => {
    const result = db
      .prepare(
        `
      SELECT COUNT(*) AS count
      FROM businesses
    `,
      )
      .get() as { count: number };

    return {
      required: result.count === 0,
    };
  });

  server.post("/api/onboarding/owner", async (request, reply) => {
    const parsed = onboardingSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "INVALID_INPUT",
        message: "Please check the information you entered.",
        issues: parsed.error.issues,
      });
    }

    const input = parsed.data;

    // Hash the password before beginning the database transaction.
    const passwordHash = hashPassword(input.password);

    const businessId = randomUUID();
    const branchId = randomUUID();
    const registerId = randomUUID();
    const userId = randomUUID();
    const employeeId = randomUUID();

    const createOwner = db.transaction(() => {
      const existing = db
        .prepare(
          `
        SELECT id FROM businesses LIMIT 1
      `,
        )
        .get();

      if (existing) {
        throw new Error("ONBOARDING_ALREADY_COMPLETED");
      }

      db.prepare(
        `
        INSERT INTO businesses (
          id,
          name,
          currency
        )
        VALUES (?, ?, ?)
      `,
      ).run(businessId, input.businessName, input.currency.toUpperCase());

      db.prepare(
        `
        INSERT INTO branches (
          id,
          business_id,
          name,
          code,
          is_headquarters
        )
        VALUES (?, ?, ?, ?, 1)
      `,
      ).run(
        branchId,
        businessId,
        input.branchName,
        input.branchCode.toUpperCase(),
      );

      db.prepare(
        `
        INSERT INTO registers (
          id,
          branch_id,
          name,
          code
        )
        VALUES (?, ?, ?, ?)
      `,
      ).run(
        registerId,
        branchId,
        input.registerName,
        input.registerCode.toUpperCase(),
      );

      db.prepare(
        `
        INSERT INTO users (
          id,
          username,
          password_hash
        )
        VALUES (?, ?, ?)
      `,
      ).run(userId, input.username, passwordHash);

      db.prepare(
        `
        INSERT INTO employees (
          id,
          business_id,
          user_id,
          employee_number,
          full_name,
          email,
          phone
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        employeeId,
        businessId,
        userId,
        "EMP-001",
        input.ownerName,
        input.email || null,
        input.phone || null,
      );

      const insertRole = db.prepare(`
        INSERT INTO roles (
          id,
          business_id,
          name,
          slug,
          is_system
        )
        VALUES (?, ?, ?, ?, 1)
      `);

      const insertRolePermission = db.prepare(`
        INSERT INTO role_permissions (
          role_id,
          permission_code
        )
        VALUES (?, ?)
      `);

      const allPermissions = db
        .prepare(
          `
        SELECT code FROM permissions
      `,
        )
        .all() as Array<{ code: string }>;

      const roles: Record<string, string> = {};

      for (const [slug, template] of Object.entries(roleTemplates)) {
        const roleId = randomUUID();

        roles[slug] = roleId;

        insertRole.run(roleId, businessId, template.name, slug);

        const assignedPermissions =
          template.permissions === "*"
            ? allPermissions.map((permission) => permission.code)
            : template.permissions;

        for (const permission of assignedPermissions) {
          insertRolePermission.run(roleId, permission);
        }
      }

      db.prepare(
        `
        INSERT INTO employee_roles (
          employee_id,
          role_id
        )
        VALUES (?, ?)
      `,
      ).run(employeeId, roles.owner);

      db.prepare(
        `
        INSERT INTO employee_branch_access (
          employee_id,
          branch_id,
          is_primary
        )
        VALUES (?, ?, 1)
      `,
      ).run(employeeId, branchId);

      db.prepare(
        `
        INSERT INTO audit_logs (
          id,
          business_id,
          employee_id,
          action,
          entity_type,
          entity_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(
        randomUUID(),
        businessId,
        employeeId,
        "business.owner_onboarded",
        "business",
        businessId,
      );
    });

    try {
      createOwner();

      return reply.code(201).send({
        success: true,
        message: "Business setup completed successfully.",
        businessId,
        branchId,
        registerId,
        ownerId: employeeId,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "ONBOARDING_ALREADY_COMPLETED"
      ) {
        return reply.code(409).send({
          error: "ONBOARDING_ALREADY_COMPLETED",
          message: "This Retaily installation has already been configured.",
        });
      }

      request.log.error(error);

      return reply.code(500).send({
        error: "ONBOARDING_FAILED",
        message: "Business setup could not be completed.",
      });
    }
  });
}
