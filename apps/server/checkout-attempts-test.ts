import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";

import { runMigrations } from "./src/database/migrate.js";
import { hashPassword } from "./src/modules/authentication/password.js";
import { registerAuthenticationRoutes } from "./src/modules/authentication/routes.js";
import { registerOnboardingRoutes } from "./src/modules/onboarding/routes.js";
import { createProduct } from "./src/modules/products/service.js";
import { receiveStock } from "./src/modules/inventory/service.js";
import { registerSalesRoutes } from "./src/modules/sales/routes.js";
import type { AuthContext } from "./src/middleware/authenticate.js";
import { salesHttpFailure } from "../desktop/src/shared/sales-ipc.ts";

const tempDirectory = mkdtempSync(join(tmpdir(), "retaily-checkout-attempts-"));
const databasePath = join(tempDirectory, "isolated.sqlite");
let db = new Database(databasePath);
let app: FastifyInstance | null = null;

function configureDb() {
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  runMigrations(db);
}

async function createApp() {
  const server = Fastify({ logger: false });
  registerOnboardingRoutes(server, db);
  registerAuthenticationRoutes(server, db);
  registerSalesRoutes(server, db);
  await server.ready();
  return server;
}

function makePayload(branchId: string, productId: string) {
  return {
    branchId,
    items: [{ productId, quantity: 2 }],
    payments: [{ method: "cash", amountMinor: 1000 }],
    notes: "Durable checkout recovery test",
  };
}

async function login(username: string, password: string) {
  const response = await app!.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().token as string;
}

