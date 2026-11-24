import assert from "node:assert/strict";

import {
  HardwareError,
  PAPER_WIDTH_PROFILES,
  normalizeHardwareError,
  type CapabilityState,
  type HardwareConnectionType,
  type HardwareDevice,
  type HardwareDiscoveryResult,
  type HardwareErrorCode,
  type HardwareErrorInfo,
  type PrintJobInput,
  type PrintJobResult,
  type ReceiptPrinter,
  type TestPrintInput,
} from "../../packages/hardware-core/src/index.ts";

const invalidDiscovery: HardwareDiscoveryResult = {
  status: "complete",
  // @ts-expect-error Discovery results may only contain hardware devices.
  devices: ["not-a-device"],
  discoveredAt: "2026-11-23T12:00:00.000Z",
};

const unsafeCapabilityReason: CapabilityState<true> = {
  status: "unknown",
  // @ts-expect-error Renderer-facing capability reasons use Retaily codes, not free text.
  reasonCode: "C:\\private\\driver.node: native error",
};

const unsafeErrorInfo: HardwareErrorInfo = {
  code: "DEVICE_DISCONNECTED",
  // @ts-expect-error Public error messages are fixed by their code.
  message: "C:\\private\\driver.node: native error",
  outcome: "unknown",
};

const otherDevice: HardwareDevice = {
  identity: {
    id: "scanner-1",
    category: "barcode-scanner",
    connection: "android-platform-bridge",
    displayName: "Store scanner",
  },
  availability: "unknown",
  capabilities: {
    barcodeReading: { status: "unknown" },
  },
};
const futureConnection: HardwareConnectionType = "android-platform-bridge";

const printer: ReceiptPrinter = {
  identity: {
    id: "windows-queue:receipt-1",
    category: "receipt-printer",
    connection: "printer-queue",
    displayName: "Receipt Printer",
  },
  availability: "available",
  observedAt: "2026-11-23T12:00:00.000Z",
  capabilities: {
    paperWidths: { status: "supported", value: ["58mm", "80mm"] },
    cutting: { status: "unknown", reasonCode: "not-reported" },
    cashDrawerTrigger: { status: "unsupported" },
    statusReporting: { status: "unknown" },
    characterEncoding: { status: "unknown" },
    rasterImagePrinting: { status: "supported", value: true },
  },
};

const receiptJob: PrintJobInput = {
  requestId: "sale-receipt-request-1",
  attemptId: "print-attempt-1",
  printerId: printer.identity.id,
  paperWidth: "58mm",
  document: {
    saleId: "sale-1",
    receiptNumber: "RCT-1",
    saleNumber: "SAL-1",
    completedAt: "2026-11-23T12:00:00.000Z",
    currency: "USD",
    businessName: "Retaily",
    branchName: "Main",
    cashierName: "Cashier",
    items: [{
      name: "Tea",
      sku: "TEA-1",
      quantity: 1.5,
      unit: "box",
      unitPriceMinor: 1000,
      discountAmountMinor: 0,
      lineTotalMinor: 1500,
    }],
    subtotalMinor: 1500,
    discountMinor: 0,
    totalMinor: 1500,
    amountPaidMinor: 1500,
    changeMinor: 0,
    payments: [{ method: "cash", amountMinor: 1500, reference: null }],
  },
};

const cashierConfirmedRetry: PrintJobInput = {
  ...receiptJob,
  attemptId: "print-attempt-2",
  retry: {
    previousAttemptId: receiptJob.attemptId,
    confirmation: "cashier-confirmed",
  },
};

