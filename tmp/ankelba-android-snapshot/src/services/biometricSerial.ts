/**
 * frontend/src/services/biometricSerial.ts
 * Web Serial API Driver for Arduino Uno R3 + R307S Optical Fingerprint Sensor.
 * Zero-install direct USB communication in Chromium browsers (Chrome, Edge).
 * SRS Refs: FR-BIO-01..10, FR-DESK-04
 */

export type SerialScannerStatus = "unsupported" | "disconnected" | "connecting" | "ready" | "busy" | "error";

export type ScanPrompt = "PLACE_FINGER" | "REMOVE_FINGER" | "PLACE_SAME_FINGER" | "WAITING";

export interface ScanResult {
  match: boolean;
  slotId?: number;
  confidence?: number;
  error?: string;
}

export interface EnrollResult {
  success: boolean;
  slotId: number;
  error?: string;
}

type StatusListener = (status: SerialScannerStatus, detail?: string) => void;

class BiometricSerialManager {
  private port: any = null;
  private reader: any = null;
  private writer: any = null;
  private status: SerialScannerStatus = "disconnected";
  private statusListeners: Set<StatusListener> = new Set();
  private lineBuffer: string = "";
  private pendingLineResolvers: ((line: string) => void)[] = [];
  private isProcessing = false;

