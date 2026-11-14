import type Database from "better-sqlite3";

export const employeeAccountStatusMigration = {
  version: 5,
  name: "employee_account_status",

  up(db: Database.Database) {
    db.exec(`
      -- ==========================================
      -- EMPLOYEE ACCOUNT DISABLE REASONS
      -- ==========================================

      ALTER TABLE users
      ADD COLUMN disabled_reason TEXT
      CHECK (
        disabled_reason IS NULL
        OR disabled_reason IN (
          'employee_inactive',
          'admin',
          'security'
        )
      );

      -- Existing disabled accounts deliberately retain
      -- NULL until their reason can be established.
      -- They must not be automatically reactivated.
    `);
  },
};
