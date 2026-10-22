/**
 * parentApi.ts — Typed API calls for parent-safe child profile endpoints.
 * SRS Refs: FR-CH-02, FR-CH-03
 */
import { apiClient } from './client';
import { CareInstruction, EmergencyContact, ChildSummary } from '../types';
export type { ChildSummary };

export interface CareInstructionInput {
  category: 'allergy' | 'medication' | 'diet' | 'note' | 'routine' | 'dietary' | 'medical_note' | 'general';
  instruction_text: string;
}

export interface EmergencyContactInput {
  name: string;
  relationship: string;
  phone: string;
}

export interface FullChildProfile {
  id: number;
  full_name: string;
  dob?: string;
  gender?: string;
  enrollment_status: string;
  photo_url?: string;
  group_name?: string;
  relationship?: string;
  care_instructions: CareInstruction[];
  emergency_contacts: EmergencyContact[];
}

/** GET /api/parent/children — list this parent's linked children (or daycare classroom children for caregivers/admins) */
export const getMyChildren = async (): Promise<ChildSummary[]> => {
  try {
    const res = await apiClient.get<any>('/parent/children');
    return res.data?.children || res.data?.data || (Array.isArray(res.data) ? res.data : []);
  } catch (err: any) {
    if (err.response?.status === 403) {
      const res = await apiClient.get<any>('/children');
      return res.data?.children || res.data?.data || (Array.isArray(res.data) ? res.data : []);
    }
    throw err;
  }
};

/** GET /api/parent/children/:id — full child profile with care data */
export const getMyChild = async (childId: number): Promise<FullChildProfile> => {
  try {
    const res = await apiClient.get<any>(`/parent/children/${childId}`);
    return res.data?.child || res.data;
  } catch (err: any) {
    if (err.response?.status === 403) {
      const res = await apiClient.get<any>(`/children/${childId}`);
      return res.data?.child || res.data;
    }
    throw err;
  }
};

/** PUT /api/parent/children/:id/care — replace all care instructions */
export const updateCareInstructions = async (
  childId: number,
  instructions: CareInstructionInput[]
): Promise<CareInstruction[]> => {
  const res = await apiClient.put<{ care_instructions: CareInstruction[] }>(
    `/parent/children/${childId}/care`,
    { instructions }
  );
  return res.data.care_instructions;
};

/** PUT /api/parent/children/:id/emergency-contacts — replace emergency contacts */
export const updateEmergencyContacts = async (
  childId: number,
  contacts: EmergencyContactInput[]
): Promise<EmergencyContact[]> => {
  const res = await apiClient.put<{ emergency_contacts: EmergencyContact[] }>(
    `/parent/children/${childId}/emergency-contacts`,
    { contacts }
  );
  return res.data.emergency_contacts;
};

/** PATCH /api/parent/profile-complete — mark parent profile as complete */
export const markProfileComplete = async (): Promise<void> => {
  await apiClient.patch('/parent/profile-complete');
};

/** Attendance */
export interface AttendanceRecord {
  id: number;
  child_id: number;
  event_type: 'checkin' | 'checkout' | 'absent';
  event_time: string;
  notes?: string;
  recorded_by_name?: string;
}

export const getChildAttendance = async (childId: number): Promise<AttendanceRecord[]> => {
  const res = await apiClient.get<{ data: AttendanceRecord[] }>(`/attendance/child/${childId}`);
  return res.data.data || [];
};

/** Daily Reports */
export interface DailyReportSummary {
  id: number;
  child_id: number;
  report_date: string;
  mood?: string;
  sleep_duration_min?: number;
  submitted_at: string;
  caregiver_name?: string;
}

export const getChildReports = async (childId: number): Promise<DailyReportSummary[]> => {
  const res = await apiClient.get<any>(`/reports/daily/child/${childId}`);
  return res.data?.data || (Array.isArray(res.data) ? res.data : []);
};

export interface DetailedDailyReport {
  id: number;
  child_id: number;
  caregiver_id: number;
  report_date: string;
  sleep_duration_min?: number;
  sleep_notes?: string;
  mood?: string;
  behavior_notes?: string;
  general_observations?: string;
  submitted_at: string;
  caregiver_name?: string;
  meals: Array<{ id: number; meal_type: string; description: string; portion?: string }>;
  activities: Array<{ id: number; activity_type: string; description: string; location?: string }>;
}

export const getDailyReport = async (reportId: number): Promise<DetailedDailyReport> => {
  const res = await apiClient.get<any>(`/reports/daily/${reportId}`);
  return res.data?.report || res.data;
};

/** Events */
export interface CalendarEvent {
  id: number;
  title: string;
  event_date: string;
  event_time?: string;
  description?: string;
  event_type: string;
  cancelled: boolean;
  created_by_name?: string;
}

export const getDaycareEvents = async (includePast = true): Promise<CalendarEvent[]> => {
  const res = await apiClient.get<{ data: CalendarEvent[] }>(`/events?include_past=${includePast}`);
  return res.data.data || [];
};

/** Direct Messages */
export interface DirectMessage {
  id: number;
  sender_id: number;
  recipient_id: number;
  subject?: string;
  body: string;
  read_at?: string;
  created_at: string;
  sender_name?: string;
  recipient_name?: string;
}

