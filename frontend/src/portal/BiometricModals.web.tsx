/**
 * frontend/src/portal/BiometricModals.web.tsx
 * Interactive Biometric Modals for R307S Optical Fingerprint Sensor.
 * Handles 1-tap Front-Desk Pickup Verification and Adult Guardian Enrollment.
 * SRS Refs: FR-BIO-01..10, FR-DESK-04, FR-AUD-03
 */

import { PickupVerification } from "./PickupVerification.web";
import { isPortalPreviewPath } from "./previewPolicy";
import React, { useEffect, useState } from "react";
import { biometricSerial, SerialScannerStatus, ScanPrompt } from "../services/biometricSerial";
import { portalApi, apiError } from "./api";
import { Dataset } from "./model";
import { Badge, Button, Modal } from "./ui.web";

const BIOMETRIC_ANIMATION_STYLES = `
@keyframes biometricPulse {
  0% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
  70% { transform: scale(1.04); box-shadow: 0 0 0 16px rgba(59, 130, 246, 0); }
  100% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
}

@keyframes biometricRadarBeam {
  0% { transform: translateY(-100%); opacity: 0; }
  50% { opacity: 0.8; }
  100% { transform: translateY(100%); opacity: 0; }
}

@keyframes biometricSuccessPop {
  0% { transform: scale(0.4); opacity: 0; }
  60% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes biometricSuccessRipple {
  0% { transform: scale(0.85); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}

@keyframes biometricCheckmarkDraw {
  0% { stroke-dashoffset: 40; }
  100% { stroke-dashoffset: 0; }
}

@keyframes biometricFadeUp {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
`;

const resolveUserName = (data: Dataset, id: number) =>
  data.users.find((u) => u.id === id)?.name || "Guardian";

function BiometricScanVisualizer({
  state,
  prompt,
  guardian,
  childName,
}: {
  state: "idle" | "scanning" | "verified" | "error";
  prompt: string;
  guardian?: { name: string; relationship?: string; slotId?: number } | null;
  childName?: string;
}) {
  return (
    <div
      style={{
        background:
          state === "verified"
            ? "#ECFDF5"
            : state === "scanning"
            ? "#EFF6FF"
            : state === "error"
            ? "#FEF2F2"
            : "#F8FAFC",
        border: `1.5px solid ${
          state === "verified"
            ? "#6EE7B7"
            : state === "scanning"
            ? "#93C5FD"
            : state === "error"
            ? "#FECACA"
            : "#E2E8F0"
        }`,
        padding: "20px 16px",
        borderRadius: 12,
        textAlign: "center",
        transition: "all 0.3s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{BIOMETRIC_ANIMATION_STYLES}</style>

      {/* Central Visual Graphic */}
      <div
        style={{
          position: "relative",
          width: 72,
          height: 72,
          margin: "0 auto 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {state === "scanning" && (
          <>
            <div
              style={{
                position: "absolute",
                inset: -6,
                borderRadius: "50%",
                background: "#3B82F6",
                animation: "biometricPulse 1.8s infinite ease-in-out",
                opacity: 0.25,
              }}
            />
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "#EFF6FF",
                border: "2px solid #3B82F6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: "50%",
                  background: "linear-gradient(180deg, rgba(59,130,246,0) 0%, rgba(59,130,246,0.35) 100%)",
                  borderBottom: "2px solid #2563EB",
                  animation: "biometricRadarBeam 1.5s infinite linear",
                }}
              />
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a10 10 0 0 0-10 10c0 3.5 1.8 6.6 4.6 8.4" />
                <path d="M12 6a6 6 0 0 0-6 6c0 2.1 1.1 3.9 2.7 5" />
                <path d="M12 10a2 2 0 0 0-2 2c0 .7.4 1.3.9 1.7" />
                <path d="M12 14v4" />
                <path d="M16 10a4 4 0 0 1 4 4c0 1.5-.7 2.8-1.7 3.6" />
                <path d="M19.5 7.5A8 8 0 0 1 20 12c0 1.7-.5 3.3-1.4 4.7" />
              </svg>
            </div>
          </>
        )}

        {state === "verified" && (
          <div style={{ position: "relative" }}>
            {/* Expanding Success Ripple Ring */}
            <div
              style={{
                position: "absolute",
                inset: -8,
                borderRadius: "50%",
                border: "3px solid #10B981",
                animation: "biometricSuccessRipple 1.6s cubic-bezier(0, 0.2, 0.8, 1) infinite",
              }}
            />
            {/* Pop-in checkmark circle */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 25px -4px rgba(16, 185, 129, 0.45)",
                animation: "biometricSuccessPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
              }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline
                  points="20 6 9 17 4 12"
                  style={{
                    strokeDasharray: 40,
                    strokeDashoffset: 0,
                    animation: "biometricCheckmarkDraw 0.45s ease-out 0.15s both",
                  }}
                />
              </svg>
            </div>
          </div>
        )}

        {state === "idle" && (
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: "50%",
              background: "#F1F5F9",
              border: "1.5px solid #CBD5E1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 0 0-10 10c0 3.5 1.8 6.6 4.6 8.4" />
              <path d="M12 6a6 6 0 0 0-6 6c0 2.1 1.1 3.9 2.7 5" />
              <path d="M12 10a2 2 0 0 0-2 2c0 .7.4 1.3.9 1.7" />
              <path d="M12 14v4" />
              <path d="M16 10a4 4 0 0 1 4 4c0 1.5-.7 2.8-1.7 3.6" />
              <path d="M19.5 7.5A8 8 0 0 1 20 12c0 1.7-.5 3.3-1.4 4.7" />
            </svg>
          </div>
        )}

        {state === "error" && (
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: "50%",
              background: "#FEE2E2",
              border: "1.5px solid #F87171",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        )}
      </div>

      {/* Primary Prompt Text */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color:
            state === "verified"
              ? "#065F46"
              : state === "scanning"
              ? "#1E40AF"
              : state === "error"
              ? "#991B1B"
              : "#334155",
          lineHeight: 1.4,
        }}
      >
        {prompt}
      </div>

      {/* Verified Detail Card with Animation */}
      {state === "verified" && guardian && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "#ffffff",
            borderRadius: 8,
            border: "1.5px solid #A7F3D0",
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.12)",
            display: "inline-block",
            maxWidth: 360,
            width: "100%",
            animation: "biometricFadeUp 0.35s ease-out forwards",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#10B981",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 700, color: "#065F46" }}>
              {guardian.name}
            </span>
            {guardian.relationship && (
              <span
                style={{
                  background: "#ECFDF5",
                  color: "#065F46",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 12,
                  border: "1px solid #A7F3D0",
                }}
              >
                {guardian.relationship}
              </span>
            )}
          </div>

          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
            {childName ? `Authorized Pickup for ${childName} · ` : ""}
            {guardian.slotId ? `Sensor Slot #${guardian.slotId}` : "Biometric Verified"}
          </div>
        </div>
      )}
    </div>
  );
}

