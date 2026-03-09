import { sendWhatsAppMessage } from '../../../api/meta.api'
import { appointmentCancellationService } from '../../../services/appointments/appointment-cancellation.service'
import { AppointmentCancellationDraft, AppointmentCancellationField } from '../../../services/appointments/appointment-cancellation-draft.service'
import { ChangeResponse, FieldEditor } from '../../functions.types'
import { sendCancelableAppointmentSelectionList } from '../../../interactives/appointments/cancelAppointmentSelection'

const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const editAppointmentId: FieldEditor = async (phone) => {
  try {
    const appointments = await appointmentCancellationService.fetchCancelableAppointments(phone)

    if (!appointments.length) {
      await sendWhatsAppMessage(phone, 'Você não tem próximos agendamentos que possam ser cancelados agora.')
      return respond('Nenhum agendamento elegível para cancelamento', false)
    }

    await sendCancelableAppointmentSelectionList(phone)
    return respond('Menu de agendamentos enviado', true)
  } catch (error) {
    console.error('[AppointmentCancellationSelection] Error fetching appointments:', error)
    const message = error instanceof Error ? error.message : 'Não consegui buscar seus agendamentos. Tente novamente.'
    await sendWhatsAppMessage(phone, message)
    return respond(message, false)
  }
}

export const appointmentCancellationFieldEditors: Record<AppointmentCancellationField, FieldEditor> = {
  [AppointmentCancellationField.AppointmentId]: editAppointmentId,
}

type MissingFieldHandler = (
  phone: string,
  draft: AppointmentCancellationDraft,
) => Promise<{
  message: string
  interactive: boolean
  draft: AppointmentCancellationDraft
}>

const askAppointmentId: MissingFieldHandler = async (phone, draft) => {
  try {
    const appointments = await appointmentCancellationService.fetchCancelableAppointments(phone)

    if (!appointments.length) {
      const message = 'Você não tem próximos agendamentos que possam ser cancelados agora.'
      await sendWhatsAppMessage(phone, message)
      return { message, interactive: false, draft }
    }

    await sendCancelableAppointmentSelectionList(phone)
    return { message: 'Menu de agendamentos enviado', interactive: true, draft }
  } catch (error) {
    console.error('[AppointmentCancellationSelection] Error:', error)
    const message = error instanceof Error ? error.message : 'Não consegui buscar seus agendamentos. Tente novamente.'
    await sendWhatsAppMessage(phone, message)
    return { message, interactive: false, draft }
  }
}

export const appointmentCancellationMissingFieldHandlers: Record<AppointmentCancellationField, MissingFieldHandler> = {
  [AppointmentCancellationField.AppointmentId]: askAppointmentId,
}
