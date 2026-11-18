import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import type { AuthContext } from "../../middleware/authenticate.js";
import { requireBranchAccess } from "../inventory/access.js";
import { applyStockMovement } from "../inventory/service.js";

import type {
  CreateSaleInput,
  DiscountType,
  PaymentMethod,
  SaleResponse,
} from "./types.js";
import type { SalesListQuery } from "./types.js";

// Limited discount permission: maximum 10% of the original sale value.
const MAX_LIMITED_DISCOUNT_BPS = 1000;

function now() {
  return new Date().toISOString();
}

function hasPermission(auth: AuthContext, permission: string) {
  return (
    auth.permissions.includes("*") || auth.permissions.includes(permission)
  );
}

function assertCanDiscount(
  auth: AuthContext,
  totalDiscountMinor: number,
  originalSubtotalMinor: number,
) {
  if (totalDiscountMinor <= 0) return;

  if (hasPermission(auth, "sales.discount_full")) return;

  if (!hasPermission(auth, "sales.discount_limited")) {
    throw new Error("SALE_DISCOUNT_FORBIDDEN");
  }

  const maximumDiscount = Math.floor(
    (originalSubtotalMinor * MAX_LIMITED_DISCOUNT_BPS) / 10000,
  );

  if (totalDiscountMinor > maximumDiscount) {
    throw new Error("SALE_DISCOUNT_LIMIT_EXCEEDED");
  }
}

function calculateDiscount(
  subtotalMinor: number,
  discount: {
    type: DiscountType;
    value?: number;
  },
) {
  if (discount.type === "none") {
    return 0;
  }

  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) {
    throw new Error("INVALID_SALE_AMOUNT");
  }

  if (discount.type === "fixed") {
    const value = discount.value ?? 0;

    if (!Number.isSafeInteger(value) || value < 0 || value > subtotalMinor) {
      throw new Error("INVALID_FIXED_DISCOUNT");
    }

    return value;
  }

  const percentageBps = discount.value ?? 0;

  if (
    !Number.isSafeInteger(percentageBps) ||
    percentageBps < 0 ||
    percentageBps > 10000
  ) {
    throw new Error("INVALID_PERCENTAGE_DISCOUNT");
  }

  return Math.min(
    subtotalMinor,
    Math.round((subtotalMinor * percentageBps) / 10000),
  );
}

function generateSaleNumber(prefix: string) {
  const date = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);

  const suffix = randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();

  return `${prefix}-${date}-${suffix}`;
}

function writeAuditLog(
  db: Database.Database,
  auth: AuthContext,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
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

interface ProductForSale {
  id: string;
  name: string;
  sku: string;
  unit: string;
  cost_price_minor: number;
  selling_price_minor: number;
  track_stock: number;
  is_active: number;
}

function getProductForSale(
  db: Database.Database,
  businessId: string,
  productId: string,
): ProductForSale {
  const product = db
    .prepare(
      `
    SELECT
      id,
      name,
      sku,
      unit,
      cost_price_minor,
      selling_price_minor,
      track_stock,
      is_active
    FROM products
    WHERE id = ?
      AND business_id = ?
  `,
    )
    .get(productId, businessId) as ProductForSale | undefined;

  if (!product) {
    throw new Error("PRODUCT_NOT_FOUND");
  }

  if (product.is_active !== 1) {
    throw new Error("PRODUCT_INACTIVE");
  }

  return product;
}

function assertCustomerBelongsToBusiness(
  db: Database.Database,
  businessId: string,
  customerId?: string | null,
) {
  if (!customerId) return;

  const customer = db
    .prepare(
      `
    SELECT id
    FROM customers
    WHERE id = ?
      AND business_id = ?
      AND status = 'active'
  `,
    )
    .get(customerId, businessId);

  if (!customer) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }
}

