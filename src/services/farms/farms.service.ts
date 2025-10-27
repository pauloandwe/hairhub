import api from '../../config/api.config'

export interface FarmSummary {
  id: string
  name: string
}

export class FarmsService {
  private servicePrefix = process.env.FARMS_URL

  async listFarms(phone: string): Promise<any> {
    return []
  }
}
