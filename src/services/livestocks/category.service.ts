import api from '../../config/api.config'

export interface Category {
  id: string
  name: string
}

export class CategoryService {
  private servicePrefix = process.env.LIVESTOCKS_URL

  async listCategoryGroups(ageId: string): Promise<Category[]> {
    const params = {
      advancedFilters: 'active:EQ:true',
    }

    try {
      const response = await api.get(this.servicePrefix + `/categories/by-age/${ageId}`, {
        params,
      })

      return response?.data?.data
    } catch (e) {
      throw new Error('Erro ao listar grupos de categorias.')
    }
  }
}
