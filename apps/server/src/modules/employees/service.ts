import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

import { hashPassword } from "../authentication/password.js";
import type { AuthContext } from "../../middleware/authenticate.js";

import type {
  EmployeeRole,
  EmployeeListItem,
  EmployeeDetails,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  AssignEmployeeRolesInput,
  AssignEmployeeBranchesInput,
  EmployeeStatus,
} from "./types.js";

const now = () => new Date().toISOString();

const roleSlugs: EmployeeRole[] = ["owner", "manager", "supervisor", "teller"];

interface EmployeeRow {
  id: string;
  business_id: string;
  user_id: string;
  employee_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: EmployeeStatus;
  created_at: string;
  username: string;
  user_status: "active" | "disabled";
}

interface BranchRow {
  id: string;
  name: string;
  code: string;
  is_headquarters: number;
  is_primary: number;
}

function writeAuditLog(
  db: Database.Database,
  auth: AuthContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  db.prepare(
    `
    INSERT INTO audit_logs (
      id,
      business_id,
      employee_id,
      action,
      entity_type,
      entity_id,
      metadata_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    auth.businessId,
    auth.employeeId,
    action,
    entityType,
    entityId,
    metadata ? JSON.stringify(metadata) : null,
  );
}

function isOwner(auth: AuthContext): boolean {
  return auth.roles.includes("owner");
}

function hasAllBranchAccess(auth: AuthContext): boolean {
  return isOwner(auth) || auth.permissions.includes("branches.access_all");
}

function getManageableBranchIds(
  db: Database.Database,
  auth: AuthContext,
): string[] {
  if (hasAllBranchAccess(auth)) {
    const rows = db
      .prepare(
        `
      SELECT id
      FROM branches
      WHERE business_id = ?
    `,
      )
      .all(auth.businessId) as Array<{ id: string }>;

    return rows.map((row) => row.id);
  }

  return auth.branchIds;
}

function assertCanManageEmployees(auth: AuthContext) {
  if (!auth.permissions.includes("employees.manage")) {
    throw new Error("EMPLOYEE_MANAGEMENT_FORBIDDEN");
  }
}

function getEmployeeRow(
  db: Database.Database,
  businessId: string,
  employeeId: string,
): EmployeeRow {
  const employee = db
    .prepare(
      `
    SELECT
      e.id,
      e.business_id,
      e.user_id,
      e.employee_number,
      e.full_name,
      e.email,
      e.phone,
      e.status,
      e.created_at,
      u.username,
      u.status AS user_status
    FROM employees e
    INNER JOIN users u ON u.id = e.user_id
    WHERE e.id = ?
      AND e.business_id = ?
  `,
    )
    .get(employeeId, businessId) as EmployeeRow | undefined;

  if (!employee) {
    throw new Error("EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

function getEmployeeBranchIds(
  db: Database.Database,
  employeeId: string,
): string[] {
  const rows = db
    .prepare(
      `
    SELECT branch_id
    FROM employee_branch_access
    WHERE employee_id = ?
  `,
    )
    .all(employeeId) as Array<{ branch_id: string }>;

  return rows.map((row) => row.branch_id);
}

function assertCanAccessEmployee(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
) {
  if (hasAllBranchAccess(auth)) {
    return;
  }

  const manageableBranches = new Set(getManageableBranchIds(db, auth));

  const employeeBranches = getEmployeeBranchIds(db, employeeId);

  const hasOverlap = employeeBranches.some((branchId) =>
    manageableBranches.has(branchId),
  );

  if (!hasOverlap) {
    throw new Error("EMPLOYEE_ACCESS_DENIED");
  }
}

function assertCanManageTargetEmployee(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
) {
  assertCanAccessEmployee(db, auth, employeeId);

  if (isOwner(auth)) {
    return;
  }

  const roles = getEmployeeRoles(db, employeeId, auth.businessId);

  if (roles.includes("owner") || roles.includes("manager")) {
    throw new Error("EMPLOYEE_TARGET_ROLE_FORBIDDEN");
  }
}

function assertCanAssignBranches(
  db: Database.Database,
  auth: AuthContext,
  branchIds: string[],
) {
  const uniqueBranchIds = [...new Set(branchIds)];

  const placeholders = uniqueBranchIds.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `
    SELECT id
    FROM branches
    WHERE business_id = ?
      AND id IN (${placeholders})
  `,
    )
    .all(auth.businessId, ...uniqueBranchIds) as Array<{ id: string }>;

  if (rows.length !== uniqueBranchIds.length) {
    throw new Error("INVALID_EMPLOYEE_BRANCH");
  }

  if (hasAllBranchAccess(auth)) {
    return;
  }

  const manageableBranches = new Set(getManageableBranchIds(db, auth));

  const canAssignEveryBranch = uniqueBranchIds.every((branchId) =>
    manageableBranches.has(branchId),
  );

  if (!canAssignEveryBranch) {
    throw new Error("EMPLOYEE_BRANCH_ASSIGNMENT_FORBIDDEN");
  }
}

function assertCanAssignRoles(auth: AuthContext, roles: EmployeeRole[]) {
  if (roles.length === 0) {
    throw new Error("EMPLOYEE_REQUIRES_ROLE");
  }

  if (roles.includes("owner")) {
    throw new Error("OWNER_ROLE_ASSIGNMENT_FORBIDDEN");
  }

  if (!isOwner(auth)) {
    const allowedRoles: EmployeeRole[] = ["supervisor", "teller"];

    if (!roles.every((role) => allowedRoles.includes(role))) {
      throw new Error("ROLE_ASSIGNMENT_FORBIDDEN");
    }
  }
}

function getEmployeeRoles(
  db: Database.Database,
  employeeId: string,
  businessId: string,
): EmployeeRole[] {
  const rows = db
    .prepare(
      `
    SELECT r.slug
    FROM employee_roles er
    INNER JOIN roles r ON r.id = er.role_id
    WHERE er.employee_id = ?
      AND r.business_id = ?
  `,
    )
    .all(employeeId, businessId) as Array<{ slug: string }>;

  return rows
    .map((row) => row.slug)
    .filter((slug): slug is EmployeeRole =>
      roleSlugs.includes(slug as EmployeeRole),
    );
}

function getEmployeeBranches(
  db: Database.Database,
  employeeId: string,
  businessId: string,
) {
  const rows = db
    .prepare(
      `
    SELECT
      b.id,
      b.name,
      b.code,
      b.is_headquarters,
      eba.is_primary
    FROM employee_branch_access eba
    INNER JOIN branches b ON b.id = eba.branch_id
    WHERE eba.employee_id = ?
      AND b.business_id = ?
    ORDER BY eba.is_primary DESC, b.name ASC
  `,
    )
    .all(employeeId, businessId) as BranchRow[];

  return rows.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
    isHeadquarters: Boolean(branch.is_headquarters),
    isPrimary: Boolean(branch.is_primary),
  }));
}

function mapEmployee(
  db: Database.Database,
  employee: EmployeeRow,
): EmployeeListItem {
  return {
    id: employee.id,
    employeeNumber: employee.employee_number,
    fullName: employee.full_name,
    email: employee.email,
    phone: employee.phone,
    username: employee.username,
    status: employee.status,
    roles: getEmployeeRoles(db, employee.id, employee.business_id),
    branches: getEmployeeBranches(db, employee.id, employee.business_id),
    createdAt: employee.created_at,
  };
}

function generateEmployeeNumber(
  db: Database.Database,
  businessId: string,
): string {
  const result = db
    .prepare(
      `
    SELECT
      MAX(CAST(SUBSTR(employee_number, 5) AS INTEGER)) AS highest
    FROM employees
    WHERE business_id = ?
      AND employee_number GLOB 'EMP-[0-9]*'
  `,
    )
    .get(businessId) as { highest: number | null };

  const nextNumber = (result.highest ?? 0) + 1;

  return `EMP-${String(nextNumber).padStart(3, "0")}`;
}

function getRoleId(
  db: Database.Database,
  businessId: string,
  role: EmployeeRole,
): string {
  const result = db
    .prepare(
      `
    SELECT id
    FROM roles
    WHERE business_id = ?
      AND slug = ?
  `,
    )
    .get(businessId, role) as { id: string } | undefined;

  if (!result) {
    throw new Error("EMPLOYEE_ROLE_NOT_FOUND");
  }

  return result.id;
}

export function listEmployees(
  db: Database.Database,
  auth: AuthContext,
  options: {
    search?: string;
    status?: EmployeeStatus;
    role?: EmployeeRole;
    branchId?: string;
    page: number;
    limit: number;
  },
) {
  if (!auth.permissions.includes("employees.view")) {
    throw new Error("EMPLOYEE_VIEW_FORBIDDEN");
  }

  const manageableBranches = getManageableBranchIds(db, auth);

  if (options.branchId && !manageableBranches.includes(options.branchId)) {
    throw new Error("EMPLOYEE_ACCESS_DENIED");
  }

  const conditions = ["e.business_id = ?"];

  const params: Array<string | number> = [auth.businessId];

  if (!hasAllBranchAccess(auth)) {
    if (manageableBranches.length === 0) {
      return {
        data: [],
        pagination: {
          page: options.page,
          limit: options.limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const placeholders = manageableBranches.map(() => "?").join(", ");

    conditions.push(`
      EXISTS (
        SELECT 1
        FROM employee_branch_access scope
        WHERE scope.employee_id = e.id
          AND scope.branch_id IN (${placeholders})
      )
    `);

    params.push(...manageableBranches);
  }

  if (options.branchId) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM employee_branch_access filter_branch
        WHERE filter_branch.employee_id = e.id
          AND filter_branch.branch_id = ?
      )
    `);

    params.push(options.branchId);
  }

  if (options.status) {
    conditions.push("e.status = ?");
    params.push(options.status);
  }

  if (options.search) {
    conditions.push(`
      (
        e.full_name LIKE ?
        OR e.employee_number LIKE ?
        OR e.email LIKE ?
        OR e.phone LIKE ?
        OR u.username LIKE ?
      )
    `);

    const search = `%${options.search}%`;

    params.push(search, search, search, search, search);
  }

  if (options.role) {
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM employee_roles filter_role
        INNER JOIN roles filter_role_record
          ON filter_role_record.id = filter_role.role_id
        WHERE filter_role.employee_id = e.id
          AND filter_role_record.business_id = e.business_id
          AND filter_role_record.slug = ?
      )
    `);

    params.push(options.role);
  }

  const where = conditions.join(" AND ");

  const totalResult = db
    .prepare(
      `
    SELECT COUNT(*) AS total
    FROM employees e
    INNER JOIN users u ON u.id = e.user_id
    WHERE ${where}
  `,
    )
    .get(...params) as { total: number };

  const offset = (options.page - 1) * options.limit;

  const rows = db
    .prepare(
      `
    SELECT
      e.id,
      e.business_id,
      e.user_id,
      e.employee_number,
      e.full_name,
      e.email,
      e.phone,
      e.status,
      e.created_at,
      u.username,
      u.status AS user_status
    FROM employees e
    INNER JOIN users u ON u.id = e.user_id
    WHERE ${where}
    ORDER BY e.created_at DESC
    LIMIT ?
    OFFSET ?
  `,
    )
    .all(...params, options.limit, offset) as EmployeeRow[];

  return {
    data: rows.map((employee) => mapEmployee(db, employee)),
    pagination: {
      page: options.page,
      limit: options.limit,
      total: totalResult.total,
      totalPages: Math.ceil(totalResult.total / options.limit),
    },
  };
}

export function getEmployee(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
): EmployeeDetails {
  if (!auth.permissions.includes("employees.view")) {
    throw new Error("EMPLOYEE_VIEW_FORBIDDEN");
  }

  const employee = getEmployeeRow(db, auth.businessId, employeeId);

  assertCanAccessEmployee(db, auth, employeeId);

  return {
    ...mapEmployee(db, employee),
    userId: employee.user_id,
  };
}

export function createEmployee(
  db: Database.Database,
  auth: AuthContext,
  input: CreateEmployeeInput,
): EmployeeDetails {
  assertCanManageEmployees(auth);

  assertCanAssignRoles(auth, [input.role]);

  assertCanAssignBranches(db, auth, input.branchIds);

  if (!input.branchIds.includes(input.primaryBranchId)) {
    throw new Error("INVALID_PRIMARY_BRANCH");
  }

  const userId = randomUUID();
  const employeeId = randomUUID();
  const passwordHash = hashPassword(input.password);
  const createdAt = now();

  const create = db.transaction(() => {
    const existingUser = db
      .prepare(
        `
      SELECT id
      FROM users
      WHERE username = ?
    `,
      )
      .get(input.username);

    if (existingUser) {
      throw new Error("USERNAME_ALREADY_EXISTS");
    }

    const employeeNumber = generateEmployeeNumber(db, auth.businessId);

    db.prepare(
      `
      INSERT INTO users (
        id,
        username,
        password_hash,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, 'active', ?, ?)
    `,
    ).run(userId, input.username, passwordHash, createdAt, createdAt);

    db.prepare(
      `
      INSERT INTO employees (
        id,
        business_id,
        user_id,
        employee_number,
        full_name,
        email,
        phone,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `,
    ).run(
      employeeId,
      auth.businessId,
      userId,
      employeeNumber,
      input.fullName,
      input.email || null,
      input.phone || null,
      createdAt,
    );

    const roleId = getRoleId(db, auth.businessId, input.role);

    db.prepare(
      `
      INSERT INTO employee_roles (
        employee_id,
        role_id
      )
      VALUES (?, ?)
    `,
    ).run(employeeId, roleId);

    const insertBranch = db.prepare(`
      INSERT INTO employee_branch_access (
        employee_id,
        branch_id,
        is_primary
      )
      VALUES (?, ?, ?)
    `);

    for (const branchId of input.branchIds) {
      insertBranch.run(
        employeeId,
        branchId,
        branchId === input.primaryBranchId ? 1 : 0,
      );
    }

    writeAuditLog(db, auth, "employee.created", "employee", employeeId, {
      employeeNumber,
      role: input.role,
      branchIds: input.branchIds,
    });
  });

  create.immediate();

  return getEmployee(db, auth, employeeId);
}

export function updateEmployee(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
  input: UpdateEmployeeInput,
): EmployeeDetails {
  assertCanManageTargetEmployee(db, auth, employeeId);

  const employee = getEmployeeRow(db, auth.businessId, employeeId);

  assertCanManageTargetEmployee(db, auth, employeeId);

  const employeeRoles = getEmployeeRoles(db, employeeId, auth.businessId);

  //   if (!isOwner(auth) && employeeRoles.includes("owner")) {
  //     throw new Error("OWNER_EMPLOYEE_PROTECTED");
  //   }

  const updates: string[] = [];
  const values: Array<string | null> = [];

  if (input.fullName !== undefined) {
    updates.push("full_name = ?");
    values.push(input.fullName);
  }

  if (input.email !== undefined) {
    updates.push("email = ?");
    values.push(input.email);
  }

  if (input.phone !== undefined) {
    updates.push("phone = ?");
    values.push(input.phone);
  }

  if (updates.length === 0) {
    throw new Error("NO_EMPLOYEE_CHANGES");
  }

  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE employees
      SET ${updates.join(", ")}
      WHERE id = ?
        AND business_id = ?
    `,
    ).run(...values, employeeId, auth.businessId);

    writeAuditLog(db, auth, "employee.updated", "employee", employeeId, {
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
    });
  });

  update.immediate();

  return getEmployee(db, auth, employeeId);
}

