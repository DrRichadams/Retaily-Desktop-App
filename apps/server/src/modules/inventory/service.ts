import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import type { AuthContext } from "../../middleware/authenticate.js";

import { getAccessibleBranches, requireBranchAccess } from "./access.js";

import type {
  AdjustStockInput,
  CreateStockTransferInput,
  InventoryListQuery,
  ReceiveStockInput,
  ReceiveStockTransferInput,
  StockMovementResponse,
} from "./types.js";

// ==========================================
// SHARED HELPERS
// ==========================================

function now() {
  return new Date().toISOString();
}

function placeholders(values: string[]) {
  return values.map(() => "?").join(", ");
}

function writeAuditLog(
  db: Database.Database,
  auth: AuthContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
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
      metadata_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    randomUUID(),
    auth.businessId,
    auth.employeeId,
    action,
    entityType,
    entityId,
    JSON.stringify(metadata),
    now(),
  );
}

function getProductForStock(
  db: Database.Database,
  businessId: string,
  productId: string,
) {
  const product = db
    .prepare(
      `
      SELECT
        id,
        business_id,
        name,
        sku,
        track_stock,
        is_active
      FROM products
      WHERE id = ?
        AND business_id = ?
      `,
    )
    .get(productId, businessId) as
    | {
        id: string;
        business_id: string;
        name: string;
        sku: string;
        track_stock: number;
        is_active: number;
      }
    | undefined;

  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  if (product.track_stock !== 1) {
    throw new Error("PRODUCT_STOCK_TRACKING_DISABLED");
  }

  return product;
}

function ensureInventoryRecord(
  db: Database.Database,
  branchId: string,
  productId: string,
) {
  db.prepare(
    `
    INSERT OR IGNORE INTO branch_inventory (
      id,
      branch_id,
      product_id,
      quantity_on_hand,
      reorder_level,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 0, 0, ?, ?)
    `,
  ).run(randomUUID(), branchId, productId, now(), now());

  const inventory = db
    .prepare(
      `
      SELECT id, quantity_on_hand, reorder_level
      FROM branch_inventory
      WHERE branch_id = ?
        AND product_id = ?
      `,
    )
    .get(branchId, productId) as
    | {
        id: string;
        quantity_on_hand: number;
        reorder_level: number;
      }
    | undefined;

  if (!inventory) {
    throw new Error("INVENTORY_RECORD_NOT_FOUND");
  }

  return inventory;
}

/**
 * Applies one stock movement.
 *
 * This function must be called inside a database
 * transaction.
 */
