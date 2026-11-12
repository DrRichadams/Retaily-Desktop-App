import type Database from "better-sqlite3";

export const inventoryTransfersMigration = {
  version: 4,
  name: "inventory_transfers",

  up(db: Database.Database) {
    db.exec(`
      -- ==========================================
      -- ALL-BRANCH ACCESS PERMISSION
      -- ==========================================

      INSERT OR IGNORE INTO permissions (code, description)
      VALUES (
        'branches.access_all',
        'Access all branches belonging to the business'
      );


      -- ==========================================
      -- STOCK TRANSFERS
      -- ==========================================

      CREATE TABLE stock_transfers (
        id TEXT PRIMARY KEY,

        business_id TEXT NOT NULL,
        transfer_number TEXT NOT NULL,

        source_branch_id TEXT NOT NULL,
        destination_branch_id TEXT NOT NULL,

        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (
            status IN (
              'draft',
              'in_transit',
              'partially_received',
              'received',
              'cancelled'
            )
          ),

        notes TEXT,

        created_by_employee_id TEXT,
        dispatched_by_employee_id TEXT,
        received_by_employee_id TEXT,

        dispatched_at TEXT,
        received_at TEXT,

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        updated_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (source_branch_id)
          REFERENCES branches(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (destination_branch_id)
          REFERENCES branches(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (created_by_employee_id)
          REFERENCES employees(id)
          ON DELETE SET NULL,

        FOREIGN KEY (dispatched_by_employee_id)
          REFERENCES employees(id)
          ON DELETE SET NULL,

        FOREIGN KEY (received_by_employee_id)
          REFERENCES employees(id)
          ON DELETE SET NULL,

        CHECK (source_branch_id != destination_branch_id),

        UNIQUE (business_id, transfer_number),
        UNIQUE (id, business_id)
      );

      CREATE INDEX idx_stock_transfers_business
        ON stock_transfers(business_id);

      CREATE INDEX idx_stock_transfers_source
        ON stock_transfers(source_branch_id);

      CREATE INDEX idx_stock_transfers_destination
        ON stock_transfers(destination_branch_id);

      CREATE INDEX idx_stock_transfers_status
        ON stock_transfers(business_id, status);

      CREATE INDEX idx_stock_transfers_created
        ON stock_transfers(created_at);


      -- ==========================================
      -- STOCK TRANSFER ITEMS
      -- ==========================================

      CREATE TABLE stock_transfer_items (
        id TEXT PRIMARY KEY,

        transfer_id TEXT NOT NULL,
        product_id TEXT NOT NULL,

        quantity_requested REAL NOT NULL
          CHECK (quantity_requested > 0),

        quantity_received REAL NOT NULL DEFAULT 0
          CHECK (
            quantity_received >= 0
            AND quantity_received <= quantity_requested
          ),

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        updated_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (transfer_id)
          REFERENCES stock_transfers(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE RESTRICT,

        UNIQUE (transfer_id, product_id)
      );

      CREATE INDEX idx_stock_transfer_items_transfer
        ON stock_transfer_items(transfer_id);

      CREATE INDEX idx_stock_transfer_items_product
        ON stock_transfer_items(product_id);


      -- ==========================================
      -- BUSINESS OWNERSHIP VALIDATION
      -- ==========================================

      -- Inventory branch and product must belong
      -- to the same business.

      CREATE TRIGGER trg_branch_inventory_business_insert
      BEFORE INSERT ON branch_inventory
      BEGIN
        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM branches b
            INNER JOIN products p
              ON p.id = NEW.product_id
            WHERE b.id = NEW.branch_id
              AND b.business_id = p.business_id
          )
          THEN RAISE(
            ABORT,
            'INVENTORY_BUSINESS_MISMATCH'
          )
        END;

        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM products p
            WHERE p.id = NEW.product_id
              AND p.track_stock = 1
          )
          THEN RAISE(
            ABORT,
            'PRODUCT_STOCK_TRACKING_DISABLED'
          )
        END;
      END;


      CREATE TRIGGER trg_branch_inventory_business_update
      BEFORE UPDATE OF branch_id, product_id
      ON branch_inventory
      BEGIN
        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM branches b
            INNER JOIN products p
              ON p.id = NEW.product_id
            WHERE b.id = NEW.branch_id
              AND b.business_id = p.business_id
          )
          THEN RAISE(
            ABORT,
            'INVENTORY_BUSINESS_MISMATCH'
          )
        END;

        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM products p
            WHERE p.id = NEW.product_id
              AND p.track_stock = 1
          )
          THEN RAISE(
            ABORT,
            'PRODUCT_STOCK_TRACKING_DISABLED'
          )
        END;
      END;


      -- Stock movement branch and product must
      -- belong to the same business.

      CREATE TRIGGER trg_stock_movements_business_insert
      BEFORE INSERT ON stock_movements
      BEGIN
        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM branches b
            INNER JOIN products p
              ON p.id = NEW.product_id
            WHERE b.id = NEW.branch_id
              AND b.business_id = p.business_id
          )
          THEN RAISE(
            ABORT,
            'INVENTORY_BUSINESS_MISMATCH'
          )
        END;

        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM products p
            WHERE p.id = NEW.product_id
              AND p.track_stock = 1
          )
          THEN RAISE(
            ABORT,
            'PRODUCT_STOCK_TRACKING_DISABLED'
          )
        END;
      END;


      -- A transfer must use two branches belonging
      -- to its own business.

      CREATE TRIGGER trg_stock_transfers_business_insert
      BEFORE INSERT ON stock_transfers
      BEGIN
        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM branches
            WHERE id = NEW.source_branch_id
              AND business_id = NEW.business_id
          )
          THEN RAISE(
            ABORT,
            'INVALID_SOURCE_BRANCH'
          )
        END;

        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM branches
            WHERE id = NEW.destination_branch_id
              AND business_id = NEW.business_id
          )
          THEN RAISE(
            ABORT,
            'INVALID_DESTINATION_BRANCH'
          )
        END;
      END;


      -- Transfer items must belong to the same
      -- business as their transfer.

      CREATE TRIGGER trg_stock_transfer_items_business_insert
      BEFORE INSERT ON stock_transfer_items
      BEGIN
        SELECT CASE
          WHEN NOT EXISTS (
            SELECT 1
            FROM stock_transfers t
            INNER JOIN products p
              ON p.id = NEW.product_id
            WHERE t.id = NEW.transfer_id
              AND t.business_id = p.business_id
              AND p.track_stock = 1
          )
          THEN RAISE(
            ABORT,
            'INVALID_TRANSFER_PRODUCT'
          )
        END;
      END;
    `);
  },
};
