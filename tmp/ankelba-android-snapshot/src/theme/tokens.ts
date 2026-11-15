export const colors = {
  // App Backgrounds
  bgApp: "#FFFBED", // Shared warm cream from the supplied designs
  bgSurface: "#FFFFFF", // Pure white card surface
  bgMuted: "#F6F4EE", // Soft neutral cream
  bgInput: "#EAE8EB",
  bgNavy: "#061224", // Primary dark navy CTA buttons
  bgNavyCard: "#081E38", // Dark card for caregiver note

  // Category Pastel Tints (Highlights & Timeline)
  pastelYellow: "#FEF7E6", // Meals
  pastelYellowText: "#B7791F",
  pastelPurple: "#F3EEF9", // Sleep & Rest
  pastelPurpleText: "#7E57C2",
  pastelCyan: "#E6F8F9", // Learning & Shapes
  pastelCyanText: "#00838F",
  pastelGreen: "#EDF7ED", // Play & Physical Activity
  pastelGreenText: "#2E7D32",
  pastelPink: "#FDECEE", // Mood & Feelings
  pastelPinkText: "#C2185B",
  pastelPeach: "#FCEEF2", // General Observations
  pastelPeachText: "#AD1457",

  // Status & Badges
  statusPresentBg: "#E8F8EE",
  statusPresentText: "#2E7D32",
  statusAbsentBg: "#FDECEE",
  statusAbsentText: "#D32F2F",
  statusReadyBg: "#FEF3D6",
  statusReadyText: "#B7791F",

  // Text Hierarchy
  textPrimary: "#061224",
  textSecondary: "#5A6679",
  textMuted: "#757C88",
  textWhite: "#FFFFFF",

  // Borders & Accents
  borderLight: "#F0ECE4",
  borderCard: "#ECE7DD",
  borderDark: "#061224",
  accentGold: "#F4B400",
  accentRed: "#E53935",
} as const;

export const radii = {
  pill: 9999,
  card: 24,
  subcard: 16,
  input: 14,
  badge: 8,
} as const;

export const fonts = {
  regular: "Quicksand_400Regular",
  medium: "Quicksand_500Medium",
  semibold: "Quicksand_600SemiBold",
  bold: "Quicksand_700Bold",
} as const;

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  h2: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: colors.textPrimary,
  },
  h3: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    fontWeight: "400" as const,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bodyBold: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: colors.textMuted,
  },
  tag: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
} as const;

export const shadows = {
  card: {
    shadowColor: "#061224",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  float: {
    shadowColor: "#061224",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  modal: {
    shadowColor: "#061224",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 10,
  },
} as const;