export function BiometricStatusBadge() {
  const [status, setStatus] = useState<SerialScannerStatus>(biometricSerial.getStatus());
  const [detail, setDetail] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Attempt auto-reconnect to previously granted USB port
    biometricSerial.autoConnect().catch(() => {});
    return biometricSerial.subscribeStatus((next, det) => {
      setStatus(next);
      if (det) setDetail(det);
    });
  }, []);

  if (!biometricSerial.isSupported()) {
    return (
      <span
        title="Web Serial is not supported in this browser. Use Google Chrome or Microsoft Edge for USB fingerprint scanning."
        style={{ fontSize: 13, color: "#6b7280", padding: "4px 8px", background: "#f3f4f6", borderRadius: 6 }}
      >
        Scanner: Unsupported browser
      </span>
    );
  }

  const handleConnect = async () => {
    setBusy(true);
    try {
      if (status === "ready" || status === "busy") {
        await biometricSerial.disconnect();
      } else {
        await biometricSerial.requestPort();
      }
    } catch (e: any) {
      alert(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const isReady = status === "ready";
  const isBusy = status === "busy";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        onClick={handleConnect}
        disabled={busy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: isReady ? "#ECFDF5" : isBusy ? "#EFF6FF" : "#F3F4F6",
          border: `1px solid ${isReady ? "#A7F3D0" : isBusy ? "#BFDBFE" : "#D1D5DB"}`,
          color: isReady ? "#065F46" : isBusy ? "#1E40AF" : "#4B5563",
          padding: "5px 10px",
          borderRadius: 8,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
        }}
        title={isReady ? "R307S Fingerprint Scanner Connected (Click to disconnect)" : "Click to connect USB Fingerprint Scanner"}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isReady ? "#10B981" : isBusy ? "#3B82F6" : "#9CA3AF",
            display: "inline-block",
          }}
        />
        <span>
          {isReady
            ? "R307S Ready"
            : isBusy
            ? "Scanning..."
            : status === "connecting"
            ? "Connecting..."
            : "Connect Scanner"}
        </span>
      </button>
    </div>
  );
}

