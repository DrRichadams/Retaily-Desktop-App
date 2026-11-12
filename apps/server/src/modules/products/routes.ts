import type { FastifyInstance } from "fastify";
import type Database from "better-sqlite3";

import {
  createAuthenticate,
  requirePermission,
  type AuthenticatedRequest,
} from "../../middleware/authenticate.js";

import {
  productListSchema,
  productIdSchema,
  createProductSchema,
  updateProductSchema,
  productStatusSchema,
  createCategorySchema,
  updateCategorySchema,
  createBarcodeSchema,
} from "./schemas.js";

import {
  getProductStats,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateProductStatus,
  listCategories,
  createCategory,
  updateCategory,
  addProductBarcode,
} from "./service.js";

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error && error.message.includes("UNIQUE constraint failed")
  );
}

function isForeignKeyError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("FOREIGN KEY constraint failed")
  );
}

function handleDatabaseError(
  error: unknown,
  reply: import("fastify").FastifyReply,
) {
  if (isUniqueConstraintError(error)) {
    return reply.code(409).send({
      error: "A record with this SKU, name or barcode already exists.",
    });
  }

  if (isForeignKeyError(error)) {
    return reply.code(409).send({
      error: "This record is being used and cannot be changed or removed.",
    });
  }

  if (error instanceof Error) {
    const knownErrors: Record<string, string> = {
      CATEGORY_NOT_FOUND:
        "The selected category does not exist or is inactive.",
      PARENT_CATEGORY_NOT_FOUND:
        "The selected parent category does not exist or is inactive.",
      CATEGORY_CANNOT_BE_OWN_PARENT: "A category cannot be its own parent.",
    };

    const message = knownErrors[error.message];

    if (message) {
      return reply.code(400).send({ error: message });
    }
  }

  reply.log.error(error);

  return reply.code(500).send({
    error: "An unexpected error occurred while processing this request.",
  });
}

