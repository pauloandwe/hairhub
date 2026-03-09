import { sendWhatsAppMessage } from '../../api/meta.api'
import { sendServiceSelectionList } from '../../interactives/appointments/serviceSelection'
import { sendProfessionalSelectionList } from '../../interactives/appointments/professionalSelection'
import { sendTimeSlotSelectionList } from '../../interactives/appointments/timeSlotSelection'
import { sendDateSelectionList } from '../../interactives/appointments/dateSelection'
import { appendAssistantTextAuto } from '../../services/history-router.service'
import { IAppointmentValidationDraft } from '../../services/appointments/appointment.types'
import { FieldEditor } from '../functions.types'
import { getMenuSentCopy } from '../../utils/conversation-copy'

export type AppointmentEditField = 'appointmentDate' | 'appointmentTime' | 'service' | 'professional' | 'notes' | 'clientName' | 'clientPhone'
export type AppointmentMissingField = 'appointmentDate' | 'appointmentTime' | 'service' | 'professional'

type ChangeResponse = { message: string; interactive: boolean }

const respond = (message: string, interactive: boolean): ChangeResponse => ({
  message,
  interactive,
})

const editDate: FieldEditor = async (phone) => {
  await sendDateSelectionList(phone, 'Qual dia fica melhor pra voce?')
  return respond(getMenuSentCopy('datas'), true)
}

const editTime: FieldEditor = async (phone) => {
  await sendTimeSlotSelectionList(phone, 'Qual horario fica melhor pra voce?')
  return respond(getMenuSentCopy('horarios'), true)
}

const editService: FieldEditor = async (phone) => {
  await sendServiceSelectionList(phone, 'Qual servico voce quer marcar?')
  return respond(getMenuSentCopy('servicos'), true)
}

const editProfessional: FieldEditor = async (phone) => {
  await sendProfessionalSelectionList(phone, 'Tem preferencia de barbeiro?')
  return respond(getMenuSentCopy('barbeiros'), true)
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
  await sendDateSelectionList(phone, 'Qual dia fica melhor pra voce?')
  return { message: getMenuSentCopy('datas'), interactive: true, draft }
}

const askTime: MissingFieldHandler = async (phone, draft) => {
  await sendTimeSlotSelectionList(phone, 'Qual horario fica melhor pra voce?')
  return { message: getMenuSentCopy('horarios'), interactive: true, draft }
}

const askService: MissingFieldHandler = async (phone, draft) => {
  await sendServiceSelectionList(phone, 'Qual servico voce quer marcar?')
  return { message: getMenuSentCopy('servicos'), interactive: true, draft }
}

const askProfessional: MissingFieldHandler = async (phone, draft) => {
  await sendProfessionalSelectionList(phone, 'Tem preferencia de barbeiro?')
  return { message: getMenuSentCopy('barbeiros'), interactive: true, draft }
}

export const missingFieldHandlers: Record<AppointmentMissingField, MissingFieldHandler> = {
  appointmentDate: askDate,
  appointmentTime: askTime,
  service: askService,
  professional: askProfessional,
}
