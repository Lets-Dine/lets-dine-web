/** Just the parts of QZ Tray's browser client this app calls. */
declare module 'qz-tray' {
  interface PrintConfig {
    readonly _brand?: 'qz-config';
  }
  interface QzApi {
    websocket: {
      connect(options?: { retries?: number; delay?: number }): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
      setClosedCallbacks(callback: (event: unknown) => void): void;
    };
    security: {
      setCertificatePromise(handler: (resolve: (certificate: string) => void, reject: (reason: unknown) => void) => void): void;
      setSignatureAlgorithm(algorithm: 'SHA512' | 'SHA1'): void;
      setSignaturePromise(handler: (toSign: string) => (resolve: (signature: string) => void, reject: (reason: unknown) => void) => void): void;
    };
    configs: { create(printer: { host: string; port: number }, options?: Record<string, unknown>): PrintConfig };
    print(config: PrintConfig, data: { type: 'raw'; format: 'command'; flavor: 'base64' | 'plain' | 'hex'; data: string }[]): Promise<void>;
  }
  const qz: QzApi;
  export default qz;
}
