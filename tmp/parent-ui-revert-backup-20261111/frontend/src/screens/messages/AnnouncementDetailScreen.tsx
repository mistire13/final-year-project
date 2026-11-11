import React, { useCallback, useEffect, useState, useRef } from "react";
import { ActivityIndicator } from "react-native";
import {
  Page,
  Card,
  Text,
  Notice,
  Button,
} from "../../components/design/System";
import { apiClient } from "../../api/client";
import { DaycareAnnouncement } from "../../api/parentApi";
import { useAnnouncementReads } from '../../hooks/useAnnouncementReads';
import { announcementLabel } from '../../utils/announcements';
import { colors } from '../../theme/tokens';
export function AnnouncementDetailScreen({ route, navigation }: any) {
  const id = route.params?.announcementId;
  const [item, setItem] = useState<DaycareAnnouncement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { readError, markRead } = useAnnouncementReads(navigation);
  const revision = useRef(0);
  const load = useCallback(async () => {
    const request = ++revision.current;
    setLoading(true);
    setError("");
    setItem(null);
    try {
      const announcement = (await apiClient.get(`/communication/announcements/${id}`)).data;
      if (request !== revision.current) return;
      setItem(announcement);
      void markRead(announcement.id);
    } catch (e: any) {
      if (request === revision.current) setError(
        e.response?.status === 404
          ? "This announcement has expired or is unavailable to your account."
          : "Could not load the announcement. Please retry.",
      );
    } finally {
      if (request === revision.current) setLoading(false);
    }
  }, [id, markRead]);
  useEffect(() => {
    void load();
    return () => { revision.current++; };
  }, [load]);
  return (
    <Page title="Announcement" back>
      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <>
          <Notice>{error}</Notice>
          <Button title="Retry" onPress={load} />
        </>
      ) : (
        item && (
          <>
          {!!readError && <><Notice tone="error">{readError}</Notice><Button title="Retry marking as read" variant="outline" onPress={() => { void markRead(item.id); }} /></>}
          <Card>
            <Text size={14} weight="semibold" color={item.announcement_type === 'alert' ? colors.dangerText : colors.textSecondary}>
              {announcementLabel(item)}
            </Text>
            <Text size={24} weight="semibold" accessibilityRole="header" style={{ marginVertical: 12 }}>
              {item.title}
            </Text>
            <Text size={14} color={colors.textSecondary}>
              {item.author_name || "Daycare team"} ·{" "}
              {new Date(item.created_at).toLocaleDateString()}
            </Text>
            <Text style={{ marginTop: 24, lineHeight: 25 }}>{item.body}</Text>
            {item.target_group_name && (
              <Text size={12} style={{ marginTop: 20 }}>
                For {item.target_group_name}
              </Text>
            )}
          </Card>
          </>
        )
      )}
    </Page>
  );
}
