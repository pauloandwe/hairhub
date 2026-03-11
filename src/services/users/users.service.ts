import api from '../../config/api.config'

export class UsersService {
  private servicePrefix = process.env.API_URL

  async getBusinessByPhone(businessPhone: string, clientPhone: string): Promise<any> {
    return api.get(this.servicePrefix + `/auth/business-phone/${businessPhone}/${clientPhone}`)
  }

  async changeFarmAISettings(phone: string, farmId: string): Promise<any> {
    return api.post(this.servicePrefix + `/user-ai-settings/farm/${phone}`, {
      data: { farmId },
    })
  }

  async changeInstitutionAISettings(phone: string, institutionId: string): Promise<any> {
    return api.post(this.servicePrefix + `/user-ai-settings/institution/${phone}`, {
      data: { institutionId },
    })
  }
}

export const usersService = new UsersService()
