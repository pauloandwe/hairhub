import { sendWhatsAppMessage } from '../../api/meta.api'
import { sendServiceSelectionList } from '../../interactives/appointments/serviceSelection'
import { sendProfessionalSelectionList } from '../../interactives/appointments/professionalSelection'
import { sendTimeSlotSelectionList } from '../../interactives/appointments/timeSlotSelection'
import { sendDateSelectionList } from '../../interactives/appointments/dateSelection'
import { appendAssistantTextAuto } from '../../services/history-router.service'
import { IAppointmentValidationDraft } from '../../services/appointments/appointment.types'
import { FieldEditor } from '../functions.types'

export type AppointmentEditField = 'appointmentDate' | 'appointmentTime' | 'service' | 'professional' | 'notes' | 'clientName' | 'clientPhone'
export type AppointmentMissingField = 'appointmentDate' | 'appointmentTime' | 'service' | 'professional'

type ChangeResponse = { message: string; interactive: boolean }

const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const editDate: FieldEditor = async (phone) => {
  await sendDateSelectionList(phone, 'Qual data você prefere? 👇')
  return respond('Menu de datas enviado', true)
}

const editTime: FieldEditor = async (phone) => {
  await sendTimeSlotSelectionList(phone, 'Qual horário você prefere? 👇')
  return respond('Menu de horários enviado', true)
}

const editService: FieldEditor = async (phone) => {
  await sendServiceSelectionList(phone, 'Qual serviço você quer? 👇')
  return respond('Menu de serviços enviado', true)
}

const editProfessional: FieldEditor = async (phone) => {
  await sendProfessionalSelectionList(phone, 'Qual professional você prefere? 👇')
  return respond('Menu de barbeiros enviado', true)
}

const editNotes: FieldEditor = async (phone) => {
  const message = 'Alguma observação ou preferência especial?'
  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessage(phone, message)
  return respond('Observações solicitadas', false)
}

const editClientName: FieldEditor = async (phone) => {
  const message = 'Qual o nome completo do cliente?'
  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessage(phone, message)
  return respond('Nome do cliente solicitado', false)
}

const editClientPhone: FieldEditor = async (phone) => {
  const message = 'Qual é o telefone do cliente? Informe com DDD, só números.'
  await appendAssistantTextAuto(phone, message)
  await sendWhatsAppMessage(phone, message)
  return respond('Telefone do cliente solicitado', false)
}

export const appointmentFieldEditors: Record<AppointmentEditField, FieldEditor> = {
  appointmentDate: editDate,
  appointmentTime: editTime,
  service: editService,
  professional: editProfessional,
  notes: editNotes,
  clientName: editClientName,
  clientPhone: editClientPhone,
}

type MissingFieldHandler = (phone: string, draft: IAppointmentValidationDraft) => Promise<{ message: string; interactive: boolean; draft: IAppointmentValidationDraft }>

const askDate: MissingFieldHandler = async (phone, draft) => {
  await sendDateSelectionList(phone, 'Qual data você prefere? 👇')
  return { message: 'Menu de datas enviado', interactive: true, draft }
}

const askTime: MissingFieldHandler = async (phone, draft) => {
  await sendTimeSlotSelectionList(phone, 'Qual horário você prefere? 👇')
  return { message: 'Menu de horários enviado', interactive: true, draft }
}

const askService: MissingFieldHandler = async (phone, draft) => {
  await sendServiceSelectionList(phone, 'Qual serviço você quer? 👇')
  return { message: 'Menu de serviços enviado', interactive: true, draft }
}

const askProfessional: MissingFieldHandler = async (phone, draft) => {
  await sendProfessionalSelectionList(phone, 'Qual professional você prefere? 👇')
  return { message: 'Menu de barbeiros enviado', interactive: true, draft }
}

export const missingFieldHandlers: Record<AppointmentMissingField, MissingFieldHandler> = {
  appointmentDate: askDate,
  appointmentTime: askTime,
  service: askService,
  professional: askProfessional,
}
