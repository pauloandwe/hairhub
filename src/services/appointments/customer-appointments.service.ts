import api from '../../config/api.config'
import { ensureUserApiToken } from '../auth-token.service'
import { AppointmentRescheduleAppointment, BusinessSettings, env, getBusinessIdForPhone, getUserContextSync } from '../../env.config'
import { unwrapApiResponse } from '../../utils/http'

export type CustomerAppointmentAction = 'cancellation' | 'reschedule'

const OPEN_APPOINTMENT_STATUSES = ['pending', 'confirmed'] as const
const HISTORY_ONLY_STATUSES = ['completed', 'canceled'] as const

const sanitizePhone = (raw: string): string => raw.replace(/\D/g, '')

const toNumberOrNull = (value: unknown): number | null => {
  if (value === undefined || value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }

  if (value === undefined || value === null) return null

  const converted = String(value).trim()
  return converted.length ? converted : null
}

const mapAppointment = (raw: any): AppointmentRescheduleAppointment | null => {
  const id = toNumberOrNull(raw?.id)
  const startDate = normalizeString(raw?.startDate)

  if (!id || !startDate) {
    return null
  }

  return {
    id,
    startDate,
    endDate: normalizeString(raw?.endDate),
    status: normalizeString(raw?.status),
    serviceId: toNumberOrNull(raw?.serviceId ?? raw?.service?.id),
    serviceName: normalizeString(raw?.service?.name ?? raw?.serviceName),
    serviceDuration: toNumberOrNull(raw?.service?.duration ?? raw?.duration),
    professionalId: toNumberOrNull(raw?.professionalId ?? raw?.professional?.id),
    professionalName: normalizeString(raw?.professional?.name ?? raw?.professionalName),
    clientName: normalizeString(raw?.clientContact?.name ?? raw?.client?.name ?? raw?.clientName),
    clientPhone: normalizeString(raw?.clientContact?.phone ?? raw?.clientPhone),
    notes: normalizeString(raw?.notes),
  }
}

const compareAscending = (a: AppointmentRescheduleAppointment, b: AppointmentRescheduleAppointment): number => {
  return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
}

const compareDescending = (a: AppointmentRescheduleAppointment, b: AppointmentRescheduleAppointment): number => {
  return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
}

class CustomerAppointmentsService {
  private async ensureBusinessContext(phone: string): Promise<{ businessId: string; settings: BusinessSettings | null }> {
    const runtimeContext = getUserContextSync(phone)
    const businessId = runtimeContext?.businessId ? String(runtimeContext.businessId).trim() : String(getBusinessIdForPhone(phone) || '').trim()
    const settings = runtimeContext?.settings ?? null

    if (businessId && settings) {
      return { businessId, settings }
    }

    if (!businessId) {
      throw new Error('Não consegui identificar sua business no momento.')
    }

    await ensureUserApiToken(businessId, phone)

    const refreshedContext = getUserContextSync(phone)
    return {
      businessId,
      settings: refreshedContext?.settings ?? null,
    }
  }

  private async fetchAppointments(phone: string, statuses?: readonly string[]): Promise<AppointmentRescheduleAppointment[]> {
    const { businessId } = await this.ensureBusinessContext(phone)
    const sanitizedPhone = sanitizePhone(phone)

    if (!sanitizedPhone) {
      throw new Error('Não consegui identificar o telefone do cliente para buscar os agendamentos.')
    }

    const url = `${env.APPOINTMENTS_URL}/appointments/${encodeURIComponent(businessId)}/appointments/phone/${encodeURIComponent(sanitizedPhone)}`
    const params = statuses?.length ? { status: statuses.join(',') } : undefined

    const response = await api.get(url, { params })
    const payload = unwrapApiResponse<unknown[]>(response) ?? []

    if (!Array.isArray(payload)) {
      return []
    }

    return payload.map(mapAppointment).filter((item: AppointmentRescheduleAppointment | null): item is AppointmentRescheduleAppointment => item !== null)
  }

  private isUpcoming(appointment: AppointmentRescheduleAppointment): boolean {
    const start = new Date(appointment.startDate).getTime()
    return Number.isFinite(start) && start > Date.now()
  }

