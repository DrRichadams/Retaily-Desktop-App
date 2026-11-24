import type { IpcMain, IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HardwareError, normalizeHardwareError } from "../../../../../packages/hardware-core/src/index";
import {
  reconstructSafeHardwareError,
  validatePrinterDiscoveryResponse,
  validatePrinterDiscoveryStatus,
  type PrinterDiscoveryResponse,
  type PrinterDiscoveryStatus,
} from "./printer-discovery";
import {
  validatePrinterConfiguration,
  validatePrinterConfigurationInput,
  validatePrinterConfigurationReadResult,
  type PrinterConfiguration,
  type PrinterConfigurationReadResult,
} from "./printer-configuration";

export const PRINTER_IPC_CHANNELS = {
  discover: "hardware:printers:discover",
  status: "hardware:printers:status",
  configRead: "hardware:printers:config:read",
  configSave: "hardware:printers:config:save",
} as const;

export type PrinterIpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ReturnType<typeof normalizeHardwareError> };

export interface PrinterDiscoveryService {
  discover(): Promise<PrinterDiscoveryResponse>;
  getStatus(): PrinterDiscoveryStatus;
}

export interface PrinterConfigurationIpcService {
  read(): Promise<PrinterConfigurationReadResult>;
  save(input: unknown): Promise<PrinterConfiguration>;
}

export function isTrustedPrinterIpcSender(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  expectedSender: unknown,
  developmentRendererUrl: string | undefined,
  packagedRendererPath: string,
): boolean {
  if (event.sender !== expectedSender || !event.senderFrame ||
      event.senderFrame.top !== event.senderFrame) {
    return false;
  }

  try {
    const actual = new URL(event.senderFrame.url);
    if (developmentRendererUrl) {
      const expected = new URL(developmentRendererUrl);
      return (expected.protocol === "http:" || expected.protocol === "https:") &&
        actual.origin === expected.origin && actual.pathname === expected.pathname;
    }

    if (actual.protocol !== "file:") return false;
    // Avoid path traversal or URL-encoded lookalikes in file origins.
    const actualPath = path.resolve(fileURLToPath(actual)).replaceAll("/", "\\").toLowerCase();
    const expectedPath = path.resolve(packagedRendererPath).replaceAll("/", "\\").toLowerCase();
    return actualPath === expectedPath;
  } catch {
    return false;
  }
}

function invalidIpcPayload() {
  return {
    ok: false as const,
    error: new HardwareError("INVALID_CONFIGURATION", "rejected").toInfo(),
  };
}

/** Fixed channels only; sender, arguments, and service output are checked at runtime. */
export function registerPrinterIpcHandlers(
  ipc: Pick<IpcMain, "handle">,
  service: PrinterDiscoveryService,
  configuration: PrinterConfigurationIpcService,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  ipc.handle(PRINTER_IPC_CHANNELS.discover, async (event, ...args) => {
    if (!isTrustedSender(event) || args.length !== 0) return invalidIpcPayload();
    try {
      const response: unknown = await service.discover();
      const safe = validatePrinterDiscoveryResponse(response);
      return safe
        ? { ok: true, data: safe } satisfies PrinterIpcResult<PrinterDiscoveryResponse>
        : invalidIpcPayload();
    } catch {
      return { ok: false, error: normalizeHardwareError(new Error("Printer discovery failed")) };
    }
  });

  ipc.handle(PRINTER_IPC_CHANNELS.status, async (event, ...args) => {
    if (!isTrustedSender(event) || args.length !== 0) return invalidIpcPayload();
    try {
      const response: unknown = service.getStatus();
      const safe = validatePrinterDiscoveryStatus(response);
      return safe
        ? { ok: true, data: safe } satisfies PrinterIpcResult<PrinterDiscoveryStatus>
        : invalidIpcPayload();
    } catch {
      return { ok: false, error: normalizeHardwareError(new Error("Printer status unavailable")) };
    }
  });

  ipc.handle(PRINTER_IPC_CHANNELS.configRead, async (event, ...args) => {
    if (!isTrustedSender(event) || args.length !== 0) return invalidIpcPayload();
    try {
      const response: unknown = await configuration.read();
      const safe = validatePrinterConfigurationReadResult(response);
      return safe
        ? { ok: true, data: safe } satisfies PrinterIpcResult<PrinterConfigurationReadResult>
        : invalidIpcPayload();
    } catch {
      return { ok: false, error: normalizeHardwareError(new Error("Printer configuration unavailable")) };
    }
  });

  ipc.handle(PRINTER_IPC_CHANNELS.configSave, async (event, ...args) => {
    if (!isTrustedSender(event) || args.length !== 1) return invalidIpcPayload();
    const input = validatePrinterConfigurationInput(args[0]);
    if (!input) return invalidIpcPayload();
    try {
      const response: unknown = await configuration.save(input);
      const safe = validatePrinterConfiguration(response);
      return safe
        ? { ok: true, data: safe } satisfies PrinterIpcResult<PrinterConfiguration>
        : invalidIpcPayload();
    } catch (error) {
      return { ok: false, error: normalizeHardwareError(error) };
    }
  });
}

/** Exposes only a code/outcome reconstruction for use at other IPC boundaries. */
export function reconstructPrinterIpcError(value: unknown) {
  return reconstructSafeHardwareError(value);
}
