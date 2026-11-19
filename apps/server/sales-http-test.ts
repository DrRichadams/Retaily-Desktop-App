import Fastify from "fastify";
import assert from "node:assert/strict";

import { openDatabase, closeDatabase } from "./src/database/connection.js";
import { registerAuthenticationRoutes } from "./src/modules/authentication/routes.js";
import { registerSalesRoutes } from "./src/modules/sales/routes.js";

const EXISTING_SALE_ID = "25bb8cc9-5231-4f67-a96b-46477353bdfc";
const MAIN_BRANCH_ID = "64fbbb64-8cda-4568-aa61-ef65435430ee";
const TEST_PRODUCT_ID = "6d6a3448-0ab0-460d-a69a-5428a210b017";

function pass(message: string) {
  console.log(`PASS: ${message}`);
}

async function main() {
  const db = openDatabase();
  const app = Fastify({ logger: false });

  let token: string | null = null;

  try {
    registerAuthenticationRoutes(app, db);
    registerSalesRoutes(app, db);

    await app.ready();

    console.log("\nRetaily Sales HTTP Integration Tests\n");

    // 1. Authentication protection
    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/sales",
    });

    assert.equal(unauthenticated.statusCode, 401);
    pass("Sales list rejects requests without a token");

    const invalidToken = await app.inject({
      method: "GET",
      url: "/api/sales",
      headers: {
        authorization: "Bearer invalid-test-token",
      },
    });

    assert.equal(invalidToken.statusCode, 401);
    pass("Sales list rejects invalid tokens");

    // 2. Real login
    const username = process.env.RETAILY_TEST_USERNAME;
    const password = process.env.RETAILY_TEST_PASSWORD;

    assert.ok(username, "RETAILY_TEST_USERNAME is missing");
    assert.ok(password, "RETAILY_TEST_PASSWORD is missing");

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username, password },
    });

    assert.equal(login.statusCode, 200, login.body);

    const loginData = login.json();

    assert.equal(loginData.success, true);
    assert.ok(loginData.token);

    token = loginData.token;

    pass("Owner can log in and receive a session token");

    const authHeaders = {
      authorization: `Bearer ${token}`,
    };

    // 3. Current-user endpoint
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: authHeaders,
    });

    assert.equal(me.statusCode, 200, me.body);
    assert.ok(me.json().userId);

    pass("Authenticated session returns the current user");

    // 4. Sales list
    const salesList = await app.inject({
      method: "GET",
      url: "/api/sales?page=1&limit=20",
      headers: authHeaders,
    });

    assert.equal(salesList.statusCode, 200, salesList.body);

    pass("Owner can retrieve the sales list through HTTP");

    // 5. Existing sale details
    if (!EXISTING_SALE_ID.startsWith("REPLACE_")) {
      const saleDetails = await app.inject({
        method: "GET",
        url: `/api/sales/${EXISTING_SALE_ID}`,
        headers: authHeaders,
      });

      assert.equal(saleDetails.statusCode, 200, saleDetails.body);
      assert.ok(saleDetails.json());

      pass("Owner can retrieve an existing sale through HTTP");
    } else {
      console.log("SKIP: Replace EXISTING_SALE_ID to test sale details");
    }

    // 6. Snapshot database state before testing sale validation
    const beforeSales = (
      db.prepare("SELECT COUNT(*) AS count FROM sales").get() as {
        count: number;
      }
    ).count;

    const beforeItems = (
      db.prepare("SELECT COUNT(*) AS count FROM sale_items").get() as {
        count: number;
      }
    ).count;

    const beforePayments = (
      db.prepare("SELECT COUNT(*) AS count FROM sale_payments").get() as {
        count: number;
      }
    ).count;

    const beforeStock = db
      .prepare(
        `SELECT quantity_on_hand
         FROM branch_inventory
         WHERE branch_id = ? AND product_id = ?`,
      )
      .get(MAIN_BRANCH_ID, TEST_PRODUCT_ID) as
      | { quantity_on_hand: number }
      | undefined;

    // 7. Attempt an underpaid sale.
    // The service should reject it before inserting or deducting stock.
    const underpaidSale = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: authHeaders,
      payload: {
        branchId: MAIN_BRANCH_ID,
        items: [
          {
            productId: TEST_PRODUCT_ID,
            quantity: 1,
          },
        ],
        payments: [
          {
            method: "cash",
            amountMinor: 1,
          },
        ],
      },
    });

    assert.equal(
      underpaidSale.statusCode,
      400,
      `Expected 400 for underpayment, received ${underpaidSale.statusCode}: ${underpaidSale.body}`,
    );

    pass("Underpaid sale is rejected through the HTTP endpoint");

    // 8. Confirm no permanent data changes occurred
    const afterSales = (
      db.prepare("SELECT COUNT(*) AS count FROM sales").get() as {
        count: number;
      }
    ).count;

    const afterItems = (
      db.prepare("SELECT COUNT(*) AS count FROM sale_items").get() as {
        count: number;
      }
    ).count;

    const afterPayments = (
      db.prepare("SELECT COUNT(*) AS count FROM sale_payments").get() as {
        count: number;
      }
    ).count;

    const afterStock = db
      .prepare(
        `SELECT quantity_on_hand
         FROM branch_inventory
         WHERE branch_id = ? AND product_id = ?`,
      )
      .get(MAIN_BRANCH_ID, TEST_PRODUCT_ID) as
      | { quantity_on_hand: number }
      | undefined;

    assert.equal(afterSales, beforeSales);
    assert.equal(afterItems, beforeItems);
    assert.equal(afterPayments, beforePayments);
    assert.equal(afterStock?.quantity_on_hand, beforeStock?.quantity_on_hand);

    pass("Rejected sale created no records and did not change stock");

    // 9. Logout and token revocation
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: authHeaders,
    });

    assert.equal(logout.statusCode, 200, logout.body);
    token = null;

    pass("Logout successfully revokes the session");

    const afterLogout = await app.inject({
      method: "GET",
      url: "/api/sales",
      headers: authHeaders,
    });

    assert.equal(afterLogout.statusCode, 401);

    pass("Revoked token cannot access sales endpoints");

    console.log("\nALL HTTP INTEGRATION TESTS PASSED.");
    console.log("No sales or inventory records were changed.");
  } finally {
    if (token) {
      try {
        const hash = await import("node:crypto").then(({ createHash }) =>
          createHash("sha256").update(token!).digest("hex"),
        );

        db.prepare(
          `UPDATE sessions SET revoked_at = ? WHERE token_hash = ?`,
        ).run(new Date().toISOString(), hash);
      } catch {
        // Preserve the original test failure if cleanup also fails.
      }
    }

    await app.close();
    closeDatabase();
  }
}

main().catch((error) => {
  console.error("\nHTTP INTEGRATION TEST FAILED:");
  console.error(error);
  process.exitCode = 1;
});
