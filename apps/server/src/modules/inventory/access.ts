import type Database from "better-sqlite3";

import type { AuthContext } from "../../middleware/authenticate.js";

export interface AccessibleBranch {
  id: string;
  name: string;
  code: string;
  isHeadquarters: boolean;
}

/**
 * Determines whether an employee has unrestricted
 * branch access within their business.
 *
 * Owners automatically have access to every branch.
 * Other employees need the branches.access_all permission.
 */
export function hasAllBranchAccess(auth: AuthContext): boolean {
  return (
    auth.roles.includes("owner") ||
    auth.permissions.includes("branches.access_all")
  );
}

/**
 * Returns all branches the authenticated employee
 * is permitted to access.
 *
 * All queries are restricted to the employee's business.
 */
export function getAccessibleBranches(
  db: Database.Database,
  auth: AuthContext,
): AccessibleBranch[] {
  let records: Array<{
    id: string;
    name: string;
    code: string;
    is_headquarters: number;
  }>;

  if (hasAllBranchAccess(auth)) {
    records = db
      .prepare(
        `
        SELECT id, name, code, is_headquarters
        FROM branches
        WHERE business_id = ?
        ORDER BY is_headquarters DESC, name COLLATE NOCASE ASC
        `,
      )
      .all(auth.businessId) as typeof records;
  } else {
    if (auth.branchIds.length === 0) {
      return [];
    }

    const placeholders = auth.branchIds.map(() => "?").join(", ");

    records = db
      .prepare(
        `
        SELECT id, name, code, is_headquarters
        FROM branches
        WHERE business_id = ?
          AND id IN (${placeholders})
        ORDER BY is_headquarters DESC, name COLLATE NOCASE ASC
        `,
      )
      .all(auth.businessId, ...auth.branchIds) as typeof records;
  }

  return records.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
    isHeadquarters: branch.is_headquarters === 1,
  }));
}

/**
 * Checks whether an employee can access a specific branch.
 *
 * Returns the branch when access is allowed.
 * Returns null when the branch is inaccessible
 * or does not belong to the employee's business.
 */
export function getAccessibleBranch(
  db: Database.Database,
  auth: AuthContext,
  branchId: string,
): AccessibleBranch | null {
  if (hasAllBranchAccess(auth)) {
    const branch = db
      .prepare(
        `
        SELECT id, name, code, is_headquarters
        FROM branches
        WHERE id = ?
          AND business_id = ?
        `,
      )
      .get(branchId, auth.businessId) as
      | {
          id: string;
          name: string;
          code: string;
          is_headquarters: number;
        }
      | undefined;

    if (!branch) return null;

    return {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      isHeadquarters: branch.is_headquarters === 1,
    };
  }

  if (!auth.branchIds.includes(branchId)) {
    return null;
  }

  const branch = db
    .prepare(
      `
      SELECT id, name, code, is_headquarters
      FROM branches
      WHERE id = ?
        AND business_id = ?
      `,
    )
    .get(branchId, auth.businessId) as
    | {
        id: string;
        name: string;
        code: string;
        is_headquarters: number;
      }
    | undefined;

  if (!branch) return null;

  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    isHeadquarters: branch.is_headquarters === 1,
  };
}

/**
 * Convenience function for inventory services.
 *
 * Throws a consistent error when access is denied.
 */
export function requireBranchAccess(
  db: Database.Database,
  auth: AuthContext,
  branchId: string,
): AccessibleBranch {
  const branch = getAccessibleBranch(db, auth, branchId);

  if (!branch) {
    throw new Error("BRANCH_ACCESS_DENIED");
  }

  return branch;
}
