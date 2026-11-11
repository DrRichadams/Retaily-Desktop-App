import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { verifyPassword } from "./password.js";
import {
  createAuthenticate,
  type AuthenticatedRequest,
} from "../../middleware/authenticate.js";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(128),
});

const SESSION_DURATION_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export function registerAuthenticationRoutes(
  server: FastifyInstance,
  db: Database.Database,
) {
  const authenticate = createAuthenticate(db);

  server.post("/api/auth/login", async (request, reply) => {
    const validation = loginSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Please provide a valid username and password",
      });
    }

    const { username, password } = validation.data;

    const user = db
      .prepare(
        `
      SELECT
        id,
        username,
        password_hash,
        status,
        failed_login_attempts,
        locked_until
      FROM users
      WHERE username = ? COLLATE NOCASE
    `,
      )
      .get(username) as
      | {
          id: string;
          username: string;
          password_hash: string;
          status: string;
          failed_login_attempts: number;
          locked_until: string | null;
        }
      | undefined;

    const invalidCredentials = () =>
      reply.code(401).send({
        error: "Invalid username or password",
      });

    if (!user || user.status !== "active") {
      return invalidCredentials();
    }

    if (
      user.locked_until &&
      new Date(user.locked_until).getTime() > Date.now()
    ) {
      return reply.code(423).send({
        error: "Account temporarily locked. Please try again later.",
      });
    }

    if (!verifyPassword(password, user.password_hash)) {
      const attempts = user.failed_login_attempts + 1;

      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString()
          : null;

      db.prepare(
        `
        UPDATE users
        SET
          failed_login_attempts = ?,
          locked_until = ?,
          updated_at = ?
        WHERE id = ?
      `,
      ).run(attempts, lockedUntil, new Date().toISOString(), user.id);

      return invalidCredentials();
    }

    const employee = db
      .prepare(
        `
      SELECT id, business_id, full_name
      FROM employees
      WHERE user_id = ?
        AND status = 'active'
      LIMIT 1
    `,
      )
      .get(user.id) as
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

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const sessionId = randomUUID();

    const createSession = db.transaction(() => {
      db.prepare(
        `
        UPDATE users
        SET
          failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = ?
        WHERE id = ?
      `,
      ).run(now.toISOString(), user.id);

      db.prepare(
        `
        INSERT INTO sessions (
          id,
          user_id,
          token_hash,
          expires_at,
          created_at,
          last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(
        sessionId,
        user.id,
        tokenHash,
        expiresAt.toISOString(),
        now.toISOString(),
        now.toISOString(),
      );
    });

    createSession();

    return reply.send({
      success: true,
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        username: user.username,
        employeeId: employee.id,
        businessId: employee.business_id,
        fullName: employee.full_name,
      },
    });
  });

  server.get("/api/auth/me", { preHandler: authenticate }, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;

    return {
      userId: auth.userId,
      username: auth.username,
      employeeId: auth.employeeId,
      businessId: auth.businessId,
      fullName: auth.fullName,
      roles: auth.roles,
      permissions: auth.permissions,
      branchIds: auth.branchIds,
    };
  });

  server.post(
    "/api/auth/logout",
    { preHandler: authenticate },
    async (request, reply) => {
      const auth = (request as AuthenticatedRequest).auth;

      db.prepare(
        `
        UPDATE sessions
        SET revoked_at = ?
        WHERE id = ?
      `,
      ).run(new Date().toISOString(), auth.sessionId);

      return reply.send({
        success: true,
        message: "Logged out successfully",
      });
    },
  );
}
