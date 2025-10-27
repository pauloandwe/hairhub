import { AnimalLotService } from '../../services/feed-control/aniamalLot.service'

const animalLotService = new AnimalLotService()

export const animalLotFunctions: {
  [key: string]: (args: any) => Promise<any>
} = {
  getAnimalQuantity: async (args: { lotName: string; farmId: string }) => {
    try {
      const response = await animalLotService.getQuantityAnimalLot(args.farmId, `name:${args.lotName}`)

      const data = response.data

      if (data && data.lotName) {
        const quantity = data.totalAnimals || data.quantity || 0
        return `Lote: ${data.lotName}\nQuantidade de animais: ${quantity}`
      }

      return `Não consegui obter informações sobre o lote ${args.lotName}.`
    } catch (error) {
      console.error('Erro ao buscar lotes de animais:', error)
      return `Não consegui obter informações sobre o lote ${args.lotName}.`
    }
  },
}
