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
  clientId: number
  source: string
  clientName?: string
  clientPhone?: string
  notes?: string | null
}

export interface AppointmentRecord extends IAppointmentCreationPayload {
  id: string
  createdAt: string
  updatedAt: string
}

export type UpsertAppointmentArgs = Partial<IAppointmentValidationDraft>
