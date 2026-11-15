# Arduino fingerprint reader prototype

This sketch is a starting point for testing a fingerprint reader for Ankelba. It enrolls a fingerprint in the sensor's own storage and can report the stored slot that matches a subsequent scan. It does **not** connect the reader to Ankelba or authorize a child pickup. The sensor's slot number is not a guardian ID, and a match alone does not establish that someone is authorized to collect a particular child.

## Hardware assumed

- An Arduino Uno or classic Nano (ATmega328P).
- A UART fingerprint sensor compatible with the **Adafruit Fingerprint Sensor Library**, such as many optical sensors in the R30x/AS608 family. Fingerprint modules are not interchangeable: check the exact model and its documentation before wiring or uploading. USB fingerprint readers and sensors using a different protocol will not work with this sketch without changes.
- A USB cable, suitable jumper wires and a computer with Arduino IDE.

The software serial connection uses these Arduino pins:

| Fingerprint sensor signal | Arduino Uno / classic Nano |
| --- | --- |
| TX (sensor sends) | D2 (Arduino receives) |
| RX (sensor receives) | D3 (Arduino sends) |
| GND | GND |
| Power | A supply appropriate for **your sensor**, with a common ground |

Disconnect power before wiring. Do not rely on wire colors: confirm the pinout from the sensor's own documentation. Verify both its supply voltage **and its UART logic levels**. Some sensors accept a 5 V supply but only tolerate 3.3 V data signals; use a suitable level shifter on the Arduino-to-sensor line if needed. Do not connect 5 V to a 3.3 V-only supply or input. Make sure the supply can provide the sensor's required current. The connections above are not suitable for every Arduino board; other boards may need different serial pins or a hardware serial port.

## Install and upload

1. Install Arduino IDE. In **Library Manager**, install **Adafruit Fingerprint Sensor Library** by Adafruit, and any dependencies the IDE requests.
2. Open `ankelba_fingerprint/ankelba_fingerprint.ino` in Arduino IDE.
3. Select the correct board and processor under **Tools > Board** and, for Nano boards, **Tools > Processor**. Select the Arduino's port under **Tools > Port**.
4. Connect the wired sensor and upload the sketch. Open **Tools > Serial Monitor** at **115200 baud** and set the line ending to **Newline**. Close other programs that may be using the serial port. The sensor-side UART is configured separately at 57600 baud and uses the sensor's default password and address.

## Try enrollment and matching

Use a consenting adult's test finger and an unused sensor slot; the project does not enroll children's fingerprints. The sensor stores the reference in its own memory, so record which person and sensor each slot belongs to in a secure administrative process; do not put names, child details, or other personal data into serial commands or logs. The sketch checks for an occupied slot and refuses to overwrite it. Sensors that do not support the required index-table command cannot enroll with this sketch. Only one controller should access the sensor at a time; the slot check and store are not an atomic operation.

Send these commands through Serial Monitor, one line at a time:

| Command | Purpose |
| --- | --- |
| `STATUS` | Check whether the sensor is reachable; `READY <capacity> <count>` reports its capacity and the number of stored templates. |
| `ENROLL 1` | Enroll a finger in slot 1; replace `1` with an unused slot from 1 up to capacity minus 1. Follow the prompts to place the same finger twice, lifting it between captures. Success is `ENROLLED <id>`. |
| `SCAN` | Scan a finger and report a match or no match. |

For a first test, check status, enroll a test finger, scan the same finger, and confirm that `MATCH <id> <confidence>` reports the enrolled slot. Then scan a different, unenrolled finger and confirm it is not reported as the enrolled slot. `NO_MATCH`, `ERROR` responses and timeouts must not be treated as successful verification. If the sensor cannot be reached, recheck model compatibility, power, common ground, crossed TX/RX wiring, logic levels, and baud rates. The confidence number is sensor-specific; it is not a percentage. No images or templates are sent over USB serial.

## Before using this for pickup

This is a hardware prototype, not a completed safety system. The existing standalone biometric verification service currently returns unavailable until a device provider is configured. An integration still needs to securely associate the **specific device and sensor slot** with an active, authorized guardian, ensure that guardian is authorized for the specific child and daycare, link a fresh scan to the active pickup request, and perform the existing audited pickup workflow. It also needs secure provisioning and an authenticated, replay-resistant channel: ordinary Arduino USB serial messages can be forged or replayed, and a slot number or sensor confidence value is not proof by itself.

Protect the sensor and its stored templates, restrict enrollment and deletion to authorized staff, and plan for consent, retention, revocation, device replacement and an approved manual identity-check fallback. Validate the complete setup with the actual board and sensor, including false matches, failed scans, disconnection and restarts, before considering any real-world use. No real child should be released on the basis of this prototype alone.
