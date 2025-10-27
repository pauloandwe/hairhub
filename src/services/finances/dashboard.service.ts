import api from '../../config/api.config'

export class DashboardService {
  private servicePrefix = process.env.FINANCES_URL

  async getTotalDisbursementByPeriod(farmId: string, advancedFilters?: { harvest?: string } | string): Promise<any> {
    const params: any = {
      advancedFilters,
    }

    return api.get(this.servicePrefix + `/chat/disbursement/${farmId}`, {
      params,
    })
  }
}
