import { format, isValid, parse, parseISO } from 'date-fns'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { emptyAppointmentDraft } from '../drafts/appointment/appointment.draft'
import { GenericService } from '../generic/generic.service'
import { AppointmentRecord, IAppointmentCreationPayload, IAppointmentValidationDraft, UpsertAppointmentArgs } from './appointment.types'
import { MissingRule } from '../drafts/draft-flow.utils'
import { SelectionItem, SummarySections } from '../generic/generic.types'
import { getBusinessIdForPhone } from '../../env.config'
import { IdNameRef } from '../drafts/types'
import { mergeIdNameRef } from '../drafts/ref.utils'

const AUTO_COMPLETE_ENDPOINT = '/appointments/suggest'
const DEFAULT_SERVICE_DURATION_MINUTES = 30
const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/

const VALID_EDITABLE_FIELDS: (keyof UpsertAppointmentArgs)[] = ['appointmentDate', 'appointmentTime', 'service', 'professional', 'clientName', 'clientPhone', 'notes'] as const

interface AppointmentPayloadContext {
  farmId?: number | string
  businessId?: number | string
  clientId?: number
  phone?: string
}

export class AppointmentService extends GenericService<IAppointmentValidationDraft, IAppointmentCreationPayload, AppointmentRecord, UpsertAppointmentArgs> {
  getValidFieldsFormatted(): string {
    const fieldLabels: Partial<Record<keyof UpsertAppointmentArgs, string>> = {
      appointmentDate: 'data do agendamento',
      appointmentTime: 'horário do agendamento',
      service: 'serviço',
      professional: 'profissional',
      clientName: 'nome do cliente',
      clientPhone: 'telefone do cliente',
      notes: 'observações',
    }

    return VALID_EDITABLE_FIELDS.map((field) => fieldLabels[field] || field).join(', ')
  }
  constructor() {
    const buildEndpoint = ({ farmId }: { farmId?: string | number }): string => (farmId ? `/appointments/${farmId}/appointments` : '/appointments')
    const buildAutoComplete = ({ farmId }: { farmId?: string | number }): string => (farmId ? `/appointments/${farmId}/suggest` : AUTO_COMPLETE_ENDPOINT)

    super(
      'appointment',
      emptyAppointmentDraft,
      process.env.APPOINTMENTS_URL || '',
      AUTO_COMPLETE_ENDPOINT,
      VALID_EDITABLE_FIELDS,
      {
        rawPayload: true,
        endpoints: {
          autoComplete: buildAutoComplete,
          create: buildEndpoint,
          update: buildEndpoint,
          patch: buildEndpoint,
          delete: buildEndpoint,
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
    const trimmedTime = rawTime.trim()
    return TIME_REGEX.test(trimmedTime) ? trimmedTime : null
  }

  private normalizeRefInput(value: unknown): IdNameRef | null | undefined {
    if (value === undefined) return undefined
    if (value === null) return null

    if (Array.isArray(value)) {
      return value.reduce<IdNameRef | null | undefined>((acc, option) => {
        if (acc !== undefined) return acc
        return this.normalizeRefInput(option)
      }, undefined)
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed ? { id: null, name: trimmed } : null
    }

    if (typeof value === 'number' || typeof value === 'bigint') {
      return { id: String(value), name: null }
    }

    if (typeof value === 'object') {
      return this.normalizeObjectRef(value as Record<string, unknown>) as IdNameRef | null | undefined
    }

    return undefined
  }

  private normalizeObjectRef(candidate: Record<string, unknown>): any {
    const rawId = candidate.id ?? candidate.value ?? candidate.code ?? candidate.externalId ?? candidate.uuid
    const rawName = candidate.name ?? candidate.label ?? candidate.title ?? candidate.description ?? candidate.displayName
    const rawDuration = candidate.duration

    const id = this.extractStringValue(rawId)
    const name = this.extractStringValue(rawName)

    const result: any = { id, name }

    // Extrair e validar duration se presente
    if (rawDuration !== undefined && rawDuration !== null) {
      const durationNumber = typeof rawDuration === 'number' ? rawDuration : typeof rawDuration === 'string' ? Number(rawDuration) : null
      if (durationNumber !== null && !isNaN(durationNumber) && durationNumber > 0) {
        result.duration = durationNumber
      }
    }

    return result
  }

  private extractStringValue(value: unknown): string | null {
    if (typeof value === 'string') {
      return value.trim() || null
    }
    if (value !== undefined && value !== null) {
      return String(value).trim() || null
    }
    return null
  }

  private sanitizePhoneInput(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null
    }
    const digits = String(value).replace(/\D/g, '').trim()
    return digits.length ? digits : null
  }

  protected validateDraftArgsTypes = (args: Partial<UpsertAppointmentArgs>, currentDraft: IAppointmentValidationDraft): void => {
    const extendedArgs = args as Partial<UpsertAppointmentArgs> & {
      date?: unknown
      time?: unknown
      service?: unknown
      professional?: unknown
    }

    const normalizeIdValue = (value: unknown): string | null => {
      if (value === undefined || value === null) return null
      const normalized = String(value).trim()
      return normalized.length ? normalized : null
    }

    const previousServiceId = normalizeIdValue(currentDraft.service?.id)
    const previousProfessionalId = normalizeIdValue(currentDraft.professional?.id)
    const previousDate = currentDraft.appointmentDate ?? null

    const assignRef = (field: keyof Pick<IAppointmentValidationDraft, 'service' | 'professional'>, incoming: IdNameRef | null | undefined) => {
      if (incoming === undefined) return
      if (incoming === null) {
        currentDraft[field] = null
        return
      }

      const target = currentDraft[field]
      if (!target) {
        const newRef: any = { id: incoming.id ?? null, name: incoming.name ?? null }
        if ('duration' in incoming && incoming.duration !== undefined) {
          newRef.duration = incoming.duration ?? null
        }
        currentDraft[field] = newRef
        return
      }

      mergeIdNameRef(target, incoming)
    }

    const normalizedService = this.normalizeRefInput(extendedArgs.service)

    if (normalizedService !== undefined) {
      const incomingServiceId = normalizeIdValue(normalizedService?.id)
      const hasServiceChanged = incomingServiceId !== previousServiceId
      if (hasServiceChanged) {
        currentDraft.professional = { id: null, name: null }
        currentDraft.appointmentTime = null
      }
      assignRef('service', normalizedService)
    }

    const normalizedProfessional = this.normalizeRefInput(extendedArgs.professional)
    if (normalizedProfessional !== undefined) {
      const incomingProfessionalId = normalizeIdValue(normalizedProfessional?.id)
      const hasProfessionalChanged = incomingProfessionalId !== previousProfessionalId
      if (hasProfessionalChanged) {
        currentDraft.appointmentTime = null
      }
      assignRef('professional', normalizedProfessional)
    }

    if (extendedArgs.appointmentDate !== undefined) {
      const appointmentDateInput = extendedArgs.appointmentDate
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

    if (extendedArgs.appointmentTime !== undefined) {
      const appointmentTimeInput = extendedArgs.appointmentTime
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
      const trimmedName = args.clientName ? String(args.clientName).trim() : ''
      currentDraft.clientName = trimmedName.length ? trimmedName : null
    }

    if (args.clientPhone !== undefined) {
      currentDraft.clientPhone = this.sanitizePhoneInput(args.clientPhone)
    }

    if (args.notes !== undefined) {
      const trimmedNotes = args.notes ? String(args.notes).trim() : ''
      currentDraft.notes = trimmedNotes.length ? trimmedNotes : null
    }
  }

  protected getRequiredFields = (): MissingRule<IAppointmentValidationDraft>[] => {
    return [
      { key: 'service' as keyof IAppointmentValidationDraft, kind: 'ref' },
      {
        key: 'professional' as keyof IAppointmentValidationDraft,
        kind: 'custom',
        validate: (value: unknown) => {
          if (!value) return true
          const ref = value as IdNameRef | null | undefined
          return Boolean(ref && ref.id)
        },
      },
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
        label: 'Profissional',
        value: (draft: IAppointmentValidationDraft) => draft.professional?.name ?? null,
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

  private parseDateAndTime(dateStr: string, timeStr: string, durationMinutes?: number | null): { startDate: Date; endDate: Date } {
    const [year, month, day] = dateStr.split('-').map(Number)
    const [hours, minutes] = timeStr.split(':').map(Number)

    const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0)
    const offsetMinutes = localDate.getTimezoneOffset()

    const startDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0))
    startDate.setTime(startDate.getTime() + offsetMinutes * 60000)

    const duration = durationMinutes ?? DEFAULT_SERVICE_DURATION_MINUTES
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000)

    return { startDate, endDate }
  }

  protected transformToApiPayload = (draft: IAppointmentValidationDraft, context: AppointmentPayloadContext): IAppointmentCreationPayload => {
    this.validateAppointmentDraft(draft)

    const resolvedBusinessId = context.businessId ?? context.farmId
    const businessIdNumber = resolvedBusinessId !== undefined && resolvedBusinessId !== null ? Number(resolvedBusinessId) : NaN

    if (!Number.isFinite(businessIdNumber) || businessIdNumber <= 0) {
      throw new Error('Não foi possível identificar o negócio para salvar o agendamento.')
    }

    const serviceDuration = draft.service?.duration ?? null
    const { startDate, endDate } = this.parseDateAndTime(draft.appointmentDate as string, draft.appointmentTime as string, serviceDuration)

    const assignmentStrategy = draft.professional?.id ? 'manual' : 'least_appointments'
    const professionalId = draft.professional?.id ? Number(draft.professional.id) : undefined

    const finalPayload: IAppointmentCreationPayload = {
      businessId: businessIdNumber,
      serviceId: Number(draft.service?.id),
      ...(professionalId !== undefined && { professionalId }),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      source: 'whatsapp',
      assignmentStrategy,
      notes: draft.notes ?? null,
    }

    this.enrichPayloadWithClientInfo(finalPayload, draft, context)

    return finalPayload
  }

  private enrichPayloadWithClientInfo(payload: IAppointmentCreationPayload, draft: IAppointmentValidationDraft, context: AppointmentPayloadContext): void {
    if (context.clientId) {
      payload.clientId = context.clientId
    }

    const sanitizedDraftPhone = draft.clientPhone ? draft.clientPhone.replace(/\D/g, '') : null
    const sanitizedContextPhone = context.phone ? context.phone.replace(/\D/g, '') : null

    if (sanitizedDraftPhone) {
      payload.clientPhone = sanitizedDraftPhone
    } else if (sanitizedContextPhone) {
      payload.clientPhone = sanitizedContextPhone
    }

    if (draft.clientName) {
      const trimmedName = draft.clientName.trim()
      payload.clientName = trimmedName.length ? trimmedName : null
    }

    if (!payload.clientId && !payload.clientPhone) {
      throw new Error('Cliente sem identificador: informe clientId ou clientPhone')
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[AppointmentService] Payload para API de Agendamentos', payload)
    }
  }

  protected buildListParams = (listType: string, context: { phone: string }): Record<string, any> => {
    const businessId = getBusinessIdForPhone(context.phone)
    switch (listType) {
      case AppointmentFields.SERVICE:
        return {
          businessId,
          filters: 'active:true',
        }
      case AppointmentFields.PROFESSIONAL:
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
          duration: item.duration || null,
        }
      case AppointmentFields.PROFESSIONAL:
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
        return 'Erro ao listar serviços da business.'
      case AppointmentFields.PROFESSIONAL:
        return 'Erro ao listar barbeiros disponíveis.'
      default:
        return 'Não foi possível carregar a lista solicitada.'
    }
  }

