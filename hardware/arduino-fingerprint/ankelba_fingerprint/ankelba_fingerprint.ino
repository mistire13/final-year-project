// Ankelba fingerprint reader prototype: Uno / classic Nano (ATmega328P).
// Sensor TX -> D2; sensor RX <- D3 (check logic voltage); common GND.
// Requires the Adafruit Fingerprint Sensor Library and a compatible UART sensor.
// Serial Monitor: 115200 baud, newline. No fingerprint images/templates are sent.
#include <SoftwareSerial.h>
#include <Adafruit_Fingerprint.h>
#include <stdlib.h>
#include <string.h>

SoftwareSerial sensorSerial(2, 3); // Arduino RX, TX
Adafruit_Fingerprint finger(&sensorSerial);
const uint32_t SENSOR_BAUD = 57600;
const unsigned long CAPTURE_TIMEOUT_MS = 30000UL;
const uint8_t INDEX_COMMAND = 0x1F;
char input[32];
uint8_t inputLength = 0;
bool inputOverflow = false;

void errorCode(const __FlashStringHelper *stage, uint8_t code) {
  Serial.print(F("ERROR ")); Serial.print(stage); Serial.print(' '); Serial.println(code);
}

bool sensorReady() {
  if (!finger.verifyPassword()) { Serial.println(F("ERROR SENSOR_UNAVAILABLE")); return false; }
  uint8_t result = finger.getParameters();
  if (result != FINGERPRINT_OK || finger.capacity == 0) {
    errorCode(F("PARAMETERS"), result); return false;
  }
  return true;
}

// Read the sensor's 256-slot occupancy bitmap, checking response length and
// checksum. A sensor that does not support this command must fail closed.
int8_t slotOccupied(uint16_t id) {
  uint16_t page = id / 256;
  if (page > 255) return -1;
  uint8_t data[] = { INDEX_COMMAND, (uint8_t)page };
  Adafruit_Fingerprint_Packet packet(FINGERPRINT_COMMANDPACKET, sizeof(data), data);
  finger.writeStructuredPacket(packet);
  if (finger.getStructuredPacket(&packet) != FINGERPRINT_OK ||
      packet.type != FINGERPRINT_ACKPACKET || packet.length != 35 ||
      packet.data[0] != FINGERPRINT_OK) return -1;
  for (uint8_t i = 0; i < 4; ++i) if (packet.address[i] != 0xFF) return -1;
  uint16_t sum = packet.type + (packet.length >> 8) + (packet.length & 0xff);
  for (uint8_t i = 0; i < 33; ++i) sum += packet.data[i];
  uint16_t received = ((uint16_t)packet.data[33] << 8) | packet.data[34];
  if (sum != received) return -1;
  uint16_t bit = id % 256;
  return (packet.data[1 + bit / 8] & (1U << (bit % 8))) ? 1 : 0;
}

bool capture(uint8_t slot) {
  unsigned long started = millis();
  while ((unsigned long)(millis() - started) < CAPTURE_TIMEOUT_MS) {
    if (Serial.available()) {
      char c = Serial.peek();
      if (c == 'C' || c == 'c') {
        while (Serial.available()) Serial.read();
        Serial.println(F("CANCELLED"));
        return false;
      }
    }
    uint8_t result = finger.getImage();
    if (result == FINGERPRINT_NOFINGER) { delay(100); continue; }
    if (result != FINGERPRINT_OK) { errorCode(F("CAPTURE"), result); return false; }
    result = finger.image2Tz(slot);
    if (result != FINGERPRINT_OK) { errorCode(F("IMAGE"), result); return false; }
    return true;
  }
  Serial.println(F("ERROR TIMEOUT")); return false;
}

bool waitForRemoval() {
  unsigned long started = millis();
  while ((unsigned long)(millis() - started) < CAPTURE_TIMEOUT_MS) {
    if (Serial.available()) {
      char c = Serial.peek();
      if (c == 'C' || c == 'c') {
        while (Serial.available()) Serial.read();
        Serial.println(F("CANCELLED"));
        return false;
      }
    }
    uint8_t result = finger.getImage();
    if (result == FINGERPRINT_NOFINGER) return true;
    if (result != FINGERPRINT_OK) { errorCode(F("REMOVAL"), result); return false; }
    delay(100);
  }
  Serial.println(F("ERROR TIMEOUT")); return false;
}

