import type Database from "better-sqlite3";

export const checkoutAttemptsMigration = {
  version: 10,
  name: "checkout_attempts",

  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE checkout_attempts (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_payload TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'completed')),
        sale_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,

        UNIQUE (business_id, idempotency_key),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,
        FOREIGN KEY (employee_id)
          REFERENCES employees(id)
          ON DELETE RESTRICT,
        FOREIGN KEY (sale_id)
          REFERENCES sales(id)
          ON DELETE RESTRICT,

        CHECK (
          (status = 'pending' AND sale_id IS NULL AND completed_at IS NULL)
          OR
          (status = 'completed' AND sale_id IS NOT NULL AND completed_at IS NOT NULL)
        )
      );

      CREATE INDEX idx_checkout_attempts_employee_status
        ON checkout_attempts (business_id, employee_id, status, updated_at);
    `);
  },
};