export function applyStockMovement(
  db: Database.Database,
  auth: AuthContext,
  input: {
    branchId: string;
    productId: string;
    movementType:
      | "opening"
      | "purchase"
      | "sale"
      | "sale_void"
      | "customer_return"
      | "supplier_return"
      | "adjustment"
      | "transfer_in"
      | "transfer_out";
    quantityDelta: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
  },
) {
  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    throw new Error("INVALID_STOCK_MOVEMENT");
  }

  const inventory = ensureInventoryRecord(db, input.branchId, input.productId);

  const quantityBefore = inventory.quantity_on_hand;
  const quantityAfter = quantityBefore + input.quantityDelta;

  if (quantityAfter < -0.0000001) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  const safeQuantityAfter =
    Math.abs(quantityAfter) < 0.0000001 ? 0 : quantityAfter;

  const update = db
    .prepare(
      `
      UPDATE branch_inventory
      SET
        quantity_on_hand = ?,
        updated_at = ?
      WHERE id = ?
        AND quantity_on_hand = ?
      `,
    )
    .run(safeQuantityAfter, now(), inventory.id, quantityBefore);

  if (update.changes !== 1) {
    throw new Error("INVENTORY_UPDATE_CONFLICT");
  }

  const movementId = randomUUID();

  db.prepare(
    `
    INSERT INTO stock_movements (
      id,
      branch_id,
      product_id,
      movement_type,
      quantity_delta,
      reference_type,
      reference_id,
      notes,
      created_by_employee_id,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    movementId,
    input.branchId,
    input.productId,
    input.movementType,
    input.quantityDelta,
    input.referenceType ?? null,
    input.referenceId ?? null,
    input.notes ?? null,
    auth.employeeId,
    now(),
  );

  return {
    movementId,
    quantityBefore,
    quantityAfter: safeQuantityAfter,
  };
}

function getStockStatus(
  quantity: number,
  reorderLevel: number,
): "in_stock" | "low_stock" | "out_of_stock" {
  if (quantity <= 0) {
    return "out_of_stock";
  }

  if (reorderLevel > 0 && quantity <= reorderLevel) {
    return "low_stock";
  }

  return "in_stock";
}

function getAccessibleBranchIds(
  db: Database.Database,
  auth: AuthContext,
  requestedBranchId?: string,
) {
  if (requestedBranchId) {
    requireBranchAccess(db, auth, requestedBranchId);
    return [requestedBranchId];
  }

  return getAccessibleBranches(db, auth).map((branch) => branch.id);
}

function assertProductBranchAccess(
  db: Database.Database,
  auth: AuthContext,
  branchId: string,
  productId: string,
) {
  requireBranchAccess(db, auth, branchId);
  return getProductForStock(db, auth.businessId, productId);
}

// ==========================================
// INVENTORY LIST
// ==========================================

export function listInventory(
  db: Database.Database,
  auth: AuthContext,
  query: InventoryListQuery,
) {
  const branchIds = getAccessibleBranchIds(db, auth, query.branchId);

  if (branchIds.length === 0) {
    return {
      data: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const conditions = [
    "p.business_id = ?",
    "p.track_stock = 1",
    "b.id IN (" + placeholders(branchIds) + ")",
  ];

  const parameters: Array<string | number> = [auth.businessId, ...branchIds];

  if (query.categoryId) {
    conditions.push("p.category_id = ?");
    parameters.push(query.categoryId);
  }

  if (query.search) {
    conditions.push(`
      (
        p.name LIKE ?
        OR p.sku LIKE ?
        OR EXISTS (
          SELECT 1
          FROM product_barcodes pb
          WHERE pb.product_id = p.id
            AND pb.business_id = p.business_id
            AND pb.barcode LIKE ?
        )
      )
    `);

    const search = `%${query.search}%`;
    parameters.push(search, search, search);
  }

  if (query.stockStatus === "in_stock") {
    conditions.push(
      "COALESCE(bi.quantity_on_hand, 0) > COALESCE(bi.reorder_level, 0)",
    );
  }

  if (query.stockStatus === "low_stock") {
    conditions.push(`
      COALESCE(bi.quantity_on_hand, 0) > 0
      AND COALESCE(bi.reorder_level, 0) > 0
      AND bi.quantity_on_hand <= bi.reorder_level
    `);
  }

  if (query.stockStatus === "out_of_stock") {
    conditions.push("COALESCE(bi.quantity_on_hand, 0) <= 0");
  }

  const where = conditions.join(" AND ");

  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM products p
      CROSS JOIN branches b
      LEFT JOIN branch_inventory bi
        ON bi.product_id = p.id
        AND bi.branch_id = b.id
      WHERE ${where}
      `,
    )
    .get(...parameters) as { count: number };

  const offset = (query.page - 1) * query.limit;

  const records = db
    .prepare(
      `
      SELECT
        bi.id AS inventory_id,
        b.id AS branch_id,
        b.name AS branch_name,

        p.id AS product_id,
        p.name AS product_name,
        p.sku,
        p.category_id,
        pc.name AS category_name,
        p.unit,
        p.cost_price_minor,
        p.selling_price_minor,

        COALESCE(bi.quantity_on_hand, 0) AS quantity_on_hand,
        COALESCE(bi.reorder_level, 0) AS reorder_level,

        (
          SELECT pb.barcode
          FROM product_barcodes pb
          WHERE pb.product_id = p.id
          ORDER BY pb.is_primary DESC, pb.created_at ASC
          LIMIT 1
        ) AS barcode

      FROM products p

      CROSS JOIN branches b

      LEFT JOIN branch_inventory bi
        ON bi.product_id = p.id
        AND bi.branch_id = b.id

      LEFT JOIN product_categories pc
        ON pc.id = p.category_id
        AND pc.business_id = p.business_id

      WHERE ${where}

      ORDER BY b.name COLLATE NOCASE ASC,
        p.name COLLATE NOCASE ASC

      LIMIT ? OFFSET ?
      `,
    )
    .all(...parameters, query.limit, offset) as Array<{
    inventory_id: string | null;
    branch_id: string;
    branch_name: string;
    product_id: string;
    product_name: string;
    sku: string;
    category_id: string | null;
    category_name: string | null;
    unit: string;
    cost_price_minor: number;
    selling_price_minor: number;
    quantity_on_hand: number;
    reorder_level: number;
    barcode: string | null;
  }>;

  return {
    data: records.map((record) => ({
      id: record.inventory_id,
      branchId: record.branch_id,
      branchName: record.branch_name,
      productId: record.product_id,
      productName: record.product_name,
      sku: record.sku,
      barcode: record.barcode,
      categoryId: record.category_id,
      categoryName: record.category_name,
      unit: record.unit,
      costPriceMinor: record.cost_price_minor,
      sellingPriceMinor: record.selling_price_minor,
      quantityOnHand: record.quantity_on_hand,
      reorderLevel: record.reorder_level,
      stockStatus: getStockStatus(
        record.quantity_on_hand,
        record.reorder_level,
      ),
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: total.count,
      totalPages: Math.ceil(total.count / query.limit),
    },
  };
}

// ==========================================
// PRODUCT INVENTORY DETAILS
// ==========================================

export function getProductInventory(
  db: Database.Database,
  auth: AuthContext,
  productId: string,
) {
  const product = getProductForStock(db, auth.businessId, productId);

  const branches = getAccessibleBranches(db, auth);

  if (branches.length === 0) {
    return {
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      branches: [],
    };
  }

  const branchIds = branches.map((branch) => branch.id);

  const records = db
    .prepare(
      `
      SELECT
        b.id AS branch_id,
        b.name AS branch_name,
        b.code AS branch_code,
        COALESCE(bi.quantity_on_hand, 0) AS quantity_on_hand,
        COALESCE(bi.reorder_level, 0) AS reorder_level

      FROM branches b

      LEFT JOIN branch_inventory bi
        ON bi.branch_id = b.id
        AND bi.product_id = ?

      WHERE b.business_id = ?
        AND b.id IN (${placeholders(branchIds)})

      ORDER BY b.name COLLATE NOCASE ASC
      `,
    )
    .all(productId, auth.businessId, ...branchIds) as Array<{
    branch_id: string;
    branch_name: string;
    branch_code: string;
    quantity_on_hand: number;
    reorder_level: number;
  }>;

  return {
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    branches: records.map((record) => ({
      branchId: record.branch_id,
      branchName: record.branch_name,
      branchCode: record.branch_code,
      quantityOnHand: record.quantity_on_hand,
      reorderLevel: record.reorder_level,
      stockStatus: getStockStatus(
        record.quantity_on_hand,
        record.reorder_level,
      ),
    })),
  };
}

// ==========================================
// INVENTORY STATISTICS
// ==========================================

export function getInventoryStats(
  db: Database.Database,
  auth: AuthContext,
  branchId?: string,
) {
  const branchIds = getAccessibleBranchIds(db, auth, branchId);

  if (branchIds.length === 0) {
    return {
      totalProducts: 0,
      productsInStock: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      totalUnits: 0,
    };
  }

  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) AS totalProducts,

        SUM(
          CASE WHEN COALESCE(bi.quantity_on_hand, 0) > 0
            THEN 1 ELSE 0 END
        ) AS productsInStock,

        SUM(
          CASE
            WHEN COALESCE(bi.quantity_on_hand, 0) > 0
              AND COALESCE(bi.reorder_level, 0) > 0
              AND bi.quantity_on_hand <= bi.reorder_level
            THEN 1 ELSE 0
          END
        ) AS lowStockProducts,

        SUM(
          CASE WHEN COALESCE(bi.quantity_on_hand, 0) <= 0
            THEN 1 ELSE 0 END
        ) AS outOfStockProducts,

        COALESCE(SUM(COALESCE(bi.quantity_on_hand, 0)), 0)
          AS totalUnits

      FROM products p

      CROSS JOIN branches b

      LEFT JOIN branch_inventory bi
        ON bi.product_id = p.id
        AND bi.branch_id = b.id

      WHERE p.business_id = ?
        AND p.track_stock = 1
        AND b.id IN (${placeholders(branchIds)})
      `,
    )
    .get(auth.businessId, ...branchIds) as {
    totalProducts: number;
    productsInStock: number | null;
    lowStockProducts: number | null;
    outOfStockProducts: number | null;
    totalUnits: number;
  };

  return {
    totalProducts: stats.totalProducts,
    productsInStock: stats.productsInStock ?? 0,
    lowStockProducts: stats.lowStockProducts ?? 0,
    outOfStockProducts: stats.outOfStockProducts ?? 0,
    totalUnits: stats.totalUnits,
  };
}

// ==========================================
// RECEIVE STOCK
// ==========================================

export function receiveStock(
  db: Database.Database,
  auth: AuthContext,
  input: ReceiveStockInput,
) {
  assertProductBranchAccess(db, auth, input.branchId, input.productId);

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("INVALID_STOCK_QUANTITY");
  }

  const transaction = db.transaction(() => {
    const movement = applyStockMovement(db, auth, {
      branchId: input.branchId,
      productId: input.productId,
      movementType: "purchase",
      quantityDelta: input.quantity,
      referenceType: "manual_receipt",
      referenceId: input.reference,
      notes: input.notes,
    });

    writeAuditLog(
      db,
      auth,
      "inventory.stock_received",
      "stock_movement",
      movement.movementId,
      {
        branchId: input.branchId,
        productId: input.productId,
        quantity: input.quantity,
        reference: input.reference ?? null,
        unitCostMinor: input.unitCostMinor ?? null,
      },
    );

    return {
      movementId: movement.movementId,
      branchId: input.branchId,
      productId: input.productId,
      quantityReceived: input.quantity,
      quantityBefore: movement.quantityBefore,
      quantityAfter: movement.quantityAfter,
    };
  });

  return transaction.immediate();
}

// ==========================================
// STOCK ADJUSTMENTS
// ==========================================

export function adjustStock(
  db: Database.Database,
  auth: AuthContext,
  input: AdjustStockInput,
) {
  assertProductBranchAccess(db, auth, input.branchId, input.productId);

  if (!Number.isFinite(input.quantityDelta) || input.quantityDelta === 0) {
    throw new Error("INVALID_STOCK_ADJUSTMENT");
  }

  const transaction = db.transaction(() => {
    const movement = applyStockMovement(db, auth, {
      branchId: input.branchId,
      productId: input.productId,
      movementType: "adjustment",
      quantityDelta: input.quantityDelta,
      referenceType: "stock_adjustment",
      referenceId: randomUUID(),
      notes: `${input.reason}: ${input.notes}`,
    });

    writeAuditLog(
      db,
      auth,
      "inventory.stock_adjusted",
      "stock_movement",
      movement.movementId,
      {
        branchId: input.branchId,
        productId: input.productId,
        quantityDelta: input.quantityDelta,
        reason: input.reason,
        notes: input.notes,
      },
    );

    return {
      movementId: movement.movementId,
      branchId: input.branchId,
      productId: input.productId,
      quantityDelta: input.quantityDelta,
      quantityBefore: movement.quantityBefore,
      quantityAfter: movement.quantityAfter,
      reason: input.reason,
    };
  });

  return transaction.immediate();
}

// ==========================================
// UPDATE REORDER LEVEL
// ==========================================

export function updateReorderLevel(
  db: Database.Database,
  auth: AuthContext,
  branchId: string,
  productId: string,
  reorderLevel: number,
) {
  assertProductBranchAccess(db, auth, branchId, productId);

  if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
    throw new Error("INVALID_REORDER_LEVEL");
  }

  const transaction = db.transaction(() => {
    const inventory = ensureInventoryRecord(db, branchId, productId);

    db.prepare(
      `
      UPDATE branch_inventory
      SET reorder_level = ?, updated_at = ?
      WHERE id = ?
      `,
    ).run(reorderLevel, now(), inventory.id);

    writeAuditLog(
      db,
      auth,
      "inventory.reorder_level_updated",
      "branch_inventory",
      inventory.id,
      {
        branchId,
        productId,
        previousReorderLevel: inventory.reorder_level,
        newReorderLevel: reorderLevel,
      },
    );

    return {
      branchId,
      productId,
      reorderLevel,
    };
  });

  return transaction.immediate();
}

// ==========================================
// STOCK MOVEMENT HISTORY
// ==========================================

export function listStockMovements(
  db: Database.Database,
  auth: AuthContext,
  query: {
    page: number;
    limit: number;
    branchId?: string;
    productId?: string;
    movementType?: string;
    startDate?: string;
    endDate?: string;
  },
) {
  const branchIds = getAccessibleBranchIds(db, auth, query.branchId);

  if (branchIds.length === 0) {
    return {
      data: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const conditions = [
    "business_id = ?",
    "branch_id IN (" + placeholders(branchIds) + ")",
  ];

  const parameters: Array<string | number> = [auth.businessId, ...branchIds];

  if (query.productId) {
    conditions.push("product_id = ?");
    parameters.push(query.productId);
  }

  if (query.movementType) {
    conditions.push("movement_type = ?");
    parameters.push(query.movementType);
  }

  if (query.startDate) {
    conditions.push("created_at >= ?");
    parameters.push(query.startDate);
  }

  if (query.endDate) {
    conditions.push("created_at <= ?");
    parameters.push(query.endDate);
  }

  const where = conditions.join(" AND ");

  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM stock_movements sm
      INNER JOIN branches b ON b.id = sm.branch_id
      WHERE b.business_id = ?
        AND sm.branch_id IN (${placeholders(branchIds)})
        ${query.productId ? "AND sm.product_id = ?" : ""}
        ${query.movementType ? "AND sm.movement_type = ?" : ""}
        ${query.startDate ? "AND sm.created_at >= ?" : ""}
        ${query.endDate ? "AND sm.created_at <= ?" : ""}
      `,
    )
    .get(
      auth.businessId,
      ...branchIds,
      ...(query.productId ? [query.productId] : []),
      ...(query.movementType ? [query.movementType] : []),
      ...(query.startDate ? [query.startDate] : []),
      ...(query.endDate ? [query.endDate] : []),
    ) as { count: number };

  const offset = (query.page - 1) * query.limit;

  const records = db
    .prepare(
      `
      WITH movement_history AS (
        SELECT
          sm.id,
          sm.branch_id,
          sm.product_id,
          sm.movement_type,
          sm.quantity_delta,
          sm.reference_type,
          sm.reference_id,
          sm.notes,
          sm.created_by_employee_id,
          sm.created_at,

          b.business_id AS business_id,
          b.name AS branch_name,
          p.name AS product_name,

          COALESCE(bi.quantity_on_hand, 0) AS current_quantity,

          COALESCE(
            SUM(sm.quantity_delta) OVER (
              PARTITION BY sm.branch_id, sm.product_id
              ORDER BY sm.created_at DESC, sm.id DESC
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          ) AS later_delta

        FROM stock_movements sm

        INNER JOIN branches b
          ON b.id = sm.branch_id

        INNER JOIN products p
          ON p.id = sm.product_id

        LEFT JOIN branch_inventory bi
          ON bi.branch_id = sm.branch_id
          AND bi.product_id = sm.product_id

        WHERE b.business_id = ?
      )

      SELECT
        *,
        current_quantity - later_delta AS quantity_after,
        current_quantity - later_delta - quantity_delta
          AS quantity_before

      FROM movement_history

      WHERE ${where}

      ORDER BY created_at DESC, id DESC

      LIMIT ? OFFSET ?
      `,
    )
    .all(
      auth.businessId,
      auth.businessId,
      ...branchIds,
      ...(query.productId ? [query.productId] : []),
      ...(query.movementType ? [query.movementType] : []),
      ...(query.startDate ? [query.startDate] : []),
      ...(query.endDate ? [query.endDate] : []),
      query.limit,
      offset,
    ) as Array<{
    id: string;
    branch_id: string;
    branch_name: string;
    product_id: string;
    product_name: string;
    movement_type: StockMovementResponse["movementType"];
    quantity_delta: number;
    quantity_before: number;
    quantity_after: number;
    reference_type: string | null;
    reference_id: string | null;
    notes: string | null;
    created_by_employee_id: string | null;
    created_at: string;
  }>;

  return {
    data: records.map(
      (record): StockMovementResponse => ({
        id: record.id,
        branchId: record.branch_id,
        branchName: record.branch_name,
        productId: record.product_id,
        productName: record.product_name,
        movementType: record.movement_type,
        quantityDelta: record.quantity_delta,
        quantityBefore: record.quantity_before,
        quantityAfter: record.quantity_after,
        referenceType: record.reference_type,
        referenceId: record.reference_id,
        notes: record.notes,
        createdByEmployeeId: record.created_by_employee_id,
        createdAt: record.created_at,
      }),
    ),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: total.count,
      totalPages: Math.ceil(total.count / query.limit),
    },
  };
}

