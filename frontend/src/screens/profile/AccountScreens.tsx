import React, { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { LockKey } from "phosphor-react-native/src/icons/LockKey";
import { Package } from "phosphor-react-native/src/icons/Package";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { Clock } from "phosphor-react-native/src/icons/Clock";
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
import { useRemoteResource } from "../../hooks/useRemoteResource";
import { getMyOrders, OrderRecord } from "../../api/parentApi";
import { formatMoney } from "../store/catalog";

export function OrdersScreen({ navigation }: any) {
  const {
    data: orders,
    loading,
    error,
    refresh: loadOrders,
  } = useRemoteResource<OrderRecord[]>("orders", getMyOrders, []);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  useEffect(() => {
    const remove = navigation.addListener?.("focus", loadOrders);
    return () => remove?.();
  }, [navigation, loadOrders]);

  const getStatusTone = (
    status: string,
  ): "green" | "gold" | "neutral" | "red" => {
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
      {error ? (
        <>
          <Notice tone="error">{error}</Notice>
          <Button title="Retry" onPress={loadOrders} />
        </>
      ) : null}
      {error ? null : loading ? (
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
                    {o.items
                      .map((i) => `${i.product_name} (×${i.quantity})`)
                      .join(", ")}
                  </Text>
                ) : null}
                <View
                  style={[
                    s.between,
                    {
                      marginTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: "#EDEAE4",
                      paddingTop: 8,
                    },
                  ]}
                >
                  <Text size={12} color="#8A919B">
                    Payment: {o.payment_status.toUpperCase()}{o.payment_method==='demo'?' · DEMO':o.payment_method==='no_charge'?' · NO CHARGE':''}
                  </Text>
                  <Text size={15} weight="bold" color="#10263D">
                    {formatMoney(Number(o.total))}
                  </Text>
                </View>
                <Text
                  size={11}
                  color="#008794"
                  weight="semibold"
                  style={{ marginTop: 6 }}
                >
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
          <Text
            color="#7E8793"
            style={{ textAlign: "center", marginTop: 8, marginBottom: 20 }}
          >
            Browse uniforms, books, diapers, and supplies available in the
            daycare store.
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

          <View
            style={{
              marginVertical: 12,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "#EFECE6",
              paddingVertical: 10,
            }}
          >
            <Text
              size={13}
              weight="semibold"
              color="#10263D"
              style={{ marginBottom: 6 }}
            >
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
            <View
              style={[
                s.between,
                {
                  marginTop: 8,
                  paddingTop: 6,
                  borderTopWidth: 1,
                  borderColor: "#EFECE6",
                },
              ]}
            >
              <Text size={14} weight="bold">
                Total Amount
              </Text>
              <Text size={16} weight="bold" color="#10263D">
                {formatMoney(Number(selectedOrder.total))}
              </Text>
            </View>
          </View>

          {selectedOrder.note ? (
            <Notice>Order note: {selectedOrder.note}</Notice>
          ) : null}
          {selectedOrder.payment_method==='demo' && <Notice>SIMULATED PAYMENT · No money transferred. Reference: {selectedOrder.payment_reference}</Notice>}
          {selectedOrder.payment_method==='no_charge' && <Notice>No payment required for this zero-total order.</Notice>}
          <View style={{ marginBottom: 14 }}>
            <Text size={12} color="#6B7280" style={{ lineHeight: 17 }}>
              {selectedOrder.order_status==='cancelled'?'This order was cancelled. No collection is due.':selectedOrder.order_status==='collected'?'Collection recorded by your daycare.':selectedOrder.order_status==='ready_for_pickup'?`Present Order #ANK-${selectedOrder.id} at the daycare office during collection hours.`:'Awaiting daycare preparation. Check the order status before visiting to collect.'}
            </Text>
            <Text
              size={12}
              color={
                selectedOrder.payment_status === "paid" ? "#1E7E34" : "#B26B00"
              }
              weight="medium"
              style={{ marginTop: 4 }}
            >
              Payment status: {selectedOrder.payment_status.toUpperCase()}
              {selectedOrder.order_status==='cancelled' ? ' (Order cancelled)' : selectedOrder.payment_status !== "paid"
                ? " (Pay at the daycare)"
                : selectedOrder.order_status==='collected' ? " (Collection recorded)" : selectedOrder.order_status==='ready_for_pickup' ? " (Ready for collection)" : " (Awaiting preparation)"}
            </Text>
          </View>

          {selectedOrder.payment_status !== "paid" && selectedOrder.order_status!=='cancelled' && (
            <Button
              title="Payment options"
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
  const [inbox, setInbox] = useState<any>(null);
  const [read, setRead] = useState<number[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [data, prefs] = await Promise.all([
        apiClient.get("/notifications"),
        apiClient.get("/notifications/preferences"),
      ]);
      setInbox(data.data);
      setRead(prefs.data.read_alert_ids || []);
    } catch {
      setError("Could not load notifications. Please retry.");
    }
  }, []);
  useEffect(() => {
    void load();
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [load, navigation]);
  return (
    <Page title="Notifications" back>
      {error ? (
        <>
          <Notice>{error}</Notice>
          <Button title="Retry" onPress={load} />
        </>
      ) : !inbox ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text size={18} weight="bold">
            Unread messages
          </Text>
          {inbox.unread_messages.recent.length ? (
            inbox.unread_messages.recent.map((item: any) => (
              <Card
                key={item.id}
                onPress={() =>
                  navigation.navigate("CaregiverChat", {
                    recipientId: item.sender_id,
                    recipientName: item.sender_name,
                  })
                }
                style={{ marginTop: 12 }}
              >
                <Text weight="bold">{item.sender_name}</Text>
                <Text>{item.body}</Text>
              </Card>
            ))
          ) : (
            <Notice>You’re up to date with your messages.</Notice>
          )}
          <Text size={18} weight="bold" style={{ marginTop: 24 }}>
            Daycare alerts
          </Text>
          {inbox.alerts.recent
            .filter((item: any) => !read.includes(item.id))
            .map((item: any) => (
              <Card key={item.id} style={{ marginTop: 12 }}>
                <Text weight="bold">{item.title}</Text>
                <Text size={12}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
                <Button
                  title="Mark as read"
                  variant="outline"
                  onPress={async () => {
                    try {
                      const response = await apiClient.patch(
                        "/notifications/preferences",
                        { read_alert_id: item.id },
                      );
                      setRead(response.data.read_alert_ids);
                    } catch {
                      setError(
                        "Could not mark this alert as read. Please retry.",
                      );
                    }
                  }}
                />
              </Card>
            ))}
          {!inbox.alerts.recent.some(
            (item: any) => !read.includes(item.id),
          ) && <Notice>No unread daycare alerts.</Notice>}
          <Card style={{ marginTop: 20 }}>
            <MenuRow
              title="Reports"
              icon={CalendarBlank}
              onPress={() =>
                navigation.navigate("MainTabs", { screen: "Reports" })
              }
            />
            <MenuRow
              title="Announcements"
              icon={ChatCircle}
              onPress={() =>
                navigation.navigate("MainTabs", {
                  screen: "Messages",
                  params: { tab: "Announcements" },
                })
              }
            />
            {inbox.unpaid_orders.count > 0 && (
              <MenuRow
                title={`${inbox.unpaid_orders.count} unpaid orders`}
                icon={Package}
                onPress={() => navigation.navigate("Orders")}
              />
            )}
          </Card>
        </>
      )}
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
    if (password !== confirm || password.length < 12) {
      setMessage(
        "Use at least 12 characters and make sure both passwords match.",
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