export function BiometricPickupModal({ row, data, onSave, onClose }: {
  row: any; data: Dataset; onSave: (values: any) => Promise<void> | void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return <Modal title="Verify pickup" onClose={onClose} closeDisabled={busy}>
    <PickupVerification row={row} data={data} onSave={onSave} onClose={onClose}
      onBusyChange={setBusy} preview={isPortalPreviewPath(window.location.pathname)} />
  </Modal>;
}

export function BiometricEnrollModal({
  row,
  onSuccess,
  onClose,
}: {
  row: {
    guardian_link_id: number;
    child_id: number;
    user_id: number;
    guardian_name: string;
    child_name?: string;
  };
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [scannerStatus, setScannerStatus] = useState<SerialScannerStatus>(biometricSerial.getStatus());
  const [slotId, setSlotId] = useState<number | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [promptText, setPromptText] = useState<string>("Ready: Click 'Start Enrollment' to begin 2-phase scanning");
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    biometricSerial.autoConnect().catch(() => {});
    portalApi
      .getBiometricSlots()
      .then((res) => {
        if (res.next_slot) setSlotId(res.next_slot);
      })
      .catch((e) => setError(apiError(e)));

    return biometricSerial.subscribeStatus((st) => setScannerStatus(st));
  }, []);

  const handleStartEnroll = async () => {
    if (!slotId) {
      setError("No available slot on the sensor.");
      return;
    }
    setEnrolling(true);
    setError(null);
    setPromptText("👉 Step 1: Place parent's finger firmly on the optical sensor...");

    try {
      const result = await biometricSerial.enroll(slotId, (prompt: ScanPrompt) => {
        if (prompt === "PLACE_FINGER") {
          setPromptText("👉 Step 1: Place finger on the optical sensor...");
        } else if (prompt === "REMOVE_FINGER") {
          setPromptText("👆 Step 2: Lift finger from the sensor...");
        } else if (prompt === "PLACE_SAME_FINGER") {
          setPromptText("👉 Step 3: Place the SAME finger on the sensor again...");
        }
      });

      if (!result.success) {
        setError(result.error || "Enrollment could not be completed. Please try again.");
        setPromptText("❌ Enrollment stopped. Please try again.");
        return;
      }

      setPromptText("Saving biometric reference in database...");
      setBusy(true);

      // Save to database
      await portalApi.enrollBiometricDevice(row.guardian_link_id, slotId);

      setCompleted(true);
      setPromptText(`🎉 Success! Fingerprint enrolled into Slot #${slotId} for ${row.guardian_name}.`);
    } catch (e: any) {
      setError(apiError(e));
      setPromptText("Error during enrollment.");
    } finally {
      setEnrolling(false);
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    try {
      await biometricSerial.requestPort();
    } catch (e: any) {
      setError(apiError(e));
    }
  };

  return (
    <Modal title={`Enroll Fingerprint · ${row.guardian_name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ background: "#F0FDF4", padding: "12px 14px", borderRadius: 8, border: "1px solid #BBF7D0", fontSize: 13, color: "#166534" }}>
          <strong>Adult Guardian Biometric Enrollment (SRS FR-BIO-01 &amp; FR-BIO-02)</strong>
          <p style={{ margin: "4px 0 0", fontSize: 13 }}>
            Enrolling authorized parent <strong>{row.guardian_name}</strong> for child pickup
            {row.child_name ? ` of ${row.child_name}` : ""}. Children are never biometrically enrolled.
          </p>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "10px 12px", borderRadius: 6, fontSize: 13 }}>
            <strong>Error: </strong>{error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#64748B" }}>
            Sensor Slot: <strong>{slotId ? `#${slotId}` : "Searching..."}</strong> · Hardware: <strong>R307S (USB)</strong>
          </span>
          {scannerStatus !== "ready" && scannerStatus !== "busy" && (
            <Button variant="secondary small" onClick={handleConnect}>
              Connect USB Scanner
            </Button>
          )}
        </div>

        {/* Guided Step Box with Animations */}
        <BiometricScanVisualizer
          state={completed ? "verified" : enrolling ? "scanning" : error ? "error" : "idle"}
          prompt={promptText}
          guardian={completed ? { name: row.guardian_name, slotId: slotId ?? undefined } : null}
          childName={row.child_name}
        />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          {!completed ? (
            <>
              <Button variant="quiet" onClick={onClose} disabled={busy || enrolling}>
                Cancel
              </Button>
              <Button
                onClick={handleStartEnroll}
                disabled={busy || enrolling || !slotId || (scannerStatus !== "ready" && scannerStatus !== "busy")}
              >
                {enrolling ? "Enrolling in progress..." : "Start 2-Phase Enrollment"}
              </Button>
            </>
          ) : (
            <Button
              onClick={() => {
                onSuccess();
                onClose();
              }}
            >
              Done
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
