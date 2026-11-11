import type Database from "better-sqlite3";

const permissions = [
  ["dashboard.view", "View the dashboard"],

  ["sales.create", "Process sales"],
  ["sales.view_own", "View own transactions"],
  ["sales.view_all", "View all transactions"],
  ["sales.refund", "Process refunds"],
  ["sales.discount_limited", "Apply limited discounts"],
  ["sales.discount_full", "Apply unrestricted discounts"],

  ["products.view", "View products"],
  ["products.manage", "Create and manage products"],

  ["inventory.view", "View inventory"],
  ["inventory.manage", "Manage inventory and stock adjustments"],

  ["customers.view", "View customers"],
  ["customers.manage", "Manage customers"],

  ["employees.view", "View employees"],
  ["employees.manage", "Manage employees"],

  ["branches.manage", "Manage branches"],
  ["registers.manage", "Manage registers"],

  ["reports.view_basic", "View basic reports"],
  ["reports.view_full", "View full business reports"],

  ["settings.view", "View business settings"],
  ["settings.manage", "Manage business settings"],

  ["roles.manage", "Create and manage roles and permissions"],
  ["audit.view", "View the audit log"],
] as const;

export const identityMigration = {
  version: 2,
  name: "identity_access",

  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,

        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL,

        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'disabled')),

        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        updated_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        )
      );

      CREATE TABLE employees (
        id TEXT PRIMARY KEY,

        business_id TEXT NOT NULL,
        user_id TEXT NOT NULL,

        employee_number TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,

        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'inactive')),

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE RESTRICT,

        UNIQUE (business_id, user_id),
        UNIQUE (business_id, employee_number)
      );

      CREATE TABLE roles (
        id TEXT PRIMARY KEY,

        business_id TEXT NOT NULL,
        name TEXT NOT NULL,
        slug TEXT NOT NULL,

        is_system INTEGER NOT NULL DEFAULT 0
          CHECK (is_system IN (0, 1)),

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        UNIQUE (business_id, slug)
      );

      CREATE TABLE permissions (
        code TEXT PRIMARY KEY,
        description TEXT NOT NULL
      );

      CREATE TABLE role_permissions (
        role_id TEXT NOT NULL,
        permission_code TEXT NOT NULL,

        PRIMARY KEY (role_id, permission_code),

        FOREIGN KEY (role_id)
          REFERENCES roles(id)
          ON DELETE CASCADE,

        FOREIGN KEY (permission_code)
          REFERENCES permissions(code)
          ON DELETE CASCADE
      );

      CREATE TABLE employee_roles (
        employee_id TEXT NOT NULL,
        role_id TEXT NOT NULL,

        PRIMARY KEY (employee_id, role_id),

        FOREIGN KEY (employee_id)
          REFERENCES employees(id)
          ON DELETE CASCADE,

        FOREIGN KEY (role_id)
          REFERENCES roles(id)
          ON DELETE CASCADE
      );

      CREATE TABLE employee_branch_access (
        employee_id TEXT NOT NULL,
        branch_id TEXT NOT NULL,

        is_primary INTEGER NOT NULL DEFAULT 0
          CHECK (is_primary IN (0, 1)),

        PRIMARY KEY (employee_id, branch_id),

        FOREIGN KEY (employee_id)
          REFERENCES employees(id)
          ON DELETE CASCADE,

        FOREIGN KEY (branch_id)
          REFERENCES branches(id)
          ON DELETE CASCADE
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,

        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,

        expires_at TEXT NOT NULL,
        revoked_at TEXT,

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        last_seen_at TEXT,

        FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      );

      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,

        business_id TEXT NOT NULL,
        employee_id TEXT,

        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,

        metadata_json TEXT,

        created_at TEXT NOT NULL DEFAULT (
          strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        ),

        FOREIGN KEY (business_id)
          REFERENCES businesses(id)
          ON DELETE RESTRICT,

        FOREIGN KEY (employee_id)
          REFERENCES employees(id)
          ON DELETE SET NULL
      );

      CREATE INDEX idx_employees_business
        ON employees(business_id);

      CREATE INDEX idx_employee_roles_role
        ON employee_roles(role_id);

      CREATE INDEX idx_employee_branch_branch
        ON employee_branch_access(branch_id);

      CREATE INDEX idx_sessions_user
        ON sessions(user_id);

      CREATE INDEX idx_audit_business_date
        ON audit_logs(business_id, created_at);
    `);

    const insertPermission = db.prepare(`
      INSERT INTO permissions (code, description)
      VALUES (?, ?)
    `);

    for (const [code, description] of permissions) {
      insertPermission.run(code, description);
    }
  },
};
