import assert from "node:assert/strict";

import {
  HardwareError,
  PAPER_WIDTH_PROFILES,
  normalizeHardwareError,
  type HardwareConnectionType,
  type HardwareDevice,
  type HardwareErrorCode,
  type PrintJobInput,
  type PrintJobResult,
  type ReceiptPrinter,
  type TestPrintInput,
} from "../../packages/hardware-core/src/index.ts";

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
    cutting: { status: "unknown", reason: "Not reported by the queue." },
    cashDrawerTrigger: { status: "unsupported" },
    statusReporting: { status: "unknown" },
    characterEncoding: { status: "unknown" },
    rasterImagePrinting: { status: "supported", value: true },
  },
};

const receiptJob: PrintJobInput = {
  jobId: "print-job-1",
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

function main() {
  assert.equal(PAPER_WIDTH_PROFILES["58mm"].nominalWidthMillimeters, 58);
  assert.equal(PAPER_WIDTH_PROFILES["80mm"].nominalWidthMillimeters, 80);
  assert.equal(printer.identity.connection, "printer-queue");
  assert.equal(otherDevice.identity.category, "barcode-scanner");
  assert.equal(otherDevice.identity.connection, futureConnection);
  assert.equal(otherDevice.availability, "unknown");
  assert.deepEqual(printer.capabilities.cutting, {
    status: "unknown",
    reason: "Not reported by the queue.",
  });
  assert.deepEqual(printer.capabilities.cashDrawerTrigger, { status: "unsupported" });
  assert.equal(receiptJob.document.items[0].quantity, 1.5);

  const testPrint: TestPrintInput = {
    jobId: "test-job-1",
    printerId: printer.identity.id,
    paperWidth: "80mm",
  };
  assert.equal(testPrint.paperWidth, "80mm");

  const completed: PrintJobResult = {
    jobId: receiptJob.jobId,
    printerId: receiptJob.printerId,
    status: "completed",
    submittedAt: "2026-11-23T12:00:00.000Z",
    finishedAt: "2026-11-23T12:00:01.000Z",
  };
  assert.equal(completed.status, "completed");

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
  for (const code of errorCodes) {
    const info = new HardwareError(code, "rejected").toInfo();
    assert.equal(info.code, code);
    assert.ok(info.message.length > 0);
    assert.equal(info.outcome, "rejected");
    assert.equal("stack" in info, false);
  }

  const failure = new HardwareError("DEVICE_DISCONNECTED", "unknown").toInfo();
  assert.deepEqual(failure, {
    code: "DEVICE_DISCONNECTED",
    message: "The hardware device disconnected.",
    outcome: "unknown",
  });
  assert.deepEqual(normalizeHardwareError(new Error("C:\\private\\driver.node: secret")), {
    code: "HARDWARE_ERROR_UNKNOWN",
    message: "The hardware operation could not be confirmed.",
    outcome: "unknown",
  });
  assert.equal("stack" in normalizeHardwareError(new Error("private")), false);

  console.log("PASS: hardware-core contract tests");
}

main();
