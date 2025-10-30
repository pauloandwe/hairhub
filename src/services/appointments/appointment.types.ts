import { IdNameRef } from '../drafts/types'
import { DraftStatus } from '../generic/generic.types'

export interface IAppointmentValidationDraft {
  appointmentDate: string | null
  appointmentTime: string | null
  service: IdNameRef | null
  barber: IdNameRef | null
  clientName: string | null
  clientPhone: string | null
  notes: string | null
  status?: DraftStatus
  recordId?: string
}

export interface IAppointmentCreationPayload {
  businessId: number
  serviceId: number
  barberId: number
  startDate: string
  endDate: string
  source: string
  clientId?: number
  clientName?: string | null
  clientPhone?: string | null
  notes?: string | null
}

export interface AppointmentRecord extends IAppointmentCreationPayload {
  id: string
  createdAt: string
  updatedAt: string
  clientContactId?: number | null
  clientContact?: { id: number; name: string | null; phone: string }
}

export type UpsertAppointmentArgs = Partial<IAppointmentValidationDraft>