export const getDirectMessages = async (withUserId?: number): Promise<DirectMessage[]> => {
  const url = withUserId ? `/communication/messages?with_user_id=${withUserId}` : '/communication/messages';
  const res = await apiClient.get<{ data: DirectMessage[] }>(url);
  return res.data.data || [];
};

export const sendDirectMessage = async (recipientId: number, body: string, subject?: string): Promise<DirectMessage> => {
  const res = await apiClient.post<DirectMessage>('/communication/messages', {
    recipient_id: recipientId,
    body,
    subject,
  });
  return res.data;
};

export const markMessageAsRead = async (messageId: number): Promise<DirectMessage> => {
  const res = await apiClient.patch<DirectMessage>(`/communication/messages/${messageId}/read`);
  return res.data;
};

export interface CommunicationContact {
  id: number;
  name: string;
  role: string;
  email: string;
  title?: string;
  child_names?: string[];
}

export const getCommunicationContacts = async (): Promise<CommunicationContact[]> => {
  const res = await apiClient.get<{ contacts: CommunicationContact[] }>('/communication/contacts');
  return res.data.contacts || [];
};

/** Store Products */

export interface StoreProduct {
  id: number;
  category_id?: number;
  name: string;
  description?: string;
  price: number;
  stock_quantity: number;
  stock_qty?: number;
  is_active: boolean;
  available?: boolean;
  image_url?: string;
}

export const getStoreProducts = async (): Promise<StoreProduct[]> => {
  const res = await apiClient.get<any>('/store/products');
  const items = res.data?.data || (Array.isArray(res.data) ? res.data : []);
  return items.map((item: any) => ({
    ...item,
    stock_quantity: item.stock_qty ?? item.stock_quantity ?? 0,
    is_active: item.available ?? item.is_active ?? true,
  }));
};

/** Authorized Guardians */
export interface GuardianRecord {
  guardian_link_id: number;
  user_id: number;
  name: string;
  email: string;
  relationship: string;
  pickup_authorized: boolean;
  biometric_enrolled: boolean;
  created_at: string;
}

export const getChildGuardians = async (childId: number): Promise<GuardianRecord[]> => {
  const res = await apiClient.get<{ data: GuardianRecord[] }>(`/children/${childId}/guardians`);
  return res.data.data || [];
};

/** Announcements */
export interface DaycareAnnouncement {
  id: number;
  title: string;
  body: string;
  announcement_type: string;
  audience: string;
  author_name?: string;
  target_group_name?: string;
  created_at: string;
}

export const getAnnouncements = async (type?: string): Promise<DaycareAnnouncement[]> => {
  const url = type ? `/communication/announcements?type=${type}` : '/communication/announcements';
  const res = await apiClient.get<{ data: DaycareAnnouncement[] }>(url);
  return res.data.data || [];
};

/** Orders */
export interface OrderItemRecord {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface OrderRecord {
  id: number;
  parent_id?: number;
  total: number;
  order_status: string;
  payment_status: string;
  created_at: string;
  items?: OrderItemRecord[];
}

export const placeStoreOrder = async (items: Array<{ product_id: number; quantity: number }>): Promise<OrderRecord> => {
  const res = await apiClient.post<OrderRecord>('/store/orders', { items });
  return res.data;
};

export const getMyOrders = async (): Promise<OrderRecord[]> => {
  const res = await apiClient.get<any>('/store/orders/my');
  return res.data?.data || (Array.isArray(res.data) ? res.data : []);
};

/** Groups */
export interface GroupRecord {
  id: number;
  name: string;
  description?: string;
}

export const getGroups = async (): Promise<GroupRecord[]> => {
  const res = await apiClient.get<{ data: GroupRecord[] }>('/groups');
  return res.data.data || [];
};

/** Child Profile Fulfillment */
export interface UpdateChildProfileInput {
  full_name: string;
  dob?: string;
  gender?: string;
  group_id?: number | null;
  relationship?: string;
  pickup_authorized?: boolean;
  photo_url?: string;
  parent_name?: string;
}

export const updateChildProfile = async (
  childId: number,
  data: UpdateChildProfileInput
): Promise<ChildSummary> => {
  const res = await apiClient.put<{ child: ChildSummary }>(`/parent/children/${childId}/profile`, data);
  return res.data.child;
};

/** Health & Incident Reporting (FR-HIR-01 to FR-HIR-06) */
export interface HealthRecord {
  id: number;
  child_id: number;
  record_type: 'health' | 'health_observation' | 'incident';
  description: string;
  severity?: 'low' | 'moderate' | 'high';
  parent_notified: boolean;
  recorded_at: string;
  recorded_by_name?: string;
  daycare_id?: number;
}

export interface HealthResponse {
  child_id: number;
  disclaimer: string;
  total: number;
  data: HealthRecord[];
}

export const getChildHealth = async (childId: number, recordType?: string): Promise<HealthResponse> => {
  const url = recordType ? `/health/child/${childId}?record_type=${recordType}` : `/health/child/${childId}`;
  const res = await apiClient.get<HealthResponse>(url);
  return res.data;
};

/** User Self-Service Profile Update (FR-UAM-04) */
export interface UpdateMyProfileInput {
  name?: string;
  email?: string;
  phone?: string;
}

export const updateMyProfile = async (data: UpdateMyProfileInput): Promise<any> => {
  const res = await apiClient.patch('/users/profile/me', data);
  return res.data;
};



