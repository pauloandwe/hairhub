import api from '../../config/api.config'

export class WeatherService {
  private servicePrefix = process.env.FARMS_URL

  async getAmountAccumulated(filters?: { harvest?: string } | string): Promise<any> {
    const params: any = {
      advancedFilters: filters,
    }

    return api.get(this.servicePrefix + `/chat/climate_data/query-panel`, {
      params,
    })
  }
}
