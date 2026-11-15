import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radii } from '../theme/tokens';

export type StatusType = 'at_daycare' | 'present' | 'absent' | 'ready' | 'checked_out';

export interface StatusBadgeProps {
  status: StatusType;
  customText?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, customText }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'at_daycare':
        return {
          bg: colors.statusPresentBg,
          text: colors.statusPresentText,
          label: customText || '● AT DAYCARE',
          showDot: true,
        };
      case 'present':
        return {
          bg: colors.statusPresentBg,
          text: colors.statusPresentText,
          label: customText || '● Present',
          showDot: true,
        };
      case 'absent':
        return {
          bg: colors.statusAbsentBg,
          text: colors.statusAbsentText,
          label: customText || '● Absent',
          showDot: true,
        };
      case 'ready':
        return {
          bg: colors.statusReadyBg,
          text: colors.statusReadyText,
          label: customText || '● READY FOR PICKUP',
          showDot: true,
        };
      case 'checked_out':
      default:
        return {
          bg: colors.bgInput,
          text: colors.textSecondary,
          label: customText || 'Checked Out',
          showDot: false,
        };
    }
  };

  const badge = getBadgeStyle();

  return (
    <View style={[styles.badgeContainer, { backgroundColor: badge.bg }]}>
      <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badgeContainer: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
