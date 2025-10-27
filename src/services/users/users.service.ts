import api from '../../config/api.config'

export class UsersService {
  private servicePrefix = process.env.API_URL

  async getBusiness(businessId: string, phone: string): Promise<any> {
    // const mockBusinessData = {
    //   data: {
    //     data: {
    //       id: 153,
    //       token: 'mocked_token_abc123',
    //       name: 'BarberHub',
    //       phone: '5511999999999',
    //       type: 'barbershop',
    //       workingHours: [
    //         // Monday to Friday
    //         { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
    //         { dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
    //         { dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
    //         { dayOfWeek: 4, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
    //         { dayOfWeek: 5, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
    //         // Saturday
    //         { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00', closed: false },
    //         // Sunday
    //         { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', closed: true },
    //       ],
    //       services: [
    //         { id: '1', name: 'Corte Simples', description: 'Corte de cabelo tradicional', duration: 30, price: 40, active: true },
    //         { id: '2', name: 'Corte + Barba', description: 'Corte de cabelo + barba completa', duration: 50, price: 65, active: true },
    //         { id: '3', name: 'Barba', description: 'Aparar e modelar barba', duration: 20, price: 30, active: true },
    //         { id: '4', name: 'Platinado', description: 'Descoloração completa', duration: 90, price: 120, active: true },
    //         { id: '5', name: 'Relaxamento', description: 'Relaxamento capilar', duration: 60, price: 80, active: true },
    //       ],
    //       barbers: [
    //         { id: '1', name: 'João', specialties: ['Corte', 'Barba'], active: true },
    //         { id: '2', name: 'Pedro', specialties: ['Corte', 'Platinado'], active: true },
    //         { id: '3', name: 'Carlos', specialties: ['Barba', 'Relaxamento'], active: true },
    //       ],
    //       settings: {
    //         reminderHours: [24, 2],
    //         enableReminders: true,
    //         allowCancellation: true,
    //         cancellationDeadlineHours: 2,
    //         allowReschedule: true,
    //         rescheduleDeadlineHours: 2,
    //         autoConfirmAppointments: true,
    //       },
    //     },
    //   },
    // }
    // return mockBusinessData
    return api.get(this.servicePrefix + `/auth/${businessId}/${phone}`)
  }

  async changeFarmAISettings(phone: string, farmId: string): Promise<any> {
    return api.post(this.servicePrefix + `/user-ai-settings/farm/${phone}`, {
      data: { farmId },
    })
  }

  async changeInstitutionAISettings(phone: string, institutionId: string): Promise<any> {
    return api.post(this.servicePrefix + `/user-ai-settings/institution/${phone}`, {
      data: { institutionId },
    })
  }
}

export const usersService = new UsersService()
