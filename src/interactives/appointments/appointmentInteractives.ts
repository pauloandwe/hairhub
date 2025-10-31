import { registerEditDeleteHandler } from '../editDeleteHandler'
import { appointmentFunctions } from '../../functions/appointments/appointment.functions'

let isRegistered = false

export function registerAppointmentEditDeleteHandler(): void {
  if (isRegistered) {
    return
  }

  registerEditDeleteHandler('APPOINTMENT_EDIT_DELETE', {
    edit: appointmentFunctions.editAppointmentRegistration,
    delete: appointmentFunctions.deleteAppointmentRegistration,
  })

  isRegistered = true
}
