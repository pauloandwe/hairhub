import { Appointment } from './appointment.types'

export enum ReminderStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface Reminder {
  id: string
  appointmentId: string
  phone: string
  scheduledFor: string // ISO timestamp when reminder should be sent
  status: ReminderStatus
  message: string
  sentAt?: string
  error?: string
  hoursBeforeAppointment: number
  createdAt: string
}

export interface ReminderTemplate {
  type: 'reminder_24h' | 'reminder_2h' | 'reminder_custom' | 'confirmation' | 'cancellation' | 'reschedule'
  hoursBeforeAppointment?: number
  generateMessage: (appointment: Appointment, businessName?: string) => string
}
