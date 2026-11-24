import { createHash } from "node:crypto";
import {
  HardwareError,
  normalizeHardwareError,
  type CapabilityState,
  type HardwareDiscoveryResult,
  type HardwareErrorInfo,
  type ReceiptPrinter,
  type ReceiptPrinterCapabilities,
} from "../../../../../packages/hardware-core/src/index";

export type PrinterDefaultStatus = "default" | "not-default" | "unknown";
export type PrinterQueueAcceptance = "accepting" | "not-accepting" | "unknown";

export interface InstalledPrinter extends ReceiptPrinter {
  /** Electron no longer reports the operating-system default printer. */
  defaultStatus: PrinterDefaultStatus;
  /** Queue submission metadata; it does not indicate physical printer readiness. */
  queueAcceptance: PrinterQueueAcceptance;
}

export type PrinterDiscoveryResponse =
  | (HardwareDiscoveryResult<InstalledPrinter> & {
      status: "complete" | "partial";
      skippedCount: number;
    })
  | {
      status: "unavailable";
      discoveredAt: string;
      devices: readonly [];
      skippedCount: 0;
      error: HardwareErrorInfo;
    };

export interface PrinterDiscoveryStatus {
  state: "not-run" | "complete" | "partial" | "unavailable";
  discoveredAt: string | null;
  deviceCount: number;
  skippedCount: number;
}

export interface PrinterQueueSource {
  getPrinters(): Promise<unknown>;
}

