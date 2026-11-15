/**
 * auditUtils.ts
 * Formats raw database audit records and JSON metadata into clean, human-readable labels.
 * SRS Ref: §4.13 Audit and Accountability Requirements, NFR-PRV-02, NFR-USA-01.
 */

export function formatTargetEntity(targetTable?: string, targetId?: string | number): string {
  if (!targetTable) return "—";

  const tableLabels: Record<string, string> = {
    daycares: "Daycare",
    users: "User Account",
    children: "Child Profile",
    attendance: "Attendance Record",
    health_records: "Health Record",
    announcements: "Announcement",
    orders: "Store Order",
    order_items: "Order Item",
    invoices: "Invoice",
    payments: "Payment",
    daycare_applications: "Application",
    subscription_packages: "Subscription Package",
    front_desk_assignments: "Front Desk Assignment",
    care_instructions: "Care Instruction",
    emergency_contacts: "Emergency Contact",
    rooms: "Classroom",
    events: "Calendar Event",
    messages: "Direct Message",
    auth_sessions: "Auth Session",
  };

  const label =
    tableLabels[targetTable] ||
    targetTable
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return targetId ? `${label} #${targetId}` : label;
}

export function formatAuditAction(action?: string): string {
  if (!action) return "Action";
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatAuditDetails(
  action: string,
  metadata: any,
  targetTable?: string,
  targetId?: string | number
): string {
  if (!metadata) {
    if (targetTable && targetId) {
      return `Targeted ${formatTargetEntity(targetTable, targetId)}`;
    }
    return "Action completed successfully";
  }

  let m = metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch {
      return m;
    }
  }

  if (typeof m !== "object" || m === null) {
    return String(m);
  }

  const act = (action || "").toUpperCase();

  // Daycare Onboarding & Applications
  if (act.includes("APPLICATION_APPROVED")) {
    const appId = m.application_id || targetId || "";
    return `Application ${appId ? `#${appId} ` : ""}approved & center initialized`;
  }
  if (act.includes("APPLICATION_REJECTED")) {
    const appId = m.application_id || targetId || "";
    return `Application ${appId ? `#${appId} ` : ""}rejected${m.reason ? `: "${m.reason}"` : ""}`;
  }
  if (act.includes("APPLICATION_PURGED")) {
    const appId = m.application_id || targetId || "";
    return `Application ${appId ? `#${appId} ` : ""}purged from archive`;
  }
  if (act.includes("DAYCARE_REGISTERED")) {
    return `New daycare registered: ${m.daycare_name || targetId || "Pending approval"}`;
  }
  if (act.includes("DAYCARE_APPROVED")) {
    return `Daycare center verified and activated`;
  }

  // Payments and Invoicing
  if (act.includes("CHILD_PAYMENT") || act.includes("PAYMENT_RECORDED") || act.includes("PAYMENT_SUCCESS")) {
    const parts: string[] = [];
    if (m.amount_paid != null) parts.push(`${Number(m.amount_paid).toLocaleString()} ETB`);
    if (m.payment_method) {
      const method = m.payment_method.replace(/_/g, " ");
      parts.push(`via ${method.charAt(0).toUpperCase() + method.slice(1)}`);
    }
    if (m.invoice_id) parts.push(`(Invoice #${m.invoice_id})`);
    if (m.receipt_number) parts.push(`[${m.receipt_number}]`);
    return parts.length > 0 ? parts.join(" ") : `Payment recorded for Invoice #${m.invoice_id || targetId || "—"}`;
  }
  if (act.includes("INVOICES_MONTHLY") || act.includes("INVOICE_GENERATED")) {
    const total = m.total_billed != null ? `${Number(m.total_billed).toLocaleString()} ETB` : "";
    const period = m.billing_period ? `for ${m.billing_period}` : "";
    const count = m.generated_count != null ? `(${m.generated_count} issued)` : "";
    return `Generated monthly invoices: ${total} ${period} ${count}`.trim();
  }

  // Subscription and Packages
  if (act.includes("SUBSCRIPTION")) {
    if (m.reason) return `Subscription changed: ${m.reason}`;
    if (m.plan) return `Subscription plan set to ${m.plan}`;
    return "Subscription status updated";
  }
  if (act.includes("PACKAGE_UPDATED")) {
    if (m.package_name) return `Updated package "${m.package_name}"`;
    return "Subscription package parameters updated";
  }

  // Attendance & Check-in
  if (act.includes("ATTENDANCE")) {
    const type = m.type || m.event_type || "status";
    const child = m.child_name || (m.child_id ? `Child #${m.child_id}` : "");
    return `Attendance ${type} recorded ${child}`.trim();
  }

  // Biometric & Pickup Verification
  if (act.includes("PICKUP")) {
    const guardian = m.guardian_name ? `by ${m.guardian_name}` : "";
    const method = m.method ? `(${m.method})` : "";
    return `Pickup verified ${guardian} ${method}`.trim();
  }

  // Health & Incident
  if (act.includes("HEALTH_RECORD")) {
    const child = m.child_id ? ` for Child #${m.child_id}` : "";
    return m.parent_notified
      ? `Health incident notification dispatched to parent${child}`
      : `Health incident logged${child}`;
  }

  // Announcements & Communication
  if (act.includes("ANNOUNCEMENT")) {
    const aud = m.audience ? `(Audience: ${m.audience})` : "";
    return `Announcement ${m.title ? `"${m.title}"` : "published"} ${aud}`.trim();
  }

  // Auth, Password & Security
  if (act.includes("PASSWORD_RESET") || act.includes("AUTH_")) {
    if (m.reason) return `Security event: ${m.reason}`;
    return "Authentication event logged";
  }

  // Direct attributes
  if (m.reason) return `Reason: ${m.reason}`;
  if (m.message) return m.message;
  if (m.description) return m.description;

  // Key-value formatted fallback (never raw JSON curly brackets)
  const entries = Object.entries(m).filter(
    ([k, v]) => v !== undefined && v !== null && typeof v !== "object" && k !== "id"
  );
  if (entries.length > 0) {
    return entries
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join(" · ");
  }

  return "Action completed successfully";
}
