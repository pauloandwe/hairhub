import { AppointmentRescheduleAppointment, getBusinessIdForPhone } from '../../env.config'
import { GenericService } from '../generic/generic.service'
import { DraftStatus, IBaseEntity, SelectionItem, SummarySections } from '../generic/generic.types'
import { MissingRule } from '../drafts/draft-flow.utils'
import { DateFormatter } from '../../utils/date'
import { appointmentRescheduleService } from './appointment-reschedule.service'

export enum RescheduleField {
  AppointmentId = 'appointmentId',
  NewDate = 'newDate',
  NewTime = 'newTime',
}

export interface RescheduleDraft {
  appointmentId: number | null
  selectedAppointment: AppointmentRescheduleAppointment | null
  newDate: string | null
  newTime: string | null
  status?: DraftStatus
  recordId?: string
}

export interface RescheduleCreationPayload {
  appointmentId: number
  startDate: string
  endDate: string
}

export interface RescheduleRecord extends RescheduleCreationPayload, IBaseEntity {}

export type RescheduleFields = `${RescheduleField.AppointmentId}` | `${RescheduleField.NewDate}` | `${RescheduleField.NewTime}`

export interface UpsertRescheduleArgs {
  appointmentId?: number | null
  newDate?: string | null
  newTime?: string | null
}

const VALID_EDITABLE_FIELDS: (keyof UpsertRescheduleArgs)[] = [RescheduleField.AppointmentId, RescheduleField.NewDate, RescheduleField.NewTime]

function emptyRescheduleDraft(): RescheduleDraft {
  return {
    appointmentId: null,
    selectedAppointment: null,
    newDate: null,
    newTime: null,
    status: 'collecting',
    recordId: undefined,
  }
}

const DEFAULT_SERVICE_DURATION_MINUTES = 30

const combineDateAndTime = (date: string, time: string): Date => {
  const normalizedTime = time.length === 5 ? `${time}:00` : time
  const candidate = new Date(`${date}T${normalizedTime}`)
  if (Number.isNaN(candidate.getTime())) {
    throw new Error('Data ou horário inválido para remarcar o agendamento.')
  }
  return candidate
}

const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60_000)
}

