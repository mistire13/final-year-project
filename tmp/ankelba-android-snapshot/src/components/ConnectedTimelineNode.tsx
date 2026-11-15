import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { CheckCircle } from "phosphor-react-native/src/icons/CheckCircle";
import { ForkKnife } from "phosphor-react-native/src/icons/ForkKnife";
import { BookOpen } from "phosphor-react-native/src/icons/BookOpen";
import { Smiley } from "phosphor-react-native/src/icons/Smiley";
import { Moon } from "phosphor-react-native/src/icons/Moon";
import { Palette } from "phosphor-react-native/src/icons/Palette";
import { Clock } from "phosphor-react-native/src/icons/Clock";
import { colors, radii, shadows } from '../theme/tokens';
import { HighlightCategory } from './HighlightCard';

export interface ConnectedTimelineNodeProps {
  time: string;
  title: string;
  description: string;
  category?: HighlightCategory | 'checkin' | 'art';
  isFirst?: boolean;
  isLast?: boolean;
  photoUrl?: string;
}

export const ConnectedTimelineNode: React.FC<ConnectedTimelineNodeProps> = ({
  time,
  title,
  description,
  category = 'checkin',
  isFirst = false,
  isLast = false,
  photoUrl,
}) => {
  const getNodeColor = () => {
    switch (category) {
      case 'checkin':
        return {
          bg: colors.statusPresentBg,
          text: colors.statusPresentText,
          Icon: CheckCircle,
        };
      case 'meals':
        return {
          bg: colors.pastelYellow,
          text: colors.pastelYellowText,
          Icon: ForkKnife,
        };
      case 'sleep':
        return {
          bg: colors.pastelPurple,
          text: colors.pastelPurpleText,
          Icon: Moon,
        };
      case 'learning':
        return {
          bg: colors.pastelCyan,
          text: colors.pastelCyanText,
          Icon: BookOpen,
        };
      case 'play':
        return {
          bg: colors.pastelGreen,
          text: colors.pastelGreenText,
          Icon: Smiley,
        };
      case 'art':
        return {
          bg: colors.pastelPeach,
          text: colors.pastelPeachText,
          Icon: Palette,
        };
      default:
        return {
          bg: colors.bgMuted,
          text: colors.textPrimary,
          Icon: Clock,
        };
    }
  };

  const nodeColor = getNodeColor();
  const { Icon } = nodeColor;

  return (
    <View style={styles.container}>
      {/* Timeline Column (Line + Dot Icon) */}
      <View style={styles.lineColumn}>
        {!isFirst && <View style={styles.lineTop} />}
        <View style={[styles.iconCircle, { backgroundColor: nodeColor.bg }]}>
          <Icon size={18} color={nodeColor.text} weight="bold" />
        </View>
        {!isLast && <View style={styles.lineBottom} />}
      </View>

      {/* Content Card */}
      <View style={styles.contentCard}>
        {/* Time Badge & Title */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.timeBadge}>
            <Text style={styles.timeText}>{time}</Text>
          </View>
        </View>

        {/* Description Body */}
        <Text style={styles.description}>{description}</Text>

        {/* Photo Preview if attached */}
        {photoUrl ? (
          <View style={styles.photoContainer}>
            <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  lineColumn: {
    width: 40,
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  lineTop: {
    position: 'absolute',
    top: 0,
    bottom: '50%',
    width: 2,
    backgroundColor: colors.borderCard,
  },
  lineBottom: {
    position: 'absolute',
    top: '50%',
    bottom: 0,
    width: 2,
    backgroundColor: colors.borderCard,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgSurface,
    zIndex: 2,
    ...shadows.card,
  },
  contentCard: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    borderRadius: radii.subcard,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  timeBadge: {
    backgroundColor: colors.bgMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  description: {
    fontSize: 13.5,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 19,
  },
  photoContainer: {
    marginTop: 10,
    borderRadius: radii.input,
    overflow: 'hidden',
    height: 140,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
});
