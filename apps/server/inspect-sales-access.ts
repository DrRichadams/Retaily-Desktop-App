import { openDatabase } from "./src/database/connection.js";

const db = openDatabase();

try {
  console.log("\n=== COMPLETE ROLE PERMISSIONS ===");

  const permissions = db
    .prepare(
      `
    SELECT
      r.name AS role,
      r.slug AS role_slug,
      rp.permission_code AS permission
    FROM roles r
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    ORDER BY r.name, rp.permission_code
  `,
    )
    .all();

  console.table(permissions);

  console.log("\n=== EMPLOYEE ROLES AND BRANCH ACCESS ===");

  const employees = db
    .prepare(
      `
    SELECT
      e.full_name,
      e.status AS employee_status,
      r.name AS role,
      b.name AS branch,
      eba.is_primary
    FROM employees e
    LEFT JOIN employee_roles er ON er.employee_id = e.id
    LEFT JOIN roles r ON r.id = er.role_id
    LEFT JOIN employee_branch_access eba ON eba.employee_id = e.id
    LEFT JOIN branches b ON b.id = eba.branch_id
    ORDER BY e.full_name, b.name
  `,
    )
    .all();

  console.table(employees);
} finally {
  db.close();
}
