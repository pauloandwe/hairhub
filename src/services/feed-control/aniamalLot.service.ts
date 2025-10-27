import api from '../../config/api.config'

export class AnimalLotService {
  private servicePrefix = process.env.FEED_CONTROL_URL + '/animal-lot'

  async getQuantityAnimalLot(farmId: string, filters?: { name?: string } | string): Promise<any> {
    const params: any = {
      filters: filters,
    }

    return api.get(this.servicePrefix + `/chat/${farmId}`, {
      params,
    })
  }
}
