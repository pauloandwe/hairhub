import 'dotenv/config'
import { InstitutionType } from './enums/institutions.enum'
import { FlowStep } from './enums/generic.enum'
import { createUserContextStore } from './services/user-context-store'
import { EnvKeys } from './helpers/Enums'

function getEnvVar(key: string): string {
  const value = process.env[key]
  if (!value) {
    console.error(`[ERROR] Variável de ambiente ${key} não definida.`)
    process.exit(1)
  }
  return value
}

export const env = {
  OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY'),
  META_VERIFY_TOKEN: getEnvVar('META_VERIFY_TOKEN'),
  META_ACCESS_TOKEN: getEnvVar('META_ACCESS_TOKEN'),
  PHONE_NUMBER_ID: getEnvVar('PHONE_NUMBER_ID'),
  API_URL: getEnvVar('API_URL'),
  BACKEND_URL: process.env.BACKEND_URL || getEnvVar('API_URL'),
  WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION || 'v24.0',
  WHATSAPP_WEBHOOK_SECRET: process.env.WHATSAPP_WEBHOOK_SECRET || 'default-secret',
  APPOINTMENTS_URL: process.env.APPOINTMENTS_URL || getEnvVar('API_URL'),
  PORT: process.env.PORT || 3000,
  WHISPER_MODEL: process.env.WHISPER_MODEL || 'base',
  WHISPER_COMMAND: process.env.WHISPER_COMMAND || 'whisper',
  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: process.env.REDIS_PORT,
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_CHAT_HISTORY_TTL_SEC: process.env.REDIS_CHAT_HISTORY_TTL_SEC || String(300),
  REDIS_DRAFT_TTL_SEC: process.env.REDIS_DRAFT_TTL_SEC || String(500),
  REDIS_INTENT_HISTORY_TTL_SEC: process.env.REDIS_INTENT_HISTORY_TTL_SEC || String(3600),
}

export interface BusinessWorkingHour {
  dayOfWeek: number
  openTime: string
  closeTime: string
  breakStart?: string
  breakEnd?: string
  closed: boolean
}

export interface BusinessService {
  id: string
  name: string
  description: string
  duration: number
  price: number
  active: boolean
}

export interface BusinessProfessional {
  id: string
  name: string
  specialties: string[]
  active: boolean
}

export interface BusinessSettings {
  reminderHours: number[]
  enableReminders: boolean
  allowCancellation: boolean
  cancellationDeadlineHours: number
  allowReschedule: boolean
  rescheduleDeadlineHours: number
  autoConfirmAppointments: boolean
}

export interface AppointmentRescheduleAppointment {
  id: number
  startDate: string
  endDate?: string | null
  status?: string | null
  serviceId?: number | null
  serviceName?: string | null
  serviceDuration?: number | null
  professionalId?: number | null
  professionalName?: string | null
  clientName?: string | null
  clientPhone?: string | null
}

export interface AppointmentRescheduleState {
  pendingAppointments?: AppointmentRescheduleAppointment[]
  selectedAppointmentId?: number
  selectedDate?: string
  selectedTime?: string
}

export interface UserRuntimeContext {
  phone: string
  workingHours: BusinessWorkingHour[]
  services: BusinessService[]
  professionals: BusinessProfessional[]
  settings: BusinessSettings
  businessId?: string
  businessPhone?: string
  businessName?: string
  businessType?: string
  userName?: string
  clientName?: string | null
  awaitingClientName?: boolean
  appointmentReschedule?: AppointmentRescheduleState | null
  activeRegistration: {
    type?: string
    step?: string
    editingField?: string
    awaitingInputForField?: string
    lastCreatedRecordId?: string
    editMode?: boolean
    [key: string]: any
  }
  [key: string]: any
}

const userContexts: Record<string, UserRuntimeContext> = {}
const userContextStore = createUserContextStore({
  ttlEnvVar: EnvKeys.REDIS_USER_CONTEXT_TTL_SEC,
  defaultTtlSec: 3600,
})

export async function setUserContext(phone: string, partial: Partial<UserRuntimeContext>) {
  if (!phone) return
  const sanitized: Partial<UserRuntimeContext> = {}
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      ;(sanitized as Record<string, unknown>)[key] = value as unknown
    }
  }
  userContexts[phone] = { ...(userContexts[phone] || {}), ...sanitized }
  await userContextStore.save(phone, userContexts[phone])
}

export async function getUserContext(phone: string): Promise<UserRuntimeContext | undefined> {
  const stored = await userContextStore.load(phone)
  if (stored) {
    userContexts[phone] = stored
    return stored
  }
  return userContexts[phone]
}

export function getUserContextSync(phone: string): UserRuntimeContext | undefined {
  return userContexts[phone]
}

export function getBusinessIdForPhone(phone: string): string {
  console.log('asdasdasdasdasdasdasdas', userContexts[phone])

  return userContexts[phone]?.businessId || ''
}

export function getBusinessPhoneForPhone(phone: string): string {
  return userContexts[phone]?.businessPhone || ''
}

export function getBusinessNameForPhone(phone: string): string {
  return userContexts[phone]?.businessName || ''
}

export function getBusinessTypeForPhone(phone: string): string {
  return userContexts[phone]?.businessType || ''
}

export function getUserNameForPhone(phone: string): string {
  return userContexts[phone]?.userName || ''
}

export function getClientNameForPhone(phone: string): string | null {
  return userContexts[phone]?.clientName || null
}

export async function setBusinessInfoForPhone(phone: string, businessId: string, businessName: string, businessType: string, businessPhone?: string) {
  if (phone && businessId) {
    await setUserContext(phone, { businessId, businessName, businessType, businessPhone })
  }
}

export async function resetActiveRegistration(phone: string) {
  await setUserContext(phone, {
    activeRegistration: {
      type: undefined,
      step: FlowStep.Initial,
      editingField: undefined,
      awaitingInputForField: undefined,
      lastCreatedRecordId: undefined,
    },
  })
}
