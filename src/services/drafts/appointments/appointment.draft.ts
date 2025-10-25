import { AppointmentDraft } from '../../../types/appointment.types'
import { createDraftStore } from '../draft-store'
import { CacheKeys, EnvKeys } from '../../../helpers/Enums'

const appointmentDraftStore = createDraftStore<AppointmentDraft>({
  keyPrefix: `${CacheKeys.CHAT_DRAFT}:appointment`,
  empty: createEmptyDraft,
  ttlEnvVar: EnvKeys.REDIS_DRAFT_TTL_SEC,
  defaultTtlSec: 500,
})

export async function getAppointmentDraft(phone: string): Promise<AppointmentDraft | null> {
  const draft = await appointmentDraftStore.load(phone)
  return draft
}

export async function setAppointmentDraft(phone: string, draft: AppointmentDraft): Promise<void> {
  await appointmentDraftStore.save(phone, draft)
}

export async function clearAppointmentDraft(phone: string): Promise<void> {
  await appointmentDraftStore.clear(phone)
}

export async function updateAppointmentDraftField<K extends keyof AppointmentDraft>(
  phone: string,
  field: K,
  value: AppointmentDraft[K]
): Promise<void> {
  const currentDraft = await getAppointmentDraft(phone) || createEmptyDraft()
  currentDraft[field] = value
  await setAppointmentDraft(phone, currentDraft)
}

export function createEmptyDraft(): AppointmentDraft {
  return {
    serviceId: null,
    service: null,
    barberId: null,
    barber: null,
    date: null,
    time: null,
    duration: null,
    notes: null,
  }
}
