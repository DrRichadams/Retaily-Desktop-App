import type { FastifyInstance, FastifyReply } from "fastify";
import type Database from "better-sqlite3";

import {
  createAuthenticate,
  type AuthenticatedRequest,
} from "../../middleware/authenticate.js";

import {
  checkoutAttemptQuerySchema,
  createSaleSchema,
  idempotencyKeySchema,
  saleIdSchema,
  salesListQuerySchema,
} from "./schemas.js";

import {
  createSaleWithIdempotency,
  getCheckoutAttempt,
  getSale,
  listPendingCheckoutAttempts,
  saveCheckoutAttempt,
  listSales,
} from "./service.js";

function handleSalesError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    const knownErrors: Record<string, { statusCode: number; code: string; message: string }> =
      {
        SALE_CREATE_FORBIDDEN: {
          statusCode: 403,
          code: "SALE_CREATE_FORBIDDEN",
          message: "You do not have permission to create sales.",
        },
        SALE_IDEMPOTENCY_CONFLICT: {
          statusCode: 409,
          code: "SALE_IDEMPOTENCY_CONFLICT",
          message:
            "This Idempotency-Key was already used for a different sale request or employee.",
        },
        SALE_IDEMPOTENCY_RECORD_INVALID: {
          statusCode: 409,
          code: "SALE_IDEMPOTENCY_RECORD_INVALID",
          message:
            "The sale associated with this Idempotency-Key is unavailable.",
        },
        CHECKOUT_ATTEMPT_CONFLICT: {
          statusCode: 409,
          code: "CHECKOUT_ATTEMPT_CONFLICT",
          message: "This checkout attempt cannot be used with that request.",
        },
        CHECKOUT_ATTEMPT_RECORD_INVALID: {
          statusCode: 409,
          code: "CHECKOUT_ATTEMPT_RECORD_INVALID",
          message: "The saved checkout attempt is unavailable.",
        },
        CHECKOUT_ATTEMPT_UPDATE_FAILED: {
          statusCode: 409,
          code: "CHECKOUT_ATTEMPT_UPDATE_FAILED",
          message: "The checkout attempt could not be completed. Please retry.",
        },
        SALE_ACCESS_FORBIDDEN: {
          statusCode: 403,
          code: "SALE_ACCESS_FORBIDDEN",
          message: "You do not have permission to view this sale.",
        },
        SALES_ACCESS_FORBIDDEN: {
          statusCode: 403,
          code: "SALES_ACCESS_FORBIDDEN",
          message: "You do not have permission to view sales.",
        },
        SALE_DISCOUNT_FORBIDDEN: {
          statusCode: 403,
          code: "SALE_DISCOUNT_FORBIDDEN",
          message: "You do not have permission to apply discounts.",
        },
        SALE_DISCOUNT_LIMIT_EXCEEDED: {
          statusCode: 403,
          code: "SALE_DISCOUNT_LIMIT_EXCEEDED",
          message: "The discount exceeds your permitted 10% limit.",
        },
        BRANCH_ACCESS_DENIED: {
          statusCode: 403,
          code: "BRANCH_ACCESS_DENIED",
          message: "You do not have access to this branch.",
        },
        BRANCH_NOT_FOUND: {
          statusCode: 404,
          code: "BRANCH_NOT_FOUND",
          message: "The selected branch was not found.",
        },
        PRODUCT_NOT_FOUND: {
          statusCode: 404,
          code: "PRODUCT_NOT_FOUND",
          message: "One or more selected products could not be found.",
        },
        PRODUCT_INACTIVE: {
          statusCode: 409,
          code: "PRODUCT_INACTIVE",
          message: "An inactive product cannot be sold.",
        },
        CUSTOMER_NOT_FOUND: {
          statusCode: 404,
          code: "CUSTOMER_NOT_FOUND",
          message: "The selected customer could not be found or is inactive.",
        },
        BUSINESS_NOT_FOUND: {
          statusCode: 404,
          code: "BUSINESS_NOT_FOUND",
          message: "Business information could not be found.",
        },
        INVALID_SALE_AMOUNT: {
          statusCode: 400,
          code: "INVALID_SALE_AMOUNT",
          message: "The sale contains an invalid amount.",
        },
        INVALID_FIXED_DISCOUNT: {
          statusCode: 400,
          code: "INVALID_FIXED_DISCOUNT",
          message: "The fixed discount is invalid.",
        },
        INVALID_PERCENTAGE_DISCOUNT: {
          statusCode: 400,
          code: "INVALID_PERCENTAGE_DISCOUNT",
          message: "The percentage discount is invalid.",
        },
        SALE_TOTAL_MUST_BE_POSITIVE: {
          statusCode: 400,
          code: "SALE_TOTAL_MUST_BE_POSITIVE",
          message: "The sale total must be greater than zero.",
        },
        INSUFFICIENT_PAYMENT: {
          statusCode: 400,
          code: "INSUFFICIENT_PAYMENT",
          message: "The payments do not cover the full sale amount.",
        },
        CHANGE_EXCEEDS_CASH_PAYMENT: {
          statusCode: 400,
          code: "CHANGE_EXCEEDS_CASH_PAYMENT",
          message: "Change cannot exceed the cash payment received.",
        },
        INSUFFICIENT_STOCK: {
          statusCode: 409,
          code: "INSUFFICIENT_STOCK",
          message: "There is insufficient stock to complete this sale.",
        },
        INVENTORY_UPDATE_CONFLICT: {
          statusCode: 409,
          code: "INVENTORY_UPDATE_CONFLICT",
          message: "Stock changed during checkout. Please retry.",
        },
        PRODUCT_STOCK_TRACKING_DISABLED: {
          statusCode: 400,
          code: "PRODUCT_STOCK_TRACKING_DISABLED",
          message: "Stock tracking is disabled for this product.",
        },
      };

    const known = knownErrors[error.message];

    if (known) {
      return reply.code(known.statusCode).send({
        code: known.code,
        error: known.message,
      });
    }

    if (error.message.includes("UNIQUE constraint failed")) {
      if (
        error.message.includes("sales.business_id") &&
        error.message.includes("sales.idempotency_key")
      ) {
        return reply.code(409).send({
          code: "SALE_IDEMPOTENCY_CONFLICT",
          error:
            "This Idempotency-Key was already used for a different sale request or employee.",
        });
      }

      return reply.code(409).send({
        code: "SALE_NUMBER_CONFLICT",
        error:
          "A conflicting sale or receipt number was generated. Please retry.",
      });
    }

    if (error.message.includes("FOREIGN KEY constraint failed")) {
      return reply.code(409).send({
        code: "SALE_REFERENCE_UNAVAILABLE",
        error: "The sale references a record that is no longer available.",
      });
    }
  }

  reply.log.error(error);

  return reply.code(500).send({
    code: "INTERNAL_ERROR",
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
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers["idempotency-key"],
    );

    if (!idempotencyKey.success) {
      return reply.code(400).send({
        code: "INVALID_IDEMPOTENCY_KEY",
        error:
          "Invalid Idempotency-Key header. Use 1-128 printable ASCII characters.",
      });
    }

    const validation = createSaleSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        error: "Please check the sale information.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      const result = createSaleWithIdempotency(
        db,
        auth,
        validation.data,
        idempotencyKey.data,
      );

      return reply
        .code(result.replayed ? 200 : 201)
        .send({
          message: result.replayed
            ? "Sale was already completed."
            : "Sale completed successfully.",
          data: result.sale,
        });
    } catch (error) {
      return handleSalesError(error, reply);
    }
  });

  // Save and recover an employee-owned checkout attempt. The request payload
  // is validated and normalized by the same schema used by POST /api/sales.
  server.post("/api/sales/checkout-attempts", authenticated, async (request, reply) => {
    const idempotencyKey = idempotencyKeySchema.safeParse(
      request.headers["idempotency-key"],
    );
    if (!idempotencyKey.success || !idempotencyKey.data) {
      return reply.code(400).send({
        code: "INVALID_IDEMPOTENCY_KEY",
        error: "Invalid Idempotency-Key header. Use 1-128 printable ASCII characters.",
      });
    }

    const validation = createSaleSchema.safeParse(request.body);
    if (!validation.success) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        error: "Please check the sale information.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;
    try {
      return {
        data: saveCheckoutAttempt(db, auth, idempotencyKey.data, validation.data),
      };
    } catch (error) {
      return handleSalesError(error, reply);
    }
  });

  server.get("/api/sales/checkout-attempts", authenticated, async (request, reply) => {
    const auth = (request as AuthenticatedRequest).auth;
    try {
      return { data: listPendingCheckoutAttempts(db, auth) };
    } catch (error) {
      return handleSalesError(error, reply);
    }
  });

  server.get("/api/sales/checkout-attempts/by-key", authenticated, async (request, reply) => {
    const validation = checkoutAttemptQuerySchema.safeParse(request.query);
    if (!validation.success) {
      return reply.code(400).send({
        code: "VALIDATION_ERROR",
        error: "Invalid checkout attempt key.",
      });
    }

    const auth = (request as AuthenticatedRequest).auth;
    try {
      const attempt = getCheckoutAttempt(db, auth, validation.data.idempotencyKey);
      if (!attempt) {
        return reply.code(404).send({
          code: "CHECKOUT_ATTEMPT_NOT_FOUND",
          error: "Checkout attempt not found.",
        });
      }
      return { data: attempt };
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
        code: "VALIDATION_ERROR",
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
        code: "VALIDATION_ERROR",
        error: "Invalid sale ID.",
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      const sale = getSale(db, auth, validation.data.id);

      if (!sale) {
        return reply.code(404).send({
          code: "SALE_NOT_FOUND",
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
