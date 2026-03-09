import { IdNameRef, IdNameDurationRef } from '../drafts/types'
import { DraftStatus } from '../generic/generic.types'

export type AppointmentIntentMode = 'book' | 'check_then_offer'

export type AppointmentRefInput =
  | string
  | number
  | bigint
  | {
      id?: string | number | null
      name?: string | null
      duration?: number | null
    }
  | null

export interface IAppointmentValidationDraft {
  appointmentDate: string | null
  appointmentTime: string | null
  service: IdNameDurationRef | null
  professional: IdNameRef | null
  clientName: string | null
  clientPhone: string | null
  notes: string | null
  status?: DraftStatus
  recordId?: string
}

export interface IAppointmentCreationPayload {
  businessId: number
  serviceId: number
  professionalId?: number
  startDate: string
  endDate: string
  source: string
  assignmentStrategy: 'manual' | 'least_appointments'
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

export type StartAppointmentArgs = Omit<UpsertAppointmentArgs, 'service' | 'professional'> & {
  date?: string | null
  time?: string | null
  service?: AppointmentRefInput
  professional?: AppointmentRefInput
  intentMode?: AppointmentIntentMode
}

export interface AvailabilityResolutionCandidate {
  id: string
  name: string
  description?: string
  duration?: number | null
}

export interface PendingAppointmentOffer {
  appointmentDate: string
  appointmentTime: string
  service: IdNameDurationRef | null
  professional: IdNameRef | null
  clientName?: string | null
  clientPhone?: string | null
  notes?: string | null
  createdAt: string
  expiresAt: string
}

export interface PendingAvailabilityResolution {
  kind: 'service' | 'professional'
  request: Omit<StartAppointmentArgs, 'intentMode'>
  candidates: AvailabilityResolutionCandidate[]
  prompt: string
  createdAt: string
  expiresAt: string
}

export type AppointmentAvailabilityResolution =
  | { status: 'ok'; draft: IAppointmentValidationDraft }
  | {
      status: 'reset-time' | 'reset-date' | 'reset-professional'
      draft: IAppointmentValidationDraft
      message: string
    }
