import assert from "node:assert/strict";
import {
  createPrinterDiscoveryService,
  mapPrinterDiscovery,
  validatePrinterDiscoveryResponse,
} from "../desktop/src/main/hardware/printer-discovery.ts";
import {
  isTrustedPrinterIpcSender,
  PRINTER_IPC_CHANNELS,
  registerPrinterIpcHandlers,
} from "../desktop/src/main/hardware/printer-ipc.ts";

const timestamp = "2026-11-24T10:00:00.000Z";

function main() {
  const mapped = mapPrinterDiscovery([
    {
      name: "Receipt_Printer_1",
      displayName: "Front counter receipt printer",
      description: "Driver details that must not cross IPC",
      options: { "printer-is-accepting-jobs": "true", "device-uri": "secret://path" },
    },
    {
      name: "Unavailable_Queue",
      displayName: "Back office printer",
      options: { "printer-is-accepting-jobs": "false" },
    },
    { name: "\\\\server\\private-share", displayName: "\\\\server\\private-share", options: {} },
    { name: "", displayName: "Malformed" },
    null,
  ], timestamp);

  assert.equal(mapped.status, "partial");
  assert.equal(mapped.skippedCount, 2);
  assert.equal(mapped.devices[0].identity.displayName, "Front counter receipt printer");
  assert.match(mapped.devices[0].identity.id, /^windows-printer-queue:[a-f0-9]{64}$/);
  assert.equal(mapped.devices[0].availability, "unknown");
  assert.equal(mapped.devices[0].queueAcceptance, "accepting");
  assert.equal(mapped.devices[0].defaultStatus, "unknown");
  assert.equal(mapped.devices[1].availability, "unknown");
  assert.equal(mapped.devices[1].queueAcceptance, "not-accepting");
  assert.equal(mapped.devices[2].identity.displayName, "Windows printer queue");
  assert.deepEqual(mapped.devices[0].capabilities.paperWidths, {
    status: "unknown",
    reasonCode: "not-reported",
  });
  assert.deepEqual(mapped.devices[0].capabilities.cutting, {
    status: "unknown",
    reasonCode: "not-reported",
  });
  assert.doesNotMatch(JSON.stringify(mapped), /driver|secret|device-uri|private-share/);

  const malformed = mapPrinterDiscovery({ printers: [] }, timestamp);
  assert.equal(malformed.status, "unavailable");
  assert.equal(malformed.error.code, "HARDWARE_ERROR_UNKNOWN");
  assert.doesNotMatch(JSON.stringify(malformed), /Invalid printer discovery response/);
  const hostileFailure = validatePrinterDiscoveryResponse({
    ...malformed,
    error: {
      code: "DEVICE_DISCONNECTED",
      message: "C:\\private\\driver stack trace",
      outcome: "unknown",
    },
  });
  assert.equal(hostileFailure?.status === "unavailable" && hostileFailure.error.code, "DEVICE_DISCONNECTED");
  assert.equal(hostileFailure?.status === "unavailable" && hostileFailure.error.message, "The hardware device disconnected.");
  assert.doesNotMatch(JSON.stringify(hostileFailure), /private|stack trace/);
  assert.equal(validatePrinterDiscoveryResponse({ ...mapped, devices: ["bad"] }), null);
  assert.equal(validatePrinterDiscoveryResponse({
    ...mapped,
    devices: [{ ...mapped.devices[0], availability: "available", defaultStatus: "default" }],
  }), null);
  const untrustedName = validatePrinterDiscoveryResponse({
    ...mapped,
    devices: [{
      ...mapped.devices[0],
      identity: { ...mapped.devices[0].identity, displayName: "C:\\private\\queue" },
    }, ...mapped.devices.slice(1)],
  });
  assert.equal(untrustedName?.status === "partial" && untrustedName.devices[0].identity.displayName, "Windows printer queue");

  const service = createPrinterDiscoveryService({
    getPrinters: async () => [{ name: "Receipt", displayName: "Receipt" }],
  }, () => timestamp);
  return service.discover().then((discovery) => {
    assert.equal(discovery.status, "complete");
    assert.deepEqual(service.getStatus(), {
      state: "complete",
      discoveredAt: timestamp,
      deviceCount: 1,
      skippedCount: 0,
    });

    const failedService = createPrinterDiscoveryService({
      getPrinters: async () => { throw new Error("C:\\private\\driver path"); },
    }, () => timestamp);
    return failedService.discover().then((failure) => {
      assert.equal(failure.status, "unavailable");
      assert.equal(failure.error.code, "HARDWARE_ERROR_UNKNOWN");
      assert.doesNotMatch(JSON.stringify(failure), /private|driver path/);

      const handlers = new Map<string, (...args: unknown[]) => unknown>();
      const registrar = {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
      };
      const sender = {};
      const mainFrame = { url: "http://localhost:5173/" } as { url: string; top?: unknown };
      mainFrame.top = mainFrame;
      const event = { sender, senderFrame: mainFrame };
      registerPrinterIpcHandlers(
        registrar as never,
        {
          discover: async () => ({ ...discovery, devices: ["untrusted"] } as never),
          getStatus: () => service.getStatus(),
        },
        {
          read: async () => ({ state: "missing", configuration: null }),
          save: async () => { throw new Error("Not used by this discovery test"); },
        },
        (received) => received.sender === sender,
      );

      const discoverHandler = handlers.get(PRINTER_IPC_CHANNELS.discover)!;
      return Promise.resolve(discoverHandler(event, "unexpected argument")).then((badPayload) => {
        assert.deepEqual(badPayload, {
          ok: false,
          error: {
            code: "INVALID_CONFIGURATION",
            message: "The hardware configuration is invalid.",
            outcome: "rejected",
          },
        });
        return Promise.resolve(discoverHandler(event)).then((badServiceResponse) => {
          assert.equal((badServiceResponse as { ok: boolean }).ok, false);
          assert.equal((badServiceResponse as { error: { code: string } }).error.code, "INVALID_CONFIGURATION");
          assert.equal(isTrustedPrinterIpcSender(
            event as never,
            sender,
            "http://localhost:5173/",
            "C:\\app\\renderer\\index.html",
          ), true);
          assert.equal(isTrustedPrinterIpcSender(
            { ...event, senderFrame: { url: "https://attacker.example/", top: null } } as never,
            sender,
            "http://localhost:5173/",
            "C:\\app\\renderer\\index.html",
          ), false);
          assert.equal(isTrustedPrinterIpcSender(
            { ...event, senderFrame: { url: "http://localhost:5173/", top: {} } } as never,
            sender,
            "http://localhost:5173/",
            "C:\\app\\renderer\\index.html",
          ), false);
          assert.equal(isTrustedPrinterIpcSender(
            { ...event, sender: {}, senderFrame: event.senderFrame } as never,
            sender,
            "http://localhost:5173/",
            "C:\\app\\renderer\\index.html",
          ), false);
          console.log("PASS: Windows printer discovery adapter tests");
        });
      });
    });
  });
}

main();
