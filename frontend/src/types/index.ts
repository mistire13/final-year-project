// Domain Enums matching Ankelba Backend SRS
export type Role = 'admin' | 'caregiver' | 'parent';
export type UserStatus = 'active' | 'inactive';
export type Gender = 'male' | 'female';
export type EnrollmentStatus = 'active' | 'inactive' | 'graduated';
export type CareInstructionType = 'allergy' | 'diet' | 'medical' | 'general';
export type CareInstructionCategory =
  | 'allergy'
  | 'dietary'
  | 'medical_note'
  | 'general'
  | 'medication'
  | 'diet'
  | 'note'
  | 'routine';

export type AttendanceType = 'checkin' | 'checkout';
export type Mood = 'happy' | 'playful' | 'fussy' | 'tired' | 'calm';
export type MealType = 'breakfast' | 'lunch' | 'snack';
export type PortionConsumed = 'all' | 'most' | 'half' | 'little' | 'none';
export type ActivityType =
  | 'arts_and_crafts'
  | 'outdoor_play'
  | 'reading'
  | 'nap'
  | 'sensory'
  | 'other';
export type HealthRecordType = 'illness' | 'injury' | 'observation';
export type Severity = 'low' | 'medium' | 'high';
export type Audience = 'all' | 'parents' | 'caregivers';
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type PaymentMethod = 'pay_at_daycare' | 'digital';
export type BiometricModality = 'fingerprint' | 'facial';
export type VerificationMode = 'biometric' | 'manual_fallback';
export type VerificationStatus = 'verified' | 'rejected';

// User & Auth
export interface User {
  id: number;
  daycare_id?: number | null;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  role_id: number;
  status: UserStatus;
  created_at: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

export interface ChildSummary {
  id: number;
  full_name: string;
  dob?: string;
  gender?: Gender | string;
  enrollment_status: EnrollmentStatus | string;
  relationship?: string;
  group_id?: number;
  group_name?: string;
  photo_url?: string;
  pickup_authorized?: boolean;
  caregiver_id?: number;
  caregiver_name?: string;
}


export interface UserProfileMe extends User {
  profile_complete?: boolean;
  linked_children?: ChildSummary[];
}


// Children
export interface Child {
  id: number;
  full_name: string;
  dob: string;
  gender: Gender;
  enrollment_status: EnrollmentStatus;
  group_id?: number;
  group_name?: string;
  caregiver_id?: number;
  caregiver_name?: string;
  emergency_contacts?: EmergencyContact[];
  care_instructions?: CareInstruction[];
  attendance_rate?: number;
  created_at?: string;
}

export interface EmergencyContact {
  id: number;
  name: string;
  relationship: string;
  phone: string;
  is_primary: boolean;
}

export interface CareInstruction {
  id: number;
  child_id?: number;
  category: CareInstructionCategory;
  instruction_text: string;
  // Legacy aliases for backward compat
  instruction_type?: CareInstructionType;
  description?: string;
  created_at?: string;
}


export interface GuardianLink {
  id: number;
  child_id: number;
  parent_user_id: number;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  relationship: string;
  is_primary: boolean;
  can_pickup: boolean;
  biometric_enrolled: boolean;
  created_at: string;
}

// Attendance
export interface AttendanceEvent {
  id: number;
  child_id: number;
  recorded_by?: number;
  recorded_by_name?: string;
  attendance_type: AttendanceType;
  timestamp: string;
  notes?: string;
}

export interface AttendanceSummary {
  child_id: number;
  child_name: string;
  total_days_evaluated: number;
  days_present: number;
  days_absent: number;
  attendance_rate_percent: number;
  average_daily_stay_hours: number;
}

// Reports
export interface MealItem {
  id?: number;
  meal_type: MealType;
  food_items: string;
  portion_consumed: PortionConsumed;
  notes?: string;
}

export interface ActivityItem {
  id?: number;
  activity_type: ActivityType;
  description: string;
  location?: string;
  photo_url?: string;
}

export interface DailyReport {
  id: number;
  child_id: number;
  child_name?: string;
  caregiver_id?: number;
  caregiver_name?: string;
  report_date: string;
  mood: Mood;
  sleep_duration_min: number;
  activities_summary?: string;
  general_notes?: string;
  submitted_at?: string;
  meals?: MealItem[];
  activities?: ActivityItem[];
}

// AI Guide
export interface AIGuideResponse {
  question: string;
  child_context?: {
    name: string;
    age_years: number;
    group_name: string;
  } | null;
  answer: string;
  disclaimer: string;
  safety_redirected: boolean;
  is_medical_query: boolean;
}

// Store & Orders
export interface ProductCategory {
  id: number;
  name: string;
  description?: string;
  product_count?: number;
}

export interface Product {
  id: number;
  category_id?: number;
  category_name?: string;
  category?: string;
  name: string;
  description?: string;
  price: number; // in ETB
  stock_quantity?: number;
  in_stock?: boolean;
  image_url?: string;
  is_active?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price: string | number;
  quantity: number;
  line_total: string | number;
}

export interface Order {
  id: number;
  user_id: number;
  total_amount: string | number;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  notes?: string;
  items: OrderItem[];
  created_at: string;
}

// Events
export interface DaycareEvent {
  id: number;
  title: string;
  description: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  category?: 'meeting' | 'family' | 'holiday' | 'creative';
  is_cancelled: boolean;
  created_at: string;
}

// Messages
export interface MessageThread {
  id: number;
  caregiver_id: number;
  caregiver_name: string;
  caregiver_avatar?: string;
  is_online?: boolean;
  child_name: string;
  last_message: string;
  last_message_time: string;
  unread_count: number;
}

export interface ChatMessage {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_name: string;
  is_caregiver: boolean;
  content: string;
  created_at: string;
  activity_card?: {
    title: string;
    description: string;
    image_url?: string;
  };
}

export type StoreOrder = Order;
export type CenterEvent = DaycareEvent;
export type DirectMessage = ChatMessage;
export type AttendanceSummaryChild = AttendanceSummary;

