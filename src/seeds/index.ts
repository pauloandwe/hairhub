import { seedBarbershops } from './barbershop.seed'
import { seedAppointments } from './appointments.seed'

/**
 * Seed all mock data
 */
export async function seedMockData(): Promise<void> {
  console.log('🌱 Starting data seeding...')

  try {
    await seedBarbershops()
    await seedAppointments()

    console.log('✅ All mock data seeded successfully!')
  } catch (error) {
    console.error('❌ Error seeding data:', error)
    throw error
  }
}
