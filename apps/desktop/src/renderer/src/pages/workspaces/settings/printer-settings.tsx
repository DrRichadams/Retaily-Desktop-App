import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Printer, RefreshCw, Save } from "lucide-react";
import type { InstalledPrinter } from "../../../../../main/hardware/printer-discovery.js";
import type {
  PrinterConfiguration,
  PrinterConfigurationReadResult,
} from "../../../../../main/hardware/printer-configuration.js";
import styles from "./printer-settings.module.scss";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function PrinterSettings({ canManage }: { canManage: boolean }) {
  const [configurationState, setConfigurationState] = useState<PrinterConfigurationReadResult | null>(null);
  const [savedConfiguration, setSavedConfiguration] = useState<PrinterConfiguration | null>(null);
  const [printers, setPrinters] = useState<InstalledPrinter[]>([]);
  const [discoveryState, setDiscoveryState] = useState<"idle" | "complete" | "partial" | "unavailable">("idle");
  const [selectedPrinterId, setSelectedPrinterId] = useState("");
  const [paperWidth, setPaperWidth] = useState<"58mm" | "80mm">("58mm");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [configurationLoadError, setConfigurationLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshPrinters() {
    setIsRefreshing(true);
    setError("");
    setNotice("");
    try {
      const response = await window.retaily.hardware.printers.discover();
      if (!response.ok) {
        setDiscoveryState("unavailable");
        setPrinters([]);
        setError(response.error.message);
        return;
      }

      setDiscoveryState(response.data.status);
      setPrinters(response.data.status === "unavailable" ? [] : [...response.data.devices]);
      if (response.data.status === "unavailable") setError(response.data.error.message);
      else if (response.data.status === "partial") {
        setNotice(`${response.data.skippedCount} printer record(s) could not be read.`);
      }
    } catch (err) {
      setDiscoveryState("unavailable");
      setPrinters([]);
      setError(errorMessage(err, "Printer discovery failed."));
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const response = await window.retaily.hardware.printers.readConfiguration();
        if (!active) return;
        if (!response.ok) {
          setConfigurationLoadError(response.error.message);
        } else {
          setConfigurationState(response.data);
          if (response.data.state === "configured") {
            setSavedConfiguration(response.data.configuration);
            setSelectedPrinterId(response.data.configuration.printerId);
            setPaperWidth(response.data.configuration.paperWidth);
          }
        }
      } catch (err) {
        if (active) setConfigurationLoadError(errorMessage(err, "Printer configuration could not be loaded."));
      } finally {
        if (active) {
          setIsLoading(false);
          void refreshPrinters();
        }
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  const selectedPrinter = useMemo(
    () => printers.find((printer) => printer.identity.id === selectedPrinterId) ?? null,
    [printers, selectedPrinterId],
  );
  const savedPrinterFound = savedConfiguration
    ? printers.some((printer) => printer.identity.id === savedConfiguration.printerId)
    : true;
  const savedPrinterMissing = Boolean(savedConfiguration) &&
    (discoveryState === "complete" || discoveryState === "partial") && !savedPrinterFound;

  async function saveConfiguration() {
    if (!canManage || isSaving || isLoading || !configurationState || !selectedPrinter) return;
    setIsSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await window.retaily.hardware.printers.saveConfiguration({
        printerId: selectedPrinter.identity.id,
        paperWidth,
      });
      if (!result.ok) {
        setError(result.error.code === "DEVICE_UNAVAILABLE"
          ? "That printer is no longer discovered. Refresh and choose an installed printer."
          : result.error.message);
        return;
      }
      setSavedConfiguration(result.data);
      setConfigurationState({ state: "configured", configuration: result.data });
      setConfigurationLoadError("");
      setNotice("Printer configuration saved.");
    } catch (err) {
      setError(errorMessage(err, "Printer configuration could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>DEVICE SETTINGS</span>
          <h1>Receipt printer</h1>
          <p>Choose an installed printer queue and configure the receipt paper width.</p>
        </div>
        <button type="button" className={styles.refreshButton} onClick={() => void refreshPrinters()} disabled={isRefreshing || isLoading}>
          <RefreshCw size={16} className={isRefreshing ? styles.spinning : undefined} />
          {isRefreshing ? "Refreshing…" : "Refresh printers"}
        </button>
      </header>

      {error && <div className={styles.error} role="alert"><AlertTriangle size={17} />{error}</div>}
      {configurationLoadError && (
        <div className={styles.error} role="alert">
          <AlertTriangle size={17} />
          Printer configuration could not be loaded: {configurationLoadError} Reload the workspace before saving changes.
        </div>
      )}
      {notice && <div className={styles.notice} role="status"><Check size={17} />{notice}</div>}
      {configurationState?.state === "invalid" && (
        <div className={styles.warning} role="status">
          <AlertTriangle size={17} />
          The saved printer configuration is invalid or from an unsupported version. Choose a printer and save a new configuration.
        </div>
      )}
      {savedPrinterMissing && (
        <div className={styles.warning} role="alert">
          <AlertTriangle size={17} />
          The saved printer is not currently discovered. It may have been removed or renamed. No replacement has been selected.
        </div>
      )}
      {savedConfiguration && discoveryState === "unavailable" && (
        <div className={styles.warning} role="status">
          <AlertTriangle size={17} />
          The saved printer could not be checked. Refresh discovery before selecting or saving a printer.
        </div>
      )}

      <section className={styles.panel} aria-labelledby="installed-printers-title">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="installed-printers-title">Installed printer queues</h2>
            <p>{printers.length} {printers.length === 1 ? "queue" : "queues"} discovered</p>
          </div>
          <Printer size={20} />
        </div>

        {isLoading || isRefreshing ? (
          <p className={styles.empty}>Checking installed printer queues…</p>
        ) : printers.length === 0 ? (
          <p className={styles.empty}>No printers are available in the latest discovery result.</p>
        ) : (
          <fieldset className={styles.printerList} disabled={!canManage || isSaving}>
            <legend className={styles.visuallyHidden}>Select a receipt printer</legend>
            {printers.map((printer) => (
              <label className={`${styles.printerChoice} ${selectedPrinterId === printer.identity.id ? styles.selected : ""}`} key={printer.identity.id}>
                <input
                  type="radio"
                  name="receipt-printer"
                  value={printer.identity.id}
                  checked={selectedPrinterId === printer.identity.id}
                  onChange={() => setSelectedPrinterId(printer.identity.id)}
                />
                <span className={styles.choiceBody}>
                  <strong>{printer.identity.displayName}</strong>
                  <span>{queueAcceptanceLabel(printer)}</span>
                </span>
                <span className={styles.selectionMark}>{selectedPrinterId === printer.identity.id && <Check size={17} />}</span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="paper-width-title">
        <div className={styles.panelHeading}>
          <div>
            <h2 id="paper-width-title">Receipt paper width</h2>
            <p>This is a local configuration and is not detected from the printer.</p>
          </div>
        </div>
        <div className={styles.widthOptions} role="group" aria-label="Receipt paper width">
          {(["58mm", "80mm"] as const).map((width) => (
            <button
              type="button"
              key={width}
              className={`${styles.widthOption} ${paperWidth === width ? styles.widthSelected : ""}`}
              aria-pressed={paperWidth === width}
              disabled={!canManage || isSaving || isLoading}
              onClick={() => setPaperWidth(width)}
            >
              {width}
            </button>
          ))}
        </div>
        <dl className={styles.statusList}>
          <div><dt>Physical readiness</dt><dd>Unknown</dd></div>
          <div><dt>Default-printer status</dt><dd>Unknown</dd></div>
          <div><dt>Configured paper width</dt><dd>{savedConfiguration?.paperWidth ?? "Not saved"}</dd></div>
        </dl>
      </section>

      {!canManage && <p className={styles.permissionNote}>You have view-only access to printer settings.</p>}
      <div className={styles.footer}>
        <span>{savedConfiguration ? `Last saved ${new Date(savedConfiguration.updatedAt).toLocaleString()}` : "No printer configuration saved"}</span>
        <button type="button" className={styles.saveButton} onClick={() => void saveConfiguration()} disabled={!canManage || isSaving || isLoading || !configurationState || !selectedPrinter}>
          <Save size={16} />
          {isSaving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}

function queueAcceptanceLabel(printer: InstalledPrinter): string {
  if (printer.queueAcceptance === "accepting") return "Queue reports that it accepts jobs";
  if (printer.queueAcceptance === "not-accepting") return "Queue reports that it is not accepting jobs";
  return "Queue acceptance status unknown";
}
