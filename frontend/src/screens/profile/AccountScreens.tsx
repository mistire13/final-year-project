import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import {
  LockKey,
  Package,
  CalendarBlank,
  ChatCircle,
  Clock,
} from "phosphor-react-native";
import {
  Page,
  Text,
  Card,
  Badge,
  Field,
  Button,
  Notice,
  MenuRow,
  s,
} from "../../components/design/System";
import { useAuth } from "../../context/AuthContext";
import { apiClient } from "../../api/client";
import { getMyOrders, OrderRecord } from "../../api/parentApi";
import { formatMoney } from "../store/catalog";

export function OrdersScreen({ navigation }: any) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getMyOrders();
      setOrders(data);
    } catch {
      // Gracefully handle error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const unsubscribe = navigation.addListener?.("focus", loadOrders);
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [navigation, loadOrders]);

  const getStatusTone = (status: string): "green" | "gold" | "neutral" | "red" => {
    switch (status) {
      case "collected":
        return "green";
      case "ready_for_pickup":
      case "confirmed":
        return "green";
      case "cancelled":
        return "red";
      case "placed":
      default:
        return "gold";
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, " ").toUpperCase();
  };

  return (
    <Page title="My Orders" back tabs activeTab="Profile">
      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator size="small" color="#061224" />
          <Text size={13} color="#8A919B" style={{ marginTop: 12 }}>
            Loading orders…
          </Text>
        </View>
      ) : orders.length > 0 ? (
        orders.map((o) => (
          <Card
            key={o.id}
            onPress={() => setSelectedOrder(o)}
            style={{ marginBottom: 14, padding: 18, cursor: "pointer" }}
          >
            <View style={[s.row, { alignItems: "flex-start" }]}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: "#F2F4F7",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Package size={22} color="#10263D" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={[s.between, { flexWrap: "wrap", gap: 4 }]}>
                  <Text size={16} weight="semibold">
                    Order #{o.id}
                  </Text>
                  <Badge
                    title={formatStatus(o.order_status)}
                    tone={getStatusTone(o.order_status)}
                  />
                </View>
                <Text size={12} color="#818A96" style={{ marginTop: 4 }}>
                  {new Date(o.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
                {o.items && o.items.length > 0 ? (
                  <Text size={13} color="#4D5663" style={{ marginTop: 6 }}>
                    {o.items.map((i) => `${i.product_name} (×${i.quantity})`).join(", ")}
                  </Text>
                ) : null}
                <View style={[s.between, { marginTop: 10, borderTopWidth: 1, borderTopColor: "#EDEAE4", paddingTop: 8 }]}>
                  <Text size={12} color="#8A919B">Payment: {o.payment_status.toUpperCase()}</Text>
                  <Text size={15} weight="bold" color="#10263D">
                    {formatMoney(Number(o.total))}
                  </Text>
                </View>
                <Text size={11} color="#008794" weight="semibold" style={{ marginTop: 6 }}>
                  Tap to view receipt & collection details →
                </Text>
              </View>
            </View>
          </Card>
        ))
      ) : (
        <Card style={{ padding: 24, alignItems: "center" }}>
          <Package size={48} color="#A2A7B0" />
          <Text size={19} weight="semibold" style={{ marginTop: 14 }}>
            No orders placed yet
          </Text>
          <Text color="#7E8793" style={{ textAlign: "center", marginTop: 8, marginBottom: 20 }}>
            Browse uniforms, books, diapers, and supplies available in the daycare store.
          </Text>
          <Button
            title="Visit Store"
            onPress={() => navigation.navigate("DaycareStore")}
          />
        </Card>
      )}

      {/* Selected Order Detailed Receipt Modal */}
      {selectedOrder && (
        <Card
          tint="#FFFFFF"
          style={{
            marginTop: 16,
            marginBottom: 24,
            padding: 20,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: "#061224",
          }}
        >
          <View style={s.between}>
            <View>
              <Text size={11} color="#7E8793" style={{ letterSpacing: 0.5 }}>
                DAYCARE ORDER RECEIPT
              </Text>
              <Text size={20} weight="bold" color="#061224">
                #ANK-{selectedOrder.id}
              </Text>
            </View>
            <Badge
              title={formatStatus(selectedOrder.order_status)}
              tone={getStatusTone(selectedOrder.order_status)}
            />
          </View>

          <View style={{ marginVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#EFECE6", paddingVertical: 10 }}>
            <Text size={13} weight="semibold" color="#10263D" style={{ marginBottom: 6 }}>
              Itemized Items:
            </Text>
            {(selectedOrder.items || []).map((item, idx) => (
              <View key={idx} style={[s.between, { paddingVertical: 4 }]}>
                <Text size={13} color="#454D57">
                  {item.product_name} × {item.quantity}
                </Text>
                <Text size={13} weight="medium" color="#10263D">
                  {formatMoney(Number(item.unit_price) * item.quantity)}
                </Text>
              </View>
            ))}
            <View style={[s.between, { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderColor: "#EFECE6" }]}>
              <Text size={14} weight="bold">Total Amount</Text>
              <Text size={16} weight="bold" color="#10263D">
                {formatMoney(Number(selectedOrder.total))}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 14 }}>
            <Text size={12} color="#6B7280" style={{ lineHeight: 17 }}>
              📍 <strong>Pickup instructions:</strong> Present Order #ANK-{selectedOrder.id} at the daycare front office during operational pickup hours (07:30 - 18:00).
            </Text>
            <Text size={12} color={selectedOrder.payment_status === "paid" ? "#1E7E34" : "#B26B00"} weight="medium" style={{ marginTop: 4 }}>
              Payment status: {selectedOrder.payment_status.toUpperCase()}
              {selectedOrder.payment_status !== "paid" ? " (Pay at front desk or digitally)" : " (Cleared for collection)"}
            </Text>
          </View>

          {selectedOrder.payment_status !== "paid" && (
            <Button
              title="Pay Digitally (Telebirr / CBE / Card)"
              variant="outline"
              onPress={() => {
                const target = selectedOrder;
                setSelectedOrder(null);
                navigation.navigate("PaymentVerification", {
                  orderId: target.id,
                  orderRef: `#ANK-${target.id}`,
                  totalAmount: Number(target.total),
                });
              }}
              style={{ marginBottom: 8 }}
            />
          )}

          <Button
            title="Dismiss Receipt"
            variant="secondary"
            onPress={() => setSelectedOrder(null)}
          />
        </Card>
      )}
    </Page>
  );
}

