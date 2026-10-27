import React from "react";
import { View, Image, Pressable } from "react-native";
import { Plus } from "phosphor-react-native/src/icons/Plus";
import { Minus } from "phosphor-react-native/src/icons/Minus";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { Trash } from "phosphor-react-native/src/icons/Trash";
import {
  Page,
  Text,
  Card,
  Button,
  IconButton,
  s,
} from "../../components/design/System";
import { useChild } from "../../context/ChildContext";
import { catalog, formatMoney } from "./catalog";
export function ShoppingCartScreen({ navigation }: any) {
  const { cart, cartTotal, removeFromCart, updateQuantity } = useChild();
  return (
    <Page
      title="My Cart"
      subtitle="A few essentials for their day."
      back
      tabs
      activeTab="Shop"
    >
      {cart.length === 0 ? (
        <Card>
          <Text size={21} weight="semibold">
            Your cart is empty
          </Text>
          <Text color="#747C88" style={{ marginVertical: 14 }}>
            Find something for your little one.
          </Text>
          <Button
            title="Explore Store"
            onPress={() => navigation.navigate("DaycareStore")}
          />
        </Card>
      ) : (
        <>
          {cart.map((item) => (
            <Card
              key={item.product.id}
              style={{ marginBottom: 16, padding: 16 }}
            >
              <View style={[s.row, { alignItems: "flex-start" }]}>
                <Image
                  source={
                    catalog.find((p) => p.id === item.product.id)?.cartImage ||
                    catalog[0].image
                  }
                  style={{ width: 74, height: 80, borderRadius: 15 }}
                />
                <View style={{ flex: 1 }}>
                  <Text size={16} weight="medium">
                    {item.product.name}
                  </Text>
                  <Text size={13} color="#7E8691" style={{ marginTop: 5 }}>
                    {formatMoney(Number(item.product.price))} each
                  </Text>
                  <View style={[s.between, { marginTop: 9 }]}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: "#F4F3F5",
                        borderRadius: 20,
                      }}
                    >
                      <IconButton
                        icon={Minus}
                        size={16}
                        label={"Decrease " + item.product.name}
                        onPress={() =>
                          updateQuantity(item.product.id, item.quantity - 1)
                        }
                      />
                      <Text
                        size={14}
                        style={{ minWidth: 17, textAlign: "center" }}
                      >
                        {item.quantity}
                      </Text>
                      <IconButton
                        icon={Plus}
                        size={16}
                        label={"Increase " + item.product.name}
                        disabled={
                          item.product.stock_quantity !== undefined &&
                          item.quantity >= item.product.stock_quantity
                        }
                        onPress={() =>
                          updateQuantity(item.product.id, item.quantity + 1)
                        }
                      />
                    </View>
                    <IconButton
                      icon={Trash}
                      size={18}
                      color="#C27065"
                      label={"Remove " + item.product.name}
                      onPress={() => removeFromCart(item.product.id)}
                    />
                  </View>
                </View>
              </View>
            </Card>
          ))}
          <Card style={{ marginTop: 10 }}>
            <View style={s.between}>
              <Text color="#7B838F">Subtotal</Text>
              <Text>{formatMoney(cartTotal)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.between}>
              <Text size={20} weight="medium">
                Total
              </Text>
              <Text size={20} weight="semibold">
                {formatMoney(cartTotal)}
              </Text>
            </View>
            <Text
              size={11}
              color="#89909A"
              style={{ textAlign: "center", marginTop: 18 }}
            >
              Items are supplied by your daycare.
            </Text>
          </Card>
          <Button
            title="Proceed to Checkout"
            icon={ArrowRight}
            onPress={() => navigation.navigate("Checkout")}
            style={{ marginTop: 28 }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate("DaycareStore")}
            style={{ alignItems: "center", padding: 20 }}
          >
            <Text size={12} color="#7E8793">
              CONTINUE SHOPPING
            </Text>
          </Pressable>
        </>
      )}
    </Page>
  );
}
