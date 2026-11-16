import React, { useEffect, useRef, useState } from "react";
import { Dataset, Row } from "./model";
import { Badge, Button, Icon, Person } from "./ui.web";
import { apiError, portalApi } from "./api";
import { biometricSerial } from "../services/biometricSerial";
import {
  fingerprintFailureMessage,
  isFingerprintNotRecognized,
} from "./fingerprintPresentation";

type FingerprintState =
  | "idle"
  | "scanning"
  | "matched"
  | "not-matched"
  | "denied"
  | "error";

export function PickupVerification({
  row,
  data,
  onSave,
  onClose,
  preview = false,
  onBusyChange,
}: {
  row: Row;
  data: Dataset;
  onSave: (values: any) => Promise<void> | void;
  onClose: () => void;
  preview?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<"fingerprint" | "manual">("fingerprint");
  const [status, setStatus] = useState(biometricSerial.getStatus());
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(
    "Ask the approved adult to place their finger on the scanner.",
  );
  const [error, setError] = useState("");
  const [verified, setVerified] = useState<any>(null);
  const [fingerprintState, setFingerprintState] =
    useState<FingerprintState>("idle");
  const [guardianKey, setGuardianKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!preview) void biometricSerial.autoConnect().catch(() => {});
    const unsubscribe = biometricSerial.subscribeStatus(setStatus);
    return () => {
      mounted.current = false;
      unsubscribe();
    };
  }, [preview]);
  const adults = [
    ...data.guardians
      .filter(
        (g) =>
          g.child_id === row.id &&
          g.pickup_authorized &&
          data.users.some((u) => u.id === g.user_id && u.status === "active"),
      )
      .map((g) => ({
        key: `user:${g.user_id}`,
        name: data.users.find((u) => u.id === g.user_id)?.name,
        relationship: g.relationship || "Guardian",
      })),
    ...(data.guardianRequests || [])
      .filter((g) => g.child_id === row.id && g.status === "approved")
      .map((g) => ({
        key: `pickup:${g.id}`,
        name: g.name,
        relationship: g.relationship,
      })),
  ];
  const verifiedApproved =
    verified && adults.some((a) => a.key === `user:${verified.id}`);
  const manualApproved = adults.some((a) => a.key === guardianKey);
  const run = async (
    work: () => Promise<void>,
    onFailure?: (message: string) => void,
  ) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    onBusyChange?.(true);
    try {
      await work();
    } catch (e) {
      if (mounted.current) {
        const message = apiError(e);
        setError(message);
        onFailure?.(message);
      }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  const scan = () =>
    run(async () => {
      setVerified(null);
      setFingerprintState("scanning");
      setPrompt("Place a finger on the scanner.");
      let result;
      try {
        result = await biometricSerial.scan((prompt) => {
          if (mounted.current)
            setPrompt(
              prompt === "REMOVE_FINGER"
                ? "Lift the finger from the scanner."
                : prompt === "PLACE_SAME_FINGER"
                  ? "Place the same finger on the scanner again."
                  : "Keep the finger still on the scanner.",
            );
        });
      } catch (e) {
        throw Error(fingerprintFailureMessage(apiError(e)));
      }
      if (!mounted.current) return;
      if (!result.match || result.slotId == null) {
        if (isFingerprintNotRecognized(result.error)) {
          setFingerprintState("not-matched");
          setPrompt(fingerprintFailureMessage(result.error));
          return;
        }
        throw Error(fingerprintFailureMessage(result.error));
      }
      setPrompt("Checking pickup authorization…");
      const check = await portalApi.identifyBiometricBySlot(
        row.id,
        result.slotId,
      );
      if (!mounted.current) return;
      if (!check.authorized || !check.guardian) {
        setFingerprintState("denied");
        setPrompt(
          check.reason || "This adult is not approved to collect this child.",
        );
        return;
      }
      setVerified({ ...check.guardian, slotId: result.slotId });
      setFingerprintState("matched");
      setPrompt("Fingerprint matched and pickup authorization confirmed.");
    }, (message) => {
      setFingerprintState("error");
      setPrompt(message);
    });
  const complete = () =>
    run(async () => {
      if (mode === "fingerprint" && !verifiedApproved)
        throw Error("Verify an approved adult first.");
      if (
        mode === "manual" &&
        (!manualApproved || !confirmed || reason.trim().length < 12)
      )
        throw Error(
          "Select an approved adult and complete the identity check.",
        );
      await onSave(
        mode === "fingerprint"
          ? {
              method: "biometric",
              guardian_key: `user:${verified.id}`,
              reason: `Fingerprint verified at front desk (slot ${verified.slotId})`,
              match_score: 0.95,
            }
          : {
              method: "manual",
              guardian_key: guardianKey,
              identity_confirmed: true,
              reason: reason.trim(),
            },
      );
      if (mounted.current) onClose();
    });
  const ready = status === "ready";
  const statusLabel = preview
    ? "Scanner unavailable in preview"
    : {
        ready: "Scanner connected",
        busy: "Scanner in use",
        connecting: "Connecting scanner…",
        unsupported: "Scanner unavailable in this browser",
        error: "Scanner connection failed",
        disconnected: "Scanner disconnected",
      }[status];
  return (
    <section
      className="p-pickup-verify"
      aria-label={`Verify pickup for ${row.full_name}`}
    >
      <div className="p-desk-child-summary">
        <Person
          name={row.full_name}
          photo={row.photo_url}
          sub={
            data.groups.find((g) => g.id === row.group_id)?.name ||
            "No classroom assigned"
          }
        />
        <Badge value="At daycare" tone="green" />
      </div>
      <div className="p-desk-tabs" aria-label="Verification method">
        <button
          type="button"
          aria-pressed={mode === "fingerprint"}
          disabled={busy}
          onClick={() => {
            setMode("fingerprint");
            setError("");
            setFingerprintState(verifiedApproved ? "matched" : "idle");
            setConfirmed(false);
          }}
        >
          Fingerprint
        </button>
        <button
          type="button"
          aria-pressed={mode === "manual"}
          disabled={busy}
          onClick={() => {
            setMode("manual");
            setError("");
            setVerified(null);
            setFingerprintState("idle");
          }}
        >
          Manual check
        </button>
      </div>
      {error && (mode === "manual" || fingerprintState === "idle") && (
        <div className="p-error" role="alert">
          {error}
        </div>
      )}
      {!adults.length ? (
        <div className="p-desk-empty">
          <Icon name="shield" size={28} />
          <h3>No approved pickup adult</h3>
          <p>
            Ask your daycare administrator to review this child’s guardian
            records before pickup.
          </p>
        </div>
      ) : mode === "fingerprint" ? (
        <>
          <div className="p-scanner-line">
            <Badge
              value={statusLabel}
              tone={ready && !preview ? "green" : "neutral"}
            />
            {!preview && ["disconnected", "error"].includes(status) && (
              <Button
                variant="secondary small"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (
                      !(await biometricSerial.requestPort()) &&
                      biometricSerial.getStatus() === "error"
                    )
                      throw Error(
                        "Could not connect. Check the scanner and try again.",
                      );
                  })
                }
              >
                Connect scanner
              </Button>
            )}
          </div>
          <div
            className={`p-verification-state ${fingerprintState}`}
            aria-live="polite"
            role="status"
          >
            <span className="p-verification-icon">
              <Icon
                name={
                  fingerprintState === "matched"
                    ? "check"
                    : fingerprintState === "not-matched" ||
                        fingerprintState === "denied" ||
                        fingerprintState === "error"
                      ? "close"
                      : "fingerprint"
                }
                size={32}
              />
            </span>
            <div className="p-verification-copy">
              <h3>
                {fingerprintState === "matched"
                  ? "Pickup authorized"
                  : fingerprintState === "not-matched"
                    ? "Fingerprint not recognized"
                    : fingerprintState === "denied"
                      ? "Pickup not authorized"
                      : fingerprintState === "error"
                        ? "Scanner needs attention"
                        : fingerprintState === "scanning"
                          ? "Scanning fingerprint"
                          : "Ready to verify"}
              </h3>
              {fingerprintState === "matched" && verifiedApproved ? (
                <>
                  <div className="p-verification-person">
                    <strong>{verified.name}</strong>
                    <span>{verified.relationship || "Guardian"}</span>
                  </div>
                  <p>Fingerprint matched an approved pickup adult for {row.full_name}.</p>
                  <div className="p-verification-confirmed">
                    <Icon name="checkCircle" size={18} />
                    Identity and pickup permission verified
                  </div>
                </>
              ) : (
                <p>
                  {preview
                    ? "Use Manual check to explore the pickup flow with sample records."
                    : status === "unsupported"
                      ? "Open this workspace in Chrome or Edge to use a USB scanner, or choose Manual check."
                      : fingerprintState === "not-matched" ||
                          fingerprintState === "denied" ||
                          fingerprintState === "error" ||
                          fingerprintState === "scanning"
                        ? prompt
                        : ready
                          ? "Place the approved adult’s finger on the scanner to confirm identity and pickup permission."
                          : "Connect the scanner to begin, or choose Manual check."}
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="p-manual-check">
          <p className="p-desk-muted">
            Check the adult’s identity against the approved record before
            confirming pickup.
          </p>
          <label>
            Collecting adult
            <select
              value={guardianKey}
              disabled={busy}
              onChange={(e) => {
                setGuardianKey(e.target.value);
                setConfirmed(false);
                setReason("");
                setError("");
              }}
            >
              <option value="">Select an approved adult</option>
              {adults.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} · {a.relationship}
                </option>
              ))}
            </select>
          </label>
          <label className="p-identity-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !manualApproved}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I checked this adult’s identity against the approved guardian
              record.
            </span>
          </label>
          <label>
            Verification note
            <textarea
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="For example: Photo ID checked against the approved guardian record."
              aria-describedby={`pickup-note-${row.id}`}
            />
            <small id={`pickup-note-${row.id}`}>
              Describe the check performed. At least 12 characters.
            </small>
          </label>
        </div>
      )}
      <footer className="p-desk-action-footer">
        <p>Confirming pickup records this child’s checkout.</p>
        <div>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {mode === "fingerprint" && verifiedApproved && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setVerified(null);
                setError("");
                setFingerprintState("idle");
              }}
            >
              Scan again
            </Button>
          )}
          {mode === "fingerprint" && !verifiedApproved ? (
            <Button
              disabled={busy || !ready || preview || !adults.length}
              onClick={scan}
            >
              {busy
                ? "Verifying…"
                : fingerprintState === "not-matched" ||
                    fingerprintState === "denied" ||
                    fingerprintState === "error"
                  ? "Try scan again"
                  : "Scan fingerprint"}
            </Button>
          ) : (
            <Button
              disabled={
                busy ||
                (mode === "manual" &&
                  (!manualApproved || !confirmed || reason.trim().length < 12))
              }
              onClick={complete}
            >
              {busy ? "Recording pickup…" : "Confirm pickup"}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}
