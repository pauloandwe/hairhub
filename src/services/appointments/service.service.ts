import { SelectionItem } from '../generic/generic.types'

export class ServiceService {
  async getServices(businessId: number): Promise<SelectionItem[]> {
    // TODO: Implementar busca de serviços da API
    return []
  }
}

export const serviceService = new ServiceService()
