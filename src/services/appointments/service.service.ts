import { SelectionItem } from '../generic/generic.types'
import { getBusinessIdForPhone } from '../../env.config'
import api from '../../config/api.config'
import { env } from '../../env.config'

export class ServiceService {
  async getServices(phone: string): Promise<SelectionItem[]> {
    const businessId = getBusinessIdForPhone(phone)
    if (!businessId) {
      console.warn('[ServiceService] businessId not found for phone:', phone)
      return []
    }

    try {
      const url = `${env.APPOINTMENTS_URL}/phone/${businessId}/services`
      const response = await api.get(url)

      const data = response?.data?.data ?? response?.data ?? []
      if (!Array.isArray(data)) {
        console.error('[ServiceService] Invalid response structure:', response)
        return []
      }

      return data
        .filter((item) => item.active !== false) // Filter only active services
        .map((item) => ({
          id: String(item.id),
          name: item.name || item.description || '',
        }))
    } catch (error) {
      console.error('[ServiceService] Error fetching services:', error)
      throw new Error('Erro ao listar serviços da barbearia.')
    }
  }
}

export const serviceService = new ServiceService()
