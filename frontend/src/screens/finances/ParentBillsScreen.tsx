import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator, Pressable, ScrollView, Modal } from "react-native";
import { Receipt } from "phosphor-react-native/src/icons/Receipt";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import {
  Page,
  Text,
  Card,
  Badge,
  Button,
  Notice,
  s,
} from "../../components/design/System";
import { getMyBills, ParentBill, ParentPaymentReceipt } from "../../api/parentApi";
import { formatMoney } from "../store/catalog";
import BillingReminderPreferences from "./BillingReminderPreferences";
import ReceiptPaymentCard from '../payments/ReceiptPaymentCard';
import {paymentProvenanceLabel} from '../../types/daycarePayments';
import {invoiceIsOverdue} from '../../utils/billingDates';

export function ParentBillsScreen({ navigation }: any) {
  const [bills, setBills] = useState<ParentBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    receipt: ParentPaymentReceipt;
    bill: ParentBill;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"active" | "paid">("active");
  const [bankBill,setBankBill]=useState<number|null>(null);

  const loadBills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyBills();
      setBills(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || "Failed to load daycare bills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
    const unsub = navigation.addListener?.("focus", loadBills);
    return () => unsub?.();
  }, [navigation, loadBills]);

  const totalOutstanding = bills
    .filter((b) => b.status !== "paid" && b.status !== "cancelled")
    .reduce((sum, b) => sum + (parseFloat(String(b.balance_remaining)) || 0), 0);

  const activeBills = bills.filter((b) => b.status !== "paid" && b.status !== "cancelled");
  const paidBills = bills.filter((b) => b.status === "paid");

  const displayedBills = activeTab === "active" ? activeBills : paidBills;

  if (loading) return <Page title="Care Fees & Receipts" back><ActivityIndicator accessibilityLabel="Loading care fees" /></Page>;
  if (error) return <Page title="Care Fees & Receipts" back><Notice>{error}</Notice><Button title="Retry" onPress={loadBills} /></Page>;

  return (
    <Page title="Care Fees & Receipts" back tabs activeTab="Profile">
      {/* Overview Card */}
      <Card
        style={{
          marginBottom: 18,
          padding: 20,
          backgroundColor: totalOutstanding > 0 ? "#FFF9F2" : "#F2F9F5",
          borderColor: totalOutstanding > 0 ? "#FDE6D2" : "#D4EEDB",
        }}
      >
        <View style={[s.row, { alignItems: "center", marginBottom: 8 }]}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: totalOutstanding > 0 ? "#FFE7D1" : "#DDF3E4",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 10,
            }}
          >
            {totalOutstanding > 0 ? (
              <Clock size={20} color="#D96500" weight="fill" />
            ) : (
              <CheckCircle size={20} color="#2E7D32" weight="fill" />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={13} color="#7E8490" weight="semibold">
              Total due
            </Text>
            <Text size={24} weight="bold" color={totalOutstanding > 0 ? "#D96500" : "#2E7D32"}>
              {formatMoney(totalOutstanding)}
            </Text>
          </View>
        </View>

      </Card>

      {/* Segmented Filter Buttons */}
      <View style={[s.row, { marginBottom: 16, gap: 10 }]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{selected:activeTab==='active'}}
          onPress={() => setActiveTab("active")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: activeTab === "active" ? "#061224" : "#FFFFFF",
            borderWidth: 1,
            borderColor: activeTab === "active" ? "#061224" : "#E2E0D8",
            alignItems: "center",
          }}
        >
          <Text
            size={13}
            weight="semibold"
            color={activeTab === "active" ? "#FFFFFF" : "#061224"}
          >
            Due ({activeBills.length})
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{selected:activeTab==='paid'}}
          onPress={() => setActiveTab("paid")}
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: activeTab === "paid" ? "#061224" : "#FFFFFF",
            borderWidth: 1,
            borderColor: activeTab === "paid" ? "#061224" : "#E2E0D8",
            alignItems: "center",
          }}
        >
          <Text
            size={13}
            weight="semibold"
            color={activeTab === "paid" ? "#FFFFFF" : "#061224"}
          >
            Paid ({paidBills.length})
          </Text>
        </Pressable>
      </View>

      {displayedBills.length === 0 ? (
        <Notice>{activeTab === "active" ? "No bills due." : "No paid bills yet."}</Notice>
      ) : (
        displayedBills.map((b) => {
          const bal = parseFloat(String(b.balance_remaining)) || 0;
          const isOverdue = invoiceIsOverdue(b.due_date, b.status);

          return (
            <Card key={b.id} style={{ marginBottom: 14, padding: 18 }}>
              {/* Card Header: Child & Status */}
              <View style={[s.between, { alignItems: "flex-start", marginBottom: 10 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text size={12} color="#64748B">
                    {b.child_name} · {b.billing_period}
                  </Text>
                  <Text size={16} weight="bold" color="#061224" style={{ marginTop: 2 }}>
                    {b.title}
                  </Text>
                </View>

                <Badge
                  title={b.status === "paid" ? "Paid" : isOverdue ? "Overdue" : b.status === "partially_paid" ? "Part paid" : "Due"}
                  tone={b.status === "paid" ? "green" : isOverdue ? "red" : b.status === "partially_paid" ? "gold" : "neutral"}
                />
              </View>

              {/* Financial Figures Grid */}
              <View
                style={{
                  backgroundColor: "#F9F8F5",
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 6,
                  marginBottom: 12,
                }}
              >
                <View style={[s.between, { flexWrap: "wrap", marginBottom: 6 }]}>
                  <Text size={13} color="#666">
                    Total
                  </Text>
                  <Text size={13} weight="semibold">
                    {formatMoney(Number(b.amount) || 0)}
                  </Text>
                </View>

                <View style={[s.between, { flexWrap: "wrap", marginBottom: 6 }]}>
                  <Text size={13} color="#666">
                    Paid
                  </Text>
                  <Text size={13} weight="semibold" color="#2E7D32">
                    {formatMoney(Number(b.amount_paid) || 0)}
                  </Text>
                </View>

                <View style={[s.between, { borderTopWidth: 1, borderTopColor: "#EDEAE4", paddingTop: 6 }]}>
                  <Text size={13} weight="semibold" color="#061224">
                    Balance due
                  </Text>
                  <Text size={15} weight="bold" color={bal > 0 ? "#D96500" : "#2E7D32"}>
                    {formatMoney(bal)}
                  </Text>
                </View>
              </View>

              <View style={[s.between, { flexWrap: "wrap", alignItems: "center" }]}>
                <Text size={12} color={isOverdue ? "#C62828" : "#8A919B"}>
                  Due by: {b.due_date?.slice(0, 10)}
                </Text>

                {b.payments && b.payments.length === 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View receipt ${b.payments[0].receipt_number}`}
                    onPress={() => setSelectedReceipt({ receipt: b.payments[0], bill: b })}
                    style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  >
                    <Receipt size={16} color="#061224" />
                    <Text size={12} weight="semibold" color="#061224">
                      Receipt #{b.payments[0].receipt_number.slice(-8)}
                    </Text>
                  </Pressable>
                )}
              </View>

              {/* If multiple receipts exist */}
              {Number(b.balance_remaining)>0&&b.status!=='cancelled'&&<View style={{gap:12,marginVertical:12}}><Button title={bankBill===b.id?'Hide online payment':'Pay online'} variant="outline" onPress={()=>setBankBill(current=>current===b.id?null:b.id)}/>{bankBill===b.id&&<ReceiptPaymentCard purpose="invoice" targetId={b.id} onApplied={()=>{
                setActiveTab("paid");
                setBankBill(null);
                void loadBills();
              }}/>}</View>}
              {b.payments && b.payments.length > 1 && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F0EEE6" }}>
                  <Text size={11} color="#7E8490" weight="semibold" style={{ marginBottom: 6 }}>
                    Receipts ({b.payments.length})
                  </Text>
                  {b.payments.map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={`View receipt ${p.receipt_number}`}
                      onPress={() => setSelectedReceipt({ receipt: p, bill: b })}
                      style={[s.between, { flexWrap: "wrap", minHeight: 44 }]}
                    >
                      <Text size={12} color="#061224">
                        {p.receipt_number} ({p.payment_method?.replace(/_/g, " ")})
                      </Text>
                      <Text size={12} weight="semibold" color="#2E7D32">
                        {formatMoney(Number(p.amount_paid) || 0)} ➔
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>
          );
        })
      )}

      {activeTab === "active" && activeBills.length > 0 && (
        <Text size={13} color="#64748B" style={{ marginBottom: 14 }}>
          To pay in cash, visit the daycare front desk.
        </Text>
      )}
      <BillingReminderPreferences />

      {/* Modal: Official Digital Receipt View */}
      {selectedReceipt && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedReceipt(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.55)",
              justifyContent: "center",
              alignItems: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 440,
                maxHeight: "90%",
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                padding: 22,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
              }}
            >
              <Text size={18} weight="bold">Receipt</Text>

              {/* Receipt Body */}
              <ScrollView style={{ maxHeight: 420, marginTop: 12 }}>
                <View style={{ alignItems: "center", marginVertical: 8 }}>
                  <Text size={18} weight="bold" color="#061224">
                    {selectedReceipt.bill.daycare_name}
                  </Text>
                  <View
                    style={{
                      marginTop: 8,
                      backgroundColor: "#EAF5ED",
                      paddingHorizontal: 12,
                      paddingVertical: 4,
                      borderRadius: 12,
                    }}
                  >
                    <Text size={12} weight="bold" color="#2E7D32">
                      #{selectedReceipt.receipt.receipt_number}
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: "#FAF9F5", borderRadius: 10, padding: 14, marginVertical: 12 }}>
                  <View style={[s.between, { flexWrap: "wrap", marginBottom: 6 }]}>
                    <Text size={12} color="#777">Child Name:</Text>
                    <Text size={13} weight="bold" style={{ flexShrink: 1 }}>{selectedReceipt.bill.child_name}</Text>
                  </View>

                  <View style={[s.between, { flexWrap: "wrap", marginBottom: 6 }]}>
                    <Text size={12} color="#777">Invoice Item:</Text>
                    <Text size={12} weight="semibold" style={{ flexShrink: 1 }}>{selectedReceipt.bill.title}</Text>
                  </View>

                  <View style={[s.between, { flexWrap: "wrap", marginBottom: 6 }]}>
                    <Text size={12} color="#777">Payment Date:</Text>
                    <Text size={12}>{new Date(selectedReceipt.receipt.verified_at).toLocaleDateString()}</Text>
                  </View>

                  <View style={[s.between, { flexWrap: "wrap", marginBottom: 6 }]}>
                    <Text size={12} color="#777">Method:</Text>
                    <Text size={12} weight="semibold" style={{ textTransform: "capitalize" }}>
                      {selectedReceipt.receipt.payment_method?.replace(/_/g, " ")}
                    </Text>
                  </View>

                  <Text size={12}>{paymentProvenanceLabel(selectedReceipt.receipt.verification_source)}</Text>

                  <View style={[s.between, { flexWrap: "wrap", marginBottom: 6 }]}>
                    <Text size={12} color="#777">Reference Code:</Text>
                    <Text size={12} weight="semibold" style={{ flexShrink: 1 }}>
                      {selectedReceipt.receipt.reference_code || "CASH-DESK"}
                    </Text>
                  </View>

                  <View style={[s.between, { borderTopWidth: 1, borderTopColor: "#EAE7E0", paddingTop: 8, marginTop: 4 }]}>
                    <Text size={13} weight="bold" color="#2E7D32">Paid</Text>
                    <Text size={16} weight="bold" color="#2E7D32">
                      {formatMoney(Number(selectedReceipt.receipt.amount_paid) || 0)}
                    </Text>
                  </View>
                </View>

              </ScrollView>

              <Button
                title="Close"
                onPress={() => setSelectedReceipt(null)}
                style={{ marginTop: 8 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </Page>
  );
}

export default ParentBillsScreen;
