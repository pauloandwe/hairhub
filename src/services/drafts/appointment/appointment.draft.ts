import { IAppointmentValidationDraft } from '../../appointments/appointment.types'

export function emptyAppointmentDraft(): IAppointmentValidationDraft {
  return {
    appointmentDate: null,
    appointmentTime: null,
    service: { id: null, name: null },
    barber: { id: null, name: null },
    clientName: null,
    clientPhone: null,
    notes: null,
    status: 'collecting',
  }
}
