export function isFingerprintNotRecognized(raw?: string | null): boolean {
  const message = String(raw || "").toLowerCase();
  return (
    message.includes("no_match") ||
    message.includes("does not match") ||
    message.includes("not recognized") ||
    message.includes("not found")
  );
}

export function fingerprintFailureMessage(raw?: string | null): string {
  const message = String(raw || "").toLowerCase();
  if (isFingerprintNotRecognized(raw)) {
    return "Fingerprint not recognized. Try again or use the approved manual identity check.";
  }
  if (message.includes("timeout")) {
    return "The scan timed out. Ask the adult to place their finger firmly on the sensor and try again.";
  }
  if (
    message.includes("image") ||
    message.includes("capture") ||
    message.includes("search") ||
    message.includes("feature")
  ) {
    return "The scanner could not read the fingerprint clearly. Clean the sensor, reposition the finger, and try again.";
  }
  if (
    message.includes("sensor_unavailable") ||
    message.includes("not connected") ||
    message.includes("disconnected") ||
    message.includes("connection")
  ) {
    return "The fingerprint scanner is not connected. Check the USB connection and reconnect it.";
  }
  if (message.includes("cancel")) {
    return "The fingerprint scan was cancelled. Start a new scan when the adult is ready.";
  }
  return "Fingerprint verification could not be completed. Check the scanner and try again.";
}
