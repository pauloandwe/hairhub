import { BusinessConfig } from '../types/business.types'
import { CacheKeys } from '../helpers/Enums'

// Mock storage using Map (Redis integration can be added later)
const businessConfigCache = new Map<string, BusinessConfig>()

/**
 * Get business configuration by WhatsApp phone number
 * This is the multi-tenant resolver - each phone number maps to a business
 */
export async function getBusinessConfigByPhone(phone: string): Promise<BusinessConfig | null> {
  // Try to get from cache
  const cached = businessConfigCache.get(phone)
  if (cached) {
    return cached
  }

  // In production, this would call an external API
  // For now, return null and let the caller use default config
  return null
}

/**
 * Cache business configuration for a phone number
 */
export async function cacheBusinessConfig(phone: string, config: BusinessConfig): Promise<void> {
  businessConfigCache.set(phone, config)
}

/**
 * Get default business configuration (fallback when none found)
 */
export function getDefaultBusinessConfig(): BusinessConfig {
  return {
    id: 'default',
    name: 'BarberHub',
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
      // Sunday
      { dayOfWeek: 0, openTime: '00:00', closeTime: '00:00', closed: true },
    ],
    services: [
      { id: '1', name: 'Corte Simples', description: 'Corte de cabelo tradicional', duration: 30, price: 40, active: true },
      { id: '2', name: 'Corte + Barba', description: 'Corte de cabelo + barba completa', duration: 50, price: 65, active: true },
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
}

/**
 * Get or create business config for a phone number
 */
export async function getOrCreateBusinessConfig(phone: string): Promise<BusinessConfig> {
  const existing = await getBusinessConfigByPhone(phone)
  if (existing) {
    return existing
  }

  // Return default config
  const defaultConfig = getDefaultBusinessConfig()
  return defaultConfig
}
