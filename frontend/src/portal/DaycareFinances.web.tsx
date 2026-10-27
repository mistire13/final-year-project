import React, { useEffect, useState } from "react";
import { portalApi, apiError } from "./api";
import { Badge, Button, Card, Icon, Modal, Person } from "./ui.web";
import { money } from "./model";

interface Invoice {
  id: number;
  daycare_id: number;
  child_id: number;
  parent_id?: number | null;
  invoice_type: string;
  billing_period: string;
  title: string;
  amount: number | string;
  amount_paid: number | string;
  balance_remaining: number | string;
  due_date: string;
  status: "pending" | "partially_paid" | "paid" | "overdue" | "cancelled";
  notes?: string | null;
  child_name: string;
  child_photo?: string | null;
  group_name?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  created_at: string;
}

interface PaymentRecord {
  id: number;
  invoice_id: number;
  amount_paid: number | string;
  payment_method: string;
  reference_code?: string | null;
  receipt_number: string;
  verified_at: string;
  notes?: string | null;
  recorded_by_name?: string | null;
}

interface OverviewData {
  total_billed: number;
  total_collected: number;
  total_outstanding: number;
  total_overdue: number;
  collection_rate_percent: number;
  invoices_count: {
    pending: number;
    partially_paid: number;
    paid: number;
    overdue: number;
    cancelled: number;
    total: number;
  };
  recent_payments: any[];
}

