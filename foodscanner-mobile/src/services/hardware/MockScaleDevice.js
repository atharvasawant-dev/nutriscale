import { IScaleDevice } from './interface';

export const MOCK_PRODUCTS = [
  {
    id: 'cadbury',
    barcode: '7622210992451',
    name: 'Cadbury Dairy Milk',
    defaultWeight: 42.0,
    kcalPer100g: 534,
    description: 'Cadbury Dairy Milk Chocolate',
  },
  {
    id: 'storia',
    barcode: '8906073120014',
    name: 'Storia Tender Coconut Water',
    defaultWeight: 250.0,
    kcalPer100g: 19,
    description: '100% Tender Coconut Water',
  },
  {
    id: 'kelloggs',
    barcode: '8901499008454',
    name: "Kellogg's Corn Flakes",
    defaultWeight: 60.0,
    kcalPer100g: 380,
    description: 'Corn flakes cereal',
  },
  {
    id: 'unmatched',
    barcode: '9999999999999',
    name: 'Unmatched Barcode',
    defaultWeight: 50.0,
    kcalPer100g: 0,
    isUnmatched: true,
    description: 'Simulates a barcode with no database record',
  },
];

export class MockScaleDevice extends IScaleDevice {
  constructor() {
    super();
    this._isConnected = true;
    this._targetWeight = 42.0;
    this._rawWeight = 42.0;
    this._tareOffset = 0.0;
    this._isStable = true;
    this._readingListeners = new Set();
    this._barcodeListeners = new Set();
    this._simTimer = null;
    this._stabilizeTimer = null;
  }

  async connect() {
    this._isConnected = true;
    this._emitCurrentReading();
    return true;
  }

  disconnect() {
    this._isConnected = false;
    this._clearTimers();
  }

  _clearTimers() {
    if (this._simTimer) {
      clearInterval(this._simTimer);
      this._simTimer = null;
    }
    if (this._stabilizeTimer) {
      clearTimeout(this._stabilizeTimer);
      this._stabilizeTimer = null;
    }
  }

  tare() {
    // Zero the current weight reading
    this._tareOffset = this._rawWeight;
    this._isStable = true;
    this._clearTimers();
    this._emitCurrentReading();
  }

  /**
   * Simulate placing food on the scale.
   * Readings fluctuate ("Reading...") for ~1 second before stabilizing.
   * @param {number} weight - Target weight in grams
   */
  simulateWeight(weight) {
    this._clearTimers();
    const finalTarget = Math.max(0, Number(weight) || 0);
    this._targetWeight = finalTarget;
    this._tareOffset = 0; // reset tare when placing fresh item
    this._isStable = false;

    let step = 0;
    const steps = 4;
    const intervalMs = 250; // total 1000ms

    // Initial unstable reading
    this._rawWeight = Math.round((finalTarget * 0.4) * 10) / 10;
    this._emitCurrentReading();

    this._simTimer = setInterval(() => {
      step += 1;
      if (step < steps) {
        // Micro-fluctuations as weight settles
        const progress = step / steps;
        const jitter = (Math.random() - 0.5) * 1.5;
        this._rawWeight = Math.max(0, Math.round((finalTarget * progress + jitter) * 10) / 10);
        this._isStable = false;
        this._emitCurrentReading();
      } else {
        // Final stable reading
        this._clearTimers();
        this._rawWeight = finalTarget;
        this._isStable = true;
        this._emitCurrentReading();
      }
    }, intervalMs);
  }

  /**
   * Trigger mock barcode scan event.
   * @param {string} barcode
   */
  triggerMockBarcode(barcode) {
    for (const listener of this._barcodeListeners) {
      try {
        listener(barcode);
      } catch (e) {
        console.warn('Barcode listener error:', e);
      }
    }
  }

  /**
   * Select a preset test product and simulate placing it on the platform.
   * @param {typeof MOCK_PRODUCTS[0]} product
   */
  selectProduct(product) {
    if (!product) return;
    this.triggerMockBarcode(product.barcode);
    this.simulateWeight(product.defaultWeight);
  }

  onReading(callback) {
    this._readingListeners.add(callback);
    // Emit immediate current state
    callback(this._getReadingObject());
    return () => {
      this._readingListeners.delete(callback);
    };
  }

  onBarcodeScan(callback) {
    this._barcodeListeners.add(callback);
    return () => {
      this._barcodeListeners.delete(callback);
    };
  }

  _getReadingObject() {
    const netWeight = Math.max(0, Math.round((this._rawWeight - this._tareOffset) * 10) / 10);
    return {
      weight: netWeight,
      isStable: this._isStable,
      isSimulated: true, // explicit simulated indicator
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
        console.warn('Reading listener error:', e);
      }
    }
  }
}

// Global shared mock instance for seamless demo flow
export const mockScaleDevice = new MockScaleDevice();