export function updateEmployeeStatus(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
  status: EmployeeStatus,
) {
  const update = db.transaction(() => {
    const employee = getEmployeeRow(db, auth.businessId, employeeId);

    assertCanManageTargetEmployee(db, auth, employeeId);

    const isOwner = employeeRolesIncludeOwner(db, employeeId, auth.businessId);

    // Protect the business first: its final active Owner cannot be deactivated.
    // This check intentionally comes before self-deactivation so the last
    // Owner receives OWNER_EMPLOYEE_PROTECTED, even when acting on themselves.
    if (
      status === "inactive" &&
      isOwner &&
      countActiveOwners(db, auth.businessId) <= 1
    ) {
      throw new Error("OWNER_EMPLOYEE_PROTECTED");
    }

    // Additional protection: an employee cannot deactivate their own account.
    if (employeeId === auth.employeeId && status === "inactive") {
      throw new Error("CANNOT_DEACTIVATE_SELF");
    }

    const updatedAt = now();

    db.prepare(
      `
      UPDATE employees
      SET status = ?
      WHERE id = ?
        AND business_id = ?
      `,
    ).run(status, employeeId, auth.businessId);

    if (status === "inactive") {
      db.prepare(
        `
        UPDATE users
        SET
          status = 'disabled',
          disabled_reason = 'employee_inactive',
          updated_at = ?
        WHERE id = ?
          AND status = 'active'
        `,
      ).run(updatedAt, employee.user_id);

      db.prepare(
        `
        UPDATE sessions
        SET revoked_at = ?
        WHERE user_id = ?
          AND revoked_at IS NULL
        `,
      ).run(updatedAt, employee.user_id);
    } else {
      db.prepare(
        `
        UPDATE users
        SET
          status = 'active',
          disabled_reason = NULL,
          updated_at = ?
        WHERE id = ?
          AND status = 'disabled'
          AND disabled_reason = 'employee_inactive'
        `,
      ).run(updatedAt, employee.user_id);
    }

    const user = db
      .prepare(
        `
        SELECT status, disabled_reason
        FROM users
        WHERE id = ?
        `,
      )
      .get(employee.user_id) as {
      status: "active" | "disabled";
      disabled_reason: string | null;
    };

    writeAuditLog(
      db,
      auth,
      status === "active" ? "employee.activated" : "employee.deactivated",
      "employee",
      employeeId,
      {
        employeeStatus: status,
        accountStatus: user.status,
        disabledReason: user.disabled_reason,
      },
    );

    return {
      success: true,
      employeeId,
      status,
      accountStatus: user.status,
      disabledReason: user.disabled_reason,
    };
  });

  return update.immediate();
}

