import { SelectionItem } from '../generic/generic.types'
import { getBusinessIdForPhone, getBusinessPhoneForPhone } from '../../env.config'
import api from '../../config/api.config'
import { env } from '../../env.config'

export class BarberService {
  async getBarbers(phone: string): Promise<SelectionItem[]> {
    const businessId = getBusinessIdForPhone(phone)
    const normalizedBusinessId = businessId ? String(businessId).trim() : ''

    if (!normalizedBusinessId) {
      console.warn('[BarberService] business identifiers not found for phone:', phone)
      return []
    }

    try {
      const url = `${env.APPOINTMENTS_URL}/barbers`
      const params: Record<string, string> = {}
      if (normalizedBusinessId) {
        params.businessId = normalizedBusinessId
      }

      const response = await api.get(url, { params })

      const data = response?.data?.data?.data ?? response?.data?.data ?? []
      if (!Array.isArray(data)) {
        console.error('[BarberService] Invalid response structure:', response)
        return []
      }

      return data.map((item) => ({
        id: String(item.id),
        name: item.name || '',
      }))
    } catch (error) {
      console.error('[BarberService] Error fetching barbers:', error)
      throw new Error('Erro ao listar barbeiros disponíveis.')
    }
  }

  async getAvailableSlots(args: { phone: string; barberId?: string | number | null; date?: string | null; serviceId?: string | number | null }): Promise<string[]> {
    const { phone, barberId, date, serviceId } = args
    const businessPhone = getBusinessPhoneForPhone(phone)
    const normalizedBusinessPhone = businessPhone ? String(businessPhone).trim() : ''
    console.log('Normalized Business Phone:', { normalizedBusinessPhone, businessPhone, phone, barberId, date, serviceId })

    if (!normalizedBusinessPhone) {
      console.warn('[BarberService] business identifiers not found for phone:', phone)
      return []
    }

    const resolvedBarberId = barberId !== undefined && barberId !== null ? String(barberId).trim() : ''
    if (!resolvedBarberId) {
      console.warn('[BarberService] barberId not provided while fetching slots.', { phone })
      return []
    }

    if (!date) {
      console.warn('[BarberService] date not provided while fetching slots.', { phone, barberId: resolvedBarberId })
      return []
    }

    if (serviceId === undefined || serviceId === null || String(serviceId).trim() === '') {
      console.warn('[BarberService] serviceId not provided while fetching slots.', { phone, barberId: resolvedBarberId })
      return []
    }

    const numericServiceId = Number(serviceId)
    if (!Number.isFinite(numericServiceId)) {
      console.warn('[BarberService] serviceId is not numeric while fetching slots.', { phone, barberId: resolvedBarberId, serviceId })
      return []
    }

    try {
      const params: Record<string, any> = {
        date,
        serviceId: numericServiceId,
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/barbers/${encodeURIComponent(resolvedBarberId)}/free-slots`
      const response = await api.get(url, { params })

      const data = response?.data?.data?.data
      if (!data || !data.barber || !Array.isArray(data.barber.slots)) {
        console.warn('[BarberService] Invalid slots structure:', response?.data)
        return []
      }

      const slots = data.barber.slots.map((slot: any) => slot.start)
      return slots
    } catch (error) {
      console.error('[BarberService] Error fetching available slots:', error)
      throw new Error('Erro ao buscar horários disponíveis.')
    }
  }

  async getAvailableDays(args: { phone: string; barberId: string | number; serviceId?: string | number }): Promise<SelectionItem[]> {
    const { phone, barberId, serviceId } = args
    const businessPhone = getBusinessPhoneForPhone(phone)
    const normalizedBusinessPhone = businessPhone ? String(businessPhone).trim() : ''

    if (!normalizedBusinessPhone) {
      console.warn('[BarberService] business phone not found for phone:', phone)
      return []
    }

    const resolvedBarberId = barberId !== undefined && barberId !== null ? String(barberId).trim() : ''
    if (!resolvedBarberId) {
      console.warn('[BarberService] barberId not provided while fetching available days.', { phone })
      return []
    }

    try {
      const params: Record<string, any> = {
        days: 15,  // Próximos 15 dias
      }

      if (serviceId !== undefined && serviceId !== null) {
        const numericServiceId = Number(serviceId)
        if (Number.isFinite(numericServiceId)) {
          params.serviceId = numericServiceId
        }
      }

      const url = `${env.APPOINTMENTS_URL}/business/phone/${encodeURIComponent(normalizedBusinessPhone)}/barbers/${encodeURIComponent(resolvedBarberId)}/available-days`
      const response = await api.get(url, { params })

      const data = response?.data?.data?.data
      if (!data) {
        console.warn('[BarberService] Invalid response structure for available days:', response?.data)
        return []
      }

      if (!Array.isArray(data.availableDays)) {
        console.warn('[BarberService] availableDays is not an array:', data)
        return []
      }

      if (data.availableDays.length === 0) {
        console.info('[BarberService] No available days found for barberId:', resolvedBarberId)
        return []
      }

      // Transformar em SelectionItem para compatibilidade com o select flow
      return data.availableDays.map((day: any) => {
        // Garantir que day tem os campos esperados
        if (!day.date || !day.displayDate) {
          console.warn('[BarberService] Day object missing required fields:', day)
          return null
        }

        return {
          id: day.date,
          name: day.displayDate,
          description: `${day.slotsCount || 0} horários disponíveis`,
        }
      }).filter((item: any) => item !== null)
    } catch (error) {
      console.error('[BarberService] Error fetching available days:', error)
      throw new Error('Erro ao buscar dias disponíveis.')
    }
  }
}

export const barberService = new BarberService()
