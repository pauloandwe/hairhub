import { SelectionItem } from '../generic/generic.types'
import { getBusinessIdForPhone } from '../../env.config'
import api from '../../config/api.config'
import { env } from '../../env.config'

export class BarberService {
  async getBarbers(phone: string): Promise<SelectionItem[]> {
    const businessId = getBusinessIdForPhone(phone)
    if (!businessId) {
      console.warn('[BarberService] businessId not found for phone:', phone)
      return []
    }

    try {
      const url = `${env.APPOINTMENTS_URL}/phone/${businessId}/barbers`
      const response = await api.get(url)

      const data = response?.data?.data ?? response?.data ?? []
      if (!Array.isArray(data)) {
        console.error('[BarberService] Invalid response structure:', response)
        return []
      }

      return data
        .filter((item) => item.active !== false) // Filter only active barbers
        .map((item) => ({
          id: String(item.id),
          name: item.name || '',
        }))
    } catch (error) {
      console.error('[BarberService] Error fetching barbers:', error)
      throw new Error('Erro ao listar barbeiros disponíveis.')
    }
  }

  async getAvailableSlots(phone: string, date?: string, serviceId?: number): Promise<string[]> {
    const businessId = getBusinessIdForPhone(phone)
    if (!businessId) {
      console.warn('[BarberService] businessId not found for phone:', phone)
      return []
    }

    try {
      const params: Record<string, any> = {}
      if (date) params.date = date
      if (serviceId) params.serviceId = serviceId

      const url = `${env.APPOINTMENTS_URL}/phone/${businessId}/free-slots`
      const response = await api.get(url, { params })

      const data = response?.data?.data ?? response?.data ?? []
      if (!Array.isArray(data)) {
        console.error('[BarberService] Invalid response structure:', response)
        return []
      }

      return data
    } catch (error) {
      console.error('[BarberService] Error fetching available slots:', error)
      throw new Error('Erro ao buscar horários disponíveis.')
    }
  }
}

export const barberService = new BarberService()