function getSaleById(
  db: Database.Database,
  businessId: string,
  saleId: string,
): SaleResponse | null {
  const sale = db
    .prepare(
      `
    SELECT *
    FROM sales
    WHERE id = ?
      AND business_id = ?
  `,
    )
    .get(saleId, businessId) as any;

  if (!sale) return null;

  const items = db
    .prepare(
      `
    SELECT *
    FROM sale_items
    WHERE sale_id = ?
    ORDER BY rowid ASC
  `,
    )
    .all(saleId) as any[];

  const payments = db
    .prepare(
      `
    SELECT *
    FROM sale_payments
    WHERE sale_id = ?
    ORDER BY rowid ASC
  `,
    )
    .all(saleId) as any[];

  return {
    id: sale.id,
    businessId: sale.business_id,
    branchId: sale.branch_id,
    employeeId: sale.employee_id,
    customerId: sale.customer_id,
    saleNumber: sale.sale_number,
    receiptNumber: sale.receipt_number,
    status: sale.status,
    currency: sale.currency,
    subtotalMinor: sale.subtotal_minor,
    discountType: sale.discount_type,
    discountValue: sale.discount_value,
    discountAmountMinor: sale.discount_amount_minor,
    totalMinor: sale.total_minor,
    amountPaidMinor: sale.amount_paid_minor,
    changeMinor: sale.change_minor,
    notes: sale.notes,
    completedAt: sale.completed_at,
    createdAt: sale.created_at,

    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      productSku: item.product_sku,
      productUnit: item.product_unit,
      quantity: item.quantity,
      unitCostMinor: item.unit_cost_minor,
      unitPriceMinor: item.unit_price_minor,
      lineSubtotalMinor: item.line_subtotal_minor,
      discountType: item.discount_type,
      discountValue: item.discount_value,
      discountAmountMinor: item.discount_amount_minor,
      lineTotalMinor: item.line_total_minor,
    })),

    payments: payments.map((payment) => ({
      id: payment.id,
      paymentMethod: payment.payment_method,
      amountMinor: payment.amount_minor,
      reference: payment.reference,
      notes: payment.notes,
      createdAt: payment.created_at,
    })),
  };
}

// ==========================================
// CREATE SALE
// ==========================================

