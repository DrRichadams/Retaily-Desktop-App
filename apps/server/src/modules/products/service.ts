import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

import type {
  CategoryRecord,
  CreateCategoryInput,
  CreateProductInput,
  ProductListQuery,
  ProductRecord,
  ProductResponse,
  UpdateCategoryInput,
  UpdateProductInput,
} from "./types.js";

function productExists(
  db: Database.Database,
  businessId: string,
  productId: string,
) {
  return db
    .prepare(`SELECT id FROM products WHERE id = ? AND business_id = ?`)
    .get(productId, businessId);
}

function categoryExists(
  db: Database.Database,
  businessId: string,
  categoryId: string,
) {
  return db
    .prepare(
      `SELECT id FROM product_categories
       WHERE id = ? AND business_id = ? AND is_active = 1`,
    )
    .get(categoryId, businessId);
}

function mapProduct(
  db: Database.Database,
  record: ProductRecord,
): ProductResponse {
  const barcodes = db
    .prepare(
      `SELECT id, barcode, is_primary
       FROM product_barcodes
       WHERE product_id = ?
       ORDER BY is_primary DESC, created_at ASC`,
    )
    .all(record.id) as Array<{
    id: string;
    barcode: string;
    is_primary: number;
  }>;

  return {
    id: record.id,
    categoryId: record.category_id,
    categoryName: record.category_name,
    name: record.name,
    sku: record.sku,
    description: record.description,
    unit: record.unit,
    costPriceMinor: record.cost_price_minor,
    sellingPriceMinor: record.selling_price_minor,
    trackStock: record.track_stock === 1,
    status: record.is_active === 1 ? "active" : "inactive",
    barcodes: barcodes.map((item) => ({
      id: item.id,
      barcode: item.barcode,
      isPrimary: item.is_primary === 1,
    })),
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

const productSelect = `
  SELECT
    p.*,
    pc.name AS category_name
  FROM products p
  LEFT JOIN product_categories pc
    ON pc.id = p.category_id
    AND pc.business_id = p.business_id
`;

export function getProductStats(db: Database.Database, businessId: string) {
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) AS totalProducts,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeProducts,
        SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactiveProducts
      FROM products
      WHERE business_id = ?
      `,
    )
    .get(businessId) as {
    totalProducts: number;
    activeProducts: number | null;
    inactiveProducts: number | null;
  };

  const categories = db
    .prepare(
      `
      SELECT COUNT(*) AS totalCategories
      FROM product_categories
      WHERE business_id = ?
        AND is_active = 1
      `,
    )
    .get(businessId) as {
    totalCategories: number;
  };

  return {
    totalProducts: stats.totalProducts,
    activeProducts: stats.activeProducts ?? 0,
    inactiveProducts: stats.inactiveProducts ?? 0,
    totalCategories: categories.totalCategories,
  };
}

export function listProducts(
  db: Database.Database,
  businessId: string,
  query: ProductListQuery,
) {
  const conditions = ["p.business_id = ?"];
  const parameters: Array<string | number> = [businessId];

  if (query.status !== "all") {
    conditions.push("p.is_active = ?");
    parameters.push(query.status === "active" ? 1 : 0);
  }

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

  const where = conditions.join(" AND ");

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM products p WHERE ${where}`)
    .get(...parameters) as { count: number };

  const offset = (query.page - 1) * query.limit;

  const records = db
    .prepare(
      `${productSelect}
       WHERE ${where}
       ORDER BY p.name COLLATE NOCASE ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...parameters, query.limit, offset) as ProductRecord[];

  return {
    data: records.map((record) => mapProduct(db, record)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total: total.count,
      totalPages: Math.ceil(total.count / query.limit),
    },
  };
}

export function getProduct(
  db: Database.Database,
  businessId: string,
  productId: string,
) {
  const record = db
    .prepare(
      `${productSelect}
       WHERE p.id = ? AND p.business_id = ?`,
    )
    .get(productId, businessId) as ProductRecord | undefined;

  return record ? mapProduct(db, record) : null;
}

export function createProduct(
  db: Database.Database,
  businessId: string,
  input: CreateProductInput,
) {
  if (input.categoryId && !categoryExists(db, businessId, input.categoryId)) {
    throw new Error("CATEGORY_NOT_FOUND");
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO products (
        id,
        business_id,
        category_id,
        name,
        sku,
        description,
        unit,
        cost_price_minor,
        selling_price_minor,
        track_stock,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      businessId,
      input.categoryId ?? null,
      input.name,
      input.sku,
      input.description ?? null,
      input.unit ?? "each",
      input.costPriceMinor,
      input.sellingPriceMinor,
      input.trackStock === false ? 0 : 1,
      now,
      now,
    );

    if (input.barcode) {
      db.prepare(
        `INSERT INTO product_barcodes (
          id, business_id, product_id, barcode, is_primary
        ) VALUES (?, ?, ?, ?, 1)`,
      ).run(randomUUID(), businessId, id, input.barcode);
    }
  });

  create();

  return getProduct(db, businessId, id);
}

export function updateProduct(
  db: Database.Database,
  businessId: string,
  productId: string,
  input: UpdateProductInput,
) {
  if (!productExists(db, businessId, productId)) {
    return null;
  }

  if (input.categoryId && !categoryExists(db, businessId, input.categoryId)) {
    throw new Error("CATEGORY_NOT_FOUND");
  }

  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  const add = (column: string, value: string | number | null) => {
    fields.push(`${column} = ?`);
    values.push(value);
  };

  if (input.name !== undefined) add("name", input.name);
  if (input.sku !== undefined) add("sku", input.sku);
  if (input.categoryId !== undefined) {
    add("category_id", input.categoryId);
  }
  if (input.description !== undefined) {
    add("description", input.description);
  }
  if (input.unit !== undefined) add("unit", input.unit);

  if (input.costPriceMinor !== undefined) {
    add("cost_price_minor", input.costPriceMinor);
  }

  if (input.sellingPriceMinor !== undefined) {
    add("selling_price_minor", input.sellingPriceMinor);
  }

  if (input.trackStock !== undefined) {
    add("track_stock", input.trackStock ? 1 : 0);
  }

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());

  values.push(productId, businessId);

  db.prepare(
    `UPDATE products
     SET ${fields.join(", ")}
     WHERE id = ? AND business_id = ?`,
  ).run(...values);

  return getProduct(db, businessId, productId);
}

export function updateProductStatus(
  db: Database.Database,
  businessId: string,
  productId: string,
  status: "active" | "inactive",
) {
  const result = db
    .prepare(
      `UPDATE products
       SET is_active = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
    )
    .run(
      status === "active" ? 1 : 0,
      new Date().toISOString(),
      productId,
      businessId,
    );

  if (result.changes === 0) return null;

  return getProduct(db, businessId, productId);
}

