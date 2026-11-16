import ShopAccess from './ShopAccess';
import React, { useState, useRef, useEffect } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Storefront } from "phosphor-react-native/src/icons/Storefront";
import { DeviceMobile } from "phosphor-react-native/src/icons/DeviceMobile";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { WarningCircle } from "phosphor-react-native/src/icons/WarningCircle";
import { UploadSimple } from "phosphor-react-native/src/icons/UploadSimple";
import {
  Page,
  Text,
  Card,
  Avatar,
  Field,
  Button,
  Notice,
  Badge,
  s,
} from "../../components/design/System";
import { useChild } from "../../context/ChildContext";
import { useDesign } from "../../context/DesignContext";
import { artwork } from "../../theme/assets";
import { formatMoney } from "./catalog";
import { placeStoreOrder, getPaymentCapabilities } from "../../api/parentApi";
import {
  receivingAccounts,
  createReceiptRequest,
  verifyDaycareReceipt,
} from '../../api/daycarePayments';
import type { DaycareReceivingAccount, ReceiptProvider } from '../../types/daycarePayments';
import { launchImageLibraryAsync } from 'expo-image-picker';

const maxScreenshotLength = Math.ceil((4 * 1024 * 1024) / 3) * 4;

function CheckoutScreenContent({ navigation }: any) {
  const { selectedChild, cart, cartTotal, clearCart } = useChild();
  const { setOrder } = useDesign();
  const [method, setMethod] = useState<string>("pay_at_daycare");
  const [accounts, setAccounts] = useState<DaycareReceivingAccount[]>([]);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [cbeLink, setCbeLink] = useState("");
  const [telebirrRef, setTelebirrRef] = useState("");
  const [otherRef, setOtherRef] = useState("");
  const [suffix, setSuffix] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    receivingAccounts().then(accs => {
      if (active) {
        setAccounts(accs);
        if (accs.length > 0 && method === "pay_at_daycare") {
          // default stays pay_at_daycare or user can select
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getPaymentCapabilities().then(c => {
      if (active) setDemoEnabled(c.demo_enabled);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const orderKey = useRef(`order-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [note, setNote] = useState("");

  const childName = selectedChild?.full_name?.split(" ")[0] || "Child";
  const groupName = selectedChild?.group_name || "Classroom not assigned";

  const cbeAccount = accounts.find(a => a.provider === 'cbe');
  const telebirrAccount = accounts.find(a => a.provider === 'telebirr');
  const otherAccounts = accounts.filter(a => a.provider !== 'cbe' && a.provider !== 'telebirr');

  const chooseScreenshot = async () => {
    if (picking || submitting) return;
    setPicking(true);
    setErrorMessage("");
    try {
      const result = await launchImageLibraryAsync({ mediaTypes: ['images'], base64: true });
      if (result.canceled) return;
      const photo = result.assets[0]?.base64;
      if (!photo || photo.length > maxScreenshotLength) {
        setErrorMessage("Choose a JPEG or PNG screenshot up to 4 MB.");
        return;
      }
      setImage(photo);
    } catch {
      setErrorMessage("Could not open your screenshots. Try again or enter the receipt details.");
    } finally {
      setPicking(false);
    }
  };

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
        method: ['cbe', 'telebirr', 'abyssinia'].includes(method) ? 'bank_transfer' : method === 'demo' ? 'demo' : 'pay_at_daycare',
        note,
        items: (created.items || []).map((i) => ({
          name: i.product_name,
          quantity: i.quantity,
          price: Number(i.unit_price),
        })),
      });

      clearCart();

      const isProvider = ['cbe', 'telebirr', 'abyssinia'].includes(method);
      const proofRef = method === 'cbe' ? cbeLink.trim() : method === 'telebirr' ? telebirrRef.trim() : otherRef.trim();

      if (isProvider && Number(created.total) > 0) {
        // If parent provided screenshot or reference link right at checkout, verify it now
        if (image || proofRef) {
          try {
            const reqKey = `receipt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const req = await createReceiptRequest('order', created.id, method as ReceiptProvider, reqKey);
            const verified = await verifyDaycareReceipt(req, proofRef, suffix.trim(), image ?? undefined);

            navigation.replace("OrderConfirmation", {
              orderRef: reference,
              totalAmount: Number(created.total),
              paymentMethod: method,
              paymentVerified: verified.status === 'applied',
              reviewPending: verified.status === 'review_pending',
              statusMessage: verified.message || (verified.status === 'applied' ? 'Payment verified' : 'Receipt submitted for daycare review'),
            });
            return;
          } catch (verifyErr: any) {
            // If verification failed or needs follow-up, take user to PaymentVerification
            navigation.replace("PaymentVerification", {
              orderId: created.id,
              orderRef: reference,
              totalAmount: Number(created.total),
              initialError: verifyErr?.response?.data?.message || verifyErr?.message,
            });
            return;
          }
        } else {
          // Direct to PaymentVerification where the order is ready for screenshot/receipt submission
          navigation.replace("PaymentVerification", {
            orderId: created.id,
            orderRef: reference,
            totalAmount: Number(created.total),
          });
          return;
        }
      } else if (method === 'demo' && Number(created.total) > 0) {
        navigation.replace("PaymentVerification", {
          orderId: created.id,
          orderRef: reference,
          totalAmount: Number(created.total),
        });
      } else {
        navigation.replace("OrderConfirmation", {
          orderRef: reference,
          totalAmount: Number(created.total),
          paymentMethod: 'pay_at_daycare',
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

  const paymentOptions: Array<{
    key: string;
    title: string;
    text: string;
    account?: DaycareReceivingAccount;
    provider?: ReceiptProvider;
  }> = [
    {
      key: "pay_at_daycare",
      title: "Pay at Daycare",
      text: "Pay in cash at the daycare front desk upon collection.",
    },
    ...(cbeAccount ? [{
      key: "cbe",
      title: "Commercial Bank of Ethiopia (CBE)",
      text: `Account: ${cbeAccount.account_number} · ${cbeAccount.account_holder}`,
      account: cbeAccount,
      provider: 'cbe' as ReceiptProvider,
    }] : []),
    ...(telebirrAccount ? [{
      key: "telebirr",
      title: "Telebirr",
      text: `Phone: ${telebirrAccount.account_number} · ${telebirrAccount.account_holder}`,
      account: telebirrAccount,
      provider: 'telebirr' as ReceiptProvider,
    }] : []),
    ...otherAccounts.map(oa => ({
      key: oa.provider,
      title: oa.institution,
      text: `Account: ${oa.account_number} · ${oa.account_holder}`,
      account: oa,
      provider: oa.provider as ReceiptProvider,
    })),
    ...(demoEnabled ? [{
      key: "demo",
      title: "Demo payment",
      text: "Simulate success for this demo. No money is transferred.",
    }] : []),
  ];

  return (
    <Page
      title="Checkout"
      back
      tabs
      activeTab="Shop"
    >
      <Card style={{ marginBottom: 20 }}>
        <View style={s.row}>
          <Avatar
            source={selectedChild?.photo_url ? { uri: selectedChild.photo_url } : undefined}
            initials={childName.slice(0, 2).toUpperCase()}
            size={56}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text size={11} color="#8C9199" style={{ letterSpacing: 0.5 }}>
              Order for
            </Text>
            <Text size={18} weight="semibold" numberOfLines={2}>
              {selectedChild?.full_name || childName}
            </Text>
            <Text size={13} color="#AC8C42" numberOfLines={2}>
              {groupName}
            </Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={[s.between, { flexWrap: "wrap" }]}>
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
              <Text weight="medium" style={{ flex: 1, minWidth: 0 }}>{i.product.name}</Text>
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

      {paymentOptions.map((p) => (
        <View key={p.key} style={{ marginBottom: 12 }}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: method === p.key }}
            aria-checked={method === p.key}
            onPress={() => {
              setMethod(p.key);
              setImage(null);
            }}
            style={{
              borderWidth: method === p.key ? 2 : 1,
              borderColor: method === p.key ? "#092036" : "#E8E5DD",
              backgroundColor: method === p.key ? "#F6F5ED" : "white",
              borderRadius: 18,
              padding: 16,
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
                  {p.key === "pay_at_daycare" ? (
                    <Storefront size={18} style={{ marginRight: 6 }} />
                  ) : (
                    <DeviceMobile size={18} style={{ marginRight: 6 }} />
                  )}
                  <Text weight="semibold" style={{ flexShrink: 1 }}>{p.title}</Text>
                </View>
                <Text size={12} color="#7E8591" style={{ marginTop: 4 }}>
                  {p.text}
                </Text>
              </View>
            </View>
          </Pressable>

          {/* CBE Payment Details & Proof Input */}
          {method === "cbe" && p.key === "cbe" && (
            <Card tint="#FAFAF8" style={{ marginTop: 8, padding: 16, gap: 10, borderColor: "#092036", borderWidth: 1 }}>
              <Notice>
                Transfer {formatMoney(cartTotal)} to CBE Account: {p.account?.account_number} ({p.account?.account_holder}).
                Then upload your payment screenshot or paste the complete receipt link.
              </Notice>

              {image ? (
                <View style={{ gap: 8 }}>
                  <Notice tone="success">Payment screenshot selected. Ready for verification.</Notice>
                  <Button
                    title="Remove screenshot"
                    variant="outline"
                    disabled={submitting || picking}
                    onPress={() => setImage(null)}
                  />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Field
                    label="Complete CBE receipt link"
                    value={cbeLink}
                    onChangeText={setCbeLink}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!submitting && !picking}
                  />
                  <Text size={11} color="#7A828F">Example: https://apps.cbe.com.et:2018/...</Text>
                </View>
              )}

              <Button
                title={image ? "Choose another screenshot" : "Upload CBE receipt screenshot"}
                icon={UploadSimple}
                variant="outline"
                disabled={submitting || picking}
                onPress={() => void chooseScreenshot()}
              />
            </Card>
          )}

          {/* Telebirr Payment Details & Proof Input */}
          {method === "telebirr" && p.key === "telebirr" && (
            <Card tint="#FAFAF8" style={{ marginTop: 8, padding: 16, gap: 10, borderColor: "#092036", borderWidth: 1 }}>
              <Notice>
                Transfer {formatMoney(cartTotal)} to Telebirr phone: {p.account?.account_number} ({p.account?.account_holder}).
                Then upload your payment screenshot or enter your Telebirr reference number.
              </Notice>

              {image ? (
                <View style={{ gap: 8 }}>
                  <Notice tone="success">Payment screenshot selected. Ready for verification.</Notice>
                  <Button
                    title="Remove screenshot"
                    variant="outline"
                    disabled={submitting || picking}
                    onPress={() => setImage(null)}
                  />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Field
                    label="Telebirr reference number"
                    value={telebirrRef}
                    onChangeText={setTelebirrRef}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!submitting && !picking}
                  />
                  <Text size={11} color="#7A828F">Example: EB4589ABCD (from your Telebirr SMS or transaction receipt)</Text>
                </View>
              )}

              <Button
                title={image ? "Choose another screenshot" : "Upload Telebirr receipt screenshot"}
                icon={UploadSimple}
                variant="outline"
                disabled={submitting || picking}
                onPress={() => void chooseScreenshot()}
              />
            </Card>
          )}

          {/* Abyssinia / Other Bank Payment Details */}
          {['abyssinia'].includes(p.key) && method === p.key && (
            <Card tint="#FAFAF8" style={{ marginTop: 8, padding: 16, gap: 10, borderColor: "#092036", borderWidth: 1 }}>
              <Notice>
                Transfer {formatMoney(cartTotal)} to {p.account?.institution} Account: {p.account?.account_number} ({p.account?.account_holder}).
              </Notice>
              {image ? (
                <View style={{ gap: 8 }}>
                  <Notice tone="success">Payment screenshot selected. Ready for verification.</Notice>
                  <Button
                    title="Remove screenshot"
                    variant="outline"
                    disabled={submitting || picking}
                    onPress={() => setImage(null)}
                  />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  <Field
                    label="Transaction reference"
                    value={otherRef}
                    onChangeText={setOtherRef}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!submitting && !picking}
                  />
                  <Field
                    label="Five-digit account suffix (if shown)"
                    value={suffix}
                    onChangeText={setSuffix}
                    keyboardType="number-pad"
                    maxLength={5}
                    editable={!submitting && !picking}
                  />
                </View>
              )}
              <Button
                title={image ? "Choose another screenshot" : "Upload receipt screenshot"}
                icon={UploadSimple}
                variant="outline"
                disabled={submitting || picking}
                onPress={() => void chooseScreenshot()}
              />
            </Card>
          )}
        </View>
      ))}

      <View style={{ height: 12 }} />

      <Field
        label="Order Note (Optional)"
        multiline
        value={note}
        onChangeText={setNote}
      />

      {errorMessage ? (
        <View style={{ marginTop: 8 }}>
          <Notice tone="error">{errorMessage}</Notice>
        </View>
      ) : null}

      {cart.length > 0 && cartTotal === 0 && <Notice>No payment required for zero-total order.</Notice>}

      <Button
        title={submitting ? "Placing Order…" : (image || cbeLink || telebirrRef || otherRef) ? "Place Order & Verify Payment" : "Place Order"}
        icon={submitting ? undefined : CheckCircle}
        disabled={!cart.length || submitting}
        onPress={handlePlaceOrder}
        style={{ marginTop: 16, marginBottom: 24 }}
      />
    </Page>
  );
}

export function CheckoutScreen(props: any) {
  return <ShopAccess><CheckoutScreenContent {...props} /></ShopAccess>;
}
