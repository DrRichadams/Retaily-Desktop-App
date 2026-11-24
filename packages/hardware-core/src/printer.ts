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

export interface ConfirmedPrintRetry {
  /** The earlier attempt whose uncertain/failed result the cashier reviewed. */
  previousAttemptId: string;
  confirmation: "cashier-confirmed";
}

export interface PrintJobInput {
  /** Stable correlation ID for one logical print request, retained across explicit retries. */
  requestId: string;
  /** Unique identifier for this individual print attempt. Never reuse for a retry. */
  attemptId: string;
  printerId: string;
  paperWidth: PrinterPaperWidth;
  document: ReceiptPrintDocument;
  /** Present only for a separate, cashier-confirmed retry; allocate a new attemptId. */
  retry?: ConfirmedPrintRetry;
}

export interface TestPrintInput {
  requestId: string;
  attemptId: string;
  printerId: string;
  paperWidth: PrinterPaperWidth;
}

export interface PrintJobResultBase {
  requestId: string;
  attemptId: string;
  printerId: string;
  /** Opaque ID assigned by the adapter or operating system; scope/retention are implementation-specific. */
  adapterJobId?: string;
}

export type PrintCompletionConfirmation =
  | { reportedBy: "operating-system"; physicalDeviceConfirmed: false }
  | { reportedBy: "device"; physicalDeviceConfirmed: true };

export type DefinitePrintError = Omit<HardwareErrorInfo, "code" | "outcome"> & {
  code: Exclude<HardwareErrorInfo["code"], "OUTCOME_UNKNOWN" | "HARDWARE_ERROR_UNKNOWN">;
  outcome: "not-started" | "rejected";
};

export type UnknownPrintError = HardwareErrorInfo & { outcome: "unknown" };

/**
 * Each attempt is reported independently. Reusing requestId does not guarantee
 * exactly-once printing. Duplicate protection requires a durable adapter record
 * or a verified system capability; ambiguous outcomes must not auto-retry.
 */
export type PrintJobResult =
  /** Waiting locally for a submission attempt to begin. */
  | (PrintJobResultBase & { status: "queued"; queuedAt: string })
  /** Accepted by a system/adapter; this does not confirm physical output. */
  | (PrintJobResultBase & {
      status: "accepted";
      acceptedBy: "operating-system" | "adapter";
      acceptedAt: string;
    })
  /** A print system reports that the job is actively processing. */
  | (PrintJobResultBase & {
      status: "printing";
      reportedBy: "operating-system" | "device";
      observedAt: string;
    })
  /** Completion source and physical confirmation are explicit. */
  | (PrintJobResultBase & {
      status: "completed";
      completedAt: string;
      completion: PrintCompletionConfirmation;
    })
  /** Definite failure before output or a rejection, with a normalized error. */
  | (PrintJobResultBase & {
      status: "failed";
      failedAt: string;
      error: DefinitePrintError;
    })
  /** The operation may have produced output; callers must not retry automatically. */
  | (PrintJobResultBase & {
      status: "outcome-unknown";
      observedAt: string;
      error: UnknownPrintError;
    });

export type DeviceDiscoveryResult = HardwareDiscoveryResult<ReceiptPrinter>;

/** Future adapters implement this contract without exposing platform APIs to callers. */
export interface ReceiptPrinterAdapter {
  discover(): Promise<DeviceDiscoveryResult>;
  /** Prints a completed-sale snapshot only; this contract has no sale-creation operation. */
  print(input: PrintJobInput): Promise<PrintJobResult>;
  testPrint(input: TestPrintInput): Promise<PrintJobResult>;
  /** Looks up an adapter/system job; availability and retention are implementation-specific. */
  getJobStatus(printerId: string, adapterJobId: string): Promise<PrintJobResult | null>;
}
