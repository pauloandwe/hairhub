import { SelectionItem } from '../generic/generic.types'
import { getBusinessIdForPhone, getBusinessPhoneForPhone } from '../../env.config'
import api from '../../config/api.config'
import { env } from '../../env.config'
import { unwrapApiResponse } from '../../utils/http'

export const PUBLIC_SLOT_STEP_MINUTES = 5

function resolveAvailableDaysLookahead(): number {
  const configured = Number(env.APPOINTMENT_AVAILABLE_DAYS_LOOKAHEAD)
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 62
}

export class ProfessionalService {
  async getProfessionals(phone: string, serviceId?: string | number | null): Promise<SelectionItem[]> {
    const businessId = getBusinessIdForPhone(phone)
    const normalizedBusinessId = businessId ? String(businessId).trim() : ''

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

      const response = await api.get(url, { params })
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
    const { phone, professionalId, date, serviceId, excludeAppointmentId, stepMinutes } = args
    const businessPhone = getBusinessPhoneForPhone(phone)
    const normalizedBusinessPhone = businessPhone ? String(businessPhone).trim() : ''
    console.log('Normalized Business Phone:', { normalizedBusinessPhone, businessPhone, phone, professionalId, date, serviceId })

    if (!normalizedBusinessPhone) {
      console.warn('[ProfessionalService] business identifiers not found for phone:', phone)
      return []
    }

    const resolvedProfessionalId = professionalId !== undefined && professionalId !== null ? String(professionalId).trim() : ''
    if (!resolvedProfessionalId) {
      console.warn('[ProfessionalService] professionalId not provided while fetching slots.', { phone })
      return []
    }

    if (!date) {
      console.warn('[ProfessionalService] date not provided while fetching slots.', { phone, professionalId: resolvedProfessionalId })
      return []
    }

    if (serviceId === undefined || serviceId === null || String(serviceId).trim() === '') {
      console.warn('[ProfessionalService] serviceId not provided while fetching slots.', { phone, professionalId: resolvedProfessionalId })
      return []
    }

    const numericServiceId = Number(serviceId)
    if (!Number.isFinite(numericServiceId)) {
      console.warn('[ProfessionalService] serviceId is not numeric while fetching slots.', { phone, professionalId: resolvedProfessionalId, serviceId })
      return []
    }

    try {
      const params: Record<string, any> = {
        date,
        serviceId: numericServiceId,
        stepMinutes: stepMinutes ?? PUBLIC_SLOT_STEP_MINUTES,
      }

      if (excludeAppointmentId !== undefined && excludeAppointmentId !== null && String(excludeAppointmentId).trim() !== '') {
        const numericExcludeId = Number(excludeAppointmentId)
        if (Number.isFinite(numericExcludeId)) {
          params.excludeAppointmentId = numericExcludeId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/professionals/${encodeURIComponent(resolvedProfessionalId)}/free-slots`
      const response = await api.get(url, { params })
      const data = unwrapApiResponse<any>(response)
      if (!data || !data.professional || !Array.isArray(data.professional.slots)) {
        console.warn('[ProfessionalService] Invalid slots structure:', response?.data)
        return []
      }

      const slots = data.professional.slots.map((slot: any) => slot.start)
      return slots
    } catch (error) {
      console.error('[ProfessionalService] Error fetching available slots:', error)
      throw new Error('Erro ao buscar horários disponíveis.')
    }
  }

  async getAvailableDays(args: { phone: string; professionalId: string | number; serviceId?: string | number; stepMinutes?: number }): Promise<SelectionItem[]> {
    const { phone, professionalId, serviceId, stepMinutes } = args
    const businessPhone = getBusinessPhoneForPhone(phone)
    const normalizedBusinessPhone = businessPhone ? String(businessPhone).trim() : ''

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
        stepMinutes: stepMinutes ?? PUBLIC_SLOT_STEP_MINUTES,
      }

      if (serviceId !== undefined && serviceId !== null) {
        const numericServiceId = Number(serviceId)
        if (Number.isFinite(numericServiceId)) {
          params.serviceId = numericServiceId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/professionals/${encodeURIComponent(resolvedProfessionalId)}/available-days`
      const response = await api.get(url, { params })
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
    const businessPhone = getBusinessPhoneForPhone(phone)
    const normalizedBusinessPhone = businessPhone ? String(businessPhone).trim() : ''

    if (!normalizedBusinessPhone) {
      console.warn('[ProfessionalService] business phone not found for phone:', phone)
      return []
    }

    try {
      const params: Record<string, any> = {
        days: resolveAvailableDaysLookahead(),
        stepMinutes: stepMinutes ?? PUBLIC_SLOT_STEP_MINUTES,
      }

      if (serviceId !== undefined && serviceId !== null) {
        const numericServiceId = Number(serviceId)
        if (Number.isFinite(numericServiceId)) {
          params.serviceId = numericServiceId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/available-days-aggregated`
      const response = await api.get(url, { params })
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
    const { phone, date, serviceId, excludeAppointmentId, stepMinutes } = args
    const businessPhone = getBusinessPhoneForPhone(phone)
    const normalizedBusinessPhone = businessPhone ? String(businessPhone).trim() : ''

    if (!normalizedBusinessPhone) {
      console.warn('[ProfessionalService] business phone not found for phone:', phone)
      return []
    }

    if (!date) {
      console.warn('[ProfessionalService] date not provided while fetching aggregated slots.', { phone })
      return []
    }

    try {
      const params: Record<string, any> = {
        date,
        stepMinutes: stepMinutes ?? PUBLIC_SLOT_STEP_MINUTES,
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
      const response = await api.get(url, { params })
      const data = unwrapApiResponse<any>(response)
      if (!data || !data.professionals || !Array.isArray(data.professionals)) {
        console.warn('[ProfessionalService] Invalid slots structure for aggregated:', response?.data)
        return []
      }

      const slotMap = new Map<string, Map<string, { id: string; name: string }>>()

      data.professionals.forEach((professionalEntry: any) => {
        const professionalData = professionalEntry?.professional ?? professionalEntry
        const rawId = professionalData?.id ?? professionalEntry?.id ?? professionalEntry?.professionalId
        const rawName = professionalData?.name ?? professionalEntry?.name ?? ''

        const id = this.normalizeString(rawId)
        if (!id) return
        const name = this.normalizeString(rawName) ?? id

        const slotsSource = Array.isArray(professionalEntry?.slots) ? professionalEntry.slots : Array.isArray(professionalData?.slots) ? professionalData.slots : []

        if (!Array.isArray(slotsSource) || slotsSource.length === 0) {
          return
        }

        slotsSource.forEach((slot: any) => {
          const start = this.normalizeString(slot?.start ?? slot?.startTime ?? slot)
          if (!start) return

          const professionalMap = slotMap.get(start) ?? new Map<string, { id: string; name: string }>()
          if (!professionalMap.has(id)) {
            professionalMap.set(id, { id, name })
          }
          slotMap.set(start, professionalMap)
        })
      })

      const aggregatedSlots = Array.from(slotMap.entries())
        .map(([start, professionalsMap]) => ({
          start,
          professionals: Array.from(professionalsMap.values()),
        }))
        .filter((entry) => entry.professionals.length > 0)
        .sort((a, b) => a.start.localeCompare(b.start))

      return aggregatedSlots
    } catch (error) {
      console.error('[ProfessionalService] Error fetching aggregated available slots:', error)
      throw new Error('Erro ao buscar horários disponíveis.')
    }
  }
}

export const professionalService = new ProfessionalService()
