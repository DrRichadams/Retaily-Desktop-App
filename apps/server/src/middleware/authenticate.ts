import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type Database from "better-sqlite3";

export interface AuthContext {
  sessionId: string;
  userId: string;
  employeeId: string;
  businessId: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

export interface AuthenticatedRequest extends FastifyRequest {
  auth: AuthContext;
}

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice(7).trim() || null;
}

export function createAuthenticate(db: Database.Database) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const token = getBearerToken(request);

    if (!token) {
      return reply.code(401).send({
        error: "Authentication required",
      });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const session = db
      .prepare(
        `
      SELECT
        s.id AS session_id,
        s.user_id,
        u.username
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND julianday(s.expires_at) > julianday('now')
        AND u.status = 'active'
    `,
      )
      .get(tokenHash) as
      | {
          session_id: string;
          user_id: string;
          username: string;
        }
      | undefined;

    if (!session) {
      return reply.code(401).send({
        error: "Invalid or expired session",
      });
    }

    const employee = db
      .prepare(
        `
      SELECT
        e.id,
        e.business_id,
        e.full_name
      FROM employees e
      WHERE e.user_id = ?
        AND e.status = 'active'
      LIMIT 1
    `,
      )
      .get(session.user_id) as
      | {
          id: string;
          business_id: string;
          full_name: string;
        }
      | undefined;

    if (!employee) {
      return reply.code(403).send({
        error: "No active employee account",
      });
    }

    const roles = db
      .prepare(
        `
      SELECT r.slug
      FROM employee_roles er
      INNER JOIN roles r ON r.id = er.role_id
      WHERE er.employee_id = ?
        AND r.business_id = ?
    `,
      )
      .all(employee.id, employee.business_id) as {
      slug: string;
    }[];

    const permissions = db
      .prepare(
        `
      SELECT DISTINCT rp.permission_code
      FROM employee_roles er
      INNER JOIN roles r ON r.id = er.role_id
      INNER JOIN role_permissions rp ON rp.role_id = r.id
      WHERE er.employee_id = ?
        AND r.business_id = ?
    `,
      )
      .all(employee.id, employee.business_id) as {
      permission_code: string;
    }[];

    const branches = db
      .prepare(
        `
      SELECT branch_id
      FROM employee_branch_access
      WHERE employee_id = ?
    `,
      )
      .all(employee.id) as {
      branch_id: string;
    }[];

    db.prepare(
      `
      UPDATE sessions
      SET last_seen_at = ?
      WHERE id = ?
    `,
    ).run(new Date().toISOString(), session.session_id);

    const auth: AuthContext = {
      sessionId: session.session_id,
      userId: session.user_id,
      employeeId: employee.id,
      businessId: employee.business_id,
      username: session.username,
      fullName: employee.full_name,
      roles: roles.map((role) => role.slug),
      permissions: permissions.map((item) => item.permission_code),
      branchIds: branches.map((branch) => branch.branch_id),
    };

    (request as AuthenticatedRequest).auth = auth;
  };
}

export function requirePermission(permission: string) {
  return async function permissionGuard(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const auth = (request as AuthenticatedRequest).auth;

    if (!auth) {
      return reply.code(401).send({
        error: "Authentication required",
      });
    }

    if (!auth.permissions.includes(permission)) {
      return reply.code(403).send({
        error: "You do not have permission to perform this action",
        requiredPermission: permission,
      });
    }
  };
}
