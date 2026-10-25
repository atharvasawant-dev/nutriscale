/**
 * NutriScale — ESP8266 NodeMCU ESP-12E Firmware
 *
 * Exposes a lightweight local HTTP REST API for real-time HX711 load-cell readings.
 * Designed to integrate directly with the NutriScale mobile app (Expo / React Native).
 *
 * NOTICE:
 * Prepared as software integration baseline. Physical sensor wiring, calibration,
 * and testing must be performed by the hardware teammate upon physical assembly.
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <HX711.h>
#include "config.h"

#if ENABLE_LCD
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLUMNS, LCD_ROWS);
#endif

// Global hardware instances
HX711 scale;
ESP8266WebServer server(HTTP_PORT);

// State variables
float currentCalibrationFactor = DEFAULT_CALIBRATION_FACTOR;
float latestWeightGrams = 0.0f;
bool isStableReading = false;
unsigned long lastSampleTime = 0;
long rawHXTareOffset = 0;

// Sliding window buffer for stability detection
float sampleBuffer[STABILITY_WINDOW_SIZE];
uint8_t sampleIndex = 0;
bool bufferFilled = false;

// LED state helper
void setStatusLed(bool red, bool green, bool blue) {
#if ENABLE_STATUS_LEDS
  const uint8_t ON = LED_COMMON_ANODE ? LOW : HIGH;
  const uint8_t OFF = LED_COMMON_ANODE ? HIGH : LOW;
  digitalWrite(LED_RED_PIN, red ? ON : OFF);
  digitalWrite(LED_GREEN_PIN, green ? ON : OFF);
  digitalWrite(LED_BLUE_PIN, blue ? ON : OFF);
#else
  (void)red; (void)green; (void)blue;
#endif
}

// Attach CORS headers to all responses so web browser origins (Expo Web) work seamlessly
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void handleOptions() {
  sendCorsHeaders();
  server.send(204);
}

// GET / or GET /status: Device health & hardware diagnosis
void handleStatus() {
  sendCorsHeaders();

  bool hxReady = scale.is_ready();
  long rawReading = hxReady ? scale.read() : 0;

  String json = "{";
  json += "\"status\":\"online\",";
  json += "\"device\":\"ESP8266 NodeMCU ESP-12E\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"hx711_ready\":" + String(hxReady ? "true" : "false") + ",";
  json += "\"raw_reading\":" + String(rawReading) + ",";
  json += "\"tare_offset\":" + String(rawHXTareOffset) + ",";
  json += "\"calibration_factor\":" + String(currentCalibrationFactor, 4) + ",";
  json += "\"weight\":" + String(latestWeightGrams, 1) + ",";
  json += "\"isStable\":" + String(isStableReading ? "true" : "false") + ",";
  json += "\"uptime_ms\":" + String(millis());
  json += "}";

  server.send(200, "application/json", json);
}

// GET /weight: Core weight endpoint called by mobile app
void handleWeight() {
  sendCorsHeaders();

  String json = "{";
  json += "\"weight\":" + String(latestWeightGrams, 1) + ",";
  json += "\"isStable\":" + String(isStableReading ? "true" : "false") + ",";
  json += "\"unit\":\"g\",";
  json += "\"timestamp\":" + String(millis());
  json += "}";

  server.send(200, "application/json", json);
}

// POST /tare or GET /tare: Zeroes the scale
void handleTare() {
  sendCorsHeaders();

  if (DEBUG_PRINTS) {
    Serial.println("[NutriScale] Tare requested via HTTP");
  }

  setStatusLed(true, false, false); // Red during tare

  if (scale.is_ready()) {
    scale.tare(TARE_READINGS_COUNT);
    rawHXTareOffset = scale.get_offset();
    latestWeightGrams = 0.0f;
    isStableReading = true;

    // Reset sliding buffer
    for (uint8_t i = 0; i < STABILITY_WINDOW_SIZE; i++) {
      sampleBuffer[i] = 0.0f;
    }
    sampleIndex = 0;
    bufferFilled = false;

    setStatusLed(false, true, false); // Green: zeroed

    String json = "{\"status\":\"ok\",\"tare\":true,\"offset\":" + String(rawHXTareOffset) + "}";
    server.send(200, "application/json", json);
  } else {
    String json = "{\"status\":\"error\",\"message\":\"HX711 not ready\"}";
    server.send(503, "application/json", json);
  }
}

// POST /calibrate?factor=<float>: Runtime calibration update
void handleCalibrate() {
  sendCorsHeaders();

  if (server.hasArg("factor")) {
    float newFactor = server.arg("factor").toFloat();
    if (newFactor != 0.0f) {
      currentCalibrationFactor = newFactor;
      scale.set_scale(currentCalibrationFactor);
      if (DEBUG_PRINTS) {
        Serial.printf("[NutriScale] Calibration factor updated to: %.4f\n", currentCalibrationFactor);
      }
      String json = "{\"status\":\"ok\",\"calibration_factor\":" + String(currentCalibrationFactor, 4) + "}";
      server.send(200, "application/json", json);
      return;
    }
  }

  server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Missing or invalid 'factor' parameter\"}");
}

void handleNotFound() {
  if (server.method() == HTTP_OPTIONS) {
    handleOptions();
    return;
  }
  sendCorsHeaders();
  server.send(404, "application/json", "{\"error\":\"Endpoint not found\"}");
}

// Stability evaluation algorithm
void updateStabilityAndWeight() {
  if (!scale.is_ready()) return;

  // Read current weight in grams
  float reading = scale.get_units(1);
  if (reading < 0.0f && reading > -1.0f) {
    reading = 0.0f; // Clip micro noise around zero
  }

  // Update sliding window buffer
  sampleBuffer[sampleIndex] = reading;
  sampleIndex = (sampleIndex + 1) % STABILITY_WINDOW_SIZE;
  if (sampleIndex == 0) {
    bufferFilled = true;
  }

  // Compute min and max across buffer
  uint8_t count = bufferFilled ? STABILITY_WINDOW_SIZE : sampleIndex;
  if (count > 0) {
    float minVal = sampleBuffer[0];
    float maxVal = sampleBuffer[0];
    float sumVal = 0.0f;

    for (uint8_t i = 0; i < count; i++) {
      if (sampleBuffer[i] < minVal) minVal = sampleBuffer[i];
      if (sampleBuffer[i] > maxVal) maxVal = sampleBuffer[i];
      sumVal += sampleBuffer[i];
    }

    float delta = maxVal - minVal;
    isStableReading = (count >= 3) && (delta <= STABILITY_DELTA_THRESHOLD_G);
    latestWeightGrams = reading;
  }

  // Update hardware outputs
  if (isStableReading) {
    setStatusLed(false, true, false); // Green: Stable
  } else {
    setStatusLed(true, false, false); // Red: Reading in progress
  }

#if ENABLE_LCD
  lcd.setCursor(0, 0);
  lcd.print("Weight: ");
  lcd.print(latestWeightGrams, 1);
  lcd.print(" g   ");
  lcd.setCursor(0, 1);
  lcd.print(isStableReading ? "[STABLE]        " : "[READING...]    ");
#endif
}

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(200);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("   NutriScale — ESP8266 NodeMCU ESP-12E Scale     ");
  Serial.println("==================================================");

#if ENABLE_STATUS_LEDS
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_BLUE_PIN, OUTPUT);
  setStatusLed(false, false, true); // Blue: booting
#endif

#if ENABLE_LCD
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("NutriScale ESP8266");
  lcd.setCursor(0, 1);
  lcd.print("Connecting Wi-Fi");
#endif

  // 1. Connect to Wi-Fi
  Serial.printf("[NutriScale] Connecting to Wi-Fi SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);

#if USE_STATIC_IP
  IPAddress ip(STATIC_IP);
  IPAddress gateway(STATIC_GATEWAY);
  IPAddress subnet(STATIC_SUBNET);
  WiFi.config(ip, gateway, subnet);
#endif

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[NutriScale] Connected! IP Address: %s\n", WiFi.localIP().toString().c_str());
    if (MDNS.begin(WIFI_HOSTNAME)) {
      Serial.printf("[NutriScale] mDNS responder started: http://%s.local\n", WIFI_HOSTNAME);
    }
  } else {
    Serial.println("[NutriScale] Wi-Fi connection timed out. Check credentials in config.h.");
  }

  // 2. Initialize HX711 Load-Cell Amplifier
  Serial.printf("[NutriScale] Initializing HX711 (DOUT: GPIO%d, SCK: GPIO%d)...\n", LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(currentCalibrationFactor);

  if (scale.is_ready()) {
    Serial.println("[NutriScale] HX711 detected. Taring platform...");
    scale.tare(TARE_READINGS_COUNT);
    rawHXTareOffset = scale.get_offset();
    Serial.printf("[NutriScale] Tare complete. Offset: %ld\n", rawHXTareOffset);
  } else {
    Serial.println("[NutriScale] WARNING: HX711 not detected or not ready. Verify wiring.");
  }

  // 3. Register HTTP Endpoints with CORS support
  server.on("/", HTTP_GET, handleStatus);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/weight", HTTP_GET, handleWeight);
  server.on("/tare", HTTP_POST, handleTare);
  server.on("/tare", HTTP_GET, handleTare); // GET fallback for simple browser testing
  server.on("/calibrate", HTTP_POST, handleCalibrate);

  // Preflight OPTIONS routes
  server.on("/", HTTP_OPTIONS, handleOptions);
  server.on("/status", HTTP_OPTIONS, handleOptions);
  server.on("/weight", HTTP_OPTIONS, handleOptions);
  server.on("/tare", HTTP_OPTIONS, handleOptions);
  server.on("/calibrate", HTTP_OPTIONS, handleOptions);

  server.onNotFound(handleNotFound);
  server.begin();

  Serial.printf("[NutriScale] HTTP REST Server active on port %d\n", HTTP_PORT);
  Serial.printf("[NutriScale] Ready for app polling at: http://%s/weight\n", WiFi.localIP().toString().c_str());
  setStatusLed(false, true, false); // Green: ready
}

void loop() {
  server.handleClient();
  MDNS.update();

  unsigned long currentMillis = millis();
  if (currentMillis - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentMillis;
    updateStabilityAndWeight();
  }

  yield(); // Keep ESP8266 background Wi-Fi tasks responsive
}
