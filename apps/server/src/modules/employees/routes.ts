import type { FastifyInstance, FastifyReply } from "fastify";
import type Database from "better-sqlite3";

import {
  createAuthenticate,
  requirePermission,
  type AuthenticatedRequest,
} from "../../middleware/authenticate.js";

import {
  employeeListQuerySchema,
  employeeIdSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeStatusSchema,
  employeeAccountAccessSchema,
  assignEmployeeRolesSchema,
  assignEmployeeBranchesSchema,
  resetEmployeePasswordSchema,
} from "./schemas.js";

import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  updateEmployeeStatus,
  updateEmployeeAccountAccess,
  assignEmployeeRoles,
  assignEmployeeBranches,
  resetEmployeePassword,
} from "./service.js";

function handleEmployeeError(
  error: unknown,
  reply: FastifyReply,
  request: { log: { error: (error: unknown) => void } },
) {
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

  const errors: Record<string, { statusCode: number; message: string }> = {
    EMPLOYEE_VIEW_FORBIDDEN: {
      statusCode: 403,
      message: "You do not have permission to view employees.",
    },

    EMPLOYEE_MANAGEMENT_FORBIDDEN: {
      statusCode: 403,
      message: "You do not have permission to manage employees.",
    },

    EMPLOYEE_NOT_FOUND: {
      statusCode: 404,
      message: "Employee not found.",
    },

    EMPLOYEE_ACCESS_DENIED: {
      statusCode: 403,
      message: "You cannot access this employee.",
    },

    EMPLOYEE_TARGET_ROLE_FORBIDDEN: {
      statusCode: 403,
      message: "You cannot manage an employee with this role.",
    },

    EMPLOYEE_BRANCH_ASSIGNMENT_FORBIDDEN: {
      statusCode: 403,
      message: "You cannot assign employees to one or more of these branches.",
    },

    INVALID_EMPLOYEE_BRANCH: {
      statusCode: 400,
      message: "One or more selected branches are invalid.",
    },

    INVALID_PRIMARY_BRANCH: {
      statusCode: 400,
      message: "The primary branch must be one of the assigned branches.",
    },

    EMPLOYEE_REQUIRES_ROLE: {
      statusCode: 400,
      message: "An employee must have at least one role.",
    },

    EMPLOYEE_ROLE_NOT_FOUND: {
      statusCode: 400,
      message: "The selected role does not exist.",
    },

    ROLE_ASSIGNMENT_FORBIDDEN: {
      statusCode: 403,
      message: "You cannot assign one or more of these roles.",
    },

    OWNER_ROLE_ASSIGNMENT_FORBIDDEN: {
      statusCode: 403,
      message: "The owner role cannot be assigned through employee management.",
    },

    OWNER_EMPLOYEE_PROTECTED: {
      statusCode: 403,
      message: "This owner account cannot be modified by your account.",
    },

    CANNOT_DEACTIVATE_SELF: {
      statusCode: 400,
      message: "You cannot deactivate your own employee account.",
    },

    SELF_PASSWORD_RESET_FORBIDDEN: {
      statusCode: 403,
      message:
        "You cannot reset your own password through employee management.",
    },

    NO_EMPLOYEE_CHANGES: {
      statusCode: 400,
      message: "No employee changes were provided.",
    },

    USERNAME_ALREADY_EXISTS: {
      statusCode: 409,
      message: "This username is already in use.",
    },
    ACCOUNT_CONTROL_OWNER_ONLY: {
      statusCode: 403,
      message: "Only a business Owner can control employee account access.",
    },

    ACCOUNT_SUSPENSION_REASON_REQUIRED: {
      statusCode: 400,
      message: "A reason is required to suspend an account.",
    },

    CANNOT_SUSPEND_SELF: {
      statusCode: 400,
      message: "You cannot suspend your own account.",
    },

    EMPLOYEE_INACTIVE_ACCOUNT: {
      statusCode: 409,
      message:
        "This employee is inactive. Activate the employee before restoring account access.",
    },

    ACCOUNT_ALREADY_DISABLED: {
      statusCode: 409,
      message: "This account is already disabled.",
    },

    ACCOUNT_NOT_ADMIN_SUSPENDED: {
      statusCode: 409,
      message:
        "This account is not suspended by an administrator or security action.",
    },
  };

  const knownError = errors[message];

  if (knownError) {
    return reply.code(knownError.statusCode).send({
      error: message,
      message: knownError.message,
    });
  }

  if (message.includes("UNIQUE constraint failed: users.username")) {
    return reply.code(409).send({
      error: "USERNAME_ALREADY_EXISTS",
      message: "This username is already in use.",
    });
  }

  if (
    message.includes(
      "UNIQUE constraint failed: employees.business_id, employees.employee_number",
    )
  ) {
    return reply.code(409).send({
      error: "EMPLOYEE_NUMBER_CONFLICT",
      message: "An employee number conflict occurred. Please try again.",
    });
  }

  request.log.error(error);

  return reply.code(500).send({
    error: "EMPLOYEE_OPERATION_FAILED",
    message: "The employee operation could not be completed.",
  });
}

