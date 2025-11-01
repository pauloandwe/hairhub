import api from '../../config/api.config'
import { ApiError } from '../../errors/api-error'
import { env } from '../../env.config'

interface UpdateProxyRequest {
  businessId: string | number
  appointmentId: string | number
  payload: Record<string, any>
  headers?: Record<string, string>
}

interface UpdateProxyResponse {
  success: boolean
  status?: number
  data?: any
  error?: {
    message: string
    key?: string
    identifier?: string
    statusCode?: number
  }
}

class AppointmentUpdateProxyService {
  /**
   * Proxy request to update appointment via external API
   * Encapsulates the logic of forwarding PATCH requests to the Appointments service
   * with proper authorization and error handling
   */
  async updateAppointment(request: UpdateProxyRequest): Promise<UpdateProxyResponse> {
    try {
      const sanitizedBaseUrl = env.APPOINTMENTS_URL.replace(/\/+$/, '')
      const targetUrl = `${sanitizedBaseUrl}/appointments/${request.businessId}/appointments/${request.appointmentId}`

      const headers: Record<string, string> = request.headers || {}

      if (process.env.NODE_ENV === 'development') {
        console.log('[AppointmentUpdateProxyService] Patching appointment', {
          targetUrl,
          payload: request.payload,
        })
      }

      const response = await api.patch(targetUrl, request.payload, { headers })
      const status = response.status ?? 200

      return {
        success: true,
        status,
        data: response.data,
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const statusCode = error.statusCode ?? 500
        return {
          success: false,
          status: statusCode,
          error: {
            message: error.userMessage,
            key: error.key,
            identifier: error.identifier,
            statusCode,
          },
        }
      }

      console.error('[AppointmentUpdateProxyService] Error updating appointment:', error)

      return {
        success: false,
        status: 500,
        error: {
          message: 'Erro inesperado ao atualizar agendamento.',
          statusCode: 500,
        },
      }
    }
  }
}

export const appointmentUpdateProxyService = new AppointmentUpdateProxyService()
