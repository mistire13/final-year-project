import { apiClient } from "../../api/client";
import React, { useState, useEffect } from "react";
import { View, Switch, ActivityIndicator } from "react-native";
import { User } from "phosphor-react-native/src/icons/User";
import { Phone } from "phosphor-react-native/src/icons/Phone";
import { EnvelopeSimple } from "phosphor-react-native/src/icons/EnvelopeSimple";
import { ForkKnife } from "phosphor-react-native/src/icons/ForkKnife";
import { Sparkle } from "phosphor-react-native/src/icons/Sparkle";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
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
import { artwork } from "../../theme/assets";
import { useAuth } from "../../context/AuthContext";
import { contactError } from "../../utils/contact";
import { updateMyProfile } from "../../api/parentApi";

export function ParentProfileScreen({ navigation }: any) {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");

  // Meal Suggestions & Food Preferences (feature_design_plan_v2 §5.9)
  const [cuisine, setCuisine] = useState("");
  const [householdDiet, setHouseholdDiet] = useState("");
  const [aiConsent, setAiConsent] = useState(true);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(()=>{apiClient.get('/notifications/preferences').then(({data})=>{setCuisine(data.food?.cuisine||'');setHouseholdDiet(data.food?.diet||'');setAiConsent(data.food?.ai_consent??false);}).catch(()=>setMessage('Food preferences could not be loaded. Please reconnect before editing.'));},[]);
  const handleSave = async () => {
    const valErr = contactError(name, phone, email, true);
    if (valErr) {
      setMessage(valErr);
      setSuccess(false);
      return;
    }

    setSaving(true);
    setMessage("");
    setSuccess(false);

    try {
      await apiClient.patch("/notifications/preferences",{food:{cuisine:cuisine.trim(),diet:householdDiet.trim(),ai_consent:aiConsent}});
      await updateMyProfile({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      });
      setSuccess(true);
      setMessage("Your profile and food preferences have been saved successfully.");
    } catch (err: any) {
      setSuccess(false);
      const msg = err?.response?.data?.error || err?.message || "Could not update profile. Please try again.";
      setMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Personal Information" back tabs activeTab="Profile">
      {/* Profile Header Card */}
      <Card style={{ alignItems: "center", marginBottom: 20, paddingVertical: 22 }}>
        <Avatar source={artwork.mother} size={88} />
        <Text size={22} weight="semibold" style={{ marginTop: 14 }}>
          {name}
        </Text>
        <Text size={13} color="#7E8793" style={{ marginTop: 2 }}>
          {user?.email || email} · Registered Parent
        </Text>
      </Card>

      {/* Account Details */}
      <Text size={13} color="#747B87" style={{ letterSpacing: 0.8, marginBottom: 10 }}>
        CONTACT DETAILS
      </Text>
      <Card style={{ marginBottom: 20 }}>
        <Field
          label="Full Name"
          icon={User}
          value={name}
          onChangeText={setName}
        />
        <Field
          label="Phone Number"
          icon={Phone}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Field
          label="Email Address"
          icon={EnvelopeSimple}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </Card>

      {/* Food Preferences & AI Guide Personalization (feature_design_plan_v2 §5.9) */}
      <Text size={13} color="#747B87" style={{ letterSpacing: 0.8, marginBottom: 10 }}>
        HOUSEHOLD FOOD & MEAL PREFERENCES
      </Text>
      <Card style={{ marginBottom: 20 }}>
        <Field
          label="Cuisine & Cooking Style"
          icon={ForkKnife}
          value={cuisine}
          onChangeText={setCuisine}
          placeholder="e.g. Ethiopian traditional, Vegetarian, Mediterranean"
        />
        <Field
          label="Household Dietary Notes"
          icon={ForkKnife}
          value={householdDiet}
          onChangeText={setHouseholdDiet}
          placeholder="e.g. Nut-free home, low sodium"
        />

        <View style={[s.between, { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#EDEAE4" }]}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <View style={s.row}>
              <Sparkle size={16} color="#8A5A12" weight="fill" />
              <Text size={13} weight="semibold" style={{ marginLeft: 6 }}>
                AI Guide Meal Personalization
              </Text>
            </View>
            <Text size={11} color="#78818D" style={{ marginTop: 3 }}>
              Save your meal-planning preferences for your account. Personalization requires the AI guide integration.
            </Text>
          </View>
          <Switch
            accessibilityLabel="AI Guide meal personalization"
            value={aiConsent}
            onValueChange={setAiConsent}
            trackColor={{ false: "#E3E2E5", true: "#061224" }}
            thumbColor="white"
          />
        </View>
      </Card>

      {message ? (
        <View style={{ marginBottom: 16 }}>
          <Notice tone={success ? "neutral" : "error"}>
            {message}
          </Notice>
        </View>
      ) : null}

      <Button
        title="Save Changes"
        loading={saving}
        onPress={handleSave}
        style={{ marginTop: 8, marginBottom: 24 }}
      />
    </Page>
  );
}
