import React, { useState, useEffect } from "react";
import { View, ScrollView, Pressable, Image, ActivityIndicator, Platform, Linking } from "react-native";
import {
  ShoppingCart,
  MagnifyingGlass,
  Plus,
  ArrowLeft,
} from "phosphor-react-native";
import {
  Page,
  Text,
  Card,
  Button,
  Field,
  Badge,
  IconButton,
  s,
} from "../../components/design/System";
import { useChild } from "../../context/ChildContext";
import { useAuth } from "../../context/AuthContext";
import { artwork } from "../../theme/assets";
import { getStoreProducts, StoreProduct } from "../../api/parentApi";
import { getWebPortalUrl } from "../../utils/host";

export const formatMoney = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ETB";

export function DaycareStoreScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { cart, cartItemCount, cartTotal, addToCart } = useChild();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    (async () => {
      try {
        const data = await getStoreProducts();
        setProducts(data);
      } catch {
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const inCart = (id: number) =>
    cart.find((item) => item.product.id === id)?.quantity || 0;

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const getProductArtwork = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("pencil") || lower.includes("art")) return artwork.pencils;
    if (lower.includes("book") || lower.includes("exercise")) return artwork.book;
    if (lower.includes("napkin") || lower.includes("hygiene")) return artwork.napkins;
    return artwork.uniform;
  };

  return (
    <Page
      header={false}
      contentStyle={{ paddingHorizontal: 20 }}
      footer={
        cartItemCount > 0 ? (
          <View
            style={[
              s.between,
              {
                backgroundColor: "#0B2035",
                borderRadius: 30,
                padding: 10,
                paddingLeft: 18,
              },
            ]}
          >
            <View style={s.row}>
              <ShoppingCart size={23} color="white" />
              <View>
                <Text size={11} color="#B9C5D1">
                  {cartItemCount} items
                </Text>
                <Text size={15} weight="semibold" color="white">
                  {formatMoney(cartTotal)}
                </Text>
              </View>
            </View>
            <Button
              title="View Cart"
              variant="secondary"
              onPress={() => navigation.navigate("ShoppingCart")}
              style={{
                backgroundColor: "white",
                minHeight: 38,
                paddingVertical: 9,
              }}
            />
          </View>
        ) : undefined
      }
    >
      <View style={[s.between, { marginBottom: 16 }]}>
        <IconButton
          icon={ArrowLeft}
          label={route?.name === "Shop" ? "Go to Home" : "Go back"}
          onPress={() => route?.name === "Shop" ? navigation.navigate("Home") : navigation.goBack()}
        />
        <Text size={26} weight="bold" style={{ flex: 1, marginLeft: 12 }}>
          Daycare Store
        </Text>
        <View>
          <IconButton
            icon={ShoppingCart}
            label="Shopping cart"
            onPress={() => navigation.navigate("ShoppingCart")}
          />
          {cartItemCount > 0 && (
            <View
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                backgroundColor: "#D7443E",
                borderRadius: 9,
                width: 18,
                height: 18,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text size={10} color="white" weight="bold">
                {cartItemCount}
              </Text>
            </View>
          )}
        </View>
      </View>

      {isAdmin && (
        <Card tint="#EBF5FA" style={{ marginBottom: 16, padding: 14 }}>
          <View style={s.between}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text size={11} weight="bold" color="#006579" style={{ letterSpacing: 0.6 }}>
                👑 DAYCARE ADMINISTRATOR
              </Text>
              <Text size={13} color="#2B4657" style={{ marginTop: 3, lineHeight: 18 }}>
                Manage catalog items, stock quantities, and customer order fulfillment in your workspace portal.
              </Text>
            </View>
            <Button
              title="Admin Portal"
              variant="outline"
              onPress={() => {
                if (Platform.OS === "web") {
                  window.location.assign("/admin/store");
                } else {
                  Linking.openURL(getWebPortalUrl("/admin/store"));
                }
              }}
              style={{ minHeight: 34, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#FFFFFF" }}
            />
          </View>
        </Card>
      )}

      <Field
        icon={MagnifyingGlass}
        placeholder="Search supplies, uniforms, books…"
        value={search}
        onChangeText={setSearch}
      />

      <Text size={22} weight="semibold" style={{ marginVertical: 18 }}>
        {search ? "Search Results" : "Daycare Products"}
      </Text>

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#061224" />
          <Text size={13} color="#7E828A" style={{ marginTop: 10 }}>Loading products catalog…</Text>
        </View>
      ) : filtered.length > 0 ? (
        <View style={s.grid}>
          {filtered.map((p) => {
            const stock = p.stock_quantity ?? 10;
            const priceNum = Number(p.price);
            const qtyInCart = inCart(p.id);
            const isOutOfStock = stock <= 0;
            const isMaxedOut = qtyInCart >= stock;

            return (
              <Card
                key={p.id}
                style={{ width: "48%", padding: 0, overflow: "hidden", marginBottom: 14 }}
              >
                <View style={{ width: "100%", aspectRatio: 1 }}>
                  <Image
                    source={getProductArtwork(p.name)}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                  <View style={{ position: "absolute", top: 10, left: 8 }}>
                    <Badge
                      title={
                        isOutOfStock
                          ? "OUT OF STOCK"
                          : isMaxedOut
                            ? "ALL IN CART"
                            : stock <= 3
                              ? "LOW STOCK"
                              : "IN STOCK"
                      }
                      tone={isOutOfStock ? "red" : stock <= 3 ? "gold" : "green"}
                    />
                  </View>
                </View>
                <View style={{ padding: 13 }}>
                  <Text
                    size={14}
                    weight="semibold"
                    numberOfLines={2}
                    style={{ minHeight: 40 }}
                  >
                    {p.name}
                  </Text>
                  <View style={[s.between, { marginTop: 8 }]}>
                    <Text size={14} weight="semibold" color="#516A8B">
                      {formatMoney(priceNum)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={"Add " + p.name + " to cart"}
                      disabled={isOutOfStock || isMaxedOut}
                      onPress={() =>
                        addToCart({
                          id: p.id,
                          name: p.name,
                          price: priceNum,
                          stock_quantity: stock,
                          in_stock: !isOutOfStock,
                        })
                      }
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        opacity: isOutOfStock || isMaxedOut ? 0.35 : 1,
                        backgroundColor: "#DCE9FF",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Plus size={20} color="#24476D" />
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      ) : (
        <Card style={{ padding: 24, alignItems: "center" }}>
          <Text size={15} weight="medium">No products found</Text>
          <Text size={13} color="#7E828A" style={{ marginTop: 6 }}>
            {search ? "Try searching with a different term." : "No store items are available at this time."}
          </Text>
        </Card>
      )}
    </Page>
  );
}
