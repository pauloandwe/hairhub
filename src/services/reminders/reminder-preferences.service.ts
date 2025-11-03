import axios from 'axios'
import { whatsappLogger } from '../../utils/pino'
import { env } from '../../env.config'

export interface ClientPreference {
  clientPhone: string
  remindersEnabled: boolean
  optOutDate?: Date
}

const BACKEND_URL = env.BACKEND_URL || 'http://localhost:3001'

export class ReminderPreferencesService {
  private static preferencesCache: Map<string, ClientPreference> = new Map()
  private static readonly CACHE_TTL = 1000 * 60 * 60 

  static async shouldSendReminder(clientPhone: string): Promise<boolean> {
    try {
      const preferences = await this.getClientPreferences(clientPhone)
      return preferences.remindersEnabled !== false
    } catch (error) {
      whatsappLogger.warn(
        {
          clientPhone,
          error: (error as any)?.message,
        },
        'Erro ao verificar preferências de lembrete, permitindo envio por padrão',
      )
      
      return true
    }
  }

  private static async getClientPreferences(clientPhone: string): Promise<ClientPreference> {
    
    const cached = this.preferencesCache.get(clientPhone)
    if (cached) {
      return cached
    }

    try {
      const response = await axios.get(`${BACKEND_URL}/client-preferences/phone/${clientPhone}`, {
        timeout: 5000,
      })

      const preferences = {
        clientPhone,
        remindersEnabled: response.data?.remindersEnabled !== false,
        optOutDate: response.data?.optOutDate,
      }

      this.preferencesCache.set(clientPhone, preferences)
      setTimeout(() => this.preferencesCache.delete(clientPhone), this.CACHE_TTL)

      return preferences
    } catch (error: any) {
      whatsappLogger.warn(
        {
          clientPhone,
          statusCode: error?.response?.status,
          error: error?.message,
        },
        'Falha ao buscar preferências de cliente',
      )
      throw error
    }
  }

  static async optOut(clientPhone: string): Promise<void> {
    try {
      await axios.put(
        `${BACKEND_URL}/client-preferences/opt-out`,
        {
          clientPhone,
        },
        {
          timeout: 5000,
        },
      )

      this.preferencesCache.set(clientPhone, {
        clientPhone,
        remindersEnabled: false,
        optOutDate: new Date(),
      })

      whatsappLogger.info(
        {
          clientPhone,
        },
        'Cliente optou por sair dos lembretes',
      )
    } catch (error: any) {
      whatsappLogger.error(
        {
          clientPhone,
          error: error?.message,
        },
        'Falha ao registrar opt-out',
      )
      throw error
    }
  }

  static async optIn(clientPhone: string): Promise<void> {
    try {
      await axios.put(
        `${BACKEND_URL}/client-preferences/opt-in`,
        {
          clientPhone,
        },
        {
          timeout: 5000,
        },
      )

      this.preferencesCache.set(clientPhone, {
        clientPhone,
        remindersEnabled: true,
      })

      whatsappLogger.info(
        {
          clientPhone,
        },
        'Cliente voltou a receber lembretes',
      )
    } catch (error: any) {
      whatsappLogger.error(
        {
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
}
