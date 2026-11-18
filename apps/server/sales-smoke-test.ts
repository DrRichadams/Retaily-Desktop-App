import Database from "better-sqlite3";
import { createSale } from "./src/modules/sales/service.js";
import type { AuthContext } from "./src/middleware/authenticate.js";
import type { CreateSaleInput } from "./src/modules/sales/types.js";

const db = new Database(".retaily-data/retaily.sqlite");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`TEST FAILED: ${message}`);
}

function getCounts(branchId: string, productId: string) {
  return {
    sales: (db.prepare("SELECT COUNT(*) AS n FROM sales").get() as any).n,
    items: (db.prepare("SELECT COUNT(*) AS n FROM sale_items").get() as any).n,
    payments: (
      db.prepare("SELECT COUNT(*) AS n FROM sale_payments").get() as any
    ).n,
    audits: (db.prepare("SELECT COUNT(*) AS n FROM audit_logs").get() as any).n,
    movements: (
      db
        .prepare(
          `
        SELECT COUNT(*) AS n FROM stock_movements
        WHERE branch_id = ? AND product_id = ?
      `,
        )
        .get(branchId, productId) as any
    ).n,
    stock: (
      db
        .prepare(
          `
        SELECT quantity_on_hand FROM branch_inventory
        WHERE branch_id = ? AND product_id = ?
      `,
        )
        .get(branchId, productId) as any
    ).quantity_on_hand,
  };
}

function sameCounts(
  a: ReturnType<typeof getCounts>,
  b: ReturnType<typeof getCounts>,
) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function expectFailure(
  label: string,
  auth: AuthContext,
  input: CreateSaleInput,
  branchId: string,
  productId: string,
  expectedError?: string,
) {
  const before = getCounts(branchId, productId);
  let caught: unknown;

  try {
    createSale(db, auth, input);
  } catch (error) {
    caught = error;
  }

  assert(Boolean(caught), `${label}: transaction should have failed`);

  const message = caught instanceof Error ? caught.message : String(caught);

  if (expectedError) {
    assert(
      message === expectedError,
      `${label}: expected ${expectedError}, received ${message}`,
    );
  }

  const after = getCounts(branchId, productId);

  assert(
    sameCounts(before, after),
    `${label}: database changed despite failed transaction`,
  );

  console.log(`PASS: ${label} (${message})`);
}

