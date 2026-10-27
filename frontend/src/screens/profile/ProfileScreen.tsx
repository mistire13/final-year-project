import React from "react";
import { View, Switch, Pressable, Linking } from "react-native";
import { PencilSimple } from "phosphor-react-native/src/icons/PencilSimple";
import { UsersThree } from "phosphor-react-native/src/icons/UsersThree";
import { Package } from "phosphor-react-native/src/icons/Package";
import { Receipt } from "phosphor-react-native/src/icons/Receipt";
import { Smiley } from "phosphor-react-native/src/icons/Smiley";
import { ChatCircle } from "phosphor-react-native/src/icons/ChatCircle";
import { SpeakerHigh } from "phosphor-react-native/src/icons/SpeakerHigh";
import { User } from "phosphor-react-native/src/icons/User";
import { LockKey } from "phosphor-react-native/src/icons/LockKey";
import { Globe } from "phosphor-react-native/src/icons/Globe";
import { Question } from "phosphor-react-native/src/icons/Question";
import { SignOut } from "phosphor-react-native/src/icons/SignOut";
import { CaretRight } from "phosphor-react-native/src/icons/CaretRight";
import {
  Page,
  Text,
  Card,
  Avatar,
  Button,
  MenuRow,
  Notice,
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
            size={64}
          />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text size={22} weight="semibold">
              {user?.name || "Parent User"}
            </Text>
            <Text
              size={11}
              color="#7E8793"
              style={{ letterSpacing: 0.7, marginTop: 3 }}
            >
              {user?.role ? `${user.role.toUpperCase()} ACCOUNT` : "PARENT ACCOUNT"}
            </Text>
            <Text size={12} color="#767F8C" style={{ marginTop: 8 }}>
              {user?.email || "No email on record"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            onPress={() => navigation.navigate("ParentProfile")}
            hitSlop={10}
          >
            <PencilSimple size={22} />
          </Pressable>
        </View>
      </Card>
      {(user?.role === "caregiver" || user?.role === "admin") && (
        <Card style={{ marginTop: 14, backgroundColor: "#E8F6F3", borderColor: "#B2E2D8", borderWidth: 1 }}>
          <View style={s.between}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text weight="bold" color="#006C75">
                {user.role === "admin" ? "Daycare Admin Portal" : "Caregiver Staff Workspace"}
              </Text>
              <Text size={12} color="#008794" style={{ marginTop: 3 }}>
                Open full desktop management tools in your browser.
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

      <Text size={19} weight="semibold" style={{ marginVertical: 20 }}>
        {user?.role === "caregiver" ? "Classroom Children" : user?.role === "admin" ? "Enrolled Children" : "My Children"}
      </Text>

      {childrenList.length > 0 ? (
        childrenList.map((ch) => (
          <Card key={ch.id} style={{ marginBottom: 12 }}>
            <View style={s.row}>
              <Avatar
                source={ch.photo_url?{uri:ch.photo_url}:undefined}
                initials={ch.full_name ? ch.full_name.slice(0, 2).toUpperCase() : "CH"}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text size={17} weight="medium">
                  {ch.full_name}
                </Text>
                <Text size={12} color="#7E8490">
                  {ch.group_name || "Early Learning"} · {ch.relationship || "Enrolled"}
                </Text>
              </View>
              <Button
                title="View Profile"
                variant="secondary"
                onPress={() => navigation.navigate("ChildProfile", { childId: ch.id })}
                style={{
                  minHeight: 40,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}
              />
            </View>
          </Card>
        ))
      ) : (
        <Card style={{ padding: 18 }}>
          <Text size={14} color="#7E8490">
            {user?.role === "caregiver"
              ? "Classroom children and activity logs are synced with your daycare center."
              : user?.role === "admin"
              ? "Enrolled center children will appear here."
              : "No children currently linked to this parent account."}
          </Text>
        </Card>
      )}
      <View style={[s.row, { marginTop: 22, gap: 14 }]}>
        {[
          {
            title: "Care Fees",
            sub: "Bills & receipts",
            Icon: Receipt,
            go: "ChildCareFees",
            bg: "#EAF5ED",
            ink: "#2E7D32",
          },
          {
            title: "Guardians",
            sub: "Pickup contacts",
            Icon: UsersThree,
            go: "AuthorizedGuardians",
            bg: "#FFF0CA",
            ink: "#967317",
          },
          {
            title: "Orders",
            sub: "Store supplies",
            Icon: Package,
            go: "Orders",
            bg: "#E8EFFC",
            ink: "#213D62",
          },
        ].map((item) => (
          <Card
            key={item.title}
            style={{ flex: 1, padding: 16 }}
            onPress={() => navigation.navigate(item.go)}
          >
            <View
              style={{
                width: 41,
                height: 41,
                borderRadius: 21,
                backgroundColor: item.bg,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <item.Icon size={23} color={item.ink} weight="fill" />
            </View>
            <Text weight="semibold">{item.title}</Text>
            <Text size={11} color="#8A8E97" style={{ marginTop: 5 }}>
              {item.sub}
            </Text>
          </Card>
        ))}
      </View>
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
      <Text
        size={13}
        color="#747B87"
        style={{ letterSpacing: 0.8, marginTop: 28, marginBottom: 12 }}
      >
        EXPLORE
      </Text>
      <Card style={{ paddingVertical: 0 }}>
        <MenuRow
          title="Daycare Store"
          icon={Package}
          onPress={() => navigation.navigate("DaycareStore")}
        />
        {[
          ["Care Fees & Receipts", "ChildCareFees"],
          ["Attendance History", "AttendanceHistory"],
          ["Health & Incidents", "HealthNotices"],
          ["Report Archive", "ReportsHistory"],
          ["Pickup status", "PickupVerification"],
          ["Shopping Cart", "ShoppingCart"],
          ["Order History", "Orders"],
          ["Calendar & Events", "CalendarPage"],
          ["Notifications", "Notifications"],
          ["AI Parent Guide", "AIGuide"],
        ].map(([title, route]) => (
          <MenuRow key={route} title={title} icon={CaretRight}
            onPress={() => navigation.navigate(route)} />
        ))}
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
