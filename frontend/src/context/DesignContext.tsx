import React, { createContext, useContext, useState, ReactNode } from "react";
export type Guardian = {
  id: number;
  name: string;
  relationship: string;
  phone: string;
  email: string;
  authorized: boolean;
  enrolled: boolean;
  photo: "mother" | "father" | null;
};
export type PreviewOrder = {
  reference: string;
  total: number;
  method: "pay_at_daycare" | "digital";
  items: { name: string; quantity: number; price: number }[];
  note: string;
  payment_status?: string;
};
type State = {
  reminders: number[];
  toggleReminder: (eventId: number) => void;
  guardians: Guardian[];
  saveGuardian: (guardian: Guardian) => void;
  order: PreviewOrder | null;
  setOrder: (order: PreviewOrder) => void;
  preferences: Record<string, boolean>;
  togglePreference: (key: string) => void;
};
const Context = createContext<State | null>(null);
export function DesignProvider({ children }: { children: ReactNode }) {
  const [guardians, setGuardians] = useState<Guardian[]>([
    {
      id: 1,
      name: "Hana Tesfaye",
      relationship: "Mother",
      phone: "+251 91 123 4567",
      email: "hana.tesfaye@example.com",
      authorized: true,
      enrolled: true,
      photo: "mother",
    },
    {
      id: 2,
      name: "Abel Mekonnen",
      relationship: "Father",
      phone: "+251 91 987 6543",
      email: "abel@example.com",
      authorized: true,
      enrolled: true,
      photo: "father",
    },
    {
      id: 3,
      name: "Daniel Bekele",
      relationship: "Uncle",
      phone: "+251 92 333 4455",
      email: "daniel@example.com",
      authorized: true,
      enrolled: false,
      photo: null,
    },
  ]);
  const [reminders, setReminders] = useState<number[]>([]);
  const [order, setOrder] = useState<PreviewOrder | null>(null);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({
    activity: true,
    messages: true,
    announcements: false,
  });
  const saveGuardian = (guardian: Guardian) =>
    setGuardians((list) =>
      list.some((g) => g.id === guardian.id)
        ? list.map((g) => (g.id === guardian.id ? guardian : g))
        : [...list, guardian],
    );
  return (
    <Context.Provider
      value={{
        reminders,
        toggleReminder: (id) =>
          setReminders((ids) =>
            ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
          ),
        guardians,
        saveGuardian,
        order,
        setOrder,
        preferences,
        togglePreference: (key) =>
          setPreferences((p) => ({ ...p, [key]: !p[key] })),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useDesign() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("DesignProvider is required");
  return ctx;
}
