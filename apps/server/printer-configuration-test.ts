import assert from "node:assert/strict";
import {
  createPrinterConfigurationService,
  createPrinterConfigurationStore,
  findConfiguredPrinter,
  validatePrinterConfiguration,
  validatePrinterConfigurationInput,
} from "../desktop/src/main/hardware/printer-configuration.ts";
import {
  mapPrinterDiscovery,
  type PrinterDiscoveryResponse,
} from "../desktop/src/main/hardware/printer-discovery.ts";
import {
  PRINTER_IPC_CHANNELS,
  registerPrinterIpcHandlers,
  type PrinterDiscoveryService,
} from "../desktop/src/main/hardware/printer-ipc.ts";

const timestamp = "2026-11-24T11:00:00.000Z";

function main() {
  let serialized: string | null = null;
  let writeCount = 0;
  const storage = {
    async read() { return serialized; },
    async write(value: string) { serialized = value; writeCount += 1; },
  };
  const printerA = mapPrinterDiscovery([
    { name: "Receipt_Queue_A", displayName: "Front counter printer", options: {} },
  ], timestamp);
  const selectedPrinter = printerA.devices[0];
  const store = createPrinterConfigurationStore(storage, () => timestamp);

  return store.read().then(async (missing) => {
    assert.deepEqual(missing, { state: "missing", configuration: null });
    const configurationService = createPrinterConfigurationService(store, {
      discover: async () => printerA,
    });
    const saved = await configurationService.save({
      printerId: selectedPrinter.identity.id,
      paperWidth: "80mm",
    });
    assert.deepEqual(saved, {
      version: 1,
      printerId: selectedPrinter.identity.id,
      paperWidth: "80mm",
      updatedAt: timestamp,
    });
    assert.equal(writeCount, 1);
    assert.deepEqual(await configurationService.read(), {
      state: "configured",
      configuration: saved,
    });

    assert.equal(validatePrinterConfiguration({ ...saved, version: 99 }), null);
    assert.equal(validatePrinterConfiguration({ ...saved, paperWidth: "100mm" }), null);
    assert.equal(validatePrinterConfiguration({ ...saved, printerId: "C:\\printer" }), null);
    assert.equal(validatePrinterConfiguration({ ...saved, extra: "not allowed" }), null);
    assert.equal(validatePrinterConfigurationInput({
      printerId: selectedPrinter.identity.id,
      paperWidth: "100mm",
    }), null);
    assert.equal(validatePrinterConfigurationInput({
      printerId: "not-an-opaque-printer-id",
      paperWidth: "58mm",
    }), null);

    serialized = "{bad json";
    assert.deepEqual(await store.read(), { state: "invalid", configuration: null });
    serialized = JSON.stringify({ ...saved, version: 0 });
    assert.deepEqual(await store.read(), { state: "invalid", configuration: null });

    const removed: PrinterDiscoveryResponse = mapPrinterDiscovery([], timestamp);
    assert.equal(findConfiguredPrinter(saved, removed), null);
    const renamed: PrinterDiscoveryResponse = mapPrinterDiscovery([
      { name: "Receipt_Queue_A_Renamed", displayName: "Front counter printer", options: {} },
    ], timestamp);
    assert.equal(findConfiguredPrinter(saved, renamed), null);

    let latestDiscovery: PrinterDiscoveryResponse = printerA;
    let discoveryCalls = 0;
    const revalidatingService = createPrinterConfigurationService(store, {
      async discover() { discoveryCalls += 1; return latestDiscovery; },
    });
    const beforeRejectedSave = writeCount;
    latestDiscovery = removed;
    await assert.rejects(
      revalidatingService.save({ printerId: saved.printerId, paperWidth: saved.paperWidth }),
      (error: unknown) => error instanceof Error && error.message === "The selected hardware device is unavailable.",
    );
    assert.equal(discoveryCalls, 1);
    assert.equal(writeCount, beforeRejectedSave, "a missing printer must not be persisted");
    latestDiscovery = printerA;
    await revalidatingService.save({ printerId: saved.printerId, paperWidth: "58mm" });
    assert.equal(discoveryCalls, 2, "save must refresh printer discovery every time");

    const unavailablePrinter = selectedPrinter;
    assert.equal(unavailablePrinter.availability, "unknown");
    assert.equal(unavailablePrinter.queueAcceptance, "unknown");
    assert.equal(unavailablePrinter.defaultStatus, "unknown");
    assert.equal(unavailablePrinter.capabilities.statusReporting.status, "unknown");
    assert.equal(unavailablePrinter.capabilities.paperWidths.status, "unknown");

    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const registrar = {
      handle(channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(channel, handler);
      },
    };
    const discoveryService: PrinterDiscoveryService = {
      discover: async () => latestDiscovery,
      getStatus: () => ({ state: "complete", discoveredAt: timestamp, deviceCount: 1, skippedCount: 0 }),
    };
    const trustedSender = {};
    registerPrinterIpcHandlers(
      registrar as never,
      discoveryService,
      configurationService,
      (received) => received.sender === trustedSender,
    );
    const event = { sender: trustedSender };
    const saveHandler = handlers.get(PRINTER_IPC_CHANNELS.configSave)!;
    const invalid = await Promise.resolve(saveHandler(event, {
      printerId: selectedPrinter.identity.id,
      paperWidth: "100mm",
    }));
    assert.equal((invalid as { ok: boolean }).ok, false);
    assert.equal(discoveryCalls, 2, "invalid IPC input must be rejected before discovery");

    const rejectedExtra = await Promise.resolve(saveHandler(event, {
      printerId: selectedPrinter.identity.id,
      paperWidth: "58mm",
      path: "C:\\arbitrary",
    }));
    assert.equal((rejectedExtra as { ok: boolean }).ok, false);

    const getHandler = handlers.get(PRINTER_IPC_CHANNELS.configRead)!;
    const readResult = await Promise.resolve(getHandler(event));
    assert.equal((readResult as { ok: boolean }).ok, true);
    assert.deepEqual((readResult as { data: unknown }).data, {
      state: "configured",
      configuration: {
        version: 1,
        printerId: saved.printerId,
        paperWidth: "58mm",
        updatedAt: timestamp,
      },
    });

    const extraReadArgument = await Promise.resolve(getHandler(event, "unexpected"));
    assert.equal((extraReadArgument as { ok: boolean }).ok, false);
    console.log("PASS: printer configuration tests");
  });
}

main();