export class AppointmentRescheduleDraftService extends GenericService<RescheduleDraft, RescheduleCreationPayload, RescheduleRecord, UpsertRescheduleArgs> {
  constructor() {
    super(
      'appointmentReschedule',
      emptyRescheduleDraft,
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

  create = async (phone: string, draft: RescheduleDraft, endpointOverride?: string): Promise<{ id: string }> => {
    void endpointOverride

    if (!draft.appointmentId) {
      throw new Error('Selecione um agendamento para remarcar.')
    }

    const rawBusinessId = getBusinessIdForPhone(phone)
    const businessId = rawBusinessId !== undefined && rawBusinessId !== null ? String(rawBusinessId).trim() : ''
    if (!businessId) {
      throw new Error('Não consegui identificar sua barbearia para remarcar o agendamento.')
    }

    const farmIdAsNumber = Number(businessId)
    const apiPayload = this.transformToApiPayload(draft, { farmId: Number.isFinite(farmIdAsNumber) ? farmIdAsNumber : 0 })

    const patchPayload: Partial<RescheduleCreationPayload> = {
      startDate: apiPayload.startDate,
      endDate: apiPayload.endDate,
    }

    const baseEndpoint = `/appointments/${businessId}/appointments`

    return this._patchRecord(phone, String(draft.appointmentId), baseEndpoint, patchPayload)
  }

  hydrateSelectedAppointment = async (phone: string, draftOverride?: RescheduleDraft): Promise<RescheduleDraft> => {
    const draft = draftOverride ?? (await this.loadDraft(phone))
    const selectedAppointment = appointmentRescheduleService.getSelectedAppointment(phone)

    if (selectedAppointment?.id && draft.appointmentId !== selectedAppointment.id) {
      draft.appointmentId = selectedAppointment.id
    }

    draft.selectedAppointment = selectedAppointment ?? null

    if (!draftOverride) {
      await this.saveDraft(phone, draft)
    }

    return draft
  }

  protected validateDraftArgsTypes = (args: Partial<UpsertRescheduleArgs>, currentDraft: RescheduleDraft): void => {
    if (args.appointmentId !== undefined) {
      currentDraft.appointmentId = args.appointmentId ?? null
      if (!args.appointmentId) {
        currentDraft.selectedAppointment = null
      }
    }

    if (args.newDate !== undefined) {
      currentDraft.newDate = DateFormatter.normalizeToISODate(args.newDate)
    }

    if (args.newTime !== undefined) {
      currentDraft.newTime = args.newTime ?? null
    }

    currentDraft.status = currentDraft.status ?? 'collecting'
  }

  protected getRequiredFields = (): MissingRule<RescheduleDraft>[] => {
    return [
      { key: RescheduleField.AppointmentId as any, kind: 'number' },
      { key: RescheduleField.NewDate as any, kind: 'string' },
      { key: RescheduleField.NewTime as any, kind: 'string' },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Agendamento',
        value: (draft: RescheduleDraft) => {
          if (!draft.selectedAppointment) return null
          const when = DateFormatter.formatToDateTimeLabel(draft.selectedAppointment.startDate)
          const service = draft.selectedAppointment.serviceName ? ` ${draft.selectedAppointment.serviceName}` : ''
          const barber = draft.selectedAppointment.barberName ? ` com ${draft.selectedAppointment.barberName}` : ''
          return `${service}${barber}${when ? ` para ${when}` : ''}`
        },
      },
      {
        label: 'Nova Data',
        value: (draft: RescheduleDraft) => (draft.newDate ? DateFormatter.formatToBrazilianDate(draft.newDate) : null),
      },
      {
        label: 'Novo Horário',
        value: (draft: RescheduleDraft) => draft.newTime ?? null,
      },
    ]
  }

  protected transformToApiPayload = (draft: RescheduleDraft, _context: { farmId: number }): RescheduleCreationPayload => {
    if (!draft.appointmentId || !draft.newDate || !draft.newTime) {
      throw new Error('Faltam dados para remarcar o agendamento.')
    }

    const startDate = combineDateAndTime(draft.newDate, draft.newTime)
    const durationMinutes = draft.selectedAppointment?.serviceDuration ?? DEFAULT_SERVICE_DURATION_MINUTES
    const endDate = addMinutes(startDate, durationMinutes || DEFAULT_SERVICE_DURATION_MINUTES)

    return {
      appointmentId: draft.appointmentId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }
  }

  protected buildListParams = (): Record<string, any> => {
    return {}
  }

  protected extractDataFromResult = (): any[] => {
    return []
  }

  protected formatItemToSelection = (): SelectionItem => {
    return { id: '', name: '', description: '' }
  }

  protected getListErrorMessage = (): string => {
    return 'Erro ao carregar lista.'
  }

  getValidFieldsFormatted = (): string => {
    return `${RescheduleField.AppointmentId}, ${RescheduleField.NewDate}, ${RescheduleField.NewTime}`
  }

  protected override buildPartialUpdatePayload(draft: RescheduleDraft, updates: Partial<UpsertRescheduleArgs>): Partial<RescheduleCreationPayload> {
    const payload: Partial<RescheduleCreationPayload> = {}

    const has = (field: keyof UpsertRescheduleArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    if (has(RescheduleField.AppointmentId) || has(RescheduleField.NewDate) || has(RescheduleField.NewTime)) {
      if (draft.appointmentId && draft.newDate && draft.newTime) {
        const startDate = combineDateAndTime(draft.newDate, draft.newTime)
        const durationMinutes = draft.selectedAppointment?.serviceDuration ?? DEFAULT_SERVICE_DURATION_MINUTES
        const endDate = addMinutes(startDate, durationMinutes || DEFAULT_SERVICE_DURATION_MINUTES)

        payload.startDate = startDate.toISOString()
        payload.endDate = endDate.toISOString()
      }
    }

    return payload
  }
}

export const appointmentRescheduleDraftService = new AppointmentRescheduleDraftService()
