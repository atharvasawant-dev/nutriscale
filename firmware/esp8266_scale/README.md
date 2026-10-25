# NutriScale — ESP8266 NodeMCU ESP-12E Scale Firmware

This folder contains the proposed ESP8266 firmware structure for the NutriScale physical weight integration.

> **Notice & Disclaimer:**<br>
> This firmware structure has been prepared to match the software integration architecture and scale interface contract.<br>
> It has **not yet been verified on physical hardware**. Physical wiring, load-cell capacity testing, and calibration must be performed by the hardware teammate upon physical assembly.

---

## Hardware Overview

| Component | Specification | Status |
| :--- | :--- | :--- |
| **Microcontroller** | NodeMCU ESP-12E (ESP8266, 80/160 MHz) | Confirmed |
| **ADC Amplifier** | HX711 24-bit differential ADC | Confirmed (photos supplied) |
| **Load Cell** | Likely 10 kg capacity (4-wire bridge) | Needs bench verification |
| **Display** | 16x2 / 20x4 I2C LCD (optional) | Available for assembly |
| **Status LED** | 3-colour RGB LED (optional) | Available for assembly |

---

## Pin Assignments (`config.h`)

All pin assignments are centralized in `config.h` so they can be modified as the breadboard/PCB layout is finalized.

| NodeMCU Pin | GPIO | Default Device & Pin | Description |
| :--- | :--- | :--- | :--- |
| **D6** | `GPIO 12` | HX711 `DT` / `DOUT` | Data line from HX711 amplifier |
| **D5** | `GPIO 14` | HX711 `SCK` / `CLK` | Clock line for HX711 amplifier |
| **D2** | `GPIO 4` | I2C LCD `SDA` | I2C Data (if `ENABLE_LCD true`) |
| **D1** | `GPIO 5` | I2C LCD `SCL` | I2C Clock (if `ENABLE_LCD true`) |
| **D7** | `GPIO 13` | RGB LED Red | Reading / Tare indicator |
| **D8** | `GPIO 15` | RGB LED Green | Stable weight reading indicator |
| **D3** | `GPIO 0` | RGB LED Blue | Wi-Fi connection indicator |
| **3V3 / VIN** | — | VCC | 3.3V or 5V (HX711 accepts 2.7V–5.5V) |
| **GND** | — | GND | Common Ground |

---

## Load Cell Wiring (Standard 4-Wire)

Connect the 4 wires from the 10 kg load cell to the HX711 module:
- **Red** -> `E+` (Excitation +)
- **Black** -> `E-` (Excitation -)
- **White** -> `A-` (Signal -)
- **Green** -> `A+` (Signal +)

*(If your load cell reading decreases when weight is placed, swap `A+` and `A-`).*

---

## REST Endpoints Exposed by ESP8266

All endpoints include `Access-Control-Allow-Origin: *` headers for full browser/web compatibility.

### 1. `GET /weight`
Returns the current weight and stability state. Polled by the mobile app twice per second.
```json
{
  "weight": 42.0,
  "isStable": true,
  "unit": "g",
  "timestamp": 128450
}
```

### 2. `POST /tare` (or `GET /tare`)
Zeros the current weight reading.
```json
{
  "status": "ok",
  "tare": true,
  "offset": 8421054
}
```

### 3. `GET /status`
Returns full device diagnostic details (raw ADC, tare offset, calibration factor, RSSI, IP).
```json
{
  "status": "online",
  "device": "ESP8266 NodeMCU ESP-12E",
  "ip": "192.168.1.100",
  "rssi": -55,
  "hx711_ready": true,
  "raw_reading": 142050,
  "tare_offset": 8421054,
  "calibration_factor": 1.0,
  "weight": 42.0,
  "isStable": true,
  "uptime_ms": 34820
}
```

### 4. `POST /calibrate?factor=<number>`
Allows updating the calibration factor in RAM without having to re-flash the ESP8266.

---

## Calibration Procedure (Bench Testing)

The default calibration factor in `config.h` is `1.0f` (uncalibrated placeholder).

1. Flash the ESP8266 and open Serial Monitor at **115200 baud**.
2. Note the IP address printed on boot (e.g. `192.168.1.100`).
3. Ensure the scale platform is empty and call tare:
   ```bash
   curl -X POST http://<esp-ip>/tare
   ```
4. Place a known reference weight on the scale (e.g. exactly 100 grams or 500 grams).
5. Query `GET /status` to inspect the raw reading:
   ```bash
   curl http://<esp-ip>/status
   ```
6. Compute the calibration factor:
   $$\text{CALIBRATION\_FACTOR} = \frac{\text{raw\_reading}}{\text{known\_weight\_in\_grams}}$$
7. Test the calculated factor live:
   ```bash
   curl -X POST "http://<esp-ip>/calibrate?factor=420.5"
   ```
8. Verify that `GET /weight` now outputs the exact weight of your reference item.
9. Permanently update `#define DEFAULT_CALIBRATION_FACTOR` in `config.h` and re-flash.

---

## Flashing Instructions

### Option A: PlatformIO (Recommended)
```bash
cd firmware/esp8266_scale
pio run --target upload
pio device monitor
```

### Option B: Arduino IDE
1. Install **ESP8266 Board Support**:
   - URL: `http://arduino.esp8266.com/stable/package_esp8266com_index.json` in *Preferences* -> *Additional Board Manager URLs*.
   - In *Boards Manager*, install `esp8266 by ESP8266 Community`.
2. Install Libraries:
   - `HX711 by Bogdan Necula`
   - `LiquidCrystal I2C by Frank de Brabander` (if using LCD)
3. Select Board: **NodeMCU 1.0 (ESP-12E Module)**.
4. Select correct COM Port.
5. Edit `WIFI_SSID` and `WIFI_PASSWORD` in `config.h`.
6. Click **Upload**.
