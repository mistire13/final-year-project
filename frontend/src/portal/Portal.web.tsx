import SetupChecklist from './SetupChecklist.web';
import {DaycareSubscription} from './SubscriptionViews.web';
import { CaregiverPage } from "./CaregiverPages.web";
import { DaycareFinances } from "./DaycareFinances.web";
import { PageTransition } from "./WebMotion.web";
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./portal.css";
import {
  Dataset,
  Row,
  allowedDuty,
  allowedAttendance,
  attendanceStatus,
  dayOf,
  dutyError,
  metrics,
  money,
  label,
  localDay,
  makePreview,
  emptyDataset,
  today,
} from "./model";
import { portalApi, portalClient, apiError } from "./api";
import { isPortalPreviewPath } from "./previewPolicy";
import {
  Analytics,
  Attendance,
  Caregivers,
  Children,
  Duties,
  Groups,
  Monitoring,
  Overview,
  PageContext,
  Registry,
  Reports,
  childName,
  groupName,
  userName,
} from "./pages.web";
import {
  Badge,
  Button,
  Card,
  FieldSpec,
  Icon,
  Modal,
  Person,
  RecordForm,
  downloadRecords,
} from "./ui.web";
const logo = require("../../design/figma-exports/ankelba-symbol.png");
const nav = [
  {
    group: "YOUR DAYCARE",
    items: [
      ["dashboard", "Overview", "home"],
      ["analytics", "Analytics", "chart"],
      ["finances", "Finances & Fees", "file"],
      ["children", "Children & Families", "child"],
      ["caregivers", "Caregivers & Staff", "people"],
      ["groups", "Groups & classrooms", "leaf"],
    ],
  },
  {
    group: "DAILY CARE",
    items: [
      ["front-desk", "Front-desk duties", "desk"],
      ["attendance", "Attendance & pickups", "check"],
      ["reports", "Daily reports", "file"],
      ["health", "Health & incidents", "heart"],
      ["biometric", "Guardian verification", "shield"],
    ],
  },
  {
    group: "COMMUNITY",
    items: [
      ["communication", "Communication", "message"],
      ["events", "Events & calendar", "calendar"],
      ["store", "Products & stock", "store"],
      ["orders", "Orders & payments", "file"],
      ["audit", "Audit history", "audit"],
      ["settings", "Center profile & plan", "leaf"],
    ],
  },
];
const subtitles: Record<string, string> = {
  dashboard: "A thoughtful overview of your daycare, all in one place.",
  analytics: "Understand the patterns behind each day of care.",
  finances: "Child care fees, monthly invoices, cash/mobile payment reconciliation and digital receipts.",
  settings: "Manage daycare center profile, contact details and subscription plan tier.",
  children: "Enrolled children, their linked families, emergency contacts, and care plans.",
  caregivers: "Professional staff profiles, qualifications, assigned groups, and shift schedules.",
  users: "Professional staff profiles, qualifications, assigned groups, and shift schedules.",
  groups: "A little organization. More room to grow.",
  "front-desk":
    "Plan coverage and give each caregiver the right responsibilities.",
  attendance: "Know who is here, who is expected and who has gone home.",
  reports: "Keep every family connected to their child’s day.",
  health: "Stay informed and follow up with care.",
  biometric: "Approved adults. Clear verification. Thoughtful pickup.",
  communication: "Small updates that bring your community together.",
  events: "Make space for the moments that matter.",
  store: "Keep everyday essentials ready for little learners.",
  orders: "Follow each order from placement to daycare collection.",
  audit: "A clear record of who did what, and when.",
  workspace: "Your assigned children and front-desk responsibilities.",
};
const num = (value: any) => (value ? Number(value) : null);
const options = (rows: Row[], key = "name") =>
  rows.map((r) => ({ value: String(r.id), label: r[key] }));
