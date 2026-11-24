import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import {
  createPrinterDiscoveryService,
} from "./hardware/printer-discovery.js";
import {
  createFilePrinterConfigurationStorage,
  createPrinterConfigurationService,
  createPrinterConfigurationStore,
} from "./hardware/printer-configuration.js";
import {
  isTrustedPrinterIpcSender,
  registerPrinterIpcHandlers,
} from "./hardware/printer-ipc.js";
import {
  salesLocalFailure,
} from "../shared/sales-ipc.js";
import { requestSales } from "../shared/sales-transport.js";

let mainWindow: BrowserWindow | null = null;
let sessionToken: string | null = null;

const printerDiscovery = createPrinterDiscoveryService({
  getPrinters: () => {
    if (!mainWindow) throw new Error("Printer discovery is unavailable.");
    return mainWindow.webContents.getPrintersAsync();
  },
});

const SERVER_URL = "http://127.0.0.1:4317";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateIdempotencyKey(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("A valid Idempotency-Key is required.");
  }

  const key = value.trim();

  if (key.length < 1 || key.length > 128 || !/^[\x21-\x7E]+$/.test(key)) {
    throw new Error("A valid Idempotency-Key is required.");
  }

  return key;
}

async function salesRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<import("../shared/sales-ipc.js").SalesIpcResult<T>> {
  return requestSales<T>(`${SERVER_URL}${endpoint}`, options, sessionToken);
}

