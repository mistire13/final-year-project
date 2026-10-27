import React, { useState, useRef, useEffect } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Storefront } from "phosphor-react-native/src/icons/Storefront";
import { DeviceMobile } from "phosphor-react-native/src/icons/DeviceMobile";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { WarningCircle } from "phosphor-react-native/src/icons/WarningCircle";
import {
  Page,
  Text,
  Card,
  Avatar,
  Field,
  Button,
  Notice,
  s,
} from "../../components/design/System";
import { useChild } from "../../context/ChildContext";
import { useDesign } from "../../context/DesignContext";
import { artwork } from "../../theme/assets";
import { formatMoney } from "./catalog";
import { placeStoreOrder, getPaymentCapabilities } from "../../api/parentApi";

export function CheckoutScreen({ navigation }: any) {
  const { selectedChild, cart, cartTotal, clearCart } = useChild();
  const { setOrder } = useDesign();
  const [method, setMethod] = useState<"pay_at_daycare" | "demo">(
    "pay_at_daycare",
  );
  const [demoEnabled,setDemoEnabled]=useState(false);
  useEffect(()=>{let active=true;getPaymentCapabilities().then(c=>{if(active)setDemoEnabled(c.demo_enabled);}).catch(()=>{});return()=>{active=false;};},[]);
  const orderKey = useRef(`order-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const childName = selectedChild?.full_name?.split(" ")[0] || "Child";
  const groupName = selectedChild?.group_name || "Classroom not assigned";

  const handlePlaceOrder = async () => {
    if (!cart.length || submitting) return;
    setSubmitting(true);
    setErrorMessage("");

    try {
      const orderItems = cart.map((i) => ({
        product_id: i.product.id,
        quantity: i.quantity,
      }));

      const created = await placeStoreOrder(orderItems, note.trim(), orderKey.current);
      const reference = `#ORD-${created.id}`;

      setOrder({
        reference,
        total: Number(created.total),
        method,
        note,
        items: (created.items || []).map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          price: Number(i.unit_price),
        })),
      });

      clearCart();
      if (method === "demo" && Number(created.total)>0) {
        navigation.replace("PaymentVerification", {
          orderId: created.id,
          orderRef: reference,
          totalAmount: Number(created.total),
        });
      } else {
        navigation.replace("OrderConfirmation", {
          orderRef: reference,
          totalAmount: Number(created.total),
        });
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Could not place order. Please verify item availability.";
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page
      title="Checkout"
      subtitle="Review your items and payment preference."
      back
      tabs
      activeTab="Shop"
    >
      <Card style={{ marginBottom: 20 }}>
        <View style={s.row}>
          <Avatar
            source={selectedChild?.photo_url ? {uri:selectedChild.photo_url} : undefined}
            initials={childName.slice(0, 2).toUpperCase()}
            size={56}
          />
          <View style={{ marginLeft: 12 }}>
            <Text size={11} color="#8C9199" style={{ letterSpacing: 0.5 }}>
              ORDER FOR
            </Text>
            <Text size={18} weight="semibold">
              {selectedChild?.full_name || childName}
            </Text>
            <Text size={13} color="#AC8C42">
              {groupName}
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={s.between}>
          <Text size={18} weight="semibold">
            Order Summary
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
          >
            <Text size={13} style={{ textDecorationLine: "underline" }} color="#10263D">
              Edit Cart
            </Text>
          </Pressable>
        </View>

        {cart.map((i) => (
          <View
            key={i.product.id}
            style={{
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#EDE9E3",
            }}
          >
            <View style={s.between}>
              <Text weight="medium">{i.product.name}</Text>
              <Text weight="semibold">
                {formatMoney(Number(i.product.price) * i.quantity)}
              </Text>
            </View>
            <Text size={12} color="#7A828F" style={{ marginTop: 4 }}>
              Qty: {i.quantity} × {formatMoney(Number(i.product.price))}
            </Text>
          </View>
        ))}

        <View style={[s.between, { marginTop: 18 }]}>
          <Text size={18} weight="semibold">
            Total
          </Text>
          <Text size={20} weight="bold" color="#10263D">
            {formatMoney(cartTotal)}
          </Text>
        </View>
      </Card>

      <Text
        size={16}
        weight="semibold"
        style={{ marginTop: 24, marginBottom: 12 }}
      >
        Payment Method
      </Text>

      {[
        {
          key: "pay_at_daycare" as const,
          title: "Pay at Daycare",
          text: "Collect your receipt and settle payment at the daycare office.",
          Icon: Storefront,
        },
        ...(demoEnabled?[{key:'demo' as const,title:'Demo payment',text:'Simulate success for this demo. No money is transferred.',Icon:DeviceMobile}]:[]),

      ].map((p) => (
        <Pressable
          key={p.key}
          accessibilityRole="radio"
          accessibilityState={{ checked: method === p.key }}
          aria-checked={method === p.key}
          onPress={() => setMethod(p.key)}
          style={{
            borderWidth: method === p.key ? 2 : 1,
            borderColor: method === p.key ? "#092036" : "#E8E5DD",
            backgroundColor: method === p.key ? "#F6F5ED" : "white",
            borderRadius: 18,
            padding: 16,
            marginBottom: 10,
          }}
        >
          <View style={[s.row, { alignItems: "flex-start" }]}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                borderWidth: 1.5,
                borderColor: method === p.key ? "#10263B" : "#9A9EA7",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 3,
                marginRight: 12,
              }}
            >
              {method === p.key && (
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: "#10263B",
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.row}>
                <p.Icon size={18} style={{ marginRight: 6 }} />
                <Text weight="semibold">{p.title}</Text>
              </View>
              <Text size={12} color="#7E8591" style={{ marginTop: 4 }}>
                {p.text}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}

      <View style={{ height: 12 }} />

      <Field
        label="Order Note (Optional)"
        placeholder="Add special instructions or delivery details…"
        multiline
        value={note}
        onChangeText={setNote}
      />

      {errorMessage ? (
        <View style={{ marginTop: 8 }}>
          <Notice tone="error">{errorMessage}</Notice>
        </View>
      ) : null}

      <Notice>
        {method==='demo'?'Demo payment is a simulation. Continue to record simulated success.':'Your order is paid when the daycare records settlement. Zero-total orders require no payment.'}
      </Notice>

      <Button
        title={submitting ? "Placing Order…" : "Place Order"}
        icon={submitting ? undefined : CheckCircle}
        disabled={!cart.length || submitting}
        onPress={handlePlaceOrder}
        style={{ marginTop: 16, marginBottom: 24 }}
      />
    </Page>
  );
}
