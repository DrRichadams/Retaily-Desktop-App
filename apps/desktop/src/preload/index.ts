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
};

contextBridge.exposeInMainWorld("retaily", retailyAPI);
