export interface TimeSlot {
  time: string
  available: boolean
  barberId?: number
}

export class AvailabilityService {
  async getAvailableTimeSlots(businessId: number, date: string, barberId?: number): Promise<TimeSlot[]> {
    // TODO: Implementar busca de horários disponíveis da API
    return []
  }

  async checkAvailability(businessId: number, date: string, time: string, barberId?: number): Promise<boolean> {
    // TODO: Implementar verificação de disponibilidade
    return true
  }
}

export const availabilityService = new AvailabilityService()
