import React, { useCallback, useEffect, useState } from "react";
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
export function AnnouncementDetailScreen({ route }: any) {
  const id = route.params?.announcementId;
  const [item, setItem] = useState<DaycareAnnouncement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setItem(null);
    try {
      setItem((await apiClient.get(`/communication/announcements/${id}`)).data);
    } catch (e: any) {
      setError(
        e.response?.status === 404
          ? "This announcement has expired or is unavailable to your account."
          : "Could not load the announcement. Please retry.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
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
          <Card>
            <Text size={12} color="#657363">
              {item.announcement_type === "meal_plan"
                ? "MEAL PLAN"
                : "DAYCARE UPDATE"}
            </Text>
            <Text size={26} weight="bold" style={{ marginVertical: 16 }}>
              {item.title}
            </Text>
            <Text size={12} color="#657363">
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
        )
      )}
    </Page>
  );
}
