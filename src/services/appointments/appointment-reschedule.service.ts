import api from '../../config/api.config'
import { env, getBusinessIdForPhone, getUserContextSync, setUserContext, AppointmentRescheduleAppointment, AppointmentRescheduleState } from '../../env.config'
import { unwrapApiResponse } from '../../utils/http'

const DEFAULT_SERVICE_DURATION_MINUTES = 30

const sanitizePhone = (raw: string): string => raw.replace(/\D/g, '')

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const cloneState = (state: AppointmentRescheduleState | null | undefined): AppointmentRescheduleState => {
  if (!state) return {}
  return {
    pendingAppointments: state.pendingAppointments ? [...state.pendingAppointments] : undefined,
    selectedAppointmentId: state.selectedAppointmentId,
    selectedDate: state.selectedDate,
    selectedTime: state.selectedTime,
  }
}

const mapAppointment = (raw: any): AppointmentRescheduleAppointment | null => {
  const id = toNumberOrNull(raw?.id)
  if (!id) return null

  const startDate = isNonEmptyString(raw?.startDate) ? raw.startDate : null
  const endDate = isNonEmptyString(raw?.endDate) ? raw.endDate : null

  const serviceId = toNumberOrNull(raw?.serviceId ?? raw?.service?.id)
  const serviceName = isNonEmptyString(raw?.service?.name) ? raw.service.name : isNonEmptyString(raw?.serviceName) ? raw.serviceName : null
  const serviceDuration = toNumberOrNull(raw?.service?.duration)

  const professionalId = toNumberOrNull(raw?.professionalId ?? raw?.professional?.id)
  const professionalName = isNonEmptyString(raw?.professional?.name) ? raw.professional.name : isNonEmptyString(raw?.professionalName) ? raw.professionalName : null

  const clientName = isNonEmptyString(raw?.clientContact?.name) ? raw.clientContact.name : isNonEmptyString(raw?.client?.name) ? raw.client.name : null
  const clientPhone = isNonEmptyString(raw?.clientContact?.phone) ? raw.clientContact.phone : null

  if (!startDate) return null

  return {
    id,
    startDate,
    endDate,
    status: isNonEmptyString(raw?.status) ? raw.status : null,
    serviceId,
    serviceName,
    serviceDuration,
    professionalId,
    professionalName,
    clientName,
    clientPhone,
  }
}

const combineDateAndTime = (date: string, time: string): Date => {
  // Espera formato: date = "yyyy-MM-dd", time = "HH:mm" ou "HH:mm:ss"
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)

  // O usuário está selecionando um horário em seu timezone local
  // Precisa converter para UTC para salvar corretamente

  // Criar um Date object no timezone local para obter o offset
  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
  const offsetMinutes = localDate.getTimezoneOffset()

  // Criar a data em UTC e depois ajustar pelo offset
  // getTimezoneOffset() é positivo para UTC- (como BRT = UTC-3 → offset = 180)
  // Para converter de timezone local para UTC, adicionar o offset
  const candidate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
  candidate.setTime(candidate.getTime() + offsetMinutes * 60000)

  if (Number.isNaN(candidate.getTime())) {
    throw new Error('Data ou horário inválido para remarcar o agendamento.')
  }
  return candidate
}

const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60_000)
}

class AppointmentRescheduleService {
  private getState(phone: string): AppointmentRescheduleState {
    const context = getUserContextSync(phone)
    return cloneState(context?.appointmentReschedule)
  }

  private async setState(phone: string, nextState: AppointmentRescheduleState | null): Promise<void> {
    if (nextState === null) {
      await setUserContext(phone, { appointmentReschedule: null })
      return
    }

    await setUserContext(phone, {
      appointmentReschedule: {
        pendingAppointments: nextState.pendingAppointments ? [...nextState.pendingAppointments] : undefined,
        selectedAppointmentId: nextState.selectedAppointmentId,
        selectedDate: nextState.selectedDate,
        selectedTime: nextState.selectedTime,
      },
    })
  }

  async clear(phone: string): Promise<void> {
    await this.setState(phone, null)
  }

  async fetchPendingAppointments(phone: string): Promise<AppointmentRescheduleAppointment[]> {
    const businessId = getBusinessIdForPhone(phone)
    const normalizedBusinessId = businessId ? String(businessId).trim() : ''
    const sanitizedPhone = sanitizePhone(phone)

    if (!normalizedBusinessId) {
      throw new Error('Não consegui identificar sua business para buscar os agendamentos.')
    }

    if (!sanitizedPhone) {
      throw new Error('Não consegui identificar o telefone do cliente para buscar os agendamentos.')
    }

    const url = `${env.APPOINTMENTS_URL}/appointments/${encodeURIComponent(normalizedBusinessId)}/appointments/phone/${encodeURIComponent(sanitizedPhone)}`

    try {
      const response = await api.get(url, {
        params: {
          status: 'pending',
        },
      })

      const payload = unwrapApiResponse<unknown[]>(response) ?? []

      const appointments = payload.map(mapAppointment).filter((item: AppointmentRescheduleAppointment | null): item is AppointmentRescheduleAppointment => item !== null)

      const previousState = this.getState(phone)
      const selectedInPreviousState = previousState.selectedAppointmentId

      await this.setState(phone, {
        pendingAppointments: appointments,
        selectedAppointmentId: selectedInPreviousState && appointments.some((apt) => apt.id === selectedInPreviousState) ? selectedInPreviousState : undefined,
        selectedDate: undefined,
        selectedTime: undefined,
      })

      return appointments
    } catch (error) {
      console.error('[AppointmentRescheduleService] Erro ao buscar agendamentos pendentes:', error)
      throw new Error('Não consegui buscar seus agendamentos pendentes. Tente novamente mais tarde.')
    }
  }

