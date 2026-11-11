import { apiClient } from "../../api/client";
import { useChild } from "../../context/ChildContext";
/**
 * ChildProfileWizardScreen.tsx
 * 5-step wizard that collects child care profile data from the parent.
 * On completion, marks profile_complete=true and redirects to MainTabs.
 *
 * Steps:
 *  1. Child Info — fulfill child full name, DOB, age, gender, group, relationship
 *  2. Food & Allergies — food allergies and dietary restrictions
 *  3. Medical & Medications — daily medications, medical conditions
 *  4. Emergency Contacts — up to 3 people to call in emergency
 *  5. Care Notes — extra notes for caregiver (routine, comfort, special needs)
 *
 * SRS Refs: FR-CH-02, FR-CH-03, FR-UAM-05
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  TextInput,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Warning } from "phosphor-react-native/src/icons/Warning";
import { Pill } from "phosphor-react-native/src/icons/Pill";
import { Phone } from "phosphor-react-native/src/icons/Phone";
import { FileText } from "phosphor-react-native/src/icons/FileText";
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { Plus } from "phosphor-react-native/src/icons/Plus";
import { Trash } from "phosphor-react-native/src/icons/Trash";
import { ArrowRight } from "phosphor-react-native/src/icons/ArrowRight";
import { ArrowLeft } from "phosphor-react-native/src/icons/ArrowLeft";
import { Baby } from "phosphor-react-native/src/icons/Baby";
import { User } from "phosphor-react-native/src/icons/User";
import { ShieldCheck } from "phosphor-react-native/src/icons/ShieldCheck";
import { Info } from "phosphor-react-native/src/icons/Info";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { Check } from "phosphor-react-native/src/icons/Check";
import { Users } from "phosphor-react-native/src/icons/Users";
import { CaretDown } from "phosphor-react-native/src/icons/CaretDown";
import { CaretUp } from "phosphor-react-native/src/icons/CaretUp";
import { MagnifyingGlass } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { X } from "phosphor-react-native/src/icons/X";
import { SignOut } from "phosphor-react-native/src/icons/SignOut";
import { House } from "phosphor-react-native/src/icons/House";
import { ForkKnife } from "phosphor-react-native/src/icons/ForkKnife";
import {
  Text,
  Button,
  Notice,
  s,
  BrandMark,
} from "../../components/design/System";
import { useAuth } from "../../context/AuthContext";
import { colors, fonts } from '../../theme/tokens';
import { parentTextFont } from '../../utils/parentTypography';
import { useReducedMotion } from '../../components/design/Motion';
import { replaceCareSection } from '../../utils/careProfileSections';
import {
  getMyChildren,
  updateChildProfile,
  getGroups,
  updateCareInstructions,
  updateEmergencyContacts,
  markProfileComplete,
  CareInstructionInput,
  EmergencyContactInput,
  ChildSummary,
  GroupRecord,
} from "../../api/parentApi";

// ─── Design Tokens ───────────────────────────────────────────────────────────
const BRAND = colors.bgNavy;
const BRAND_LIGHT = "#E8F5EE";
const ACCENT = "#F4A261";
const DANGER = colors.dangerText;
const SURFACE = "#FFFFFF";
const BG = colors.bgApp;
const TEXT_DARK = colors.textPrimary;
const TEXT_MUTED = colors.textSecondary;

// ─── Step config ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Child & Parent Info", icon: Baby, color: BRAND },
  { id: 2, label: "Allergies", icon: Warning, color: "#E8994C" },
  { id: 3, label: "Medical", icon: Pill, color: "#9B4CE8" },
  { id: 4, label: "Emergency", icon: Phone, color: DANGER },
  { id: 5, label: "Care Notes", icon: FileText, color: BRAND },
];

// ─── Types ───────────────────────────────────────────────────────────────────
interface AllergyEntry {
  id: string;
  text: string;
}
interface MedEntry {
  id: string;
  name: string;
  dosage: string;
  schedule: string;
}
interface ContactEntry {
  id: string;
  name: string;
  relationship: string;
  phone: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

function ageFromDOB(dob?: string) {
  if (!dob) return "";
  const parts = dob.trim().split("-");
  if (parts.length !== 3) return "";
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return "";

  const birth = new Date(year, month, day);
  if (isNaN(birth.getTime())) return "";
  const today = new Date();

  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  if (today.getDate() < birth.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return "Invalid date (in the future)";
  if (years === 0 && months <= 0) return "Newborn (< 1 month old)";
  if (years === 0) return `${months} month${months !== 1 ? "s" : ""} old`;
  if (months === 0) return `${years} year${years !== 1 ? "s" : ""} old`;
  return `${years} yr${years !== 1 ? "s" : ""}, ${months} mo${months !== 1 ? "s" : ""} old`;
}

// ─── Sub-component: Small tag chip ───────────────────────────────────────────
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: BRAND_LIGHT,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text size={13} weight="medium" color={BRAND}>
        {label}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove allergy ${label}`} onPress={onRemove} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
        <Trash size={13} color={BRAND} />
      </Pressable>
    </View>
  );
}

// ─── Sub-component: Inline text input row ────────────────────────────────────
function InlineField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = "default",
}: any) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        size={13}
        weight="semibold"
        color={TEXT_MUTED}
        style={{ marginBottom: 4 }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value ?? ""}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TEXT_MUTED}
        multiline={multiline}
        keyboardType={keyboardType}
        style={{
          backgroundColor: SURFACE,
          borderWidth: 1.5,
          borderColor: "#DCE6E1",
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          fontSize: 16,
          fontFamily: parentTextFont(value || placeholder, 'medium', Platform.OS),
          color: TEXT_DARK,
          minHeight: multiline ? 96 : 54,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

// ─── Sub-component: Step Indicator ───────────────────────────────────────────
function StepIndicator({ step, total, editing = false }: { step: number; total: number; editing?: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = step / total;
  const anim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: progress,
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: false,
    }).start();
  }, [step, reduceMotion]);

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Text size={12} color={TEXT_MUTED} weight="medium">
          {editing ? 'Section' : 'Step'} {step} of {total}
        </Text>
        <Text size={12} color={BRAND} weight="semibold">
          {STEPS[step - 1].label}
        </Text>
      </View>
      <View
        style={{
          height: 6,
          backgroundColor: "#DCE6E1",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: BRAND,
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          }}
        />
      </View>
    </View>
  );
}

// ─── Sub-component: Step Header Card ─────────────────────────────────────────
function StepHeader({ stepIndex }: { stepIndex: number }) {
  const s = STEPS[stepIndex];
  return (
    <View style={{ paddingVertical: 12 }}>
      <Text
        size={22}
        weight="bold"
        color={TEXT_DARK}
        accessibilityRole="header"
      >
        {s.label}
      </Text>
    </View>
  );
}

// ─── STEP 1: Child & Parent Information Fulfillment ──────────────────────────
function StepChildInfo({
  user,
  parentName,
  setParentName,
  fullName,
  setFullName,
  dob,
  setDob,
  gender,
  setGender,
  groupId,
  setGroupId,
  groups,
  relationship,
  setRelationship,
  pickupAuthorized,
  setPickupAuthorized,
}: any) {
  const calculatedAge = ageFromDOB(dob);
  const selectedGroup = groups.find((g: GroupRecord) => g.id === groupId);

  const DOB_PRESETS = [
    { label: "Infant (2026)", val: "2026-02-15" },
    { label: "1 yr (2025)", val: "2025-04-10" },
    { label: "2 yrs (2024)", val: "2024-05-12" },
    { label: "3 yrs (2023)", val: "2023-03-20" },
    { label: "4 yrs (2022)", val: "2022-07-15" },
    { label: "5 yrs (2021)", val: "2021-09-01" },
  ];

  return (
    <View>
      <StepHeader stepIndex={0} />
      <Text
        size={14}
        color={TEXT_MUTED}
        style={{ textAlign: "center", marginBottom: 20, lineHeight: 22 }}
      >
        Review your child’s details and your relationship. Your daycare manages the classroom assignment.
      </Text>

      {/* ─── PARENT INFORMATION SECTION ─── */}
      <View
        style={{
          backgroundColor: SURFACE,
          borderRadius: 16,
          padding: 16,
          marginBottom: 20,
          borderWidth: 1.5,
          borderColor: "#DCE6E1",
          shadowColor: "#000",
          shadowOpacity: 0.03,
          shadowRadius: 6,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: BRAND_LIGHT,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 8,
              }}
            >
              <User size={18} color={BRAND} weight="bold" />
            </View>
            <Text size={15} weight="bold" color={TEXT_DARK}>
              Your details
            </Text>
          </View>
          
        </View>

        <InlineField
          label="Your full name"
          value={parentName}
          onChangeText={setParentName}
          placeholder="e.g. Jane Doe"
        />

        <Text size={14} color={TEXT_MUTED}>{user?.email || 'Account email'}</Text>
      </View>

      {/* ─── CHILD INFORMATION SECTION ─── */}
      <View
        style={{
          backgroundColor: SURFACE,
          borderRadius: 16,
          padding: 16,
          marginBottom: 20,
          borderWidth: 1.5,
          borderColor: "#DCE6E1",
          shadowColor: "#000",
          shadowOpacity: 0.03,
          shadowRadius: 6,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: "#E8F2FB",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 8,
              }}
            >
              <Baby size={18} color="#2563EB" weight="bold" />
            </View>
            <Text size={15} weight="bold" color={TEXT_DARK}>
              Child details
            </Text>
          </View>
          
        </View>

        {/* Child Full Name */}
        <InlineField
          label="Child's Full Name *"
          value={fullName}
          onChangeText={setFullName}
          placeholder="e.g. Liya Hana"
        />

        {/* Date of Birth & Age */}
        <View style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text size={13} weight="semibold" color={TEXT_MUTED}>
              Date of Birth (YYYY-MM-DD) *
            </Text>
            {calculatedAge ? (
              <View
                style={{
                  backgroundColor: BRAND_LIGHT,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                <Text size={12} weight="bold" color={BRAND}>
                  {calculatedAge}
                </Text>
              </View>
            ) : null}
          </View>
          <TextInput
            accessibilityLabel="Child date of birth"
            value={dob}
            onChangeText={setDob}
            placeholder="2023-04-15"
            placeholderTextColor={TEXT_MUTED}
            style={{ fontFamily: fonts.medium, minHeight: 44,
              backgroundColor: SURFACE,
              borderWidth: 1.5,
              borderColor: "#DCE6E1",
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 15,
              color: TEXT_DARK,
            }}
          />

        </View>

        {/* Gender Selection */}
        <Text
          size={13}
          weight="semibold"
          color={TEXT_MUTED}
          style={{ marginBottom: 8 }}
        >
          Gender *
        </Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          {[
            { val: "female", label: "Female" },
            { val: "male", label: "Male" },
            { val: "other", label: "Other" },
          ].map((g) => {
            const active = gender?.toLowerCase() === g.val;
            return (
              <Pressable accessibilityRole="button"
                key={g.val}
                accessibilityState={{selected: active}}
                aria-pressed={active}
                onPress={() => setGender(g.val)}
                style={{ minHeight: 44,
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: active ? 2 : 1.5,
                  borderColor: active ? BRAND : "#DCE6E1",
                  backgroundColor: active ? BRAND_LIGHT : SURFACE,
                  alignItems: "center",
                }}
              >
                <Text
                  size={13}
                  weight={active ? "bold" : "medium"}
                  color={active ? BRAND : TEXT_DARK}
                >
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Classroom Group Picker */}
        <View style={{ marginBottom: 6 }}>
          <Text
            size={13}
            weight="semibold"
            color={TEXT_MUTED}
            style={{ marginBottom: 8 }}
          >
            Classroom assignment (managed by daycare)
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 8,
            }}
          >
            {groups.filter((grp:GroupRecord)=>grp.id===groupId).map((grp: GroupRecord) => {
              const active = groupId === grp.id;
              return (
                <View
                  key={grp.id}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: active ? 2 : 1.5,
                    borderColor: active ? BRAND : "#DCE6E1",
                    backgroundColor: active ? BRAND_LIGHT : SURFACE,
                  }}
                >
                  <Text
                    size={13}
                    weight={active ? "bold" : "medium"}
                    color={active ? BRAND : TEXT_DARK}
                  >
                    {grp.name}
                  </Text>
                  {grp.description ? (
                    <Text size={10} color={active ? BRAND : TEXT_MUTED} style={{ marginTop: 2 }}>
                      {grp.description}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Text size={12} color={TEXT_MUTED}>Contact the office to request a classroom change.</Text>
        </View>
      </View>

      {/* ─── GUARDIAN RELATIONSHIP & PICKUP AUTHORIZATION SECTION ─── */}
      <View
        style={{
          backgroundColor: SURFACE,
          borderRadius: 16,
          padding: 16,
          marginBottom: 20,
          borderWidth: 1.5,
          borderColor: "#DCE6E1",
          shadowColor: "#000",
          shadowOpacity: 0.03,
          shadowRadius: 6,
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: "#F3E8FF",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 8,
              }}
            >
              <Users size={18} color="#7C3AED" weight="bold" />
            </View>
            <Text size={15} weight="bold" color={TEXT_DARK}>
              Relationship and pickup
            </Text>
          </View>
          
        </View>

        {/* Relationship to Child */}
        <Text
          size={13}
          weight="semibold"
          color={TEXT_MUTED}
          style={{ marginBottom: 8 }}
        >
          Your Relationship to Child *
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {["Mother", "Father", "Legal Guardian", "Grandparent", "Aunt / Uncle", "Foster Parent"].map((rel) => {
            const active = relationship === rel;
            return (
              <Pressable accessibilityRole="button"
                key={rel}
                accessibilityState={{selected: active}}
                aria-pressed={active}
                onPress={() => setRelationship(rel)}
                style={{ minHeight: 44,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 12,
                  borderWidth: active ? 2 : 1.5,
                  borderColor: active ? BRAND : "#DCE6E1",
                  backgroundColor: active ? BRAND_LIGHT : SURFACE,
                }}
              >
                <Text
                  size={13}
                  weight={active ? "bold" : "medium"}
                  color={active ? BRAND : TEXT_DARK}
                >
                  {rel}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Pickup Authorization Card */}
        <Pressable
          disabled
          accessibilityLabel="Pickup approval is managed by daycare administration"
          style={{ minHeight: 44,
            backgroundColor: pickupAuthorized ? "#F0FDF4" : "#FFFBEB",
            borderRadius: 12,
            padding: 14,
            borderWidth: 1.5,
            borderColor: pickupAuthorized ? "#86EFAC" : "#FDE68A",
            flexDirection: "row",
            alignItems: "flex-start",
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: pickupAuthorized ? "#16A34A" : "#D97706",
              backgroundColor: pickupAuthorized ? "#16A34A" : "transparent",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 2,
              marginRight: 10,
            }}
          >
            {pickupAuthorized ? <Check size={14} color="#FFFFFF" weight="bold" /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text size={13} weight="bold" color={pickupAuthorized ? "#166534" : "#92400E"}>
                Authorized for Daycare Pickup
              </Text>
              <Text size={11} weight="bold" color={pickupAuthorized ? "#16A34A" : "#D97706"}>
                {pickupAuthorized ? "AUTHORIZED" : "NOT AUTHORIZED"}
              </Text>
            </View>
            <Text size={12} color={pickupAuthorized ? "#15803D" : "#B45309"} style={{ marginTop: 4, lineHeight: 17 }}>
              This is the daycare's recorded approval status. Contact administration to request a change; this care form cannot grant pickup permission.
            </Text>
          </View>
        </Pressable>
      </View>

      {/* ─── LIVE SUMMARY PREVIEW CARD ─── */}
      <View
        style={{
          backgroundColor: "#F7FAF8",
          borderRadius: 14,
          padding: 14,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: "#D2E0D8",
        }}
      >
        <Text size={12} weight="bold" color={BRAND} style={{ marginBottom: 6 }}>
          Profile summary
        </Text>
        <Text size={13} weight="semibold" color={TEXT_DARK}>
          {fullName ? fullName : "Child (Pending Name)"}
          {calculatedAge ? ` • ${calculatedAge}` : ""}
          {gender ? ` • ${gender.charAt(0).toUpperCase() + gender.slice(1)}` : ""}
        </Text>
        <Text size={12} color={TEXT_MUTED} style={{ marginTop: 2 }}>
          Classroom: <Text weight="semibold" color={TEXT_DARK}>{selectedGroup?.name || "None Selected"}</Text> •
          Guardian: <Text weight="semibold" color={TEXT_DARK}>{parentName || user?.name || "Parent"} ({relationship})</Text> •
          Pickup: <Text weight="semibold" color={pickupAuthorized ? "#16A34A" : "#D97706"}>{pickupAuthorized ? "Authorized" : "Pending"}</Text>
        </Text>
      </View>
    </View>
  );
}

// ─── STEP 2: Food & Allergies ─────────────────────────────────────────────────
const COMMON_ALLERGENS = [
  { label: "Peanuts (Groundnuts)", category: "Nuts & Legumes" },
  { label: "Tree Nuts (Almonds, Cashews, Walnuts)", category: "Nuts & Legumes" },
  { label: "Cow's Milk & Dairy (Lactose)", category: "Dairy & Eggs" },
  { label: "Eggs & Egg Products", category: "Dairy & Eggs" },
  { label: "Wheat & Gluten", category: "Grains & Cereals" },
  { label: "Soy & Soybeans", category: "Nuts & Legumes" },
  { label: "Fish (Tilapia, Tuna, Salmon)", category: "Seafood" },
  { label: "Shellfish (Shrimp, Crab, Prawns)", category: "Seafood" },
  { label: "Sesame & Tahini", category: "Seeds & Grains" },
  { label: "Fava Beans (Bakela / G6PD)", category: "Legumes" },
  { label: "Honey", category: "Sweeteners" },
  { label: "Strawberries & Berries", category: "Fruits & Veggies" },
  { label: "Citrus (Oranges, Lemons)", category: "Fruits & Veggies" },
  { label: "Corn / Maize", category: "Grains & Cereals" },
  { label: "Chocolate / Cocoa", category: "Sweeteners" },
  { label: "Tomatoes", category: "Fruits & Veggies" },
];

function StepAllergies({
  allergies,
  setAllergies,
  dietNotes,
  setDietNotes,
}: any) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [customInput, setCustomInput] = useState("");

  const isSelected = (text: string) => {
    return allergies.some((a: AllergyEntry) => a.text.toLowerCase() === text.toLowerCase());
  };

  const toggleAllergen = (label: string) => {
    if (isSelected(label)) {
      setAllergies((prev: AllergyEntry[]) =>
        prev.filter((a) => a.text.toLowerCase() !== label.toLowerCase())
      );
    } else {
      setAllergies((prev: AllergyEntry[]) => [
        ...prev,
        { id: uid(), text: label },
      ]);
    }
  };

  const addCustomAllergy = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!isSelected(trimmed)) {
      setAllergies((prev: AllergyEntry[]) => [
        ...prev,
        { id: uid(), text: trimmed },
      ]);
    }
    setCustomInput("");
  };

  const setNoAllergies = () => {
    setAllergies([]);
    setDropdownOpen(false);
  };

  const filteredAllergens = COMMON_ALLERGENS.filter((item) =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View>
      <StepHeader stepIndex={1} />
      <Text
        size={14}
        color={TEXT_MUTED}
        style={{ textAlign: "center", marginBottom: 20, lineHeight: 22 }}
      >
        Select your child’s food allergies from the dropdown list or add custom items.
        These notes are shared with your daycare team. Contact the team directly about meal safety or changes to your child’s allergies.
      </Text>

      {/* ─── ALLERGEN DROPDOWN SELECTOR ─── */}
      <View style={{ marginBottom: 16 }}>
        <Text
          size={13}
          weight="semibold"
          color={TEXT_MUTED}
          style={{ marginBottom: 6 }}
        >
          Select Food Allergens (Dropdown List)
        </Text>

        {/* Dropdown Header Trigger */}
        <Pressable accessibilityRole="button"
          onPress={() => setDropdownOpen(!dropdownOpen)}
          style={{ minHeight: 44,
            backgroundColor: SURFACE,
            borderWidth: 1.5,
            borderColor: dropdownOpen ? BRAND : "#DCE6E1",
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            shadowColor: "#000",
            shadowOpacity: dropdownOpen ? 0.05 : 0.02,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: BRAND_LIGHT,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <Warning size={16} color={BRAND} weight="bold" />
            </View>
            <Text
              size={14}
              color={allergies.length > 0 ? TEXT_DARK : "#A0AEA6"}
              weight={allergies.length > 0 ? "semibold" : "regular"}
            >
              {allergies.length > 0
                ? `${allergies.length} food allergen${allergies.length !== 1 ? "s" : ""} selected — Tap to edit`
                : "Choose a food from allergen list…"}
            </Text>
          </View>
          {dropdownOpen ? (
            <CaretUp size={18} color={BRAND} weight="bold" />
          ) : (
            <CaretDown size={18} color={TEXT_MUTED} weight="bold" />
          )}
        </Pressable>

        {/* Dropdown Menu Container */}
        {dropdownOpen && (
          <View
            style={{
              backgroundColor: SURFACE,
              borderWidth: 1.5,
              borderColor: BRAND,
              borderRadius: 14,
              marginTop: 6,
              padding: 12,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 10,
              elevation: 4,
            }}
          >
            {/* Quick search filter inside dropdown */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#F3F7F5",
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                marginBottom: 10,
              }}
            >
              <MagnifyingGlass size={16} color={TEXT_MUTED} />
              <TextInput
                accessibilityLabel="Search allergy foods"
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search food (e.g. Milk, Peanut, Egg, Wheat)…"
                placeholderTextColor={TEXT_MUTED}
                style={{ fontFamily: fonts.medium, minHeight: 44,
                  flex: 1,
                  marginLeft: 8,
              fontSize: 16,
                  color: TEXT_DARK,
                  padding: 0,
                }}
              />
              {searchQuery ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear allergy search" onPress={() => setSearchQuery("")} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}>
                  <X size={15} color={TEXT_MUTED} />
                </Pressable>
              ) : null}
            </View>

            {/* List of allergen options */}
            <ScrollView
              style={{ maxHeight: 220 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}
            >
              {filteredAllergens.map((item) => {
                const checked = isSelected(item.label);
                return (
                  <Pressable accessibilityRole="button"
                    key={item.label}
                    onPress={() => toggleAllergen(item.label)}
                    style={{ minHeight: 44,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingVertical: 9,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: checked ? BRAND_LIGHT : "transparent",
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: checked ? "#D8EBE2" : "#F3F7F5", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                        <ForkKnife size={13} color={checked ? BRAND : TEXT_MUTED} />
                      </View>
                      <View>
                        <Text
                          size={13}
                          weight={checked ? "bold" : "medium"}
                          color={checked ? BRAND : TEXT_DARK}
                        >
                          {item.label}
                        </Text>
                        <Text size={10} color={TEXT_MUTED}>
                          {item.category}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: checked ? BRAND : "#CBD5E1",
                        backgroundColor: checked ? BRAND : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {checked ? <Check size={12} color="#FFFFFF" weight="bold" /> : null}
                    </View>
                  </Pressable>
                );
              })}

              {filteredAllergens.length === 0 && (
                <View style={{ paddingVertical: 12, alignItems: "center" }}>
                  <Text size={13} color={TEXT_MUTED}>
                    No matching food found in standard list.
                  </Text>
                  {searchQuery.trim() ? (
                    <Button
                      title={`+ Add "${searchQuery.trim()}"`}
                      variant="secondary"
                      onPress={() => {
                        toggleAllergen(searchQuery.trim());
                        setSearchQuery("");
                      }}
                      style={{ marginTop: 8, minHeight: 36, paddingHorizontal: 14 }}
                    />
                  ) : null}
                </View>
              )}
            </ScrollView>

            {/* Quick Actions Footer inside Dropdown */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                borderTopWidth: 1,
                borderTopColor: "#EEF3F0",
                paddingTop: 10,
                marginTop: 6,
              }}
            >
              <Pressable accessibilityRole="button" onPress={setNoAllergies}>
                <Text size={12} color={BRAND} weight="semibold">
                  Clear All / None
                </Text>
              </Pressable>
              <Button
                title="Done Selecting"
                variant="primary"
                onPress={() => setDropdownOpen(false)}
                style={{ minHeight: 34, paddingHorizontal: 14 }}
              />
            </View>
          </View>
        )}
      </View>

      {/* ─── CURRENTLY SELECTED ALLERGEN CHIPS ─── */}
      <View style={{ marginBottom: 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text size={13} weight="semibold" color={TEXT_MUTED}>
            Active Allergens for Your Child ({allergies.length})
          </Text>
          {allergies.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => setAllergies([])}>
              <Text size={11} color={DANGER} weight="semibold">
                Remove All
              </Text>
            </Pressable>
          ) : null}
        </View>

        {allergies.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {allergies.map((a: AllergyEntry) => (
              <Chip
                key={a.id}
                label={a.text}
                onRemove={() =>
                  setAllergies((p: AllergyEntry[]) => p.filter((x) => x.id !== a.id))
                }
              />
            ))}
          </View>
        ) : (
          <View
            style={{
              backgroundColor: "#F8FAF9",
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: "#E2ECE6",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text size={12} color={TEXT_MUTED}>
              No food allergies currently selected.
            </Text>
            <Pressable accessibilityRole="button"
              onPress={() =>
                setAllergies([{ id: uid(), text: "No Known Allergies" }])
              }
              style={{ minHeight: 44,
                backgroundColor: BRAND_LIGHT,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
              }}
            >
              <Text size={11} color={BRAND} weight="bold">
                ✓ Mark "No Known Allergies"
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ─── CUSTOM FOOD ALLERGEN INPUT ─── */}
      <View style={{ marginBottom: 20 }}>
        <Text
          size={12}
          weight="semibold"
          color={TEXT_MUTED}
          style={{ marginBottom: 6 }}
        >
          Or Add Any Other Specific Food:
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput
            accessibilityLabel="Other allergy food"
            value={customInput}
            onChangeText={setCustomInput}
            placeholder="Type other food (e.g. Mango, Mustard, Food Dye)…"
            placeholderTextColor={TEXT_MUTED}
            onSubmitEditing={addCustomAllergy}
            returnKeyType="done"
            style={{ fontFamily: fonts.medium, minHeight: 44,
              flex: 1,
              backgroundColor: SURFACE,
              borderWidth: 1.5,
              borderColor: "#DCE6E1",
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              fontSize: 14,
              color: TEXT_DARK,
            }}
          />
          <Button
            title="Add Food"
            variant="secondary"
            onPress={addCustomAllergy}
            style={{ minHeight: 44, paddingHorizontal: 16 }}
          />
        </View>
      </View>

      {/* ─── DIETARY PREFERENCES & NOTES ─── */}
      <InlineField
        label="Dietary Preferences & Meal Instructions"
        value={dietNotes}
        onChangeText={setDietNotes}
        placeholder="e.g. Vegetarian, Halal, Kosher, avoid artificial food coloring, cut grapes in half…"
        multiline
      />
    </View>
  );
}

// ─── STEP 3: Medical & Medications ────────────────────────────────────────────
function StepMedical({
  medications,
  setMedications,
  conditions,
  setConditions,
}: any) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [schedule, setSchedule] = useState("");

  const addMed = () => {
    if (!name.trim()) return;
    setMedications((prev: MedEntry[]) => [
      ...prev,
      {
        id: uid(),
        name: name.trim(),
        dosage: dosage.trim(),
        schedule: schedule.trim(),
      },
    ]);
    setName("");
    setDosage("");
    setSchedule("");
  };

  return (
    <View>
      <StepHeader stepIndex={2} />
      <Text
        size={14}
        color={TEXT_MUTED}
        style={{ textAlign: "center", marginBottom: 24, lineHeight: 22 }}
      >
        Provide any prescription medicines to be administered, alongside chronic
        conditions or medical alerts.
      </Text>

      <Text
        size={13}
        weight="semibold"
        color={TEXT_MUTED}
        style={{ marginBottom: 8 }}
      >
        Prescription Medications
      </Text>
      {medications.map((m: MedEntry) => (
        <View
          key={m.id}
          style={{
            backgroundColor: SURFACE,
            borderRadius: 14,
            padding: 14,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: "#E2ECE6",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text size={15} weight="semibold" color={TEXT_DARK}>
              {m.name}
            </Text>
            {m.dosage ? (
              <Text size={12} color={TEXT_MUTED}>
                Dosage: {m.dosage}
              </Text>
            ) : null}
            {m.schedule ? (
              <Text size={12} color={TEXT_MUTED}>
                When: {m.schedule}
              </Text>
            ) : null}
          </View>
          <Pressable accessibilityRole="button"
            accessibilityLabel={`Remove medication ${m.name}`}
            style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}
            onPress={() =>
              setMedications((p: MedEntry[]) => p.filter((x) => x.id !== m.id))
            }
          >
            <Trash size={16} color={DANGER} />
          </Pressable>
        </View>
      ))}

      <View
        style={{
          backgroundColor: SURFACE,
          borderRadius: 16,
          padding: 16,
          borderWidth: 1.5,
          borderColor: "#DCE6E1",
          marginBottom: 20,
        }}
      >
        <Text
          size={14}
          weight="semibold"
          color={TEXT_DARK}
          style={{ marginBottom: 12 }}
        >
          Add Medication
        </Text>
        <InlineField
          label="Medication Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Amoxicillin, Ventolin"
        />
        <InlineField
          label="Dosage"
          value={dosage}
          onChangeText={setDosage}
          placeholder="e.g. 5ml, 1 puff"
        />
        <InlineField
          label="Schedule / Timing"
          value={schedule}
          onChangeText={setSchedule}
          placeholder="e.g. 12:30 PM after lunch"
        />
        <Button
          title="Add Medication"
          variant="secondary"
          onPress={addMed}
          style={{ marginTop: 6 }}
        />
      </View>

      <InlineField
        label="Medical Conditions & Health Notes"
        value={conditions}
        onChangeText={setConditions}
        placeholder="e.g. Mild asthma (keep inhaler in bag), prone to ear infections…"
        multiline
      />
    </View>
  );
}

// ─── STEP 4: Emergency Contacts ───────────────────────────────────────────────
function StepEmergency({ contacts, setContacts }: any) {
  const addContact = () => {
    if (contacts.length >= 3) return;
    setContacts((prev: ContactEntry[]) => [
      ...prev,
      { id: uid(), name: "", relationship: "", phone: "" },
    ]);
  };

  const removeContact = (id: string) => {
    setContacts((prev: ContactEntry[]) => prev.filter((c) => c.id !== id));
  };

  const updateContact = (id: string, key: keyof ContactEntry, val: string) => {
    setContacts((prev: ContactEntry[]) =>
      prev.map((c) => (c.id === id ? { ...c, [key]: val } : c))
    );
  };

  return (
    <View>
      <StepHeader stepIndex={3} />
      <Text
        size={14}
        color={TEXT_MUTED}
        style={{ textAlign: "center", marginBottom: 24, lineHeight: 22 }}
      >
        Provide emergency contact details for your daycare team. Add another trusted adult who can be reached when you are unavailable.
      </Text>

      {contacts.map((c: ContactEntry, idx: number) => (
        <View
          key={c.id}
          style={{
            backgroundColor: SURFACE,
            borderRadius: 16,
            padding: 16,
            marginBottom: 16,
            borderWidth: 1.5,
            borderColor: "#DCE6E1",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text size={14} weight="bold" color={TEXT_DARK}>
              Contact #{idx + 1}
            </Text>
            {contacts.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove emergency contact ${c.name || idx + 1}`} onPress={() => removeContact(c.id)} style={{width:44,height:44,alignItems:'center',justifyContent:'center'}}>
                <Trash size={16} color={DANGER} />
              </Pressable>
            ) : null}
          </View>
          <InlineField
            label="Full Name *"
            value={c.name}
            onChangeText={(v: string) => updateContact(c.id, "name", v)}
            placeholder="e.g. Kebede Alemu"
          />
          <InlineField
            label="Relationship *"
            value={c.relationship}
            onChangeText={(v: string) => updateContact(c.id, "relationship", v)}
            placeholder="e.g. Father, Aunt, Neighbor"
          />
          <InlineField
            label="Phone Number *"
            value={c.phone}
            onChangeText={(v: string) => updateContact(c.id, "phone", v)}
            placeholder="+251 91 123 4567"
            keyboardType="phone-pad"
          />
        </View>
      ))}

      {contacts.length < 3 ? (
        <Button
          title="Add Another Contact"
          variant="secondary"
          icon={Plus}
          onPress={addContact}
          style={{ marginBottom: 16 }}
        />
      ) : null}
    </View>
  );
}

// ─── STEP 5: Care Notes ───────────────────────────────────────────────────────
function StepCareNotes({
  napRoutine,
  setNapRoutine,
  comfortItems,
  setComfortItems,
  specialNeeds,
  setSpecialNeeds,
  extraNotes,
  setExtraNotes,
}: any) {
  return (
    <View>
      <StepHeader stepIndex={4} />
      <Text
        size={14}
        color={TEXT_MUTED}
        style={{ textAlign: "center", marginBottom: 24, lineHeight: 22 }}
      >
        Share details about your child’s daily routine, favorite comfort items,
        and habits to help caregivers keep them happy and calm.
      </Text>

      <InlineField
        label="Nap & Sleep Routine"
        value={napRoutine}
        onChangeText={setNapRoutine}
        placeholder="e.g. Usually naps at 1:00 PM for 1.5 hours with soft music…"
        multiline
      />

      <InlineField
        label="Comfort Items & Soothing"
        value={comfortItems}
        onChangeText={setComfortItems}
        placeholder="e.g. Blue blanket in backpack, likes back patting…"
        multiline
      />

      <InlineField
        label="Special Needs or Calming Strategies"
        value={specialNeeds}
        onChangeText={setSpecialNeeds}
        placeholder="e.g. Sensitive to loud noises, prefers quiet corners when overwhelmed…"
        multiline
      />

      <InlineField
        label="Any Other Notes for Caregivers"
        value={extraNotes}
        onChangeText={setExtraNotes}
        placeholder="Anything else you’d like your child’s caregivers to know…"
        multiline
      />
    </View>
  );
}

// ─── MAIN WIZARD SCREEN ───────────────────────────────────────────────────────
export function ChildProfileWizardScreen({ navigation, route }: any) {
  const { user, refreshUser, logout } = useAuth();
  const {selectedChild}=useChild();
  const requestedChildId = route?.params?.childId || selectedChild?.id;
  const [version,setVersion]=useState("");
  const isEditing = Boolean(route?.params?.childId);
  const originalInstructions = useRef<CareInstructionInput[]>([]);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  // Parent data state
  const [parentName, setParentName] = useState(user?.name || "");

  // Child data states (Step 1 fulfillment)
  const [childId, setChildId] = useState<number | null>(null);
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [relationship, setRelationship] = useState("Mother");
  const [pickupAuthorized, setPickupAuthorized] = useState(false);

  // Step 2 — Allergies
  const [allergies, setAllergies] = useState<AllergyEntry[]>([]);
  const [dietNotes, setDietNotes] = useState("");

  // Step 3 — Medical
  const [medications, setMedications] = useState<MedEntry[]>([]);
  const [conditions, setConditions] = useState("");

  // Step 4 — Emergency Contacts
  const [contacts, setContacts] = useState<ContactEntry[]>([
    { id: uid(), name: "", relationship: "", phone: "" },
  ]);

  // Step 5 — Care Notes
  const [napRoutine, setNapRoutine] = useState("");
  const [comfortItems, setComfortItems] = useState("");
  const [specialNeeds, setSpecialNeeds] = useState("");
  const [extraNotes, setExtraNotes] = useState("");

  useEffect(() => {
    if (user?.name && !parentName) {
      setParentName(user.name);
    }
  }, [user]);

  // Load linked child and groups on mount
  useEffect(() => {
    let active = true;
    setVersion('');
    setError('');
    setAllergies([]); setDietNotes(''); setMedications([]); setConditions('');
    setNapRoutine(''); setComfortItems(''); setSpecialNeeds(''); setExtraNotes('');
    originalInstructions.current = [];
    (async () => {
      try {
        const [children, groupsList] = await Promise.all([getMyChildren(),getGroups()]);
        if (!active) return;
        if (!children.length) throw new Error('No linked child.');

        if (groupsList.length > 0) {
          setGroups(groupsList);
        }

        if (children.length > 0) {
          const summary=requestedChildId ? children.find(c=>c.id===requestedChildId) : children[0];
          if (!summary) throw new Error('The selected child is unavailable.');
          const {data:snapshot}=await apiClient.get(`/parent/children/${summary.id}/care-profile`);
          if (!active) return;
          setVersion(snapshot.version);
          const c=snapshot.child;
          originalInstructions.current = c.care_instructions.map((row: any) => ({category: row.category, instruction_text: row.instruction_text}));
          setAllergies(c.care_instructions.filter((r:any)=>r.category==='allergy').map((r:any)=>({id:uid(),text:r.instruction_text})));
          setDietNotes(c.care_instructions.filter((r:any)=>r.category==='dietary').map((r:any)=>r.instruction_text).join('\n'));
          setConditions(c.care_instructions.filter((r:any)=>r.category==='medical_note').map((r:any)=>r.instruction_text.replace(/^Conditions:\s*/, '')).join('\n'));
          setExtraNotes(c.care_instructions.filter((r:any)=>r.category==='general').map((r:any)=>r.instruction_text).join('\n'));
          setContacts(c.emergency_contacts.length?c.emergency_contacts.map((r:any)=>({...r,id:uid()})):[{id:uid(),name:'',relationship:'',phone:''}]);
          setChildId(c.id);
          setFullName(c.full_name && !c.full_name.includes("'s Child") && c.full_name !== "My Child" ? c.full_name : "");
          if (c.dob) setDob(c.dob.slice(0, 10));
          if (c.gender) setGender(c.gender.toLowerCase());
          if (c.group_id) setGroupId(c.group_id);
          else setGroupId(null);
          if (c.relationship) setRelationship(c.relationship);
          if (c.pickup_authorized !== undefined) setPickupAuthorized(Boolean(c.pickup_authorized));
        }
      } catch (e: any) {
        if (active) setError("Could not load child profile. Please check your connection.");
      }
    })();
    return () => { active = false; };
  }, [requestedChildId]);

  const scrollTop = () =>
    scrollRef.current?.scrollTo({ y: 0, animated: true });

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!fullName.trim()) return "Please enter your child's full name.";
      if (!dob.trim() || dob.trim().length < 8)
        return "Please enter a valid date of birth (e.g. 2022-05-12).";
      if (!gender) return "Please select your child’s gender.";
      if (!relationship.trim())
        return "Please select your relationship to the child.";
    }
    if (step === 4) {
      const valid = contacts.filter((c) => c.name.trim() && c.phone.trim());
      if (valid.length === 0)
        return "Please add at least one valid emergency contact with name and phone.";
      for (const c of contacts) {
        if ((c.name.trim() || c.phone.trim()) && c.phone.trim().length < 7) {
          return "Each contact needs a valid phone number (at least 7 digits).";
        }
      }
    }
    return null;
  };

  const handleNext = async () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError("");

    setStep((s) => s + 1);
    scrollTop();
  };

  const handleBack = () => {
    setError("");
    setStep((s) => s - 1);
    scrollTop();
  };

  const handleFinish = async () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    if (!childId) {
      setError("No child linked to your account. Please contact your daycare.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // 2. Build care instructions array
      const careInstructions: CareInstructionInput[] = [];

      allergies.forEach((a) =>
        careInstructions.push({ category: "allergy", instruction_text: a.text })
      );
      if (dietNotes.trim())
        careInstructions.push({
          category: "diet",
          instruction_text: dietNotes.trim(),
        });
      medications.forEach((m) => {
        const text = [
          m.name,
          m.dosage ? `Dosage: ${m.dosage}` : "",
          m.schedule ? `When: ${m.schedule}` : "",
        ]
          .filter(Boolean)
          .join(" | ");
        careInstructions.push({
          category: "medication",
          instruction_text: text,
        });
      });
      if (conditions.trim())
        careInstructions.push({
          category: "medication",
          instruction_text: `Conditions: ${conditions.trim()}`,
        });
      if (napRoutine.trim())
        careInstructions.push({
          category: "routine",
          instruction_text: `Nap: ${napRoutine.trim()}`,
        });
      if (comfortItems.trim())
        careInstructions.push({
          category: "note",
          instruction_text: `Comfort: ${comfortItems.trim()}`,
        });
      if (specialNeeds.trim())
        careInstructions.push({
          category: "note",
          instruction_text: `Special needs: ${specialNeeds.trim()}`,
        });
      if (extraNotes.trim())
        careInstructions.push({
          category: "note",
          instruction_text: extraNotes.trim(),
        });

      if(!version) throw new Error('Reload the profile before saving.');
      const editedInstructions = replaceCareSection(step, originalInstructions.current, careInstructions);
      const payload = isEditing ? {
        version,
        ...(step === 1 ? {profile:{full_name:fullName.trim(),dob:dob.trim(),gender:gender||'female',relationship:relationship.trim()},parent_name:parentName.trim()||undefined} : {}),
        ...([2,3,5].includes(step) ? {care_instructions: editedInstructions} : {}),
        ...(step === 4 ? {emergency_contacts:contacts.filter(c=>c.name.trim()&&c.phone.trim()).map(c=>({name:c.name.trim(),relationship:c.relationship.trim(),phone:c.phone.trim()}))} : {}),
      } : {
        version,profile:{full_name:fullName.trim(),dob:dob.trim(),gender:gender||'female',relationship:relationship.trim()},
        parent_name:parentName.trim()||undefined,
        care_instructions:careInstructions,
        emergency_contacts:contacts.filter(c=>c.name.trim()&&c.phone.trim()).map(c=>({name:c.name.trim(),relationship:c.relationship.trim(),phone:c.phone.trim()})),
        complete_profile:true,
      };
      const result=await apiClient.patch(`/parent/children/${childId}/care-profile`, payload);
      setVersion(result.data.version);

      // 5. Refresh user in context
      await refreshUser();

      // 6. Navigate to MainTabs
      if (isEditing) navigation.goBack();
      else navigation.replace("MainTabs");
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ||
        e?.message ||
        "Failed to save profile. Please try again.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <StepChildInfo
            user={user}
            parentName={parentName}
            setParentName={setParentName}
            fullName={fullName}
            setFullName={setFullName}
            dob={dob}
            setDob={setDob}
            gender={gender}
            setGender={setGender}
            groupId={groupId}
            setGroupId={setGroupId}
            groups={groups}
            relationship={relationship}
            setRelationship={setRelationship}
            pickupAuthorized={pickupAuthorized}
            setPickupAuthorized={setPickupAuthorized}
          />
        );
      case 2:
        return (
          <StepAllergies
            allergies={allergies}
            setAllergies={setAllergies}
            dietNotes={dietNotes}
            setDietNotes={setDietNotes}
          />
        );
      case 3:
        return (
          <StepMedical
            medications={medications}
            setMedications={setMedications}
            conditions={conditions}
            setConditions={setConditions}
          />
        );
      case 4:
        return (
          <StepEmergency contacts={contacts} setContacts={setContacts} />
        );
      case 5:
        return (
          <StepCareNotes
            napRoutine={napRoutine}
            setNapRoutine={setNapRoutine}
            comfortItems={comfortItems}
            setComfortItems={setComfortItems}
            specialNeeds={specialNeeds}
            setSpecialNeeds={setSpecialNeeds}
            extraNotes={extraNotes}
            setExtraNotes={setExtraNotes}
          />
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: BG }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: SURFACE,
          paddingTop: Platform.OS === 'ios' ? 54 : 20,
          paddingBottom: 16,
          paddingHorizontal: 24,
          borderBottomWidth: 1,
          borderBottomColor: "#E8EDEA",
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <BrandMark size={26} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go to Home Dashboard"
              onPress={() => navigation.navigate("MainTabs")}
              style={{ minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#EBF3FF",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
              }}
            >
              <House size={13} color={BRAND} weight="bold" style={{ marginRight: 4 }} />
              <Text size={11} weight="bold" color={BRAND}>
                Home
              </Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isEditing ? <Button title="Cancel" variant="outline" onPress={() => navigation.goBack()} style={{ minHeight: 44, paddingVertical: 8, paddingHorizontal: 14 }} /> : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              onPress={async () => {
                await logout();
              }}
              style={{ minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#FFF5F5",
                borderWidth: 1,
                borderColor: "#FED7D7",
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 8,
              }}
            >
              <SignOut size={13} color={DANGER} weight="bold" style={{ marginRight: 3 }} />
              <Text size={11} weight="bold" color={DANGER}>
                Sign out
              </Text>
            </Pressable>)}

          </View>
        </View>
        <StepIndicator step={step} total={STEPS.length} editing={isEditing} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={{ marginBottom: 16 }}>
            <Notice tone="error">{error}</Notice>
          </View>
        ) : null}
        {isEditing && !!version && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {STEPS.map(section => <Button key={section.id} title={section.label} selected={step === section.id} variant={step === section.id ? 'primary' : 'outline'} onPress={() => { setStep(section.id); setError(''); scrollTop(); }} style={{ minHeight: 44, paddingVertical: 8, paddingHorizontal: 14 }} />)}
        </View>}
        {version ? renderStep() : error ? <Text>Reopen this page to load the saved profile before editing.</Text> : <ActivityIndicator accessibilityLabel="Loading saved profile" color={BRAND} />}
      </ScrollView>

      {/* Bottom Navigation */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: SURFACE,
          paddingHorizontal: 24,
          paddingTop: 14,
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          borderTopWidth: 1,
          borderTopColor: "#E8EDEA",
          flexDirection: "row",
          gap: 12,
        }}
      >
        {isEditing && <Button title="Save this section" loading={saving} disabled={!version} onPress={handleFinish} style={{ flex: 1 }} />}
        {!isEditing && step > 1 && (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go to previous step"
            style={{ minHeight: 44,
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: "#DCE6E1",
              gap: 8,
            }}
          >
            <ArrowLeft size={18} color={TEXT_DARK} />
            <Text size={15} weight="semibold" color={TEXT_DARK}>
              Back
            </Text>
          </Pressable>
        )}
        {!isEditing && (step < STEPS.length ? (
          <Pressable
            onPress={handleNext}
            disabled={!version || saving}
            accessibilityRole="button"
            accessibilityLabel="Go to next step"
            style={{ minHeight: 44,
              flex: 2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 14,
              backgroundColor: BRAND,
              gap: 8,
            }}
          >
            <Text size={15} weight="semibold" color="#fff">
              Continue
            </Text>
            <ArrowRight size={18} color="#fff" weight="bold" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleFinish}
            disabled={saving || !version}
            accessibilityRole="button"
            accessibilityLabel="Submit profile and continue"
            style={{ minHeight: 44,
              flex: 2,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              borderRadius: 14,
              backgroundColor: saving ? "#7AAB92" : BRAND,
              gap: 8,
            }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <CheckCircle size={20} color="#fff" weight="fill" />
                <Text size={15} weight="semibold" color="#fff">
                  {isEditing ? 'Save this section' : 'Complete Profile'}
                </Text>
              </>
            )}
          </Pressable>
        ))}
      </View>
    </KeyboardAvoidingView>
  );
}
