import api from '../../config/api.config'
import { unwrapApiResponse } from '../../utils/http'

export interface ClientData {
  id: number
  businessId: number
  phone: string
  name: string | null
  nickname: string | null
  birthDate: string | null
  servicePreferences: string | null
  restrictions: string | null
  aiContext: string | null
  createdAt: Date
  updatedAt: Date
}

export class ClientsService {
  private servicePrefix = process.env.API_URL

  async getClientByPhone(businessId: string, phone: string): Promise<ClientData | null> {
    try {
      const response = await api.get(`${this.servicePrefix}/clients/${businessId}/${phone}`)
      const data = unwrapApiResponse<ClientData | undefined>(response)
      return data || null
    } catch (error) {
      console.error('[ClientsService] Error fetching client:', error)
      return null
    }
  }

  async createOrUpdateClientName(businessId: string, phone: string, name: string): Promise<ClientData> {
    try {
      const response = await api.post(`${this.servicePrefix}/clients/${businessId}/update-name`, {
        phone,
        name,
      })
      const data = unwrapApiResponse<ClientData | undefined>(response)
      if (!data) {
        throw new Error('Failed to update client name')
      }
      return data
    } catch (error) {
      console.error('[ClientsService] Error updating client name:', error)
      throw error
    }
  }
}

export const clientsService = new ClientsService()
