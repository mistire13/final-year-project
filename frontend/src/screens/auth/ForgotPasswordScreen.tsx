import React, { useState } from "react";
import { View } from "react-native";
import { EnvelopeSimple } from "phosphor-react-native/src/icons/EnvelopeSimple";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { LockKey } from "phosphor-react-native/src/icons/LockKey";
import {
  Page,
  Text,
  Field,
  Button,
  Notice,
} from "../../components/design/System";
import { apiClient } from "../../api/client";
export function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFailed(true);
      setMessage("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.post("/auth/forgot-password", { email });
      setFailed(false);
      setSubmitted(true);
      setMessage(
        "If your account is registered, recovery instructions and security token have been generated.",
      );
    } catch {
      setFailed(true);
      setMessage("Unable to send your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page header={false} title="Forgot Password" back decorative>
      <View style={{ height: 50 }} />
      <View
        style={{
          alignSelf: "center",
          padding: 22,
          borderRadius: 50,
          backgroundColor: "#FFF0C9",
          marginBottom: 20,
        }}
      >
        <LockKey size={36} color="#7D621E" />
      </View>
      <Text size={28} weight="bold" style={{ textAlign: "center" }}>
        Let’s get you back in
      </Text>
      <Text color="#737781" style={{ textAlign: "center", marginVertical: 14 }}>
        Enter the email linked to your daycare account.
      </Text>
      <Field
        label="Email address"
        icon={EnvelopeSimple}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setMessage("");
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        placeholder="Your email address"
      />
      {message ? (
        <Notice tone={failed ? "error" : "success"}>{message}</Notice>
      ) : null}

      {!submitted ? (
        <>
          <Button
            title="Send Reset Request"
            icon={ArrowRight}
            onPress={submit}
            loading={busy}
          />
          <Button
            title="I have a reset code / token"
            variant="secondary"
            onPress={() => navigation.navigate("OTP", { email })}
            style={{ marginTop: 12 }}
          />
        </>
      ) : (
        <>
          <Button
            title="Enter Reset Code & Set Password"
            icon={ArrowRight}
            onPress={() => navigation.navigate("OTP", { email })}
            style={{ marginTop: 12 }}
          />
          <Button
            title="Back to Sign In"
            variant="secondary"
            onPress={() => navigation.navigate("Login")}
            style={{ marginTop: 10 }}
          />
        </>
      )}
    </Page>
  );
}
