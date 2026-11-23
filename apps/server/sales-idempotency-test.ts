import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Fastify from "fastify";
import Database from "better-sqlite3";

import { hashPassword } from "./src/modules/authentication/password.js";
import { runMigrations } from "./src/database/migrate.js";
import { registerAuthenticationRoutes } from "./src/modules/authentication/routes.js";
import { registerOnboardingRoutes } from "./src/modules/onboarding/routes.js";
import { createProduct } from "./src/modules/products/service.js";
import { receiveStock } from "./src/modules/inventory/service.js";
import { registerSalesRoutes } from "./src/modules/sales/routes.js";
import type { AuthContext } from "./src/middleware/authenticate.js";

const tempDirectory = mkdtempSync(join(tmpdir(), "retaily-sales-idempotency-"));
const db = new Database(join(tempDirectory, "isolated.sqlite"));
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

function count(table: string, businessId: string) {
  return (
    db
      .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE business_id = ?`)
      .get(businessId) as { count: number }
  ).count;
}

function makeSalePayload(branchId: string, productId: string, amount = 1000) {
  return {
    branchId,
    items: [{ productId, quantity: 2 }],
    payments: [{ method: "cash", amountMinor: amount }],
    notes: "Idempotency integration test",
  };
}

async function main() {
  runMigrations(db);

  const app = Fastify({ logger: false });
  registerOnboardingRoutes(app, db);
  registerAuthenticationRoutes(app, db);
  registerSalesRoutes(app, db);
  await app.ready();

  try {
    const onboarding = await app.inject({
      method: "POST",
      url: "/api/onboarding/owner",
      payload: {
        businessName: "Idempotency Test Shop",
        ownerName: "Test Owner",
        username: "test.owner",
        password: "Isolated-Test-Password-123!",
        branchName: "Main Branch",
        branchCode: "MAIN",
        registerName: "Register One",
        registerCode: "REG1",
        currency: "USD",
      },
    });
    assert.equal(onboarding.statusCode, 201, onboarding.body);
    const primary = onboarding.json() as {
      businessId: string;
      branchId: string;
      ownerId: string;
    };

    const primaryLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "test.owner",
        password: "Isolated-Test-Password-123!",
      },
    });
    assert.equal(primaryLogin.statusCode, 200, primaryLogin.body);
    const primaryToken = primaryLogin.json().token as string;

    const ownerAuth: AuthContext = {
      sessionId: randomUUID(),
      userId: randomUUID(),
      employeeId: primary.ownerId,
      businessId: primary.businessId,
      username: "test.owner",
      fullName: "Test Owner",
      roles: ["owner"],
      permissions: ["*"],
      branchIds: [primary.branchId],
    };

    const product = createProduct(db, primary.businessId, {
      name: "Test Widget",
      sku: "TEST-WIDGET",
      unit: "each",
      costPriceMinor: 200,
      sellingPriceMinor: 500,
      trackStock: true,
    });
    const alternateProduct = createProduct(db, primary.businessId, {
      name: "Alternate Widget",
      sku: "ALT-WIDGET",
      unit: "each",
      costPriceMinor: 100,
      sellingPriceMinor: 500,
      trackStock: true,
    });
    receiveStock(db, ownerAuth, {
      branchId: primary.branchId,
      productId: product.id,
      quantity: 100,
    });
    receiveStock(db, ownerAuth, {
      branchId: primary.branchId,
      productId: alternateProduct.id,
      quantity: 100,
    });

    const teller = {
      userId: randomUUID(),
      employeeId: randomUUID(),
      roleId: db
        .prepare(
          "SELECT id FROM roles WHERE business_id = ? AND slug = 'teller'",
        )
        .get(primary.businessId) as { id: string },
    };
    db.prepare(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
    ).run(
      teller.userId,
      "test.teller",
      hashPassword("Isolated-Teller-Password-123!"),
    );
    db.prepare(
      `INSERT INTO employees (id, business_id, user_id, employee_number, full_name)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(teller.employeeId, primary.businessId, teller.userId, "EMP-002", "Test Teller");
    db.prepare(
      "INSERT INTO employee_roles (employee_id, role_id) VALUES (?, ?)",
    ).run(teller.employeeId, teller.roleId.id);
    db.prepare(
      `INSERT INTO employee_branch_access (employee_id, branch_id, is_primary)
       VALUES (?, ?, 1)`,
    ).run(teller.employeeId, primary.branchId);

    const tellerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "test.teller",
        password: "Isolated-Teller-Password-123!",
      },
    });
    assert.equal(tellerLogin.statusCode, 200, tellerLogin.body);
    const tellerToken = tellerLogin.json().token as string;

    const headers = {
      authorization: `Bearer ${primaryToken}`,
    };
    const keyedHeaders = (key: string) => ({
      ...headers,
      "idempotency-key": key,
    });
    const basePayload = makeSalePayload(primary.branchId, product.id);

    const customerId = randomUUID();
    const customerTimestamp = new Date().toISOString();
    db.prepare(
      `INSERT INTO customers (
        id, business_id, customer_number, first_name, status, created_at, updated_at
      ) VALUES (?, ?, 'CUS-001', 'Replay Customer', 'active', ?, ?)` ,
    ).run(
      customerId,
      primary.businessId,
      customerTimestamp,
      customerTimestamp,
    );

    // A first keyed request creates the sale once.
    const first = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("first-request-key"),
      payload: basePayload,
    });
    assert.equal(first.statusCode, 201, first.body);
    const originalSale = first.json().data;
    const saleCountAfterFirst = count("sales", primary.businessId);
    const stockAfterFirst = db
      .prepare(
        "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
      )
      .get(primary.branchId, product.id) as { quantity: number };
    assert.equal(saleCountAfterFirst, 1);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sales WHERE business_id = ? AND idempotency_key = ?",
          )
          .get(primary.businessId, "first-request-key") as { count: number }
      ).count,
      1,
    );
    assert.equal(stockAfterFirst.quantity, 98);

    const replay = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("first-request-key"),
      payload: basePayload,
    });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.deepEqual(replay.json().data, originalSale);
    assert.equal(count("sales", primary.businessId), saleCountAfterFirst);
    assert.equal(
      (
        db
          .prepare(
            "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
          )
          .get(primary.branchId, product.id) as { quantity: number }
      ).quantity,
      98,
    );

    const customerSalePayload = { ...basePayload, customerId };
    const customerSale = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("inactive-customer-replay-key"),
      payload: customerSalePayload,
    });
    assert.equal(customerSale.statusCode, 201, customerSale.body);
    const customerSaleData = customerSale.json().data;
    const stockAfterCustomerSale = (
      db
        .prepare(
          "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
        )
        .get(primary.branchId, product.id) as { quantity: number }
    ).quantity;
    db.prepare("UPDATE customers SET status = 'inactive' WHERE id = ?").run(
      customerId,
    );

    const inactiveCustomerReplay = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("inactive-customer-replay-key"),
      payload: customerSalePayload,
    });
    assert.equal(
      inactiveCustomerReplay.statusCode,
      200,
      inactiveCustomerReplay.body,
    );
    assert.deepEqual(inactiveCustomerReplay.json().data, customerSaleData);
    assert.equal(
      (
        db
          .prepare(
            "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
          )
          .get(primary.branchId, product.id) as { quantity: number }
      ).quantity,
      stockAfterCustomerSale,
    );

    const changedCart = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("first-request-key"),
      payload: makeSalePayload(primary.branchId, alternateProduct.id),
    });
    assert.equal(changedCart.statusCode, 409, changedCart.body);

    const changedPayment = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("first-request-key"),
      payload: makeSalePayload(primary.branchId, product.id, 1200),
    });
    assert.equal(changedPayment.statusCode, 409, changedPayment.body);

    const crossEmployeeReplay = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: {
        authorization: `Bearer ${tellerToken}`,
        "idempotency-key": "first-request-key",
      },
      payload: basePayload,
    });
    assert.equal(crossEmployeeReplay.statusCode, 409, crossEmployeeReplay.body);

    const inaccessibleBranchId = randomUUID();
    db.prepare(
      `INSERT INTO branches (id, business_id, name, code, is_headquarters)
       VALUES (?, ?, 'Teller Inaccessible Branch', 'LOCKED', 0)`,
    ).run(inaccessibleBranchId, primary.businessId);

    const tellerSale = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: {
        authorization: `Bearer ${tellerToken}`,
        "idempotency-key": "teller-branch-reuse-key",
      },
      payload: basePayload,
    });
    assert.equal(tellerSale.statusCode, 201, tellerSale.body);

    const changedInaccessibleBranch = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: {
        authorization: `Bearer ${tellerToken}`,
        "idempotency-key": "teller-branch-reuse-key",
      },
      payload: { ...basePayload, branchId: inaccessibleBranchId },
    });
    assert.equal(
      changedInaccessibleBranch.statusCode,
      409,
      changedInaccessibleBranch.body,
    );

    const invalidCustomerId = randomUUID();
    const changedInvalidCustomer = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("first-request-key"),
      payload: { ...basePayload, customerId: invalidCustomerId },
    });
    assert.equal(changedInvalidCustomer.statusCode, 409, changedInvalidCustomer.body);

    const newInvalidBranch = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: {
        authorization: `Bearer ${tellerToken}`,
        "idempotency-key": "new-invalid-branch-key",
      },
      payload: { ...basePayload, branchId: inaccessibleBranchId },
    });
    assert.equal(newInvalidBranch.statusCode, 403, newInvalidBranch.body);

    const newInvalidCustomer = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("new-invalid-customer-key"),
      payload: { ...basePayload, customerId: invalidCustomerId },
    });
    assert.equal(newInvalidCustomer.statusCode, 404, newInvalidCustomer.body);

    // Build a second business fixture directly in this isolated database.
    const otherBusinessId = randomUUID();
    const otherBranchId = randomUUID();
    const otherUserId = randomUUID();
    const otherEmployeeId = randomUUID();
    const otherRoleId = randomUUID();
    db.prepare(
      "INSERT INTO businesses (id, name, currency) VALUES (?, ?, 'USD')",
    ).run(otherBusinessId, "Second Isolated Shop");
    db.prepare(
      `INSERT INTO branches (id, business_id, name, code, is_headquarters)
       VALUES (?, ?, 'Second Branch', 'SECOND', 1)`,
    ).run(otherBranchId, otherBusinessId);
    db.prepare(
      "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
    ).run(otherUserId, "second.owner", hashPassword("Isolated-Second-Password-123!"));
    db.prepare(
      `INSERT INTO employees (id, business_id, user_id, employee_number, full_name)
       VALUES (?, ?, ?, 'EMP-001', 'Second Owner')`,
    ).run(otherEmployeeId, otherBusinessId, otherUserId);
    db.prepare(
      `INSERT INTO roles (id, business_id, name, slug, is_system)
       VALUES (?, ?, 'Owner', 'owner', 1)`,
    ).run(otherRoleId, otherBusinessId);
    db.prepare(
      `INSERT INTO role_permissions (role_id, permission_code)
       SELECT ?, code FROM permissions`,
    ).run(otherRoleId);
    db.prepare(
      "INSERT INTO employee_roles (employee_id, role_id) VALUES (?, ?)",
    ).run(otherEmployeeId, otherRoleId);
    db.prepare(
      `INSERT INTO employee_branch_access (employee_id, branch_id, is_primary)
       VALUES (?, ?, 1)`,
    ).run(otherEmployeeId, otherBranchId);

    const otherProduct = createProduct(db, otherBusinessId, {
      name: "Second Business Widget",
      sku: "SECOND-WIDGET",
      unit: "each",
      costPriceMinor: 200,
      sellingPriceMinor: 500,
      trackStock: true,
    });
    const otherAuth: AuthContext = {
      sessionId: randomUUID(),
      userId: otherUserId,
      employeeId: otherEmployeeId,
      businessId: otherBusinessId,
      username: "second.owner",
      fullName: "Second Owner",
      roles: ["owner"],
      permissions: ["*"],
      branchIds: [otherBranchId],
    };
    receiveStock(db, otherAuth, {
      branchId: otherBranchId,
      productId: otherProduct.id,
      quantity: 100,
    });

    const otherLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        username: "second.owner",
        password: "Isolated-Second-Password-123!",
      },
    });
    assert.equal(otherLogin.statusCode, 200, otherLogin.body);
    const otherSale = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: {
        authorization: `Bearer ${otherLogin.json().token}`,
        "idempotency-key": "first-request-key",
      },
      payload: makeSalePayload(otherBranchId, otherProduct.id),
    });
    assert.equal(otherSale.statusCode, 201, otherSale.body);

    // Parallel HTTP requests with the same key yield one insert and one replay.
    const parallelKey = "simultaneous-request-key";
    const parallelPayload = makeSalePayload(primary.branchId, product.id);
    const salesBeforeParallel = count("sales", primary.businessId);
    const stockBeforeParallel = (
      db
        .prepare(
          "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
        )
        .get(primary.branchId, product.id) as { quantity: number }
    ).quantity;
    const parallel = await Promise.all(
      Array.from({ length: 2 }, () =>
        app.inject({
          method: "POST",
          url: "/api/sales",
          headers: keyedHeaders(parallelKey),
          payload: parallelPayload,
        }),
      ),
    );
    assert.deepEqual(
      parallel.map((response) => response.statusCode).sort(),
      [200, 201],
    );
    assert.equal(count("sales", primary.businessId), salesBeforeParallel + 1);
    assert.equal(
      (
        db
          .prepare(
            "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
          )
          .get(primary.branchId, product.id) as { quantity: number }
      ).quantity,
      stockBeforeParallel - 2,
    );

    // Keyless requests keep creating sales as before.
    const noKeyOne = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers,
      payload: basePayload,
    });
    const noKeyTwo = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers,
      payload: basePayload,
    });
    assert.equal(noKeyOne.statusCode, 201, noKeyOne.body);
    assert.equal(noKeyTwo.statusCode, 201, noKeyTwo.body);
    assert.notEqual(noKeyOne.json().data.id, noKeyTwo.json().data.id);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM sales WHERE business_id = ? AND idempotency_key IS NULL",
        )
        .get(primary.businessId)
        .count,
      2,
    );

    // A sale that fails after the sale row insert rolls the key and stock back.
    const beforeFailedSale = count("sales", primary.businessId);
    const beforeFailedMovements = (
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM stock_movements
           WHERE branch_id = ? AND product_id = ? AND movement_type = 'sale'`,
        )
        .get(primary.branchId, product.id) as { count: number }
    ).count;
    const beforeFailedStock = (
      db
        .prepare(
          "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
        )
        .get(primary.branchId, product.id) as { quantity: number }
    ).quantity;
    const failed = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("failed-sale-retry-key"),
      payload: {
        ...basePayload,
        items: [{ productId: product.id, quantity: 1000 }],
        payments: [{ method: "cash", amountMinor: 500000 }],
      },
    });
    assert.equal(failed.statusCode, 409, failed.body);
    assert.equal(count("sales", primary.businessId), beforeFailedSale);
    assert.equal(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM sales WHERE business_id = ? AND idempotency_key = ?",
          )
          .get(primary.businessId, "failed-sale-retry-key") as { count: number }
      ).count,
      0,
    );
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM stock_movements
             WHERE branch_id = ? AND product_id = ? AND movement_type = 'sale'`,
          )
          .get(primary.branchId, product.id) as { count: number }
      ).count,
      beforeFailedMovements,
    );
    assert.equal(
      (
        db
          .prepare(
            "SELECT quantity_on_hand AS quantity FROM branch_inventory WHERE branch_id = ? AND product_id = ?",
          )
          .get(primary.branchId, product.id) as { quantity: number }
      ).quantity,
      beforeFailedStock,
    );
    const retryAfterFailure = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: keyedHeaders("failed-sale-retry-key"),
      payload: basePayload,
    });
    assert.equal(retryAfterFailure.statusCode, 201, retryAfterFailure.body);

    const invalidKey = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: { ...headers, "idempotency-key": " " },
      payload: basePayload,
    });
    assert.equal(invalidKey.statusCode, 400, invalidKey.body);

    const oversizedKey = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: { ...headers, "idempotency-key": "k".repeat(129) },
      payload: basePayload,
    });
    assert.equal(oversizedKey.statusCode, 400, oversizedKey.body);

    console.log("PASS: isolated sales idempotency integration tests");
  } finally {
    await app.close();
    db.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
