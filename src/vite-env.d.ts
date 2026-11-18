/// <reference types="vite/client" />

type BluetoothRemoteGATTCharacteristic = {
  value?: DataView;
  writeValue?: (value: BufferSource) => Promise<void>;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
  startNotifications: () => Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener: (type: "characteristicvaluechanged", listener: EventListener) => void;
};

type BluetoothRemoteGATTService = {
  getCharacteristic: (uuid: string) => Promise<BluetoothRemoteGATTCharacteristic>;
};

type BluetoothRemoteGATTServer = {
  getPrimaryService: (uuid: string) => Promise<BluetoothRemoteGATTService>;
};

type BluetoothDevice = EventTarget & {
  id: string;
  name?: string;
  gatt?: {
    connect: () => Promise<BluetoothRemoteGATTServer>;
    disconnect: () => void;
    connected: boolean;
  };
};

type BluetoothRequestDeviceOptions = {
  acceptAllDevices?: boolean;
  optionalServices?: string[];
};

interface Navigator {
  bluetooth?: {
    requestDevice: (options: BluetoothRequestDeviceOptions) => Promise<BluetoothDevice>;
  };
}

interface RequestInit {
  targetAddressSpace?: "local" | "private";
}

interface Window {
  BmsNative?: {
    getAppInfo?: () => string;
    setSystemBars?: (color: string, light: boolean) => void;
    getWebUpdateState?: () => string;
    checkWebUpdate?: () => void;
    checkWebUpdateFrom?: (source: "cf" | "github") => void;
    restartWeb?: () => void;
    installAppUpdate?: () => void;
    installAppUpdateFrom?: (source: "cf" | "github") => void;
    request: (id: string, method: string, path: string, body: string, host: string) => void;
    connectBle: () => void;
    bleConnected: () => boolean;
    getBleState?: () => string;
    startCast?: (host: string) => void;
    stopCast?: () => void;
    getCastState?: () => string;
    getAppUpdateState?: () => string;
    openConnectionSettings?: (kind: "http" | "ble") => void;
    openCompanion?: (page: string, language: string) => void;
  };
  bmsConnectionSettingsClosed?: () => void;
  __bmsNativeReply?: (id: string, payload: string) => void;
  bmsNativeRequest?: (method: string, path: string, body: string, host: string) => Promise<unknown>;
}

declare const __WEB_VERSION__: string;
