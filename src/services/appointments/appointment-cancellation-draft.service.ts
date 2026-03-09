import { AppointmentRescheduleAppointment, getBusinessIdForPhone } from '../../env.config'
import { GenericService } from '../generic/generic.service'
import { DraftStatus, IBaseEntity, SelectionItem, SummarySections } from '../generic/generic.types'
import { MissingRule } from '../drafts/draft-flow.utils'
import { appointmentCancellationService } from './appointment-cancellation.service'
import { customerAppointmentsService } from './customer-appointments.service'
import { DateFormatter } from '../../utils/date'

export enum AppointmentCancellationField {
  AppointmentId = 'appointmentId',
}

export interface AppointmentCancellationDraft {
  appointmentId: number | null
  selectedAppointment: AppointmentRescheduleAppointment | null
  status?: DraftStatus
  recordId?: string
}

export interface AppointmentCancellationCreationPayload {
  appointmentId: number
  status: 'canceled'
}

export interface AppointmentCancellationRecord extends AppointmentCancellationCreationPayload, IBaseEntity {}

export interface UpsertAppointmentCancellationArgs {
  appointmentId?: number | null
}

const VALID_EDITABLE_FIELDS: (keyof UpsertAppointmentCancellationArgs)[] = [AppointmentCancellationField.AppointmentId]

function emptyAppointmentCancellationDraft(): AppointmentCancellationDraft {
  return {
    appointmentId: null,
    selectedAppointment: null,
    status: 'collecting',
    recordId: undefined,
  }
}

export class AppointmentCancellationDraftService extends GenericService<AppointmentCancellationDraft, AppointmentCancellationCreationPayload, AppointmentCancellationRecord, UpsertAppointmentCancellationArgs> {
  constructor() {
    super(
      'appointmentCancellation',
      emptyAppointmentCancellationDraft,
      process.env.APPOINTMENTS_URL || '',
      '/appointments/validate',
      VALID_EDITABLE_FIELDS,
      {
        rawPayload: true,
        endpoints: {
          create: ({ farmId }) => (farmId ? `/appointments/${farmId}/appointments` : '/appointments'),
          update: ({ farmId }) => (farmId ? `/appointments/${farmId}/appointments` : '/appointments'),
          patch: ({ farmId }) => (farmId ? `/appointments/${farmId}/appointments` : '/appointments'),
          delete: ({ farmId }) => (farmId ? `/appointments/${farmId}/appointments` : '/appointments'),
        },
      },
      true,
    )
  }

  create = async (phone: string, draft: AppointmentCancellationDraft, endpointOverride?: string): Promise<{ id: string }> => {
    void endpointOverride

    const hydratedDraft = await this.hydrateSelectedAppointment(phone, draft)

    if (!hydratedDraft.appointmentId || !hydratedDraft.selectedAppointment) {
      throw new Error('Selecione um agendamento para cancelar.')
    }

    await customerAppointmentsService.validateAppointmentAction(phone, 'cancellation', hydratedDraft.selectedAppointment)

    const rawBusinessId = getBusinessIdForPhone(phone)
    const businessId = rawBusinessId !== undefined && rawBusinessId !== null ? String(rawBusinessId).trim() : ''

    if (!businessId) {
      throw new Error('Não consegui identificar sua business para cancelar o agendamento.')
    }

    const baseEndpoint = `/appointments/${businessId}/appointments`
    return this._patchRecord(phone, String(hydratedDraft.appointmentId), baseEndpoint, { status: 'canceled' })
  }

  hydrateSelectedAppointment = async (phone: string, draftOverride?: AppointmentCancellationDraft): Promise<AppointmentCancellationDraft> => {
    const draft = draftOverride ?? (await this.loadDraft(phone))
    const selectedAppointment = appointmentCancellationService.getSelectedAppointment(phone)

    if (selectedAppointment?.id && draft.appointmentId !== selectedAppointment.id) {
      draft.appointmentId = selectedAppointment.id
    }

    draft.selectedAppointment = selectedAppointment ?? null

    if (!draftOverride) {
      await this.saveDraft(phone, draft)
    }

    return draft
  }

  protected validateDraftArgsTypes = (args: Partial<UpsertAppointmentCancellationArgs>, currentDraft: AppointmentCancellationDraft): void => {
    if (args.appointmentId !== undefined) {
      currentDraft.appointmentId = args.appointmentId ?? null
      currentDraft.selectedAppointment = currentDraft.selectedAppointment?.id === args.appointmentId ? currentDraft.selectedAppointment : null
    }

    currentDraft.status = currentDraft.status ?? 'collecting'
  }

  protected getRequiredFields = (): MissingRule<AppointmentCancellationDraft>[] => {
    return [{ key: AppointmentCancellationField.AppointmentId as any, kind: 'number' }]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Agendamento',
        value: (draft: AppointmentCancellationDraft) => {
          if (!draft.selectedAppointment) return null

          const when = DateFormatter.formatToDateTimeLabel(draft.selectedAppointment.startDate)
          const service = draft.selectedAppointment.serviceName ? ` ${draft.selectedAppointment.serviceName}` : ''
          const professional = draft.selectedAppointment.professionalName ? ` com ${draft.selectedAppointment.professionalName}` : ''
          return `${service}${professional}${when ? ` para ${when}` : ''}`
        },
      },
    ]
  }

  protected transformToApiPayload = (draft: AppointmentCancellationDraft, _context: { farmId: number }): AppointmentCancellationCreationPayload => {
    if (!draft.appointmentId) {
      throw new Error('Selecione um agendamento para cancelar.')
    }

    return {
      appointmentId: draft.appointmentId,
      status: 'canceled',
    }
  }

  protected buildListParams = (): Record<string, any> => {
    return {}
  }

  protected extractDataFromResult = (): any[] => {
    return []
  }

  protected formatItemToSelection = (): SelectionItem => {
    return { id: '', name: '' }
  }

  protected getListErrorMessage = (): string => {
    return 'Erro ao carregar lista.'
  }

  getValidFieldsFormatted = (): string => {
    return AppointmentCancellationField.AppointmentId
  }

  override handleServiceError = (err: unknown): string => {
    if (err instanceof Error && err.message?.trim()) {
      return err.message
    }

    return 'Não consegui cancelar o agendamento agora. Tente novamente mais tarde.'
  }
}

export const appointmentCancellationDraftService = new AppointmentCancellationDraftService()