// ==========================================
// CREATE STOCK TRANSFER
// ==========================================

export function createStockTransfer(
  db: Database.Database,
  auth: AuthContext,
  input: CreateStockTransferInput,
) {
  if (input.sourceBranchId === input.destinationBranchId) {
    throw new Error("TRANSFER_BRANCHES_MUST_DIFFER");
  }

  requireBranchAccess(db, auth, input.sourceBranchId);
  requireBranchAccess(db, auth, input.destinationBranchId);

  if (input.items.length === 0) {
    throw new Error("TRANSFER_REQUIRES_ITEMS");
  }

  const productIds = input.items.map((item) => item.productId);

  if (new Set(productIds).size !== productIds.length) {
    throw new Error("DUPLICATE_TRANSFER_PRODUCT");
  }

  for (const item of input.items) {
    getProductForStock(db, auth.businessId, item.productId);

    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new Error("INVALID_TRANSFER_QUANTITY");
    }
  }

  const transferId = randomUUID();

  const transferNumber = `TR-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 4).toUpperCase()}`;

  const transaction = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO stock_transfers (
        id,
        business_id,
        transfer_number,
        source_branch_id,
        destination_branch_id,
        status,
        notes,
        created_by_employee_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
      `,
    ).run(
      transferId,
      auth.businessId,
      transferNumber,
      input.sourceBranchId,
      input.destinationBranchId,
      input.notes ?? null,
      auth.employeeId,
      now(),
      now(),
    );

    const insertItem = db.prepare(
      `
      INSERT INTO stock_transfer_items (
        id,
        transfer_id,
        product_id,
        quantity_requested,
        quantity_received,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, 0, ?, ?)
      `,
    );

    for (const item of input.items) {
      insertItem.run(
        randomUUID(),
        transferId,
        item.productId,
        item.quantity,
        now(),
        now(),
      );
    }

    writeAuditLog(
      db,
      auth,
      "inventory.transfer_created",
      "stock_transfer",
      transferId,
      {
        transferNumber,
        sourceBranchId: input.sourceBranchId,
        destinationBranchId: input.destinationBranchId,
        itemCount: input.items.length,
      },
    );

    return {
      id: transferId,
      transferNumber,
      status: "draft",
      sourceBranchId: input.sourceBranchId,
      destinationBranchId: input.destinationBranchId,
      itemCount: input.items.length,
    };
  });

  return transaction.immediate();
}

// ==========================================
// GET STOCK TRANSFER
// ==========================================

export function getStockTransfer(
  db: Database.Database,
  auth: AuthContext,
  transferId: string,
) {
  const transfer = db
    .prepare(
      `
      SELECT
        t.*,
        source.name AS source_branch_name,
        destination.name AS destination_branch_name
      FROM stock_transfers t

      INNER JOIN branches source
        ON source.id = t.source_branch_id

      INNER JOIN branches destination
        ON destination.id = t.destination_branch_id

      WHERE t.id = ?
        AND t.business_id = ?
      `,
    )
    .get(transferId, auth.businessId) as
    | {
        id: string;
        business_id: string;
        transfer_number: string;
        source_branch_id: string;
        destination_branch_id: string;
        source_branch_name: string;
        destination_branch_name: string;
        status: string;
        notes: string | null;
        created_at: string;
        updated_at: string;
        dispatched_at: string | null;
        received_at: string | null;
      }
    | undefined;

  if (!transfer) {
    return null;
  }

  const accessibleBranchIds = new Set(
    getAccessibleBranches(db, auth).map((branch) => branch.id),
  );

  const canAccessSource = accessibleBranchIds.has(transfer.source_branch_id);

  const canAccessDestination = accessibleBranchIds.has(
    transfer.destination_branch_id,
  );

  if (!canAccessSource && !canAccessDestination) {
    throw new Error("TRANSFER_ACCESS_DENIED");
  }

  const items = db
    .prepare(
      `
      SELECT
        ti.id,
        ti.product_id,
        p.name AS product_name,
        p.sku,
        p.unit,
        ti.quantity_requested,
        ti.quantity_received,
        ti.created_at,
        ti.updated_at
      FROM stock_transfer_items ti
      INNER JOIN products p
        ON p.id = ti.product_id
      WHERE ti.transfer_id = ?
      ORDER BY p.name COLLATE NOCASE ASC
      `,
    )
    .all(transferId);

  return {
    id: transfer.id,
    transferNumber: transfer.transfer_number,
    sourceBranchId: transfer.source_branch_id,
    sourceBranchName: transfer.source_branch_name,
    destinationBranchId: transfer.destination_branch_id,
    destinationBranchName: transfer.destination_branch_name,
    status: transfer.status,
    notes: transfer.notes,
    createdAt: transfer.created_at,
    updatedAt: transfer.updated_at,
    dispatchedAt: transfer.dispatched_at,
    receivedAt: transfer.received_at,
    items,
  };
}

// ==========================================
// LIST STOCK TRANSFERS
// ==========================================

export function listStockTransfers(
  db: Database.Database,
  auth: AuthContext,
  query: {
    page: number;
    limit: number;
    branchId?: string;
    status?: string;
  },
) {
  const branchIds = getAccessibleBranchIds(db, auth, query.branchId);

  if (branchIds.length === 0) {
    return {
      data: [],
      pagination: {
        page: query.page,
        limit: query.limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const conditions = [
    "t.business_id = ?",
    `(
      t.source_branch_id IN (${placeholders(branchIds)})
      OR t.destination_branch_id IN (${placeholders(branchIds)})
    )`,
  ];

  const parameters: Array<string | number> = [
    auth.businessId,
    ...branchIds,
    ...branchIds,
  ];

  if (query.status) {
    conditions.push("t.status = ?");
    parameters.push(query.status);
  }

  const where = conditions.join(" AND ");

  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM stock_transfers t
      WHERE ${where}
      `,
    )
    .get(...parameters) as { count: number };

  const offset = (query.page - 1) * query.limit;

  const records = db
    .prepare(
      `
      SELECT
        t.id,
        t.transfer_number,
        t.status,
        t.notes,
        t.created_at,
        t.dispatched_at,
        t.received_at,
        source.name AS source_branch_name,
        destination.name AS destination_branch_name,
        COUNT(ti.id) AS item_count

      FROM stock_transfers t

      INNER JOIN branches source
        ON source.id = t.source_branch_id

      INNER JOIN branches destination
        ON destination.id = t.destination_branch_id

      LEFT JOIN stock_transfer_items ti
        ON ti.transfer_id = t.id

      WHERE ${where}

      GROUP BY t.id

      ORDER BY t.created_at DESC

      LIMIT ? OFFSET ?
      `,
    )
    .all(...parameters, query.limit, offset);

  return {
    data: records,
    pagination: {
      page: query.page,
      limit: query.limit,
      total: total.count,
      totalPages: Math.ceil(total.count / query.limit),
    },
  };
}

