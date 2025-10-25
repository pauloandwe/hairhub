import { BusinessConfig } from '../types/business.types'
import { cacheBusinessConfig } from '../api/business.api'

/**
 * Seed mock barbershop data
 */
export async function seedBarbershops(): Promise<void> {
  console.log('🌱 Seeding barbershop data...')

  // Barbershop Alpha - Full featured
  const barbershopAlpha: BusinessConfig = {
    id: 'alpha',
    name: 'Barbearia Alpha',
    phone: '5511999999999',
    type: 'barbershop',
    workingHours: [
      // Monday to Friday
      { dayOfWeek: 1, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
      { dayOfWeek: 2, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
      { dayOfWeek: 3, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
      { dayOfWeek: 4, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
      { dayOfWeek: 5, openTime: '09:00', closeTime: '18:00', breakStart: '12:00', breakEnd: '13:00', closed: false },
      // Saturday
      { dayOfWeek: 6, openTime: '09:00', closeTime: '14:00', closed: false },
      // Sunday closed
      { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', closed: true },
    ],
    services: [
      { id: '1', name: 'Corte Simples', description: 'Corte de cabelo tradicional', duration: 30, price: 40, active: true },
      {
        id: '2',
        name: 'Corte + Barba',
        description: 'Corte de cabelo + barba completa',
        duration: 50,
        price: 65,
        active: true,
      },
      { id: '3', name: 'Barba', description: 'Aparar e modelar barba', duration: 20, price: 30, active: true },
      { id: '4', name: 'Platinado', description: 'Descoloração completa', duration: 90, price: 120, active: true },
      { id: '5', name: 'Relaxamento', description: 'Relaxamento capilar', duration: 60, price: 80, active: true },
    ],
    barbers: [
      { id: '1', name: 'João', specialties: ['Corte', 'Barba'], active: true },
      { id: '2', name: 'Pedro', specialties: ['Corte', 'Platinado'], active: true },
      { id: '3', name: 'Carlos', specialties: ['Barba', 'Relaxamento'], active: true },
    ],
    settings: {
      reminderHours: [24, 2],
      enableReminders: true,
      allowCancellation: true,
      cancellationDeadlineHours: 2,
      allowReschedule: true,
      rescheduleDeadlineHours: 2,
      autoConfirmAppointments: true,
    },
  }

  // Barbershop Beta - Smaller shop
  const barbershopBeta: BusinessConfig = {
    id: 'beta',
    name: 'Barbearia Beta',
    phone: '5511888888888',
    type: 'barbershop',
    workingHours: [
      // Tuesday to Saturday
      { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', closed: true }, // Sunday
      { dayOfWeek: 1, openTime: '00:00', closeTime: '00:00', closed: true }, // Monday
      { dayOfWeek: 2, openTime: '10:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00', closed: false },
      { dayOfWeek: 3, openTime: '10:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00', closed: false },
      { dayOfWeek: 4, openTime: '10:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00', closed: false },
      { dayOfWeek: 5, openTime: '10:00', closeTime: '19:00', breakStart: '13:00', breakEnd: '14:00', closed: false },
      { dayOfWeek: 6, openTime: '10:00', closeTime: '16:00', closed: false },
    ],
    services: [
      { id: '1', name: 'Corte', description: 'Corte masculino', duration: 30, price: 35, active: true },
      { id: '2', name: 'Corte + Barba', description: 'Combo completo', duration: 45, price: 55, active: true },
      { id: '3', name: 'Barba', description: 'Barba', duration: 20, price: 25, active: true },
      { id: '4', name: 'Corte Infantil', description: 'Corte para crianças', duration: 20, price: 30, active: true },
    ],
    barbers: [
      { id: '1', name: 'Roberto', specialties: ['Corte', 'Barba'], active: true },
      { id: '2', name: 'Marcos', specialties: ['Corte', 'Barba'], active: true },
    ],
    settings: {
      reminderHours: [24],
      enableReminders: true,
      allowCancellation: true,
      cancellationDeadlineHours: 4,
      allowReschedule: true,
      rescheduleDeadlineHours: 4,
      autoConfirmAppointments: true,
    },
  }

  // Cache businesses
  await cacheBusinessConfig(barbershopAlpha.phone, barbershopAlpha)
  await cacheBusinessConfig(barbershopBeta.phone, barbershopBeta)

  console.log('✅ Barbershop Alpha configured for phone:', barbershopAlpha.phone)
  console.log('✅ Barbershop Beta configured for phone:', barbershopBeta.phone)
}