function Brand({ daycareName, plan }: { daycareName?: string; plan?: string }) {
  return (
    <div className="p-brand" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8, paddingBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <img src={typeof logo === "string" ? logo : logo.uri} alt="Ankelba" />
        <span>
          Ankelba<small>GROWING TOGETHER</small>
        </span>
      </div>
      {daycareName && (
        <div style={{
          width: "100%",
          padding: "8px 10px",
          background: "#fff",
          borderRadius: 10,
          border: "1px solid #e8e5dc",
          boxSizing: "border-box",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="building" size={14} /> <span>{daycareName}</span>
          </div>
          {plan && (
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "capitalize", marginTop: 2 }}>
              ● {plan} Plan
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default function Portal() {
  const path = window.location.pathname;
  const preview = __DEV__ && isPortalPreviewPath(path);
  const startStaff = path.startsWith("/staff");
  const [actor, setActor] = useState<Row | null>(
    preview
      ? {
          id: startStaff ? 11 : 1,
          name: startStaff ? "Meron Alemu" : "Aster Alemayehu",
          role: startStaff ? "caregiver" : "admin",
        }
      : null,
  );
  const [checking, setChecking] = useState(!preview);
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [page, setPage] = useState(
    path.split("/").filter(Boolean).at(-1) || "dashboard",
  );
  const [date, setDate] = useState(today());
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [data, setData] = useState<Dataset>(() => preview ? makePreview() : emptyDataset());
  const [loading, setLoading] = useState(!preview);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ kind: string; row: Row } | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [broadcast, setBroadcast] = useState<{ message: string; level: string; active: boolean } | null>(null);
  const loadingRequest = useRef(0);
  const staff = actor?.role === "caregiver";
  const base = `/${staff ? "staff" : "admin"}${preview ? "/preview" : ""}`;
  const navigation = staff
    ? [
        {
          group: "YOUR SHIFT",
          items: [["workspace", "Attendance & pickup", "desk"], ["reports", "Daily reports", "file"], ["health", "Health & incidents", "heart"], ["communication", "Messages & announcements", "message"], ["events", "Calendar", "calendar"]],
        },
      ]
    : nav;
  const available = [...navigation.flatMap((g) => g.items).map((i) => i[0]), ...(staff ? [] : ["users", "caregivers"])];
  const normalizedPage = page === "users" ? "caregivers" : page;
  const selected = available.includes(normalizedPage)
    ? normalizedPage
    : staff
      ? "workspace"
      : "dashboard";
  const title =
    navigation.flatMap((g) => g.items).find((i) => i[0] === selected)?.[1] ||
    "Overview";
  const go = (next: string) => {
    window.history.pushState({}, "", base + "/" + next);
    setPage(next);
    setQuery("");
    setMenu(false);
  };
  useEffect(() => {
    const change = () => {
      setPage(
        window.location.pathname.split("/").filter(Boolean).at(-1) ||
          "dashboard",
      );
      setQuery("");
      setMenu(false);
    };
    window.addEventListener("popstate", change);
    return () => window.removeEventListener("popstate", change);
  }, []);
  useEffect(() => {
    document.title = actor ? title + " · Ankelba" : "Staff sign in · Ankelba";
  }, [actor, title]);
  useEffect(() => {
    if (preview) return;
    let active = true;
    (async () => {
      try {
        let user = await portalApi.session();
        if (user && user.role === "parent") {
          user = null;
        }
        if (user && user.role === "super_admin") {
          window.location.assign("/super-admin");
          return;
        }
        if (active && user) {
          setActor(user);
        }
      } catch (err) {
        if (active) setLoginError("Your session could not be checked. Check your connection and reload to retry.");
      } finally {
        if (active) setChecking(false);
      }
    })();
    portalApi.getBroadcast().then((b) => {
      if (active && b && b.active) setBroadcast(b);
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [preview]);
  const refresh = async () => {
    if (preview || !actor) return;
    const request = ++loadingRequest.current;
    setLoading(true);
    setLoadError("");
    try {
      const snapshot = await portalApi.snapshot(staff ? today() : date, staff);
      if (request === loadingRequest.current) setData(snapshot);
    } catch (error: any) {
      if (request !== loadingRequest.current) return;
      if (error.response?.status === 401) {
        if (!preview) {
          setActor(null);
          setLoginError("Your session has ended. Please sign in again.");
        }
      } else setLoadError(apiError(error));
    } finally {
      if (request === loadingRequest.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (actor && ["admin", "caregiver"].includes(actor.role)) {
      if (!available.includes(page)) go(staff ? "workspace" : "dashboard");
      void refresh();
    }
    return () => {
      loadingRequest.current++;
    };
  }, [actor?.id, date]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const submitLogin = async (email: string, pass: string) => {
    if (preview) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const user = await portalApi.login(email.trim(), pass);
      if (user.role === "parent") {
        setLoginError(
          "This workspace is for daycare staff. Open the parent app below.",
        );
        return;
      }
      if (user.role === "super_admin") {
        window.location.assign("/super-admin");
        return;
      }
      setActor(user);
      setPage(user.role === "caregiver" ? "workspace" : "dashboard");
      window.history.replaceState(
        {},
        "",
        `/${user.role === "caregiver" ? "staff" : "admin"}/${user.role === "caregiver" ? "workspace" : "dashboard"}`,
      );
    } catch (error) {
      setLoginError(apiError(error));
    } finally {
      setLoginBusy(false);
    }
  };
  const login = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const values = new FormData(e.currentTarget);
    await submitLogin(
      String(values.get("email")),
      String(values.get("password")),
    );
  };
  const signOut = async () => {
    if (preview) {
      window.location.assign("/admin/login");
      return;
    }
    await portalApi.logout().catch(() => {});
    setActor(null);
    setData(emptyDataset());
    setLoading(true);
    window.history.replaceState({}, "", "/admin/login");
  };
  const open = (kind: string, row: Row = { id: 0 }) => {
    setFormError("");
    setModal({ kind, row: ["guardian-request-create","announcement"].includes(kind) ? {...row,request_key:`${Date.now()}-${Math.random().toString(36).slice(2)}`} : row });
  };
  const close = () => {
    if (!saving) setModal(null);
  };
  const mutate = async (
    path: string,
    body: any,
    apply: (d: Dataset) => Dataset,
    method: "post" | "patch" | "delete" = "post",
  ) => {
    if (preview) {
      setData((old) => {
        const next = apply(old);
        return {
          ...next,
          audit: [
            {
              id: Date.now(),
              actor_id: actor!.id,
              action: path.replace(/^\//, "").replaceAll("/", "_").toUpperCase(),
              target_table: path.split("/")[1],
              target_id: body.id || null,
              created_at: new Date().toISOString(),
            },
            ...next.audit,
          ],
        };
      });
      setToast("Saved in local preview.");
      return;
    }
    await portalApi.save(path, body, method);
    await refresh();
    setToast("Saved successfully.");
  };
  const upsert = (key: Exclude<keyof Dataset, "daycare">, row: Row) => (d: Dataset) => ({
    ...d,
    [key]:
      row.id && ((d[key] as Row[]) || []).some((r: Row) => r.id === row.id)
        ? ((d[key] as Row[]) || []).map((r: Row) => (r.id === row.id ? { ...r, ...row } : r))
        : [{ ...row, id: row.id || Date.now() }, ...(((d[key] as Row[]) || []))],
  });
  const save = async (values: Record<string, any>) => {
    if (!modal || saving) return;
    setSaving(true);
    setFormError("");
    const { kind, row } = modal;
    try {
      if (kind === "caregiver" || (kind === "user" && row.role === "caregiver")) {
        if (!values.name?.trim() || !values.email?.trim())
          throw Error("Name and email are required.");
        if (
          data.users.some(
            (u) =>
              u.id !== row.id &&
              u.email.toLowerCase() === values.email.trim().toLowerCase(),
          )
        )
          throw Error("This email is already registered.");
        if (!preview && !row.id && String(values.password || "").length < 8)
          throw Error("Use a temporary password of at least 8 characters.");
        const body: any = {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          phone: values.phone?.trim() || null,
          title: values.title?.trim() || null,
          shift: values.shift?.trim() || null,
          qualifications: values.qualifications?.trim() || null,
          emergency_contact: values.emergency_contact?.trim() || null,
        };
        if (!row.id) {
          body.role = "caregiver";
          body.password = values.password;
        }
        await mutate(
          "/users" + (row.id ? "/" + row.id : ""),
          body,
          upsert("users", {
            id: row.id,
            name: body.name,
            email: body.email,
            phone: body.phone,
            title: body.title,
            shift: body.shift,
            qualifications: body.qualifications,
            emergency_contact: body.emergency_contact,
            role: "caregiver",
            status: row.status || "active",
          }),
          row.id ? "patch" : "post",
        );
      } else if (kind === "family") {
        if (!values.parent_name?.trim() || !values.parent_email?.trim())
          throw Error("Parent full name and email are required.");
        if (!values.child_full_name?.trim() || !values.child_dob)
          throw Error("Child name and birth date are required.");
        if (values.child_dob > today())
          throw Error("Birth date cannot be in the future.");
        if (!preview && String(values.parent_password || "").length < 8)
          throw Error("Set a parent app password of at least 8 characters.");

        let assignedGroupId = num(values.child_group_id);
        if (values.new_group_name?.trim()) {
          if (preview) {
            const newGId = Date.now();
            setData((d) => ({
              ...d,
              groups: [{ id: newGId, name: values.new_group_name.trim(), description: "Classroom group" }, ...d.groups],
            }));
            assignedGroupId = newGId;
          }
        }

        const payload = {
          parent: {
            name: values.parent_name.trim(),
            email: values.parent_email.trim().toLowerCase(),
            phone: values.parent_phone?.trim() || null,
            password: values.parent_password || "Password123!",
            relationship: values.parent_relationship || "Mother",
          },
          child: {
            full_name: values.child_full_name.trim(),
            dob: values.child_dob,
            gender: values.child_gender || null,
            group_id: assignedGroupId,
            ...(!preview && values.new_group_name?.trim() ? {new_group_name: values.new_group_name.trim()} : {}),
            caregiver_id: num(values.child_caregiver_id),
            enrollment_status: "active",
            monthly_care_fee: values.monthly_care_fee ? parseFloat(values.monthly_care_fee) : 3500.00,
          },
          emergency_contacts: values.sec_contact_name?.trim() ? [
            {
              name: values.sec_contact_name.trim(),
              relationship: values.sec_contact_relationship?.trim() || "Emergency Contact",
              phone: values.sec_contact_phone?.trim() || "",
            }
          ] : [],
          care_instructions: [
            ...(values.allergy_note?.trim() ? [{ category: "allergy", instruction_text: values.allergy_note.trim() }] : []),
            ...(values.care_note?.trim() ? [{ category: "general", instruction_text: values.care_note.trim() }] : []),
          ],
        };

        if (preview) {
          const parentId = Date.now();
          const childId = parentId + 1;
          const newParent = {
            id: parentId,
            name: payload.parent.name,
            email: payload.parent.email,
            phone: payload.parent.phone,
            role: "parent",
            status: "active",
          };
          const newChild = {
            id: childId,
            full_name: payload.child.full_name,
            dob: payload.child.dob,
            gender: payload.child.gender,
            group_id: payload.child.group_id,
            caregiver_id: payload.child.caregiver_id,
            enrollment_status: "active",
            parent_name: payload.parent.name,
            parent_email: payload.parent.email,
            parent_phone: payload.parent.phone,
            parent_relationship: payload.parent.relationship,
            emergency_contacts: [
              ...(payload.parent.phone ? [{ id: Date.now() + 2, child_id: childId, name: payload.parent.name, relationship: payload.parent.relationship, phone: payload.parent.phone }] : []),
              ...payload.emergency_contacts.map((c, i) => ({ id: Date.now() + 3 + i, child_id: childId, ...c })),
            ],
            care_instructions: payload.care_instructions.map((ci, i) => ({ id: Date.now() + 10 + i, child_id: childId, ...ci })),
          };
          const newGuardian = {
            id: Date.now() + 20,
            child_id: childId,
            user_id: parentId,
            relationship: payload.parent.relationship,
            pickup_authorized: true,
          };
          setData((d) => ({
            ...d,
            users: [newParent, ...d.users],
            children: [newChild, ...d.children],
            guardians: [newGuardian, ...d.guardians],
          }));
          setToast("Enrolled new family in preview.");
          setModal(null);
          return;
        }

        await portalApi.enrollFamily(payload);
        await refresh();
        setToast(`Enrolled ${payload.child.full_name} and linked ${payload.parent.name} successfully.`);
        setModal(null);
        return;
      } else if (kind === "assign-caregiver") {
        const childIds = values.child_ids as number[];
        if (preview) {
          setData((d) => ({
            ...d,
            children: d.children.map((c) =>
              childIds.includes(c.id)
                ? { ...c, caregiver_id: row.id }
                : c.caregiver_id === row.id
                ? { ...c, caregiver_id: null }
                : c
            ),
          }));
          setToast(`Assigned ${childIds.length} students to ${row.name} (preview).`);
          setModal(null);
          return;
        }
        await portalClient.post("/children/assign-caregiver", {
          caregiver_id: row.id,
          child_ids: childIds,
          group_id: values.group_id || null,
          group_version: data.groups.find(g=>g.id===Number(values.group_id))?.version,
          child_versions: data.children.filter(c=>c.enrollment_status==='active' && (childIds.includes(c.id) || c.caregiver_id===row.id)).map(c=>({id:c.id,version:c.version})),
        });
        await refresh();
        setToast(`Updated student assignments for ${row.name} successfully.`);
        setModal(null);
        return;
      } else if (kind === "assign-child-caregiver") {
        if (preview) {
          setData((d) => ({
            ...d,
            children: d.children.map((c) =>
              c.id === row.id ? { ...c, caregiver_id: values.caregiver_id, group_id: values.group_id } : c
            ),
          }));
          setToast(`Updated assignment for ${row.full_name} (preview).`);
          setModal(null);
          return;
        }
        await portalClient.patch(`/children/${row.id}`, {
          version: row.version,
          caregiver_id: values.caregiver_id,
          group_id: values.group_id,
        });
        await refresh();
        setToast(`Updated assignment for ${row.full_name}.`);
        setModal(null);
        return;
      } else if (kind === "assign-group-caregiver") {
        if (preview) {
          setData((d) => ({
            ...d,
            groups: d.groups.map((g) => (g.id === row.id ? { ...g, lead_caregiver_id: values.lead_caregiver_id } : g)),
            children: values.assign_children && values.lead_caregiver_id
              ? d.children.map((c) => (c.group_id === row.id ? { ...c, caregiver_id: values.lead_caregiver_id } : c))
              : d.children,
          }));
          setToast(`Assigned caregiver to group ${row.name} (preview).`);
          setModal(null);
          return;
        }
        await portalClient.patch(`/groups/${row.id}`, {
          version: row.version,
          child_versions: data.children.filter(c=>c.group_id===row.id && c.enrollment_status==='active').map(c=>({id:c.id,version:c.version})),
          lead_caregiver_id: values.lead_caregiver_id,
          assign_children: values.assign_children,
        });
        await refresh();
        setToast(`Assigned caregiver to group ${row.name}.`);
        setModal(null);
        return;
      } else if (kind === "user-status") {
        const status = row.status === "active" ? "inactive" : "active";
        await mutate(
          "/users/" + row.id + "/status",
          { status },
          upsert("users", { ...row, status }),
          "patch",
        );
      } else if (kind === "child") {
        if (values.dob > today())
          throw Error("Birth date cannot be in the future.");
        const body = {
          ...(row.id ? {version:row.version} : {}),
          full_name: values.full_name.trim(),
          dob: values.dob,
          gender: values.gender,
          group_id: num(values.group_id),
          caregiver_id: num(values.caregiver_id),
          enrollment_status: values.enrollment_status,
        };
        await mutate(
          "/children" + (row.id ? "/" + row.id : ""),
          body,
          upsert("children", { id: row.id, ...body }),
          row.id ? "patch" : "post",
        );
      } else if (kind === "contact" || kind === "instruction") {
        const contact=kind==="contact";
        const child=data.children.find(c=>c.id===row.child_id)!;
        const body=contact ? {child_version:child.version,name:values.name.trim(),relationship:values.relationship.trim(),phone:values.phone.trim()} : {child_version:child.version,category:values.category,instruction_text:values.instruction_text.trim()};
        if(contact&&!/^[+0-9() -]{7,30}$/.test(values.phone.trim()))throw Error("Enter a valid contact phone number.");
        const list=contact?"emergency_contacts":"care_instructions";
        const rows=child[list]||[];
        const saved={id:row.id||Date.now(),...body};
        const updated=row.id?rows.map((r:Row)=>r.id===row.id?saved:r):[...rows,saved];
        await mutate("/children/"+(row.id?(contact?"contacts/":"instructions/")+row.id:row.child_id+(contact?"/contacts":"/instructions")),body,upsert("children",{...child,[list]:updated}),row.id?"patch":"post");
      } else if (kind === "guardian-request-review") {
        await mutate(`/children/${row.child_id}/pickup-guardians/${row.id}`, {
          decision: values.decision, version: row.version, review_note: values.review_note?.trim(),
        }, upsert("guardianRequests", {...row,status:values.decision}), "patch");
      } else if (kind === "guardian-request-create") {
        await mutate(`/children/${values.child_id}/pickup-guardians`, {
          name:values.name?.trim(),relationship:values.relationship?.trim(),phone:values.phone?.trim(),email:values.email?.trim(),
          request_key:`admin-guardian-${row.request_key}`,
        }, upsert("guardianRequests",{id:0,...values,status:"pending"}));
      } else if (kind === "guardian") {
        if (
          data.guardians.some(
            (g) => g.child_id === row.id && g.user_id === num(values.user_id),
          )
        )
          throw Error("This guardian is already linked to this child.");
        const body = {
          user_id: num(values.user_id),
          relationship: values.relationship,
          pickup_authorized: !!values.pickup_authorized,
        };
        await mutate(
          "/children/" + row.id + "/guardians",
          body,
          upsert("guardians", { id: 0, child_id: row.id, ...body }),
        );
      } else if (kind === "group") {
        const body: any = {
          ...(row.id ? {version:row.version} : {}),
          child_versions: data.children.filter(c=>c.group_id===row.id && c.enrollment_status==='active').map(c=>({id:c.id,version:c.version})),
          name: values.name.trim(),
          description: values.description || "",
          lead_caregiver_id: num(values.lead_caregiver_id),
          assign_children: !!values.assign_children,
        };
        await mutate(
          "/groups" + (row.id ? "/" + row.id : ""),
          body,
          upsert("groups", { id: row.id, ...body }),
          row.id ? "patch" : "post",
        );
        if (body.assign_children && body.lead_caregiver_id) {
          setData((prev) => ({
            ...prev,
            children: prev.children.map((c) =>
              c.group_id === row.id ? { ...c, caregiver_id: body.lead_caregiver_id } : c,
            ),
          }));
        }
      } else if (kind === "duty") {
        const body = {
          staff_id: Number(values.staff_id),
          group_id: num(values.group_id),
          starts_at: values.date + "T" + values.start + ":00+03:00",
          ends_at: values.date + "T" + values.end + ":00+03:00",
          can_attendance: !!values.can_attendance,
          can_pickup: !!values.can_pickup,
        };
        const error = dutyError(
          data.users.find((u) => u.id === body.staff_id),
          body.starts_at,
          body.ends_at,
          data.duties,
        );
        if (error) throw Error(error);
        if (!body.can_attendance && !body.can_pickup)
          throw Error("Choose at least one responsibility.");
        await mutate(
          "/portal/assignments",
          body,
          upsert("duties", { id: 0, ...body, status: "active" }),
        );
      } else if (kind === "revoke-duty") {
        await mutate(
          "/portal/assignments/" + row.id + "/revoke",
          {},
          upsert("duties", { ...row, status: "revoked" }),
          "patch",
        );
      } else if (kind === "checkin" || kind === "absent") {
        if (attendanceStatus(data, row.id, today()))
          throw Error(
            "Attendance has already changed. Refresh and review this child.",
          );
        if (
          staff &&
          !allowedAttendance(data.duties, actor!, row)
        )
          throw Error(
            "Attendance requires assignment to this child or an active attendance shift.",
          );
        const body = {
          child_id: row.id,
          event_type: kind,
          notes: values.notes || "",
        };
        await mutate(
          "/portal/attendance",
          body,
          upsert("attendance", {
            id: 0,
            ...body,
            event_time: new Date().toISOString(),
            recorded_by: actor!.id,
          }),
        );
      } else if (kind === "pickup") {
        if (
          !values.identity_confirmed ||
          !values.reason ||
          values.reason.trim().length < 12
        )
          throw Error(
            "Confirm the identity check and describe how identity was verified (at least 12 characters).",
          );
        const [adultType, adultId] = String(values.guardian_key || "").split(":");
        const userId = adultType === "user" ? Number(adultId) : null;
        const pickupId = adultType === "pickup" ? Number(adultId) : null;
        if (!(pickupId ? (data.guardianRequests || []).some(g=>g.id===pickupId && g.child_id===row.id && g.status==='approved') :
          data.guardians.some(
            (g) =>
              g.child_id === row.id &&
              g.user_id === userId &&
              g.pickup_authorized,
          )))
          throw Error("Choose an approved pickup guardian.");
        if (attendanceStatus(data, row.id, today())?.event_type !== "checkin")
          throw Error("This child is no longer checked in.");
        if (
          staff &&
          !allowedDuty(data.duties, actor!.id, row.group_id, "pickup")
        )
          throw Error(
            "Your current shift does not permit pickup for this child.",
          );
        const body = {
          child_id: row.id,
          ...(pickupId ? {pickup_guardian_id:pickupId} : {guardian_user_id:userId}),
          method: "manual",
          identity_confirmed: true,
          reason: values.reason.trim(),
        };
        await mutate("/portal/checkout", body, (d) => ({
          ...d,
          attendance: [
            {
              id: Date.now(),
              child_id: row.id,
              event_type: "checkout",
              event_time: new Date().toISOString(),
              recorded_by: actor!.id,
            },
            ...d.attendance,
          ],
          verifications: [
            {
              id: Date.now(),
              ...body,
              result: "manual_fallback",
              verified_by: actor!.id,
              verified_at: new Date().toISOString(),
            },
            ...d.verifications,
          ],
        }));
      } else if (kind === "event") {
        const body = {
          ...(row.id ? { version: row.version } : {}),
          title: values.title.trim(),
          event_date: values.event_date,
          event_time: values.event_time || null,
          event_type: values.event_type,
          description: values.description || "",
        };
        await mutate(
          "/events" + (row.id ? "/" + row.id : ""),
          body,
          upsert("events", {
            ...row,
            ...body,
            cancelled: row.cancelled || false,
          }),
          row.id ? "patch" : "post",
        );
      } else if (kind === "cancel-event") {
        await mutate("/events/"+row.id,{version:row.version},upsert("events",{...row,cancelled:true}),"delete");
      } else if (kind === "announcement") {
        const body = {
          title: values.title.trim(),
          body: values.body,
          announcement_type: values.announcement_type || "general",
          request_key: row.request_key,
          audience: values.target_group_id ? "group" : "all",
          target_group_id: num(values.target_group_id),
        };
        await mutate(
          "/announcements",
          body,
          upsert("announcements", {
            id: 0,
            ...body,
            created_at: new Date().toISOString(),
          }),
        );
      } else if (kind === "message") {
        const body = {
          recipient_id: Number(values.recipient_id),
          subject: values.subject || "",
          body: values.body,
        };
        await mutate(
          "/messages",
          body,
          upsert("messages", {
            id: 0,
            ...body,
            sender_id: actor!.id,
            created_at: new Date().toISOString(),
          }),
        );
      } else if (kind === "product") {
        const body = {
          ...(row.id ? { version: row.version } : {}),
          name: values.name.trim(),
          price: Number(values.price),
          stock_qty: Number(values.stock_qty),
          available: !!values.available,
          description: values.description || "",
          image_url: values.image_url ? values.image_url.trim() : null,
        };
        if (
          !Number.isInteger(body.stock_qty) ||
          body.stock_qty < 0 ||
          !Number.isFinite(body.price) ||
          body.price < 0
        )
          throw Error("Enter a valid price and whole-number stock quantity.");
        await mutate(
          "/store/products" + (row.id ? "/" + row.id : ""),
          body,
          upsert("products", { id: row.id, ...body }),
          row.id ? "patch" : "post",
        );
      } else if (kind === "order") {
        const body: any = { version: row.version, order_status: values.order_status };
        if (values.payment_status) body.payment_status = values.payment_status;
        await mutate(
          "/store/orders/" + row.id + "/status",
          body,
          upsert("orders", { ...row, ...body }),
          "patch",
        );
      } else if (kind === "edit-settings") {
        const body = {
          version: row.version,
          name: values.name?.trim(),
          license_number: values.license_number?.trim(),
          contact_email: values.contact_email?.trim(),
          contact_phone: values.contact_phone?.trim(),
          address: values.address?.trim(),
        };
        const updated = await portalApi.updateDaycareSettings(body);
        setData((old) => ({ ...old, daycare: updated }));
        setToast("Daycare settings updated successfully.");

      }
      setModal(null);
    } catch (error: any) {
      setFormError(
        error.response ? apiError(error) : error.message || "Unable to save.",
      );
    } finally {
      setSaving(false);
    }
  };
  const visibleData = useMemo(() => {
    if (!staff || !preview) return data;
    const hasActiveDuties = data.duties.some(
      (d) => d.staff_id === actor!.id && d.status === "active",
    );
    const children = data.children.filter(
      (c) =>
        c.caregiver_id === actor!.id ||
        data.duties.some(
          (d) =>
            d.staff_id === actor!.id &&
            d.status === "active" &&
            (!d.group_id || d.group_id === c.group_id),
        ) ||
        !hasActiveDuties,
    );
    const ids = new Set(children.map((c) => c.id));
    return {
      ...data,
      children,
      guardians: data.guardians.filter((g) => ids.has(g.child_id)),
      attendance: data.attendance.filter((a) => ids.has(a.child_id)),
      duties: data.duties.filter((d) => d.staff_id === actor!.id),
    };
  }, [data, actor, staff, preview]);
  const ctx: PageContext = {
    data: visibleData,
    date,
    query,
    staff,
    actor: actor || { id: 0 },
    preview,
    go,
    open,
  };
  const download = () => { const m=metrics(visibleData,date); downloadRecords([{id:1,date,enrolled:m.total,present:m.present,collected:m.collected,absent:m.absent,not_marked:m.pending,reports_submitted:m.submitted,reports_missing:m.missing}], 'ankelba-summary-'+date+(preview?'-preview':'')); };
  if (checking)
    return (
      <div
        className="ankelba-portal p-login-card"
        style={{ minHeight: "100vh" }}
      >
        <p>Opening your workspace…</p>
      </div>
    );
  if (!actor || !["admin", "caregiver"].includes(actor.role))
    return (
      <div className="ankelba-portal p-login">
        <div className="p-login-story">
          <Brand />
          <span className="p-eyebrow">A LITTLE CLOSER. EVERY DAY.</span>
          <h1>Thoughtful care starts with a connected team.</h1>
          <p>
            Your children, families and caregivers. One calm place to keep
            everything together.
          </p>
          <div className="p-legend">
            <span>
              <i className="p-dot" />
              Care with confidence
            </span>
            <span>
              <i className="p-dot gold" />
              Grow together
            </span>
          </div>
        </div>
        <div className="p-login-card">
          <div>
            <span className="p-eyebrow" style={{ letterSpacing: "1.2px", color: "#BD4264", fontWeight: 700 }}>
              DAYCARE WORKSPACE
            </span>
            <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#10263D", margin: "8px 0 6px" }}>
              Welcome back.
            </h1>
            <p style={{ color: "#626872", fontSize: "14px", marginBottom: "18px" }}>
              Sign in to manage daycare operations, classrooms, and staff.
            </p>
            <form onSubmit={login}>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@daycare.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your password"
                  required
                />
              </label>
              {loginError && (
                <div role="alert" className="p-error">
                  {loginError}
                </div>
              )}
              <Button type="submit" disabled={loginBusy}>
                {loginBusy ? "Signing in…" : "Sign in to your workspace"}
                <Icon name="arrow" size={16} />
              </Button>
            </form>
            <footer>
              <a href="/">Back to Ankelba</a>
              <a href="/app">Parent sign in</a>
              <a href="/application-status">Check application status</a>

            </footer>
          </div>
        </div>
      </div>
    );
  const pageComponent =
    staff && ["reports","health","communication","events"].includes(selected) ? <CaregiverPage ctx={ctx} page={selected}/> : selected === "dashboard" ? (
      <> {!staff && !preview && <SetupChecklist data={visibleData}/>}<Overview {...ctx} /></>
    ) : selected === "analytics" ? (
      <Analytics {...ctx} />
    ) : selected === "finances" ? (
      <DaycareFinances ctx={ctx} />
    ) : ["caregivers", "users"].includes(selected) ? (
      <Caregivers {...ctx} />
    ) : selected === "children" ? (
      <Children {...ctx} />
    ) : selected === "groups" ? (
      <Groups {...ctx} />
    ) : selected === "front-desk" ? (
      <Duties {...ctx} />
    ) : ["attendance", "workspace"].includes(selected) ? (
      <Attendance {...ctx} />
    ) : selected === "reports" ? (
      <Reports {...ctx} />
    ) : (
      <Monitoring {...ctx} page={selected} />
    );
  return (
    <div className="ankelba-portal">
      <aside
        className={"p-sidebar " + (menu ? "open" : "")}
        aria-label="Workspace navigation"
      >
        <Brand
          daycareName={actor?.daycare_name}
          plan={data.daycare?.subscription_plan || actor?.subscription_plan}
        />
        {navigation.map((group) => (
          <div key={group.group}>
            <div className="p-nav-group">{group.group}</div>
            <nav aria-label={group.group}>
              {group.items.map(([key, name, icon]) => (
                <a
                  href={base + "/" + key}
                  key={key}
                  className={"p-nav-link " + (selected === key ? "active" : "")}
                  aria-current={selected === key ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    go(key);
                  }}
                >
                  <Icon name={icon} size={18} />
                  {name}
                </a>
              ))}
            </nav>
          </div>
        ))}
        <div className="p-sidebar-foot">
          <div className="p-care-note">
            <Icon name="leaf" />
            <div>
              Little moments.
              <br />
              <strong>Lasting connections.</strong>
            </div>
          </div>
          <button
            className="p-nav-link"
            style={{ border: 0, width: "100%", background: "transparent" }}
            onClick={signOut}
          >
            <Icon name="logout" size={17} />
            {preview ? "Leave preview" : "Sign out"}
          </button>
        </div>
      </aside>
      <main className="p-workspace">
        <header className="p-topbar">
          <button
            className="p-icon-button p-menu-toggle"
            aria-label="Toggle navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Icon name={menu ? "close" : "menu"} />
          </button>
          <div className="p-breadcrumb">
            Ankelba <span>/</span>{" "}
            <strong>{staff ? "Staff workspace" : "Administration"}</strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", marginRight: 16 }}>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, "", "/");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", padding: "5px 12px", borderRadius: 8, background: "#f0ece1", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="globe" size={13} /> Ankelba website
            </a>
            <a
              href="/app"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, "", "/app");
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)", padding: "5px 12px", borderRadius: 8, background: "#f0ece1", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="smartphone" size={13} /> Parent App
            </a>
          </div>
          <div className="p-top-actions">
            {!["dashboard","analytics"].includes(selected) && <label className="p-search">
              <Icon name="search" size={17} />
              <input
                aria-label="Search this page"
                placeholder="Search this page…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>}
            <button
              className="p-icon-button"
              aria-label="Refresh data"
              onClick={() =>
                preview ? setToast("Preview is up to date.") : refresh()
              }
            >
              <Icon name="refresh" size={17} />
            </button>
            <div className="p-admin-person">
              <Person
                name={actor.name}
                sub={staff ? "Caregiver" : "Daycare administrator"}
              />
            </div>
          </div>
        </header>
        <div className="p-content" key={selected}>
          {broadcast?.active && broadcast?.message && (
            <div
              style={{
                background:
                  broadcast.level === "alert"
                    ? "#FEF2F2"
                    : broadcast.level === "warning"
                    ? "#FFFBEB"
                    : "#EFF6FF",
                border: `1.5px solid ${
                  broadcast.level === "alert"
                    ? "#F87171"
                    : broadcast.level === "warning"
                    ? "#FCD34D"
                    : "#93C5FD"
                }`,
                color:
                  broadcast.level === "alert"
                    ? "#991B1B"
                    : broadcast.level === "warning"
                    ? "#92400E"
                    : "#1E40AF",
                padding: "12px 18px",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 20,
                boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
              }}
            >
              <span style={{ fontSize: 22 }}>
                {broadcast.level === "alert" ? "🚨" : broadcast.level === "warning" ? "⚠️" : "📢"}
              </span>
              <div style={{ flex: 1 }}>
                <strong style={{ display: "block", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Platform Notice ({broadcast.level})
                </strong>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{broadcast.message}</span>
              </div>
            </div>
          )}
          {preview && (
            <div className="p-preview">
              <span>
                <strong>Sample preview</strong> · Changes stay in this preview and reset when you leave.
              </span>
              <a
                href={
                  staff
                    ? "/staff/workspace"
                    : "/admin/dashboard"
                }
              >
                {staff ? "Staff workspace" : "Production route"} ↗
              </a>
            </div>
          )}
          <div className="p-page-head">
            <div>
              <span className="p-eyebrow">
                {selected === "dashboard"
                  ? "WELCOME TO YOUR DAYCARE"
                  : staff
                    ? "FRONT-DESK WORKSPACE"
                    : "CARE, CONNECTED"}
              </span>
              <h1>
                {selected === "dashboard" ? "A good day starts here." : title}
              </h1>
              <p>{subtitles[selected]}</p>
            </div>
            <div className="p-head-actions">
              <input
                aria-label="Selected date"
                type="date"
                value={date}
                disabled={staff}
                onInput={(e) => { if(e.currentTarget.value) setDate(e.currentTarget.value); }}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
              {selected === "dashboard" && (
                <Button variant="secondary" icon="download" onClick={download}>
                  Export summary
                </Button>
              )}
              {selected === "dashboard" && (
                <Button icon="plus" onClick={() => open("family")}>
                  Enroll Family
                </Button>
              )}
            </div>
          </div>
          {loadError ? (
            <Card>
              <div role="alert" className="p-error">
                {loadError}
              </div>
              <Button onClick={refresh}>Retry loading</Button>
            </Card>
          ) : loading ? (
            <Card>
              <p role="status">Loading your daycare records…</p>
            </Card>
          ) : (
            <PageTransition page={selected}>{!staff && !preview && selected === "settings" && <DaycareSubscription/>}{pageComponent}</PageTransition>
          )}
          <p className="p-kpi-note">
            Ankelba · Connect, share, nurture.{" "}
            <span style={{ float: "right" }}>Times in Africa/Addis_Ababa</span>
          </p>
        </div>
      </main>
      {toast && (
        <div role="status" className="p-toast">
          {toast}
        </div>
      )}
      {modal && (
        <PortalModal
          modal={modal}
          ctx={ctx}
          busy={saving}
          error={formError}
          save={save}
          close={close}
        />
      )}
    </div>
  );
}

function PortalModal({
  modal,
  ctx,
  busy,
  error,
  save,
  close,
}: {
  modal: { kind: string; row: Row };
  ctx: PageContext;
  busy: boolean;
  error: string;
  save: (v: Record<string, any>) => void;
  close: () => void;
}) {
  const { kind, row } = modal;
  const { data, date, preview } = ctx;
  let fields: FieldSpec[] = [];
  let initial: Record<string, any> = { ...row };
  let title = "Review record";
  let submit = preview ? "Save in preview" : "Save changes";
  let detail: React.ReactNode = null;
  const field = (
    key: string,
    label: string,
    type = "text",
    required = true,
    extra: Partial<FieldSpec> = {},
  ): FieldSpec => ({ key, label, type, required, ...extra });
  if (kind === "family") {
    return (
      <FamilyEnrollmentModal
        ctx={ctx}
        busy={busy}
        error={error}
        save={save}
        close={close}
      />
    );
  } else if (kind === "assign-caregiver") {
    return (
      <AssignCaregiverModal
        caregiver={row}
        data={data}
        busy={busy}
        error={error}
        close={close}
        onSave={(child_ids, group_id) => save({ child_ids, group_id })}
      />
    );
  } else if (kind === "assign-child-caregiver") {
    return (
      <AssignChildModal
        child={row}
        data={data}
        busy={busy}
        error={error}
        close={close}
        onSave={(caregiver_id, group_id) => save({ caregiver_id, group_id })}
      />
    );
  } else if (kind === "assign-group-caregiver") {
    return (
      <AssignGroupCaregiverModal
        group={row}
        data={data}
        busy={busy}
        error={error}
        close={close}
        onSave={(lead_caregiver_id, assign_children) => save({ lead_caregiver_id, assign_children })}
      />
    );
  } else if (kind === "caregiver" || (kind === "user" && row.role === "caregiver")) {
    title = row.id ? "Edit Caregiver Profile" : "Register Caregiver";
    initial = {
      role: "caregiver",
      ...row,
    };
    fields = [
      field("name", "Full name"),
      field("email", "Email address", "email"),
      field("phone", "Phone number", "tel", false, {
        hint: "Primary contact phone number for staff communication",
      }),
      field("title", "Job title / Designation", "text", false, {
        hint: "e.g., Lead Infant Teacher, Preschool Caregiver, Assistant Teacher, Nurse",
      }),
      field("shift", "Working hours / Shift", "text", false, {
        wide: true,
        hint: "e.g., Morning Shift (07:30 – 15:30) or Full Day (08:00 – 17:00)",
      }),
      field("qualifications", "Qualifications & Certifications", "textarea", false, {
        wide: true,
        hint: "e.g., Early Childhood Education Diploma, CPR & First Aid Certified",
      }),
      field("emergency_contact", "Staff emergency contact", "text", false, {
        wide: true,
        hint: "Name and phone number of person to call in an emergency",
      }),
    ];
    if (!row.id && !preview)
      fields.push(
        field("password", "Temporary account password", "password", true, {
          wide: true,
          hint: "At least 8 characters. Share securely with the caregiver.",
        }),
      );
  } else if (kind === "user") {
    title = (row.id ? "Edit " : "Register ") + (row.role === "parent" ? "parent / guardian" : "caregiver");
    fields = [
      field("name", "Full name"),
      field("email", "Email address", "email"),
    ];
    if (!row.id && !preview)
      fields.push(
        field("password", "Temporary password", "password", true, {
          wide: true,
          hint: "At least 8 characters. Share securely with the account owner.",
        }),
      );
  } else if (kind === "child") {
    title = row.id ? "Edit child profile" : "Register a child";
    initial = {
      gender: "female",
      enrollment_status: "active",
      ...row,
      dob: dayOf(row.dob),
    };
    fields = [
      field("full_name", "Child’s full name"),
      field("dob", "Date of birth", "date", true, { max: today() }),
      field("gender", "Gender", "select", true, {
        options: ["female", "male", "other"].map((v) => ({
          value: v,
          label: label(v),
        })),
      }),
      field("enrollment_status", "Enrollment", "select", true, {
        options: ["active", "waitlist", "inactive"].map((v) => ({
          value: v,
          label: label(v),
        })),
      }),
      field("group_id", "Group", "select", false, {
        options: options(data.groups),
      }),
      field("caregiver_id", "Assigned caregiver", "select", false, {
        options: options(
          data.users.filter(
            (u) => u.role === "caregiver" && u.status === "active",
          ),
        ),
      }),
    ];
    detail = (
      <div className="p-notice">
        Register the child first, then link their parents and approved pickup
        guardians from the children list.
      </div>
    );
  } else if (kind === "child-profile") {
    return <Modal title={row.full_name + " · profile"} onClose={close}>
      <Person name={row.full_name} sub={"Born "+dayOf(row.dob)+" · "+label(row.enrollment_status)} />
      <section className="p-profile-section">
        <div className="p-card-head">
          <h3>Classroom & Assigned Caregiver</h3>
          {!ctx.staff && <Button variant="secondary" onClick={() => ctx.open("assign-child-caregiver", row)}>
            Change Assignment
          </Button>}
        </div>
        <div className="p-profile-row" style={{ display: "flex", gap: 32 }}>
          <div>
            <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", fontWeight: 700 }}>Classroom Group</div>
            <strong style={{ fontSize: 14, color: "var(--navy)" }}>{groupName(data, row.group_id) || "Not assigned to a group"}</strong>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", fontWeight: 700 }}>Primary Caregiver</div>
            <strong style={{ fontSize: 14, color: "var(--navy)" }}>{userName(data, row.caregiver_id) || "Unassigned"}</strong>
          </div>
        </div>
      </section>
      <section className="p-profile-section"><h3>Family & pickup</h3>
        <div style={{marginBottom: 8}}>
          <strong style={{fontSize: 12, color: '#6B7280', textTransform: 'uppercase'}}>Registered Parents</strong>
          {data.guardians.filter(g=>g.child_id===row.id).map(g=><div className="p-profile-row" key={g.id}><Person name={userName(data,g.user_id)} sub={g.relationship}/><Badge value={g.pickup_authorized?"Approved":"Not authorized"} tone={g.pickup_authorized?"green":"quiet"}/></div>)}
          {!data.guardians.some(g=>g.child_id===row.id)&&<p style={{fontSize: 13, color: '#9CA3AF'}}>No linked parent accounts.</p>}
        </div>
        <div style={{marginTop: 12, marginBottom: 8}}>
          <strong style={{fontSize: 12, color: '#6B7280', textTransform: 'uppercase'}}>Authorized Pickup Contacts</strong>
          {(data.guardianRequests||[]).filter(g=>g.child_id===row.id).map(g=><div className="p-profile-row" key={'req-'+g.id}><div><Person name={g.name} sub={`${g.relationship} · ${g.phone}`}/><Badge value={g.status==='approved'?'Approved':g.status==='pending'?'Pending review':g.status==='rejected'?'Rejected':'Revoked'} tone={g.status==='approved'?'green':g.status==='pending'?'gold':'red'}/></div>{!ctx.staff && ['pending','approved'].includes(g.status) && <Button variant="quiet" onClick={()=>ctx.open("guardian-request-review",g)}>{g.status==='approved'?'Revoke':'Review'}</Button>}</div>)}
          {!(data.guardianRequests||[]).some(g=>g.child_id===row.id)&&<p style={{fontSize: 13, color: '#9CA3AF'}}>No additional pickup contacts.</p>}
        </div>
        {!ctx.staff && <div style={{display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap'}}>
          <Button variant="secondary" onClick={()=>ctx.open("guardian",row)}>Link parent account</Button>
          <Button variant="secondary" onClick={()=>ctx.open("guardian-request-create",{id:0,child_id:row.id})}>Add pickup contact</Button>
        </div>}
      </section>
      <section className="p-profile-section"><div className="p-card-head"><h3>Emergency contacts</h3>{!ctx.staff && <Button variant="secondary" icon="plus" onClick={()=>ctx.open("contact",{id:0,child_id:row.id})}>Add contact</Button>}</div>
        {(row.emergency_contacts||[]).map((c:Row)=><div className="p-profile-row" key={c.id}><Person name={c.name} sub={c.relationship+" · "+c.phone}/>{!ctx.staff && <Button variant="quiet" onClick={()=>ctx.open("contact",{...c,child_id:row.id})}>Edit</Button>}</div>)}
        {!row.emergency_contacts?.length&&<p>No emergency contacts recorded.</p>}
      </section>
      <section className="p-profile-section"><div className="p-card-head"><h3>Care instructions</h3>{!ctx.staff && <Button variant="secondary" icon="plus" onClick={()=>ctx.open("instruction",{id:0,child_id:row.id})}>Add instruction</Button>}</div>
        {(row.care_instructions||[]).map((c:Row)=><div className="p-profile-row" key={c.id}><div><Badge value={c.category}/><p>{c.instruction_text}</p></div>{!ctx.staff && <Button variant="quiet" onClick={()=>ctx.open("instruction",{...c,child_id:row.id})}>Edit</Button>}</div>)}
        {!row.care_instructions?.length&&<p>No care instructions recorded.</p>}
      </section>
      <div className="p-dialog-footer"><Button onClick={close}>Done</Button></div>
    </Modal>;
  } else if (kind === "contact") {
    title=row.id?"Edit emergency contact":"Add emergency contact";
    fields=[field("name","Full name"),field("relationship","Relationship"),field("phone","Phone number","tel",true,{wide:true})];
  } else if (kind === "instruction") {
    title=row.id?"Edit care instruction":"Add care instruction";
    fields=[field("category","Category","select",true,{wide:true,options:["allergy","dietary","medical_note","general"].map(value=>({value,label:label(value)}))}),field("instruction_text","Instruction","textarea",true,{wide:true})];
  } else if (kind === "guardian-request-create") {
    title = "Add pickup contact for review";
    initial = {child_id:row.child_id?String(row.child_id):""};
    fields = [field("child_id","Child","select",true,{options:data.children.map(c=>({value:String(c.id),label:c.full_name}))}),
      field("name","Adult full name","text",true),field("relationship","Relationship","text",true),
      field("phone","Phone number","tel",true),field("email","Email (optional)","email",false)];
    detail = <div className="p-notice">This contact receives pickup permission only after review. No app account is created.</div>;
    submit = "Save pending contact";
  } else if (kind === "guardian-request-review") {
    title = (row.status === "approved" ? "Revoke pickup permission" : "Review pickup request") + " · " + row.name;
    initial = {decision:row.status==='approved'?'revoked':'',review_note:''};
    fields = [field("decision","Decision","select",true,{options:row.status==='approved'?[{value:'revoked',label:'Revoke pickup permission'}]:[{value:'approved',label:'Approve pickup permission'},{value:'rejected',label:'Reject request'}]}),
      field("review_note","Review reason and identity check","textarea",true,{wide:true,hint:"Record your review and identity/authorization check, or the reason for rejection/revocation (at least 12 characters)."})];
    detail = <div className="p-notice">{childName(data,row.child_id)} · {row.relationship} · {row.phone}<p>Approval permits pickup; it does not create a parent-app login. Identity must still be checked for every collection.</p></div>;
    submit = "Record decision";
  } else if (kind === "guardian") {
    title = "Link guardian to " + row.full_name;
    initial = { pickup_authorized: false };
    fields = [
      field("user_id", "Registered parent / guardian", "select", true, {
        wide: true,
        options: options(
          data.users.filter(
            (u) => u.role === "parent" && u.status === "active",
          ),
        ),
      }),
      field("relationship", "Relationship"),
      field(
        "pickup_authorized",
        "Authorize this adult for pickup",
        "checkbox",
        false,
      ),
    ];
    detail = (
      <div className="p-notice">
        A linked account can access this child’s information. Pickup
        authorization is a separate permission.
      </div>
    );
  } else if (kind === "group") {
    title = row.id ? "Edit group" : "Create a group";
    initial = {
      name: row.name || "",
      description: row.description || "",
      lead_caregiver_id: row.lead_caregiver_id ? String(row.lead_caregiver_id) : "",
      assign_children: true,
    };
    fields = [
      field("name", "Group name", "text", true, { wide: true }),
      field("description", "Description", "textarea", false, { wide: true }),
      field("lead_caregiver_id", "Lead Teacher / Assigned Caregiver", "select", false, {
        wide: true,
        options: [
          { value: "", label: "No lead teacher assigned" },
          ...data.users
            .filter((u) => u.role === "caregiver" && u.status === "active")
            .map((u) => ({ value: String(u.id), label: `${u.name}${u.title ? ` (${u.title})` : ""}` })),
        ],
        hint: "Select the primary educator responsible for this classroom group.",
      }),
      field("assign_children", "Assign all active children in this group to this caregiver", "checkbox", false, {
        wide: true,
        hint: "Automatically sets this caregiver as the primary caregiver for all students in this group.",
      }),
    ];
  } else if (kind === "duty") {
    title = "Assign front-desk duty";
    initial = {
      date,
      start: "07:00",
      end: "13:00",
      can_attendance: true,
      can_pickup: false,
    };
    fields = [
      field("staff_id", "Caregiver", "select", true, {
        options: options(
          data.users.filter(
            (u) => u.role === "caregiver" && u.status === "active",
          ),
        ),
      }),
      field("date", "Duty date", "date"),
      field("start", "Start time · Addis Ababa", "time", true, {
        hint: "Standard shifts: Morning 07:30 or Afternoon 13:00",
      }),
      field("end", "End time · Addis Ababa", "time", true, {
        hint: "Standard shifts: Morning 13:00 or Afternoon 18:30",
      }),
      field("group_id", "Group scope", "select", false, {
        wide: true,
        options: options(data.groups),
        hint: "Leave unselected for all daycare groups.",
      }),
      field("can_attendance", "Record attendance", "checkbox", false),
      field("can_pickup", "Verify and complete pickups", "checkbox", false),
    ];
  } else if (["user-status", "revoke-duty"].includes(kind)) {
    title =
      kind === "user-status"
        ? (row.status === "active" ? "Deactivate" : "Activate") + " " + row.name
        : "Revoke front-desk duty";
    detail = (
      <div className="p-notice">
        {kind === "user-status"
          ? "The account’s access will reflect the new status. Existing records stay available."
          : "This staff member will lose this assignment’s attendance and pickup permissions."}
      </div>
    );
    submit = preview ? "Confirm in preview" : "Confirm change";
  } else if (kind === "checkin" || kind === "absent") {
    title =
      (kind === "checkin" ? "Check in " : "Mark absent: ") + row.full_name;
    fields = [
      field("notes", "Note (optional)", "textarea", false, { wide: true }),
    ];
    detail = (
      <div className="p-notice">
        Attendance is recorded for today under your staff account.
      </div>
    );
    submit = preview ? "Record in preview" : "Record attendance";
  } else if (kind === "pickup") {
    title = "Verify pickup · " + row.full_name;
    const guardians = data.guardians.filter(
      (g) =>
        g.child_id === row.id &&
        g.pickup_authorized &&
        data.users.some((u) => u.id === g.user_id && u.status === "active"),
    );
    initial = {
      guardian_key: "",
      identity_confirmed: false,
      reason: "",
    };
    fields = [
      field(
        "guardian_key",
        "Approved adult collecting this child",
        "select",
        true,
        {
          wide: true,
          options: [...guardians.map((g) => ({
            value: `user:${g.user_id}`,
            label: userName(data, g.user_id) + " · " + g.relationship,
          })), ...(data.guardianRequests || []).filter(g=>g.child_id===row.id && g.status==='approved').map(g=>({value:`pickup:${g.id}`,label:`${g.name} · ${g.relationship} (pickup contact)`}))],
        },
      ),
      field("reason", "Manual identity check performed (min. 12 chars)", "textarea", true, {
        wide: true,
        hint: "Describe verification method for audit trail (e.g. verified photo ID / parent signature). Minimum 12 characters.",
      }),
      field(
        "identity_confirmed",
        "I checked this adult’s identity and pickup authorization",
        "checkbox",
        false,
        { wide: true },
      ),
    ];
    detail = (
      <>
        <div className="p-pickup-step">
          <span>
            <Icon name="check" size={17} />
          </span>
          <div>
            <strong>Child selected</strong>
            <p>{row.full_name} · Currently at daycare</p>
          </div>
        </div>
        <div className="p-pickup-step pending">
          <span>
            <Icon name="shield" size={17} />
          </span>
          <div>
            <strong>Verify the adult, then confirm release</strong>
            <p>
              Biometric device connection is pending. The manual check and
              checkout are recorded together.
            </p>
          </div>
        </div>
      </>
    );
    submit = preview
      ? "Preview verified checkout"
      : "Verify & complete checkout";
  } else if (kind === "event") {
    title = row.id ? "Edit daycare event" : "Create daycare event";
    initial = {
      event_type: "activity_day",
      ...row,
      event_date: dayOf(row.event_date) || date,
    };
    fields = [
      field("title", "Title", "text", true, { wide: true }),
      field("event_date", "Date", "date"),
      field("event_time", "Time", "time", false),
      field("event_type", "Type", "select", true, {
        wide: true,
        options: [
          "meeting",
          "holiday",
          "activity_day",
          "special_program",
          "closing_date",
        ].map((v) => ({ value: v, label: label(v) })),
      }),
      field("description", "Description", "textarea", false, { wide: true }),
    ];
  } else if (kind === "cancel-event") {
    title="Cancel daycare event";
    detail=<p>Cancel “{row.title}” for families and caregivers? It will no longer appear in upcoming events.</p>;
    fields=[]; submit="Cancel event";
  } else if (kind === "announcement") {
    title = "New announcement";
    initial = { announcement_type: "general" };
    fields = [
      field("title", "Title", "text", true, { wide: true }),
      field("body", "Message", "textarea", true, { wide: true }),
      field("announcement_type", "Category", "select", true, {
        options: ["general", "alert", "meal_plan"].map((v) => ({
          value: v,
          label: label(v),
        })),
      }),
      field("target_group_id", "Group audience", "select", false, {
        options: options(data.groups),
        hint: "Leave unselected to publish to all families and staff.",
      }),
    ];
    submit = preview ? "Publish in preview" : "Publish announcement";
  } else if (kind === "message") {
    title = "Write a message";
    fields = [
      field("recipient_id", "Recipient", "select", true, {
        wide: true,
        options: options(
          data.users.filter(
            (u) => u.id !== ctx.actor.id && u.status === "active",
          ),
        ),
      }),
      field("subject", "Subject", "text", false, { wide: true }),
      field("body", "Message", "textarea", true, { wide: true }),
    ];
    submit = preview ? "Send in preview" : "Send message";
  } else if (kind === "product") {
    title = row.id ? "Edit product" : "Add daycare product";
    initial = { available: true, stock_qty: 0, image_url: "", ...row };
    fields = [
      field("name", "Product name", "text", true, { wide: true }),
      field("price", "Price (ETB)", "number", true, { min: "0" }),
      field("stock_qty", "Stock quantity", "number", true, { min: "0" }),
      field("image_url", "Product picture / Image URL", "text", false, {
        wide: true,
        hint: "Direct photo or illustration web link",
      }),
      field("available", "Available in the store", "checkbox", false, {
        wide: true,
      }),
      field("description", "Description", "textarea", false, { wide: true }),
    ];
  } else if (kind === "order") {
    title = "Update order #ANK-" + row.id;
    initial = {
      order_status: row.order_status || "placed",
      payment_status: row.payment_status || "unpaid",
    };
    fields = [
      field("order_status", "Fulfillment status", "select", true, {
        wide: true,
        options: [row.order_status,...(({placed:["confirmed","cancelled"],confirmed:["ready_for_pickup","cancelled"],ready_for_pickup:["collected","cancelled"]} as Record<string,string[]>)[row.order_status] || [])].filter(v=>v===row.order_status || v!=="cancelled" || Number(row.total)===0 || !["paid","pending"].includes(row.payment_status)).map(v=>({value:v,label:label(v)})),
      }),
      field("payment_status", "Payment status", "select", true, {
        wide: true,
        options: [
          { value: "unpaid", label: "Unpaid (Pending daycare collection)" },
          { value: "paid", label: row.payment_method==='demo' ? "Paid (DEMO simulation; no money received)" : row.payment_method==='no_charge' ? "Paid (No charge)" : "Paid (Received at daycare)" },
          { value: "failed", label: "Payment failed" },
        ].filter(option=>row.order_status==="cancelled" || row.payment_status==="paid" ? option.value===row.payment_status : true),
      }),
    ];
    detail = (
      <div className="p-notice">
        {row.payment_method==='demo' && <p>DEMO payment · no money transferred. Reference: {row.payment_reference}</p>}
        Unpaid and zero-total cancellations restore reserved stock. Collected orders are final; payment reversals require a separate refund workflow.<br/>Order Total: <strong>{money(row.total)}</strong> · Placed by {userName(data, row.parent_id)}
      </div>
    );
  } else if (kind === "edit-settings") {
    title = "Edit Daycare Center Profile";
    initial = {
      name: data.daycare?.name || row.name || "",
      license_number: data.daycare?.license_number || row.license_number || "",
      contact_email: data.daycare?.contact_email || row.contact_email || "",
      contact_phone: data.daycare?.contact_phone || row.contact_phone || "",
      address: data.daycare?.address || row.address || "",
    };
    fields = [
      field("name", "Center Legal Name", "text", true, { wide: true }),
      field("license_number", "Official License Number", "text", false, { wide: true }),
      field("contact_email", "Official Contact Email", "text", true),
      field("contact_phone", "Official Contact Phone", "text", false),
      field("address", "Physical Center Address", "text", false, { wide: true }),
    ];
    submit = "Save Center Profile";
  } else if (kind === "child-profile") {
    const guardian = data.guardians.find((g) => g.child_id === row.id);
    const parentUser = guardian ? data.users.find((u) => u.id === guardian.user_id) : null;
    const parentName = row.parent_name || parentUser?.name || "Unlinked";
    const parentEmail = row.parent_email || parentUser?.email || "—";
    const parentRel = row.parent_relationship || guardian?.relationship || "Parent / Guardian";
    const group = data.groups.find((g) => g.id === row.group_id)?.name || "Unassigned Group";
    const allergies = (row.care_instructions || []).filter((ci: any) => ci.category === "allergy");
    const dietary = (row.care_instructions || []).filter((ci: any) => ci.category === "dietary");
    const emergencyContacts = row.emergency_contacts || [];

    return (
      <Modal title={`Child & Family Profile · ${row.full_name}`} onClose={close}>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "4px 0" }}>
          <div style={{ background: "#F8FAF8", padding: "14px 16px", borderRadius: "12px", border: "1px solid #E5E9E2" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px 0", color: "#1D2A1F", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="child" size={15} /> Child Information
            </h3>
            <div className="p-detail-grid">
              <div><small>Full Name</small><p>{row.full_name}</p></div>
              <div><small>Date of Birth</small><p>{dayOf(row.dob)}</p></div>
              <div><small>Gender</small><p style={{ textTransform: "capitalize" }}>{row.gender || "—"}</p></div>
              <div><small>Classroom Group</small><p><Badge value={group} tone="green" /></p></div>
              <div><small>Enrollment Status</small><p><Badge value={row.enrollment_status || "active"} tone="green" /></p></div>
            </div>
          </div>

          <div style={{ background: "#F5F8FB", padding: "14px 16px", borderRadius: "12px", border: "1px solid #E1E8F0" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px 0", color: "#162D42", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="people" size={15} /> Parent & Guardian Account
            </h3>
            <div className="p-detail-grid">
              <div><small>Parent Name</small><p><strong>{parentName}</strong> {parentRel ? `(${parentRel})` : ""}</p></div>
              <div><small>Account Email</small><p>{parentEmail}</p></div>
              <div><small>Pickup Authorized</small><p><Badge value={guardian?.pickup_authorized ? "approved" : "pending"} tone="green" /></p></div>
            </div>
          </div>

          <div style={{ background: "#FDF8F0", padding: "14px 16px", borderRadius: "12px", border: "1px solid #F5E8D0" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px 0", color: "#4A3B18", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="alert" size={15} /> Food Allergies & Dietary Restrictions
            </h3>
            {allergies.length > 0 || dietary.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {allergies.map((a: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Badge value="Allergy" tone="gold" />
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{a.instruction_text}</span>
                  </div>
                ))}
                {dietary.map((d: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Badge value="Dietary" tone="green" />
                    <span style={{ fontSize: "13px" }}>{d.instruction_text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "#059669", margin: 0, fontWeight: 500 }}>✓ No known food allergies or dietary restrictions recorded.</p>
            )}
          </div>

          <div style={{ background: "#FAFAFA", padding: "14px 16px", borderRadius: "12px", border: "1px solid #E5E7EB" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 10px 0", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="phone" size={15} /> Emergency Contacts
            </h3>
            {emergencyContacts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {emergencyContacts.map((c: any, i: number) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < emergencyContacts.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <div>
                      <strong>{c.name}</strong> <span style={{ fontSize: "12px", color: "#6B7280" }}>({c.relationship})</span>
                    </div>
                    <span style={{ fontWeight: 600, fontSize: "13px", color: "#2563EB" }}>{c.phone}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>No emergency contacts recorded yet.</p>
            )}
          </div>
        </div>
        <div className="p-dialog-footer" style={{ marginTop: "16px" }}>
          <Button onClick={close}>Done</Button>
        </div>
      </Modal>
    );
  } else {
    title =
      kind === "report-detail"
        ? "Daily report"
        : kind === "health-detail"
          ? "Health / incident record"
          : kind === "message-detail"
            ? "Message"
            : "Attendance history";
    const lines =
      kind === "report-detail"
        ? {
            Child: childName(data, row.child_id),
            Caregiver: userName(data, row.caregiver_id),
            Date: dayOf(row.report_date),
            Mood: label(row.mood),
            "Sleep (minutes)": row.sleep_duration_min ?? "—",
            Observations:
              row.general_observations || "No observations recorded",
            Meals: (row.meals && row.meals.length > 0)
              ? row.meals.map((m: any) => `${label(m.meal_type)}: ${m.description || ""}${m.portion ? ` (${m.portion})` : ""}`).join("\n")
              : "No meals recorded",
            Activities: (row.activities && row.activities.length > 0)
              ? row.activities.map((a: any) => `${label(a.activity_type)}: ${a.description || ""}${a.location ? ` (${a.location})` : ""}`).join("\n")
              : "No activities recorded",
          }
        : kind === "health-detail"
          ? {
              Child: childName(data, row.child_id),
              Type: row.record_type,
              Severity: row.severity,
              Description: row.description,
              "Parent informed": row.parent_notified ? "Yes" : "Pending",
            }
          : kind === "message-detail"
            ? {
                From: userName(data, row.sender_id),
                Subject: row.subject || "No subject",
                Message: row.body,
              }
            : {
                Child: row.full_name,
                History: data.attendance
                  .filter((a) => a.child_id === row.id)
                  .map(
                    (a) => localDay(a.event_time) + " · " + label(a.event_type),
                  )
                  .slice(0, 30)
                  .join("\n"),
              };
    return (
      <Modal title={title} onClose={close}>
        <div className="p-detail-grid">
          {Object.entries(lines).map(([key, value]) => (
            <div key={key}>
              <small>{key}</small>
              <p>{String(value ?? "—")}</p>
            </div>
          ))}
        </div>
        <div className="p-dialog-footer">
          <Button onClick={close}>Done</Button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={title} onClose={close}>
      {detail}
      <RecordForm
        fields={fields}
        initial={initial}
        onSave={save}
        onCancel={close}
        busy={busy}
        error={error}
        submit={submit}
      />
    </Modal>
  );
}

function FamilyEnrollmentModal({
  ctx,
  busy,
  error,
  save,
  close,
}: {
  ctx: PageContext;
  busy: boolean;
  error: string;
  save: (v: Record<string, any>) => void;
  close: () => void;
}) {
  const { data, preview } = ctx;
  const [isNewGroup, setIsNewGroup] = useState(data.groups.length === 0);
  const [newGroupName, setNewGroupName] = useState("");
  const [formData, setFormData] = useState({
    parent_name: "",
    parent_email: "",
    parent_phone: "",
    parent_relationship: "Mother",
    parent_password: "",
    child_full_name: "",
    child_dob: "",
    child_gender: "female",
    child_group_id: data.groups[0]?.id ? String(data.groups[0].id) : "",
    child_caregiver_id: "",
    monthly_care_fee: "3500.00",
    allergy_note: "",
    care_note: "",
    sec_contact_name: "",
    sec_contact_relationship: "Father",
    sec_contact_phone: "",
  });

  const handleChange = (key: string, val: string) => {
    setFormData((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save({
      ...formData,
      new_group_name: isNewGroup ? newGroupName.trim() : "",
    });
  };

  return (
    <Modal title="Enroll New Family (Parent & Child)" onClose={close}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <p style={{ margin: "0 0 6px", fontSize: "14px", color: "var(--muted)" }}>
          Register the parent user account and child profile together in one step. The parent is automatically linked with authorized child pickup.
        </p>

        {/* Section 1: Parent Information */}
        <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: "var(--navy)", display: "flex", alignItems: "center" }}><Icon name="user" size={17} /></span>
            <strong style={{ fontSize: "15px", color: "var(--navy)" }}>Parent / Guardian Account</strong>
          </div>
          <div className="p-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Full name *
              <input
                required
                placeholder="e.g., Sara Mengistu"
                value={formData.parent_name}
                onChange={(e) => handleChange("parent_name", e.target.value)}
              />
            </label>
            <label>
              Email address (login username) *
              <input
                type="email"
                required
                placeholder="sara@example.com"
                value={formData.parent_email}
                onChange={(e) => handleChange("parent_email", e.target.value)}
              />
            </label>
            <label>
              Phone number *
              <input
                type="tel"
                required
                placeholder="+251 911 223 344"
                value={formData.parent_phone}
                onChange={(e) => handleChange("parent_phone", e.target.value)}
              />
            </label>
            <label>
              Relationship to child
              <select
                value={formData.parent_relationship}
                onChange={(e) => handleChange("parent_relationship", e.target.value)}
              >
                <option value="Mother">Mother</option>
                <option value="Father">Father</option>
                <option value="Legal Guardian">Legal Guardian</option>
                <option value="Grandmother">Grandmother</option>
                <option value="Grandfather">Grandfather</option>
                <option value="Aunt">Aunt</option>
                <option value="Uncle">Uncle</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Parent app temporary password *
              <input
                type="password"
                required={!preview}
                minLength={8}
                placeholder="At least 8 characters (e.g., Welcome123!)"
                value={formData.parent_password}
                onChange={(e) => handleChange("parent_password", e.target.value)}
              />
              <small style={{ color: "#6B7280", marginTop: 4, display: "block" }}>
                The parent will use this password to sign in to the Ankelba Parent mobile app.
              </small>
            </label>
          </div>
        </div>

        {/* Section 2: Child Profile */}
        <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: "var(--navy)", display: "flex", alignItems: "center" }}><Icon name="child" size={17} /></span>
            <strong style={{ fontSize: "15px", color: "var(--navy)" }}>Child Information</strong>
          </div>
          <div className="p-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label>
              Child’s full name *
              <input
                required
                placeholder="e.g., Nathaniel Dawit"
                value={formData.child_full_name}
                onChange={(e) => handleChange("child_full_name", e.target.value)}
              />
            </label>
            <label>
              Date of birth *
              <input
                type="date"
                required
                max={today()}
                value={formData.child_dob}
                onChange={(e) => handleChange("child_dob", e.target.value)}
              />
            </label>
            <label>
              Gender
              <select
                value={formData.child_gender}
                onChange={(e) => handleChange("child_gender", e.target.value)}
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)" }}>Classroom group</span>
                <button
                  type="button"
                  onClick={() => setIsNewGroup(!isNewGroup)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#008794",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  {isNewGroup ? "← Choose existing" : "+ Create new group here"}
                </button>
              </div>
              {isNewGroup ? (
                <input
                  required
                  aria-label="New classroom group name"
                  placeholder="e.g., Little Sprouts (Toddler Room)"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #D1D5DB" }}
                />
              ) : (
                <select
                  aria-label="Classroom group"
                  value={formData.child_group_id}
                  onChange={(e) => handleChange("child_group_id", e.target.value)}
                >
                  <option value="">Select classroom group</option>
                  {data.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <label>
              Assigned primary caregiver (optional)
              <select
                value={formData.child_caregiver_id}
                onChange={(e) => handleChange("child_caregiver_id", e.target.value)}
              >
                <option value="">Unassigned</option>
                {data.users
                  .filter((u) => u.role === "caregiver" && u.status === "active")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.title ? `(${u.title})` : ""}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Monthly care fee (ETB) *
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="3500.00"
                value={formData.monthly_care_fee}
                onChange={(e) => handleChange("monthly_care_fee", e.target.value)}
              />
              <small style={{ color: "#6B7280", marginTop: 4, display: "block" }}>
                Baseline monthly care &amp; stay fee for this child
              </small>
            </label>
          </div>
        </div>

        {/* Section 3: Health, Allergies & Emergency Contacts */}
        <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: "var(--navy)", display: "flex", alignItems: "center" }}><Icon name="heart" size={17} /></span>
            <strong style={{ fontSize: "15px", color: "var(--navy)" }}>Care, Allergies & Secondary Emergency Contact</strong>
          </div>
          <div className="p-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={{ gridColumn: "1 / -1" }}>
              Allergies or dietary restrictions
              <input
                placeholder="e.g., Peanut allergy — carries EpiPen (or leave empty if none)"
                value={formData.allergy_note}
                onChange={(e) => handleChange("allergy_note", e.target.value)}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Special care / sleep / medical instructions
              <textarea
                placeholder="e.g., Sleeps best with stuffed rabbit. Needs water bottle refilled at noon."
                value={formData.care_note}
                onChange={(e) => handleChange("care_note", e.target.value)}
                rows={2}
              />
            </label>
            <label>
              Secondary contact name (optional)
              <input
                placeholder="e.g., Dawit Abebe"
                value={formData.sec_contact_name}
                onChange={(e) => handleChange("sec_contact_name", e.target.value)}
              />
            </label>
            <label>
              Secondary contact phone
              <input
                type="tel"
                placeholder="+251 911 554 433"
                value={formData.sec_contact_phone}
                onChange={(e) => handleChange("sec_contact_phone", e.target.value)}
              />
            </label>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-error" style={{ margin: "4px 0" }}>
            {error}
          </div>
        )}

        <div className="p-dialog-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="secondary" type="button" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Enrolling Family…" : "Complete Family Enrollment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignCaregiverModal({
  caregiver,
  data,
  busy,
  error,
  close,
  onSave,
}: {
  caregiver: Row;
  data: Dataset;
  busy: boolean;
  error: string;
  close: () => void;
  onSave: (childIds: number[], groupId?: number) => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const initialAssigned = useMemo(
    () => new Set(data.children.filter((c) => c.caregiver_id === caregiver.id && c.enrollment_status === "active").map((c) => c.id)),
    [data.children, caregiver.id]
  );
  const [selectedChildren, setSelectedChildren] = useState<Set<number>>(initialAssigned);
  const [searchFilter, setSearchFilter] = useState("");

  const handleGroupSelect = (grpId: string) => {
    setSelectedGroup(grpId);
    if (!grpId) return;
    const gId = Number(grpId);
    const inGroup = data.children.filter((c) => c.group_id === gId && c.enrollment_status === "active").map((c) => c.id);
    setSelectedChildren((prev) => {
      const next = new Set(prev);
      inGroup.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleChild = (id: number) => {
    setSelectedChildren((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedChildren(new Set(data.children.filter((c) => c.enrollment_status === "active").map((c) => c.id)));
  };

  const clearAll = () => {
    setSelectedChildren(new Set());
  };

  const filteredChildren = data.children.filter(
    (c) =>
      c.enrollment_status === "active" &&
      (!searchFilter || c.full_name.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <Modal title={`Assign Students to ${caregiver.name}`} onClose={close}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
          Select children or an entire classroom to assign to <strong>{caregiver.name}</strong> ({caregiver.title || "Caregiver"}). Assigned caregivers record daily activities, naps, meals, and attendance.
          {' '}Previously assigned active children you deselect will be unassigned. The classroom lead changes only when all active children in that classroom are selected.
        </p>

        {/* Quick Group Bulk-Assign */}
        <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <strong style={{ fontSize: 13, color: "var(--navy)", display: "block", marginBottom: 6 }}>
            Quick Assign Entire Classroom Group
          </strong>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              style={{ flex: 1 }}
              value={selectedGroup}
              onChange={(e) => handleGroupSelect(e.target.value)}
            >
              <option value="">Choose a classroom to select all its students…</option>
              {data.groups.map((g) => {
                const count = data.children.filter((c) => c.group_id === g.id && c.enrollment_status === "active").length;
                return (
                  <option key={g.id} value={g.id}>
                    {g.name} ({count} active children)
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Individual Student Selection */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 13, color: "var(--navy)" }}>
              Assigned Students ({selectedChildren.size} selected)
            </strong>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="quiet small" type="button" onClick={selectAll}>Select All</Button>
              <Button variant="quiet small" type="button" onClick={clearAll}>Deselect All</Button>
            </div>
          </div>

          <input
            type="search"
            placeholder="Search students by name…"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ marginBottom: 10, width: "100%" }}
          />

          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredChildren.length === 0 ? (
              <div style={{ padding: 12, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No active students found</div>
            ) : (
              filteredChildren.map((c) => {
                const checked = selectedChildren.has(c.id);
                const currentCaregiver = data.users.find((u) => u.id === c.caregiver_id);
                const group = data.groups.find((g) => g.id === c.group_id);
                return (
                  <label
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: checked ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      border: checked ? "1px solid #bfdbfe" : "1px solid #f1f5f9",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChild(c.id)}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>{c.full_name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        {group?.name || "No classroom"} · {currentCaregiver ? (currentCaregiver.id === caregiver.id ? "✓ Currently assigned to this caregiver" : `Assigned to: ${currentCaregiver.name}`) : "Unassigned"}
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="p-error">
            {error}
          </div>
        )}

        <div className="p-dialog-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="secondary" type="button" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => onSave(Array.from(selectedChildren), selectedGroup ? Number(selectedGroup) : undefined)}
          >
            {busy ? "Saving…" : `Save Assignments (${selectedChildren.size} children)`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AssignChildModal({
  child,
  data,
  busy,
  error,
  close,
  onSave,
}: {
  child: Row;
  data: Dataset;
  busy: boolean;
  error: string;
  close: () => void;
  onSave: (caregiverId: number | null, groupId: number | null) => void;
}) {
  const [caregiverId, setCaregiverId] = useState<string>(child.caregiver_id ? String(child.caregiver_id) : "");
  const [groupId, setGroupId] = useState<string>(child.group_id ? String(child.group_id) : "");

  return (
    <Modal title={`Assign Caregiver & Group: ${child.full_name}`} onClose={close}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
          Set the assigned educator and classroom for <strong>{child.full_name}</strong>.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
          Primary Caregiver / Educator
          <select
            value={caregiverId}
            onChange={(e) => setCaregiverId(e.target.value)}
          >
            <option value="">Unassigned (No caregiver)</option>
            {data.users
              .filter((u) => u.role === "caregiver" && u.status === "active")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.title ? `(${u.title})` : ""}
                </option>
              ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
          Classroom Group
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">Unassigned (No classroom group)</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <div className="p-notice" style={{ margin: 0 }}>
          Assigned caregivers have direct access to log daily reports, health observations, and front-desk attendance for this child.
        </div>

        {error && (
          <div role="alert" className="p-error">
            {error}
          </div>
        )}

        <div className="p-dialog-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="secondary" type="button" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => onSave(caregiverId ? Number(caregiverId) : null, groupId ? Number(groupId) : null)}
          >
            {busy ? "Saving…" : "Save Assignment"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AssignGroupCaregiverModal({
  group,
  data,
  busy,
  error,
  close,
  onSave,
}: {
  group: Row;
  data: Dataset;
  busy: boolean;
  error: string;
  close: () => void;
  onSave: (caregiverId: number | null, assignChildren: boolean) => void;
}) {
  const [caregiverId, setCaregiverId] = useState<string>(group.lead_caregiver_id ? String(group.lead_caregiver_id) : "");
  const [assignChildren, setAssignChildren] = useState(true);
  const activeChildrenCount = data.children.filter((c) => c.group_id === group.id && c.enrollment_status === "active").length;

  return (
    <Modal title={`Assign Lead Caregiver to ${group.name}`} onClose={close}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: 0, fontSize: "14px", color: "var(--muted)" }}>
          Select the lead teacher or educator responsible for the <strong>{group.name}</strong> classroom.
        </p>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
          Lead Teacher / Primary Caregiver
          <select
            value={caregiverId}
            onChange={(e) => setCaregiverId(e.target.value)}
          >
            <option value="">Unassigned (No lead caregiver)</option>
            {data.users
              .filter((u) => u.role === "caregiver" && u.status === "active")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.title ? `(${u.title})` : ""}
                </option>
              ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={assignChildren}
            onChange={(e) => setAssignChildren(e.target.checked)}
          />
          <span>
            Also assign all <strong>{activeChildrenCount} active children</strong> in this group to this caregiver
          </span>
        </label>

        {error && (
          <div role="alert" className="p-error">
            {error}
          </div>
        )}

        <div className="p-dialog-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="secondary" type="button" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => onSave(caregiverId ? Number(caregiverId) : null, assignChildren)}
          >
            {busy ? "Saving…" : "Save Group Assignment"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