  private evaluatePolicy(settings: BusinessSettings | null, action: CustomerAppointmentAction, appointment: AppointmentRescheduleAppointment): { allowed: boolean; reason?: string } {
    const normalizedStatus = appointment.status?.toLowerCase() ?? null

    if (!OPEN_APPOINTMENT_STATUSES.includes(normalizedStatus as (typeof OPEN_APPOINTMENT_STATUSES)[number])) {
      return { allowed: false, reason: 'Esse agendamento não está mais disponível para essa ação.' }
    }

    if (!this.isUpcoming(appointment)) {
      return { allowed: false, reason: 'Só consigo alterar agendamentos futuros.' }
    }

    if (action === 'cancellation') {
      if (settings?.allowCancellation === false) {
        return { allowed: false, reason: 'Esta business não permite cancelamentos pelo WhatsApp.' }
      }

      const deadlineHours = Number(settings?.cancellationDeadlineHours ?? 0)
      if (deadlineHours > 0) {
        const hoursUntilAppointment = (new Date(appointment.startDate).getTime() - Date.now()) / 3_600_000
        if (hoursUntilAppointment < deadlineHours) {
          return { allowed: false, reason: `O cancelamento só pode ser feito com pelo menos ${deadlineHours} hora(s) de antecedência.` }
        }
      }
    }

    if (action === 'reschedule') {
      if (settings?.allowReschedule === false) {
        return { allowed: false, reason: 'Esta business não permite remarcações pelo WhatsApp.' }
      }

      const deadlineHours = Number(settings?.rescheduleDeadlineHours ?? 0)
      if (deadlineHours > 0) {
        const hoursUntilAppointment = (new Date(appointment.startDate).getTime() - Date.now()) / 3_600_000
        if (hoursUntilAppointment < deadlineHours) {
          return { allowed: false, reason: `A remarcação só pode ser feita com pelo menos ${deadlineHours} hora(s) de antecedência.` }
        }
      }
    }

    return { allowed: true }
  }

  async ensureActionEnabled(phone: string, action: CustomerAppointmentAction): Promise<void> {
    const { settings } = await this.ensureBusinessContext(phone)

    if (action === 'cancellation' && settings?.allowCancellation === false) {
      throw new Error('Esta business não permite cancelamentos pelo WhatsApp.')
    }

    if (action === 'reschedule' && settings?.allowReschedule === false) {
      throw new Error('Esta business não permite remarcações pelo WhatsApp.')
    }
  }

  async getUpcomingAppointments(phone: string): Promise<AppointmentRescheduleAppointment[]> {
    const appointments = await this.fetchAppointments(phone, OPEN_APPOINTMENT_STATUSES)

    return appointments.filter((appointment) => this.isUpcoming(appointment)).sort(compareAscending)
  }

  async getUpcomingAppointmentsForAction(phone: string, action: CustomerAppointmentAction): Promise<AppointmentRescheduleAppointment[]> {
    await this.ensureActionEnabled(phone, action)

    const { settings } = await this.ensureBusinessContext(phone)
    const appointments = await this.getUpcomingAppointments(phone)

    return appointments.filter((appointment) => this.evaluatePolicy(settings, action, appointment).allowed).sort(compareAscending)
  }

  async validateAppointmentAction(phone: string, action: CustomerAppointmentAction, appointment: AppointmentRescheduleAppointment): Promise<void> {
    const { settings } = await this.ensureBusinessContext(phone)
    const evaluation = this.evaluatePolicy(settings, action, appointment)

    if (!evaluation.allowed) {
      throw new Error(evaluation.reason ?? 'Esse agendamento não está disponível para essa ação.')
    }
  }

  async getAppointmentHistory(phone: string): Promise<AppointmentRescheduleAppointment[]> {
    const appointments = await this.fetchAppointments(phone)

    return appointments
      .filter((appointment) => {
        const normalizedStatus = appointment.status?.toLowerCase() ?? null
        if (HISTORY_ONLY_STATUSES.includes(normalizedStatus as (typeof HISTORY_ONLY_STATUSES)[number])) {
          return true
        }

        return !this.isUpcoming(appointment)
      })
      .sort(compareDescending)
  }
}

export const customerAppointmentsService = new CustomerAppointmentsService()
