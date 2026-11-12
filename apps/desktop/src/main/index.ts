import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;
let sessionToken: string | null = null;

const SERVER_URL = "http://127.0.0.1:4317";

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
    throw new Error(data.error || `Server request failed (${response.status})`);
  }

  return data as T;
}

function registerIpcHandlers() {
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
}

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
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
