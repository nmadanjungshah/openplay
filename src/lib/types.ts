import type { Database } from './database.types';

type PublicSchema = Database['public'];

export type Profile = PublicSchema['Tables']['profiles']['Row'];
export type Group = PublicSchema['Tables']['groups']['Row'];
export type GroupMember = PublicSchema['Tables']['group_members']['Row'];
export type Session = PublicSchema['Tables']['sessions']['Row'];
export type Booking = PublicSchema['Tables']['bookings']['Row'];
export type Payment = PublicSchema['Tables']['payments']['Row'];
export type SessionOverview = PublicSchema['Views']['session_overview']['Row'];
export type BookingStatus = PublicSchema['Enums']['booking_status'];
export type MemberRole = PublicSchema['Enums']['member_role'];
export type PaymentMode = PublicSchema['Enums']['payment_mode'];
export type PaymentMethod = PublicSchema['Enums']['payment_method'];
export type PaymentStatus = PublicSchema['Enums']['payment_status'];

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  esewa: 'eSewa',
  khalti: 'Khalti',
  other: 'Other',
};
