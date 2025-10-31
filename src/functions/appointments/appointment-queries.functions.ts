import { getBusinessIdForPhone } from '../../env.config'
import { aiLogger } from '../../utils/pino'

const logger = aiLogger.child({ module: 'appointment-queries' })

export const appointmentQueryFunctions = {
  getAvailableTimeSlots: async (args: { phone: string; date?: string; barberId?: number }): Promise<any> => {
    const { phone, date, barberId } = args
    const businessId = getBusinessIdForPhone(phone)

    logger.info({ businessId, date, barberId }, 'Consultando horários disponíveis')

    try {
      return {
        status: 'success',
        data: {
          date: date || new Date().toISOString().split('T')[0],
          available_slots: [
            { time: '09:00', barbier_id: barberId },
            { time: '09:30', barbier_id: barberId },
            { time: '10:00', barbier_id: barberId },
            { time: '10:30', barbier_id: barberId },
            { time: '14:00', barbier_id: barberId },
            { time: '14:30', barbier_id: barberId },
            { time: '15:00', barbier_id: barberId },
            { time: '15:30', barbier_id: barberId },
          ],
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar horários disponíveis')
      return {
        error: 'Não consegui buscar os horários disponíveis. Tenta de novo mais tarde.',
      }
    }
  },

  getAppointmentHistory: async (args: { phone: string; clientPhone?: string; limit?: number }): Promise<any> => {
    const { phone, clientPhone, limit = 10 } = args
    const businessId = getBusinessIdForPhone(phone)

    logger.info({ businessId, clientPhone, limit }, 'Consultando histórico de agendamentos')

    try {
      return {
        status: 'success',
        data: {
          appointments: [
            {
              id: '1',
              date: '2024-10-20',
              time: '14:00',
              service: 'Corte Masculino',
              barber: 'João',
              status: 'completed',
            },
            {
              id: '2',
              date: '2024-10-15',
              time: '10:00',
              service: 'Corte + Barba',
              barber: 'Carlos',
              status: 'completed',
            },
          ],
          total: 2,
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar histórico de agendamentos')
      return {
        error: 'Não consegui buscar o histórico de agendamentos. Tenta de novo mais tarde.',
      }
    }
  },

  /**
   * Retorna os serviços disponíveis na barbearia
   */
  getServices: async (args: { phone: string }): Promise<any> => {
    const { phone } = args
    const businessId = getBusinessIdForPhone(phone)

    logger.info({ businessId }, 'Consultando serviços disponíveis')

    try {
      return {
        status: 'success',
        data: {
          services: [
            {
              id: 1,
              name: 'Corte Masculino',
              duration: 30,
              price: 40.0,
            },
            {
              id: 2,
              name: 'Barba',
              duration: 20,
              price: 30.0,
            },
            {
              id: 3,
              name: 'Corte + Barba',
              duration: 50,
              price: 65.0,
            },
            {
              id: 4,
              name: 'Hidratação Capilar',
              duration: 20,
              price: 25.0,
            },
          ],
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar serviços')
      return {
        error: 'Não consegui buscar os serviços. Tenta de novo mais tarde.',
      }
    }
  },

  getBarbers: async (args: { phone: string }): Promise<any> => {
    const { phone } = args
    const businessId = getBusinessIdForPhone(phone)

    logger.info({ businessId }, 'Consultando barbeiros disponíveis')

    try {
      return {
        status: 'success',
        data: {
          barbers: [
            {
              id: 1,
              name: 'João',
              specialty: 'Cortes clássicos',
              available: true,
            },
            {
              id: 2,
              name: 'Carlos',
              specialty: 'Design de barba',
              available: true,
            },
            {
              id: 3,
              name: 'Pedro',
              specialty: 'Cortes modernos',
              available: true,
            },
          ],
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar barbeiros')
      return {
        error: 'Não consegui buscar os barbeiros. Tenta de novo mais tarde.',
      }
    }
  },
}
