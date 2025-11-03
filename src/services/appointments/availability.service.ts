export interface TimeSlot {
  time: string
  available: boolean
  professionalId?: number
}

export class AvailabilityService {
  async getAvailableTimeSlots(businessId: number, date: string, professionalId?: number): Promise<TimeSlot[]> {
    return []
  }

  async checkAvailability(businessId: number, date: string, time: string, professionalId?: number): Promise<boolean> {
    return true
  }
}

export const availabilityService = new AvailabilityService()
