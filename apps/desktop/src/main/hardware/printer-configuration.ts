import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  HardwareError,
  PAPER_WIDTH_PROFILES,
  type PrinterPaperWidth,
} from "../../../../../packages/hardware-core/src/index";
import type { PrinterDiscoveryResponse } from "./printer-discovery";

export const PRINTER_CONFIGURATION_VERSION = 1 as const;

export interface PrinterConfiguration {
  version: typeof PRINTER_CONFIGURATION_VERSION;
  printerId: string;
  paperWidth: PrinterPaperWidth;
  updatedAt: string;
}

export type PrinterConfigurationReadResult =
  | { state: "missing" | "invalid"; configuration: null }
  | { state: "configured"; configuration: PrinterConfiguration };

export interface PrinterConfigurationStorage {
  read(): Promise<string | null>;
  write(serializedConfiguration: string): Promise<void>;
}

export interface PrinterConfigurationDiscovery {
  discover(): Promise<PrinterDiscoveryResponse>;
}

export function createFilePrinterConfigurationStorage(directory: string): PrinterConfigurationStorage {
  const targetPath = path.join(directory, "printer-configuration.json");

  return {
    async read() {
      try {
        const fileInfo = await stat(targetPath);
        if (fileInfo.size > 4096) throw new Error("Printer configuration file is too large.");
        return await readFile(targetPath, "utf8");
      } catch (error) {
        if (isRecord(error) && error.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(serializedConfiguration) {
      await mkdir(directory, { recursive: true });
      const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, serializedConfiguration, { encoding: "utf8", flag: "wx" });
        await rename(temporaryPath, targetPath);
      } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
      }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

export function validatePrinterConfiguration(value: unknown): PrinterConfiguration | null {
  if (!isRecord(value) || Object.keys(value).length !== 4 ||
      !["version", "printerId", "paperWidth", "updatedAt"].every((key) => key in value) ||
      value.version !== PRINTER_CONFIGURATION_VERSION ||
      typeof value.printerId !== "string" ||
      !/^windows-printer-queue:[a-f0-9]{64}$/.test(value.printerId) ||
      typeof value.paperWidth !== "string" ||
      !Object.keys(PAPER_WIDTH_PROFILES).includes(value.paperWidth) ||
      !isIsoTimestamp(value.updatedAt)) return null;

  return {
    version: PRINTER_CONFIGURATION_VERSION,
    printerId: value.printerId,
    paperWidth: value.paperWidth as PrinterPaperWidth,
    updatedAt: value.updatedAt,
  };
}

export function validatePrinterConfigurationInput(value: unknown):
  { printerId: string; paperWidth: PrinterPaperWidth } | null {
  if (!isRecord(value) || Object.keys(value).length !== 2 ||
      !["printerId", "paperWidth"].every((key) => key in value) ||
      typeof value.printerId !== "string" ||
      !/^windows-printer-queue:[a-f0-9]{64}$/.test(value.printerId) ||
      typeof value.paperWidth !== "string" ||
      !Object.keys(PAPER_WIDTH_PROFILES).includes(value.paperWidth)) return null;

  return {
    printerId: value.printerId,
    paperWidth: value.paperWidth as PrinterPaperWidth,
  };
}

export function validatePrinterConfigurationReadResult(value: unknown): PrinterConfigurationReadResult | null {
  if (!isRecord(value) || !["missing", "invalid", "configured"].includes(String(value.state))) return null;
  if (value.state === "missing" || value.state === "invalid") {
    return value.configuration === null
      ? { state: value.state, configuration: null }
      : null;
  }
  const configuration = validatePrinterConfiguration(value.configuration);
  return configuration ? { state: "configured", configuration } : null;
}

export function createPrinterConfigurationStore(
  storage: PrinterConfigurationStorage,
  now: () => string = () => new Date().toISOString(),
) {
  return {
    async read(): Promise<PrinterConfigurationReadResult> {
      const serialized = await storage.read();
      if (serialized === null) return { state: "missing", configuration: null };
      let parsed: unknown;
      try {
        parsed = JSON.parse(serialized);
      } catch {
        return { state: "invalid", configuration: null };
      }
      const configuration = validatePrinterConfiguration(parsed);
      return configuration
        ? { state: "configured", configuration }
        : { state: "invalid", configuration: null };
    },
    async save(input: unknown): Promise<PrinterConfiguration> {
      const validInput = validatePrinterConfigurationInput(input);
      if (!validInput) throw new HardwareError("INVALID_CONFIGURATION", "rejected");
      const configuration = validatePrinterConfiguration({
        version: PRINTER_CONFIGURATION_VERSION,
        ...validInput,
        updatedAt: now(),
      });
      if (!configuration) throw new HardwareError("INVALID_CONFIGURATION", "rejected");
      await storage.write(JSON.stringify(configuration));
      return configuration;
    },
  };
}

/** Returns the selected queue only when it appears in this fresh discovery result. */
/** Future print operations must call this again immediately before submission. */
export function findConfiguredPrinter(
  configuration: PrinterConfiguration,
  discovery: PrinterDiscoveryResponse,
) {
  if (discovery.status === "unavailable") return null;
  return discovery.devices.find((printer) => printer.identity.id === configuration.printerId) ?? null;
}

export function createPrinterConfigurationService(
  store: ReturnType<typeof createPrinterConfigurationStore>,
  discovery: PrinterConfigurationDiscovery,
) {
  return {
    async read(): Promise<PrinterConfigurationReadResult> {
      const result = await store.read();
      if (result.state !== "configured") return result;
      // Reconstruct rather than returning storage-parsed objects directly.
      const configuration = validatePrinterConfiguration(result.configuration);
      return configuration
        ? { state: "configured", configuration }
        : { state: "invalid", configuration: null };
    },
    async save(input: unknown): Promise<PrinterConfiguration> {
      const validInput = validatePrinterConfigurationInput(input);
      if (!validInput) throw new HardwareError("INVALID_CONFIGURATION", "rejected");
      const freshDiscovery = await discovery.discover();
      if (freshDiscovery.status === "unavailable" ||
          !freshDiscovery.devices.some((printer) => printer.identity.id === validInput.printerId)) {
        throw new HardwareError("DEVICE_UNAVAILABLE", "rejected");
      }
      return store.save(validInput);
    },
  };
}
