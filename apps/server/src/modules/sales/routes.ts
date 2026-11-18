import type { FastifyInstance, FastifyReply } from "fastify";
import type Database from "better-sqlite3";

import {
  createAuthenticate,
  type AuthenticatedRequest,
} from "../../middleware/authenticate.js";

import {
  createSaleSchema,
  saleIdSchema,
  salesListQuerySchema,
} from "./schemas.js";

import { createSale, getSale, listSales } from "./service.js";

function handleSalesError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    const knownErrors: Record<string, { statusCode: number; message: string }> =
      {
        SALE_CREATE_FORBIDDEN: {
          statusCode: 403,
          message: "You do not have permission to create sales.",
        },
        SALE_ACCESS_FORBIDDEN: {
          statusCode: 403,
          message: "You do not have permission to view this sale.",
        },
        SALES_ACCESS_FORBIDDEN: {
          statusCode: 403,
          message: "You do not have permission to view sales.",
        },
        SALE_DISCOUNT_FORBIDDEN: {
          statusCode: 403,
          message: "You do not have permission to apply discounts.",
        },
        SALE_DISCOUNT_LIMIT_EXCEEDED: {
          statusCode: 403,
          message: "The discount exceeds your permitted 10% limit.",
        },
        BRANCH_ACCESS_DENIED: {
          statusCode: 403,
          message: "You do not have access to this branch.",
        },
        BRANCH_NOT_FOUND: {
          statusCode: 404,
          message: "The selected branch was not found.",
        },
        PRODUCT_NOT_FOUND: {
          statusCode: 404,
          message: "One or more selected products could not be found.",
        },
        PRODUCT_INACTIVE: {
          statusCode: 409,
          message: "An inactive product cannot be sold.",
        },
        CUSTOMER_NOT_FOUND: {
          statusCode: 404,
          message: "The selected customer could not be found or is inactive.",
        },
        BUSINESS_NOT_FOUND: {
          statusCode: 404,
          message: "Business information could not be found.",
        },
        INVALID_SALE_AMOUNT: {
          statusCode: 400,
          message: "The sale contains an invalid amount.",
        },
        INVALID_FIXED_DISCOUNT: {
          statusCode: 400,
          message: "The fixed discount is invalid.",
        },
        INVALID_PERCENTAGE_DISCOUNT: {
          statusCode: 400,
          message: "The percentage discount is invalid.",
        },
        SALE_TOTAL_MUST_BE_POSITIVE: {
          statusCode: 400,
          message: "The sale total must be greater than zero.",
        },
        INSUFFICIENT_PAYMENT: {
          statusCode: 400,
          message: "The payments do not cover the full sale amount.",
        },
        CHANGE_EXCEEDS_CASH_PAYMENT: {
          statusCode: 400,
          message: "Change cannot exceed the cash payment received.",
        },
        INSUFFICIENT_STOCK: {
          statusCode: 409,
          message: "There is insufficient stock to complete this sale.",
        },
        INVENTORY_UPDATE_CONFLICT: {
          statusCode: 409,
          message: "Stock changed during checkout. Please retry.",
        },
        PRODUCT_STOCK_TRACKING_DISABLED: {
          statusCode: 400,
          message: "Stock tracking is disabled for this product.",
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
        error:
          "A conflicting sale or receipt number was generated. Please retry.",
      });
    }

    if (error.message.includes("FOREIGN KEY constraint failed")) {
      return reply.code(409).send({
        error: "The sale references a record that is no longer available.",
      });
    }
  }

  reply.log.error(error);

  return reply.code(500).send({
    error: "An unexpected error occurred while processing this sale.",
  });
}

export function registerSalesRoutes(
  server: FastifyInstance,
  db: Database.Database,
) {
  const authenticate = createAuthenticate(db);

  const authenticated = {
    preHandler: [authenticate],
  };

  // ==========================================
  // CREATE SALE
  // POST /api/sales
  // ==========================================

  server.post("/api/sales", authenticated, async (request, reply) => {
    const validation = createSaleSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Please check the sale information.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      const sale = createSale(db, auth, validation.data);

      return reply.code(201).send({
        message: "Sale completed successfully.",
        data: sale,
      });
    } catch (error) {
      return handleSalesError(error, reply);
    }
  });

  // ==========================================
  // LIST SALES
  // GET /api/sales
  // ==========================================

  server.get("/api/sales", authenticated, async (request, reply) => {
    const validation = salesListQuerySchema.safeParse(request.query);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Invalid sales search parameters.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      return listSales(db, auth, validation.data);
    } catch (error) {
      return handleSalesError(error, reply);
    }
  });

  // ==========================================
  // GET SALE
  // GET /api/sales/:id
  // ==========================================

  server.get("/api/sales/:id", authenticated, async (request, reply) => {
    const validation = saleIdSchema.safeParse(request.params);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Invalid sale ID.",
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      const sale = getSale(db, auth, validation.data.id);

      if (!sale) {
        return reply.code(404).send({
          error: "Sale not found.",
        });
      }

      return {
        data: sale,
      };
    } catch (error) {
      return handleSalesError(error, reply);
    }
  });
}
