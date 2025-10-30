import api from '../../config/api.config'

export interface AnimalLotOption {
  id: string
  lotId?: string | null
  lotName?: string | null
  areaId: string
  areaName: string
  retreatId: string
  retreatName: string
}

export class AnimalLotSelectionService {
  private servicePrefix = process.env.AREAS_URL

  async listAnimalLots(farmId: string, onlyWithAnimals = true): Promise<AnimalLotOption[]> {
    if (!farmId) {
      throw new Error('Fazenda não selecionada. Selecione uma fazenda antes de continuar.')
    }
    const params = {
      onlyWithAnimals: onlyWithAnimals,
    }

    try {
      const response = await api.get(this.servicePrefix + `/all-flow/${farmId}`, {
        params,
      })

      const items = response?.data?.data

      return items.map((it: AnimalLotOption) => {
        const lotId = it?.lotId ?? null
        const id = lotId ? `${it.retreatId}|${it.areaId}|${lotId}` : `${it.retreatId}|${it.areaId}`
        return {
          ...it,
          lotId,
          id,
        } as AnimalLotOption
      })
    } catch (e) {
      throw new Error('Erro ao listar lotes de animais.')
    }
  }
}
