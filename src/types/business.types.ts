export interface BusinessConfig {
  id: string
  name: string
  phone: string
  type: BusinessType
  workingHours: WorkingHours[]
  services: Service[]
  barbers: Barber[]
  settings: BusinessSettings
}

export type BusinessType = 'barbershop' | 'salon' | 'clinic' | 'other'

export interface Barber {
  id: string
  name: string
  specialties?: string[]
  workingHours?: WorkingHours[]
  photoUrl?: string
  active: boolean
}

export interface Service {
  id: string
  name: string
  description?: string
  duration: number // minutes
  price?: number
  active: boolean
}

export interface WorkingHours {
  dayOfWeek: number // 0=Sunday, 1=Monday, ..., 6=Saturday
  openTime: string // HH:mm format
  closeTime: string // HH:mm format
  breakStart?: string
  breakEnd?: string
  closed: boolean
}

export interface BusinessSettings {
  reminderHours: number[] // e.g., [24, 2] = 24h and 2h before
  enableReminders: boolean
  allowCancellation: boolean
  cancellationDeadlineHours: number // e.g., 2 = can cancel up to 2h before
  allowReschedule: boolean
  rescheduleDeadlineHours: number
  autoConfirmAppointments: boolean
}