try {
  // Find the active owner and their actual permissions.
  const owner = db
    .prepare(
      `
    SELECT
      e.id AS employeeId,
      e.business_id AS businessId,
      e.full_name AS fullName,
      u.id AS userId,
      u.username
    FROM employees e
    JOIN users u ON u.id = e.user_id
    JOIN employee_roles er ON er.employee_id = e.id
    JOIN roles r ON r.id = er.role_id
    WHERE r.slug = 'owner'
      AND e.status = 'active'
      AND u.status = 'active'
    LIMIT 1
  `,
    )
    .get() as any;

  assert(Boolean(owner), "Active owner account not found");

  const roles = db
    .prepare(
      `
    SELECT r.slug
    FROM employee_roles er
    JOIN roles r ON r.id = er.role_id
    WHERE er.employee_id = ?
  `,
    )
    .all(owner.employeeId) as Array<{ slug: string }>;

  const permissions = db
    .prepare(
      `
    SELECT DISTINCT rp.permission_code AS code
    FROM employee_roles er
    JOIN role_permissions rp ON rp.role_id = er.role_id
    WHERE er.employee_id = ?
  `,
    )
    .all(owner.employeeId) as Array<{ code: string }>;

  const branchIds = (
    db
      .prepare(
        `
      SELECT id FROM branches WHERE business_id = ?
    `,
      )
      .all(owner.businessId) as Array<{ id: string }>
  ).map((branch) => branch.id);

  const auth: AuthContext = {
    sessionId: "local-sales-smoke-test",
    userId: owner.userId,
    employeeId: owner.employeeId,
    businessId: owner.businessId,
    username: owner.username,
    fullName: owner.fullName,
    roles: roles.map((role) => role.slug),
    permissions: permissions.map((permission) => permission.code),
    branchIds,
  };

  const branch = db
    .prepare(
      `
    SELECT id FROM branches
    WHERE business_id = ? AND name = 'Main Branch'
  `,
    )
    .get(owner.businessId) as { id: string } | undefined;

  const product = db
    .prepare(
      `
    SELECT id, name, selling_price_minor
    FROM products
    WHERE business_id = ?
      AND sku = 'TEST-COCA-1564097162'
      AND is_active = 1
  `,
    )
    .get(owner.businessId) as any;

  assert(Boolean(branch), "Main Branch not found");
  assert(Boolean(product), "Active test Coca-Cola product not found");

  const branchId = branch!.id;
  const productId = product.id;
  const price = product.selling_price_minor;

  const initial = getCounts(branchId, productId);

  console.log("\nRetaily Sales Smoke Test");
  console.log("Owner:", owner.fullName);
  console.log("Product:", product.name);
  console.log("Price in minor units:", price);
  console.log("Initial Main Branch stock:", initial.stock);

  assert(initial.stock >= 1, "At least one unit of test stock is required");

  function saleInput(
    quantity: number,
    payments: CreateSaleInput["payments"],
  ): CreateSaleInput {
    return {
      branchId,
      items: [
        {
          productId,
          quantity,
          discount: { type: "none" },
        },
      ],
      discount: { type: "none" },
      payments,
      notes: "Retaily automated sales smoke test",
    };
  }

  // Test 1: Underpayment must be rejected.
  expectFailure(
    "Insufficient payment",
    auth,
    saleInput(1, [{ method: "cash", amountMinor: price - 1 }]),
    branchId,
    productId,
    "INSUFFICIENT_PAYMENT",
  );

  // Test 2: Change cannot be funded by a card payment.
  expectFailure(
    "Change cannot exceed cash received",
    auth,
    saleInput(1, [{ method: "card", amountMinor: price + 1 }]),
    branchId,
    productId,
    "CHANGE_EXCEEDS_CASH_PAYMENT",
  );

  // Test 3: Attempt to sell more stock than is available.
  expectFailure(
    "Insufficient stock rollback",
    auth,
    saleInput(initial.stock + 1, [
      { method: "cash", amountMinor: price * (initial.stock + 1) },
    ]),
    branchId,
    productId,
  );

  // Test 4: Successful split payment.
  const cashAmount = Math.floor(price / 2);
  const cardAmount = price - cashAmount;

  const completedSale = createSale(
    db,
    auth,
    saleInput(1, [
      { method: "cash", amountMinor: cashAmount },
      { method: "card", amountMinor: cardAmount },
    ]),
  );

  assert(completedSale.status === "completed", "Sale was not completed");
  assert(completedSale.totalMinor === price, "Sale total is incorrect");
  assert(completedSale.payments.length === 2, "Split payments were not saved");

  const final = getCounts(branchId, productId);

  assert(
    final.stock === initial.stock - 1,
    "Stock was not reduced by exactly one unit",
  );

  assert(final.sales === initial.sales + 1, "Expected exactly one new sale");

  assert(
    final.movements === initial.movements + 1,
    "Expected exactly one stock movement",
  );

  assert(
    final.audits === initial.audits + 1,
    "Expected exactly one audit record",
  );

  console.log("\nPASS: Successful split-payment sale");
  console.log("Sale number:", completedSale.saleNumber);
  console.log("Receipt number:", completedSale.receiptNumber);
  console.log("Total:", completedSale.totalMinor);
  console.log("Cash:", cashAmount);
  console.log("Card:", cardAmount);
  console.log("Stock remaining:", final.stock);

  console.log("\nALL SALES SMOKE TESTS PASSED.");
} catch (error) {
  console.error("\nSALES SMOKE TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
