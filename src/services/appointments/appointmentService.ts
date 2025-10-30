import { format, isValid, parse, parseISO } from 'date-fns'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { emptyAppointmentDraft } from '../drafts/appointment/appointment.draft'
import { GenericService } from '../generic/generic.service'
import { AppointmentRecord, IAppointmentCreationPayload, IAppointmentValidationDraft, UpsertAppointmentArgs } from './appointment.types'
import { MissingRule } from '../drafts/draft-flow.utils'
import { SelectionItem, SummarySections } from '../generic/generic.types'
import { getBusinessIdForPhone, resetActiveRegistration } from '../../env.config'
import { IdNameRef } from '../drafts/types'
import { clearAllUserIntents } from '../intent-history.service'
import { mergeIdNameRef } from '../drafts/ref.utils'

const autoCompleteEndpoint = '/appointments/suggest'

const VALID_EDITABLE_FIELDS: (keyof UpsertAppointmentArgs)[] = [
  'appointmentDate' as keyof UpsertAppointmentArgs,
  'appointmentTime' as keyof UpsertAppointmentArgs,
  'service' as keyof UpsertAppointmentArgs,
  'barber' as keyof UpsertAppointmentArgs,
  'clientName' as keyof UpsertAppointmentArgs,
  'clientPhone' as keyof UpsertAppointmentArgs,
  'notes' as keyof UpsertAppointmentArgs,
]