export function createSale(
  db: Database.Database,
  auth: AuthContext,
  input: CreateSaleInput,
): SaleResponse {
  if (!hasPermission(auth, "sales.create")) {
    throw new Error("SALE_CREATE_FORBIDDEN");
  }

  requireBranchAccess(db, auth, input.branchId);

  const branch = db
    .prepare(
      `
    SELECT id
    FROM branches
    WHERE id = ?
      AND business_id = ?
  `,
    )
    .get(input.branchId, auth.businessId);

  if (!branch) {
    throw new Error("BRANCH_NOT_FOUND");
  }

  assertCustomerBelongsToBusiness(db, auth.businessId, input.customerId);

  const business = db
    .prepare(
      `
    SELECT currency
    FROM businesses
    WHERE id = ?
  `,
    )
    .get(auth.businessId) as { currency: string } | undefined;

  if (!business) {
    throw new Error("BUSINESS_NOT_FOUND");
  }

  const saleId = randomUUID();
  const saleNumber = generateSaleNumber("SAL");
  const receiptNumber = generateSaleNumber("RCT");
  const timestamp = now();

  const transaction = db.transaction(() => {
    let originalSubtotalMinor = 0;
    let itemDiscountTotalMinor = 0;

    const preparedItems = input.items.map((item) => {
      const product = getProductForSale(db, auth.businessId, item.productId);

      const lineSubtotalMinor = Math.round(
        product.selling_price_minor * item.quantity,
      );

      if (!Number.isSafeInteger(lineSubtotalMinor) || lineSubtotalMinor < 0) {
        throw new Error("INVALID_SALE_AMOUNT");
      }

      const discount = item.discount ?? { type: "none" as const };

      const discountAmountMinor = calculateDiscount(
        lineSubtotalMinor,
        discount,
      );

      const lineTotalMinor = lineSubtotalMinor - discountAmountMinor;

      originalSubtotalMinor += lineSubtotalMinor;
      itemDiscountTotalMinor += discountAmountMinor;

      return {
        product,
        quantity: item.quantity,
        lineSubtotalMinor,
        discount,
        discountAmountMinor,
        lineTotalMinor,
      };
    });

    if (
      !Number.isSafeInteger(originalSubtotalMinor) ||
      originalSubtotalMinor <= 0
    ) {
      throw new Error("INVALID_SALE_AMOUNT");
    }

    // The sale-level discount is applied after item-level discounts.
    const subtotalMinor = originalSubtotalMinor - itemDiscountTotalMinor;

    const saleDiscount = input.discount ?? { type: "none" as const };

    const saleDiscountAmountMinor = calculateDiscount(
      subtotalMinor,
      saleDiscount,
    );

    const totalDiscountMinor = itemDiscountTotalMinor + saleDiscountAmountMinor;

    assertCanDiscount(auth, totalDiscountMinor, originalSubtotalMinor);

    const totalMinor = subtotalMinor - saleDiscountAmountMinor;

    if (totalMinor <= 0) {
      throw new Error("SALE_TOTAL_MUST_BE_POSITIVE");
    }

    const amountPaidMinor = input.payments.reduce(
      (total, payment) => total + payment.amountMinor,
      0,
    );

    if (
      !Number.isSafeInteger(amountPaidMinor) ||
      amountPaidMinor < totalMinor
    ) {
      throw new Error("INSUFFICIENT_PAYMENT");
    }

    const cashPaidMinor = input.payments
      .filter((payment) => payment.method === "cash")
      .reduce((total, payment) => total + payment.amountMinor, 0);

    const changeMinor = amountPaidMinor - totalMinor;

    // Change must be funded by cash, not by card or electronic payments.
    if (changeMinor > cashPaidMinor) {
      throw new Error("CHANGE_EXCEEDS_CASH_PAYMENT");
    }

    // Create the completed sale record.
    db.prepare(
      `
      INSERT INTO sales (
        id,
        business_id,
        branch_id,
        employee_id,
        customer_id,
        sale_number,
        receipt_number,
        status,
        currency,
        subtotal_minor,
        discount_type,
        discount_value,
        discount_amount_minor,
        total_minor,
        amount_paid_minor,
        change_minor,
        notes,
        completed_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      saleId,
      auth.businessId,
      input.branchId,
      auth.employeeId,
      input.customerId ?? null,
      saleNumber,
      receiptNumber,
      business.currency,
      subtotalMinor,
      saleDiscount.type,
      saleDiscount.type === "none" ? 0 : saleDiscount.value,
      saleDiscountAmountMinor,
      totalMinor,
      amountPaidMinor,
      changeMinor,
      input.notes ?? null,
      timestamp,
      timestamp,
      timestamp,
    );

    // Save item snapshots and deduct stock.
    for (const item of preparedItems) {
      const itemId = randomUUID();

      db.prepare(
        `
        INSERT INTO sale_items (
          id,
          sale_id,
          product_id,
          product_name,
          product_sku,
          product_unit,
          quantity,
          unit_cost_minor,
          unit_price_minor,
          line_subtotal_minor,
          discount_type,
          discount_value,
          discount_amount_minor,
          line_total_minor,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        itemId,
        saleId,
        item.product.id,
        item.product.name,
        item.product.sku,
        item.product.unit,
        item.quantity,
        item.product.cost_price_minor,
        item.product.selling_price_minor,
        item.lineSubtotalMinor,
        item.discount.type,
        item.discount.type === "none" ? 0 : item.discount.value,
        item.discountAmountMinor,
        item.lineTotalMinor,
        timestamp,
      );

      if (item.product.track_stock === 1) {
        applyStockMovement(db, auth, {
          branchId: input.branchId,
          productId: item.product.id,
          movementType: "sale",
          quantityDelta: -item.quantity,
          referenceType: "sale",
          referenceId: saleId,
          notes: `Sale ${saleNumber}`,
        });
      }
    }

    // Save all payment methods used for this sale.
    for (const payment of input.payments) {
      db.prepare(
        `
        INSERT INTO sale_payments (
          id,
          sale_id,
          payment_method,
          amount_minor,
          reference,
          notes,
          received_by_employee_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        randomUUID(),
        saleId,
        payment.method,
        payment.amountMinor,
        payment.reference ?? null,
        payment.notes ?? null,
        auth.employeeId,
        timestamp,
      );
    }

    writeAuditLog(db, auth, "sales.sale_completed", "sale", saleId, {
      saleNumber,
      receiptNumber,
      branchId: input.branchId,
      customerId: input.customerId ?? null,
      itemCount: preparedItems.length,
      subtotalMinor,
      itemDiscountTotalMinor,
      saleDiscountAmountMinor,
      totalMinor,
      amountPaidMinor,
      changeMinor,
      paymentMethods: [
        ...new Set(input.payments.map((payment) => payment.method)),
      ],
    });

    const createdSale = getSaleById(db, auth.businessId, saleId);

    if (!createdSale) {
      throw new Error("SALE_CREATION_FAILED");
    }

    return createdSale;
  });

  // Immediate transaction obtains the write lock before reading stock.
  // Any failure rolls back the sale, payments, audit log and stock changes.
  return transaction.immediate();
}

// ==========================================
// GET SALE
// ==========================================

export function getSale(
  db: Database.Database,
  auth: AuthContext,
  saleId: string,
): SaleResponse | null {
  const sale = db
    .prepare(
      `
    SELECT id, employee_id, branch_id
    FROM sales
    WHERE id = ?
      AND business_id = ?
  `,
    )
    .get(saleId, auth.businessId) as
    | { id: string; employee_id: string; branch_id: string }
    | undefined;

  if (!sale) return null;

  const canViewAll = hasPermission(auth, "sales.view_all");
  const canViewOwn = hasPermission(auth, "sales.view_own");

  if (!canViewAll && !(canViewOwn && sale.employee_id === auth.employeeId)) {
    throw new Error("SALE_ACCESS_FORBIDDEN");
  }

  requireBranchAccess(db, auth, sale.branch_id);

  return getSaleById(db, auth.businessId, saleId);
}

// ==========================================
// LIST SALES
// ==========================================

export function listSales(
  db: Database.Database,
  auth: AuthContext,
  query: SalesListQuery,
) {
  const canViewAll = hasPermission(auth, "sales.view_all");
  const canViewOwn = hasPermission(auth, "sales.view_own");

  if (!canViewAll && !canViewOwn) {
    throw new Error("SALES_ACCESS_FORBIDDEN");
  }

  let branchIds = auth.branchIds;

  if (
    auth.roles.includes("owner") ||
    hasPermission(auth, "branches.access_all")
  ) {
    const branches = db
      .prepare(
        `
      SELECT id
      FROM branches
      WHERE business_id = ?
    `,
      )
      .all(auth.businessId) as Array<{ id: string }>;

    branchIds = branches.map((branch) => branch.id);
  }

  if (query.branchId) {
    requireBranchAccess(db, auth, query.branchId);
    branchIds = [query.branchId];
  }

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
    "s.business_id = ?",
    `s.branch_id IN (${branchIds.map(() => "?").join(", ")})`,
  ];

  const parameters: Array<string | number> = [auth.businessId, ...branchIds];

  if (!canViewAll) {
    conditions.push("s.employee_id = ?");
    parameters.push(auth.employeeId);
  }

  if (query.customerId) {
    conditions.push("s.customer_id = ?");
    parameters.push(query.customerId);
  }

  if (query.employeeId) {
    if (!canViewAll && query.employeeId !== auth.employeeId) {
      throw new Error("SALES_ACCESS_FORBIDDEN");
    }

    conditions.push("s.employee_id = ?");
    parameters.push(query.employeeId);
  }

  if (query.status) {
    conditions.push("s.status = ?");
    parameters.push(query.status);
  }

  if (query.dateFrom) {
    conditions.push("s.completed_at >= ?");
    parameters.push(`${query.dateFrom}T00:00:00.000Z`);
  }

  if (query.dateTo) {
    conditions.push("s.completed_at <= ?");
    parameters.push(`${query.dateTo}T23:59:59.999Z`);
  }

  if (query.search) {
    conditions.push(`(
      s.sale_number LIKE ?
      OR s.receipt_number LIKE ?
      OR EXISTS (
        SELECT 1
        FROM customers c
        WHERE c.id = s.customer_id
          AND (
            c.first_name LIKE ?
            OR c.last_name LIKE ?
            OR c.phone LIKE ?
          )
      )
    )`);

    const search = `%${query.search}%`;
    parameters.push(search, search, search, search, search);
  }

  const where = conditions.join(" AND ");

  const total = db
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM sales s
    WHERE ${where}
  `,
    )
    .get(...parameters) as { count: number };

  const offset = (query.page - 1) * query.limit;

  const records = db
    .prepare(
      `
    SELECT
      s.*,
      e.full_name AS employee_name,
      b.name AS branch_name,
      c.first_name AS customer_first_name,
      c.last_name AS customer_last_name
    FROM sales s
    INNER JOIN employees e ON e.id = s.employee_id
    INNER JOIN branches b ON b.id = s.branch_id
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE ${where}
    ORDER BY s.completed_at DESC, s.created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(...parameters, query.limit, offset) as any[];

  return {
    data: records.map((sale) => ({
      id: sale.id,
      saleNumber: sale.sale_number,
      receiptNumber: sale.receipt_number,
      status: sale.status,
      branchId: sale.branch_id,
      branchName: sale.branch_name,
      employeeId: sale.employee_id,
      employeeName: sale.employee_name,
      customerId: sale.customer_id,
      customerName: sale.customer_id
        ? [sale.customer_first_name, sale.customer_last_name]
            .filter(Boolean)
            .join(" ")
        : null,
      currency: sale.currency,
      subtotalMinor: sale.subtotal_minor,
      discountAmountMinor: sale.discount_amount_minor,
      totalMinor: sale.total_minor,
      amountPaidMinor: sale.amount_paid_minor,
      changeMinor: sale.change_minor,
      completedAt: sale.completed_at,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: total.count,
      totalPages: Math.ceil(total.count / query.limit),
    },
  };
}