const capabilityUnknown = <T>(): CapabilityState<T> => ({
  status: "unknown",
  reasonCode: "not-reported",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (name.length === 0 || name.length > 256) return null;
  return name;
}

function isPathLikeName(value: string): boolean {
  return /^(?:\\\\|[a-z]:\\|file:|[a-z][a-z0-9+.-]*:\/\/)/i.test(value);
}

function isAcceptingJobs(options: unknown): boolean | null {
  if (!isRecord(options)) return null;
  const value = options["printer-is-accepting-jobs"];
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function toInstalledPrinter(value: unknown, observedAt: string): InstalledPrinter | null {
  if (!isRecord(value)) return null;
  const name = safeName(value.name);
  const rawDisplayName = safeName(value.displayName) ?? name;
  if (!name || !rawDisplayName) return null;
  const displayName = isPathLikeName(rawDisplayName)
    ? "Windows printer queue"
    : rawDisplayName;

  // Expose an opaque stable ID. The system queue name remains presentation data only;
  // this adapter does not pass renderer-provided names to commands or executables.
  const digest = createHash("sha256").update(name, "utf8").digest("hex");
  const acceptingJobs = isAcceptingJobs(value.options);
  const capabilities: ReceiptPrinterCapabilities = {
    paperWidths: capabilityUnknown(),
    cutting: capabilityUnknown(),
    cashDrawerTrigger: capabilityUnknown(),
    statusReporting: capabilityUnknown(),
    characterEncoding: capabilityUnknown(),
    rasterImagePrinting: capabilityUnknown(),
  };

  return {
    identity: {
      id: `windows-printer-queue:${digest}`,
      category: "receipt-printer",
      connection: "printer-queue",
      displayName,
    },
    // Electron queue metadata cannot establish physical printer readiness.
    availability: "unknown",
    capabilities,
    observedAt,
    defaultStatus: "unknown",
    queueAcceptance: acceptingJobs === false
      ? "not-accepting"
      : acceptingJobs === true ? "accepting" : "unknown",
  };
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

/** Maps untrusted Electron printer metadata to a minimal, renderer-safe discovery DTO. */
export function mapPrinterDiscovery(
  printers: unknown,
  discoveredAt = new Date().toISOString(),
): PrinterDiscoveryResponse {
  if (!isIsoTimestamp(discoveredAt)) {
    discoveredAt = new Date().toISOString();
  }

  if (!Array.isArray(printers)) {
    return {
      status: "unavailable",
      discoveredAt,
      devices: [],
      skippedCount: 0,
      error: normalizeHardwareError(new Error("Invalid printer discovery response")),
    };
  }

  const devices = printers
    .map((printer) => toInstalledPrinter(printer, discoveredAt))
    .filter((printer): printer is InstalledPrinter => printer !== null);
  const skippedCount = printers.length - devices.length;

  return {
    status: skippedCount > 0 ? "partial" : "complete",
    discoveredAt,
    devices,
    skippedCount,
  };
}

/** Testable service around Electron's supported WebContents.getPrintersAsync API. */
export function createPrinterDiscoveryService(
  source: PrinterQueueSource,
  now: () => string = () => new Date().toISOString(),
) {
  let lastStatus: PrinterDiscoveryStatus = {
    state: "not-run",
    discoveredAt: null,
    deviceCount: 0,
    skippedCount: 0,
  };

  return {
    async discover(): Promise<PrinterDiscoveryResponse> {
      let response: PrinterDiscoveryResponse;
      const discoveredAt = now();
      try {
        response = mapPrinterDiscovery(await source.getPrinters(), discoveredAt);
      } catch (error) {
        response = {
          status: "unavailable",
          discoveredAt: isIsoTimestamp(discoveredAt) ? discoveredAt : new Date().toISOString(),
          devices: [],
          skippedCount: 0,
          error: normalizeHardwareError(error),
        };
      }
      lastStatus = {
        state: response.status,
        discoveredAt: response.discoveredAt,
        deviceCount: response.devices.length,
        skippedCount: response.skippedCount,
      };
      return response;
    },
    getStatus(): PrinterDiscoveryStatus {
      return { ...lastStatus };
    },
  };
}

function isSafeHardwareErrorInfo(value: unknown): value is HardwareErrorInfo {
  if (!isRecord(value)) return false;
  const validCodes = new Set([
    "DEVICE_UNAVAILABLE", "DEVICE_DISCONNECTED", "UNSUPPORTED_CAPABILITY",
    "INVALID_CONFIGURATION", "PRINT_REJECTED", "PRINT_FAILED",
    "OUTCOME_UNKNOWN", "HARDWARE_ERROR_UNKNOWN",
  ]);
  return typeof value.code === "string" && validCodes.has(value.code) &&
    (value.outcome === "not-started" || value.outcome === "rejected" || value.outcome === "unknown");
}

/** Rebuilds a public error from code/outcome only, never forwarding a supplied message. */
export function reconstructSafeHardwareError(value: unknown): HardwareErrorInfo {
  if (!isSafeHardwareErrorInfo(value)) return normalizeHardwareError(value);
  return new HardwareError(value.code, value.outcome).toInfo();
}

export function validatePrinterDiscoveryResponse(value: unknown): PrinterDiscoveryResponse | null {
  if (!isRecord(value) || !isIsoTimestamp(value.discoveredAt) ||
      !Array.isArray(value.devices) || !Number.isSafeInteger(value.skippedCount) ||
      (value.skippedCount as number) < 0) return null;

  if (value.status === "unavailable") {
    if (value.devices.length !== 0 || value.skippedCount !== 0) return null;
    return {
      status: "unavailable",
      discoveredAt: value.discoveredAt,
      devices: [],
      skippedCount: 0,
      error: reconstructSafeHardwareError(value.error),
    };
  }
  if (value.status !== "complete" && value.status !== "partial") return null;

  const devices: InstalledPrinter[] = [];
  for (const device of value.devices) {
    const displayName = isRecord(device) && isRecord(device.identity)
      ? safeName(device.identity.displayName)
      : null;
    if (!isRecord(device) || !isRecord(device.identity) ||
        typeof device.identity.id !== "string" ||
        !/^windows-printer-queue:[a-f0-9]{64}$/.test(device.identity.id) ||
        device.identity.category !== "receipt-printer" ||
        device.identity.connection !== "printer-queue" ||
        !displayName ||
        device.availability !== "unknown" ||
        !isIsoTimestamp(device.observedAt) ||
        device.defaultStatus !== "unknown" ||
        !["accepting", "not-accepting", "unknown"].includes(String(device.queueAcceptance))) return null;

    const capabilities = device.capabilities;
    const capabilityNames = [
      "paperWidths", "cutting", "cashDrawerTrigger", "statusReporting",
      "characterEncoding", "rasterImagePrinting",
    ];
    if (!isRecord(capabilities) || Object.keys(capabilities).length !== capabilityNames.length ||
        capabilityNames.some((name) => !(name in capabilities)) ||
        Object.values(capabilities).some((capability) =>
          !isRecord(capability) || capability.status !== "unknown" ||
          (capability.reasonCode !== undefined && capability.reasonCode !== "not-reported"))) return null;

    devices.push({
      identity: {
        id: device.identity.id,
        category: "receipt-printer",
        connection: "printer-queue",
        displayName: isPathLikeName(displayName) ? "Windows printer queue" : displayName,
      },
      availability: "unknown",
      capabilities: {
        paperWidths: capabilityUnknown(),
        cutting: capabilityUnknown(),
        cashDrawerTrigger: capabilityUnknown(),
        statusReporting: capabilityUnknown(),
        characterEncoding: capabilityUnknown(),
        rasterImagePrinting: capabilityUnknown(),
      },
      observedAt: device.observedAt,
      defaultStatus: "unknown",
      queueAcceptance: device.queueAcceptance as PrinterQueueAcceptance,
    });
  }

  if ((value.status === "complete" && value.skippedCount !== 0) ||
      (value.status === "partial" && value.skippedCount === 0)) return null;
  return {
    status: value.status,
    discoveredAt: value.discoveredAt,
    devices,
    skippedCount: value.skippedCount as number,
  };
}

export function validatePrinterDiscoveryStatus(value: unknown): PrinterDiscoveryStatus | null {
  if (!isRecord(value) || !["not-run", "complete", "partial", "unavailable"].includes(String(value.state)) ||
      !(value.discoveredAt === null || isIsoTimestamp(value.discoveredAt)) ||
      !Number.isSafeInteger(value.deviceCount) || (value.deviceCount as number) < 0 ||
      !Number.isSafeInteger(value.skippedCount) || (value.skippedCount as number) < 0) return null;
  if (value.state === "not-run" && (value.discoveredAt !== null || value.deviceCount !== 0 || value.skippedCount !== 0)) return null;
  if (value.state !== "not-run" && value.discoveredAt === null) return null;
  if (value.state === "unavailable" && (value.deviceCount !== 0 || value.skippedCount !== 0)) return null;
  if (value.state === "complete" && value.skippedCount !== 0) return null;
  if (value.state === "partial" && value.skippedCount === 0) return null;
  return {
    state: value.state as PrinterDiscoveryStatus["state"],
    discoveredAt: value.discoveredAt as string | null,
    deviceCount: value.deviceCount as number,
    skippedCount: value.skippedCount as number,
  };
}