export class AppointmentService extends GenericService<IAppointmentValidationDraft, IAppointmentCreationPayload, AppointmentRecord, UpsertAppointmentArgs> {
  getValidFieldsFormatted(): string {
    const fieldLabels: Partial<Record<keyof UpsertAppointmentArgs, string>> = {
      appointmentDate: 'data do agendamento',
      appointmentTime: 'horário do agendamento',
      service: 'serviço',
      barber: 'barbeiro',
      clientName: 'nome do cliente',
      clientPhone: 'telefone do cliente',
      notes: 'observações',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }
  constructor() {
    super(
      'appointment',
      emptyAppointmentDraft,
      process.env.APPOINTMENTS_URL || '',
      autoCompleteEndpoint,
      VALID_EDITABLE_FIELDS,
      {
        endpoints: {
          create: ({ businessId }) => (businessId ? `appointments/${businessId}/appointments` : '/appointments'),
          update: ({ businessId }) => (businessId ? `appointments/${businessId}/appointments` : '/appointments'),
          patch: ({ businessId }) => (businessId ? `appointments/${businessId}/appointments` : '/appointments'),
          delete: ({ businessId }) => (businessId ? `appointments/${businessId}/appointments` : '/appointments'),
        },
      },
      true,
    )
  }

  private formatDraftDate = (rawDate?: string | Date | null): string | null => {
    if (!rawDate) return null

    let parsedDate: Date | null = null

    if (rawDate instanceof Date) {
      parsedDate = rawDate
    } else {
      const normalized = `${rawDate}`.trim()
      if (!normalized) return null

      const datePortion = normalized.length >= 10 ? normalized.slice(0, 10) : normalized
      const parsedByPattern = parse(datePortion, 'yyyy-MM-dd', new Date())

      if (isValid(parsedByPattern)) {
        parsedDate = parsedByPattern
      } else {
        const parsedByIso = parseISO(normalized)
        if (isValid(parsedByIso)) {
          parsedDate = parsedByIso
        }
      }
    }

    if (!parsedDate || !isValid(parsedDate)) return null

    return format(parsedDate, 'dd/MM/yyyy')
  }

  private formatDraftTime = (rawTime?: string | null): string | null => {
    if (!rawTime) return null
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (timeRegex.test(rawTime.trim())) {
      return rawTime.trim()
    }
    return null
  }

  private normalizeRefInput(value: unknown): IdNameRef | null | undefined {
    if (value === undefined) return undefined
    if (value === null) return null

    if (Array.isArray(value)) {
      for (const option of value) {
        const normalized = this.normalizeRefInput(option)
        if (normalized !== undefined) return normalized
      }
      return undefined
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed ? { id: null, name: trimmed } : null
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return { id: String(value), name: null }
    }

    if (typeof value === 'object') {
      const candidate = value as Record<string, unknown>
      const rawId = candidate.id ?? candidate.value ?? candidate.code ?? candidate.externalId ?? candidate.uuid ?? null
      const rawName = candidate.name ?? candidate.label ?? candidate.title ?? candidate.description ?? candidate.displayName ?? null

      const id = rawId !== undefined && rawId !== null ? String(rawId).trim() || null : null
      let name: string | null = null
      if (typeof rawName === 'string') {
        name = rawName.trim() || null
      } else if (rawName !== undefined && rawName !== null) {
        name = String(rawName)
      }

      return { id, name }
    }

    return undefined
  }

  protected validateDraftArgsTypes = (args: Partial<UpsertAppointmentArgs>, currentDraft: IAppointmentValidationDraft): void => {
    const extendedArgs = args as Partial<UpsertAppointmentArgs> & {
      date?: unknown
      time?: unknown
      service?: unknown
      barber?: unknown
    }

    const normalizeIdValue = (value: unknown): string | null => {
      if (value === undefined || value === null) return null
      const normalized = String(value).trim()
      return normalized.length ? normalized : null
    }

    const previousServiceId = normalizeIdValue(currentDraft.service?.id)
    const previousBarberId = normalizeIdValue(currentDraft.barber?.id)
    const previousDate = currentDraft.appointmentDate ?? null

    const assignRef = (field: keyof Pick<IAppointmentValidationDraft, 'service' | 'barber'>, incoming: IdNameRef | null | undefined) => {
      if (incoming === undefined) return
      if (incoming === null) {
        currentDraft[field] = null
        return
      }

      const target = currentDraft[field]
      if (!target) {
        currentDraft[field] = { id: incoming.id ?? null, name: incoming.name ?? null }
        return
      }

      mergeIdNameRef(target, incoming)
    }

    const normalizedService = this.normalizeRefInput(extendedArgs.service)
    if (normalizedService !== undefined) {
      const incomingServiceId = normalizeIdValue(normalizedService?.id)
      const hasServiceChanged = incomingServiceId !== previousServiceId
      if (hasServiceChanged) {
        currentDraft.barber = null
        currentDraft.appointmentTime = null
      }
      assignRef('service', normalizedService)
    }

    const normalizedBarber = this.normalizeRefInput(extendedArgs.barber)
    if (normalizedBarber !== undefined) {
      const incomingBarberId = normalizeIdValue(normalizedBarber?.id)
      const hasBarberChanged = incomingBarberId !== previousBarberId
      if (hasBarberChanged) {
        currentDraft.appointmentTime = null
      }
      assignRef('barber', normalizedBarber)
    }

    const appointmentDateInput = extendedArgs.appointmentDate ?? extendedArgs.date
    if (appointmentDateInput !== undefined) {
      let nextDate: string | null = currentDraft.appointmentDate ?? null
      let hasNewValue = false

      if (appointmentDateInput === null) {
        nextDate = null
        hasNewValue = true
      } else {
        const rawDate = String(appointmentDateInput).trim()
        if (rawDate) {
          let parsedDate = parseISO(rawDate)

          if (!isValid(parsedDate)) {
            const datePortion = rawDate.length >= 10 ? rawDate.slice(0, 10) : rawDate
            parsedDate = parse(datePortion, 'dd/MM/yyyy', new Date())
          }

          if (isValid(parsedDate)) {
            nextDate = format(parsedDate, 'yyyy-MM-dd')
            hasNewValue = true
          }
        }
      }

      if (hasNewValue) {
        const hasDateChanged = nextDate !== previousDate
        currentDraft.appointmentDate = nextDate
        if (hasDateChanged) {
          currentDraft.appointmentTime = null
        }
      }
    }

    const appointmentTimeInput = extendedArgs.appointmentTime ?? extendedArgs.time
    if (appointmentTimeInput !== undefined) {
      if (appointmentTimeInput === null) {
        currentDraft.appointmentTime = null
      } else {
        const formattedTime = this.formatDraftTime(String(appointmentTimeInput))
        if (formattedTime) {
          currentDraft.appointmentTime = formattedTime
        }
      }
    }

    if (args.clientName !== undefined) {
      currentDraft.clientName = args.clientName ? String(args.clientName).trim() : null
    }

    if (args.clientPhone !== undefined) {
      currentDraft.clientPhone = args.clientPhone ? String(args.clientPhone).trim() : null
    }

    if (args.notes !== undefined) {
      currentDraft.notes = args.notes ? String(args.notes).trim() : null
    }
  }

  protected getRequiredFields = (): MissingRule<IAppointmentValidationDraft>[] => {
    return [
      { key: 'service' as keyof IAppointmentValidationDraft, kind: 'ref' },
      { key: 'barber' as keyof IAppointmentValidationDraft, kind: 'ref' },
      { key: 'appointmentDate' as keyof IAppointmentValidationDraft, kind: 'string' },
      { key: 'appointmentTime' as keyof IAppointmentValidationDraft, kind: 'string' },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      {
        label: 'Data',
        value: (draft: IAppointmentValidationDraft) => this.formatDraftDate(draft.appointmentDate),
      },
      {
        label: 'Horário',
        value: (draft: IAppointmentValidationDraft) => draft.appointmentTime,
      },
      {
        label: 'Serviço',
        value: (draft: IAppointmentValidationDraft) => draft.service?.name ?? null,
      },
      {
        label: 'Barbeiro',
        value: (draft: IAppointmentValidationDraft) => draft.barber?.name ?? null,
      },
      {
        label: 'Nome do Cliente',
        value: (draft: IAppointmentValidationDraft) => draft.clientName,
      },
      {
        label: 'Observações',
        value: (draft: IAppointmentValidationDraft) => draft.notes,
      },
    ]
  }

  protected transformToApiPayload = (draft: IAppointmentValidationDraft, context: any): IAppointmentCreationPayload => {
    const businessId = context.businessId || 0

    const dateStr = draft.appointmentDate as string
    const timeStr = draft.appointmentTime as string

    const startDate = parseISO(`${dateStr}T${timeStr}:00.000Z`)

    const endDate = new Date(startDate.getTime() + 20 * 60 * 1000)

    const finalPayload: IAppointmentCreationPayload = {
      businessId,
      serviceId: Number(draft.service?.id),
      barberId: Number(draft.barber?.id),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      clientId: 3,
      source: 'web',
      notes: draft.notes ?? null,
    }
    console.log('n\\n\n\n\n[AppointmentService] Payload para API de Agendamentos', finalPayload)
    return finalPayload
  }

  protected buildListParams = (listType: string, context: { phone: string }): Record<string, any> => {
    const businessId = getBusinessIdForPhone(context.phone)
    switch (listType) {
      case AppointmentFields.SERVICE:
        return {
          businessId,
          filters: 'active:true',
        }
      case AppointmentFields.BARBER:
        return {
          businessId,
          filters: 'active:true',
        }
      default:
        return {}
    }
  }

  protected extractDataFromResult = (listType: string, result: any): any => {
    if (listType === 'autoComplete') {
      return result?.data?.data ?? {}
    }
    const data = result?.data?.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.data)) return data.data
    return []
  }

  protected formatItemToSelection = (listType: string, item: any): SelectionItem => {
    switch (listType) {
      case AppointmentFields.SERVICE:
        return {
          id: item.id,
          name: item.name || item.description,
        }
      case AppointmentFields.BARBER:
        return {
          id: item.id,
          name: item.name,
        }
      default:
        return { id: '', name: '' }
    }
  }

  protected getListErrorMessage = (listType: string): string => {
    switch (listType) {
      case AppointmentFields.SERVICE:
        return 'Erro ao listar serviços da barbearia.'
      case AppointmentFields.BARBER:
        return 'Erro ao listar barbeiros disponíveis.'
      default:
        return 'Não foi possível carregar a lista solicitada.'
    }
  }

  protected override buildPartialUpdatePayload(draft: IAppointmentValidationDraft, updates: Partial<UpsertAppointmentArgs>): Partial<IAppointmentCreationPayload> {
    const payload: Partial<IAppointmentCreationPayload> = {}
    const has = (field: keyof UpsertAppointmentArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    const invalidFields = Object.keys(updates).filter((field) => !this.isFieldValid(field))
    if (invalidFields.length > 0) {
      console.warn(`[AppointmentService] Invalid fields for update ignored: ${invalidFields.join(', ')}`)
    }

    if (has('appointmentDate') || has('appointmentTime')) {
      const dateStr = draft.appointmentDate as string
      const timeStr = draft.appointmentTime as string
      if (dateStr && timeStr) {
        const startDate = parseISO(`${dateStr}T${timeStr}:00.000Z`)
        const endDate = new Date(startDate.getTime() + 20 * 60 * 1000)
        payload.startDate = startDate.toISOString()
        payload.endDate = endDate.toISOString()
      }
    }

    if (has('service')) {
      const serviceId = Number(draft.service?.id)
      if (Number.isFinite(serviceId) && serviceId > 0) {
        payload.serviceId = serviceId
      }
    }

    if (has('barber')) {
      const barberId = Number(draft.barber?.id)
      if (Number.isFinite(barberId) && barberId > 0) {
        payload.barberId = barberId
      }
    }

    if (has('clientName')) {
      payload.clientName = draft.clientName ?? undefined
    }

    if (has('clientPhone')) {
      payload.clientPhone = draft.clientPhone ?? undefined
    }

    if (has('notes')) {
      payload.notes = draft.notes ?? undefined
    }

    return payload
  }

  create = async (phone: string, draft: IAppointmentValidationDraft): Promise<{ id: string }> => {
    const businessId = getBusinessIdForPhone(phone)
    const endpoint = `/appointments/${businessId}/appointments`

    try {
      if (!draft.appointmentDate || !draft.appointmentTime) {
        throw new Error('Data e horário do agendamento são obrigatórios')
      }
      if (!draft.service?.id || !draft.barber?.id) {
        throw new Error('Serviço e barbeiro são obrigatórios')
      }

      const originalTransform = this.transformToApiPayload
      this.transformToApiPayload = (draft: IAppointmentValidationDraft, context: any): IAppointmentCreationPayload => {
        return originalTransform.call(this, draft, { ...context, phone, businessId })
      }

      const result = await this._createRecord(phone, draft, endpoint)

      this.transformToApiPayload = originalTransform

      await resetActiveRegistration(phone)
      await clearAllUserIntents(phone)
      return result
    } catch (error) {
      console.error('[AppointmentService] Erro ao criar agendamento:', error)
      throw error
    }
  }
}

export const appointmentService = new AppointmentService()
