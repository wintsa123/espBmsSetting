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
    getWebUpdateState?: () => string;
    checkWebUpdate?: () => void;
    restartWeb?: () => void;
    installAppUpdate?: () => void;
    request: (id: string, method: string, path: string, body: string, host: string) => void;
    connectBle: () => void;
    bleConnected: () => boolean;
    openNative: (route: string) => void;
  };
  __bmsNativeReply?: (id: string, payload: string) => void;
  bmsNativeRequest?: (method: string, path: string, body: string, host: string) => Promise<unknown>;
}

declare const __WEB_VERSION__: string;
