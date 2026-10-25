#ifndef NUTRISCALE_CONFIG_H
#define NUTRISCALE_CONFIG_H

#include <Arduino.h>

// ============================================================================
// NutriScale — ESP8266 NodeMCU ESP-12E Hardware Integration Config
// ============================================================================
// IMPORTANT: Pin assignments, load cell capacity, and calibration factors are
// subject to physical hardware verification by the hardware team.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. Wi-Fi Configuration
// ----------------------------------------------------------------------------
// Enter your local 2.4GHz Wi-Fi credentials (ESP8266 only supports 2.4GHz)
#define WIFI_SSID             "YOUR_WIFI_SSID"
#define WIFI_PASSWORD         "YOUR_WIFI_PASSWORD"
#define WIFI_HOSTNAME         "nutriscale"          // Resolves to nutriscale.local via mDNS
#define HTTP_PORT             80

// Optional: Static IP configuration (leave disabled to use router DHCP)
#define USE_STATIC_IP         false
#define STATIC_IP             192, 168, 1, 100
#define STATIC_GATEWAY        192, 168, 1, 1
#define STATIC_SUBNET         255, 255, 255, 0

// ----------------------------------------------------------------------------
// 2. HX711 Load-Cell Amplifier Pin Assignments
// ----------------------------------------------------------------------------
// NodeMCU ESP-12E Pin Mappings:
// D5 = GPIO 14
// D6 = GPIO 12
// NOTE: Verify physical breadboard wiring before flashing.
#define LOADCELL_DOUT_PIN     12    // NodeMCU D6 (GPIO 12) - HX711 DOUT / DT
#define LOADCELL_SCK_PIN      14    // NodeMCU D5 (GPIO 14) - HX711 PD_SCK / CLK

// ----------------------------------------------------------------------------
// 3. Load Cell & Calibration Settings
// ----------------------------------------------------------------------------
// HARDWARE NOTE:
// Load cell is likely 10 kg, but capacity and physical sensitivity must still
// be verified with physical weights.
//
// CALIBRATION FACTOR:
// DO NOT ASSUME A DEFAULT CALIBRATION FACTOR.
// A factor of 1.0 is used purely as an uncalibrated placeholder.
// To calibrate:
//   1. Flash firmware with scale empty.
//   2. Call POST /tare to zero out tare offset.
//   3. Place a known reference weight (e.g. 100g, 500g).
//   4. Note the raw reading from GET /status and calculate:
//        CALIBRATION_FACTOR = raw_reading / known_weight_in_grams
//   5. Update CALIBRATION_FACTOR below or send POST /calibrate?factor=<value>
#define DEFAULT_CALIBRATION_FACTOR   1.0f

// Number of samples averaged when zeroing the scale at boot
#define TARE_READINGS_COUNT          10

// ----------------------------------------------------------------------------
// 4. Stability Detection Parameters
// ----------------------------------------------------------------------------
// Stability is computed using a sliding window buffer of recent readings.
// If the delta (max - min) in the buffer is below threshold, reading is stable.
#define STABILITY_WINDOW_SIZE        6      // Number of recent samples tracked
#define STABILITY_DELTA_THRESHOLD_G  0.5f   // Grams deviation allowed for stable state
#define SAMPLE_INTERVAL_MS           100    // Read HX711 every 100 ms

// ----------------------------------------------------------------------------
// 5. Optional I2C LCD Display (e.g. 16x2 / 20x4 PCF8574)
// ----------------------------------------------------------------------------
// Set ENABLE_LCD to true once physical I2C display is connected.
#define ENABLE_LCD            false
#define LCD_I2C_ADDR          0x27   // Typical I2C address (or 0x3F)
#define LCD_COLUMNS           16
#define LCD_ROWS              2
#define LCD_SDA_PIN           4      // NodeMCU D2 (GPIO 4)
#define LCD_SCL_PIN           5      // NodeMCU D1 (GPIO 5)

// ----------------------------------------------------------------------------
// 6. Optional Three-Colour Status LED (RGB)
// ----------------------------------------------------------------------------
// Set ENABLE_STATUS_LEDS to true once physical LEDs are wired.
#define ENABLE_STATUS_LEDS    false
#define LED_RED_PIN           13     // NodeMCU D7 (GPIO 13) - Unstable / Taring
#define LED_GREEN_PIN         15     // NodeMCU D8 (GPIO 15) - Stable reading
#define LED_BLUE_PIN          0      // NodeMCU D3 (GPIO 0)  - Wi-Fi connecting / idle
#define LED_COMMON_ANODE      false  // true for common anode (+), false for common cathode (GND)

// ----------------------------------------------------------------------------
// 7. Debug Logging
// ----------------------------------------------------------------------------
#define SERIAL_BAUD_RATE      115200
#define DEBUG_PRINTS          true

#endif // NUTRISCALE_CONFIG_H
