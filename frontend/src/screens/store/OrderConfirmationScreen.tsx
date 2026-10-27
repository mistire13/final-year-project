import React from "react";
import { View } from "react-native";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { ShoppingBag } from "phosphor-react-native/src/icons/ShoppingBag";
import {
  Page,
  Text,
  Card,
  Avatar,
  Badge,
  Button,
  Notice,
  s,
} from "../../components/design/System";
import { useDesign } from "../../context/DesignContext";
import { useChild } from "../../context/ChildContext";
import { artwork } from "../../theme/assets";
import { formatMoney } from "./catalog";

export function OrderConfirmationScreen({ navigation, route }: any) {
  const { order } = useDesign();
  const { selectedChild } = useChild();

  const orderRef = route.params?.orderRef || (order?.reference ? `#${order.reference}` : "#ORD-LATEST");
  const totalAmount = route.params?.totalAmount || order?.total || 0;
  const childName = selectedChild?.full_name || "Child";
  const groupName = selectedChild?.group_name || "Early Learning";

  return (
    <Page tabs activeTab="Shop">
      <View style={{ alignItems: "center", paddingVertical: 24 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "#E6F4EA",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CheckCircle size={36} color="#1E7E34" weight="fill" />
        </View>
        <Text
          size={26}
          weight="bold"
          style={{ textAlign: "center", marginTop: 18 }}
        >
          Order Confirmed!
        </Text>
        <Text
          size={14}
          color="#7C8490"
          style={{ textAlign: "center", marginTop: 8 }}
        >
          Your order has been recorded in the daycare system.
        </Text>
      </View>

      <Card tint="#F4F6F8" style={{ padding: 18 }}>
        <Text size={11} color="#848B96" style={{ letterSpacing: 0.5 }}>
          ORDER REFERENCE
        </Text>
        <Text size={22} weight="bold" style={{ marginTop: 6, color: "#10263D" }}>
          {orderRef}
        </Text>
        <Text size={12} color="#2B8A3E" weight="medium" style={{ marginTop: 6 }}>
          ● Status: Placed · Awaiting daycare preparation
        </Text>
      </Card>

      <Card style={{ marginTop: 16, padding: 16 }}>
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url?{uri:selectedChild.photo_url}:undefined} initials={childName.slice(0, 2).toUpperCase()} size={46} />
          <View style={{ marginLeft: 12 }}>
            <Text size={11} color="#8B919B">
              ORDER ASSIGNED TO
            </Text>
            <Text size={18} weight="semibold">
              {childName}
            </Text>
            <Text size={12} color="#8B919B">
              {groupName}
            </Text>
          </View>
        </View>
      </Card>

      {order && order.items && order.items.length > 0 ? (
        <Card style={{ marginTop: 16, padding: 18 }}>
          <Text size={18} weight="semibold" style={{ marginBottom: 14 }}>
            Order Items
          </Text>
          {order.items.map((i, index) => (
            <View key={index} style={[s.between, { paddingVertical: 8 }]}>
              <Text size={13} style={{ flex: 1 }}>
                {i.name} (Qty {i.quantity})
              </Text>
              <Text size={13} weight="medium">
                {formatMoney(i.price * i.quantity)}
              </Text>
            </View>
          ))}
          <View style={[s.divider, { marginVertical: 12 }]} />
          <View style={s.between}>
            <Text size={18} weight="semibold">
              Total Amount
            </Text>
            <Text size={20} weight="bold" color="#10263D">
              {formatMoney(totalAmount)}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card style={{ marginTop: 16, padding: 16 }}>
        <View style={s.between}>
          <Text size={17} weight="semibold">
            Payment Method
          </Text>
          <Badge title={totalAmount===0?'No charge':'Pay at Pickup'} tone={totalAmount===0?'green':'gold'} />
        </View>
        <Text size={13} color="#6C7380" style={{ marginTop: 8 }}>
          {totalAmount===0?'No payment is required for this zero-total order.':'Pay in person at daycare front desk upon collection.'}
        </Text>
      </Card>

      <Button
        title="View Order History"
        icon={ArrowRight}
        onPress={() => navigation.navigate("Orders")}
        style={{ marginTop: 24 }}
      />
      <Button
        title="Back to Daycare Home"
        variant="outline"
        onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
        style={{ marginTop: 10, marginBottom: 20 }}
      />
    </Page>
  );
}
