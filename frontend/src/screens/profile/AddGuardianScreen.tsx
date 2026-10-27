import React, { useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { User } from "phosphor-react-native/src/icons/User";
import { Phone } from "phosphor-react-native/src/icons/Phone";
import { EnvelopeSimple } from "phosphor-react-native/src/icons/EnvelopeSimple";
import { UserPlus } from "phosphor-react-native/src/icons/UserPlus";
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
import { requestPickupGuardian } from "../../api/parentApi";
import { useChild } from "../../context/ChildContext";
import { contactError } from "../../utils/contact";
export function AddGuardianScreen({ navigation }: any) {
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const { selectedChild } = useChild();
  const childFirst = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "your child";
  const childGroup = selectedChild?.group_name || "Daycare Classroom";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("Mother");
  const [error, setError] = useState("");
  const requestKey = useRef(`guardian-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const save = async () => {
    const problem = contactError(name, phone, email);
    if (problem) { setError(problem); return; }
    if (!selectedChild) { setError("Select a child before requesting a guardian."); return; }
    setSaving(true); setError("");
    try {
      await requestPickupGuardian(selectedChild.id, {name:name.trim(),phone:phone.trim(),email:email.trim(),relationship:relation,request_key:requestKey.current});
      setSent(true);
    } catch (err: any) { setError(err?.response?.data?.message || err.message || "Request could not be sent. Please try again."); }
    finally { setSaving(false); }
  };
  return (
    <Page
      title="Add Guardian"
      subtitle={`Add a trusted adult for ${childFirst}.`}
      back
      tabs
      activeTab="Profile"
    >
      <Card tint="#FFFAEE" style={{ marginBottom: 22 }}>
        <View style={s.row}>
          <Avatar source={selectedChild?.photo_url?{uri:selectedChild.photo_url}:undefined} initials={childFirst.slice(0, 2).toUpperCase()} />
          <View>
            <Text size={20} weight="semibold">
              {selectedChild?.full_name || childFirst}
            </Text>
            <Text size={12} color="#878D98">
              {childGroup}
            </Text>
          </View>
        </View>
      </Card>
      <Card>
        <Field
          label="Full Name"
          icon={User}
          placeholder="Guardian’s full name"
          value={name}
          onChangeText={setName}
        />
        <Text size={14} weight="semibold" style={{ marginBottom: 10 }}>
          Relationship
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 22,
          }}
        >
          {["Mother", "Father", "Aunt", "Uncle", "Other"].map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityState={{ selected: r === relation }}
              aria-pressed={r === relation}
              onPress={() => setRelation(r)}
              style={{
                paddingHorizontal: 13,
                paddingVertical: 9,
                borderRadius: 20,
                backgroundColor: r === relation ? "#061224" : "#EFEEF1",
              }}
            >
              <Text size={12} color={r === relation ? "white" : "#6C7480"}>
                {r}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field
          label="Phone Number"
          icon={Phone}
          placeholder="+251…"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Field
          label="Email Address"
          icon={EnvelopeSimple}
          placeholder="Email address (optional)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </Card>
      <Notice>
        Your daycare reviews this request before granting pickup permission. This contact will not receive parent-app access.
      </Notice>
      {sent ? <Notice tone="success">Request saved. You can track the decision on your Guardians page. Pickup permission is pending approval.</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        title={sent ? "Request sent" : saving ? "Sending…" : "Request guardian approval"}
        disabled={saving || sent}
        icon={UserPlus}
        onPress={save}
        style={{ marginTop: 20 }}
      />
    </Page>
  );
}