function main() {
  assert.equal(PAPER_WIDTH_PROFILES["58mm"].nominalWidthMillimeters, 58);
  assert.equal(PAPER_WIDTH_PROFILES["80mm"].nominalWidthMillimeters, 80);
  assert.equal(printer.identity.connection, "printer-queue");
  assert.equal(otherDevice.identity.category, "barcode-scanner");
  assert.equal(otherDevice.identity.connection, futureConnection);
  assert.equal(otherDevice.availability, "unknown");
  assert.equal(invalidDiscovery.devices.length, 1);
  assert.equal(unsafeCapabilityReason.status, "unknown");
  assert.equal(unsafeErrorInfo.code, "DEVICE_DISCONNECTED");
  assert.deepEqual(printer.capabilities.cutting, {
    status: "unknown",
    reasonCode: "not-reported",
  });
  assert.deepEqual(printer.capabilities.cashDrawerTrigger, { status: "unsupported" });
  assert.equal(receiptJob.document.items[0].quantity, 1.5);

  const testPrint: TestPrintInput = {
    requestId: "test-print-request-1",
    attemptId: "test-print-attempt-1",
    printerId: printer.identity.id,
    paperWidth: "80mm",
  };
  assert.equal(testPrint.paperWidth, "80mm");

  assert.equal(cashierConfirmedRetry.requestId, receiptJob.requestId);
  assert.notEqual(cashierConfirmedRetry.attemptId, receiptJob.attemptId);
  assert.equal(cashierConfirmedRetry.retry?.confirmation, "cashier-confirmed");

  const jobResults: PrintJobResult[] = [
    {
      requestId: receiptJob.requestId,
      attemptId: receiptJob.attemptId,
      printerId: receiptJob.printerId,
      status: "queued",
      queuedAt: "2026-11-23T12:00:00.000Z",
    },
    {
      requestId: receiptJob.requestId,
      attemptId: receiptJob.attemptId,
      printerId: receiptJob.printerId,
      adapterJobId: "spool-job-17",
      status: "accepted",
      acceptedBy: "operating-system",
      acceptedAt: "2026-11-23T12:00:01.000Z",
    },
    {
      requestId: receiptJob.requestId,
      attemptId: receiptJob.attemptId,
      printerId: receiptJob.printerId,
      adapterJobId: "spool-job-17",
      status: "printing",
      reportedBy: "operating-system",
      observedAt: "2026-11-23T12:00:02.000Z",
    },
    {
      requestId: receiptJob.requestId,
      attemptId: receiptJob.attemptId,
      printerId: receiptJob.printerId,
      adapterJobId: "spool-job-17",
      status: "completed",
      completedAt: "2026-11-23T12:00:03.000Z",
      completion: { reportedBy: "operating-system", physicalDeviceConfirmed: false },
    },
    {
      requestId: receiptJob.requestId,
      attemptId: "device-confirmed-attempt",
      printerId: receiptJob.printerId,
      status: "completed",
      completedAt: "2026-11-23T12:00:03.000Z",
      completion: { reportedBy: "device", physicalDeviceConfirmed: true },
    },
    {
      requestId: receiptJob.requestId,
      attemptId: "failed-attempt",
      printerId: receiptJob.printerId,
      status: "failed",
      failedAt: "2026-11-23T12:00:03.000Z",
      error: {
        code: "PRINT_FAILED",
        message: "The print job failed. Check the printer before retrying.",
        outcome: "rejected",
      },
    },
    {
      requestId: receiptJob.requestId,
      attemptId: "unknown-attempt",
      printerId: receiptJob.printerId,
      status: "outcome-unknown",
      observedAt: "2026-11-23T12:00:03.000Z",
      error: {
        code: "OUTCOME_UNKNOWN",
        message: "The print result is unknown. Check the printer before retrying.",
        outcome: "unknown",
      },
    },
  ];
  assert.deepEqual(jobResults.map(({ status }) => status), [
    "queued", "accepted", "printing", "completed", "completed", "failed", "outcome-unknown",
  ]);
  const osCompleted = jobResults.find((job) => job.status === "completed" && job.completion.reportedBy === "operating-system");
  const deviceCompleted = jobResults.find((job) => job.status === "completed" && job.completion.reportedBy === "device");
  assert.equal(osCompleted?.status === "completed" && osCompleted.completion.physicalDeviceConfirmed, false);
  assert.equal(deviceCompleted?.status === "completed" && deviceCompleted.completion.physicalDeviceConfirmed, true);
  const accepted = jobResults.find((job) => job.status === "accepted");
  assert.equal(accepted?.adapterJobId, "spool-job-17");
  const definiteFailure = jobResults.find((job) => job.status === "failed");
  assert.equal(definiteFailure?.status === "failed" && definiteFailure.error.message, "The print job failed. Check the printer before retrying.");
  assert.equal(definiteFailure?.status === "failed" && definiteFailure.error.outcome, "rejected");
  const uncertainResult = jobResults.find((job) => job.status === "outcome-unknown");
  assert.equal(uncertainResult?.status === "outcome-unknown" && uncertainResult.error.message, "The print result is unknown. Check the printer before retrying.");
  assert.equal(uncertainResult?.status === "outcome-unknown" && uncertainResult.error.outcome, "unknown");

  const unknownWithRejectedError: PrintJobResult = {
    requestId: "request",
    attemptId: "attempt",
    printerId: "printer",
    status: "outcome-unknown",
    observedAt: "2026-11-23T12:00:00.000Z",
    error: {
      code: "OUTCOME_UNKNOWN",
        message: "The print result is unknown. Check the printer before retrying.",
      // @ts-expect-error The status/error outcome mismatch is invalid.
      outcome: "rejected",
    },
  };

  // @ts-expect-error Definite failure states require a normalized error.
  const failedWithoutError: PrintJobResult = {
    requestId: "request",
    attemptId: "attempt",
    printerId: "printer",
    status: "failed",
    failedAt: "2026-11-23T12:00:00.000Z",
  };
  // @ts-expect-error Unknown outcomes require an error marked outcome-unknown.
  const unknownWithoutError: PrintJobResult = {
    requestId: "request",
    attemptId: "attempt",
    printerId: "printer",
    status: "outcome-unknown",
    observedAt: "2026-11-23T12:00:00.000Z",
  };
  void failedWithoutError;
  void unknownWithoutError;
  void unknownWithRejectedError;

  const errorCodes: HardwareErrorCode[] = [
    "DEVICE_UNAVAILABLE",
    "DEVICE_DISCONNECTED",
    "UNSUPPORTED_CAPABILITY",
    "INVALID_CONFIGURATION",
    "PRINT_REJECTED",
    "PRINT_FAILED",
    "OUTCOME_UNKNOWN",
    "HARDWARE_ERROR_UNKNOWN",
  ];
  const expectedErrorMessages: Record<HardwareErrorCode, string> = {
    DEVICE_UNAVAILABLE: "The selected hardware device is unavailable.",
    DEVICE_DISCONNECTED: "The hardware device disconnected.",
    UNSUPPORTED_CAPABILITY: "The device does not support the requested feature.",
    INVALID_CONFIGURATION: "The hardware configuration is invalid.",
    PRINT_REJECTED: "The printer rejected the print job.",
    PRINT_FAILED: "The print job failed. Check the printer before retrying.",
    OUTCOME_UNKNOWN: "The print result is unknown. Check the printer before retrying.",
    HARDWARE_ERROR_UNKNOWN: "The hardware operation could not be confirmed.",
  };
  for (const code of errorCodes) {
    const outcome = code === "OUTCOME_UNKNOWN" || code === "HARDWARE_ERROR_UNKNOWN"
      ? "unknown"
      : "rejected";
    const info = new HardwareError(code, outcome).toInfo();
    assert.equal(info.code, code);
    assert.equal(info.message, expectedErrorMessages[code]);
    assert.equal(info.outcome, outcome);
    assert.equal("stack" in info, false);
  }

  const sensitiveText = "C:\\private\\driver.node: secret native exception";
  const errorWithSensitiveMessage = new HardwareError("DEVICE_DISCONNECTED", "unknown");
  errorWithSensitiveMessage.message = sensitiveText;
  const failure = errorWithSensitiveMessage.toInfo();
  assert.deepEqual(failure, {
    code: "DEVICE_DISCONNECTED",
    message: "The hardware device disconnected.",
    outcome: "unknown",
  });
  assert.doesNotMatch(JSON.stringify(failure), /private|secret|native exception/);

  // @ts-expect-error HardwareError does not accept caller-provided public message text.
  const messageArgumentError = new HardwareError("DEVICE_DISCONNECTED", "unknown", sensitiveText);
  assert.equal(messageArgumentError.toInfo().message, expectedErrorMessages.DEVICE_DISCONNECTED);

  const unexpectedNativeError = new Error(sensitiveText);
  unexpectedNativeError.stack = `${sensitiveText}\n at native driver`;
  const normalizedNativeError = normalizeHardwareError(unexpectedNativeError);
  assert.deepEqual(normalizedNativeError, {
    code: "HARDWARE_ERROR_UNKNOWN",
    message: "The hardware operation could not be confirmed.",
    outcome: "unknown",
  });
  assert.doesNotMatch(JSON.stringify(normalizedNativeError), /private|secret|native exception|driver/);
  assert.equal("stack" in normalizedNativeError, false);

  console.log("PASS: hardware-core contract tests");
}

main();
