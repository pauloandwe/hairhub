import { WeatherService } from '../../services/farms/weather.service'
import { dateFunctions } from '../utils/date.functions'

const weatherService = new WeatherService()

export const weatherFunctions: {
  [key: string]: (args: any) => Promise<any>
} = {
  getWeatherAmountAccumulated: async (args: { harvest: string; farmId: string }) => {
    try {
      const response = await weatherService.getAmountAccumulated(`harvest:LIKE:${args.harvest};farmId:IN:${args.farmId}`)

      return response.data
    } catch (error) {
      console.error('Erro ao buscar dados climáticos:', error)
      throw error
    }
  },
  getCurrentCropWeatherAccumulated: async (args: { farmId?: string }) => {
    try {
      const currentCrop = await dateFunctions.getCurrentCropYear({})

      const response = await weatherService.getAmountAccumulated(`harvest:LIKE:${currentCrop.cropYear};farmId:IN:${args.farmId || ''}`)

      return {
        ...response.data,
        cropInfo: {
          cropYear: currentCrop.cropYear,
          startDate: currentCrop.startDate,
          endDate: currentCrop.endDate,
          referenceDate: currentCrop.referenceDate,
        },
      }
    } catch (error) {
      console.error('Erro ao buscar dados climáticos da safra atual:', error)
      throw error
    }
  },
  getPreviousCropWeatherAccumulated: async (args: { farmId?: string }) => {
    try {
      const previousCrop = await dateFunctions.getPreviousCropYear({})

      const response = await weatherService.getAmountAccumulated(`harvest:LIKE:${previousCrop.cropYear};farmId:IN:${args.farmId || ''}`)

      return {
        ...response.data,
        cropInfo: {
          cropYear: previousCrop.cropYear,
          startDate: previousCrop.startDate,
          endDate: previousCrop.endDate,
          referenceDate: previousCrop.referenceDate,
        },
      }
    } catch (error) {
      console.error('Erro ao buscar dados climáticos da safra passada:', error)
      throw error
    }
  },
}
