import React from "react";
import { View, Switch, Linking } from "react-native";
import { PencilSimple } from "phosphor-react-native/src/icons/PencilSimple";
import { UsersThree } from "phosphor-react-native/src/icons/UsersThree";
import { Receipt } from "phosphor-react-native/src/icons/Receipt";
import { Smiley } from "phosphor-react-native/src/icons/Smiley";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { SpeakerHigh } from "phosphor-react-native/src/icons/SpeakerHigh";
import { User } from "phosphor-react-native/src/icons/User";
import { LockKey } from "phosphor-react-native/src/icons/LockKey";
import { Question } from "phosphor-react-native/src/icons/Question";
import { SignOut } from "phosphor-react-native/src/icons/SignOut";
import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";
import { CalendarBlank } from "phosphor-react-native/src/icons/CalendarBlank";
import { CreditCard } from "phosphor-react-native/src/icons/CreditCard";
import {
  Page,
  Text,
  Card,
  Avatar,
  Button,
  MenuRow,
  Notice,
  Section,
  IconButton,
  s,
} from "../../components/design/System";
import { artwork } from "../../theme/assets";
import { useAuth } from "../../context/AuthContext";
import { useDesign } from "../../context/DesignContext";
import { useChild } from "../../context/ChildContext";
import { getWebPortalUrl } from "../../utils/host";

export function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { preferences, togglePreference, persistenceError } = useDesign();
  const { selectedChild } = useChild();

  const childrenList = user?.linked_children?.length
    ? user.linked_children
    : selectedChild
    ? [selectedChild]
    : [];

  return (
    <Page>
      {!!persistenceError && <Notice>{persistenceError}</Notice>}
      <Card>
        <View style={[s.row, { alignItems: "flex-start" }]}>
          <Avatar
            source={artwork.mother}
            initials={user?.name ? user.name.slice(0, 2).toUpperCase() : "PA"}
            size={50}
          />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text size={22} weight="semibold">
              {user?.name || "Parent User"}
            </Text>
            <Text size={12} color="#767F8C" style={{ marginTop: 2 }}>
              {user?.email}
            </Text>
          </View>
          <IconButton
            icon={PencilSimple}
            label="Edit profile"
            onPress={() => navigation.navigate("ParentProfile")}
          />
        </View>
      </Card>
      {(user?.role === "caregiver" || user?.role === "admin") && (
        <Card style={{ marginTop: 14, backgroundColor: "#E8F6F3", borderColor: "#B2E2D8", borderWidth: 1 }}>
          <View style={s.between}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text weight="bold" color="#006C75">
                {user.role === "admin" ? "Daycare Admin Portal" : "Caregiver Staff Workspace"}
              </Text>
            </View>
            <Button
              title="Open Portal"
              variant="secondary"
              onPress={() => Linking.openURL(getWebPortalUrl(user.role === "admin" ? "/admin" : "/staff"))}
              style={{ minHeight: 36, paddingVertical: 6, paddingHorizontal: 12 }}
            />
          </View>
        </Card>
      )}

      <Section title={user?.role === "caregiver" ? "Classroom children" : user?.role === "admin" ? "Enrolled children" : "My children"} />
      {childrenList.length ? childrenList.map((child) => (
        <Card key={child.id} style={{ marginBottom: 8, padding: 14 }} onPress={() => navigation.navigate("ChildProfile", { childId: child.id })}>
          <View style={s.row}>
            <Avatar
              source={child.photo_url ? { uri: child.photo_url } : undefined}
              initials={child.full_name?.slice(0, 2).toUpperCase()}
              size={40}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text size={16} weight="semibold" numberOfLines={2}>{child.full_name}</Text>
              {!!child.group_name && <Text size={12} color="#767F8C" numberOfLines={2}>{child.group_name}</Text>}
            </View>
            <CaretRight size={16} />
          </View>
        </Card>
      )) : <Notice>No children linked yet.</Notice>}

      <Text
        size={13}
        color="#747B87"
        style={{ letterSpacing: 0.8, marginTop: 28, marginBottom: 12 }}
      >
        NOTIFICATIONS
      </Text>
      <Card style={{ paddingVertical: 0 }}>
        {[
          { key: "activity", name: "Child Activity", Icon: Smiley },
          { key: "messages", name: "Messages", Icon: ChatCircle },
          { key: "announcements", name: "Announcements", Icon: SpeakerHigh },
        ].map((item, i) => (
          <MenuRow
            key={item.key}
            title={item.name}
            icon={item.Icon}
            last={i === 2}
          >
            <Switch
              accessibilityLabel={item.name + " notifications"}
              value={preferences[item.key]}
              onValueChange={() => togglePreference(item.key)}
              trackColor={{ false: "#E3E2E5", true: "#061224" }}
              thumbColor="white"
            />
          </MenuRow>
        ))}
      </Card>
      <Text
        size={13}
        color="#747B87"
        style={{ letterSpacing: 0.8, marginTop: 28, marginBottom: 12 }}
      >
        ACCOUNT
      </Text>
      <Card style={{ paddingVertical: 0 }}>
        <MenuRow
          title="Personal Information"
          icon={User}
          onPress={() => navigation.navigate("ParentProfile")}
        />
        <MenuRow
          title="Security & Password"
          icon={LockKey}
          onPress={() => navigation.navigate("Security")}
          last
        />
      </Card>
      <Section title="Care and payments" />
      <Card style={{ paddingVertical: 0 }}>
        <MenuRow title="Pickup contacts" icon={UsersThree} onPress={() => navigation.navigate("AuthorizedGuardians")} />
        <MenuRow title="Care fees" icon={CreditCard} onPress={() => navigation.navigate("ChildCareFees")} />
        <MenuRow title="Orders & receipts" icon={Receipt} onPress={() => navigation.navigate("Orders")} last />
      </Card>

      <Text
        size={13}
        color="#747B87"
        style={{ letterSpacing: 0.8, marginTop: 28, marginBottom: 12 }}
      >
        DAYCARE & SUPPORT
      </Text>
      <Card style={{ paddingVertical: 0 }}>
        <MenuRow
          title="Calendar"
          icon={CalendarBlank}
          onPress={() => navigation.navigate("CalendarPage")}
        />
        <MenuRow
          title="Inbox"
          icon={SpeakerHigh}
          onPress={() => navigation.navigate("Notifications")}
        />
        <MenuRow
          title="Help & Support"
          icon={Question}
          onPress={() => navigation.navigate("HelpSupport")}
          last
        />
      </Card>
      <Button
        title="Log Out"
        icon={SignOut}
        variant="danger"
        onPress={async () => {
          await logout();
        }}
        style={{ alignSelf: "center", minHeight: 46, marginTop: 32 }}
      />
    </Page>
  );
}