void deleteSlot(uint16_t id) {
  if (!sensorReady()) return;
  uint8_t result = finger.deleteModel(id);
  if (result != FINGERPRINT_OK) { errorCode(F("DELETE"), result); return; }
  Serial.print(F("DELETED ")); Serial.println(id);
}

void enroll(uint16_t id) {
  if (!sensorReady()) return;
  if (id == 0 || id >= finger.capacity) { Serial.println(F("ERROR ID_OUT_OF_RANGE")); return; }
  int8_t occupied = slotOccupied(id);
  if (occupied < 0) { Serial.println(F("ERROR SLOT_CHECK")); return; }
  if (occupied) { Serial.println(F("ERROR SLOT_OCCUPIED")); return; }
  Serial.println(F("PROMPT PLACE_FINGER_1"));
  if (!capture(1)) return;
  Serial.println(F("PROMPT REMOVE_FINGER"));
  if (!waitForRemoval()) return;
  Serial.println(F("PROMPT PLACE_SAME_FINGER"));
  if (!capture(2)) return;
  uint8_t result = finger.createModel();
  if (result != FINGERPRINT_OK) { errorCode(F("CREATE_MODEL"), result); return; }
  // Check again immediately before storing. This does not guard against another
  // controller writing to the same sensor between check and store.
  occupied = slotOccupied(id);
  if (occupied < 0) { Serial.println(F("ERROR SLOT_CHECK")); return; }
  if (occupied) { Serial.println(F("ERROR SLOT_OCCUPIED")); return; }
  result = finger.storeModel(id);
  if (result != FINGERPRINT_OK) { errorCode(F("STORE"), result); return; }
  Serial.print(F("ENROLLED ")); Serial.println(id);
}

void scan() {
  if (!sensorReady()) return;
  Serial.println(F("PROMPT PLACE_FINGER"));
  if (!capture(1)) return;
  uint8_t result = finger.fingerSearch();
  if (result == FINGERPRINT_NOTFOUND) { Serial.println(F("NO_MATCH")); return; }
  if (result != FINGERPRINT_OK) { errorCode(F("SEARCH"), result); return; }
  Serial.print(F("MATCH ")); Serial.print(finger.fingerID); Serial.print(' '); Serial.println(finger.confidence);
}

void processCommand(char *command) {
  if (strcmp(command, "STATUS") == 0) {
    if (sensorReady()) {
      uint8_t result = finger.getTemplateCount();
      if (result != FINGERPRINT_OK) { errorCode(F("COUNT"), result); return; }
      Serial.print(F("READY ")); Serial.print(finger.capacity); Serial.print(' '); Serial.println(finger.templateCount);
    }
  } else if (strcmp(command, "SCAN") == 0) scan();
  else if (strcmp(command, "CANCEL") == 0) {
    Serial.println(F("CANCELLED"));
  } else if (strncmp(command, "DELETE ", 7) == 0) {
    char *value = command + 7;
    if (!*value) { Serial.println(F("ERROR INVALID_ID")); return; }
    for (char *p = value; *p; ++p) if (*p < '0' || *p > '9') { Serial.println(F("ERROR INVALID_ID")); return; }
    unsigned long id = strtoul(value, NULL, 10);
    if (id == 0 || id > 65535UL) { Serial.println(F("ERROR INVALID_ID")); return; }
    deleteSlot((uint16_t)id);
  } else if (strncmp(command, "ENROLL ", 7) == 0) {
    char *value = command + 7;
    if (!*value) { Serial.println(F("ERROR INVALID_ID")); return; }
    for (char *p = value; *p; ++p) if (*p < '0' || *p > '9') { Serial.println(F("ERROR INVALID_ID")); return; }
    unsigned long id = strtoul(value, NULL, 10);
    if (id == 0 || id > 65535UL) { Serial.println(F("ERROR INVALID_ID")); return; }
    enroll((uint16_t)id);
  } else Serial.println(F("ERROR UNKNOWN_COMMAND"));
}

void setup() {
  Serial.begin(115200);
  finger.begin(SENSOR_BAUD);
  Serial.println(F("ANKELBA_FINGERPRINT 1"));
}

void loop() {
  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\r') continue;
    if (ch == '\n') {
      if (inputOverflow) Serial.println(F("ERROR COMMAND_TOO_LONG"));
      else if (inputLength) { input[inputLength] = '\0'; processCommand(input); }
      inputLength = 0; inputOverflow = false;
    } else if (!inputOverflow) {
      if (inputLength < sizeof(input) - 1) input[inputLength++] = ch;
      else inputOverflow = true;
    }
  }
}
