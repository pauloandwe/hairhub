export interface IdNameRef {
  id: string | number
  name: string
}

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  NO_SHOW = 'NO_SHOW',
}

export interface Appointment {
  id: string
  customerId?: string
  customerName: string
  customerPhone: string
  barberId: string
  barberName: string
  serviceId: string
  serviceName: string
  dateTime: string // ISO format: 2024-11-02T14:00:00
  duration: number // minutes
  status: AppointmentStatus
  businessId: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface AppointmentDraft {
  serviceId: string | null
  service: IdNameRef | null
  barberId: string | null
  barber: IdNameRef | null
  date: string | null // YYYY-MM-DD
  time: string | null // HH:mm
  duration: number | null
  notes: string | null
}

export interface AppointmentCreatePayload {
  customerName: string
  customerPhone: string
  barberId: string
  serviceId: string
  dateTime: string
  duration: number
  businessId: string
  notes?: string
}

export interface AvailableSlot {
  date: string
  time: string
  barberId: string
  barberName: string
  available: boolean
}

export interface RescheduleDraft {
  appointmentId: string | null
  currentAppointment: Appointment | null
  newDate: string | null
  newTime: string | null
  reason: string | null
}

export interface CancelDraft {
  appointmentId: string | null
  currentAppointment: Appointment | null
  reason: string | null
}

export type CancellationReason =
  | 'cliente_desistiu'
  | 'emergencia'
  | 'conflito_agenda'
  | 'outro'

export type RescheduleReason = 'imprevisto' | 'conflito_agenda' | 'preferencia_horario' | 'outro'