  getPendingAppointmentsFromState(phone: string): AppointmentRescheduleAppointment[] {
    const state = this.getState(phone)
    return state.pendingAppointments ? [...state.pendingAppointments] : []
  }

  async selectAppointment(phone: string, appointmentId: number): Promise<AppointmentRescheduleAppointment> {
    const state = this.getState(phone)
    const appointments = state.pendingAppointments ?? []
    const appointment = appointments.find((apt) => apt.id === appointmentId)

    if (!appointment) {
      throw new Error('Não encontrei esse agendamento na lista de pendentes.')
    }

    await this.setState(phone, {
      pendingAppointments: appointments,
      selectedAppointmentId: appointmentId,
      selectedDate: undefined,
      selectedTime: undefined,
    })

    return appointment
  }

  getSelectedAppointment(phone: string): AppointmentRescheduleAppointment | null {
    const state = this.getState(phone)
    if (!state.selectedAppointmentId) return null
    return state.pendingAppointments?.find((apt) => apt.id === state.selectedAppointmentId) ?? null
  }

  getSelectedDate(phone: string): string | null {
    const state = this.getState(phone)
    return state.selectedDate ?? null
  }

  async setSelectedDate(phone: string, date: string): Promise<void> {
    const state = this.getState(phone)
    const appointments = state.pendingAppointments ?? []

    await this.setState(phone, {
      pendingAppointments: appointments,
      selectedAppointmentId: state.selectedAppointmentId,
      selectedDate: date,
      selectedTime: undefined,
    })
  }

  async setSelectedTime(phone: string, time: string): Promise<void> {
    const state = this.getState(phone)
    const appointments = state.pendingAppointments ?? []

    await this.setState(phone, {
      pendingAppointments: appointments,
      selectedAppointmentId: state.selectedAppointmentId,
      selectedDate: state.selectedDate,
      selectedTime: time,
    })
  }

  async confirmReschedule(phone: string): Promise<AppointmentRescheduleAppointment> {
    const state = this.getState(phone)

    if (!state.selectedAppointmentId) {
      throw new Error('Nenhum agendamento selecionado para remarcar.')
    }
    if (!state.selectedDate) {
      throw new Error('Escolha uma nova data para remarcar o agendamento.')
    }
    if (!state.selectedTime) {
      throw new Error('Escolha um novo horário para remarcar o agendamento.')
    }

    const appointment = state.pendingAppointments?.find((apt) => apt.id === state.selectedAppointmentId)
    if (!appointment) {
      throw new Error('Não encontrei o agendamento selecionado entre os pendentes.')
    }

    const businessId = getBusinessIdForPhone(phone)
    const normalizedBusinessId = businessId ? String(businessId).trim() : ''

    if (!normalizedBusinessId) {
      throw new Error('Não consegui identificar sua business para remarcar o agendamento.')
    }

    const startDate = combineDateAndTime(state.selectedDate, state.selectedTime)
    const durationMinutes = appointment.serviceDuration ?? DEFAULT_SERVICE_DURATION_MINUTES
    const endDate = addMinutes(startDate, durationMinutes || DEFAULT_SERVICE_DURATION_MINUTES)

    const url = `${env.APPOINTMENTS_URL}/appointments/${encodeURIComponent(normalizedBusinessId)}/appointments/${appointment.id}`
    const payload: Record<string, unknown> = {
      // Usar toISOString() para enviar data em formato ISO com timezone (UTC)
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }

    try {
      await api.patch(url, payload)
    } catch (error) {
      console.error('[AppointmentRescheduleService] Erro ao remarcar agendamento:', error)
      throw new Error('Não consegui remarcar o agendamento. Tente novamente mais tarde.')
    }

    const updatedAppointment: AppointmentRescheduleAppointment = {
      ...appointment,
      startDate: payload.startDate as string,
      endDate: payload.endDate as string,
    }

    const updatedAppointments = (state.pendingAppointments ?? []).map((apt) => (apt.id === updatedAppointment.id ? updatedAppointment : apt))

    await this.setState(phone, {
      pendingAppointments: updatedAppointments,
      selectedAppointmentId: updatedAppointment.id,
      selectedDate: undefined,
      selectedTime: undefined,
    })

    return updatedAppointment
  }
}

export const appointmentRescheduleService = new AppointmentRescheduleService()
