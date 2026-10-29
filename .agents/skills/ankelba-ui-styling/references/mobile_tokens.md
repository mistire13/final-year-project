# Ankelba Warm Nurture — Mobile UI Reference Guide

This reference provides exact tokens, components, and code patterns for developing screens in the Parent & Guardian Mobile App (`frontend/src/screens/`).

---

## 1. Design Tokens Reference (`frontend/src/theme/tokens.ts`)

### Color Palette
```typescript
export const colors = {
  // App Backgrounds
  bgApp: "#FFFBED",        // Warm cream base
  bgSurface: "#FFFFFF",    // White card surface
  bgMuted: "#F6F4EE",      // Soft neutral cream
  bgInput: "#EAE8EB",      // Input field background
  bgNavy: "#061224",       // Primary dark navy CTA buttons
  bgNavyCard: "#081E38",   // Dark contrast card

  // Category Pastel Tints (Timeline & Activity Cards)
  pastelYellow: "#FEF7E6",     pastelYellowText: "#B7791F",  // Meals
  pastelPurple: "#F3EEF9",     pastelPurpleText: "#7E57C2",  // Sleep & Rest
  pastelCyan: "#E6F8F9",       pastelCyanText: "#00838F",    // Learning & Shapes
  pastelGreen: "#EDF7ED",      pastelGreenText: "#2E7D32",   // Play & Physical Activity
  pastelPink: "#FDECEE",       pastelPinkText: "#C2185B",    // Mood & Feelings
  pastelPeach: "#FCEEF2",      pastelPeachText: "#AD1457",   // Observations & Notes

  // Status & Badges
  statusPresentBg: "#E8F8EE",  statusPresentText: "#2E7D32", // Present
  statusAbsentBg: "#FDECEE",   statusAbsentText: "#D32F2F",  // Absent
  statusReadyBg: "#FEF3D6",    statusReadyText: "#B7791F",   // Ready / Pending

  // Text Hierarchy
  textPrimary: "#061224",      // High-contrast primary headings & body
  textSecondary: "#5A6679",    // Secondary descriptions
  textMuted: "#757C88",        // Timestamps and captions
  textWhite: "#FFFFFF",

  // Borders & Accents
  borderLight: "#F0ECE4",
  borderCard: "#ECE7DD",
  borderDark: "#061224",
  accentGold: "#F4B400",
  accentRed: "#E53935",
};
```

### Radii Scale
- `radii.pill`: `9999` (CTA buttons, pill badges, search bars)
- `radii.card`: `24` (Standard cards, modal sheets)
- `radii.subcard`: `16` (Nested list items, timeline cards)
- `radii.input`: `14` (Text inputs, dropdowns)
- `radii.badge`: `8` (Small square badges)

### Typography Scale (`Quicksand` Font Family)
- `h1`: `fontSize: 28`, `fontWeight: "700"` (`Quicksand_700Bold`)
- `h2`: `fontSize: 22`, `fontWeight: "700"` (`Quicksand_700Bold`)
- `h3`: `fontSize: 18`, `fontWeight: "600"` (`Quicksand_600SemiBold`)
- `body`: `fontSize: 15`, `fontWeight: "400"`, `lineHeight: 22` (`Quicksand_400Regular`)
- `bodyBold`: `fontSize: 15`, `fontWeight: "600"` (`Quicksand_600SemiBold`)
- `caption`: `fontSize: 13`, `fontWeight: "500"` (`Quicksand_500Medium`)
- `tag`: `fontSize: 11`, `fontWeight: "700"`, `letterSpacing: 0.5`

---

## 2. Standard Screen Template

```tsx
import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import {
  Page,
  Text,
  Card,
  CardGlow,
  SoftBackground,
  Badge,
  Section,
  Button,
  s,
} from "../../components/design/System";
import { colors, radii } from "../../theme/tokens";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";

export function ExampleScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    // Fetch data...
    setRefreshing(false);
  };

  return (
    <Page refreshing={refreshing} onRefresh={onRefresh}>
      <SoftBackground decorative />

      {/* Screen Section Header */}
      <Section
        title="Today's Highlights"
        subtitle="Recent activities recorded by caregivers"
        actionLabel="View all"
        onAction={() => {}}
      />

      {/* Primary Highlight Card */}
      <Card style={styles.card}>
        <CardGlow color="#FFE39A" />
        <View style={s.rowBetween}>
          <Badge label="Learning" tone="cyan" />
          <Text size={12} color={colors.textMuted}>10:30 AM</Text>
        </View>

        <Text size={18} weight="bold" style={{ marginTop: 12 }}>
          Finger Painting & Shapes
        </Text>
        <Text size={14} color={colors.textSecondary} style={{ marginTop: 4 }}>
          Explored primary colors and painted triangles with great curiosity!
        </Text>

        <View style={{ marginTop: 16 }}>
          <Button label="Acknowledge Activity" onPress={() => {}} />
        </View>
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 20,
    borderRadius: radii.card,
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderCard,
    borderWidth: 1,
  },
});
```
