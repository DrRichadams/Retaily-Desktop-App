import type Database from "better-sqlite3";

export const salesTransactionsMigration = {
  version: 7,
  name: "sales_transactions",

  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE sales (
        id TEXT PRIMARY KEY,

        business_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        customer_id TEXT,

        sale_number TEXT NOT NULL,
        receipt_number TEXT NOT NULL,

        status TEXT NOT NULL DEFAULT 'completed'
          CHECK (status IN ('completed', 'voided')),

        currency TEXT NOT NULL,

        subtotal_minor INTEGER NOT NULL
          CHECK (subtotal_minor >= 0),

        discount_type TEXT NOT NULL DEFAULT 'none'
          CHECK (
            discount_type IN ('none', 'fixed', 'percentage')
          ),

        discount_value INTEGER NOT NULL DEFAULT 0
          CHECK (discount_value >= 0),

        discount_amount_minor INTEGER NOT NULL DEFAULT 0
          CHECK (discount_amount_minor >= 0),

        total_minor INTEGER NOT NULL
          CHECK (total_minor >= 0),

        amount_paid_minor INTEGER NOT NULL
          CHECK (amount_paid_minor >= 0),

        change_minor INTEGER NOT NULL DEFAULT 0
          CHECK (change_minor >= 0),

        notes TEXT,

        completed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (branch_id)
          REFERENCES branches(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (employee_id)
          REFERENCES employees(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (customer_id)
          REFERENCES customers(id)
          ON DELETE RESTRICT,

        UNIQUE (business_id, sale_number),
        UNIQUE (business_id, receipt_number),

        CHECK (discount_amount_minor <= subtotal_minor),
        CHECK (total_minor = subtotal_minor - discount_amount_minor),
        CHECK (amount_paid_minor >= total_minor),
        CHECK (change_minor = amount_paid_minor - total_minor)
      );

      CREATE TABLE sale_items (
        id TEXT PRIMARY KEY,

        sale_id TEXT NOT NULL,
        product_id TEXT NOT NULL,

        product_name TEXT NOT NULL,
        product_sku TEXT NOT NULL,
        product_unit TEXT NOT NULL,

        quantity REAL NOT NULL
          CHECK (quantity > 0),

        unit_cost_minor INTEGER NOT NULL
          CHECK (unit_cost_minor >= 0),

        unit_price_minor INTEGER NOT NULL
          CHECK (unit_price_minor >= 0),

        line_subtotal_minor INTEGER NOT NULL
          CHECK (line_subtotal_minor >= 0),

        discount_type TEXT NOT NULL DEFAULT 'none'
          CHECK (
            discount_type IN ('none', 'fixed', 'percentage')
          ),

        discount_value INTEGER NOT NULL DEFAULT 0
          CHECK (discount_value >= 0),

        discount_amount_minor INTEGER NOT NULL DEFAULT 0
          CHECK (discount_amount_minor >= 0),

        line_total_minor INTEGER NOT NULL
          CHECK (line_total_minor >= 0),

        created_at TEXT NOT NULL,

        FOREIGN KEY (sale_id)
          REFERENCES sales(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (product_id)
          REFERENCES products(id)
          ON DELETE RESTRICT,

        CHECK (discount_amount_minor <= line_subtotal_minor),
        CHECK (
          line_total_minor =
          line_subtotal_minor - discount_amount_minor
        )
      );

      CREATE TABLE sale_payments (
        id TEXT PRIMARY KEY,

        sale_id TEXT NOT NULL,

        payment_method TEXT NOT NULL
          CHECK (
            payment_method IN (
              'cash',
              'card',
              'ecocash',
              'innbucks',
              'bank_transfer',
              'other'
            )
          ),

        amount_minor INTEGER NOT NULL
          CHECK (amount_minor > 0),

        reference TEXT,
        notes TEXT,

        received_by_employee_id TEXT NOT NULL,

        created_at TEXT NOT NULL,

        FOREIGN KEY (sale_id)
          REFERENCES sales(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (received_by_employee_id)
          REFERENCES employees(id)
          ON DELETE RESTRICT
      );

      CREATE INDEX idx_sales_business
        ON sales(business_id);

      CREATE INDEX idx_sales_branch_date
        ON sales(branch_id, completed_at);

      CREATE INDEX idx_sales_employee_date
        ON sales(employee_id, completed_at);

      CREATE INDEX idx_sales_customer_date
        ON sales(customer_id, completed_at);

      CREATE INDEX idx_sales_status
        ON sales(business_id, status);

      CREATE INDEX idx_sale_items_sale
        ON sale_items(sale_id);

      CREATE INDEX idx_sale_items_product
        ON sale_items(product_id);

      CREATE INDEX idx_sale_payments_sale
        ON sale_payments(sale_id);

      CREATE INDEX idx_sale_payments_method
        ON sale_payments(payment_method, created_at);
    `);
  },
};