// ==========================================
// DISPATCH STOCK TRANSFER
// ==========================================

export function dispatchStockTransfer(
  db: Database.Database,
  auth: AuthContext,
  transferId: string,
) {
  const transaction = db.transaction(() => {
    const transfer = db
      .prepare(
        `
        SELECT
          id,
          source_branch_id,
          destination_branch_id,
          status
        FROM stock_transfers
        WHERE id = ?
          AND business_id = ?
        `,
      )
      .get(transferId, auth.businessId) as
      | {
          id: string;
          source_branch_id: string;
          destination_branch_id: string;
          status: string;
        }
      | undefined;

    if (!transfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }

    // Dispatching requires access to the source branch only.
    requireBranchAccess(db, auth, transfer.source_branch_id);

    if (transfer.status !== "draft") {
      throw new Error("TRANSFER_NOT_DRAFT");
    }

    const items = db
      .prepare(
        `
        SELECT product_id, quantity_requested
        FROM stock_transfer_items
        WHERE transfer_id = ?
        `,
      )
      .all(transferId) as Array<{
      product_id: string;
      quantity_requested: number;
    }>;

    if (items.length === 0) {
      throw new Error("TRANSFER_REQUIRES_ITEMS");
    }

    const timestamp = now();

    // Conditional transition prevents a second dispatch.
    const statusUpdate = db
      .prepare(
        `
        UPDATE stock_transfers
        SET
          status = 'in_transit',
          dispatched_by_employee_id = ?,
          dispatched_at = ?,
          updated_at = ?
        WHERE id = ?
          AND business_id = ?
          AND status = 'draft'
        `,
      )
      .run(auth.employeeId, timestamp, timestamp, transferId, auth.businessId);

    if (statusUpdate.changes !== 1) {
      throw new Error("TRANSFER_NOT_DRAFT");
    }

    for (const item of items) {
      applyStockMovement(db, auth, {
        branchId: transfer.source_branch_id,
        productId: item.product_id,
        movementType: "transfer_out",
        quantityDelta: -item.quantity_requested,
        referenceType: "stock_transfer",
        referenceId: transferId,
        notes: `Transfer ${transferId} dispatched`,
      });
    }

    writeAuditLog(
      db,
      auth,
      "inventory.transfer_dispatched",
      "stock_transfer",
      transferId,
      {
        sourceBranchId: transfer.source_branch_id,
        destinationBranchId: transfer.destination_branch_id,
        itemCount: items.length,
      },
    );

    return {
      transferId,
      status: "in_transit",
      dispatchedItems: items.length,
    };
  });

  return transaction.immediate();
}