function employeeRolesIncludeOwner(
  db: Database.Database,
  employeeId: string,
  businessId: string,
): boolean {
  const result = db
    .prepare(
      `
    SELECT 1 AS found
    FROM employee_roles er
    INNER JOIN roles r ON r.id = er.role_id
    WHERE er.employee_id = ?
      AND r.business_id = ?
      AND r.slug = 'owner'
    LIMIT 1
  `,
    )
    .get(employeeId, businessId);

  return Boolean(result);
}

function countActiveOwners(db: Database.Database, businessId: string): number {
  const result = db
    .prepare(
      `
      SELECT COUNT(DISTINCT e.id) AS total
      FROM employees e
      INNER JOIN employee_roles er ON er.employee_id = e.id
      INNER JOIN roles r ON r.id = er.role_id
      INNER JOIN users u ON u.id = e.user_id
      WHERE e.business_id = ?
        AND e.status = 'active'
        AND u.status = 'active'
        AND r.business_id = ?
        AND r.slug = 'owner'
      `,
    )
    .get(businessId, businessId) as { total: number };

  return result.total;
}

export function assignEmployeeRoles(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
  input: AssignEmployeeRolesInput,
) {
  const update = db.transaction(() => {
    // Confirm that the employee exists in this business.
    getEmployeeRow(db, auth.businessId, employeeId);

    // Perform authorization checks inside the transaction.
    assertCanManageTargetEmployee(db, auth, employeeId);

    // Never allow an employee holding the Owner role to lose it
    // through ordinary role assignment.
    if (employeeRolesIncludeOwner(db, employeeId, auth.businessId)) {
      throw new Error("OWNER_EMPLOYEE_PROTECTED");
    }

    // Validate the requested roles.
    assertCanAssignRoles(auth, input.roles);

    const roleIds = input.roles.map((role) =>
      getRoleId(db, auth.businessId, role),
    );

    db.prepare(
      `
      DELETE FROM employee_roles
      WHERE employee_id = ?
      `,
    ).run(employeeId);

    const insert = db.prepare(`
      INSERT INTO employee_roles (
        employee_id,
        role_id
      )
      VALUES (?, ?)
    `);

    for (const roleId of roleIds) {
      insert.run(employeeId, roleId);
    }

    writeAuditLog(db, auth, "employee.roles_updated", "employee", employeeId, {
      roles: input.roles,
    });
  });

  update.immediate();

  return {
    success: true,
    employeeId,
    roles: input.roles,
  };
}

