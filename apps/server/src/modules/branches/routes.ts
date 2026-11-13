import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

import {
  createAuthenticate,
  requirePermission,
  type AuthenticatedRequest,
} from "../../middleware/authenticate.js";

import { createBranchSchema } from "./schemas.js";

import { createBranch, listBranches } from "./service.js";

export function registerBranchRoutes(
  server: FastifyInstance,
  db: Database.Database,
) {
  const authenticate = createAuthenticate(db);

  const canViewBranches = {
    preHandler: [authenticate, requirePermission("branches.manage")],
  };

  const canManageBranches = {
    preHandler: [authenticate, requirePermission("branches.manage")],
  };

  // ==========================================
  // LIST ACCESSIBLE BRANCHES
  // GET /api/branches
  // ==========================================

  server.get(
    "/api/branches",
    {
      preHandler: [authenticate],
    },
    async (request) => {
      const auth = (request as AuthenticatedRequest).auth;

      return {
        success: true,
        data: listBranches(db, auth),
      };
    },
  );

  // ==========================================
  // CREATE BRANCH
  // POST /api/branches
  // ==========================================

  server.post("/api/branches", canManageBranches, async (request, reply) => {
    const validation = createBranchSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.code(400).send({
        error: "INVALID_BRANCH_INFORMATION",
        message: "Please check the branch information.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      const branch = createBranch(db, auth, validation.data);

      return reply.code(201).send({
        success: true,
        message: "Branch created successfully.",
        data: branch,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "BRANCH_CODE_ALREADY_EXISTS" ||
          error.message.includes("UNIQUE constraint failed"))
      ) {
        return reply.code(409).send({
          error: "BRANCH_CODE_ALREADY_EXISTS",
          message: "A branch with this code already exists.",
        });
      }

      request.log.error(error);

      return reply.code(500).send({
        error: "BRANCH_CREATION_FAILED",
        message: "The branch could not be created.",
      });
    }
  });
}