// ==========================================
// RECEIVE STOCK TRANSFER
// ==========================================

export function receiveStockTransfer(
  db: Database.Database,
  auth: AuthContext,
  transferId: string,
  input: ReceiveStockTransferInput,
) {
  const transaction = db.transaction(() => {
    const transfer = db
      .prepare(
        `
        SELECT
          id,
          source_branch_id,
          destination_branch_id,
          status
        FROM stock_transfers
        WHERE id = ?
          AND business_id = ?
        `,
      )
      .get(transferId, auth.businessId) as
      | {
          id: string;
          source_branch_id: string;
          destination_branch_id: string;
          status: string;
        }
      | undefined;

    if (!transfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }

    // Receiving requires access to the destination branch only.
    requireBranchAccess(db, auth, transfer.destination_branch_id);

    if (
      transfer.status !== "in_transit" &&
      transfer.status !== "partially_received"
    ) {
      throw new Error("TRANSFER_NOT_RECEIVABLE");
    }

    if (input.items.length === 0) {
      throw new Error("TRANSFER_RECEIPT_REQUIRES_ITEMS");
    }

    const getItem = db.prepare(
      `
      SELECT
        id,
        product_id,
        quantity_requested,
        quantity_received
      FROM stock_transfer_items
      WHERE id = ?
        AND transfer_id = ?
      `,
    );

    const updateItem = db.prepare(
      `
      UPDATE stock_transfer_items
      SET
        quantity_received = ?,
        updated_at = ?
      WHERE id = ?
        AND transfer_id = ?
        AND quantity_received = ?
      `,
    );

    let receivedCount = 0;

    const receivedItems: Array<{
      itemId: string;
      productId: string;
      quantityReceived: number;
      totalReceived: number;
    }> = [];

    for (const receipt of input.items) {
      if (
        !Number.isFinite(receipt.quantityReceived) ||
        receipt.quantityReceived <= 0
      ) {
        throw new Error("INVALID_RECEIVED_QUANTITY");
      }

      const item = getItem.get(receipt.itemId, transferId) as
        | {
            id: string;
            product_id: string;
            quantity_requested: number;
            quantity_received: number;
          }
        | undefined;

      if (!item) {
        throw new Error("TRANSFER_ITEM_NOT_FOUND");
      }

      const remaining = item.quantity_requested - item.quantity_received;

      if (receipt.quantityReceived > remaining + 0.0000001) {
        throw new Error("RECEIVED_QUANTITY_EXCEEDS_REMAINING");
      }

      const totalReceived = item.quantity_received + receipt.quantityReceived;

      const itemUpdate = updateItem.run(
        totalReceived,
        now(),
        item.id,
        transferId,
        item.quantity_received,
      );

      if (itemUpdate.changes !== 1) {
        throw new Error("TRANSFER_ITEM_UPDATE_CONFLICT");
      }

      applyStockMovement(db, auth, {
        branchId: transfer.destination_branch_id,
        productId: item.product_id,
        movementType: "transfer_in",
        quantityDelta: receipt.quantityReceived,
        referenceType: "stock_transfer",
        referenceId: transferId,
        notes: input.notes ?? `Transfer ${transferId} received`,
      });

      receivedCount += receipt.quantityReceived;

      receivedItems.push({
        itemId: item.id,
        productId: item.product_id,
        quantityReceived: receipt.quantityReceived,
        totalReceived,
      });
    }

    const outstanding = db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM stock_transfer_items
        WHERE transfer_id = ?
          AND quantity_received < quantity_requested
        `,
      )
      .get(transferId) as { count: number };

    const nextStatus =
      outstanding.count === 0 ? "received" : "partially_received";

    const fullyReceived = nextStatus === "received";
    const timestamp = now();

    const statusUpdate = db
      .prepare(
        `
        UPDATE stock_transfers
        SET
          status = ?,
          received_by_employee_id = ?,
          received_at = ?,
          updated_at = ?
        WHERE id = ?
          AND business_id = ?
          AND status IN ('in_transit', 'partially_received')
        `,
      )
      .run(
        nextStatus,
        auth.employeeId,
        fullyReceived ? timestamp : null,
        timestamp,
        transferId,
        auth.businessId,
      );

    if (statusUpdate.changes !== 1) {
      throw new Error("TRANSFER_NOT_RECEIVABLE");
    }

    writeAuditLog(
      db,
      auth,
      "inventory.transfer_received",
      "stock_transfer",
      transferId,
      {
        destinationBranchId: transfer.destination_branch_id,
        receivedQuantity: receivedCount,
        status: nextStatus,
        items: receivedItems,
        notes: input.notes ?? null,
      },
    );

    return {
      transferId,
      status: nextStatus,
      receivedQuantity: receivedCount,
      items: receivedItems,
    };
  });

  return transaction.immediate();
}

// ==========================================
// CANCEL DRAFT TRANSFER
// ==========================================

export function cancelStockTransfer(
  db: Database.Database,
  auth: AuthContext,
  transferId: string,
  notes: string,
) {
  const transaction = db.transaction(() => {
    const transfer = db
      .prepare(
        `
        SELECT
          id,
          source_branch_id,
          destination_branch_id,
          status
        FROM stock_transfers
        WHERE id = ?
          AND business_id = ?
        `,
      )
      .get(transferId, auth.businessId) as
      | {
          id: string;
          source_branch_id: string;
          destination_branch_id: string;
          status: string;
        }
      | undefined;

    if (!transfer) {
      throw new Error("TRANSFER_NOT_FOUND");
    }

    requireBranchAccess(db, auth, transfer.source_branch_id);

    if (transfer.status !== "draft") {
      throw new Error("ONLY_DRAFT_TRANSFERS_CAN_BE_CANCELLED");
    }

    const timestamp = now();

    const update = db
      .prepare(
        `
        UPDATE stock_transfers
        SET
          status = 'cancelled',
          notes = ?,
          updated_at = ?
        WHERE id = ?
          AND business_id = ?
          AND status = 'draft'
        `,
      )
      .run(notes, timestamp, transferId, auth.businessId);

    if (update.changes !== 1) {
      throw new Error("ONLY_DRAFT_TRANSFERS_CAN_BE_CANCELLED");
    }

    writeAuditLog(
      db,
      auth,
      "inventory.transfer_cancelled",
      "stock_transfer",
      transferId,
      {
        sourceBranchId: transfer.source_branch_id,
        destinationBranchId: transfer.destination_branch_id,
        notes,
      },
    );

    return {
      transferId,
      status: "cancelled",
    };
  });

  return transaction.immediate();
}
