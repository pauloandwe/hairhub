import { appointmentFlow } from './appointment.flow'

/**
 * Start appointment creation flow
 */
export async function startAppointmentCreation(args: { phone: string }): Promise<string> {
  const result = await appointmentFlow.startRegistration(args)
  return result.message
}

/**
 * Continue appointment creation (handles all field updates via the flow)
 */
export async function continueAppointmentCreation(args: { phone: string }): Promise<string> {
  const result = await appointmentFlow.continueRegistration(args)
  return result.message
}

/**
 * Confirm and create appointment
 */
export async function confirmAppointmentCreation(args: { phone: string }): Promise<string> {
  const result = await appointmentFlow.confirmRegistration(args)
  return result.message
}

/**
 * Cancel appointment creation flow
 */
export async function cancelAppointmentCreation(args: { phone: string }): Promise<string> {
  const result = await appointmentFlow.cancelRegistration(args)
  return result.message
}

/**
 * Change appointment field
 */
export async function changeAppointmentField(args: { phone: string; field: string; value?: string }): Promise<string> {
  const result = await appointmentFlow.changeRegistrationField({
    phone: args.phone,
    field: args.field as any,
  })
  return result.message
}

// Export all functions
export const appointmentFlowFunctions = {
  startAppointmentCreation,
  continueAppointmentCreation,
  confirmAppointmentCreation,
  cancelAppointmentCreation,
  changeAppointmentField,
}
