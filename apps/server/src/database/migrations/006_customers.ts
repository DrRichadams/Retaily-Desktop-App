import type Database from "better-sqlite3";

export const customersMigration = {
  version: 6,
  name: "customers",

  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,

        business_id TEXT NOT NULL,

        customer_number TEXT NOT NULL,

        first_name TEXT NOT NULL,
        last_name TEXT,

        phone TEXT,
        email TEXT,

        address TEXT,
        notes TEXT,

        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'inactive')),

        created_by_employee_id TEXT,

        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (created_by_employee_id)
          REFERENCES employees(id)
          ON DELETE SET NULL,

        UNIQUE (business_id, customer_number)
      );

      CREATE INDEX idx_customers_business
        ON customers(business_id);

      CREATE INDEX idx_customers_business_status
        ON customers(business_id, status);

      CREATE INDEX idx_customers_business_name
        ON customers(business_id, last_name, first_name);

      CREATE INDEX idx_customers_business_phone
        ON customers(business_id, phone);

      CREATE INDEX idx_customers_business_email
        ON customers(business_id, email);
    `);
  },
};
