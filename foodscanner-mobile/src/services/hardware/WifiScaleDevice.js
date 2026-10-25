import AsyncStorage from '@react-native-async-storage/async-storage';
import { IScaleDevice } from './interface';

const STORAGE_KEY_HOST = '@nutriscale_esp8266_host';
const STORAGE_KEY_PORT = '@nutriscale_esp8266_port';
const DEFAULT_HOST = '192.168.1.100';
const DEFAULT_PORT = 80;
const DEFAULT_POLL_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Physical scale device adapter communicating over local Wi-Fi with ESP8266 NodeMCU.
 * Reads live HX711 weight and stability status over a lightweight HTTP REST endpoint.
 */
export class WifiScaleDevice extends IScaleDevice {
  constructor(config = {}) {
    super();
    this._host = config.host || DEFAULT_HOST;
    this._port = config.port || DEFAULT_PORT;
    this._pollIntervalMs = config.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;

    this._isConnected = false;
    this._isConnecting = false;
    this._lastError = null;

    this._weight = 0.0;
    this._isStable = true;
    this._tareOffset = 0.0;

    this._readingListeners = new Set();
    this._barcodeListeners = new Set();
    this._statusListeners = new Set();

    this._pollTimer = null;
    this._abortController = null;
    this._consecutiveFailures = 0;

    this._initSavedHost();
  }

  async _initSavedHost() {
    try {
      const savedHost = await AsyncStorage.getItem(STORAGE_KEY_HOST);
      if (savedHost) {
        this._host = savedHost.trim();
      }
      const savedPort = await AsyncStorage.getItem(STORAGE_KEY_PORT);
      if (savedPort) {
        const parsedPort = parseInt(savedPort, 10);
        if (parsedPort > 0 && parsedPort <= 65535) {
          this._port = parsedPort;
        }
      }
    } catch (_err) {
      // AsyncStorage unavailable or in memory-only context
    }
  }

  /**
   * Get device connection and address status.
   */
  getStatus() {
    return {
      isConnected: this._isConnected,
      isConnecting: this._isConnecting,
      host: this._host,
      port: this._port,
      lastError: this._lastError,
      isSimulated: false,
    };
  }

  /**
   * Update host and port, persisting to AsyncStorage.
   * @param {string} host - IP address or hostname (e.g. 192.168.1.50 or nutriscale.local)
   * @param {number|string} port - HTTP port (defaults to 80)
   */
  async setHost(host, port = DEFAULT_PORT) {
    if (!host) return;
    const cleanHost = String(host).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    this._host = cleanHost;
    this._port = Number(port) || DEFAULT_PORT;

    try {
      await AsyncStorage.setItem(STORAGE_KEY_HOST, this._host);
      await AsyncStorage.setItem(STORAGE_KEY_PORT, String(this._port));
    } catch (_e) {
      // ignore
    }
    this._emitStatus();
  }

  /**
   * Connect to ESP8266 over Wi-Fi and begin non-blocking polling.
   * @param {string} [host] - Optional host override
   * @param {number} [port] - Optional port override
   * @returns {Promise<boolean>}
   */
  async connect(host, port) {
    if (host) {
      await this.setHost(host, port || this._port);
    }

    this._isConnecting = true;
    this._lastError = null;
    this._consecutiveFailures = 0;
    this._emitStatus();

    try {
      // Test connectivity by probing weight endpoint
      const initialReading = await this._fetchWeight();
      this._isConnected = true;
      this._isConnecting = false;
      this._lastError = null;
      this._weight = initialReading.weight;
      this._isStable = initialReading.isStable;

      this._emitStatus();
      this._emitCurrentReading();
      this._startPolling();
      return true;
    } catch (err) {
      this._isConnected = false;
      this._isConnecting = false;
      this._lastError = err.message || 'Could not reach ESP8266 scale';
      this._emitStatus();
      return false;
    }
  }

  /**
   * Disconnect and halt polling.
   */
  disconnect() {
    this._stopPolling();
    this._isConnected = false;
    this._isConnecting = false;
    this._emitStatus();
  }