function validateDate(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid sales query field: ${field}.`);
  }

  return value;
}

function buildSalesListEndpoint(value: unknown = {}) {
  if (!isRecord(value)) {
    throw new Error("Invalid sales list query.");
  }

  const allowedFields = new Set([
    "branchId",
    "customerId",
    "employeeId",
    "status",
    "search",
    "dateFrom",
    "dateTo",
    "page",
    "limit",
  ]);

  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new Error("Unsupported sales list query field.");
  }

  const query = new URLSearchParams();

  for (const field of ["branchId", "customerId", "employeeId"] as const) {
    const fieldValue = value[field];

    if (fieldValue === undefined) continue;

    if (typeof fieldValue !== "string" || !UUID_PATTERN.test(fieldValue)) {
      throw new Error(`Invalid sales query field: ${field}.`);
    }

    query.set(field, fieldValue);
  }

  if (value.status !== undefined) {
    if (value.status !== "completed" && value.status !== "voided") {
      throw new Error("Invalid sales query field: status.");
    }

    query.set("status", value.status);
  }

  if (value.search !== undefined) {
    if (typeof value.search !== "string" || value.search.length > 100) {
      throw new Error("Invalid sales query field: search.");
    }

    query.set("search", value.search);
  }

  for (const field of ["dateFrom", "dateTo"] as const) {
    const fieldValue = value[field];

    if (fieldValue !== undefined) {
      query.set(field, validateDate(fieldValue, field));
    }
  }

  for (const field of ["page", "limit"] as const) {
    const fieldValue = value[field];
    const maximum = field === "page" ? Number.MAX_SAFE_INTEGER : 100;

    if (fieldValue !== undefined) {
      if (
        typeof fieldValue !== "number" ||
        !Number.isInteger(fieldValue) ||
        fieldValue < 1 ||
        fieldValue > maximum
      ) {
        throw new Error(`Invalid sales query field: ${field}.`);
      }

      query.set(field, String(fieldValue));
    }
  }

  const queryString = query.toString();
  return `/api/sales${queryString ? `?${queryString}` : ""}`;
}

async function serverRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set("Content-Type", "application/json");

  if (authenticated) {
    if (!sessionToken) {
      throw new Error("You are not logged in.");
    }

    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  const response = await fetch(`${SERVER_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = isRecord(data) && typeof data.error === "string"
      ? data.error
      : `Server request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return data as T;
}

function registerIpcHandlers() {
  const printerConfiguration = createPrinterConfigurationService(
    createPrinterConfigurationStore(
      createFilePrinterConfigurationStorage(path.join(app.getPath("userData"), "hardware")),
    ),
    printerDiscovery,
  );

  registerPrinterIpcHandlers(ipcMain, printerDiscovery, printerConfiguration, (event) =>
    isTrustedPrinterIpcSender(
      event,
      mainWindow?.webContents,
      process.env.ELECTRON_RENDERER_URL,
      path.resolve(__dirname, "../renderer/index.html"),
    ),
  );

  ipcMain.handle("app:get-version", () => app.getVersion());

  ipcMain.handle("server:health", async () => {
    try {
      return await serverRequest<{
        status: string;
        application: string;
        service: string;
        database: string;
        schemaVersion: number;
        onboardingRequired: boolean;
        timestamp: string;
      }>("/health");
    } catch {
      return {
        status: "offline",
        message: "Could not connect to Retaily server",
      };
    }
  });

  ipcMain.handle(
    "auth:login",
    async (
      _event,
      credentials: {
        username: string;
        password: string;
      },
    ) => {
      const result = await serverRequest<{
        success: boolean;
        token: string;
        expiresAt: string;
        user: {
          id: string;
          username: string;
          employeeId: string;
          businessId: string;
          fullName: string;
        };
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });

      sessionToken = result.token;

      return {
        success: result.success,
        expiresAt: result.expiresAt,
        user: result.user,
      };
    },
  );

  ipcMain.handle("auth:me", async () => {
    return serverRequest<{
      userId: string;
      username: string;
      employeeId: string;
      businessId: string;
      fullName: string;
      roles: string[];
      permissions: string[];
      branchIds: string[];
    }>("/api/auth/me", {}, true);
  });

  ipcMain.handle("auth:logout", async () => {
    try {
      if (sessionToken) {
        await serverRequest("/api/auth/logout", { method: "POST" }, true);
      }
    } finally {
      sessionToken = null;
    }

    return { success: true };
  });

  ipcMain.handle(
    "onboarding:create-owner",
    async (
      _event,
      details: {
        businessName: string;
        ownerName: string;
        username: string;
        password: string;
        email?: string;
        phone?: string;
        branchName: string;
        branchCode: string;
        registerName: string;
        registerCode: string;
        currency: string;
      },
    ) => {
      return serverRequest<{
        success: boolean;
        businessId: string;
        branchId: string;
        registerId: string;
        ownerId: string;
      }>("/api/onboarding/owner", {
        method: "POST",
        body: JSON.stringify(details),
      });
    },
  );

  ipcMain.handle("onboarding:get-status", async () => {
    return serverRequest<{
      required: boolean;
    }>("/api/onboarding/status");
  });

  // ==========================================
  // BRANCHES
  // Fixed authenticated listing; renderer cannot choose a path or method.
  // ==========================================

  ipcMain.handle("branches:list", async () => {
    return serverRequest<{
      success: true;
      data: Array<{
        id: string;
        name: string;
        code: string;
        isHeadquarters: boolean;
      }>;
    }>("/api/branches", { method: "GET" }, true);
  });

  // ==========================================
  // PRODUCTS
  // ==========================================

  ipcMain.handle(
    "products:request",
    async (
      _event,
      request: {
        method: "GET" | "POST" | "PATCH";
        endpoint: string;
        body?: unknown;
      },
    ) => {
      const allowedMethods = ["GET", "POST", "PATCH"];

      if (!allowedMethods.includes(request.method)) {
        throw new Error("Unsupported products request.");
      }

      if (
        typeof request.endpoint !== "string" ||
        !request.endpoint.startsWith("/api/products") ||
        request.endpoint.includes("..") ||
        request.endpoint.includes("://")
      ) {
        throw new Error("Invalid products endpoint.");
      }

      return serverRequest(
        request.endpoint,
        {
          method: request.method,
          ...(request.body !== undefined
            ? { body: JSON.stringify(request.body) }
            : {}),
        },
        true,
      );
    },
  );

  // ==========================================
  // SALES
  // Fixed operations only; renderer cannot choose an endpoint or method.
  // ==========================================

  ipcMain.handle(
    "sales:create",
    async (_event, input: unknown, rawIdempotencyKey: unknown) => {
      if (!isRecord(input)) {
        return { ok: false, error: salesLocalFailure("Invalid sale request.") };
      }

      let idempotencyKey: string;
      try {
        idempotencyKey = validateIdempotencyKey(rawIdempotencyKey);
      } catch {
        return {
          ok: false,
          error: salesLocalFailure(
            "A valid Idempotency-Key is required.",
            "INVALID_IDEMPOTENCY_KEY",
          ),
        };
      }

      return salesRequest("/api/sales", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(input),
      });
    },
  );

  ipcMain.handle("sales:list", async (_event, query: unknown = {}) => {
    try {
      return salesRequest(buildSalesListEndpoint(query), { method: "GET" });
    } catch {
      return { ok: false, error: salesLocalFailure("Invalid sales list query.") };
    }
  });

  ipcMain.handle("sales:get", async (_event, rawId: unknown) => {
    if (typeof rawId !== "string" || !UUID_PATTERN.test(rawId)) {
      return { ok: false, error: salesLocalFailure("Invalid sale ID.") };
    }

    return salesRequest(
      `/api/sales/${encodeURIComponent(rawId)}`,
      { method: "GET" },
    );
  });

  ipcMain.handle(
    "sales:attempt:save",
    async (_event, input: unknown, rawIdempotencyKey: unknown) => {
      if (!isRecord(input)) {
        return { ok: false, error: salesLocalFailure("Invalid checkout attempt request.") };
      }
      let idempotencyKey: string;
      try {
        idempotencyKey = validateIdempotencyKey(rawIdempotencyKey);
      } catch {
        return {
          ok: false,
          error: salesLocalFailure(
            "A valid Idempotency-Key is required.",
            "INVALID_IDEMPOTENCY_KEY",
          ),
        };
      }
      return salesRequest("/api/sales/checkout-attempts", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(input),
      });
    },
  );

  ipcMain.handle("sales:attempt:list-pending", async () =>
    salesRequest("/api/sales/checkout-attempts", { method: "GET" }),
  );

  ipcMain.handle("sales:attempt:get", async (_event, rawIdempotencyKey: unknown) => {
    let idempotencyKey: string;
    try {
      idempotencyKey = validateIdempotencyKey(rawIdempotencyKey);
    } catch {
      return {
        ok: false,
        error: salesLocalFailure(
          "A valid Idempotency-Key is required.",
          "INVALID_IDEMPOTENCY_KEY",
        ),
      };
    }
    const query = new URLSearchParams({ idempotencyKey });
    return salesRequest(
      `/api/sales/checkout-attempts/by-key?${query.toString()}`,
      { method: "GET" },
    );
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#1A2332",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;

  window.once("ready-to-show", () => {
    window.maximize();
    window.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  window.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
