import type { AuthContext } from "./src/middleware/authenticate.js";
import type {
  CreateSaleInput,
  SalesListQuery,
} from "./src/modules/sales/types.js";

import { openDatabase } from "./src/database/connection.js";
import { createSale, getSale, listSales } from "./src/modules/sales/service.js";

const BUSINESS_ID = "fda72501-048f-4d8a-9ae9-9d4011c874d9";

const MAIN_BRANCH_ID = "64fbbb64-8cda-4568-aa61-ef65435430ee";
const WESTGATE_BRANCH_ID = "9a4ef982-648b-40b8-82a7-29349b50da03";

const EMPLOYEES = {
  owner: "e32a63ff-4ee0-4a26-a491-7b167bab45fb",
  teller: "b335d9af-ca37-4d2f-bd90-43da82a6fe66",
  supervisor: "17f2b2ce-5376-47c6-9978-956faffbd160",
  manager: "1b87730d-e064-41e9-b690-54417d82b825",
  multiSupervisor: "7ffcbddd-97e8-45ec-bb16-981b1c33dd7f",
};

const TEST_PRODUCT_ID = "6d6a3448-0ab0-460d-a69a-5428a210b017";

const db = openDatabase();

let passed = 0;

function pass(message: string) {
  passed++;
  console.log(`PASS: ${message}`);
}

