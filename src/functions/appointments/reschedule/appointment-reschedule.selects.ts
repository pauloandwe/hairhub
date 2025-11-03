import { sendWhatsAppMessage } from '../../../api/meta.api'
import { appointmentRescheduleService } from '../../../services/appointments/appointment-reschedule.service'
import { RescheduleField, RescheduleDraft } from '../../../services/appointments/appointment-reschedule-draft.service'
import { ChangeResponse, FieldEditor } from '../../functions.types'
import { sendPendingAppointmentSelectionList } from '../../../interactives/appointments/rescheduleAppointmentSelection'
import { sendRescheduleDateSelectionList } from '../../../interactives/appointments/rescheduleDateSelection'
import { sendRescheduleTimeSelectionList } from '../../../interactives/appointments/rescheduleTimeSelection'
import { appendAssistantTextAuto } from '../../../services/history-router.service'
import { DateFormatter } from '../../../utils/date'

export const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const editAppointmentId: FieldEditor = async (phone) => {
  try {
    const appointments = await appointmentRescheduleService.fetchPendingAppointments(phone)

    if (!appointments.length) {
      await sendWhatsAppMessage(phone, 'Você não tem agendamentos pendentes para remarcar.')
      return respond('Nenhum agendamento pendente', false)
    }

    await sendPendingAppointmentSelectionList(phone)
    return respond('Menu de agendamentos enviado', true)
  } catch (error) {
    console.error('[editAppointmentId] Error:', error)
    await sendWhatsAppMessage(phone, 'Não consegui buscar seus agendamentos. Tente novamente.')
    return respond('Erro ao buscar agendamentos', false)
  }
}

const editNewDate: FieldEditor = async (phone) => {
  try {
    const appointment = appointmentRescheduleService.getSelectedAppointment(phone)
    if (!appointment) {
      await sendWhatsAppMessage(phone, 'Selecione um agendamento primeiro.')
      return respond('Agendamento não selecionado', false)
    }

    await sendRescheduleDateSelectionList(phone)
    return respond('Menu de datas enviado', true)
  } catch (error) {
    console.error('[editNewDate] Error:', error)
    await sendWhatsAppMessage(phone, 'Não consegui carregar as datas disponíveis.')
    return respond('Erro ao buscar datas', false)
  }
}

const editNewTime: FieldEditor = async (phone) => {
  try {
    const selectedDate = appointmentRescheduleService.getSelectedDate(phone)
    if (!selectedDate) {
      await sendWhatsAppMessage(phone, 'Selecione uma data primeiro.')
      return respond('Data não selecionada', false)
    }

    await sendRescheduleTimeSelectionList(phone)
    return respond('Menu de horários enviado', true)
  } catch (error) {
    console.error('[editNewTime] Error:', error)
    await sendWhatsAppMessage(phone, 'Não consegui carregar os horários disponíveis.')
    return respond('Erro ao buscar horários', false)
  }
}

export const rescheduleFieldEditors: Record<RescheduleField, FieldEditor> = {
  [RescheduleField.AppointmentId]: editAppointmentId,
  [RescheduleField.NewDate]: editNewDate,
  [RescheduleField.NewTime]: editNewTime,
}

type MissingFieldHandler = (
  phone: string,
  draft: RescheduleDraft,
) => Promise<{
  message: string
  interactive: boolean
  draft: RescheduleDraft
}>

const askAppointmentId: MissingFieldHandler = async (phone, draft) => {
  try {
    const appointments = await appointmentRescheduleService.fetchPendingAppointments(phone)

    if (!appointments.length) {
      const message = 'Você não tem agendamentos pendentes para remarcar.'
      await appendAssistantTextAuto(phone, message)
      await sendWhatsAppMessage(phone, message)
      return { message, interactive: false, draft }
    }

    for (const apt of appointments) {
      if (apt.id) {
        draft.appointmentId = apt.id
        draft.selectedAppointment = apt
        break
      }
    }

    const description = draft.selectedAppointment ? `${draft.selectedAppointment.serviceName || ''} com ${draft.selectedAppointment.professionalName || ''}` : ''

    await sendWhatsAppMessage(phone, `Qual agendamento você quer remarcar? ${description}`)
    await sendPendingAppointmentSelectionList(phone)
    return { message: 'Menu de agendamentos enviado', interactive: true, draft }
  } catch (error) {
    console.error('[askAppointmentId] Error:', error)
    const message = 'Não consegui buscar seus agendamentos pendentes. Tente novamente.'
    await sendWhatsAppMessage(phone, message)
    return { message, interactive: false, draft }
  }
}

const askNewDate: MissingFieldHandler = async (phone, draft) => {
  try {
    const appointment = appointmentRescheduleService.getSelectedAppointment(phone)
    if (!appointment || !appointment.professionalId || !appointment.serviceId) {
      const message = 'Selecione um agendamento válido primeiro.'
      await sendWhatsAppMessage(phone, message)
      return { message, interactive: false, draft }
    }

    const message = 'Qual nova data você prefere?'
    await sendWhatsAppMessage(phone, message)
    await sendRescheduleDateSelectionList(phone)
    return { message: 'Menu de datas enviado', interactive: true, draft }
  } catch (error) {
    console.error('[askNewDate] Error:', error)
    const message = 'Não consegui carregar as datas disponíveis.'
    await sendWhatsAppMessage(phone, message)
    return { message, interactive: false, draft }
  }
}

const askNewTime: MissingFieldHandler = async (phone, draft) => {
  try {
    const appointment = appointmentRescheduleService.getSelectedAppointment(phone)
    const selectedDate = appointmentRescheduleService.getSelectedDate(phone)

    if (!appointment || !appointment.professionalId || !appointment.serviceId) {
      const message = 'Selecione um agendamento válido primeiro.'
      await sendWhatsAppMessage(phone, message)
      return { message, interactive: false, draft }
    }

    if (!selectedDate) {
      const message = 'Escolha uma data primeiro.'
      await sendWhatsAppMessage(phone, message)
      await sendRescheduleDateSelectionList(phone)
      return { message: 'Menu de datas reenviado', interactive: true, draft }
    }

    const dateLabel = DateFormatter.formatToDayMonth(selectedDate)
    const message = `Qual horário você prefere para ${dateLabel}?`
    await sendWhatsAppMessage(phone, message)
    await sendRescheduleTimeSelectionList(phone)
    return { message: 'Menu de horários enviado', interactive: true, draft }
  } catch (error) {
    console.error('[askNewTime] Error:', error)
    const message = 'Não consegui carregar os horários disponíveis.'
    await sendWhatsAppMessage(phone, message)
    return { message, interactive: false, draft }
  }
}

export const missingFieldHandlers: Record<RescheduleField, MissingFieldHandler> = {
  [RescheduleField.AppointmentId]: askAppointmentId,
  [RescheduleField.NewDate]: askNewDate,
  [RescheduleField.NewTime]: askNewTime,
}
