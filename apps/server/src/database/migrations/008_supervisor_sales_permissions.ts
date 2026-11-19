import type Database from "better-sqlite3";

export const supervisorSalesPermissionsMigration = {
  version: 8,
  name: "supervisor_sales_permissions",

  up(db: Database.Database) {
    db.prepare(
      `
      DELETE FROM role_permissions
      WHERE permission_code IN (
        'sales.refund',
        'sales.discount_full'
      )
      AND role_id IN (
        SELECT id
        FROM roles
        WHERE slug = 'supervisor'
          AND is_system = 1
      )
    `,
    ).run();
  },
};
