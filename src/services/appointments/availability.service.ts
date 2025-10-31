export interface TimeSlot {
  time: string
  available: boolean
  barberId?: number
}

export class AvailabilityService {
  async getAvailableTimeSlots(businessId: number, date: string, barberId?: number): Promise<TimeSlot[]> {
    return []
  }

  async checkAvailability(businessId: number, date: string, time: string, barberId?: number): Promise<boolean> {
    return true
  }
}

export const availabilityService = new AvailabilityService()
