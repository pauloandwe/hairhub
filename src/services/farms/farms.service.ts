import api from '../../config/api.config'
import { FarmSelectionError } from './farm.errors'

export interface FarmSummary {
  id: string
  name: string
}

export class FarmsService {
  private servicePrefix = process.env.FARMS_URL

  async listFarms(phone: string): Promise<any> {
    const params: any = {
      page: 1,
      pageSize: 100,
      filters: `institutionId:`,
      advancedFilters: 'active:EQ:true',
    }

    try {
      const response = await api.get(this.servicePrefix + ``, { params })

      if (response?.data?.data?.data) {
        return response.data.data.data ?? []
      }

      throw new FarmSelectionError('LIST_REQUEST_FAILED', 'Falha ao listar fazendas.')
    } catch (error) {
      if (error instanceof FarmSelectionError) {
        throw error
      }

      throw new FarmSelectionError('LIST_REQUEST_FAILED', 'Não consegui carregar as fazendas.', error)
    }
  }
}
