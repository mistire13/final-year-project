import React from 'react';
import { View } from 'react-native';
import { X } from 'phosphor-react-native/src/icons/X';
import { Card, Text, IconButton, Badge } from './System';
import { MotionPressable } from './Motion';
import { colors } from '../../theme/tokens';
import type { DaycareAnnouncement } from '../../api/parentApi';
import { announcementLabel } from '../../utils/announcements';

export function AnnouncementPreview({ item, unread, onOpen, onDismiss, dismissDisabled = false }: {
  item: DaycareAnnouncement; unread: boolean; onOpen: () => void; onDismiss?: () => void; dismissDisabled?: boolean;
}) {
  return <Card style={{ padding: 0, marginBottom: 14 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6, paddingTop: 8 }}>
      <Text size={13} weight="semibold" color={item.announcement_type === 'alert' ? colors.dangerText : colors.textSecondary} style={{ flex: 1 }}>
        {announcementLabel(item)}
      </Text>
      {unread && <Badge title="Unread" tone="neutral" />}
      {onDismiss && <IconButton icon={X} label={dismissDisabled ? 'Saving read status' : `Dismiss ${item.title}`} disabled={dismissDisabled} onPress={onDismiss} />}
    </View>
    <MotionPressable accessibilityRole="button" accessibilityLabel={`Read ${item.title}`} onPress={onOpen} style={{ padding: 18, paddingTop: 8 }}>
      <Text size={18} weight="semibold" numberOfLines={2}>{item.title}</Text>
      <Text color={colors.textSecondary} numberOfLines={2} style={{ marginTop: 6 }}>{item.body}</Text>
      <Text size={13} color={colors.textSecondary} style={{ marginTop: 12 }}>
        {item.author_name || 'Daycare team'} · {new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </Text>
    </MotionPressable>
  </Card>;
}
