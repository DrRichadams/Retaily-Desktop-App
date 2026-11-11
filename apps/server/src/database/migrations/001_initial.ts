import type Database from "better-sqlite3";

export const initialMigration = {
  version: 1,
  name: "initial_business_structure",

  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE businesses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        legal_name TEXT,
























































































































































































































































































































































































































































































        
        currency TEXT NOT NULL DEFAULT 'USD',
        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),
        updated_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
      );

      CREATE TABLE branches (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        address TEXT,
        is_headquarters INTEGER NOT NULL DEFAULT 0
          CHECK (is_headquarters IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        UNIQUE (business_id, code)
      );

      CREATE TABLE registers (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'inactive')),
        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (branch_id)
          REFERENCES branches(id)
          ON DELETE RESTRICT,

        UNIQUE (branch_id, code)
      );

      CREATE INDEX idx_branches_business_id
        ON branches(business_id);

      CREATE INDEX idx_registers_branch_id
        ON registers(branch_id);
    `);
  },
};