  /**
   * Send zero / tare command to ESP8266 scale.
   * Attempts POST /tare, falling back to GET /tare for simple HTTP clients.
   * @returns {Promise<boolean>}
   */
  async tare() {
    const url = `http://${this._host}:${this._port}/tare`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      }).catch(async () => {
        // Fallback to GET /tare if POST fails due to preflight
        return await fetch(url, { method: 'GET', signal: controller.signal });
      });

      clearTimeout(timeoutId);

      if (res && res.ok) {
        this._weight = 0.0;
        this._isStable = true;
        this._emitCurrentReading();
        return true;
      }
      return false;
    } catch (err) {
      this._lastError = `Tare failed: ${err.message}`;
      this._emitStatus();
      return false;
    }
  }

  /**
   * Subscribe to weight reading updates.
   * @param {(reading: import('./interface').ScaleReading) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onReading(callback) {
    this._readingListeners.add(callback);
    callback(this._getReadingObject());
    return () => {
      this._readingListeners.delete(callback);
    };
  }

  /**
   * Subscribe to connection status changes.
   * @param {(status: { isConnected: boolean, isConnecting: boolean, host: string, lastError: string|null }) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onStatusChange(callback) {
    this._statusListeners.add(callback);
    callback(this.getStatus());
    return () => {
      this._statusListeners.delete(callback);
    };
  }

  /**
   * Subscribe to barcode scanner events (supported for IScaleDevice contract).
   * @param {(barcode: string) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onBarcodeScan(callback) {
    this._barcodeListeners.add(callback);
    return () => {
      this._barcodeListeners.delete(callback);
    };
  }

  /**
   * Fetch current reading from ESP8266 REST API.
   * Expected payload: { "weight": 42.0, "isStable": true, "unit": "g" }
   */
  async _fetchWeight() {
    const url = `http://${this._host}:${this._port}/weight`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Scale returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const rawWeight = typeof data.weight === 'number' ? data.weight : parseFloat(data.weight || 0);
      const isStable = Boolean(data.isStable ?? (data.stable ?? true));

      return {
        weight: Math.max(0, Math.round(rawWeight * 10) / 10),
        isStable,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout connecting to ${this._host}`);
      }
      throw err;
    }
  }

  _startPolling() {
    this._stopPolling();
    this._scheduleNextPoll(100);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  _scheduleNextPoll(delayMs) {
    if (!this._isConnected) return;
    this._pollTimer = setTimeout(async () => {
      await this._pollTick();
    }, delayMs);
  }

  async _pollTick() {
    if (!this._isConnected) return;

    try {
      const reading = await this._fetchWeight();
      this._consecutiveFailures = 0;
      this._weight = reading.weight;
      this._isStable = reading.isStable;
      this._lastError = null;
      this._emitCurrentReading();
    } catch (err) {
      this._consecutiveFailures += 1;
      if (this._consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this._isConnected = false;
        this._lastError = `Connection lost (${err.message})`;
        this._emitStatus();
        return;
      }
    }

    if (this._isConnected) {
      this._scheduleNextPoll(this._pollIntervalMs);
    }
  }

  _getReadingObject() {
    const netWeight = Math.max(0, Math.round(this._weight * 10) / 10);
    return {
      weight: netWeight,
      isStable: this._isStable,
      isSimulated: false, // Physical reading from ESP8266
      status: this._isStable ? (netWeight === 0 ? 'zero' : 'stable') : 'reading',
      timestamp: Date.now(),
    };
  }

  _emitCurrentReading() {
    const reading = this._getReadingObject();
    for (const listener of this._readingListeners) {
      try {
        listener(reading);
      } catch (e) {
        console.warn('WifiScale reading listener error:', e);
      }
    }
  }

  _emitStatus() {
    const status = this.getStatus();
    for (const listener of this._statusListeners) {
      try {
        listener(status);
      } catch (e) {
        console.warn('WifiScale status listener error:', e);
      }
    }
  }
}

// Global shared physical scale instance
export const wifiScaleDevice = new WifiScaleDevice();
