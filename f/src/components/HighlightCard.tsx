import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ForkKnife } from "phosphor-react-native/src/icons/ForkKnife";
import { Moon } from "phosphor-react-native/src/icons/Moon";
import { BookOpen } from "phosphor-react-native/src/icons/BookOpen";
import { Smiley } from "phosphor-react-native/src/icons/Smiley";
import { Heart } from "phosphor-react-native/src/icons/Heart";
import { Eye } from "phosphor-react-native/src/icons/Eye";
import { Lightning } from "phosphor-react-native/src/icons/Lightning";
import { colors, radii, shadows } from '../theme/tokens';

export type HighlightCategory =
  | 'meals'
  | 'sleep'
  | 'learning'
  | 'play'
  | 'mood'
  | 'observation';

export interface HighlightCardProps {
  category: HighlightCategory;
  title: string;
  subtitle?: string;
  time?: string;
  onPress?: () => void;
}

export const HighlightCard: React.FC<HighlightCardProps> = ({
  category,
  title,
  subtitle,
  time,
  onPress,
}) => {
  const getCategoryConfig = () => {
    switch (category) {
      case 'meals':
        return {
          label: 'MEALS',
          bgColor: colors.pastelYellow,
          textColor: colors.pastelYellowText,
          IconComponent: ForkKnife,
        };
      case 'sleep':
        return {
          label: 'SLEEP',
          bgColor: colors.pastelPurple,
          textColor: colors.pastelPurpleText,
          IconComponent: Moon,
        };
      case 'learning':
        return {
          label: 'LEARNING',
          bgColor: colors.pastelCyan,
          textColor: colors.pastelCyanText,
          IconComponent: BookOpen,
        };
      case 'play':
        return {
          label: 'PLAY',
          bgColor: colors.pastelGreen,
          textColor: colors.pastelGreenText,
          IconComponent: Smiley,
        };
      case 'mood':
        return {
          label: 'MOOD',
          bgColor: colors.pastelPink,
          textColor: colors.pastelPinkText,
          IconComponent: Heart,
        };
      case 'observation':
      default:
        return {
          label: 'OBSERVATION',
          bgColor: colors.pastelPeach,
          textColor: colors.pastelPeachText,
          IconComponent: Eye,
        };
    }
  };

  const config = getCategoryConfig();
  const { IconComponent } = config;

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.82 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, { backgroundColor: config.bgColor }]}
    >
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: 'rgba(255, 255, 255, 0.7)' }]}>
          <IconComponent size={20} color={config.textColor} weight="bold" />
        </View>
        <Text style={[styles.categoryTag, { color: config.textColor }]}>{config.label}</Text>
      </View>

      {/* Title & Subtitle */}
      <View style={styles.contentContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Optional Timestamp Pill */}
      {time ? (
        <View style={styles.timeBadge}>
          <Text style={[styles.timeText, { color: config.textColor }]}>{time}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    padding: 16,
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 130,
    position: 'relative',
    ...shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTag: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  contentContainer: {
    marginTop: 4,
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
  },
  timeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
