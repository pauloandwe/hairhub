import { FieldEditor } from '../../functions.types'
import { getOrCreateBusinessConfig } from '../../../api/business.api'
import { formatServiceList, formatBarberList } from '../../../utils/appointment-formatters'
import { CreateAppointmentFields } from '../../../enums/appointment.enum'

export const serviceEditor: FieldEditor = async (phone: string) => {
  const businessConfig = await getOrCreateBusinessConfig(phone)
  const activeServices = businessConfig.services.filter((s) => s.active)
  const servicesList = formatServiceList(activeServices)

  return {
    message: `Qual serviço você deseja?\n\n${servicesList}`,
    interactive: false,
  }
}

export const barberEditor: FieldEditor = async (phone: string) => {
  const businessConfig = await getOrCreateBusinessConfig(phone)
  const activeBarbers = businessConfig.barbers.filter((b) => b.active)
  const barbersList = formatBarberList(activeBarbers)

  return {
    message: `Qual barbeiro você prefere?\n\n${barbersList}`,
    interactive: false,
  }
}

export const dateEditor: FieldEditor = async (phone: string) => {
  return {
    message: 'Qual data você prefere para o agendamento? (formato: YYYY-MM-DD, ex: 2025-01-20)',
    interactive: false,
  }
}

export const timeEditor: FieldEditor = async (phone: string) => {
  return {
    message: 'Qual horário você prefere? (formato: HH:MM, ex: 14:30)',
    interactive: false,
  }
}

export const notesEditor: FieldEditor = async (phone: string) => {
  return {
    message: 'Deseja adicionar alguma observação ao agendamento?',
    interactive: false,
  }
}

export const appointmentFieldEditors: Record<CreateAppointmentFields, FieldEditor> = {
  [CreateAppointmentFields.Service]: serviceEditor,
  [CreateAppointmentFields.Barber]: barberEditor,
  [CreateAppointmentFields.Date]: dateEditor,
  [CreateAppointmentFields.Time]: timeEditor,
  [CreateAppointmentFields.Notes]: notesEditor,
}