export function registerEmployeeRoutes(
  server: FastifyInstance,
  db: Database.Database,
) {
  const authenticate = createAuthenticate(db);

  const canViewEmployees = [authenticate, requirePermission("employees.view")];

  const canManageEmployees = [
    authenticate,
    requirePermission("employees.manage"),
  ];

  // List employees
  server.get(
    "/api/employees",
    {
      preHandler: canViewEmployees,
    },
    async (request, reply) => {
      const parsed = employeeListQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid employee search parameters.",
          issues: parsed.error.issues,
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const result = listEmployees(db, auth, parsed.data);

        return reply.send({
          success: true,
          ...result,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Get employee details
  server.get(
    "/api/employees/:id",
    {
      preHandler: canViewEmployees,
    },
    async (request, reply) => {
      const parsed = employeeIdSchema.safeParse(request.params);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_EMPLOYEE_ID",
          message: "Invalid employee ID.",
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const employee = getEmployee(db, auth, parsed.data.id);

        return reply.send({
          success: true,
          data: employee,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Create employee
  server.post(
    "/api/employees",
    {
      preHandler: canManageEmployees,
    },
    async (request, reply) => {
      const parsed = createEmployeeSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Please check the employee information.",
          issues: parsed.error.issues,
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const employee = createEmployee(db, auth, parsed.data);

        return reply.code(201).send({
          success: true,
          message: "Employee created successfully.",
          data: employee,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Update employee details
  server.patch(
    "/api/employees/:id",
    {
      preHandler: canManageEmployees,
    },
    async (request, reply) => {
      const params = employeeIdSchema.safeParse(request.params);

      const body = updateEmployeeSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid employee information.",
          issues: [
            ...(!params.success ? params.error.issues : []),
            ...(!body.success ? body.error.issues : []),
          ],
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const employee = updateEmployee(db, auth, params.data.id, body.data);

        return reply.send({
          success: true,
          message: "Employee updated successfully.",
          data: employee,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Activate or deactivate employee
  server.patch(
    "/api/employees/:id/status",
    {
      preHandler: canManageEmployees,
    },
    async (request, reply) => {
      const params = employeeIdSchema.safeParse(request.params);

      const body = employeeStatusSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid employee status information.",
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const result = updateEmployeeStatus(
          db,
          auth,
          params.data.id,
          body.data.status,
        );

        return reply.send({
          success: true,
          message:
            body.data.status === "active"
              ? "Employee activated successfully."
              : "Employee deactivated successfully.",
          data: result,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Suspend or restore employee account access
  server.patch(
    "/api/employees/:id/account-access",
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const params = employeeIdSchema.safeParse(request.params);
      const body = employeeAccountAccessSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid account access information.",
          issues: [
            ...(!params.success ? params.error.issues : []),
            ...(!body.success ? body.error.issues : []),
          ],
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const result = updateEmployeeAccountAccess(
          db,
          auth,
          params.data.id,
          body.data,
        );

        return reply.send({
          success: true,
          message:
            body.data.action === "suspend"
              ? "Employee account access suspended successfully."
              : "Employee account access restored successfully.",
          data: result,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Assign employee roles
  server.put(
    "/api/employees/:id/roles",
    {
      preHandler: canManageEmployees,
    },
    async (request, reply) => {
      const params = employeeIdSchema.safeParse(request.params);

      const body = assignEmployeeRolesSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid employee role information.",
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const result = assignEmployeeRoles(db, auth, params.data.id, body.data);

        return reply.send({
          success: true,
          message: "Employee roles updated successfully.",
          data: result,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Assign employee branches
  server.put(
    "/api/employees/:id/branches",
    {
      preHandler: canManageEmployees,
    },
    async (request, reply) => {
      const params = employeeIdSchema.safeParse(request.params);

      const body = assignEmployeeBranchesSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid employee branch information.",
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const result = assignEmployeeBranches(
          db,
          auth,
          params.data.id,
          body.data,
        );

        return reply.send({
          success: true,
          message: "Employee branch assignments updated successfully.",
          data: result,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Suspend or restore employee account access
  server.patch(
    "/api/employees/:id/account-access",
    {
      preHandler: canManageEmployees,
    },
    async (request, reply) => {
      const params = employeeIdSchema.safeParse(request.params);

      const body = employeeAccountAccessSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid employee account access information.",
          issues: [
            ...(!params.success ? params.error.issues : []),
            ...(!body.success ? body.error.issues : []),
          ],
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const result = updateEmployeeAccountAccess(
          db,
          auth,
          params.data.id,
          body.data,
        );

        return reply.send({
          success: true,
          message:
            body.data.action === "suspend"
              ? "Employee account suspended successfully."
              : "Employee account restored successfully.",
          data: result,
        });
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );

  // Reset employee password
  server.post(
    "/api/employees/:id/reset-password",
    {
      preHandler: canManageEmployees,
    },
    async (request, reply) => {
      const params = employeeIdSchema.safeParse(request.params);

      const body = resetEmployeePasswordSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: "INVALID_INPUT",
          message: "Invalid password reset information.",
        });
      }

      try {
        const auth = (request as AuthenticatedRequest).auth;

        const result = resetEmployeePassword(
          db,
          auth,
          params.data.id,
          body.data.password,
        );

        return reply.send(result);
      } catch (error) {
        return handleEmployeeError(error, reply, request);
      }
    },
  );
}
