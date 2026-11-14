import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import type Database from "better-sqlite3";

import {
  createAuthenticate,
  requirePermission,
  type AuthenticatedRequest,
} from "../../middleware/authenticate.js";

import {
  inventoryListSchema,
  inventoryProductParamsSchema,
  stockMovementListSchema,
  receiveStockSchema,
  adjustStockSchema,
  updateReorderLevelSchema,
  createStockTransferSchema,
  stockTransferParamsSchema,
  receiveStockTransferSchema,
  cancelStockTransferSchema,
} from "./schemas.js";

import {
  listInventory,
  getProductInventory,
  getInventoryStats,
  listStockMovements,
  receiveStock,
  adjustStock,
  updateReorderLevel,
  createStockTransfer,
  getStockTransfer,
  listStockTransfers,
  dispatchStockTransfer,
  receiveStockTransfer,
  cancelStockTransfer,
} from "./service.js";
import { getAccessibleBranches } from "./access.js";

// ==========================================
// TRANSFER LIST VALIDATION
// ==========================================

const transferListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  branchId: z.string().uuid().optional(),
  status: z
    .enum([
      "draft",
      "in_transit",
      "partially_received",
      "received",
      "cancelled",
    ])
    .optional(),
});

// ==========================================
// ERROR HANDLING
// ==========================================

function handleInventoryError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    const knownErrors: Record<string, { statusCode: number; message: string }> =
      {
        BRANCH_ACCESS_DENIED: {
          statusCode: 403,
          message: "You do not have access to this branch.",
        },

        PRODUCT_NOT_FOUND: {
          statusCode: 404,
          message: "Product not found.",
        },

        PRODUCT_STOCK_TRACKING_DISABLED: {
          statusCode: 400,
          message: "Stock tracking is disabled for this product.",
        },

        INVENTORY_RECORD_NOT_FOUND: {
          statusCode: 404,
          message: "Inventory record not found.",
        },

        INVALID_STOCK_MOVEMENT: {
          statusCode: 400,
          message: "Invalid stock movement.",
        },

        INVALID_STOCK_QUANTITY: {
          statusCode: 400,
          message: "Stock quantity must be greater than zero.",
        },

        INVALID_STOCK_ADJUSTMENT: {
          statusCode: 400,
          message: "Invalid stock adjustment.",
        },

        INVALID_REORDER_LEVEL: {
          statusCode: 400,
          message: "Reorder level must be zero or greater.",
        },

        INSUFFICIENT_STOCK: {
          statusCode: 409,
          message: "Insufficient stock available for this operation.",
        },

        INVENTORY_UPDATE_CONFLICT: {
          statusCode: 409,
          message: "Inventory changed during this operation. Please retry.",
        },

        TRANSFER_NOT_FOUND: {
          statusCode: 404,
          message: "Stock transfer not found.",
        },

        TRANSFER_BRANCHES_MUST_DIFFER: {
          statusCode: 400,
          message: "Source and destination branches must be different.",
        },

        TRANSFER_REQUIRES_ITEMS: {
          statusCode: 400,
          message: "A stock transfer must contain at least one item.",
        },

        DUPLICATE_TRANSFER_PRODUCT: {
          statusCode: 400,
          message: "A product can only appear once in a transfer.",
        },

        INVALID_TRANSFER_QUANTITY: {
          statusCode: 400,
          message: "Transfer quantities must be greater than zero.",
        },

        TRANSFER_NOT_DRAFT: {
          statusCode: 409,
          message: "Only draft transfers can be dispatched.",
        },

        TRANSFER_NOT_RECEIVABLE: {
          statusCode: 409,
          message: "This transfer cannot currently be received.",
        },

        INVALID_RECEIVED_QUANTITY: {
          statusCode: 400,
          message: "Received quantity must be greater than zero.",
        },

        TRANSFER_ITEM_NOT_FOUND: {
          statusCode: 404,
          message: "The selected transfer item was not found.",
        },

        RECEIVED_QUANTITY_EXCEEDS_REMAINING: {
          statusCode: 409,
          message: "Received quantity exceeds the outstanding quantity.",
        },

        INVALID_DESTINATION_STOCK: {
          statusCode: 400,
          message: "Invalid destination stock balance.",
        },

        ONLY_DRAFT_TRANSFERS_CAN_BE_CANCELLED: {
          statusCode: 409,
          message: "Only draft transfers can be cancelled.",
        },
        TRANSFER_ACCESS_DENIED: {
          statusCode: 403,
          message:
            "You do not have access to either branch involved in this transfer.",
        },

        TRANSFER_RECEIPT_REQUIRES_ITEMS: {
          statusCode: 400,
          message: "A receipt must contain at least one transfer item.",
        },

        TRANSFER_ITEM_UPDATE_CONFLICT: {
          statusCode: 409,
          message:
            "This transfer item was changed by another operation. Please refresh and retry.",
        },
      };

    const known = knownErrors[error.message];

    if (known) {
      return reply.code(known.statusCode).send({
        error: known.message,
      });
    }

    if (error.message.includes("UNIQUE constraint failed")) {
      return reply.code(409).send({
        error: "A conflicting inventory record already exists.",
      });
    }

    if (
      error.message.includes("FOREIGN KEY constraint failed") ||
      error.message.includes("INVENTORY_BUSINESS_MISMATCH") ||
      error.message.includes("INVALID_SOURCE_BRANCH") ||
      error.message.includes("INVALID_DESTINATION_BRANCH") ||
      error.message.includes("INVALID_TRANSFER_PRODUCT")
    ) {
      return reply.code(409).send({
        error:
          "The requested inventory operation violates a database constraint.",
      });
    }

    if (error.message.includes("PRODUCT_STOCK_TRACKING_DISABLED")) {
      return reply.code(400).send({
        error: "Stock tracking is disabled for this product.",
      });
    }
  }

  reply.log.error(error);

  return reply.code(500).send({
    error:
      "An unexpected error occurred while processing this inventory request.",
  });
}

