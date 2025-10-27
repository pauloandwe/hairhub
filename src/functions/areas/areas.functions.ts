import { AreasService } from '../../services/areas/areas.service'

const areasService = new AreasService()

export const areasFunctions: {
  [key: string]: (args: any) => Promise<any>
} = {
  getCurrentHerd: async (args: { farmId: string }) => {
    try {
      const response = await areasService.getCurrentHerd(args.farmId)

      return response.data
    } catch (error) {
      console.error('Erro ao buscar rebanho atual:', error)
      throw error
    }
  },
}
