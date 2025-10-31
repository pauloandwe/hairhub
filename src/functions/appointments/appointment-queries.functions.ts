import { getBusinessIdForPhone, getUserContextSync } from '../../env.config'
import { ensureUserApiToken } from '../../services/auth-token.service'
import { aiLogger } from '../../utils/pino'

const logger = aiLogger.child({ module: 'appointment-queries' })

interface AppointmentData {
  id: number
  startDate: string
  service?: { name: string; duration: number }
  barber?: { name: string }
  status: string
  notes?: string
}

interface FormattedAppointment {
  id: string
  date: string
  time: string
  service: string
  barber: string
  status: string
  notes: string
  duration: number
}

interface AppointmentQueryResponse {
  status: 'success' | 'error'
  data?: {
    appointments: FormattedAppointment[]
    total: number
    message: string
  }
  error?: string
}

interface QueryArgs {
  phone: string
  clientPhone?: string
  limit?: number
}

const DEFAULT_LIMIT = 10
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3001'
const BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN

const ERROR_MESSAGES = {
  BUSINESS_NOT_FOUND: 'Não consegui identificar sua barbearia. Tenta de novo mais tarde.',
  PHONE_NOT_PROVIDED: 'Número de telefone não informado.',
  API_FETCH_ERROR: 'Não consegui buscar seus agendamentos. Tenta de novo mais tarde.',
  GENERIC_ERROR: 'Desculpa, tive um problema. Tenta de novo mais tarde.',
  NO_APPOINTMENTS: 'Você não tem agendamentos registrados.',
} as const

const SUCCESS_MESSAGE = (count: number) => (count > 0 ? `Você tem ${count} agendamento(s).` : ERROR_MESSAGES.NO_APPOINTMENTS)

const DEFAULT_SERVICE_NAME = 'Serviço não especificado'
const DEFAULT_BARBER_NAME = 'Barbeiro não especificado'

const padTwoDigits = (value: number): string => value.toString().padStart(2, '0')

function formatDate(isoDate: string): string {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''

  const day = padTwoDigits(date.getUTCDate())
  const month = padTwoDigits(date.getUTCMonth() + 1)
  const year = date.getUTCFullYear()

  return `${day}/${month}/${year}`
}

function formatTime(isoDate: string): string {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return ''

  const hours = padTwoDigits(date.getUTCHours())
  const minutes = padTwoDigits(date.getUTCMinutes())

  return `${hours}:${minutes}`
}

function formatAppointment(apt: AppointmentData): FormattedAppointment {
  return {
    id: apt.id?.toString() || '',
    date: formatDate(apt.startDate),
    time: formatTime(apt.startDate),
    service: apt.service?.name || DEFAULT_SERVICE_NAME,
    barber: apt.barber?.name || DEFAULT_BARBER_NAME,
    status: apt.status || 'pending',
    notes: apt.notes || '',
    duration: apt.service?.duration || 0,
  }
}

function buildApiHeaders(authToken?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  const token = authToken || BACKEND_API_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  } else {
    logger.warn('Nenhum token informado para a requisição de agendamentos.')
  }

  return headers
}

async function fetchAppointmentsFromApi(businessId: string, phoneNumber: string, authToken?: string): Promise<AppointmentData[]> {
  const url = `${BACKEND_API_URL}/appointments/${businessId}/appointments/phone/${encodeURIComponent(phoneNumber)}`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: buildApiHeaders(authToken),
    })
  } catch (networkError) {
    logger.error({ networkError, businessId, phoneNumber }, 'Falha de rede ao consultar agendamentos.')
    throw networkError
  }

  if (!response.ok) {
    let errorPayload: unknown = null
    try {
      const raw = await response.text()
      if (raw) {
        try {
          errorPayload = JSON.parse(raw)
        } catch {
          errorPayload = raw
        }
      }
    } catch (readError) {
      logger.warn({ readError, status: response.status, phoneNumber, businessId }, 'Não foi possível ler o corpo de erro da API de agendamentos.')
    }

    logger.error({ status: response.status, phoneNumber, businessId, errorPayload }, 'Erro ao buscar agendamentos na API')
    throw new Error(`API returned status ${response.status}`)
  }

  const data = await response.json()

  const extractAppointments = (payload: unknown): AppointmentData[] | null => {
    if (Array.isArray(payload)) {
      return payload
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>
      if (Array.isArray(record.appointments)) {
        return record.appointments as AppointmentData[]
      }
      if (Array.isArray(record.data)) {
        return record.data as AppointmentData[]
      }
      if (record.data && typeof record.data === 'object') {
        const nested = record.data as Record<string, unknown>
        if (Array.isArray(nested.appointments)) {
          return nested.appointments as AppointmentData[]
        }
        if (Array.isArray(nested.data)) {
          return nested.data as AppointmentData[]
        }
      }
    }

    return null
  }

  const appointments = extractAppointments(data)
  if (!appointments) {
    logger.warn({ businessId, phoneNumber, responseShape: data }, 'Resposta da API de agendamentos não contém lista esperada.')
    return []
  }

  return appointments
}

