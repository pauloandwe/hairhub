import api from '../../config/api.config'

export class AreasService {
  private servicePrefix = process.env.AREAS_URL

  async getCurrentHerd(farmId: string): Promise<any> {
    return api.get(`${this.servicePrefix}/chat/${farmId}`)
  }
}