function expectError(
  label: string,
  action: () => unknown,
  expectedError: string,
) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message === expectedError) {
      pass(label);
      return;
    }

    throw new Error(
      `${label}: expected ${expectedError}, received ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  throw new Error(`${label}: operation unexpectedly succeeded.`);
}

function expectSuccess(label: string, action: () => unknown) {
  try {
    action();
    pass(label);
  } catch (error) {
    throw new Error(
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getAuth(employeeId: string): AuthContext {
  const employee = db
    .prepare(
      `
    SELECT
      e.id,
      e.business_id,
      e.user_id,
      e.full_name,
      u.username
    FROM employees e
    INNER JOIN users u ON u.id = e.user_id
    WHERE e.id = ?
      AND e.business_id = ?
      AND e.status = 'active'
      AND u.status = 'active'
  `,
    )
    .get(employeeId, BUSINESS_ID) as
    | {
        id: string;
        business_id: string;
        user_id: string;
        full_name: string;
        username: string;
      }
    | undefined;

  if (!employee) {
    throw new Error(`Active employee not found: ${employeeId}`);
  }

  const roles = db
    .prepare(
      `
    SELECT r.slug
    FROM employee_roles er
    INNER JOIN roles r ON r.id = er.role_id
    WHERE er.employee_id = ?
      AND r.business_id = ?
  `,
    )
    .all(employeeId, BUSINESS_ID) as Array<{ slug: string }>;

  const permissions = db
    .prepare(
      `
    SELECT DISTINCT rp.permission_code
    FROM employee_roles er
    INNER JOIN roles r ON r.id = er.role_id
    INNER JOIN role_permissions rp ON rp.role_id = r.id
    WHERE er.employee_id = ?
      AND r.business_id = ?
  `,
    )
    .all(employeeId, BUSINESS_ID) as Array<{
    permission_code: string;
  }>;

  const branches = db
    .prepare(
      `
    SELECT branch_id
    FROM employee_branch_access
    WHERE employee_id = ?
  `,
    )
    .all(employeeId) as Array<{ branch_id: string }>;

  return {
    sessionId: "authorization-test",
    userId: employee.user_id,
    employeeId: employee.id,
    businessId: employee.business_id,
    username: employee.username,
    fullName: employee.full_name,
    roles: roles.map((role) => role.slug),
    permissions: permissions.map((permission) => permission.permission_code),
    branchIds: branches.map((branch) => branch.branch_id),
  };
}

function snapshotDatabase() {
  return {
    sales: (db.prepare("SELECT COUNT(*) AS count FROM sales").get() as any)
      .count,
    items: (db.prepare("SELECT COUNT(*) AS count FROM sale_items").get() as any)
      .count,
    payments: (
      db.prepare("SELECT COUNT(*) AS count FROM sale_payments").get() as any
    ).count,
    audits: (
      db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as any
    ).count,
    movements: (
      db.prepare("SELECT COUNT(*) AS count FROM stock_movements").get() as any
    ).count,
    inventory: db
      .prepare(
        `
      SELECT
        COUNT(*) AS records,
        COALESCE(SUM(quantity_on_hand), 0) AS quantity
      FROM branch_inventory
    `,
      )
      .get(),
  };
}

function makeSaleInput(
  branchId: string,
  discount: CreateSaleInput["discount"] = { type: "none" },
): CreateSaleInput {
  return {
    branchId,
    items: [
      {
        productId: TEST_PRODUCT_ID,
        quantity: 100,
        discount: { type: "none" },
      },
    ],
    discount,
    payments: [
      {
        method: "cash",
        amountMinor: 1,
      },
    ],
    notes: "Authorization test. Must not be saved.",
  };
}

const listQuery: SalesListQuery = {
  page: 1,
  limit: 20,
};

try {
  console.log("\nRetaily Sales Authorization Tests\n");

  const owner = getAuth(EMPLOYEES.owner);
  const manager = getAuth(EMPLOYEES.manager);
  const supervisor = getAuth(EMPLOYEES.supervisor);
  const teller = getAuth(EMPLOYEES.teller);
  const multiSupervisor = getAuth(EMPLOYEES.multiSupervisor);

  const activeProduct = db
    .prepare(
      `
    SELECT id
    FROM products
    WHERE id = ?
      AND business_id = ?
      AND is_active = 1
  `,
    )
    .get(TEST_PRODUCT_ID, BUSINESS_ID);

  if (!activeProduct) {
    throw new Error("The authorization test product is not active.");
  }

  const existingSale = db
    .prepare(
      `
    SELECT id
    FROM sales
    WHERE business_id = ?
      AND branch_id = ?
      AND employee_id = ?
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1
  `,
    )
    .get(BUSINESS_ID, MAIN_BRANCH_ID, owner.employeeId) as
    | {
        id: string;
      }
    | undefined;

  if (!existingSale) {
    throw new Error("Could not find the existing Owner sale for read tests.");
  }

  const before = snapshotDatabase();

  // ==========================================
  // 1. CREATE SALE PERMISSIONS
  // ==========================================

  console.log("\n1. CREATE SALE PERMISSIONS");

  expectError(
    "Owner has permission to reach sale processing",
    () => createSale(db, owner, makeSaleInput(WESTGATE_BRANCH_ID)),
    "INSUFFICIENT_PAYMENT",
  );

  expectError(
    "Manager has permission to reach sale processing",
    () => createSale(db, manager, makeSaleInput(WESTGATE_BRANCH_ID)),
    "INSUFFICIENT_PAYMENT",
  );

  expectError(
    "Supervisor has permission to reach sale processing",
    () => createSale(db, supervisor, makeSaleInput(WESTGATE_BRANCH_ID)),
    "INSUFFICIENT_PAYMENT",
  );

  expectError(
    "Teller has permission to reach sale processing",
    () => createSale(db, teller, makeSaleInput(WESTGATE_BRANCH_ID)),
    "INSUFFICIENT_PAYMENT",
  );

  const tellerWithoutCreatePermission: AuthContext = {
    ...teller,
    permissions: teller.permissions.filter(
      (permission) => permission !== "sales.create",
    ),
  };

  expectError(
    "User without sales.create is rejected",
    () =>
      createSale(
        db,
        tellerWithoutCreatePermission,
        makeSaleInput(WESTGATE_BRANCH_ID),
      ),
    "SALE_CREATE_FORBIDDEN",
  );

  // ==========================================
  // 2. BRANCH ACCESS
  // ==========================================

  console.log("\n2. BRANCH ACCESS");

  expectError(
    "Westgate Manager cannot create a sale in Main Branch",
    () => createSale(db, manager, makeSaleInput(MAIN_BRANCH_ID)),
    "BRANCH_ACCESS_DENIED",
  );

  expectError(
    "Westgate Supervisor cannot create a sale in Main Branch",
    () => createSale(db, supervisor, makeSaleInput(MAIN_BRANCH_ID)),
    "BRANCH_ACCESS_DENIED",
  );

  expectError(
    "Westgate Teller cannot create a sale in Main Branch",
    () => createSale(db, teller, makeSaleInput(MAIN_BRANCH_ID)),
    "BRANCH_ACCESS_DENIED",
  );

  expectError(
    "Westgate Supervisor cannot list Main Branch sales",
    () =>
      listSales(db, supervisor, {
        ...listQuery,
        branchId: MAIN_BRANCH_ID,
      }),
    "BRANCH_ACCESS_DENIED",
  );

  expectError(
    "Westgate Manager cannot list Main Branch sales",
    () =>
      listSales(db, manager, {
        ...listQuery,
        branchId: MAIN_BRANCH_ID,
      }),
    "BRANCH_ACCESS_DENIED",
  );

  expectSuccess("Multi-branch Supervisor can list Main Branch sales", () =>
    listSales(db, multiSupervisor, {
      ...listQuery,
      branchId: MAIN_BRANCH_ID,
    }),
  );

  // ==========================================
  // 3. SALES VISIBILITY
  // ==========================================

  console.log("\n3. SALES VISIBILITY");

  expectSuccess("Owner can view the existing sale", () =>
    getSale(db, owner, existingSale.id),
  );

  expectSuccess(
    "Multi-branch Supervisor can view a sale in an assigned branch",
    () => getSale(db, multiSupervisor, existingSale.id),
  );

  expectError(
    "Westgate Supervisor cannot view a Main Branch sale",
    () => getSale(db, supervisor, existingSale.id),
    "BRANCH_ACCESS_DENIED",
  );

  expectError(
    "Westgate Manager cannot view a Main Branch sale",
    () => getSale(db, manager, existingSale.id),
    "BRANCH_ACCESS_DENIED",
  );

  expectError(
    "Teller cannot view another employee's sale",
    () => getSale(db, teller, existingSale.id),
    "SALE_ACCESS_FORBIDDEN",
  );

  const tellerSales = listSales(db, teller, listQuery);

  if (
    !tellerSales.data.every((sale) => sale.employeeId === teller.employeeId)
  ) {
    throw new Error("Teller can see another employee's sales.");
  }

  pass("Teller's sales list contains only the Teller's own sales");

  const supervisorSales = listSales(db, supervisor, listQuery);

  if (
    !supervisorSales.data.every((sale) => sale.branchId === WESTGATE_BRANCH_ID)
  ) {
    throw new Error("Supervisor can see sales outside assigned branches.");
  }

  pass("Supervisor's sales list is restricted to assigned branches");

  const managerSales = listSales(db, manager, listQuery);

  if (
    !managerSales.data.every((sale) => sale.branchId === WESTGATE_BRANCH_ID)
  ) {
    throw new Error("Manager can see sales outside assigned branches.");
  }

  pass("Manager's sales list is restricted to assigned branches");

  expectSuccess("Owner can list sales across the business", () =>
    listSales(db, owner, listQuery),
  );

  // ==========================================
  // 4. DISCOUNT PERMISSIONS
  // ==========================================

  console.log("\n4. DISCOUNT PERMISSIONS");

  expectError(
    "Teller cannot exceed the 10% discount limit",
    () =>
      createSale(
        db,
        teller,
        makeSaleInput(WESTGATE_BRANCH_ID, {
          type: "percentage",
          value: 1100,
        }),
      ),
    "SALE_DISCOUNT_LIMIT_EXCEEDED",
  );

  expectError(
    "Supervisor cannot exceed the 10% discount limit",
    () =>
      createSale(
        db,
        supervisor,
        makeSaleInput(WESTGATE_BRANCH_ID, {
          type: "percentage",
          value: 1100,
        }),
      ),
    "SALE_DISCOUNT_LIMIT_EXCEEDED",
  );

  expectError(
    "Teller can apply a 10% discount",
    () =>
      createSale(
        db,
        teller,
        makeSaleInput(WESTGATE_BRANCH_ID, {
          type: "percentage",
          value: 1000,
        }),
      ),
    "INSUFFICIENT_PAYMENT",
  );

  expectError(
    "Supervisor can apply a 10% discount",
    () =>
      createSale(
        db,
        supervisor,
        makeSaleInput(WESTGATE_BRANCH_ID, {
          type: "percentage",
          value: 1000,
        }),
      ),
    "INSUFFICIENT_PAYMENT",
  );

  expectError(
    "Manager can apply a discount above 10%",
    () =>
      createSale(
        db,
        manager,
        makeSaleInput(WESTGATE_BRANCH_ID, {
          type: "percentage",
          value: 1100,
        }),
      ),
    "INSUFFICIENT_PAYMENT",
  );

  expectError(
    "Owner can apply a discount above 10%",
    () =>
      createSale(
        db,
        owner,
        makeSaleInput(WESTGATE_BRANCH_ID, {
          type: "percentage",
          value: 1100,
        }),
      ),
    "INSUFFICIENT_PAYMENT",
  );

  // ==========================================
  // 5. VERIFY NO DATABASE CHANGES
  // ==========================================

  console.log("\n5. DATABASE INTEGRITY");

  const after = snapshotDatabase();

  if (JSON.stringify(before) !== JSON.stringify(after)) {
    console.error("Before:", before);
    console.error("After:", after);
    throw new Error("Authorization tests changed database records or stock.");
  }

  pass(
    "No sales, items, payments, audit records or stock movements were added",
  );
  pass("Inventory quantities remained unchanged");

  console.log(`\nALL ${passed} AUTHORIZATION TESTS PASSED.`);
  console.log("No database records were changed.");
} finally {
  db.close();
}
