import { DashboardService } from '../../services/finances/dashboard.service'
import { DateFormatter } from '../../utils/date'
import { generateFilterText } from '../../utils/genereteText'
import { dateFunctions } from '../utils/date.functions'

const dashboardService = new DashboardService()

export const dashboardFunctions: {
  [key: string]: (args: any) => Promise<any>
} = {
  getTotalDisbursementByPeriod: async (args: { farmId: string; harvest: string; startDate?: string; endDate?: string; harvestId?: string }) => {
    try {
      const filters: any = {}

      const params = DateFormatter.formatParameters({
        startDate: args.startDate,
        endDate: args.endDate,
        harvest: args.harvest,
      })

      if (params.startDate && params.endDate) {
        filters.dateRange = {
          op: 'BETWEEN',
          value: [params.startDate, params.endDate],
        }
      }

      if (args.harvestId) {
        filters.harvestId = { op: 'EQ', value: args.harvestId }
      } else {
        filters.harvest = { op: 'LIKE', value: params.harvest }
      }

      const advancedFilters = generateFilterText(filters)

      const response = await dashboardService.getTotalDisbursementByPeriod(args.farmId, advancedFilters)

      return response.data
    } catch (error) {
      console.error('Erro ao buscar dados climáticos:', error)
      throw error
    }
  },
  getCurrentMonthDisbursement: async (args: { farmId?: string; harvest?: string; harvestId?: string }) => {
    try {
      const monthPeriod = await dateFunctions.getCurrentMonthPeriod({})

      const result = await dashboardFunctions.getTotalDisbursementByPeriod({
        farmId: args.farmId || '',
        harvest: args.harvest || '',
        harvestId: args.harvestId,
        startDate: monthPeriod.startDate,
        endDate: monthPeriod.endDate,
      })

      return {
        ...result,
        period: {
          startDate: monthPeriod.startDate,
          endDate: monthPeriod.endDate,
          monthName: monthPeriod.monthName,
          year: monthPeriod.year,
        },
      }
    } catch (error) {
      console.error('Erro ao buscar desembolso do mês atual:', error)
      throw error
    }
  },
  getPreviousCropDisbursement: async (args: { farmId?: string }) => {
    try {
      const previousCrop = await dateFunctions.getPreviousCropYear({})

      const result = await dashboardFunctions.getTotalDisbursementByPeriod({
        farmId: args.farmId || '',
        harvest: previousCrop.cropYear,
        startDate: previousCrop.startDate,
        endDate: previousCrop.endDate,
      })

      return {
        ...result,
        cropInfo: {
          cropYear: previousCrop.cropYear,
          startDate: previousCrop.startDate,
          endDate: previousCrop.endDate,
          referenceDate: previousCrop.referenceDate,
        },
      }
    } catch (error) {
      console.error('Erro ao buscar desembolso da safra passada:', error)
      throw error
    }
  },
  getCurrentCropDisbursement: async (args: { farmId?: string }) => {
    try {
      const currentCrop = await dateFunctions.getCurrentCropYear({})

      const result = await dashboardFunctions.getTotalDisbursementByPeriod({
        farmId: args.farmId || '',
        harvest: currentCrop.cropYear,
        startDate: currentCrop.startDate,
        endDate: currentCrop.endDate,
      })

      return {
        ...result,
        cropInfo: {
          cropYear: currentCrop.cropYear,
          startDate: currentCrop.startDate,
          endDate: currentCrop.endDate,
          referenceDate: currentCrop.referenceDate,
        },
      }
    } catch (error) {
      console.error('Erro ao buscar desembolso da safra passada:', error)
      throw error
    }
  },
}
