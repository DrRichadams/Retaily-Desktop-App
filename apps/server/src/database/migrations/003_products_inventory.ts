import type Database from "better-sqlite3";

export const productsInventoryMigration = {
  version: 3,
  name: "products_inventory",

  up(db: Database.Database) {
    db.exec(`
      -- ==========================================
      -- PRODUCT CATEGORIES
      -- ==========================================

      CREATE TABLE product_categories (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,

        name TEXT NOT NULL COLLATE NOCASE,
        description TEXT,

        parent_category_id TEXT,

        is_active INTEGER NOT NULL DEFAULT 1
          CHECK (is_active IN (0, 1)),

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        updated_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (parent_category_id, business_id)
          REFERENCES product_categories(id, business_id)
          ON DELETE RESTRICT,

        UNIQUE (id, business_id),
        UNIQUE (business_id, name)
      );

      CREATE INDEX idx_product_categories_business
        ON product_categories(business_id);


      -- ==========================================
      -- PRODUCTS
      -- ==========================================

      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,

        category_id TEXT,

        name TEXT NOT NULL,
        sku TEXT NOT NULL COLLATE NOCASE,
        description TEXT,

        unit TEXT NOT NULL DEFAULT 'each',

        cost_price_minor INTEGER NOT NULL DEFAULT 0
          CHECK (cost_price_minor >= 0),

        selling_price_minor INTEGER NOT NULL
          CHECK (selling_price_minor >= 0),

        track_stock INTEGER NOT NULL DEFAULT 1
          CHECK (track_stock IN (0, 1)),

        is_active INTEGER NOT NULL DEFAULT 1
          CHECK (is_active IN (0, 1)),

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        updated_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (category_id, business_id)
          REFERENCES product_categories(id, business_id)
          ON DELETE RESTRICT,

        UNIQUE (id, business_id),
        UNIQUE (business_id, sku)
      );

      CREATE INDEX idx_products_business
        ON products(business_id);

      CREATE INDEX idx_products_category
        ON products(category_id);

      CREATE INDEX idx_products_name
        ON products(business_id, name);

      CREATE INDEX idx_products_active
        ON products(business_id, is_active);


      -- ==========================================
      -- PRODUCT BARCODES
      -- ==========================================

      CREATE TABLE product_barcodes (
        id TEXT PRIMARY KEY,

        business_id TEXT NOT NULL,
        product_id TEXT NOT NULL,

        barcode TEXT NOT NULL,

        is_primary INTEGER NOT NULL DEFAULT 0
          CHECK (is_primary IN (0, 1)),

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (product_id, business_id)
          REFERENCES products(id, business_id)
          ON DELETE CASCADE,

        UNIQUE (business_id, barcode)
      );

      CREATE INDEX idx_product_barcodes_product
        ON product_barcodes(product_id);

      CREATE UNIQUE INDEX idx_product_barcodes_primary
        ON product_barcodes(product_id)
        WHERE is_primary = 1;


      -- ==========================================
      -- BRANCH INVENTORY
      -- ==========================================

      CREATE TABLE branch_inventory (
        id TEXT PRIMARY KEY,

        branch_id TEXT NOT NULL,
        product_id TEXT NOT NULL,

        quantity_on_hand REAL NOT NULL DEFAULT 0
          CHECK (quantity_on_hand >= 0),

        reorder_level REAL NOT NULL DEFAULT 0
          CHECK (reorder_level >= 0),

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        updated_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (branch_id)
          REFERENCES branches(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE RESTRICT,

        UNIQUE (branch_id, product_id)
      );

      CREATE INDEX idx_branch_inventory_product
        ON branch_inventory(product_id);

      CREATE INDEX idx_branch_inventory_branch
        ON branch_inventory(branch_id);


      -- ==========================================
      -- STOCK MOVEMENTS
      -- ==========================================

      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY,

        branch_id TEXT NOT NULL,
        product_id TEXT NOT NULL,

        movement_type TEXT NOT NULL
          CHECK (
            movement_type IN (
              'opening',
              'purchase',
              'sale',
              'sale_void',
              'customer_return',
              'supplier_return',
              'adjustment',
              'transfer_in',
              'transfer_out'
            )
          ),

        quantity_delta REAL NOT NULL
          CHECK (quantity_delta != 0),

        reference_type TEXT,
        reference_id TEXT,

        notes TEXT,

        created_by_employee_id TEXT,

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (branch_id)
          REFERENCES branches(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (created_by_employee_id)
          REFERENCES employees(id)
          ON DELETE SET NULL
      );

      CREATE INDEX idx_stock_movements_branch_product
        ON stock_movements(branch_id, product_id);

      CREATE INDEX idx_stock_movements_created
        ON stock_movements(created_at);

      CREATE INDEX idx_stock_movements_reference
        ON stock_movements(reference_type, reference_id);
    `);
  },
};
