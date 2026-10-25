/**
 * Hardware scale interface specification.
 * Decouples mobile UI from physical or mock hardware devices.
 * Physical adapters (ESP32, HX711, GM65) implement this contract.
 */

export class IScaleDevice {
  /**
   * Connect to the hardware device (BLE, Serial, or Simulated).
   * @returns {Promise<boolean>}
   */
  async connect() {
    throw new Error('connect() must be implemented by adapter');
  }

  /**
   * Disconnect from the device.
   */
  disconnect() {
    throw new Error('disconnect() must be implemented by adapter');
  }

  /**
   * Zero / Tare the scale.
   */
  tare() {
    throw new Error('tare() must be implemented by adapter');
  }

  /**
   * Subscribe to weight reading updates.
   * @param {(reading: ScaleReading) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onReading(_callback) {
    throw new Error('onReading() must be implemented by adapter');
  }

  /**
   * Subscribe to barcode scanner events.
   * @param {(barcode: string) => void} callback
   * @returns {() => void} unsubscribe function
   */
  onBarcodeScan(_callback) {
    throw new Error('onBarcodeScan() must be implemented by adapter');
  }
}

/**
 * @typedef {Object} ScaleReading
 * @property {number} weight - Current measured weight in grams
 * @property {boolean} isStable - True once reading has stabilized for ~1s
 * @property {boolean} isSimulated - Explicit flag indicating mock/simulated reading
 * @property {'reading' | 'stable' | 'zero'} status
 * @property {number} timestamp - Unix millisecond timestamp
 */
