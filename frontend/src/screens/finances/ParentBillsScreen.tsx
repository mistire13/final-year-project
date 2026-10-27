import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator, Pressable, ScrollView, Modal, Platform } from "react-native";
import { Receipt } from "phosphor-react-native/src/icons/Receipt";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { WarningCircle } from "phosphor-react-native/src/icons/WarningCircle";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { DeviceMobile } from "phosphor-react-native/src/icons/DeviceMobile";
import { Buildings } from "phosphor-react-native/src/icons/Buildings";
import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";
import { CurrencyDollar } from "phosphor-react-native/src/icons/CurrencyDollar";
import { X } from "phosphor-react-native/src/icons/X";
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

export function ParentBillsScreen({ navigation }: any) {
  const [bills, setBills] = useState<ParentBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    receipt: ParentPaymentReceipt;
    bill: ParentBill;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"active" | "paid">("active");

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
          <View>
            <Text size={12} color="#7E8490" weight="semibold">
              TOTAL OUTSTANDING BALANCE
            </Text>
            <Text size={24} weight="bold" color={totalOutstanding > 0 ? "#D96500" : "#2E7D32"}>
              {formatMoney(totalOutstanding)}
            </Text>
          </View>
        </View>

        <Text size={12} color="#666" style={{ marginTop: 4 }}>
          {totalOutstanding > 0
            ? "Monthly child stay & care fee. Please settle via front desk or bank transfer."
            : "All daycare care fees and charges are fully settled. Thank you!"}
        </Text>
      </Card>

      {/* Segmented Filter Buttons */}
      <View style={[s.row, { marginBottom: 16, gap: 10 }]}>
        <Pressable
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
            Due Bills ({activeBills.length})
          </Text>
        </Pressable>

        <Pressable
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
            Paid Archive ({paidBills.length})
          </Text>
        </Pressable>
      </View>

      {error ? (
        <View style={{ marginBottom: 16 }}>
          <Notice tone="error">{error}</Notice>
          <Button title="Retry" onPress={loadBills} style={{ marginTop: 8 }} />
        </View>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator size="small" color="#061224" />
          <Text size={13} color="#8A919B" style={{ marginTop: 12 }}>
            Loading care fees and receipts…
          </Text>
        </View>
      ) : displayedBills.length === 0 ? (
        <Card style={{ padding: 28, alignItems: "center" }}>
          <Receipt size={36} color="#B0B5BD" />
          <Text size={16} weight="semibold" style={{ marginTop: 12 }}>
            {activeTab === "active" ? "No Pending Bills" : "No Paid Records Yet"}
          </Text>
          <Text size={13} color="#7E8490" style={{ marginTop: 4, textAlign: "center" }}>
            {activeTab === "active"
              ? "All your monthly care invoices are paid up to date."
              : "Completed payment receipts will be safely archived here."}
          </Text>
        </Card>
      ) : (
        displayedBills.map((b) => {
          const bal = parseFloat(String(b.balance_remaining)) || 0;
          const isOverdue =
            b.status !== "paid" && new Date(b.due_date) < new Date();

          return (
            <Card key={b.id} style={{ marginBottom: 14, padding: 18 }}>
              {/* Card Header: Child & Status */}
              <View style={[s.between, { alignItems: "flex-start", marginBottom: 10 }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text size={11} color="#7E8490" weight="semibold" style={{ textTransform: "uppercase" }}>
                    {b.child_name} · {b.billing_period}
                  </Text>
                  <Text size={16} weight="bold" color="#061224" style={{ marginTop: 2 }}>
                    {b.title}
                  </Text>
                  <Text size={12} color="#818A96" style={{ marginTop: 2 }}>
                    {b.daycare_name}
                  </Text>
                </View>

                <Badge
                  title={b.status === "paid" ? "PAID" : isOverdue ? "OVERDUE" : b.status === "partially_paid" ? "PARTIAL" : "PENDING"}
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
                <View style={[s.between, { marginBottom: 6 }]}>
                  <Text size={13} color="#666">
                    Total Amount:
                  </Text>
                  <Text size={13} weight="semibold">
                    {formatMoney(Number(b.amount) || 0)}
                  </Text>
                </View>

                <View style={[s.between, { marginBottom: 6 }]}>
                  <Text size={13} color="#666">
                    Amount Paid:
                  </Text>
                  <Text size={13} weight="semibold" color="#2E7D32">
                    {formatMoney(Number(b.amount_paid) || 0)}
                  </Text>
                </View>

                <View style={[s.between, { borderTopWidth: 1, borderTopColor: "#EDEAE4", paddingTop: 6 }]}>
                  <Text size={13} weight="semibold" color="#061224">
                    Balance Due:
                  </Text>
                  <Text size={15} weight="bold" color={bal > 0 ? "#D96500" : "#2E7D32"}>
                    {formatMoney(bal)}
                  </Text>
                </View>
              </View>

              <View style={[s.between, { alignItems: "center" }]}>
                <Text size={12} color={isOverdue ? "#C62828" : "#8A919B"}>
                  Due by: {b.due_date?.slice(0, 10)}
                </Text>

                {b.payments && b.payments.length > 0 && (
                  <Pressable
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
              {b.payments && b.payments.length > 1 && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F0EEE6" }}>
                  <Text size={11} color="#7E8490" weight="semibold" style={{ marginBottom: 6 }}>
                    ALL DIGITAL RECEIPTS ({b.payments.length})
                  </Text>
                  {b.payments.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setSelectedReceipt({ receipt: p, bill: b })}
                      style={[s.between, { paddingVertical: 4 }]}
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

      {/* Payment Options Guide Card */}
      <Card style={{ marginTop: 16, padding: 18, backgroundColor: "#FFFFFF" }}>
        <Text size={14} weight="bold" color="#061224" style={{ marginBottom: 10 }}>
          How to Settle Care Fees (ክፍያ መፈጸሚያ መንገዶች)
        </Text>

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#EAF5ED", alignItems: "center", justifyContent: "center" }}>
            <Buildings size={18} color="#2E7D32" weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text size={13} weight="semibold">1. Cash at Front Reception Desk</Text>
            <Text size={12} color="#7E8490" style={{ marginTop: 2 }}>
              Pay directly at the daycare reception office. Staff will instantly issue an official digital receipt.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" }}>
            <DeviceMobile size={18} color="#D96500" weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text size={13} weight="semibold">2. Telebirr Mobile Transfer</Text>
            <Text size={12} color="#7E8490" style={{ marginTop: 2 }}>
              Send payment to the daycare's merchant/account. Share the transaction reference code with front desk.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#EDE7F6", alignItems: "center", justifyContent: "center" }}>
            <CurrencyDollar size={18} color="#5E35B1" weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            <Text size={13} weight="semibold">3. Commercial Bank of Ethiopia (CBE)</Text>
            <Text size={12} color="#7E8490" style={{ marginTop: 2 }}>
              Transfer via CBE Birr or CBE Mobile Banking. Retain the receipt transaction number for verification.
            </Text>
          </View>
        </View>
      </Card>

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
                backgroundColor: "#FFFFFF",
                borderRadius: 16,
                padding: 22,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
              }}
            >
              {/* Modal Header */}
              <View style={[s.between, { alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EAE7E0", paddingBottom: 12 }]}>
                <View style={s.row}>
                  <Receipt size={22} color="#061224" />
                  <Text size={16} weight="bold" style={{ marginLeft: 8 }}>
                    Official Digital Receipt
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedReceipt(null)} hitSlop={10}>
                  <X size={20} color="#777" />
                </Pressable>
              </View>

              {/* Receipt Body */}
              <ScrollView style={{ maxHeight: 420, marginTop: 12 }}>
                <View style={{ alignItems: "center", marginVertical: 8 }}>
                  <Text size={18} weight="bold" color="#061224">
                    {selectedReceipt.bill.daycare_name}
                  </Text>
                  <Text size={12} color="#777" style={{ marginTop: 2 }}>
                    Daycare Child Care Fee Digital Receipt
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
                  <View style={[s.between, { marginBottom: 6 }]}>
                    <Text size={12} color="#777">Child Name:</Text>
                    <Text size={13} weight="bold">{selectedReceipt.bill.child_name}</Text>
                  </View>

                  <View style={[s.between, { marginBottom: 6 }]}>
                    <Text size={12} color="#777">Invoice Item:</Text>
                    <Text size={12} weight="semibold">{selectedReceipt.bill.title}</Text>
                  </View>

                  <View style={[s.between, { marginBottom: 6 }]}>
                    <Text size={12} color="#777">Payment Date:</Text>
                    <Text size={12}>{new Date(selectedReceipt.receipt.verified_at).toLocaleDateString()}</Text>
                  </View>

                  <View style={[s.between, { marginBottom: 6 }]}>
                    <Text size={12} color="#777">Method:</Text>
                    <Text size={12} weight="semibold" style={{ textTransform: "capitalize" }}>
                      {selectedReceipt.receipt.payment_method?.replace(/_/g, " ")}
                    </Text>
                  </View>

                  <View style={[s.between, { marginBottom: 6 }]}>
                    <Text size={12} color="#777">Reference Code:</Text>
                    <Text size={12} weight="semibold">
                      {selectedReceipt.receipt.reference_code || "CASH-DESK"}
                    </Text>
                  </View>

                  <View style={[s.between, { borderTopWidth: 1, borderTopColor: "#EAE7E0", paddingTop: 8, marginTop: 4 }]}>
                    <Text size={13} weight="bold" color="#2E7D32">Amount Paid:</Text>
                    <Text size={16} weight="bold" color="#2E7D32">
                      {formatMoney(Number(selectedReceipt.receipt.amount_paid) || 0)}
                    </Text>
                  </View>
                </View>

                <Text size={11} color="#999" style={{ textAlign: "center", marginBottom: 12 }}>
                  This is an immutable digital receipt generated by the Ankelba Daycare Platform.
                </Text>
              </ScrollView>

              <Button
                title="Close Receipt"
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
