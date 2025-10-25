import { GenericCrudFlow, GenericCrudFlowOptions } from '../../generic/generic.flow'
import { AppointmentDraft, AppointmentCreatePayload, Appointment } from '../../../types/appointment.types'
import { CreateAppointmentFields } from '../../../enums/appointment.enum'
import { FlowType } from '../../../enums/generic.enum'
import { AppointmentGenericService, AppointmentUpsertArgs } from '../../../services/appointments/create/appointmentGenericService'
import { appointmentFieldEditors } from './appointment.selects'
import { appointmentMissingHandlers } from './appointment.handlers'
import { sendWhatsAppMessage } from '../../../api/meta.api'

class AppointmentFlow extends GenericCrudFlow<AppointmentDraft, AppointmentCreatePayload, Appointment, AppointmentUpsertArgs, CreateAppointmentFields, 'service' | 'barber' | 'date' | 'time'> {
  constructor() {
    const service = new AppointmentGenericService()

    const options: GenericCrudFlowOptions<AppointmentDraft, AppointmentCreatePayload, Appointment, AppointmentUpsertArgs, CreateAppointmentFields, 'service' | 'barber' | 'date' | 'time'> = {
      service,
      flowType: FlowType.AppointmentCreate,
      fieldEditors: appointmentFieldEditors,
      missingFieldHandlers: appointmentMissingHandlers,
      messages: {
        confirmation: 'Confirma o agendamento? Responda "sim" para confirmar ou "não" para cancelar.',
        creationSuccess: '✅ Agendamento confirmado!',
        creationResponse: 'Agendamento criado com sucesso!',
        cancelSent: 'Ok, agendamento cancelado.',
        cancelResponse: 'Agendamento cancelado',
        missingDataDuringConfirm: 'Ainda faltam algumas informações para completar o agendamento.',
        invalidField: 'Campo inválido. Use: serviço, barbeiro, data ou horário.',
        useNaturalLanguage: true,
      },
    }

    super(options)
  }

  protected async sendConfirmation(phone: string, _draft: AppointmentDraft, summary: string): Promise<void> {
    const message = `${summary}\n\n${this.options.messages.confirmation}`
    await sendWhatsAppMessage(phone, message)
  }

  protected async sendEditDeleteOptions(phone: string, _draft: AppointmentDraft, summary: string, _recordId: string): Promise<void> {
    const message = `${summary}\n\nAgendamento criado! Digite "editar" para modificar ou "excluir" para cancelar.`
    await sendWhatsAppMessage(phone, message)
  }

  protected async sendEditDeleteOptionsAfterError(phone: string, _draft: AppointmentDraft, summary: string, _recordId: string, errorMessage: string): Promise<void> {
    const message = `${errorMessage}\n\n${summary}\n\nDigite "editar" para modificar ou "excluir" para cancelar.`
    await sendWhatsAppMessage(phone, message)
  }

  protected async sendEditCancelOptionsAfterCreationError(phone: string, _draft: AppointmentDraft, summary: string, errorMessage: string): Promise<void> {
    const message = `${errorMessage}\n\n${summary}\n\nDigite "editar" para modificar ou "cancelar" para desistir.`
    await sendWhatsAppMessage(phone, message)
  }
}

// Singleton instance
export const appointmentFlow = new AppointmentFlow()