export function assignEmployeeBranches(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
  input: AssignEmployeeBranchesInput,
) {
  const update = db.transaction(() => {
    // Confirm that the employee exists in this business.
    getEmployeeRow(db, auth.businessId, employeeId);

    // Perform authorization checks inside the transaction.
    assertCanManageTargetEmployee(db, auth, employeeId);

    // Validate that the requested primary branch is included.
    if (!input.branchIds.includes(input.primaryBranchId)) {
      throw new Error("INVALID_PRIMARY_BRANCH");
    }

    // Validate that the requested branches belong to this business
    // and are within the Manager's permitted branch scope.
    assertCanAssignBranches(db, auth, input.branchIds);

    const requestedBranchIds = [...new Set(input.branchIds)];

    const manageableBranchIds = new Set(getManageableBranchIds(db, auth));

    // Read existing assignments before changing anything.
    const existingAssignments = db
      .prepare(
        `
        SELECT branch_id, is_primary
        FROM employee_branch_access
        WHERE employee_id = ?
        `,
      )
      .all(employeeId) as Array<{
      branch_id: string;
      is_primary: number;
    }>;

    // Preserve assignments belonging to branches this user
    // does not have authority to manage.
    const protectedAssignments = hasAllBranchAccess(auth)
      ? []
      : existingAssignments.filter(
          (assignment) => !manageableBranchIds.has(assignment.branch_id),
        );

    // If another branch outside the Manager's authority is
    // currently primary, preserve that primary assignment.
    const protectedPrimary = protectedAssignments.find((assignment) =>
      Boolean(assignment.is_primary),
    );

    const effectivePrimaryBranchId =
      protectedPrimary?.branch_id ?? input.primaryBranchId;

    // Combine protected assignments with the requested assignments.
    const finalBranchIds = [
      ...new Set([
        ...protectedAssignments.map((assignment) => assignment.branch_id),
        ...requestedBranchIds,
      ]),
    ];

    // Replace assignments atomically.
    db.prepare(
      `
      DELETE FROM employee_branch_access
      WHERE employee_id = ?
      `,
    ).run(employeeId);

    const insert = db.prepare(
      `
      INSERT INTO employee_branch_access (
        employee_id,
        branch_id,
        is_primary
      )
      VALUES (?, ?, ?)
      `,
    );

    // Restore protected assignments without changing their
    // existing primary status.
    for (const assignment of protectedAssignments) {
      insert.run(employeeId, assignment.branch_id, assignment.is_primary);
    }

    // Apply the requested assignments within the user's scope.
    for (const branchId of requestedBranchIds) {
      insert.run(
        employeeId,
        branchId,
        branchId === effectivePrimaryBranchId ? 1 : 0,
      );
    }

    writeAuditLog(
      db,
      auth,
      "employee.branches_updated",
      "employee",
      employeeId,
      {
        requestedBranchIds,
        requestedPrimaryBranchId: input.primaryBranchId,
        appliedBranchIds: finalBranchIds,
        appliedPrimaryBranchId: effectivePrimaryBranchId,
        preservedBranchIds: protectedAssignments.map(
          (assignment) => assignment.branch_id,
        ),
      },
    );

    return {
      success: true,
      employeeId,
      branchIds: finalBranchIds,
      primaryBranchId: effectivePrimaryBranchId,
    };
  });

  return update.immediate();
}