export function listCategories(db: Database.Database, businessId: string) {
  return db
    .prepare(
      `SELECT
        id,
        name,
        description,
        parent_category_id AS parentCategoryId,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM product_categories
       WHERE business_id = ?
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(businessId);
}

export function createCategory(
  db: Database.Database,
  businessId: string,
  input: CreateCategoryInput,
) {
  if (
    input.parentCategoryId &&
    !categoryExists(db, businessId, input.parentCategoryId)
  ) {
    throw new Error("PARENT_CATEGORY_NOT_FOUND");
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO product_categories (
      id, business_id, name, description,
      parent_category_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    businessId,
    input.name,
    input.description ?? null,
    input.parentCategoryId ?? null,
    now,
    now,
  );

  return db
    .prepare(
      `SELECT
        id,
        name,
        description,
        parent_category_id AS parentCategoryId,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM product_categories
       WHERE id = ? AND business_id = ?`,
    )
    .get(id, businessId);
}

export function updateCategory(
  db: Database.Database,
  businessId: string,
  categoryId: string,
  input: UpdateCategoryInput,
) {
  const existing = db
    .prepare(
      `SELECT id FROM product_categories
       WHERE id = ? AND business_id = ?`,
    )
    .get(categoryId, businessId);

  if (!existing) return null;

  if (input.parentCategoryId === categoryId) {
    throw new Error("CATEGORY_CANNOT_BE_OWN_PARENT");
  }

  if (
    input.parentCategoryId &&
    !categoryExists(db, businessId, input.parentCategoryId)
  ) {
    throw new Error("PARENT_CATEGORY_NOT_FOUND");
  }

  const fields: string[] = [];
  const values: Array<string | null> = [];

  if (input.name !== undefined) {
    fields.push("name = ?");
    values.push(input.name);
  }

  if (input.description !== undefined) {
    fields.push("description = ?");
    values.push(input.description);
  }

  if (input.parentCategoryId !== undefined) {
    fields.push("parent_category_id = ?");
    values.push(input.parentCategoryId);
  }

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());

  values.push(categoryId, businessId);

  db.prepare(
    `UPDATE product_categories
     SET ${fields.join(", ")}
     WHERE id = ? AND business_id = ?`,
  ).run(...values);

  return db
    .prepare(
      `SELECT
        id,
        name,
        description,
        parent_category_id AS parentCategoryId,
        is_active AS isActive,
        created_at AS createdAt,
        updated_at AS updatedAt
       FROM product_categories
       WHERE id = ? AND business_id = ?`,
    )
    .get(categoryId, businessId);
}

export function addProductBarcode(
  db: Database.Database,
  businessId: string,
  productId: string,
  barcode: string,
  isPrimary: boolean,
) {
  if (!productExists(db, businessId, productId)) {
    return null;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  const add = db.transaction(() => {
    if (isPrimary) {
      db.prepare(
        `UPDATE product_barcodes
         SET is_primary = 0
         WHERE product_id = ?`,
      ).run(productId);
    }

    db.prepare(
      `INSERT INTO product_barcodes (
        id, business_id, product_id, barcode,
        is_primary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, businessId, productId, barcode, isPrimary ? 1 : 0, now);
  });

  add();

  return {
    id,
    productId,
    barcode,
    isPrimary,
    createdAt: now,
  };
}