  protected override buildPartialUpdatePayload(draft: IAppointmentValidationDraft, updates: Partial<UpsertAppointmentArgs>): Partial<IAppointmentCreationPayload> {
    const payload: Partial<IAppointmentCreationPayload> = {}
    const has = (field: keyof UpsertAppointmentArgs): boolean => Object.prototype.hasOwnProperty.call(updates, field)

    this.warnAboutInvalidFields(updates)

    if (has('appointmentDate') || has('appointmentTime')) {
      const dateStr = draft.appointmentDate
      const timeStr = draft.appointmentTime
      if (dateStr && timeStr) {
        const serviceDuration = draft.service?.duration ?? null
        const { startDate, endDate } = this.parseDateAndTime(dateStr, timeStr, serviceDuration)
        payload.startDate = startDate.toISOString()
        payload.endDate = endDate.toISOString()
      }
    }

    if (has('service')) {
      const serviceId = this.extractValidId(draft.service?.id)
      if (serviceId) payload.serviceId = serviceId
    }

    if (has('professional')) {
      const professionalId = this.extractValidId(draft.professional?.id)
      if (professionalId) payload.professionalId = professionalId
    }

    if (has('clientName')) {
      payload.clientName = draft.clientName ? draft.clientName.trim() : undefined
    }

    if (has('clientPhone')) {
      const sanitizedPhone = draft.clientPhone?.replace(/\D/g, '')
      payload.clientPhone = sanitizedPhone || undefined
    }

    if (has('notes')) {
      payload.notes = draft.notes ?? undefined
    }

    return payload
  }

  private warnAboutInvalidFields(updates: Partial<UpsertAppointmentArgs>): void {
    const invalidFields = Object.keys(updates).filter((field) => !this.isFieldValid(field))
    if (invalidFields.length > 0) {
      console.warn(`[AppointmentService] Invalid fields for update ignored: ${invalidFields.join(', ')}`)
    }
  }

  private extractValidId(id: unknown): number | undefined {
    const numId = Number(id)
    return Number.isFinite(numId) && numId > 0 ? numId : undefined
  }

  private validateAppointmentDraft(draft: IAppointmentValidationDraft): void {
    if (!draft.appointmentDate || !draft.appointmentTime) {
      throw new Error('Data e horário do agendamento são obrigatórios')
    }
    if (!draft.service?.id) {
      throw new Error('Serviço é obrigatório')
    }
    // Professional can be null (when using "Nenhum específico" option with least_appointments strategy)
  }
}

export const appointmentService = new AppointmentService()
