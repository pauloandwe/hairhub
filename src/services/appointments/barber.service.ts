import { SelectionItem } from '../generic/generic.types'

export class BarberService {
  async getBarbers(businessId: number): Promise<SelectionItem[]> {
    // TODO: Implementar busca de barbeiros da API
    return []
  }

  async getBarberAvailability(businessId: number, barberId: number, date: string): Promise<string[]> {
    // TODO: Implementar busca de disponibilidade do barbeiro
    return []
  }
}

export const barberService = new BarberService()
