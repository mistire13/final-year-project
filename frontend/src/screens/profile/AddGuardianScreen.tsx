import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { User, Phone, EnvelopeSimple, UserPlus } from "phosphor-react-native";
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
import { useDesign } from "../../context/DesignContext";
import { useChild } from "../../context/ChildContext";
import { contactError } from "../../utils/contact";
export function AddGuardianScreen({ navigation }: any) {
  const { saveGuardian } = useDesign();
  const { selectedChild } = useChild();
  const childFirst = selectedChild?.full_name ? selectedChild.full_name.split(" ")[0] : "your child";
  const childGroup = selectedChild?.group_name || "Daycare Classroom";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState("Mother");
  const [error, setError] = useState("");
  const save = () => {
    const problem = contactError(name, phone, email);
    if (problem) {
      setError(problem);
      return;
    }
    const id = Date.now();
    saveGuardian({
      id,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      relationship: relation,
      authorized: false,
      enrolled: false,
      photo: null,
    });
    navigation.replace("GuardianDetails", {
      guardianId: id,
      guardian: {
        guardian_link_id: id,
        user_id: id,
        name: name.trim(),
        email: email.trim(),
        relationship: relation,
        pickup_authorized: false,
        biometric_enrolled: false,
        created_at: new Date().toISOString(),
      },
    });
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
          <Avatar source={artwork.guardianChild} initials={childFirst.slice(0, 2).toUpperCase()} />
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
        Draft only. Daycare staff approve pickup access and arrange adult
        verification.
      </Notice>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        title="Save Draft"
        icon={UserPlus}
        onPress={save}
        style={{ marginTop: 20 }}
      />
    </Page>
  );
}
