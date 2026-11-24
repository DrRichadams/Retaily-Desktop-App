import { contextBridge, ipcRenderer } from "electron";

const retailyAPI = {
  getVersion: () => ipcRenderer.invoke("app:get-version"),

  getServerHealth: () => ipcRenderer.invoke("server:health"),

  login: (credentials: { username: string; password: string }) =>
    ipcRenderer.invoke("auth:login", credentials),

  getCurrentUser: () => ipcRenderer.invoke("auth:me"),

  getOnboardingStatus: () => ipcRenderer.invoke("onboarding:get-status"),

  logout: () => ipcRenderer.invoke("auth:logout"),

  createOwner: (details: {
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
  }) => ipcRenderer.invoke("onboarding:create-owner", details),

  branches: {
    list: () => ipcRenderer.invoke("branches:list"),
  },

  products: {
    request: (request: {
      method: "GET" | "POST" | "PATCH";
      endpoint: string;
      body?: unknown;
    }) => ipcRenderer.invoke("products:request", request),
  },

  sales: {
    createSale: (input: unknown, idempotencyKey: string) =>
      ipcRenderer.invoke("sales:create", input, idempotencyKey),

    listSales: (query?: unknown) =>
      ipcRenderer.invoke("sales:list", query),

    getSale: (id: string) => ipcRenderer.invoke("sales:get", id),

    saveCheckoutAttempt: (input: unknown, idempotencyKey: string) =>
      ipcRenderer.invoke("sales:attempt:save", input, idempotencyKey),

    listPendingCheckoutAttempts: () =>
      ipcRenderer.invoke("sales:attempt:list-pending"),

    getCheckoutAttempt: (idempotencyKey: string) =>
      ipcRenderer.invoke("sales:attempt:get", idempotencyKey),
  },

  hardware: {
    printers: {
      discover: () => ipcRenderer.invoke("hardware:printers:discover"),
      getDiscoveryStatus: () => ipcRenderer.invoke("hardware:printers:status"),
      readConfiguration: () => ipcRenderer.invoke("hardware:printers:config:read"),
      saveConfiguration: (configuration: { printerId: string; paperWidth: "58mm" | "80mm" }) =>
        ipcRenderer.invoke("hardware:printers:config:save", configuration),
    },
  },
};

contextBridge.exposeInMainWorld("retaily", retailyAPI);