async function main() {
  configureDb();
  app = await createApp();
  try {
    const owners = [] as Array<{ businessId: string; branchId: string; ownerId: string; username: string; password: string }>;
    for (const suffix of ["one"]) {
      const username = `attempt.owner.${suffix}`;
      const password = `Isolated-Attempt-${suffix}-Password-123!`;
      const response = await app.inject({
        method: "POST",
        url: "/api/onboarding/owner",
        payload: {
          businessName: `Attempt Shop ${suffix}`,
          ownerName: `Attempt Owner ${suffix}`,
          username,
          password,
          branchName: `Branch ${suffix}`,
          branchCode: `BR-${suffix.toUpperCase()}`,
          registerName: "Register One",
          registerCode: "REG1",
          currency: "USD",
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      const data = response.json();
      owners.push({ ...data, username, password });
    }

    const primary = owners[0];
    const secondary = {
      businessId: randomUUID(),
      branchId: randomUUID(),
      ownerId: randomUUID(),
      username: "attempt.owner.two",
      password: "Isolated-Attempt-two-Password-123!",
    };
    const secondaryUserId = randomUUID();
    const secondaryRoleId = randomUUID();
    db.prepare("INSERT INTO businesses (id, name, currency) VALUES (?, ?, 'USD')")
      .run(secondary.businessId, "Attempt Shop two");
    db.prepare(`INSERT INTO branches (id, business_id, name, code, is_headquarters)
      VALUES (?, ?, 'Branch two', 'BR-TWO', 1)`)
      .run(secondary.branchId, secondary.businessId);
    db.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
      .run(secondaryUserId, secondary.username, hashPassword(secondary.password));
    db.prepare(`INSERT INTO employees (id, business_id, user_id, employee_number, full_name)
      VALUES (?, ?, ?, 'EMP-SEC-1', 'Attempt Owner two')`)
      .run(secondary.ownerId, secondary.businessId, secondaryUserId);
    db.prepare(`INSERT INTO roles (id, business_id, name, slug, is_system)
      VALUES (?, ?, 'Owner', 'owner', 1)`)
      .run(secondaryRoleId, secondary.businessId);
    db.prepare(`INSERT INTO role_permissions (role_id, permission_code)
      SELECT ?, code FROM permissions`)
      .run(secondaryRoleId);
    db.prepare("INSERT INTO employee_roles (employee_id, role_id) VALUES (?, ?)")
      .run(secondary.ownerId, secondaryRoleId);
    db.prepare(`INSERT INTO employee_branch_access (employee_id, branch_id, is_primary)
      VALUES (?, ?, 1)`)
      .run(secondary.ownerId, secondary.branchId);
    const primaryToken = await login(primary.username, primary.password);
    const secondaryToken = await login(secondary.username, secondary.password);
    const ownerAuth: AuthContext = {
      sessionId: randomUUID(),
      userId: randomUUID(),
      employeeId: primary.ownerId,
      businessId: primary.businessId,
      username: primary.username,
      fullName: "Attempt Owner one",
      roles: ["owner"],
      permissions: ["*"],
      branchIds: [primary.branchId],
    };
    const product = createProduct(db, primary.businessId, {
      name: "Attempt Test Widget",
      sku: "ATTEMPT-WIDGET",
      unit: "each",
      costPriceMinor: 200,
      sellingPriceMinor: 500,
      trackStock: true,
    });
    receiveStock(db, ownerAuth, {
      branchId: primary.branchId,
      productId: product.id,
      quantity: 10,
    });

    const primaryHeaders = {
      authorization: `Bearer ${primaryToken}`,
    };
    const withKey = (key: string) => ({
      ...primaryHeaders,
      "idempotency-key": key,
    });
    const payload = makePayload(primary.branchId, product.id);
    const recoveryKey = "recover-after-restart";

    const invalidAttempt = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: withKey("invalid-attempt-key"),
      payload: { ...payload, items: [] },
    });
    assert.equal(invalidAttempt.statusCode, 400);
    assert.equal(invalidAttempt.json().code, "VALIDATION_ERROR");

    const saved = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: withKey(recoveryKey),
      payload: {
        ...payload,
        cardNumber: "TEST-CARD-NUMBER-MUST-NOT-PERSIST",
        payments: [
          { ...payload.payments[0], cvv: "TEST-CVV-MUST-NOT-PERSIST" },
        ],
      },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().data.status, "pending");
    assert.deepEqual(saved.json().data.request, {
      ...payload,
      discount: { type: "none" },
      items: [{ ...payload.items[0], discount: { type: "none" } }],
    });
    assert.equal(JSON.stringify(saved.json().data.request).includes("TEST-CARD"), false);
    assert.equal(JSON.stringify(saved.json().data.request).includes("TEST-CVV"), false);

    const sameSave = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: withKey(recoveryKey),
      payload,
    });
    assert.equal(sameSave.statusCode, 200, sameSave.body);
    assert.deepEqual(sameSave.json().data, saved.json().data);

    const changedPayload = {
      ...payload,
      payments: [{ method: "cash", amountMinor: 1100 }],
    };
    const changedPendingSave = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: withKey(recoveryKey),
      payload: changedPayload,
    });
    assert.equal(changedPendingSave.statusCode, 409);
    assert.equal(changedPendingSave.json().code, "CHECKOUT_ATTEMPT_CONFLICT");
    const unchangedPending = await app.inject({
      method: "GET",
      url: `/api/sales/checkout-attempts/by-key?idempotencyKey=${recoveryKey}`,
      headers: primaryHeaders,
    });
    assert.deepEqual(unchangedPending.json().data, saved.json().data);

    const concurrentKey = "concurrent-immutable-attempt";
    const concurrentPayloads = [payload, changedPayload];
    const concurrentSaves = await Promise.all(
      concurrentPayloads.map((body) =>
        app!.inject({
          method: "POST",
          url: "/api/sales/checkout-attempts",
          headers: withKey(concurrentKey),
          payload: body,
        }),
      ),
    );
    assert.deepEqual(
      concurrentSaves.map((response) => response.statusCode).sort(),
      [200, 409],
    );
    const concurrentWinner = concurrentSaves.find((response) => response.statusCode === 200)!;
    const concurrentStored = await app.inject({
      method: "GET",
      url: `/api/sales/checkout-attempts/by-key?idempotencyKey=${concurrentKey}`,
      headers: primaryHeaders,
    });
    assert.deepEqual(concurrentStored.json().data.request, concurrentWinner.json().data.request);

    const pendingList = await app.inject({
      method: "GET",
      url: "/api/sales/checkout-attempts",
      headers: primaryHeaders,
    });
    assert.equal(pendingList.statusCode, 200, pendingList.body);
    assert.equal(
      pendingList.json().data.some((attempt: { idempotencyKey: string }) => attempt.idempotencyKey === recoveryKey),
      true,
    );

    // A different employee cannot list or retrieve this employee's attempt.
    const tellerUserId = randomUUID();
    const tellerEmployeeId = randomUUID();
    const tellerRole = db
      .prepare("SELECT id FROM roles WHERE business_id = ? AND slug = 'teller'")
      .get(primary.businessId) as { id: string };
    db.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
      .run(tellerUserId, "attempt.teller", hashPassword("Isolated-Teller-Password-123!"));
    db.prepare(`INSERT INTO employees (id, business_id, user_id, employee_number, full_name)
      VALUES (?, ?, ?, 'EMP-ATT-1', 'Attempt Teller')`)
      .run(tellerEmployeeId, primary.businessId, tellerUserId);
    db.prepare("INSERT INTO employee_roles (employee_id, role_id) VALUES (?, ?)")
      .run(tellerEmployeeId, tellerRole.id);
    db.prepare(`INSERT INTO employee_branch_access (employee_id, branch_id, is_primary)
      VALUES (?, ?, 1)`)
      .run(tellerEmployeeId, primary.branchId);
    const tellerToken = await login("attempt.teller", "Isolated-Teller-Password-123!");
    const tellerHeaders = { authorization: `Bearer ${tellerToken}` };
    const tellerPending = await app.inject({
      method: "GET",
      url: "/api/sales/checkout-attempts",
      headers: tellerHeaders,
    });
    assert.equal(tellerPending.statusCode, 200, tellerPending.body);
    assert.equal(tellerPending.json().data.length, 0);
    const tellerLookup = await app.inject({
      method: "GET",
      url: `/api/sales/checkout-attempts/by-key?idempotencyKey=${recoveryKey}`,
      headers: tellerHeaders,
    });
    assert.equal(tellerLookup.statusCode, 404);

    // The same key is independent in another authenticated business.
    const secondaryAttempt = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: {
        authorization: `Bearer ${secondaryToken}`,
        "idempotency-key": recoveryKey,
      },
      payload: { ...payload, branchId: secondary.branchId },
    });
    assert.equal(secondaryAttempt.statusCode, 200, secondaryAttempt.body);
    assert.equal(secondaryAttempt.json().data.status, "pending");
    const secondaryAttemptLookup = await app.inject({
      method: "GET",
      url: `/api/sales/checkout-attempts/by-key?idempotencyKey=${recoveryKey}`,
      headers: { authorization: `Bearer ${secondaryToken}` },
    });
    assert.equal(secondaryAttemptLookup.statusCode, 200);
    assert.equal(secondaryAttemptLookup.json().data.request.branchId, secondary.branchId);
    const crossBusinessLookup = await app.inject({
      method: "GET",
      url: "/api/sales/checkout-attempts/by-key?idempotencyKey=primary-only-key",
      headers: { authorization: `Bearer ${secondaryToken}` },
    });
    assert.equal(crossBusinessLookup.statusCode, 404);

    // Simulate an application/server restart by closing and reopening the same
    // temporary SQLite file and rebuilding Fastify around that connection.
    await app.close();
    app = null;
    db.close();
    db = new Database(databasePath);
    configureDb();
    app = await createApp();

    const recoveredList = await app.inject({
      method: "GET",
      url: "/api/sales/checkout-attempts",
      headers: primaryHeaders,
    });
    assert.equal(recoveredList.statusCode, 200, recoveredList.body);
    assert.equal(
      recoveredList.json().data.some((attempt: { idempotencyKey: string; request: unknown }) =>
        attempt.idempotencyKey === recoveryKey && JSON.stringify(attempt.request) === JSON.stringify(saved.json().data.request)),
      true,
    );

    const completed = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: withKey(recoveryKey),
      payload,
    });
    assert.equal(completed.statusCode, 201, completed.body);
    const sale = completed.json().data;
    const completedAttempt = await app.inject({
      method: "GET",
      url: `/api/sales/checkout-attempts/by-key?idempotencyKey=${recoveryKey}`,
      headers: primaryHeaders,
    });
    assert.equal(completedAttempt.statusCode, 200, completedAttempt.body);
    assert.equal(completedAttempt.json().data.status, "completed");
    assert.equal(completedAttempt.json().data.saleId, sale.id);
    assert.deepEqual(completedAttempt.json().data.sale, sale);

    const replay = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: withKey(recoveryKey),
      payload,
    });
    assert.equal(replay.statusCode, 200, replay.body);
    assert.deepEqual(replay.json().data, sale);
    const replayAttempt = await app.inject({
      method: "GET",
      url: `/api/sales/checkout-attempts/by-key?idempotencyKey=${recoveryKey}`,
      headers: primaryHeaders,
    });
    assert.equal(replayAttempt.json().data.status, "completed");
    assert.deepEqual(replayAttempt.json().data.sale, sale);

    const completedModification = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: withKey(recoveryKey),
      payload: changedPayload,
    });
    assert.equal(completedModification.statusCode, 409);
    assert.equal(completedModification.json().code, "CHECKOUT_ATTEMPT_CONFLICT");
    const newAttempt = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: withKey("new-key-after-immutable-attempt"),
      payload: changedPayload,
    });
    assert.equal(newAttempt.statusCode, 200, newAttempt.body);
    assert.equal(newAttempt.json().data.status, "pending");

    const conflict = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: withKey(recoveryKey),
      payload: { ...payload, payments: [{ method: "cash", amountMinor: 1200 }] },
    });
    assert.equal(conflict.statusCode, 409);
    assert.equal(conflict.json().code, "SALE_IDEMPOTENCY_CONFLICT");
    assert.equal("data" in conflict.json(), false);

    // The renderer sales service preserves the structured 409 envelope.
    const previousWindow = (globalThis as unknown as { window?: unknown }).window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        retaily: {
          sales: {
            createSale: async () => ({
              ok: false,
              error: salesHttpFailure(conflict.statusCode, conflict.json()),
            }),
          },
        },
      },
    });
    try {
      const rendererSales = await import("../desktop/src/renderer/src/services/sales.service.ts");
      await assert.rejects(
        rendererSales.salesService.createSale(payload, recoveryKey),
        (error: unknown) => {
          assert.equal((error as { status: number }).status, 409);
          assert.equal((error as { code: string }).code, "SALE_IDEMPOTENCY_CONFLICT");
          assert.equal((error as { outcome: string }).outcome, "rejected");
          return true;
        },
      );
    } finally {
      if (previousWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
      else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    }

    // A stock failure rolls sale writes back while preserving its saved attempt.
    const failedKey = "attempt-stock-failure";
    const failedPayload = {
      ...payload,
      items: [{ productId: product.id, quantity: 100 }],
      payments: [{ method: "cash", amountMinor: 50000 }],
    };
    const failedAttemptSave = await app.inject({
      method: "POST",
      url: "/api/sales/checkout-attempts",
      headers: withKey(failedKey),
      payload: failedPayload,
    });
    assert.equal(failedAttemptSave.statusCode, 200, failedAttemptSave.body);
    const failedSale = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: withKey(failedKey),
      payload: failedPayload,
    });
    assert.equal(failedSale.statusCode, 409, failedSale.body);
    const recoverable = await app.inject({
      method: "GET",
      url: `/api/sales/checkout-attempts/by-key?idempotencyKey=${failedKey}`,
      headers: primaryHeaders,
    });
    assert.equal(recoverable.statusCode, 200, recoverable.body);
    assert.equal(recoverable.json().data.status, "pending");
    assert.equal(recoverable.json().data.saleId, null);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS count FROM sales WHERE business_id = ? AND idempotency_key = ?")
        .get(primary.businessId, failedKey) as { count: number }).count,
      0,
    );

    // Legacy keyless creation is still accepted without a durable attempt.
    const keyless = await app.inject({
      method: "POST",
      url: "/api/sales",
      headers: primaryHeaders,
      payload,
    });
    assert.equal(keyless.statusCode, 201, keyless.body);

    console.log("PASS: isolated durable checkout attempt and structured error tests");
  } finally {
    if (app) await app.close();
    db.close();
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
