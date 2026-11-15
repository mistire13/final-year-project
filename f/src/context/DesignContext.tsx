import { apiClient } from "../api/client";
import { useAuth } from "./AuthContext";
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
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
  method: "pay_at_daycare" | "digital" | "demo" | "bank_transfer";
  items: { name: string; quantity: number; price: number }[];
  note: string;
  payment_status?: string;
};
type State = {
  persistenceError: string;
  reminders: number[];
  toggleReminder: (eventId: number) => void;
  guardians: Guardian[];
  saveGuardian: (guardian: Guardian) => void;
  order: PreviewOrder | null;
  setOrder: (order: PreviewOrder) => void;
  preferences: Record<string, boolean>;
  preferencesSaving: boolean;
  togglePreference: (key: string) => void;
};
const Context = createContext<State | null>(null);
export function DesignProvider({ children }: { children: ReactNode }) {
  const {user}=useAuth();
  const [persistenceError,setPersistenceError]=useState("");
  const [guardians,setGuardians]=useState<Guardian[]>([]);
  const [reminders, setReminders] = useState<number[]>([]);
  const [order, setOrder] = useState<PreviewOrder | null>(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const preferenceRequest = useRef(0);
  const preferenceBusy = useRef(false);
  const [preferences, setPreferences] = useState<Record<string, boolean>>({
    activity: true,
    messages: true,
    announcements: true,
  });
  useEffect(()=>{preferenceRequest.current++;preferenceBusy.current=false;setPreferencesSaving(false);setOrder(null);setGuardians([]);setReminders([]);setPersistenceError('');setPreferences({activity:true,messages:true,announcements:true});},[user?.id,user?.daycare_id]);
  useEffect(()=>{let active=true;if(user?.daycare_id)apiClient.get('/notifications/preferences').then(({data})=>{if(!active)return;setReminders(data.reminders||[]);setPreferences(p=>({...p,...data.notifications}));}).catch(()=>{if(active)setPersistenceError('Preferences could not be loaded. Retry after reconnecting.');});return()=>{active=false;};},[user?.id,user?.daycare_id]);
  const persist=async(body:any)=>{try{await apiClient.patch('/notifications/preferences',body);setPersistenceError('');}catch{setPersistenceError('Your preference was not saved. Check your connection and try again.');}};
  const saveGuardian = (guardian: Guardian) =>
    setGuardians((list) =>
      list.some((g) => g.id === guardian.id)
        ? list.map((g) => (g.id === guardian.id ? guardian : g))
        : [...list, guardian],
    );
  return (
    <Context.Provider
      value={{
        persistenceError,
        reminders,
        toggleReminder: (id) => {
          const enabled=!reminders.includes(id);
          setReminders(ids=>enabled?[...ids,id]:ids.filter(x=>x!==id));
          void persist({reminder:{event_id:id,enabled}});
        },
        guardians,
        saveGuardian,
        order,
        setOrder,
        preferences,
        preferencesSaving,
        togglePreference: (key) => {
          if (preferenceBusy.current) return;
          preferenceBusy.current = true;
          setPreferencesSaving(true);
          const request = preferenceRequest.current;
          const enabled=!preferences[key];
          void apiClient.patch('/notifications/preferences',{notifications:{[key]:enabled}})
            .then(()=>{if(request===preferenceRequest.current){setPreferences(p=>({...p,[key]:enabled}));setPersistenceError('');}})
            .catch(()=>{if(request===preferenceRequest.current)setPersistenceError('Your preference was not saved. Check your connection and try again.');})
            .finally(()=>{if(request===preferenceRequest.current){preferenceBusy.current=false;setPreferencesSaving(false);}});
        },
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
