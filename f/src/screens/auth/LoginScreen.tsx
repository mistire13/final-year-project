import React, { useState } from "react";
import { View, Pressable, TextInput, Platform, Linking } from "react-native";
import { Lock } from "phosphor-react-native/src/icons/Lock";
import { Eye } from "phosphor-react-native/src/icons/Eye";
import { EyeSlash } from "phosphor-react-native/src/icons/EyeSlash";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { ArrowLeft } from "phosphor-react-native/src/icons/ArrowLeft";
import { EnvelopeSimple } from "phosphor-react-native/src/icons/EnvelopeSimple";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import {
  Page,
  Text,
  Button,
  Field,
  BrandMark,
  Notice,
  s,
  IconButton,
} from "../../components/design/System";
import { useAuth } from "../../context/AuthContext";
import { getWebPortalUrl } from "../../utils/host";

export function LoginScreen({ navigation, route }: any) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    if (password.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }

    setBusy(true);
    setError("");
    const result = await login(trimmedEmail, password);
    setBusy(false);

    if (result.success) {
      if (result.role === "super_admin") {
        if (Platform.OS === "web") {
          window.location.assign("/super-admin");
        } else {
          const url = getWebPortalUrl("/super-admin");
          try {
            await Linking.openURL(url);
          } catch {
            setError(`Super Admin Console is web-based. Open ${url} in your browser.`);
          }
        }
        return;
      }
      if (Platform.OS === "web") {
        if (result.role === "admin") {
          window.location.assign("/admin");
          return;
        }
        if (result.role === "caregiver") {
          window.location.assign("/staff");
          return;
        }
      }

      // AuthProvider remounts this navigator for the new account. Its Splash
      // screen routes only after role-specific screens have been registered.
    } else {
      setError(result.error || "Unable to sign in. Please check your credentials.");
    }
  };

  if (route?.params?.mode === "register") {
    return <RegisterScreen navigation={navigation} />;
  }

  return (
    <Page
      header={false}
      decorative
      contentStyle={{ paddingHorizontal: 24, paddingTop: 24 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to welcome"
          onPress={() => navigation.navigate("Splash")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 16,
            backgroundColor: "#F0EEF0",
          }}
        >
          <ArrowLeft size={15} color="#061224" weight="bold" />
          <Text size={12} weight="bold" color="#061224">Back</Text>
        </Pressable>

        <BrandMark size={32} />
      </View>

      <View style={{ marginTop: 40, marginBottom: 24, alignItems: "center" }}>
        <Text size={32} weight="bold" style={{ textAlign: "center", color: "#10263D" }}>
          Sign in
        </Text>
      </View>

      {/* Email Field */}
      <Field
        label="Email Address"
        icon={EnvelopeSimple}
        placeholder="Enter your email address"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setError("");
        }}
        autoComplete="email"
      />

      {/* Password Field */}
      <Text weight="semibold" size={14} style={{ marginBottom: 8 }}>
        Password
      </Text>
      <View style={[s.inputWrap, { marginBottom: 12 }]}>
        <Lock size={20} color="#737984" />
        <TextInput
          accessibilityLabel="Password"
          placeholder="Enter your password"
          placeholderTextColor="#9295A1"
          style={s.input}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setError("");
          }}
          secureTextEntry={!visible}
          autoComplete="current-password"
          onSubmitEditing={handleSignIn}
        />
        <IconButton
          icon={visible ? Eye : EyeSlash}
          label={visible ? "Hide password" : "Show password"}
          onPress={() => setVisible(!visible)}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate("ForgotPassword")}
        style={{ alignSelf: "flex-end", marginBottom: 16 }}
      >
        <Text size={13} weight="medium" color="#4D5663">
          Forgot Password?
        </Text>
      </Pressable>

      {/* Error Banner */}
      {error ? (
        <View style={{ marginBottom: 16 }}>
          <Notice tone="error">{error}</Notice>
        </View>
      ) : null}

      {/* Primary Action Button */}
      <Button
        title={busy ? "Signing In…" : "Sign In"}
        icon={busy ? undefined : ArrowRight}
        loading={busy}
        onPress={handleSignIn}
        style={{ marginTop: 8 }}
      />

      <View style={{ marginTop: 28, alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("Register")}
          style={{ padding: 8 }}
        >
          <Text size={13} weight="bold" color="#10263D">How to get access</Text>
        </Pressable>
      </View>
    </Page>
  );
}

export function RegisterScreen({ navigation }: any) {
  return (
    <Page header={false} decorative contentStyle={{ paddingHorizontal: 24, paddingTop: 60 }}>
      <BrandMark size={48} />
      <Text size={28} weight="bold" style={{ marginTop: 24, marginBottom: 16 }}>
        Join your daycare
      </Text>
      <Notice>
        Your daycare administrator creates your parent account and links your children.
        Contact the daycare office to request access or enroll another child.
      </Notice>
      <Text color="#626872" style={{ marginTop: 20, marginBottom: 24 }}>
        Use the sign-in details provided by your daycare. If your children attend different
        daycares, each daycare manages a separate account for you.
      </Text>
      <Button title="Back to sign in" icon={ArrowRight} onPress={() => navigation.replace("Login", { mode: "signin" })} />
    </Page>
  );
}