export function NotificationsScreen({ navigation }: any) {
  return (
    <Page title="Notifications" back>
      <Card style={{ paddingVertical: 0 }}>
        <MenuRow
          title="Daily Activity Reports"
          icon={CalendarBlank}
          onPress={() => navigation.navigate("Reports")}
        />
        <MenuRow
          title="Attendance History"
          icon={Clock}
          onPress={() => navigation.navigate("AttendanceHistory")}
        />
        <MenuRow
          title="Health & Incident Notices"
          icon={ChatCircle}
          onPress={() => navigation.navigate("HealthNotices")}
        />
        <MenuRow
          title="Messages & Caregiver Chat"
          icon={ChatCircle}
          onPress={() => navigation.navigate("MainTabs", { screen: "Messages" })}
          last
        />
      </Card>
    </Page>
  );
}

export function SecurityScreen() {
  const { token } = useAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!token) {
      setMessage("Sign in to change your password.");
      return;
    }
    if (password !== confirm || password.length < 8) {
      setMessage(
        "Use at least 8 characters and make sure both passwords match.",
      );
      return;
    }
    setBusy(true);
    try {
      await apiClient.patch("/auth/change-password", {
        current_password: current,
        new_password: password,
      });
      setMessage("Password updated successfully.");
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch {
      setMessage(
        "Unable to update your password. Check your current password and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Security & Password" back>
      <Card>
        <Field
          label="Current Password"
          icon={LockKey}
          secureTextEntry
          value={current}
          onChangeText={setCurrent}
        />
        <Field
          label="New Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Field
          label="Confirm New Password"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />
      </Card>
      {message ? <Notice>{message}</Notice> : null}
      <Button
        title="Update Password"
        loading={busy}
        onPress={save}
        style={{ marginTop: 24 }}
      />
    </Page>
  );
}
