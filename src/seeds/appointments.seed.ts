import { createAppointment } from '../api/appointments.api'
import { AppointmentCreatePayload } from '../types/appointment.types'

/**
 * Seed sample appointments for testing
 */
export async function seedAppointments(): Promise<void> {
  console.log('🌱 Seeding sample appointments...')

  const now = new Date()

  // Helper to create future date
  const getFutureDate = (daysAhead: number, hour: number, minute: number = 0): string => {
    const date = new Date(now)
    date.setDate(date.getDate() + daysAhead)
    date.setHours(hour, minute, 0, 0)
    return date.toISOString()
  }

  // Helper to create past date
  const getPastDate = (daysAgo: number, hour: number, minute: number = 0): string => {
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    date.setHours(hour, minute, 0, 0)
    return date.toISOString()
  }

  // Sample appointments for Barbershop Alpha
  const alphaAppointments: AppointmentCreatePayload[] = [
    // Future appointments
    {
      customerName: 'Cliente Teste',
      customerPhone: '5511999999999',
      barberId: '1',
      serviceId: '1',
      dateTime: getFutureDate(2, 14, 0),
      duration: 30,
      businessId: 'alpha',
      notes: 'Primeiro agendamento de teste',
    },
    {
      customerName: 'Cliente Teste',
      customerPhone: '5511999999999',
      barberId: '2',
      serviceId: '2',
      dateTime: getFutureDate(5, 10, 30),
      duration: 50,
      businessId: 'alpha',
      notes: 'Segundo agendamento',
    },
    {
      customerName: 'Outro Cliente',
      customerPhone: '5511987654321',
      barberId: '1',
      serviceId: '3',
      dateTime: getFutureDate(1, 15, 0),
      duration: 20,
      businessId: 'alpha',
    },
    // Past appointments
    {
      customerName: 'Cliente Teste',
      customerPhone: '5511999999999',
      barberId: '3',
      serviceId: '1',
      dateTime: getPastDate(7, 11, 0),
      duration: 30,
      businessId: 'alpha',
      notes: 'Agendamento passado',
    },
  ]

  // Sample appointments for Barbershop Beta
  const betaAppointments: AppointmentCreatePayload[] = [
    {
      customerName: 'Cliente Beta',
      customerPhone: '5511888888888',
      barberId: '1',
      serviceId: '1',
      dateTime: getFutureDate(3, 11, 0),
      duration: 30,
      businessId: 'beta',
    },
    {
      customerName: 'Cliente Beta',
      customerPhone: '5511888888888',
      barberId: '2',
      serviceId: '2',
      dateTime: getFutureDate(7, 14, 30),
      duration: 45,
      businessId: 'beta',
    },
  ]

  // Create all appointments
  const allAppointments = [...alphaAppointments, ...betaAppointments]

  for (const apt of allAppointments) {
    try {
      await createAppointment(apt)
    } catch (error) {
      console.error('Error creating appointment:', error)
    }
  }

  console.log(`✅ Created ${allAppointments.length} sample appointments`)
}
