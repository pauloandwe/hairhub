import axios from 'axios'
import { whatsappLogger } from '../../utils/pino'
import { env } from '../../env.config'

export interface ClientPreference {
  businessPhone: string
  clientPhone: string
  remindersEnabled: boolean
  optOutDate?: Date
}

const BACKEND_URL = env.BACKEND_URL || 'http://localhost:3001'

export class ReminderPreferencesService {
  private static preferencesCache: Map<string, ClientPreference> = new Map()
  private static readonly CACHE_TTL = 1000 * 60 * 60

  static async shouldSendReminder(businessPhone: string, clientPhone: string): Promise<boolean> {
    try {
      const preferences = await this.getClientPreferences(businessPhone, clientPhone)
      return preferences.remindersEnabled !== false
    } catch (error) {
      whatsappLogger.warn(
        {
          businessPhone,
          clientPhone,
          error: (error as any)?.message,
        },
        'Erro ao verificar preferências de lembrete, permitindo envio por padrão',
      )

      return true
    }
  }

  private static async getClientPreferences(businessPhone: string, clientPhone: string): Promise<ClientPreference> {
    const cacheKey = this.buildCacheKey(businessPhone, clientPhone)
    const cached = this.preferencesCache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      const response = await axios.get(`${BACKEND_URL}/client-preferences/business/${encodeURIComponent(businessPhone)}/phone/${encodeURIComponent(clientPhone)}`, {
        headers: this.buildHeaders(),
        timeout: 5000,
      })

      const preferences = {
        businessPhone,
        clientPhone,
        remindersEnabled: response.data?.remindersEnabled !== false,
        optOutDate: response.data?.optOutDate,
      }

      this.preferencesCache.set(cacheKey, preferences)
      const cacheExpirationTimer = setTimeout(() => this.preferencesCache.delete(cacheKey), this.CACHE_TTL)
      cacheExpirationTimer.unref?.()

      return preferences
    } catch (error: any) {
      whatsappLogger.warn(
        {
          businessPhone,
          clientPhone,
          statusCode: error?.response?.status,
          error: error?.message,
        },
        'Falha ao buscar preferências de cliente',
      )
      throw error
    }
  }

  static async optOut(businessPhone: string, clientPhone: string): Promise<void> {
    try {
      await axios.put(
        `${BACKEND_URL}/client-preferences/opt-out`,
        {
          businessPhone,
          clientPhone,
        },
        {
          headers: this.buildHeaders(),
          timeout: 5000,
        },
      )

      this.preferencesCache.set(this.buildCacheKey(businessPhone, clientPhone), {
        businessPhone,
        clientPhone,
        remindersEnabled: false,
        optOutDate: new Date(),
      })

      whatsappLogger.info(
        {
          businessPhone,
          clientPhone,
        },
        'Cliente optou por sair dos lembretes',
      )
    } catch (error: any) {
      whatsappLogger.error(
        {
          businessPhone,
          clientPhone,
          error: error?.message,
        },
        'Falha ao registrar opt-out',
      )
      throw error
    }
  }

  static async optIn(businessPhone: string, clientPhone: string): Promise<void> {
    try {
      await axios.put(
        `${BACKEND_URL}/client-preferences/opt-in`,
        {
          businessPhone,
          clientPhone,
        },
        {
          headers: this.buildHeaders(),
          timeout: 5000,
        },
      )

      this.preferencesCache.set(this.buildCacheKey(businessPhone, clientPhone), {
        businessPhone,
        clientPhone,
        remindersEnabled: true,
      })

      whatsappLogger.info(
        {
          businessPhone,
          clientPhone,
        },
        'Cliente voltou a receber lembretes',
      )
    } catch (error: any) {
      whatsappLogger.error(
        {
          businessPhone,
          clientPhone,
          error: error?.message,
        },
        'Falha ao registrar opt-in',
      )
      throw error
    }
  }

  static clearCache(): void {
    this.preferencesCache.clear()
    whatsappLogger.info('Cache de preferências de lembretes limpo')
  }

  private static buildCacheKey(businessPhone: string, clientPhone: string): string {
    return `${businessPhone}::${clientPhone}`
  }

  private static buildHeaders(): Record<string, string> {
    const token = String(env.WHATSAPP_WEBHOOK_SECRET || '').trim()
    if (!token) {
      return {}
    }

    const authHeader = `Bearer ${token}`
    return {
      Authorization: authHeader,
      'X-Reminder-Token': authHeader,
    }
  }
}