function validateQueryArgs(args: QueryArgs): { valid: boolean; error?: string } {
  if (!args.phone) {
    return { valid: false, error: ERROR_MESSAGES.PHONE_NOT_PROVIDED }
  }

  return { valid: true }
}

export const appointmentQueryFunctions = {
  getAppointmentHistory: async (args: QueryArgs): Promise<AppointmentQueryResponse> => {
    const { phone, clientPhone, limit = DEFAULT_LIMIT } = args

    logger.info({ phone, clientPhone, limit }, 'Consultando histórico de agendamentos')

    try {
      const validation = validateQueryArgs(args)
      if (!validation.valid) {
        return { status: 'error', error: validation.error }
      }

      const businessId = getBusinessIdForPhone(phone)
      if (!businessId) {
        logger.warn({ phone }, 'businessId não encontrado para o telefone')
        return { status: 'error', error: ERROR_MESSAGES.BUSINESS_NOT_FOUND }
      }

      const phoneToSearch = clientPhone || phone

      let userContext = getUserContextSync(phone)
      if (!userContext?.token) {
        logger.info({ phone, businessId, hasTokenInContext: Boolean(userContext?.token) }, 'Token não encontrado no contexto. Tentando obter novo token.')
        try {
          await ensureUserApiToken(businessId, phone)
        } catch (authError) {
          logger.error(
            {
              phone,
              businessId,
              authErrorMessage: authError instanceof Error ? authError.message : String(authError),
            },
            'Erro ao garantir token de autenticação para consulta de agendamentos',
          )
          return { status: 'error', error: ERROR_MESSAGES.API_FETCH_ERROR }
        }
        userContext = getUserContextSync(phone)
      }

      const tokenToUse = userContext?.token || BACKEND_API_TOKEN
      logger.info(
        {
          phone,
          phoneToSearch,
          businessId,
          hasContextToken: Boolean(userContext?.token),
          usingEnvToken: !userContext?.token && Boolean(BACKEND_API_TOKEN),
        },
        'Consultando agendamentos na API com token resolvido.',
      )

      const appointmentData = await fetchAppointmentsFromApi(businessId, phoneToSearch, tokenToUse)

      const appointments = appointmentData.map(formatAppointment)
      const limitedAppointments = appointments.slice(0, limit)

      logger.info({ count: limitedAppointments.length, phoneToSearch, businessId }, 'Agendamentos recuperados com sucesso')

      return {
        status: 'success',
        data: {
          appointments: limitedAppointments,
          total: appointments.length,
          message: SUCCESS_MESSAGE(limitedAppointments.length),
        },
      }
    } catch (error) {
      logger.error(
        {
          phone,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Erro ao consultar histórico de agendamentos',
      )
      return { status: 'error', error: ERROR_MESSAGES.API_FETCH_ERROR }
    }
  },

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
      return { error: ERROR_MESSAGES.GENERIC_ERROR }
    }
  },

  getServices: async (args: { phone: string }): Promise<any> => {
    const { phone } = args
    const businessId = getBusinessIdForPhone(phone)

    logger.info({ businessId }, 'Consultando serviços disponíveis')

    try {
      return {
        status: 'success',
        data: {
          services: [
            { id: 1, name: 'Corte Masculino', duration: 30, price: 40.0 },
            { id: 2, name: 'Barba', duration: 20, price: 30.0 },
            { id: 3, name: 'Corte + Barba', duration: 50, price: 65.0 },
            { id: 4, name: 'Hidratação Capilar', duration: 20, price: 25.0 },
          ],
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar serviços')
      return { error: ERROR_MESSAGES.GENERIC_ERROR }
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
            { id: 1, name: 'João', specialty: 'Cortes clássicos', available: true },
            { id: 2, name: 'Carlos', specialty: 'Design de barba', available: true },
            { id: 3, name: 'Pedro', specialty: 'Cortes modernos', available: true },
          ],
        },
      }
    } catch (error) {
      logger.error({ error }, 'Erro ao consultar barbeiros')
      return { error: ERROR_MESSAGES.GENERIC_ERROR }
    }
  },
}
