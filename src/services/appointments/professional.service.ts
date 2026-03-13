import { SelectionItem } from '../generic/generic.types'
import { getBusinessIdForPhone, getBusinessPhoneForPhone, getUserContext } from '../../env.config'
import api from '../../config/api.config'
import { env } from '../../env.config'
import { unwrapApiResponse } from '../../utils/http'

export const PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES = 30
const SAFE_RETRYABLE_REQUEST_CODES = new Set(['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE'])

export interface ProfessionalAvailableSlotsDetail {
  rawSlots: string[]
  displaySlots: string[]
  displayIntervalMinutes: number
}

export interface AggregatedAvailableSlotEntry {
  start: string
  professionals: { id: string; name: string }[]
}

export interface AggregatedAvailableSlotsDetail {
  rawSlots: AggregatedAvailableSlotEntry[]
  displaySlots: AggregatedAvailableSlotEntry[]
  displayIntervalMinutes: number
}

function resolveAvailableDaysLookahead(): number {
  const configured = Number(env.APPOINTMENT_AVAILABLE_DAYS_LOOKAHEAD)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 62
}

export class ProfessionalService {
  async getProfessionals(phone: string, serviceId?: string | number | null): Promise<SelectionItem[]> {
    const { businessId: normalizedBusinessId } = await this.resolveBusinessContext(phone, 'getProfessionals')

    if (!normalizedBusinessId) {
      console.warn('[ProfessionalService] business identifiers not found for phone:', phone)
      return []
    }

    try {
      const url = `${env.APPOINTMENTS_URL}/professionals`
      const params: Record<string, string> = {}
      if (normalizedBusinessId) {
        params.businessId = normalizedBusinessId
      }
      if (serviceId !== undefined && serviceId !== null && String(serviceId).trim() !== '') {
        const numericServiceId = Number(serviceId)
        if (Number.isFinite(numericServiceId)) {
          params.serviceId = String(numericServiceId)
        }
      }
      params.onlyWithConfiguredSchedule = 'true'

      const response = await this.performGetRequest(url, params, {
        phone,
        businessId: normalizedBusinessId,
        serviceId,
        operation: 'getProfessionals',
      })
      const data = unwrapApiResponse<any[]>(response) ?? []
      if (!Array.isArray(data)) {
        console.error('[ProfessionalService] Invalid response structure:', response)
        return []
      }

      const activeProfessionals = data.filter((item) => {
        if (!item || typeof item !== 'object') return false
        if (item.active === false) return false
        return item.id !== undefined && item.id !== null
      })

      if (activeProfessionals.length !== data.length) {
        console.info('[ProfessionalService] Filtered inactive professionals from listing.', {
          total: data.length,
          active: activeProfessionals.length,
        })
      }

      return activeProfessionals.map((item) => ({
        id: String(item.id),
        name: item.name || '',
      }))
    } catch (error) {
      console.error('[ProfessionalService] Error fetching professionals:', error)
      throw new Error('Erro ao listar barbeiros disponíveis.')
    }
  }

  async getAvailableSlots(args: { phone: string; professionalId?: string | number | null; date?: string | null; serviceId?: string | number | null; excludeAppointmentId?: string | number | null; stepMinutes?: number }): Promise<string[]> {
    const detail = await this.getAvailableSlotsDetailed(args)
    return detail.rawSlots
  }

