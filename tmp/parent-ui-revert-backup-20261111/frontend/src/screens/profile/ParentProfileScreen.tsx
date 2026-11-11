import { colors } from "../../theme/tokens";
import { apiClient } from "../../api/client";
import React, { useState, useEffect, useCallback } from "react";
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
import { useAuth } from "../../context/AuthContext";
import { contactError } from "../../utils/contact";
import { updateMyProfile } from "../../api/parentApi";

export function ParentProfileScreen({ navigation }: any) {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(user?.email || "");

  // Meal Suggestions & Food Preferences (feature_design_plan_v2 §5.9)
  const [cuisine, setCuisine] = useState("");
  const [householdDiet, setHouseholdDiet] = useState("");
  const [aiConsent, setAiConsent] = useState(false);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");
  const [foodLoaded, setFoodLoaded] = useState(false);
  const [foodSaving, setFoodSaving] = useState(false);
  const [foodMessage, setFoodMessage] = useState('');
  const [foodSuccess, setFoodSuccess] = useState(false);

  const loadFood = useCallback(async () => {
    setFoodMessage(''); setFoodSuccess(false);
    try {
      const {data} = await apiClient.get('/notifications/preferences');
      setCuisine(data.food?.cuisine || ''); setHouseholdDiet(data.food?.diet || '');
      setAiConsent(data.food?.ai_consent ?? false); setFoodLoaded(true);
    } catch { setFoodMessage('Food preferences could not be loaded. Retry before editing.'); }
  }, []);
  useEffect(() => { void loadFood(); }, [loadFood]);
  const saveFood = async () => {
    if (!foodLoaded) return;
    setFoodSaving(true); setFoodMessage(''); setFoodSuccess(false);
    try {
      await apiClient.patch('/notifications/preferences', {food: {cuisine: cuisine.trim(), diet: householdDiet.trim(), ai_consent: aiConsent}});
      setFoodSuccess(true); setFoodMessage('Food preferences saved.');
    } catch { setFoodMessage('Food preferences could not be saved. Your changes are still here; please retry.'); }
    finally { setFoodSaving(false); }
  };
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
      await updateMyProfile({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      });
      await refreshUser();
      setSuccess(true);
      setMessage("Contact details saved.");
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
      <Card style={[s.row, { marginBottom: 20, padding: 16 }]}>
        <Avatar initials={(user?.name || 'Parent').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()} size={48} />
        <Text size={18} weight="semibold" style={{ flex: 1 }}>
          {name}
        </Text>
      </Card>

      {/* Account Details */}
      <Text size={13} color={colors.textSecondary} style={{ letterSpacing: 0.8, marginBottom: 10 }}>
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
        {!!message && <Notice tone={success ? 'success' : 'error'}>{message}</Notice>}
        <Button title="Save contact details" loading={saving} onPress={handleSave} />
      </Card>

      {/* Food Preferences & AI Guide Personalization (feature_design_plan_v2 §5.9) */}
      <Text size={13} color={colors.textSecondary} style={{ letterSpacing: 0.8, marginBottom: 10 }}>
        HOUSEHOLD FOOD & MEAL PREFERENCES
      </Text>
      <Card style={{ marginBottom: 20 }}>
        <Field
          label="Cuisine & Cooking Style"
          icon={ForkKnife}
          value={cuisine}
          editable={foodLoaded && !foodSaving}
          onChangeText={setCuisine}
          placeholder="e.g. Ethiopian traditional, Vegetarian, Mediterranean"
        />
        <Field
          label="Household Dietary Notes"
          icon={ForkKnife}
          value={householdDiet}
          editable={foodLoaded && !foodSaving}
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
            <Text size={14} color="#5A6679" style={{ marginTop: 3 }}>
              Allow the AI provider to use your child's saved age and allergy/dietary notes. Names and classroom names are excluded. Your question itself is sent when you use the guide.
            </Text>
          </View>
          <Switch
            accessibilityLabel="AI Guide meal personalization"
            value={aiConsent}
            disabled={!foodLoaded || foodSaving}
            onValueChange={setAiConsent}
            trackColor={{ false: "#E3E2E5", true: "#061224" }}
            thumbColor="white"
          />
        </View>
      </Card>

      {foodMessage ? (
        <View style={{ marginBottom: 16 }}>
          <Notice tone={foodSuccess ? "success" : "error"}>
            {foodMessage}
          </Notice>
        </View>
      ) : null}

      <Button
        title={foodLoaded ? "Save food preferences" : "Retry loading food preferences"}
        loading={foodSaving}
        onPress={foodLoaded ? saveFood : loadFood}
        style={{ marginTop: 8, marginBottom: 24 }}
      />
    </Page>
  );
}