export function resetEmployeePassword(
  db: Database.Database,
  auth: AuthContext,
  employeeId: string,
  password: string,
) {
  assertCanManageTargetEmployee(db, auth, employeeId);

  const employee = getEmployeeRow(db, auth.businessId, employeeId);

  assertCanManageTargetEmployee(db, auth, employeeId);

  //   if (
  //     employeeRolesIncludeOwner(db, employeeId, auth.businessId) &&
  //     !isOwner(auth)
  //   ) {
  //     throw new Error("OWNER_EMPLOYEE_PROTECTED");
  //   }

  //   if (employeeId === auth.employeeId && !isOwner(auth)) {
  //     throw new Error("SELF_PASSWORD_RESET_FORBIDDEN");
  //   }

  const passwordHash = hashPassword(password);
  const updatedAt = now();

  const update = db.transaction(() => {
    db.prepare(
      `
      UPDATE users
      SET
        password_hash = ?,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = ?
      WHERE id = ?
    `,
    ).run(passwordHash, updatedAt, employee.user_id);

    db.prepare(
      `
      UPDATE sessions
      SET revoked_at = ?
      WHERE user_id = ?
        AND revoked_at IS NULL
    `,
    ).run(updatedAt, employee.user_id);

    writeAuditLog(db, auth, "employee.password_reset", "employee", employeeId);
  });

  update.immediate();

  return {
    success: true,
    employeeId,
    message:
      "Employee password reset successfully. Existing sessions have been revoked.",
  };
}
