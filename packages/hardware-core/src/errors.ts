export type HardwareErrorCode =
  | "DEVICE_UNAVAILABLE"
  | "DEVICE_DISCONNECTED"
  | "UNSUPPORTED_CAPABILITY"
  | "INVALID_CONFIGURATION"
  | "PRINT_REJECTED"
  | "PRINT_FAILED"
  | "OUTCOME_UNKNOWN"
  | "HARDWARE_ERROR_UNKNOWN";

export type HardwareOperationOutcome = "not-started" | "rejected" | "unknown";

export interface HardwareErrorInfo {
  code: HardwareErrorCode;
  message: string;
  outcome: HardwareOperationOutcome;
}

const SAFE_MESSAGES: Record<HardwareErrorCode, string> = {
  DEVICE_UNAVAILABLE: "The selected hardware device is unavailable.",
  DEVICE_DISCONNECTED: "The hardware device disconnected.",
  UNSUPPORTED_CAPABILITY: "The device does not support the requested feature.",
  INVALID_CONFIGURATION: "The hardware configuration is invalid.",
  PRINT_REJECTED: "The printer rejected the print job.",
  PRINT_FAILED: "The print job failed. Check the printer before retrying.",
  OUTCOME_UNKNOWN: "The print result is unknown. Check the printer before retrying.",
  HARDWARE_ERROR_UNKNOWN: "The hardware operation could not be confirmed.",
};

/** A renderer-safe hardware failure. Native exception text and paths are never accepted. */
export class HardwareError extends Error {
  readonly code: HardwareErrorCode;
  readonly outcome: HardwareOperationOutcome;

  constructor(code: HardwareErrorCode, outcome: HardwareOperationOutcome) {
    super(SAFE_MESSAGES[code]);
    this.name = "HardwareError";
    this.code = code;
    this.outcome = outcome;
  }

  toInfo(): HardwareErrorInfo {
    return { code: this.code, message: this.message, outcome: this.outcome };
  }
}

/** Maps unexpected adapter errors to a safe, platform-neutral result. */
export function normalizeHardwareError(error: unknown): HardwareErrorInfo {
  if (error instanceof HardwareError) return error.toInfo();
  return new HardwareError("HARDWARE_ERROR_UNKNOWN", "unknown").toInfo();
}