export function DaycareFinances({ ctx }: { ctx?: any }) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Modals state
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [genPeriod, setGenPeriod] = useState<string>(
    new Date().toISOString().slice(0, 7)
  );
  const [genDueDate, setGenDueDate] = useState<string>(
    `${new Date().toISOString().slice(0, 7)}-10`
  );
  const [genFee, setGenFee] = useState<string>("3500.00");
  const [genBusy, setGenBusy] = useState<boolean>(false);
  const [genNotice, setGenNotice] = useState<string | null>(null);

  // Payment modal state
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<string>("cash_at_daycare");
  const [payReference, setPayReference] = useState<string>("");
  const [payNotes, setPayNotes] = useState<string>("");
  const [payBusy, setPayBusy] = useState<boolean>(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Digital Receipt modal state
  const [viewReceipt, setViewReceipt] = useState<any | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ovData, invData] = await Promise.all([
        portalApi.getFinancesOverview(),
        portalApi.getInvoices({
          status: statusFilter,
          billingPeriod: periodFilter,
          search: searchTerm,
        }),
      ]);
      setOverview(ovData);
      setInvoices(invData);
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, periodFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenBusy(true);
    setGenNotice(null);
    try {
      const res = await portalApi.generateMonthlyInvoices({
        billingPeriod: genPeriod,
        dueDate: genDueDate,
        defaultFee: parseFloat(genFee) || 3500.0,
      });
      setGenNotice(res.message);
      await loadData();
      setTimeout(() => {
        setShowGenerateModal(false);
        setGenNotice(null);
      }, 1500);
    } catch (err: any) {
      setGenNotice(apiError(err));
    } finally {
      setGenBusy(false);
    }
  };

  const openPayModal = (inv: Invoice) => {
    setPayingInvoice(inv);
    const remaining = parseFloat(String(inv.balance_remaining)) || 0;
    setPayAmount(remaining.toFixed(2));
    setPayMethod("cash_at_daycare");
    setPayReference("");
    setPayNotes("");
    setPayError(null);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingInvoice) return;
    setPayBusy(true);
    setPayError(null);
    try {
      const res = await portalApi.recordInvoicePayment(payingInvoice.id, {
        amount_paid: parseFloat(payAmount),
        payment_method: payMethod,
        reference_code: payReference || undefined,
        notes: payNotes || undefined,
      });
      setPayingInvoice(null);
      // Immediately display the newly generated digital receipt!
      setViewReceipt(res.receipt);
      await loadData();
    } catch (err: any) {
      setPayError(apiError(err));
    } finally {
      setPayBusy(false);
    }
  };

  const openInvoiceBreakdown = async (invoiceId: number) => {
    setLoadingDetails(true);
    try {
      const details = await portalApi.getInvoice(invoiceId);
      setInvoiceDetails(details);
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="daycare-finances-container" style={{ display: "flex", flexDirection: "column", gap: 24, padding: "8px 0" }}>
      {/* Top Header & Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--navy)", margin: 0 }}>
            Child Care Fees & Invoicing
          </h1>
          <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
            ወርሃዊ የመቆያ ክፍያ አስተዳደር — Monthly child care fee generation, payment collection, and digital receipts.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Button
            variant="ghost"
            icon="refresh"
            onClick={loadData}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            icon="file"
            onClick={() => setShowGenerateModal(true)}
            style={{ background: "var(--green)", color: "#fff" }}
          >
            Generate Monthly Fees
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-error" style={{ background: "#ffebee", border: "1px solid #ef5350", color: "#c62828", padding: "12px 16px", borderRadius: 10 }}>
          {error}
        </div>
      )}

      {/* Overview KPI Cards */}
      {overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <Card className="finance-kpi-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase" }}>Total Collected</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", background: "#e8f5e9", padding: "2px 8px", borderRadius: 12 }}>
                {overview.collection_rate_percent}% Collected
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--green)" }}>
              {money(overview.total_collected)}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              Received via cash & bank transfers
            </div>
          </Card>

          <Card className="finance-kpi-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase" }}>Total Billed</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", background: "#e8eaf6", padding: "2px 8px", borderRadius: 12 }}>
                {overview.invoices_count.total} Invoices
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--navy)" }}>
              {money(overview.total_billed)}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              Active care fees this period
            </div>
          </Card>

          <Card className="finance-kpi-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase" }}>Outstanding Balance</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#f57c00", background: "#fff3e0", padding: "2px 8px", borderRadius: 12 }}>
                {overview.invoices_count.pending + overview.invoices_count.partially_paid} Unpaid
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#e65100" }}>
              {money(overview.total_outstanding)}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              Awaiting parent payments
            </div>
          </Card>

          <Card className="finance-kpi-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase" }}>Overdue Fees</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: overview.total_overdue > 0 ? "#c62828" : "#888", background: overview.total_overdue > 0 ? "#ffebee" : "#f5f5f5", padding: "2px 8px", borderRadius: 12 }}>
                Past Due
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: overview.total_overdue > 0 ? "#c62828" : "#666" }}>
              {money(overview.total_overdue)}
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
              Exceeded payment due date
            </div>
          </Card>
        </div>
      )}

      {/* Invoices List Card & Table */}
      <Card title="Fee Billing Ledger & Receipts">
        {/* Filters bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16, borderBottom: "1px solid #f0eee6", paddingBottom: 16 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All Statuses" },
              { id: "pending", label: "Pending" },
              { id: "partially_paid", label: "Partially Paid" },
              { id: "paid", label: "Paid" },
              { id: "overdue", label: "Overdue" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  background: statusFilter === tab.id ? "var(--navy)" : "#fff",
                  color: statusFilter === tab.id ? "#fff" : "var(--navy)",
                  border: "1px solid #dcd7cc",
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="month"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #dcd7cc",
                fontSize: 12,
              }}
            />
            <input
              type="text"
              placeholder="Search child or parent…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #dcd7cc",
                fontSize: 12,
                minWidth: 180,
              }}
            />
            <Button type="submit" variant="ghost" icon="search">
              Search
            </Button>
          </form>
        </div>

        {/* Invoices Table */}
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
            Loading daycare billing records…
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#666" }}>
            <Icon name="file" size={32} />
            <h3 style={{ margin: "12px 0 4px", fontSize: 16 }}>No invoices found</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#888" }}>
              Click "Generate Monthly Fees" to bill all enrolled children for {periodFilter}.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fcfbf7", borderBottom: "1px solid #e8e5dc", color: "#777", textTransform: "uppercase", fontSize: 11 }}>
                  <th style={{ padding: "10px 14px" }}>Child & Group</th>
                  <th style={{ padding: "10px 14px" }}>Parent Contact</th>
                  <th style={{ padding: "10px 14px" }}>Invoice Title</th>
                  <th style={{ padding: "10px 14px" }}>Amount</th>
                  <th style={{ padding: "10px 14px" }}>Balance</th>
                  <th style={{ padding: "10px 14px" }}>Due Date</th>
                  <th style={{ padding: "10px 14px" }}>Status</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const remaining = parseFloat(String(inv.balance_remaining)) || 0;
                  const isPaid = inv.status === "paid";
                  const isOverdue = inv.status === "overdue" || (new Date(inv.due_date) < new Date() && !isPaid);

                  return (
                    <tr key={inv.id} style={{ borderBottom: "1px solid #f0eee6" }}>
                      <td style={{ padding: "12px 14px" }}>
                        <Person name={inv.child_name} sub={inv.group_name || "General Group"} />
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, color: "var(--navy)" }}>{inv.parent_name || "Unlinked Parent"}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{inv.parent_phone || inv.parent_email || "No phone registered"}</div>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600 }}>{inv.title}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>Period: {inv.billing_period}</div>
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--navy)" }}>
                        {money(inv.amount)}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontWeight: 700, color: remaining > 0 ? "#e65100" : "var(--green)" }}>
                          {money(remaining)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", color: isOverdue ? "#c62828" : "#555", fontWeight: isOverdue ? 700 : 400 }}>
                        {inv.due_date?.slice(0, 10)}
                        {isOverdue && <span style={{ marginLeft: 4, fontSize: 10, color: "#c62828" }}>(Overdue)</span>}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <Badge
                          value={inv.status}
                          tone={
                            isPaid
                              ? "green"
                              : inv.status === "partially_paid"
                              ? "gold"
                              : isOverdue
                              ? "red"
                              : "neutral"
                          }
                        />
                      </td>
                      <td style={{ padding: "12px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {!isPaid && (
                            <button
                              type="button"
                              onClick={() => openPayModal(inv)}
                              style={{
                                background: "var(--green)",
                                color: "#fff",
                                border: "none",
                                padding: "5px 10px",
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Record Payment
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openInvoiceBreakdown(inv.id)}
                            style={{
                              background: "#f0f2f5",
                              color: "var(--navy)",
                              border: "1px solid #dcd7cc",
                              padding: "5px 10px",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Receipts
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* MODAL 1: Batch Generate Monthly Care Fees */}
      {showGenerateModal && (
        <Modal title="Generate Monthly Child Care Fees" onClose={() => setShowGenerateModal(false)}>
          <form onSubmit={handleGenerate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: "#555", margin: 0 }}>
              Auto-generate monthly care fee invoices for all active enrolled children.
              Children already invoiced for this period will be safely skipped.
            </p>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Billing Period (Month)
              <input
                type="month"
                value={genPeriod}
                onChange={(e) => {
                  setGenPeriod(e.target.value);
                  setGenDueDate(`${e.target.value}-10`);
                }}
                required
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dcd7cc", fontSize: 13 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Payment Due Date
              <input
                type="date"
                value={genDueDate}
                onChange={(e) => setGenDueDate(e.target.value)}
                required
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dcd7cc", fontSize: 13 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Default Care Fee (ETB)
              <input
                type="number"
                step="0.01"
                value={genFee}
                onChange={(e) => setGenFee(e.target.value)}
                required
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dcd7cc", fontSize: 13 }}
              />
              <small style={{ color: "#888", fontWeight: 400 }}>
                Used if a child has not been assigned a custom care fee on their profile.
              </small>
            </label>

            {genNotice && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#e8f5e9", color: "var(--green)", fontSize: 13, fontWeight: 600 }}>
                {genNotice}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setShowGenerateModal(false)} disabled={genBusy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={genBusy} style={{ background: "var(--green)", color: "#fff" }}>
                {genBusy ? "Generating Invoices…" : "Generate Invoices Now"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: Record Payment */}
      {payingInvoice && (
        <Modal title={`Record Payment · ${payingInvoice.child_name}`} onClose={() => setPayingInvoice(null)}>
          <form onSubmit={handleRecordPayment} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#fcfbf7", padding: "12px 14px", borderRadius: 8, border: "1px solid #e8e5dc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#666" }}>Invoice:</span>
                <span style={{ fontWeight: 700 }}>{payingInvoice.title}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#666" }}>Total Invoice Amount:</span>
                <span style={{ fontWeight: 700 }}>{money(payingInvoice.amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "#666" }}>Remaining Balance:</span>
                <span style={{ fontWeight: 800, color: "#e65100" }}>{money(payingInvoice.balance_remaining)}</span>
              </div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Amount to Pay (ETB)
              <input
                type="number"
                step="0.01"
                max={parseFloat(String(payingInvoice.balance_remaining))}
                min="1"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dcd7cc", fontSize: 14, fontWeight: 700 }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Payment Method
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dcd7cc", fontSize: 13 }}
              >
                <option value="cash_at_daycare">Cash at Daycare Front Desk (ጥሬ ገንዘብ)</option>
                <option value="telebirr_transfer">Telebirr Mobile Transfer (ቴሌብር)</option>
                <option value="cbe_transfer">CBE Mobile / Bank Transfer (የኢትዮጵያ ንግድ ባንክ)</option>
                <option value="digital_gateway">Digital Payment Gateway</option>
              </select>
            </label>

            {payMethod !== "cash_at_daycare" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
                Transaction Reference Code
                <input
                  type="text"
                  placeholder="e.g. TB-89234812 / CBE-77234"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  required
                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dcd7cc", fontSize: 13 }}
                />
              </label>
            )}

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 700 }}>
              Notes / Receipt Remarks
              <input
                type="text"
                placeholder="Optional notes for the parent receipt"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #dcd7cc", fontSize: 13 }}
              />
            </label>

            {payError && (
              <div role="alert" className="p-error" style={{ background: "#ffebee", padding: "10px 14px", borderRadius: 8, color: "#c62828", fontSize: 12 }}>
                {payError}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <Button variant="ghost" onClick={() => setPayingInvoice(null)} disabled={payBusy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={payBusy} style={{ background: "var(--green)", color: "#fff" }}>
                {payBusy ? "Recording & Issuing Receipt…" : "Confirm & Issue Receipt"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: Digital Receipt Presentation */}
      {viewReceipt && (
        <Modal title="Official Digital Receipt · ሕጋዊ ደረሰኝ" onClose={() => setViewReceipt(null)}>
          <div className="printable-receipt" style={{ padding: "8px 4px", display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Receipt Header */}
            <div style={{ borderBottom: "2px dashed #ccc", paddingBottom: 16, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--navy)" }}>
                {viewReceipt.daycare_name || "Ankelba Daycare Center"}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                Official Child Care Fee Receipt
              </div>
              <div style={{ display: "inline-block", marginTop: 8, background: "#e8f5e9", color: "var(--green)", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                RECEIPT #{viewReceipt.receipt_number}
              </div>
            </div>

            {/* Receipt Details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
              <div>
                <span style={{ color: "#777", fontSize: 11, display: "block" }}>CHILD NAME</span>
                <strong>{viewReceipt.child_name}</strong>
              </div>
              <div>
                <span style={{ color: "#777", fontSize: 11, display: "block" }}>PARENT / GUARDIAN</span>
                <strong>{viewReceipt.parent_name || "N/A"}</strong>
              </div>
              <div>
                <span style={{ color: "#777", fontSize: 11, display: "block" }}>FOR ITEM</span>
                <span>{viewReceipt.title}</span>
              </div>
              <div>
                <span style={{ color: "#777", fontSize: 11, display: "block" }}>DATE & TIME</span>
                <span>{new Date(viewReceipt.verified_at).toLocaleString()}</span>
              </div>
              <div>
                <span style={{ color: "#777", fontSize: 11, display: "block" }}>PAYMENT METHOD</span>
                <span style={{ textTransform: "capitalize", fontWeight: 600 }}>
                  {viewReceipt.payment_method?.replace(/_/g, " ")}
                </span>
              </div>
              <div>
                <span style={{ color: "#777", fontSize: 11, display: "block" }}>REFERENCE CODE</span>
                <code>{viewReceipt.reference_code || "CASH-FRONT-DESK"}</code>
              </div>
            </div>

            {/* Financial Totals */}
            <div style={{ background: "#fcfbf7", padding: "14px 16px", borderRadius: 10, border: "1px solid #e8e5dc", marginTop: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span>Total Invoice Amount:</span>
                <span>{money(viewReceipt.total_invoice_amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "var(--green)", borderTop: "1px solid #e8e5dc", paddingTop: 8, marginBottom: 6 }}>
                <span>Amount Paid This Receipt:</span>
                <span>{money(viewReceipt.amount_paid)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666" }}>
                <span>Remaining Balance:</span>
                <span>{money(viewReceipt.balance_remaining)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setViewReceipt(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                icon="check"
                onClick={() => window.print()}
                style={{ background: "var(--navy)", color: "#fff" }}
              >
                Print / Save Receipt
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 4: Single Invoice Breakdown & Prior Receipts History */}
      {invoiceDetails && (
        <Modal title={`Invoice Breakdown · ${invoiceDetails.child_name}`} onClose={() => setInvoiceDetails(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#fcfbf7", padding: "12px 14px", borderRadius: 8, border: "1px solid #e8e5dc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#666", fontSize: 13 }}>Invoice:</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{invoiceDetails.title}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#666", fontSize: 13 }}>Period & Due Date:</span>
                <span style={{ fontSize: 13 }}>{invoiceDetails.billing_period} (Due: {invoiceDetails.due_date?.slice(0, 10)})</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#666", fontSize: 13 }}>Total Billed:</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{money(invoiceDetails.amount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#666", fontSize: 13 }}>Remaining Balance:</span>
                <span style={{ fontWeight: 800, fontSize: 13, color: parseFloat(String(invoiceDetails.balance_remaining)) > 0 ? "#e65100" : "var(--green)" }}>
                  {money(invoiceDetails.balance_remaining)}
                </span>
              </div>
            </div>

            <h4 style={{ margin: "4px 0 0", fontSize: 14, color: "var(--navy)" }}>
              Payment Receipts ({invoiceDetails.payments?.length || 0})
            </h4>

            {(!invoiceDetails.payments || invoiceDetails.payments.length === 0) ? (
              <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
                No payments have been recorded for this invoice yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {invoiceDetails.payments.map((p: PaymentRecord) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, border: "1px solid #e8e5dc", background: "#fff" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.receipt_number}</div>
                      <div style={{ fontSize: 11, color: "#777" }}>
                        {new Date(p.verified_at).toLocaleDateString()} · {p.payment_method?.replace(/_/g, " ")}
                        {p.reference_code && ` · Ref: ${p.reference_code}`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800, color: "var(--green)", fontSize: 14 }}>
                        {money(p.amount_paid)}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setViewReceipt({
                            receipt_number: p.receipt_number,
                            invoice_id: invoiceDetails.id,
                            title: invoiceDetails.title,
                            daycare_name: invoiceDetails.daycare_name,
                            child_name: invoiceDetails.child_name,
                            parent_name: invoiceDetails.parent_name,
                            amount_paid: p.amount_paid,
                            total_invoice_amount: invoiceDetails.amount,
                            balance_remaining: invoiceDetails.balance_remaining,
                            payment_method: p.payment_method,
                            reference_code: p.reference_code,
                            verified_at: p.verified_at,
                          });
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--navy)",
                          textDecoration: "underline",
                          fontSize: 11,
                          cursor: "pointer",
                          padding: 0,
                          marginTop: 2,
                        }}
                      >
                        View Full Receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setInvoiceDetails(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default DaycareFinances;
