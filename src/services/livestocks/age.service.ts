import api from '../../config/api.config'

export interface AgeCategory {
  id: string
  name: string
}

export interface AgeGroup {
  id: string
  name: string
  categories: AgeCategory[]
}

export class AgeCategoryService {
  private servicePrefix = process.env.LIVESTOCKS_URL

  async listAgeGroups(): Promise<AgeGroup[]> {
    const params = {
      advancedFilters: 'active:EQ:true',
    }

    try {
      const response = await api.get(this.servicePrefix + `/ages/with-categories`, {
        params,
      })

      return response?.data?.data
    } catch (e) {
      throw new Error('Erro ao listar grupos de idade.')
    }
  }
}
