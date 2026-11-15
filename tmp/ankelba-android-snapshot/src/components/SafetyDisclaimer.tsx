import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShieldWarning } from "phosphor-react-native/src/icons/ShieldWarning";
import { Info } from "phosphor-react-native/src/icons/Info";
import { Heartbeat } from "phosphor-react-native/src/icons/Heartbeat";
import { colors, radii } from '../theme/tokens';

export type DisclaimerVariant = 'ai' | 'biometric' | 'medical';

export interface SafetyDisclaimerProps {
  variant?: DisclaimerVariant;
  customText?: string;
}

export const SafetyDisclaimer: React.FC<SafetyDisclaimerProps> = ({
  variant = 'ai',
  customText,
}) => {
  const getDisclaimerConfig = () => {
    switch (variant) {
      case 'biometric':
        return {
          title: 'CHILD SAFETY & PRIVACY GUARANTEE',
          text:
            customText ||
            'Biometric verification is strictly restricted to adult authorized guardians during pickup. Children biometrics are never collected or stored (SRS FR-BIO-07).',
          bgColor: '#FEF7E6',
          borderColor: '#F4B400',
          textColor: '#B7791F',
          IconComponent: ShieldWarning,
        };
      case 'medical':
        return {
          title: 'NON-DIAGNOSTIC NOTICE',
          text:
            customText ||
            'Health and incident reports are operational observations recorded by daycare staff and do not constitute medical diagnoses (SRS FR-HIR-06).',
          bgColor: '#FDECEE',
          borderColor: '#E53935',
          textColor: '#C2185B',
          IconComponent: Heartbeat,
        };
      case 'ai':
      default:
        return {
          title: 'IMPORTANT DISCLAIMER',
          text:
            customText ||
            'AI Parent Guide provides general everyday parenting tips. It does not provide medical diagnosis, treatment, or professional counseling (SRS FR-AI-05).',
          bgColor: '#F3EEF9',
          borderColor: '#7E57C2',
          textColor: '#7E57C2',
          IconComponent: Info,
        };
    }
  };

  const config = getDisclaimerConfig();
  const { IconComponent } = config;

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
      <View style={styles.iconRow}>
        <IconComponent size={20} color={config.textColor} weight="bold" />
        <Text style={[styles.title, { color: config.textColor }]}>{config.title}</Text>
      </View>
      <Text style={styles.bodyText}>{config.text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.subcard,
    padding: 14,
    borderWidth: 1,
    marginVertical: 10,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  bodyText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
