import type {
  CapabilityState,
  HardwareDevice,
  HardwareDeviceIdentity,
  HardwareDiscoveryResult,
} from "./device";
import type { HardwareErrorInfo } from "./errors";

export const PAPER_WIDTH_PROFILES = {
  "58mm": { nominalWidthMillimeters: 58 },
  "80mm": { nominalWidthMillimeters: 80 },
} as const;

export type PrinterPaperWidth = keyof typeof PAPER_WIDTH_PROFILES;

export interface ReceiptPrinterIdentity extends HardwareDeviceIdentity {
  category: "receipt-printer";
}

export interface ReceiptPrinterCapabilities {
  paperWidths: CapabilityState<readonly PrinterPaperWidth[]>;
  cutting: CapabilityState<true>;
  cashDrawerTrigger: CapabilityState<true>;
  statusReporting: CapabilityState<true>;
  characterEncoding: CapabilityState<readonly string[]>;
  rasterImagePrinting: CapabilityState<true>;
}

export interface ReceiptPrinter extends HardwareDevice<ReceiptPrinterCapabilities> {
  identity: ReceiptPrinterIdentity;
}

export interface ReceiptPrintItem {
  name: string;
  sku: string;
  quantity: number;
  unit: string;
  unitPriceMinor: number;
  discountAmountMinor: number;
  lineTotalMinor: number;
}

export interface ReceiptPrintPayment {
  method: string;
  amountMinor: number;
  reference: string | null;
}

/** Platform-neutral receipt snapshot; contains no payment credentials or raw commands. */
export interface ReceiptPrintDocument {
  saleId: string;
  receiptNumber: string;
  saleNumber: string;
  completedAt: string;
  currency: string;
  businessName: string;
  branchName: string;
  cashierName: string;
  items: readonly ReceiptPrintItem[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  changeMinor: number;
  payments: readonly ReceiptPrintPayment[];
}

export interface PrintJobInput {
  jobId: string;
  printerId: string;
  paperWidth: PrinterPaperWidth;
  document: ReceiptPrintDocument;
}

export interface TestPrintInput {
  jobId: string;
  printerId: string;
  paperWidth: PrinterPaperWidth;
}

export type PrintJobStatus =
  | "queued"
  | "printing"
  | "completed"
  | "rejected"
  | "failed"
  | "outcome-unknown"
  | "cancelled";

export interface PrintJobResult {
  jobId: string;
  printerId: string;
  status: PrintJobStatus;
  submittedAt?: string;
  finishedAt?: string;
  error?: HardwareErrorInfo;
}

export type DeviceDiscoveryResult = HardwareDiscoveryResult<ReceiptPrinter>;

/** Future adapters implement this contract without exposing platform APIs to callers. */
export interface ReceiptPrinterAdapter {
  discover(): Promise<DeviceDiscoveryResult>;
  print(input: PrintJobInput): Promise<PrintJobResult>;
  testPrint(input: TestPrintInput): Promise<PrintJobResult>;
  getJobStatus(jobId: string): Promise<PrintJobResult | null>;
}
