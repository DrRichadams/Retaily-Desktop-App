import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import type { AuthContext } from "../../middleware/authenticate.js";
import { getAccessibleBranches } from "../inventory/access.js";

export interface CreateBranchInput {
  name: string;
  code: string;
  address?: string;
}

export interface BranchRecord {
  id: string;
  businessId: string;
  name: string;
  code: string;
  address: string | null;
  isHeadquarters: boolean;
  createdAt: string;
}

export function listBranches(db: Database.Database, auth: AuthContext) {
  return getAccessibleBranches(db, auth);
}

export function createBranch(
  db: Database.Database,
  auth: AuthContext,
  input: CreateBranchInput,
): BranchRecord {
  const branchId = randomUUID();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const address = input.address?.trim() || null;

  const create = db.transaction(() => {
    const existing = db
      .prepare(
        `
        SELECT id
        FROM branches
        WHERE business_id = ?
          AND code = ?
        `,
      )
      .get(auth.businessId, code);

    if (existing) {
      throw new Error("BRANCH_CODE_ALREADY_EXISTS");
    }

    db.prepare(
      `
      INSERT INTO branches (
        id,
        business_id,
        name,
        code,
        address,
        is_headquarters
      )
      VALUES (?, ?, ?, ?, ?, 0)
      `,
    ).run(branchId, auth.businessId, name, code, address);

    // Give the creator access to the new branch.
    // This is useful for authorised non-owner administrators too.
    db.prepare(
      `
      INSERT OR IGNORE INTO employee_branch_access (
        employee_id,
        branch_id,
        is_primary
      )
      VALUES (?, ?, 0)
      `,
    ).run(auth.employeeId, branchId);

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
      "branch.created",
      "branch",
      branchId,
      JSON.stringify({
        name,
        code,
        address,
      }),
    );

    return db
      .prepare(
        `
        SELECT
          id,
          business_id,
          name,
          code,
          address,
          is_headquarters,
          created_at
        FROM branches
        WHERE id = ?
          AND business_id = ?
        `,
      )
      .get(branchId, auth.businessId) as {
      id: string;
      business_id: string;
      name: string;
      code: string;
      address: string | null;
      is_headquarters: number;
      created_at: string;
    };
  });

  const branch = create();

  return {
    id: branch.id,
    businessId: branch.business_id,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    isHeadquarters: branch.is_headquarters === 1,
    createdAt: branch.created_at,
  };
}
