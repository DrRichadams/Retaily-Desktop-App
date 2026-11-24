export type ExtensibleString<Known extends string> = Known | (string & {});

export type HardwareDeviceCategory = ExtensibleString<
  | "receipt-printer"
  | "barcode-scanner"
  | "cash-drawer"
  | "customer-display"
  | "weighing-scale"
  | "label-printer"
  | "camera"
>;

export type HardwareConnectionType = ExtensibleString<
  | "usb"
  | "network"
  | "bluetooth"
  | "serial"
  | "printer-queue"
>;

export type HardwareAvailability = "available" | "unavailable" | "busy" | "unknown";

export type CapabilityReasonCode =
  | "not-reported"
  | "not-detectable"
  | "requires-configuration"
  | "not-applicable";

export type CapabilityState<T> =
  | { status: "supported"; value: T }
  | { status: "unsupported"; reasonCode?: CapabilityReasonCode }
  | { status: "unknown"; reasonCode?: CapabilityReasonCode };

export interface HardwareDeviceIdentity {
  /** Adapter-defined stable identifier; never a raw device path or handle. */
  id: string;
  category: HardwareDeviceCategory;
  connection: HardwareConnectionType;
  displayName: string;
  manufacturer?: string;
  model?: string;
}

export interface HardwareDevice<Capabilities extends object = Readonly<Record<string, CapabilityState<unknown>>>> {
  identity: HardwareDeviceIdentity;
  availability: HardwareAvailability;
  capabilities: Capabilities;
  observedAt?: string;
}

export interface HardwareDiscoveryResult<TDevice extends HardwareDevice<object> = HardwareDevice> {
  status: "complete" | "partial";
  devices: readonly TDevice[];
  discoveredAt: string;
}
