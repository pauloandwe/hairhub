import 'dotenv/config'
import { InstitutionType } from './enums/institutions.enum'
import { FlowStep } from './enums/generic.enum'
import { createUserContextStore } from './services/user-context-store'
import { EnvKeys } from './helpers/Enums'
import type { PendingAppointmentOffer, PendingAvailabilityResolution } from './services/appointments/appointment.types'
import type { AppointmentDateInterpretation } from './utils/appointment-date-resolution'

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
  PHONE_NUMBER_ID: process.env.PHONE_NUMBER_ID,
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
  APPOINTMENT_AVAILABLE_DAYS_LOOKAHEAD: process.env.APPOINTMENT_AVAILABLE_DAYS_LOOKAHEAD || String(62),
  WHATSAPP_SEND_TIMEOUT_MS: process.env.WHATSAPP_SEND_TIMEOUT_MS || String(10000),
  WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS: process.env.WHATSAPP_SEND_SAFE_RETRY_ATTEMPTS || String(1),
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
  businessTimezone?: string | null
  status?: string | null
  serviceId?: number | null
  serviceName?: string | null
  serviceDuration?: number | null
  professionalId?: number | null
  professionalName?: string | null
  clientName?: string | null
  clientPhone?: string | null
  notes?: string | null
}

export interface AppointmentRescheduleState {
  pendingAppointments?: AppointmentRescheduleAppointment[]
  selectedAppointmentId?: number
  selectedDate?: string
  selectedTime?: string
}

export interface AppointmentCancellationState {
  upcomingAppointments?: AppointmentRescheduleAppointment[]
  selectedAppointmentId?: number
}

export interface ClientPersonalizationProfile {
  clientName?: string | null
  clientNickname?: string | null
  clientBirthDate?: string | null
  clientServicePreferences?: string | null
  clientRestrictions?: string | null
  clientAiContext?: string | null
}

export interface OutreachReplyContext {
  type: string
  businessName: string
  clientName: string | null
  sentAt: string
  message: string
  metadata: Record<string, any>
}

export type ClientNameCapturePhase = 'AWAITING_FIRST' | 'AWAITING_SECOND'

export interface ClientNameCaptureState {
  phase: ClientNameCapturePhase
  firstMessageText?: string | null
  waitingStartedAt?: string | null
  waitingDeadlineAt?: string | null
}

export interface ActiveRegistrationPendingStep {
  field: string
  mode: 'creating' | 'editing'
  replayUi?: {
    surface?: 'list'
    listCard?: {
      header?: string
      body: string
      footer?: string
      buttonLabel: string
    }
  }
}

export interface PendingAppointmentDateClarification {
  functionName: 'getAvailableTimeSlots' | 'startAppointmentRegistration'
  argsSnapshot: Record<string, any>
  originalMessage: string
  partialInterpretation: AppointmentDateInterpretation | null
  createdAt: string
  expiresAt: string
}

export interface UserRuntimeContext {
  phone: string
  workingHours: BusinessWorkingHour[]
  services: BusinessService[]
  professionals: BusinessProfessional[]
  settings: BusinessSettings
  businessId?: string
  businessPhone?: string
  businessTimezone?: string | null
  phoneNumberId?: string | null
  businessName?: string
  businessType?: string
  assistantContext?: string | null
  userName?: string
  clientName?: string | null
  clientNickname?: string | null
  clientBirthDate?: string | null
  clientServicePreferences?: string | null
  clientRestrictions?: string | null
  clientAiContext?: string | null
  awaitingClientName?: boolean
  clientNameCapture?: ClientNameCaptureState | null
  appointmentReschedule?: AppointmentRescheduleState | null
  appointmentCancellation?: AppointmentCancellationState | null
  pendingAppointmentOffer?: PendingAppointmentOffer | null
  pendingAvailabilityResolution?: PendingAvailabilityResolution | null
  pendingAppointmentDateClarification?: PendingAppointmentDateClarification | null
  outreachReply?: OutreachReplyContext | null
  activeRegistration: {
    type?: string
    step?: string
    editingField?: string
    awaitingInputForField?: string
    pendingStep?: ActiveRegistrationPendingStep
    lastCreatedRecordId?: string
    editMode?: boolean
    completedDraftSnapshot?: Record<string, any>
    editSessionBaseSnapshot?: Record<string, any>
    editSessionDraftSnapshot?: Record<string, any>
    editSessionPendingUpdates?: Record<string, any>
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
  return userContexts[phone]?.businessId || ''
}

export function getBusinessPhoneForPhone(phone: string): string {
  return userContexts[phone]?.businessPhone || ''
}

export function getBusinessTimezoneForPhone(phone: string): string {
  return userContexts[phone]?.businessTimezone || ''
}

export function getBusinessNameForPhone(phone: string): string {
  return userContexts[phone]?.businessName || ''
}

export function getPhoneNumberIdForPhone(phone: string): string {
  return userContexts[phone]?.phoneNumberId || ''
}

export function getBusinessTypeForPhone(phone: string): string {
  return userContexts[phone]?.businessType || ''
}

export function getAssistantContextForPhone(phone: string): string {
  return userContexts[phone]?.assistantContext || ''
}

export function getUserNameForPhone(phone: string): string {
  return userContexts[phone]?.userName || ''
}

export function getClientNameForPhone(phone: string): string | null {
  return userContexts[phone]?.clientName || null
}

export function getClientPersonalizationForPhone(phone: string): ClientPersonalizationProfile {
  const context = userContexts[phone]
  return {
    clientName: context?.clientName ?? null,
    clientNickname: context?.clientNickname ?? null,
    clientBirthDate: context?.clientBirthDate ?? null,
    clientServicePreferences: context?.clientServicePreferences ?? null,
    clientRestrictions: context?.clientRestrictions ?? null,
    clientAiContext: context?.clientAiContext ?? null,
  }
}

export function getClientPersonalizationContextForPhone(phone: string): string {
  const profile = getClientPersonalizationForPhone(phone)
  const chunks: string[] = []

  if (profile.clientNickname) {
    chunks.push(`Apelido preferido: ${profile.clientNickname}`)
  }
  if (profile.clientBirthDate) {
    chunks.push(`Data de aniversário: ${profile.clientBirthDate}`)
  }
  if (profile.clientServicePreferences) {
    chunks.push(`Preferências de atendimento: ${profile.clientServicePreferences}`)
  }
  if (profile.clientRestrictions) {
    chunks.push(`Restrições/sensibilidades: ${profile.clientRestrictions}`)
  }
  if (profile.clientAiContext) {
    chunks.push(`Contexto adicional de personalização: ${profile.clientAiContext}`)
  }

  if (chunks.length === 0) {
    return ''
  }

  return chunks.join('\n')
}

export async function setBusinessInfoForPhone(phone: string, businessId: string, businessName: string, businessType: string, businessPhone?: string, assistantContext?: string | null, phoneNumberId?: string | null) {
  if (phone && businessId) {
    await setUserContext(phone, { businessId, businessName, businessType, businessPhone, assistantContext, phoneNumberId })
  }
}

export async function resetActiveRegistration(phone: string) {
  await setUserContext(phone, {
    activeRegistration: {
      type: undefined,
      step: FlowStep.Initial,
      editingField: undefined,
      awaitingInputForField: undefined,
      pendingStep: undefined,
      lastCreatedRecordId: undefined,
    },
    serviceId: null,
    serviceName: null,
    professionalId: null,
    professionalName: null,
    availableProfessionalIdsForSlot: null,
    autoAssignedProfessional: false,
    timeSlot: null,
  })
}
