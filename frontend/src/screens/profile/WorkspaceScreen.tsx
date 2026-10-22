import React, { useState } from "react";
import { Linking, Platform } from "react-native";
import { Page, Card, Text, MenuRow } from "../../components/design/System";
import { SquaresFour } from "phosphor-react-native";
import { useAuth } from "../../context/AuthContext";
import { getWebPortalUrl } from "../../utils/host";

export function WorkspaceScreen() {
  const { user } = useAuth();
  const [error, setError] = useState("");
  const admin = user?.role === "admin";
  if (!admin && user?.role !== "caregiver") {
    return <Page title="Workspace"><Text>Sign in with a staff account to access your workspace.</Text></Page>;
  }
  const links = admin
    ? [["Overview", "dashboard"], ["Children & families", "children"],
       ["Caregivers & staff", "caregivers"], ["Groups & classrooms", "groups"],
       ["Front-desk duties", "front-desk"], ["Attendance & pickups", "attendance"],
       ["Daily reports", "reports"], ["Health & incidents", "health"],
       ["Guardian verification", "biometric"], ["Communication", "communication"],
       ["Events & calendar", "events"], ["Products & stock", "store"],
       ["Orders & payments", "orders"], ["Audit history", "audit"],
       ["Center profile & plan", "settings"]]
    : [["Front-desk workspace", "workspace"]];
  return (
    <Page title={admin ? "Admin workspace" : "Staff workspace"}>
      <Text style={{ marginBottom: 16 }}>Choose a page to open in the web portal. Sign in there if prompted.</Text>
      {!!error && <Text color="#B42318" style={{ marginBottom: 12 }}>{error}</Text>}
      <Card style={{ paddingVertical: 0 }}>
        {links.map(([title, path], index) => (
          <MenuRow key={path} title={title} icon={SquaresFour} last={index === links.length - 1}
            onPress={async () => {
              setError("");
              const target = `/${admin ? "admin" : "staff"}/${path}`;
              if (Platform.OS === "web") {
                window.location.assign(target);
                return;
              }
              try { await Linking.openURL(getWebPortalUrl(target)); }
              catch { setError("Could not open the portal. Please try again."); }
            }} />
        ))}
      </Card>
    </Page>
  );
}
