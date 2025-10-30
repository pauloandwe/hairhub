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
}

export const barberService = new BarberService()