export function registerProductRoutes(
  server: FastifyInstance,
  db: Database.Database,
) {
  const authenticate = createAuthenticate(db);

  const canViewProducts = {
    preHandler: [authenticate, requirePermission("products.view")],
  };

  const canManageProducts = {
    preHandler: [authenticate, requirePermission("products.manage")],
  };

  // ==========================================
  // LIST PRODUCTS
  // GET /api/products
  // ==========================================

  // ==========================================
  // PRODUCT CATALOGUE STATISTICS
  // GET /api/products/stats
  // ==========================================

  server.get("/api/products/stats", canViewProducts, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;

    return {
      data: getProductStats(db, auth.businessId),
    };
  });

  server.get("/api/products", canViewProducts, async (request, reply) => {
    const validation = productListSchema.safeParse(request.query);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Invalid product search parameters.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    return listProducts(db, auth.businessId, validation.data);
  });

  // ==========================================
  // GET PRODUCT
  // GET /api/products/:id
  // ==========================================

  server.get("/api/products/:id", canViewProducts, async (request, reply) => {
    const validation = productIdSchema.safeParse(request.params);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Invalid product ID.",
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    const product = getProduct(db, auth.businessId, validation.data.id);

    if (!product) {
      return reply.code(404).send({
        error: "Product not found.",
      });
    }

    return { data: product };
  });

  // ==========================================
  // CREATE PRODUCT
  // POST /api/products
  // ==========================================

  server.post("/api/products", canManageProducts, async (request, reply) => {
    const validation = createProductSchema.safeParse(request.body);

    if (!validation.success) {
      return reply.code(400).send({
        error: "Please check the product information.",
        details: validation.error.flatten(),
      });
    }

    const auth = (request as AuthenticatedRequest).auth;

    try {
      const product = createProduct(db, auth.businessId, validation.data);

      return reply.code(201).send({
        message: "Product created successfully.",
        data: product,
      });
    } catch (error) {
      return handleDatabaseError(error, reply);
    }
  });

  // ==========================================
  // UPDATE PRODUCT
  // PATCH /api/products/:id
  // ==========================================

  server.patch(
    "/api/products/:id",
    canManageProducts,
    async (request, reply) => {
      const params = productIdSchema.safeParse(request.params);
      const validation = updateProductSchema.safeParse(request.body);

      if (!params.success || !validation.success) {
        return reply.code(400).send({
          error: "Invalid product update information.",
          details: validation.success ? undefined : validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const product = updateProduct(
          db,
          auth.businessId,
          params.data.id,
          validation.data,
        );

        if (!product) {
          return reply.code(404).send({
            error: "Product not found.",
          });
        }

        return {
          message: "Product updated successfully.",
          data: product,
        };
      } catch (error) {
        return handleDatabaseError(error, reply);
      }
    },
  );

  // ==========================================
  // UPDATE PRODUCT STATUS
  // PATCH /api/products/:id/status
  // ==========================================

  server.patch(
    "/api/products/:id/status",
    canManageProducts,
    async (request, reply) => {
      const params = productIdSchema.safeParse(request.params);
      const validation = productStatusSchema.safeParse(request.body);

      if (!params.success || !validation.success) {
        return reply.code(400).send({
          error: "Invalid product status information.",
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      const product = updateProductStatus(
        db,
        auth.businessId,
        params.data.id,
        validation.data.status,
      );

      if (!product) {
        return reply.code(404).send({
          error: "Product not found.",
        });
      }

      return {
        message: "Product status updated successfully.",
        data: product,
      };
    },
  );

  // ==========================================
  // LIST CATEGORIES
  // GET /api/products/categories
  // ==========================================

  server.get("/api/products/categories", canViewProducts, async (request) => {
    const auth = (request as AuthenticatedRequest).auth;

    return {
      data: listCategories(db, auth.businessId),
    };
  });

  // ==========================================
  // CREATE CATEGORY
  // POST /api/products/categories
  // ==========================================

  server.post(
    "/api/products/categories",
    canManageProducts,
    async (request, reply) => {
      const validation = createCategorySchema.safeParse(request.body);

      if (!validation.success) {
        return reply.code(400).send({
          error: "Invalid category information.",
          details: validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const category = createCategory(db, auth.businessId, validation.data);

        return reply.code(201).send({
          message: "Category created successfully.",
          data: category,
        });
      } catch (error) {
        return handleDatabaseError(error, reply);
      }
    },
  );

  // ==========================================
  // UPDATE CATEGORY
  // PATCH /api/products/categories/:id
  // ==========================================

  server.patch(
    "/api/products/categories/:id",
    canManageProducts,
    async (request, reply) => {
      const params = productIdSchema.safeParse(request.params);
      const validation = updateCategorySchema.safeParse(request.body);

      if (!params.success || !validation.success) {
        return reply.code(400).send({
          error: "Invalid category update information.",
          details: validation.success ? undefined : validation.error.flatten(),
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const category = updateCategory(
          db,
          auth.businessId,
          params.data.id,
          validation.data,
        );

        if (!category) {
          return reply.code(404).send({
            error: "Category not found.",
          });
        }

        return {
          message: "Category updated successfully.",
          data: category,
        };
      } catch (error) {
        return handleDatabaseError(error, reply);
      }
    },
  );

  // ==========================================
  // ADD PRODUCT BARCODE
  // POST /api/products/:id/barcodes
  // ==========================================

  server.post(
    "/api/products/:id/barcodes",
    canManageProducts,
    async (request, reply) => {
      const params = productIdSchema.safeParse(request.params);
      const validation = createBarcodeSchema.safeParse(request.body);

      if (!params.success || !validation.success) {
        return reply.code(400).send({
          error: "Invalid barcode information.",
        });
      }

      const auth = (request as AuthenticatedRequest).auth;

      try {
        const barcode = addProductBarcode(
          db,
          auth.businessId,
          params.data.id,
          validation.data.barcode,
          validation.data.isPrimary,
        );

        if (!barcode) {
          return reply.code(404).send({
            error: "Product not found.",
          });
        }

        return reply.code(201).send({
          message: "Barcode added successfully.",
          data: barcode,
        });
      } catch (error) {
        return handleDatabaseError(error, reply);
      }
    },
  );
}
