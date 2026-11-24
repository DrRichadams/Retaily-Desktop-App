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

const SAFE_MESSAGES = {
  DEVICE_UNAVAILABLE: "The selected hardware device is unavailable.",
  DEVICE_DISCONNECTED: "The hardware device disconnected.",
  UNSUPPORTED_CAPABILITY: "The device does not support the requested feature.",
  INVALID_CONFIGURATION: "The hardware configuration is invalid.",
  PRINT_REJECTED: "The printer rejected the print job.",
  PRINT_FAILED: "The print job failed. Check the printer before retrying.",
  OUTCOME_UNKNOWN: "The print result is unknown. Check the printer before retrying.",
  HARDWARE_ERROR_UNKNOWN: "The hardware operation could not be confirmed.",
} as const satisfies Record<HardwareErrorCode, string>;

/** Public DTO whose message is fixed to the message associated with its code. */
export type HardwareErrorInfo = {
  [Code in HardwareErrorCode]: {
    code: Code;
    message: (typeof SAFE_MESSAGES)[Code];
    outcome: HardwareOperationOutcome;
  };
}[HardwareErrorCode];

const ERROR_CODES = new Set<string>(Object.keys(SAFE_MESSAGES));
const OUTCOMES = new Set<string>(["not-started", "rejected", "unknown"]);

function serializeHardwareError(
  code: unknown,
  outcome: unknown,
): HardwareErrorInfo {
  const safeCode = typeof code === "string" && ERROR_CODES.has(code)
    ? code as HardwareErrorCode
    : "HARDWARE_ERROR_UNKNOWN";
  const safeOutcome = typeof outcome === "string" && OUTCOMES.has(outcome)
    ? outcome as HardwareOperationOutcome
    : "unknown";

  return {
    code: safeCode,
    message: SAFE_MESSAGES[safeCode],
    outcome: safeOutcome,
  } as HardwareErrorInfo;
}

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
    return serializeHardwareError(this.code, this.outcome);
  }
}

/** Maps unexpected adapter errors to a safe, platform-neutral result. */
export function normalizeHardwareError(error: unknown): HardwareErrorInfo {
  if (error instanceof HardwareError) {
    return serializeHardwareError(error.code, error.outcome);
  }
  return serializeHardwareError("HARDWARE_ERROR_UNKNOWN", "unknown");
}
