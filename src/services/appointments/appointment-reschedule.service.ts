import api from '../../config/api.config'
import { env, getBusinessIdForPhone, getBusinessTimezoneForPhone, getUserContextSync, setUserContext, AppointmentRescheduleAppointment, AppointmentRescheduleState } from '../../env.config'
import { customerAppointmentsService } from './customer-appointments.service'
import { combineDateAndTimeInTimeZone } from '../../utils/timezone'

const DEFAULT_SERVICE_DURATION_MINUTES = 30

const cloneState = (state: AppointmentRescheduleState | null | undefined): AppointmentRescheduleState => {
  if (!state) return {}
  return {
    pendingAppointments: state.pendingAppointments ? [...state.pendingAppointments] : undefined,
    selectedAppointmentId: state.selectedAppointmentId,
    selectedDate: state.selectedDate,
    selectedTime: state.selectedTime,
  }
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
    try {
      const appointments = await customerAppointmentsService.getUpcomingAppointmentsForAction(phone, 'reschedule')
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
      console.error('[AppointmentRescheduleService] Erro ao buscar próximos agendamentos:', error)
      throw new Error(error instanceof Error ? error.message : 'Não consegui buscar seus próximos agendamentos. Tente novamente mais tarde.')
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
      throw new Error('Não encontrei esse agendamento na lista de próximos horários.')
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
      throw new Error('Não encontrei o agendamento selecionado entre os próximos horários.')
    }

    await customerAppointmentsService.validateAppointmentAction(phone, 'reschedule', appointment)

    const businessId = getBusinessIdForPhone(phone)
    const normalizedBusinessId = businessId ? String(businessId).trim() : ''

    if (!normalizedBusinessId) {
      throw new Error('Não consegui identificar sua business para remarcar o agendamento.')
    }

    const businessTimezone = appointment.businessTimezone ?? getBusinessTimezoneForPhone(phone)
    const startDate = combineDateAndTimeInTimeZone(state.selectedDate, state.selectedTime, businessTimezone)
    const durationMinutes = appointment.serviceDuration ?? DEFAULT_SERVICE_DURATION_MINUTES
    const endDate = addMinutes(startDate, durationMinutes || DEFAULT_SERVICE_DURATION_MINUTES)

    const url = `${env.APPOINTMENTS_URL}/appointments/${encodeURIComponent(normalizedBusinessId)}/appointments/${appointment.id}`
    const payload: Record<string, unknown> = {
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