// ==========================================
// ROUTE REGISTRATION
// ==========================================

export function registerInventoryRoutes(
  server: FastifyInstance,
  db: Database.Database,
) {
  const authenticate = createAuthenticate(db);

  const canViewInventory = {
    preHandler: [authenticate, requirePermission("inventory.view")],
  };

  const canManageInventory = {
    preHandler: [authenticate, requirePermission("inventory.manage")],
  };

  // GET /api/inventory/branches
  // Returns only branches the authenticated employee is allowed to access.
  server.get(
    "/api/inventory/branches",
    {
      preHandler: canViewInventory.preHandler,
    },
    async (request, reply) => {
      try {
        const auth = (request as AuthenticatedRequest).auth;

        const branches = getAccessibleBranches(db, auth);

        return reply.send({
          success: true,
          data: branches.map((branch) => ({
            id: branch.id,
            name: branch.name,
            code: branch.code,
            isHeadquarters: branch.isHeadquarters,
          })),
        });
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // INVENTORY STATISTICS
  // GET /api/inventory/stats
  // ==========================================

  server.get(
    "/api/inventory/stats",
    canViewInventory,
    async (request, reply) => {
      const validation = z
        .object({
          branchId: z.string().uuid().optional(),
        })
        .safeParse(request.query);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid inventory statistics parameters.",
          details: validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        return {
          data: getInventoryStats(db, auth, validation.data.branchId),
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // LIST INVENTORY
  // GET /api/inventory
  // ==========================================

  server.get("/api/inventory", canViewInventory, async (request, reply) => {
    const validation = inventoryListSchema.safeParse(request.query);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Invalid inventory search parameters.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      return listInventory(db, auth, validation.data);
    } catch (error) {
      return handleInventoryError(error, reply);
    }
  });

  // ==========================================
  // STOCK MOVEMENT HISTORY
  // GET /api/inventory/movements
  // ==========================================

  server.get(
    "/api/inventory/movements",
    canViewInventory,
    async (request, reply) => {
      const validation = stockMovementListSchema.safeParse(request.query);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid stock movement search parameters.",
          details: validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        return listStockMovements(db, auth, validation.data);
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // PRODUCT INVENTORY BY BRANCH
  // GET /api/inventory/:productId
  // ==========================================

  server.get(
    "/api/inventory/:productId",
    canViewInventory,
    async (request, reply) => {
      // const validation = inventoryProductParamsSchema.safeParse(request.params);
      console.log("INVENTORY REQUEST PARAMS:", request.params);

      const validation = inventoryProductParamsSchema.safeParse(request.params);

      console.log("INVENTORY VALIDATION:", validation);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid product ID.",
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const inventory = getProductInventory(
          db,
          auth,
          validation.data.productId,
        );

        return {
          data: inventory,
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // RECEIVE STOCK
  // POST /api/inventory/receive
  // ==========================================

  server.post(
    "/api/inventory/receive",
    canManageInventory,
    async (request, reply) => {
      const validation = receiveStockSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid stock receipt information.",
          details: validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const result = receiveStock(db, auth, validation.data);

        return reply.code(201).send({
          message: "Stock received successfully.",
          data: result,
        });
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // STOCK ADJUSTMENT
  // POST /api/inventory/adjustments
  // ==========================================

  server.post(
    "/api/inventory/adjustments",
    canManageInventory,
    async (request, reply) => {
      const validation = adjustStockSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid stock adjustment information.",
          details: validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const result = adjustStock(db, auth, validation.data);

        return {
          message: "Stock adjusted successfully.",
          data: result,
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // UPDATE REORDER LEVEL
  // PATCH /api/inventory/:productId/reorder-level
  // ==========================================

  server.patch(
    "/api/inventory/:productId/reorder-level",
    canManageInventory,
    async (request, reply) => {
      const params = inventoryProductParamsSchema.safeParse(request.params);

      const validation = updateReorderLevelSchema.safeParse(request.body);

      if (!params.success || !validation.success) {
        return reply.code(400).send({
          error: "Invalid reorder level information.",
          details: validation.success ? undefined : validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const result = updateReorderLevel(
          db,
          auth,
          validation.data.branchId,
          params.data.productId,
          validation.data.reorderLevel,
        );

        return {
          message: "Reorder level updated successfully.",
          data: result,
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // LIST STOCK TRANSFERS
  // GET /api/inventory/transfers
  // ==========================================

  server.get(
    "/api/inventory/transfers",
    canViewInventory,
    async (request, reply) => {
      const validation = transferListSchema.safeParse(request.query);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid stock transfer search parameters.",
          details: validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        return listStockTransfers(db, auth, validation.data);
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // CREATE STOCK TRANSFER
  // POST /api/inventory/transfers
  // ==========================================

  server.post(
    "/api/inventory/transfers",
    canManageInventory,
    async (request, reply) => {
      const validation = createStockTransferSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid stock transfer information.",
          details: validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const result = createStockTransfer(db, auth, validation.data);

        return reply.code(201).send({
          message: "Stock transfer created successfully.",
          data: result,
        });
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // GET STOCK TRANSFER DETAILS
  // GET /api/inventory/transfers/:transferId
  // ==========================================

  server.get(
    "/api/inventory/transfers/:transferId",
    canViewInventory,
    async (request, reply) => {
      const validation = stockTransferParamsSchema.safeParse(request.params);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid stock transfer ID.",
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const transfer = getStockTransfer(db, auth, validation.data.transferId);

        if (!transfer) {
          return reply.code(404).send({
            error: "Stock transfer not found.",
          });
        }

        return {
          data: transfer,
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // DISPATCH STOCK TRANSFER
  // POST /api/inventory/transfers/:transferId/dispatch
  // ==========================================

  server.post(
    "/api/inventory/transfers/:transferId/dispatch",
    canManageInventory,
    async (request, reply) => {
      const validation = stockTransferParamsSchema.safeParse(request.params);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid stock transfer ID.",
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const result = dispatchStockTransfer(
          db,
          auth,
          validation.data.transferId,
        );

        return {
          message: "Stock transfer dispatched successfully.",
          data: result,
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // RECEIVE STOCK TRANSFER
  // POST /api/inventory/transfers/:transferId/receive
  // ==========================================

  server.post(
    "/api/inventory/transfers/:transferId/receive",
    canManageInventory,
    async (request, reply) => {
      const params = stockTransferParamsSchema.safeParse(request.params);

      const validation = receiveStockTransferSchema.safeParse(request.body);

      if (!params.success || !validation.success) {
        return reply.code(400).send({
          error: "Invalid stock transfer receipt information.",
          details: validation.success ? undefined : validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const result = receiveStockTransfer(
          db,
          auth,
          params.data.transferId,
          validation.data,
        );

        return {
          message: "Stock transfer receipt recorded successfully.",
          data: result,
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );

  // ==========================================
  // CANCEL DRAFT STOCK TRANSFER
  // POST /api/inventory/transfers/:transferId/cancel
  // ==========================================

  server.post(
    "/api/inventory/transfers/:transferId/cancel",
    canManageInventory,
    async (request, reply) => {
      const params = stockTransferParamsSchema.safeParse(request.params);

      const validation = cancelStockTransferSchema.safeParse(request.body);

      if (!params.success || !validation.success) {
        return reply.code(400).send({
          error: "Invalid stock transfer cancellation information.",
          details: validation.success ? undefined : validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const result = cancelStockTransfer(
          db,
          auth,
          params.data.transferId,
          validation.data.notes,
        );

        return {
          message: "Stock transfer cancelled successfully.",
          data: result,
        };
      } catch (error) {
        return handleInventoryError(error, reply);
      }
    },
  );
}
