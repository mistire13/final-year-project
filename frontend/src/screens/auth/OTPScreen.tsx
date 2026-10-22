import React, { useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { LockKey, ArrowRight, CheckCircle, Eye, EyeSlash, ShieldCheck } from "phosphor-react-native";
import { Page, Text, Button, Notice, Field, Card, s, IconButton } from "../../components/design/System";
import { apiClient } from "../../api/client";

export function OTPScreen({ navigation, route }: any) {
  const initialEmail = route?.params?.email || "";
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async () => {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError("Please enter your verification code or reset token.");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await apiClient.post("/auth/reset-password", {
        token: trimmedToken,
        new_password: newPassword,
      });

      setSuccess(true);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Invalid or expired verification code. Please check with your daycare director.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Account Recovery" back decorative>
      <View style={{ alignItems: "center", paddingTop: 20, marginBottom: 20 }}>
        <View
          style={{
            padding: 18,
            borderRadius: 40,
            backgroundColor: "#FFF0C9",
            marginBottom: 16,
          }}
        >
          <LockKey size={34} color="#7D621E" />
        </View>
        <Text size={26} weight="bold" style={{ textAlign: "center", color: "#10263D" }}>
          Reset Password
        </Text>
        <Text color="#747984" style={{ textAlign: "center", marginTop: 8, maxWidth: 320, fontSize: 13, lineHeight: 18 }}>
          {initialEmail
            ? `Enter the recovery token or verification code issued for ${initialEmail}`
            : "Enter the security code or recovery token provided by your daycare office."}
        </Text>
      </View>

      {success ? (
        <Card style={{ padding: 24, alignItems: "center", backgroundColor: "#F2F9F5", borderColor: "#BCE3CB" }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#E6F4EA",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <CheckCircle size={36} color="#1E7E34" weight="fill" />
          </View>
          <Text size={20} weight="bold" color="#10263D" style={{ textAlign: "center" }}>
            Password Reset Complete!
          </Text>
          <Text size={13} color="#55606E" style={{ textAlign: "center", marginTop: 8, lineHeight: 19 }}>
            Your account credentials have been securely updated. You can now sign in to your daycare parent account.
          </Text>
          <Button
            title="Sign In with New Password"
            icon={ArrowRight}
            onPress={() => navigation.navigate("Login")}
            style={{ marginTop: 20, width: "100%" }}
          />
        </Card>
      ) : (
        <Card style={{ padding: 20 }}>
          {/* Recovery Token Field */}
          <Text weight="semibold" size={13} style={{ marginBottom: 6, color: "#10263D" }}>
            Recovery Token or Verification Code *
          </Text>
          <View style={[s.inputWrap, { marginBottom: 16 }]}>
            <ShieldCheck size={20} color="#737984" />
            <TextInput
              accessibilityLabel="Reset Token or Verification Code"
              placeholder="e.g. lr1... or code from admin"
              placeholderTextColor="#9295A1"
              style={s.input}
              value={token}
              onChangeText={(v) => {
                setToken(v);
                setError("");
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* New Password */}
          <Text weight="semibold" size={13} style={{ marginBottom: 6, color: "#10263D" }}>
            New Password (minimum 8 characters) *
          </Text>
          <View style={[s.inputWrap, { marginBottom: 16 }]}>
            <TextInput
              accessibilityLabel="New Password"
              placeholder="Enter your new password"
              placeholderTextColor="#9295A1"
              style={s.input}
              value={newPassword}
              onChangeText={(v) => {
                setNewPassword(v);
                setError("");
              }}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
            />
            <IconButton
              icon={showPassword ? Eye : EyeSlash}
              label={showPassword ? "Hide password" : "Show password"}
              onPress={() => setShowPassword(!showPassword)}
            />
          </View>

          {/* Confirm New Password */}
          <Text weight="semibold" size={13} style={{ marginBottom: 6, color: "#10263D" }}>
            Confirm New Password *
          </Text>
          <View style={[s.inputWrap, { marginBottom: 18 }]}>
            <TextInput
              accessibilityLabel="Confirm New Password"
              placeholder="Re-enter your new password"
              placeholderTextColor="#9295A1"
              style={s.input}
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                setError("");
              }}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
            />
          </View>

          {error ? (
            <View style={{ marginBottom: 16 }}>
              <Notice tone="error">{error}</Notice>
            </View>
          ) : null}

          <Button
            title={busy ? "Updating Password…" : "Update Password"}
            icon={busy ? undefined : ArrowRight}
            loading={busy}
            disabled={!token.trim() || !newPassword || !confirmPassword}
            onPress={handleResetPassword}
          />

          <Button
            title="Return to Sign In"
            variant="secondary"
            onPress={() => navigation.navigate("Login")}
            style={{ marginTop: 12 }}
          />

          <Text
            size={12}
            color="#808691"
            style={{ textAlign: "center", marginTop: 16, lineHeight: 17 }}
          >
            Need a direct account reset? Your daycare administrator can also update your credentials from the center office.
          </Text>
        </Card>
      )}
    </Page>
  );
}
