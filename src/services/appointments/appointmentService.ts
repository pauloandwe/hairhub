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
    const fieldLabels: Partial<Record<keyof any, string>> = {
      quantity: 'quantidade',
      observation: 'observação',
      deathDate: 'data da morte',
      age: 'idade',
      category: 'categoria',
      deathCause: 'causa da morte',
      animalLot: 'lote',
      retreat: 'retiro',
      area: 'área',
      harvestConfiguration: 'configuração de safra',
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
          create: ({ businessId }) => (businessId ? `/${businessId}/appointments` : '/appointments'),
          update: ({ businessId }) => (businessId ? `/${businessId}/appointments` : '/appointments'),
          patch: ({ businessId }) => (businessId ? `/${businessId}/appointments` : '/appointments'),
          delete: ({ businessId }) => (businessId ? `/${businessId}/appointments` : '/appointments'),
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

    const appointmentDateInput = extendedArgs.appointmentDate ?? extendedArgs.date
    if (appointmentDateInput !== undefined) {
      if (appointmentDateInput === null) {
        currentDraft.appointmentDate = null
      } else {
        const rawDate = String(appointmentDateInput).trim()
        if (rawDate) {
          let parsedDate = parseISO(rawDate)

          if (!isValid(parsedDate)) {
            const datePortion = rawDate.length >= 10 ? rawDate.slice(0, 10) : rawDate
            parsedDate = parse(datePortion, 'dd/MM/yyyy', new Date())
          }

          if (isValid(parsedDate)) {
            currentDraft.appointmentDate = format(parsedDate, 'yyyy-MM-dd')
          }
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
    if (normalizedService !== undefined) assignRef('service', normalizedService)

    const normalizedBarber = this.normalizeRefInput(extendedArgs.barber)
    if (normalizedBarber !== undefined) assignRef('barber', normalizedBarber)
  }

  protected getRequiredFields = (): MissingRule<IAppointmentValidationDraft>[] => {
    return [
      { key: 'appointmentDate' as keyof IAppointmentValidationDraft, kind: 'string' },
      { key: 'appointmentTime' as keyof IAppointmentValidationDraft, kind: 'string' },
      { key: 'service' as keyof IAppointmentValidationDraft, kind: 'ref' },
      { key: 'barber' as keyof IAppointmentValidationDraft, kind: 'ref' },
      { key: 'clientName' as keyof IAppointmentValidationDraft, kind: 'string' },
      { key: 'clientPhone' as keyof IAppointmentValidationDraft, kind: 'string' },
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
        label: 'Telefone do Cliente',
        value: (draft: IAppointmentValidationDraft) => draft.clientPhone,
      },
      {
        label: 'Observações',
        value: (draft: IAppointmentValidationDraft) => draft.notes,
      },
    ]
  }

  protected transformToApiPayload = (draft: IAppointmentValidationDraft, context: any): IAppointmentCreationPayload => {
    const businessId = context.businessId || context.farmId || 0
    const finalPayload: IAppointmentCreationPayload = {
      appointmentDate: draft.appointmentDate as string,
      appointmentTime: draft.appointmentTime as string,
      serviceId: Number(draft.service?.id),
      barberId: Number(draft.barber?.id),
      clientName: draft.clientName as string,
      clientPhone: draft.clientPhone as string,
      notes: draft.notes ?? null,
      businessId,
    }

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

    if (has('appointmentDate')) {
      payload.appointmentDate = draft.appointmentDate ?? undefined
    }

    if (has('appointmentTime')) {
      payload.appointmentTime = draft.appointmentTime ?? undefined
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
    const endpoint = `/${businessId}/appointments`
    try {
      const result = await this._createRecord(phone, draft, endpoint)
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