  constructor() {
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      if (!("serial" in navigator)) {
        this.status = "unsupported";
      }
    } else {
      this.status = "unsupported";
    }
  }

  public isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  public getStatus(): SerialScannerStatus {
    return this.status;
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: SerialScannerStatus, detail?: string) {
    this.status = status;
    this.statusListeners.forEach((l) => l(status, detail));
  }

  /**
   * Automatically attempts to reconnect to an already authorized USB serial device (e.g. on page reload).
   */
  public async autoConnect(): Promise<boolean> {
    if (!this.isSupported() || this.port) return !!this.port;
    try {
      const ports = await (navigator as any).serial.getPorts();
      if (ports && ports.length > 0) {
        return await this.openPort(ports[0]);
      }
    } catch {
      // User hasn't granted or device not plugged in
    }
    return false;
  }

  /**
   * Prompts the user with the native browser serial device picker.
   */
  public async requestPort(): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error("Web Serial is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
    }
    try {
      this.setStatus("connecting");
      const port = await (navigator as any).serial.requestPort();
      return await this.openPort(port);
    } catch (err: any) {
      this.setStatus("disconnected", err?.message);
      if (err?.name === "NotFoundError") {
        return false; // User cancelled the picker dialog
      }
      throw err;
    }
  }

  private async openPort(port: any): Promise<boolean> {
    try {
      this.port = port;
      await this.port.open({ baudRate: 115200 });

      // Start continuous background read loop
      this.startReading();

      this.setStatus("ready");

      // Check device readiness
      this.writeLine("STATUS").catch(() => {});

      return true;
    } catch (err: any) {
      this.port = null;
      this.setStatus("error", err?.message || "Failed to open serial port.");
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        this.reader = null;
      }
      if (this.writer) {
        await this.writer.close().catch(() => {});
        this.writer = null;
      }
      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }
    } finally {
      this.setStatus("disconnected");
    }
  }

  private async startReading() {
    if (!this.port || !this.port.readable) return;
    try {
      const textDecoder = new TextDecoderStream();
      this.port.readable.pipeTo(textDecoder.writable).catch(() => {});
      this.reader = textDecoder.readable.getReader();

      while (this.port && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.handleIncomingChunk(value);
        }
      }
    } catch {
      // Disconnection or stream cancel
    } finally {
      this.port = null;
      this.reader = null;
      this.setStatus("disconnected");
    }
  }

  private handleIncomingChunk(chunk: string) {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split(/\r?\n/);
    // The last element is whatever incomplete text remains after the last newline
    this.lineBuffer = lines.pop() || "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      // Resolve any pending line listeners
      if (this.pendingLineResolvers.length > 0) {
        const resolver = this.pendingLineResolvers.shift();
        if (resolver) resolver(line);
      }
    }
  }

  private async writeLine(line: string): Promise<void> {
    if (!this.port || !this.port.writable) {
      throw new Error("Scanner not connected. Please connect the USB device first.");
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(line + "\n");
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  private nextLine(timeoutMs = 35000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingLineResolvers.indexOf(resolve);
        if (idx >= 0) this.pendingLineResolvers.splice(idx, 1);
        reject(new Error("Scanner operation timed out."));
      }, timeoutMs);

      this.pendingLineResolvers.push((line: string) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }

  /**
   * Scan a finger on the R307S optical sensor and report whether it matches an enrolled template slot.
   */
  public async scan(onPrompt?: (prompt: ScanPrompt) => void): Promise<ScanResult> {
    if (this.status !== "ready") {
      throw new Error("Scanner is not connected or is currently busy.");
    }
    if (this.isProcessing) {
      throw new Error("Another scan or enrollment is already in progress.");
    }

    this.isProcessing = true;
    this.setStatus("busy");

    try {
      await this.writeLine("SCAN");

      while (true) {
        const line = await this.nextLine(35000);

        if (line.startsWith("PROMPT PLACE_FINGER")) {
          if (onPrompt) onPrompt("PLACE_FINGER");
          continue;
        }

        if (line.startsWith("MATCH ")) {
          // Format: MATCH <slotId> <confidence>
          const parts = line.split(" ");
          const slotId = parseInt(parts[1], 10);
          const confidence = parseInt(parts[2], 10);
          return { match: true, slotId, confidence };
        }

        if (line === "NO_MATCH") {
          return { match: false, error: "Fingerprint does not match any enrolled guardian" };
        }

        if (line === "CANCELLED") {
          return { match: false, error: "Scan cancelled" };
        }

        if (line.startsWith("ERROR ")) {
          const reason = line.replace("ERROR ", "");
          return { match: false, error: `Scanner error: ${reason}` };
        }
      }
    } finally {
      this.isProcessing = false;
      this.setStatus("ready");
    }
  }

  /**
   * Enroll a parent's finger in an optical sensor slot (1..300) with 2-phase verification.
   */
  public async enroll(
    slotId: number,
    onPrompt?: (stage: ScanPrompt) => void
  ): Promise<EnrollResult> {
    if (this.status !== "ready") {
      throw new Error("Scanner is not connected or is currently busy.");
    }
    if (this.isProcessing) {
      throw new Error("Another scan or enrollment is already in progress.");
    }

    this.isProcessing = true;
    this.setStatus("busy");

    try {
      await this.writeLine(`ENROLL ${slotId}`);

      while (true) {
        const line = await this.nextLine(35000);

        if (line === "PROMPT PLACE_FINGER_1") {
          if (onPrompt) onPrompt("PLACE_FINGER");
          continue;
        }

        if (line === "PROMPT REMOVE_FINGER") {
          if (onPrompt) onPrompt("REMOVE_FINGER");
          continue;
        }

        if (line === "PROMPT PLACE_SAME_FINGER") {
          if (onPrompt) onPrompt("PLACE_SAME_FINGER");
          continue;
        }

        if (line.startsWith("ENROLLED ")) {
          return { success: true, slotId };
        }

        if (line === "CANCELLED") {
          return { success: false, slotId, error: "Enrollment cancelled" };
        }

        if (line.startsWith("ERROR ")) {
          const reason = line.replace("ERROR ", "");
          return { success: false, slotId, error: `Enrollment error: ${reason}` };
        }
      }
    } finally {
      this.isProcessing = false;
      this.setStatus("ready");
    }
  }

  /**
   * Delete an enrolled slot from the sensor.
   */
  public async deleteSlot(slotId: number): Promise<boolean> {
    if (this.status !== "ready") return false;
    try {
      await this.writeLine(`DELETE ${slotId}`);
      const line = await this.nextLine(5000);
      return line.startsWith("DELETED ");
    } catch {
      return false;
    }
  }

  /**
   * Cancel any active scan or enrollment.
   */
  public async cancel(): Promise<void> {
    try {
      await this.writeLine("CANCEL");
    } catch {
      // Ignore
    }
  }
}

export const biometricSerial = new BiometricSerialManager();

