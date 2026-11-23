import type Database from "better-sqlite3";

export const salesIdempotencyMigration = {
  version: 9,
  name: "sales_idempotency",

  up(db: Database.Database) {
    db.exec(`
      ALTER TABLE sales
        ADD COLUMN idempotency_key TEXT;

      ALTER TABLE sales
        ADD COLUMN idempotency_request_hash TEXT;

      CREATE UNIQUE INDEX idx_sales_business_idempotency_key
        ON sales (business_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    `);
  },
};