  async getAvailableSlotsDetailed(args: { phone: string; professionalId?: string | number | null; date?: string | null; serviceId?: string | number | null; excludeAppointmentId?: string | number | null; stepMinutes?: number }): Promise<ProfessionalAvailableSlotsDetail> {
    const { phone, professionalId, date, serviceId, excludeAppointmentId, stepMinutes } = args
    const { businessPhone: normalizedBusinessPhone, businessId } = await this.resolveBusinessContext(phone, 'getAvailableSlots')

    if (!normalizedBusinessPhone) {
      console.warn('[ProfessionalService] business identifiers not found for phone:', phone)
      return { rawSlots: [], displaySlots: [], displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES }
    }

    const resolvedProfessionalId = professionalId !== undefined && professionalId !== null ? String(professionalId).trim() : ''
    if (!resolvedProfessionalId) {
      console.warn('[ProfessionalService] professionalId not provided while fetching slots.', { phone })
      return { rawSlots: [], displaySlots: [], displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES }
    }

    if (!date) {
      console.warn('[ProfessionalService] date not provided while fetching slots.', { phone, professionalId: resolvedProfessionalId })
      return { rawSlots: [], displaySlots: [], displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES }
    }

    const normalizedServiceId = serviceId !== undefined && serviceId !== null && String(serviceId).trim() !== '' ? Number(serviceId) : null
    if (normalizedServiceId !== null && !Number.isFinite(normalizedServiceId)) {
      console.warn('[ProfessionalService] serviceId is not numeric while fetching slots.', { phone, professionalId: resolvedProfessionalId, serviceId })
      return { rawSlots: [], displaySlots: [], displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES }
    }

    try {
      const params: Record<string, any> = { date }
      const normalizedStepMinutes = this.normalizePositiveInteger(stepMinutes)

      if (normalizedStepMinutes !== null) {
        params.stepMinutes = normalizedStepMinutes
      }

      if (normalizedServiceId !== null) {
        params.serviceId = normalizedServiceId
      }

      if (excludeAppointmentId !== undefined && excludeAppointmentId !== null && String(excludeAppointmentId).trim() !== '') {
        const numericExcludeId = Number(excludeAppointmentId)
        if (Number.isFinite(numericExcludeId)) {
          params.excludeAppointmentId = numericExcludeId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/professionals/${encodeURIComponent(resolvedProfessionalId)}/free-slots`
      const response = await this.performGetRequest(url, params, {
        phone,
        businessId,
        businessPhone: normalizedBusinessPhone,
        professionalId: resolvedProfessionalId,
        date,
        serviceId,
        excludeAppointmentId,
        operation: 'getAvailableSlots',
      })
      const data = unwrapApiResponse<any>(response)
      if (!data || !data.professional || !Array.isArray(data.professional.slots)) {
        console.warn('[ProfessionalService] Invalid slots structure:', response?.data)
        return { rawSlots: [], displaySlots: [], displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES }
      }

      return {
        rawSlots: this.extractTimeList(data.professional.slots),
        displaySlots: this.extractTimeList(data.professional.displaySlots),
        displayIntervalMinutes: this.normalizePositiveInteger(data.displayIntervalMinutes) ?? PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES,
      }
    } catch (error) {
      console.error('[ProfessionalService] Error fetching available slots:', error)
      throw new Error('Erro ao buscar horários disponíveis.')
    }
  }

  async getAvailableDays(args: { phone: string; professionalId: string | number; serviceId?: string | number; stepMinutes?: number }): Promise<SelectionItem[]> {
    const { phone, professionalId, serviceId, stepMinutes } = args
    const { businessPhone: normalizedBusinessPhone, businessId } = await this.resolveBusinessContext(phone, 'getAvailableDays')

    if (!normalizedBusinessPhone) {
      console.warn('[ProfessionalService] business phone not found for phone:', phone)
      return []
    }

    const resolvedProfessionalId = professionalId !== undefined && professionalId !== null ? String(professionalId).trim() : ''
    if (!resolvedProfessionalId) {
      console.warn('[ProfessionalService] professionalId not provided while fetching available days.', { phone })
      return []
    }

    try {
      const params: Record<string, any> = {
        days: resolveAvailableDaysLookahead(),
      }
      const normalizedStepMinutes = this.normalizePositiveInteger(stepMinutes)

      if (normalizedStepMinutes !== null) {
        params.stepMinutes = normalizedStepMinutes
      }

      if (serviceId !== undefined && serviceId !== null) {
        const numericServiceId = Number(serviceId)
        if (Number.isFinite(numericServiceId)) {
          params.serviceId = numericServiceId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/professionals/${encodeURIComponent(resolvedProfessionalId)}/available-days`
      const response = await this.performGetRequest(url, params, {
        phone,
        businessId,
        businessPhone: normalizedBusinessPhone,
        professionalId: resolvedProfessionalId,
        serviceId,
        operation: 'getAvailableDays',
      })
      const data = unwrapApiResponse<any>(response)
      if (!data) {
        console.warn('[ProfessionalService] Invalid response structure for available days:', response?.data)
        return []
      }

      if (!Array.isArray(data.availableDays)) {
        console.warn('[ProfessionalService] availableDays is not an array:', data)
        return []
      }

      if (data.availableDays.length === 0) {
        console.info('[ProfessionalService] No available days found for professionalId:', resolvedProfessionalId)
        return []
      }

      return data.availableDays
        .map((day: any): SelectionItem | null => {
          if (!day.date || !day.displayDate) {
            console.warn('[ProfessionalService] Day object missing required fields:', day)
            return null
          }

          return {
            id: day.date,
            name: day.displayDate,
            description: `${day.slotsCount || 0} horários disponíveis`,
          }
        })
        .filter((item: SelectionItem | null): item is SelectionItem => item !== null)
    } catch (error) {
      console.error('[ProfessionalService] Error fetching available days:', error)
      throw new Error('Erro ao buscar dias disponíveis.')
    }
  }

  async getAvailableDaysAggregated(args: { phone: string; serviceId?: string | number; stepMinutes?: number }): Promise<SelectionItem[]> {
    const { phone, serviceId, stepMinutes } = args
    const { businessPhone: normalizedBusinessPhone, businessId } = await this.resolveBusinessContext(phone, 'getAvailableDaysAggregated')

    if (!normalizedBusinessPhone) {
      console.warn('[ProfessionalService] business phone not found for phone:', phone)
      return []
    }

    try {
      const params: Record<string, any> = {
        days: resolveAvailableDaysLookahead(),
      }
      const normalizedStepMinutes = this.normalizePositiveInteger(stepMinutes)

      if (normalizedStepMinutes !== null) {
        params.stepMinutes = normalizedStepMinutes
      }

      if (serviceId !== undefined && serviceId !== null) {
        const numericServiceId = Number(serviceId)
        if (Number.isFinite(numericServiceId)) {
          params.serviceId = numericServiceId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/available-days-aggregated`
      const response = await this.performGetRequest(url, params, {
        phone,
        businessId,
        businessPhone: normalizedBusinessPhone,
        serviceId,
        operation: 'getAvailableDaysAggregated',
      })
      const data = unwrapApiResponse<any>(response)
      if (!data) {
        console.warn('[ProfessionalService] Invalid response structure for aggregated available days:', response?.data)
        return []
      }

      if (!Array.isArray(data)) {
        console.warn('[ProfessionalService] aggregated availableDays is not an array:', data)
        return []
      }

      if (data.length === 0) {
        console.info('[ProfessionalService] No available days found (aggregated)')
        return []
      }

      return data
        .map((day: any): SelectionItem | null => {
          if (!day.date || !day.displayDate) {
            console.warn('[ProfessionalService] Day object missing required fields:', day)
            return null
          }

          return {
            id: day.date,
            name: day.displayDate,
            description: `${day.slotsCount || 0} horários disponíveis`,
          }
        })
        .filter((item: SelectionItem | null): item is SelectionItem => item !== null)
    } catch (error) {
      console.error('[ProfessionalService] Error fetching aggregated available days:', error)
      throw new Error('Erro ao buscar dias disponíveis.')
    }
  }

  private normalizeString(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed.length ? trimmed : null
    }
    if (value === undefined || value === null) return null
    const converted = String(value).trim()
    return converted.length ? converted : null
  }

  async getAvailableSlotsAggregated(args: { phone: string; date: string; serviceId?: string | number; excludeAppointmentId?: string | number | null; stepMinutes?: number }): Promise<{ start: string; professionals: { id: string; name: string }[] }[]> {
    const detail = await this.getAvailableSlotsAggregatedDetailed(args)
    return detail.rawSlots
  }

  async getAvailableSlotsAggregatedDetailed(args: { phone: string; date: string; serviceId?: string | number; excludeAppointmentId?: string | number | null; stepMinutes?: number }): Promise<AggregatedAvailableSlotsDetail> {
    const { phone, date, serviceId, excludeAppointmentId, stepMinutes } = args
    const { businessPhone: normalizedBusinessPhone, businessId } = await this.resolveBusinessContext(phone, 'getAvailableSlotsAggregated')

    if (!normalizedBusinessPhone) {
      console.warn('[ProfessionalService] business phone not found for phone:', phone)
      return {
        rawSlots: [],
        displaySlots: [],
        displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES,
      }
    }

    if (!date) {
      console.warn('[ProfessionalService] date not provided while fetching aggregated slots.', { phone })
      return {
        rawSlots: [],
        displaySlots: [],
        displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES,
      }
    }

    try {
      const params: Record<string, any> = { date }
      const normalizedStepMinutes = this.normalizePositiveInteger(stepMinutes)

      if (normalizedStepMinutes !== null) {
        params.stepMinutes = normalizedStepMinutes
      }

      if (serviceId !== undefined && serviceId !== null) {
        const numericServiceId = Number(serviceId)
        if (Number.isFinite(numericServiceId)) {
          params.serviceId = numericServiceId
        }
      }

      if (excludeAppointmentId !== undefined && excludeAppointmentId !== null && String(excludeAppointmentId).trim() !== '') {
        const numericExcludeId = Number(excludeAppointmentId)
        if (Number.isFinite(numericExcludeId)) {
          params.excludeAppointmentId = numericExcludeId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/free-slots`
      const response = await this.performGetRequest(url, params, {
        phone,
        businessId,
        businessPhone: normalizedBusinessPhone,
        date,
        serviceId,
        excludeAppointmentId,
        operation: 'getAvailableSlotsAggregated',
      })
      const data = unwrapApiResponse<any>(response)
      if (!data || !data.professionals || !Array.isArray(data.professionals)) {
        console.warn('[ProfessionalService] Invalid slots structure for aggregated:', response?.data)
        return {
          rawSlots: [],
          displaySlots: [],
          displayIntervalMinutes: PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES,
        }
      }

      const rawSlotMap = new Map<string, Map<string, { id: string; name: string }>>()
      const displaySlotMap = new Map<string, Map<string, { id: string; name: string }>>()

      data.professionals.forEach((professionalEntry: any) => {
        const professionalData = professionalEntry?.professional ?? professionalEntry
        const rawId = professionalData?.id ?? professionalEntry?.id ?? professionalEntry?.professionalId
        const rawName = professionalData?.name ?? professionalEntry?.name ?? ''

        const id = this.normalizeString(rawId)
        if (!id) return
        const name = this.normalizeString(rawName) ?? id

        const rawSlotsSource = Array.isArray(professionalEntry?.slots) ? professionalEntry.slots : Array.isArray(professionalData?.slots) ? professionalData.slots : []
        const displaySlotsSource = Array.isArray(professionalEntry?.displaySlots) ? professionalEntry.displaySlots : Array.isArray(professionalData?.displaySlots) ? professionalData.displaySlots : []

        this.appendSlotEntries(rawSlotMap, rawSlotsSource, { id, name })
        this.appendSlotEntries(displaySlotMap, displaySlotsSource, { id, name })
      })

      return {
        rawSlots: this.mapSlotEntries(rawSlotMap),
        displaySlots: this.mapSlotEntries(displaySlotMap),
        displayIntervalMinutes: this.normalizePositiveInteger(data.displayIntervalMinutes) ?? PUBLIC_SLOT_DISPLAY_INTERVAL_MINUTES,
      }
    } catch (error) {
      console.error('[ProfessionalService] Error fetching aggregated available slots:', error)
      throw new Error('Erro ao buscar horários disponíveis.')
    }
  }

  private async resolveBusinessContext(phone: string, _operation: string): Promise<{ businessId: string; businessPhone: string; hydratedFromStore: boolean }> {
    const inMemoryBusinessId = this.normalizeString(getBusinessIdForPhone(phone)) ?? ''
    const inMemoryBusinessPhone = this.normalizeString(getBusinessPhoneForPhone(phone)) ?? ''

    if (inMemoryBusinessId && inMemoryBusinessPhone) {
      return {
        businessId: inMemoryBusinessId,
        businessPhone: inMemoryBusinessPhone,
        hydratedFromStore: false,
      }
    }

    const runtimeContext = await getUserContext(phone)
    const hydratedBusinessId = this.normalizeString(runtimeContext?.businessId) ?? inMemoryBusinessId
    const hydratedBusinessPhone = this.normalizeString(runtimeContext?.businessPhone) ?? inMemoryBusinessPhone

    return {
      businessId: hydratedBusinessId,
      businessPhone: hydratedBusinessPhone,
      hydratedFromStore: true,
    }
  }

  private async performGetRequest(url: string, params: Record<string, any>, _metadata: Record<string, unknown>): Promise<any> {
    let attempt = 0

    while (true) {
      try {
        attempt += 1
        return await api.get(url, { params })
      } catch (error) {
        const shouldRetry = attempt < 2 && this.isRetryableTransportError(error)

        if (!shouldRetry) {
          throw error
        }
      }
    }
  }

  private isRetryableTransportError(error: unknown): boolean {
    const errorObject = error as Record<string, any> | undefined
    const raw = errorObject?.raw as Record<string, any> | undefined
    const errorCode = this.normalizeString(raw?.code ?? errorObject?.code) ?? undefined

    return !raw?.response && !errorObject?.response && Boolean(errorCode && SAFE_RETRYABLE_REQUEST_CODES.has(errorCode))
  }

  private extractTimeList(slotsSource: any): string[] {
    if (!Array.isArray(slotsSource)) {
      return []
    }

    return slotsSource.map((slot) => this.normalizeString(slot?.start ?? slot?.startTime ?? slot)).filter((slot): slot is string => Boolean(slot))
  }

  private normalizePositiveInteger(value: unknown): number | null {
    const normalized = Number(value)
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return null
    }

    return Math.floor(normalized)
  }

  private appendSlotEntries(slotMap: Map<string, Map<string, { id: string; name: string }>>, slotsSource: any[], professional: { id: string; name: string }): void {
    if (!Array.isArray(slotsSource) || slotsSource.length === 0) {
      return
    }

    slotsSource.forEach((slot: any) => {
      const start = this.normalizeString(slot?.start ?? slot?.startTime ?? slot)
      if (!start) return

      const professionalMap = slotMap.get(start) ?? new Map<string, { id: string; name: string }>()
      if (!professionalMap.has(professional.id)) {
        professionalMap.set(professional.id, professional)
      }
      slotMap.set(start, professionalMap)
    })
  }

  private mapSlotEntries(slotMap: Map<string, Map<string, { id: string; name: string }>>): AggregatedAvailableSlotEntry[] {
    return Array.from(slotMap.entries())
      .map(([start, professionalsMap]) => ({
        start,
        professionals: Array.from(professionalsMap.values()),
      }))
      .filter((entry) => entry.professionals.length > 0)
      .sort((a, b) => a.start.localeCompare(b.start))
  }
}

export const professionalService = new ProfessionalService()
