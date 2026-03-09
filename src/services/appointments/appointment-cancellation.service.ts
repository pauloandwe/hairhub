import { AppointmentCancellationState, AppointmentRescheduleAppointment, getUserContextSync, setUserContext } from '../../env.config'
import { customerAppointmentsService } from './customer-appointments.service'

const cloneState = (state: AppointmentCancellationState | null | undefined): AppointmentCancellationState => {
  if (!state) return {}

  return {
    upcomingAppointments: state.upcomingAppointments ? [...state.upcomingAppointments] : undefined,
    selectedAppointmentId: state.selectedAppointmentId,
  }
}

class AppointmentCancellationService {
  private getState(phone: string): AppointmentCancellationState {
    const context = getUserContextSync(phone)
    return cloneState(context?.appointmentCancellation)
  }

  private async setState(phone: string, nextState: AppointmentCancellationState | null): Promise<void> {
    if (nextState === null) {
      await setUserContext(phone, { appointmentCancellation: null })
      return
    }

    await setUserContext(phone, {
      appointmentCancellation: {
        upcomingAppointments: nextState.upcomingAppointments ? [...nextState.upcomingAppointments] : undefined,
        selectedAppointmentId: nextState.selectedAppointmentId,
      },
    })
  }

  async clear(phone: string): Promise<void> {
    await this.setState(phone, null)
  }

  async fetchCancelableAppointments(phone: string): Promise<AppointmentRescheduleAppointment[]> {
    const appointments = await customerAppointmentsService.getUpcomingAppointmentsForAction(phone, 'cancellation')
    const previousState = this.getState(phone)
    const selectedAppointmentId = previousState.selectedAppointmentId

    await this.setState(phone, {
      upcomingAppointments: appointments,
      selectedAppointmentId: selectedAppointmentId && appointments.some((appointment) => appointment.id === selectedAppointmentId) ? selectedAppointmentId : undefined,
    })

    return appointments
  }

  getUpcomingAppointmentsFromState(phone: string): AppointmentRescheduleAppointment[] {
    const state = this.getState(phone)
    return state.upcomingAppointments ? [...state.upcomingAppointments] : []
  }

  async selectAppointment(phone: string, appointmentId: number): Promise<AppointmentRescheduleAppointment> {
    const state = this.getState(phone)
    const appointments = state.upcomingAppointments ?? []
    const selectedAppointment = appointments.find((appointment) => appointment.id === appointmentId)

    if (!selectedAppointment) {
      throw new Error('Não encontrei esse agendamento na lista de próximos horários.')
    }

    await this.setState(phone, {
      upcomingAppointments: appointments,
      selectedAppointmentId: appointmentId,
    })

    return selectedAppointment
  }

  getSelectedAppointment(phone: string): AppointmentRescheduleAppointment | null {
    const state = this.getState(phone)
    if (!state.selectedAppointmentId) return null

    return state.upcomingAppointments?.find((appointment) => appointment.id === state.selectedAppointmentId) ?? null
  }
}

export const appointmentCancellationService = new AppointmentCancellationService()
