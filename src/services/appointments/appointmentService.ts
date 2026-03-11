import { format, isValid, parse, parseISO } from 'date-fns'
import { AppointmentFields } from '../../enums/cruds/appointmentFields.enum'
import { emptyAppointmentDraft } from '../drafts/appointment/appointment.draft'
import { GenericService } from '../generic/generic.service'
import { AppointmentAvailabilityContextUpdates, AppointmentAvailabilityResolution, AppointmentRecord, IAppointmentCreationPayload, IAppointmentValidationDraft, StartAppointmentArgs, UpsertAppointmentArgs } from './appointment.types'
import { MissingRule } from '../drafts/draft-flow.utils'
import { SelectionItem, SummarySections } from '../generic/generic.types'
import { getBusinessIdForPhone, getBusinessTimezoneForPhone } from '../../env.config'
import { IdNameRef } from '../drafts/types'
import { mergeIdNameRef } from '../drafts/ref.utils'
import { professionalService } from './professional.service'
import { ApiError } from '../../errors/api-error'
import { getAppErrorMessage } from '../../utils/error-messages'
import { AppErrorCodes } from '../../enums/constants'
import { combineDateAndTimeInTimeZone } from '../../utils/timezone'

const AUTO_COMPLETE_ENDPOINT = '/appointments/suggest'
const DEFAULT_SERVICE_DURATION_MINUTES = 30
const TIME_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
const AVAILABILITY_FALLBACK_MESSAGE = 'Infelizmente não tenho disponibilidade para essa combinação, mas vou te mostrar outras opções.'
const AVAILABILITY_ERROR_MESSAGES = new Set(['Time slot already booked', 'Professional unavailable for selected period'])

const VALID_EDITABLE_FIELDS: (keyof UpsertAppointmentArgs)[] = ['appointmentDate', 'appointmentTime', 'service', 'professional', 'clientName', 'clientPhone', 'notes'] as const

interface AppointmentPayloadContext {
  farmId?: number | string
  businessId?: number | string
  clientId?: number
  phone?: string
  businessTimezone?: string | null
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

    super(
      'appointment',
      emptyAppointmentDraft,
      process.env.APPOINTMENTS_URL || '',
      AUTO_COMPLETE_ENDPOINT,
      VALID_EDITABLE_FIELDS,
      {
        rawPayload: true,
        endpoints: {
          autoComplete: AUTO_COMPLETE_ENDPOINT,
          create: buildEndpoint,
          update: buildEndpoint,
          patch: buildEndpoint,
          delete: buildEndpoint,
        },
      },
      false,
    )
  }

  protected override buildAutoCompletePayload(data: IAppointmentValidationDraft, context: { phone: string; recordId?: string; farmId?: string; businessId?: string }): Record<string, unknown> {
    const businessId = context.farmId ? Number(context.farmId) : Number(getBusinessIdForPhone(context.phone))
    const hasValidBusinessId = Number.isFinite(businessId) && businessId > 0

    return {
      data: {
        ...(hasValidBusinessId ? { businessId } : {}),
        ...(data.appointmentDate ? { appointmentDate: data.appointmentDate } : {}),
        ...(data.appointmentTime ? { appointmentTime: data.appointmentTime } : {}),
        ...(this.hasUsableRef(data.service) ? { service: data.service } : {}),
        ...(this.hasUsableRef(data.professional) ? { professional: data.professional } : {}),
      },
    }
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

    const appointmentDateInput = extendedArgs.appointmentDate !== undefined ? extendedArgs.appointmentDate : extendedArgs.date
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

    const appointmentTimeInput = extendedArgs.appointmentTime !== undefined ? extendedArgs.appointmentTime : extendedArgs.time
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

  applyStartArgsToDraft(draft: IAppointmentValidationDraft, args: Partial<StartAppointmentArgs>): IAppointmentValidationDraft {
    const nextDraft = JSON.parse(JSON.stringify(draft)) as IAppointmentValidationDraft
    this.validateDraftArgsTypes(args as Partial<UpsertAppointmentArgs>, nextDraft)
    return nextDraft
  }

  async resolveSuggestedDraft(phone: string, draft: IAppointmentValidationDraft): Promise<Partial<IAppointmentValidationDraft>> {
    const autoCompleteResponse = await this.autoComplete(phone, draft)
    const autoCompletePayload = this.extractDataFromResult('autoComplete', autoCompleteResponse)
    return (autoCompletePayload as Partial<IAppointmentValidationDraft>) ?? {}
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

  private parseDateAndTime(dateStr: string, timeStr: string, durationMinutes?: number | null, businessTimezone?: string | null): { startDate: Date; endDate: Date } {
    const startDate = combineDateAndTimeInTimeZone(dateStr, timeStr, businessTimezone)
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
    const businessTimezone = context.businessTimezone ?? (context.phone ? getBusinessTimezoneForPhone(context.phone) : null)
    const { startDate, endDate } = this.parseDateAndTime(draft.appointmentDate as string, draft.appointmentTime as string, serviceDuration, businessTimezone)

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
      const payload = result?.data?.data ?? {}
      const draftUpdates: Partial<IAppointmentValidationDraft> = {}

      if (payload?.service !== undefined) {
        draftUpdates.service = payload.service
      }
      if (payload?.professional !== undefined) {
        draftUpdates.professional = payload.professional
      }
      if (payload?.appointmentDate !== undefined) {
        draftUpdates.appointmentDate = payload.appointmentDate
      }
      if (payload?.appointmentTime !== undefined) {
        draftUpdates.appointmentTime = payload.appointmentTime
      }

      return draftUpdates
    }
    const data = result?.data?.data
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.data)) return data.data
    return []
  }

  handleServiceError = (err: unknown): string => {
    if (this.isAvailabilityConflictError(err)) {
      return AVAILABILITY_FALLBACK_MESSAGE
    }

    if (err instanceof ApiError) {
      return getAppErrorMessage(err.key)
    }

    if (err instanceof Error) {
      console.error('An unexpected non-API error occurred:', err)
      return getAppErrorMessage(AppErrorCodes.UNKNOWN_ERROR)
    }

    console.error('An unknown error type was caught:', err)
    return getAppErrorMessage(AppErrorCodes.UNKNOWN_ERROR)
  }

  async reconcileDraftAvailability(phone: string, draft: IAppointmentValidationDraft): Promise<AppointmentAvailabilityResolution> {
    const serviceId = this.extractValidId(draft.service?.id)
    const date = draft.appointmentDate ?? null

    if (!serviceId || !date) {
      return { status: 'ok', draft }
    }

    const hasResolvedProfessional = Boolean(this.extractValidId(draft.professional?.id))
    const hasUnresolvedProfessionalName = Boolean(draft.professional?.name && !hasResolvedProfessional)

    if (hasUnresolvedProfessionalName) {
      return { status: 'ok', draft }
    }

    if (hasResolvedProfessional) {
      const professionalId = this.extractValidId(draft.professional?.id)
      const eligibleProfessionals = await professionalService.getProfessionals(phone, serviceId)
      const stillCompatible = eligibleProfessionals.some((professional) => this.extractValidId(professional.id) === professionalId)

      if (!stillCompatible) {
        const preservedSlotResolution = await this.tryPreserveTimeSlotWithAnotherProfessional(phone, draft, serviceId, date)
        if (preservedSlotResolution) {
          const compatibleProfessionalIds = 'compatibleProfessionalIds' in preservedSlotResolution ? preservedSlotResolution.compatibleProfessionalIds ?? null : null
          console.info('[AppointmentService] Reconciled availability after service change by keeping the original slot.', {
            phone,
            serviceId,
            date,
            time: draft.appointmentTime,
            previousProfessionalId: professionalId,
            resolutionStatus: preservedSlotResolution.status,
            compatibleProfessionalIds,
          })
          return preservedSlotResolution
        }

        console.info('[AppointmentService] Reconciled availability by clearing the incompatible professional.', {
          phone,
          serviceId,
          date,
          time: draft.appointmentTime,
          previousProfessionalId: professionalId,
          resolutionStatus: 'reset-professional',
        })
        return {
          status: 'reset-professional',
          draft: this.withAvailabilityFallback(draft, 'reset-professional'),
          message: draft.professional?.name ? `${draft.professional.name} nao atende esse servico. Vou te mostrar outros profissionais.` : 'Esse profissional nao atende esse servico. Vou te mostrar outras opcoes.',
          contextUpdates: {
            professionalId: null,
            professionalName: null,
            availableProfessionalIdsForSlot: null,
            autoAssignedProfessional: false,
          },
        }
      }

      const slots = await professionalService.getAvailableSlots({
        phone,
        professionalId,
        date,
        serviceId,
      })

      if (!slots.length) {
        console.info('[AppointmentService] Reconciled availability by resetting the date because no slot exists for the selected professional.', {
          phone,
          serviceId,
          date,
          time: draft.appointmentTime,
          professionalId,
          resolutionStatus: 'reset-date',
        })
        return {
          status: 'reset-date',
          draft: this.withAvailabilityFallback(draft, 'reset-date'),
          message: AVAILABILITY_FALLBACK_MESSAGE,
          contextUpdates: {
            availableProfessionalIdsForSlot: null,
            autoAssignedProfessional: false,
            timeSlot: null,
          },
        }
      }

      if (draft.appointmentTime && !slots.includes(draft.appointmentTime)) {
        console.info('[AppointmentService] Reconciled availability by resetting the time for the selected professional.', {
          phone,
          serviceId,
          date,
          time: draft.appointmentTime,
          professionalId,
          resolutionStatus: 'reset-time',
        })
        return {
          status: 'reset-time',
          draft: this.withAvailabilityFallback(draft, 'reset-time'),
          message: AVAILABILITY_FALLBACK_MESSAGE,
          contextUpdates: {
            availableProfessionalIdsForSlot: null,
            autoAssignedProfessional: false,
            timeSlot: null,
          },
        }
      }

      return { status: 'ok', draft }
    }

    if (draft.professional === null) {
      const slots = await professionalService.getAvailableSlotsAggregated({
        phone,
        date,
        serviceId,
      })

      if (!slots.length) {
        console.info('[AppointmentService] Reconciled aggregated availability by resetting the date.', {
          phone,
          serviceId,
          date,
          time: draft.appointmentTime,
          resolutionStatus: 'reset-date',
        })
        return {
          status: 'reset-date',
          draft: this.withAvailabilityFallback(draft, 'reset-date'),
          message: AVAILABILITY_FALLBACK_MESSAGE,
          contextUpdates: {
            availableProfessionalIdsForSlot: null,
            autoAssignedProfessional: false,
            timeSlot: null,
          },
        }
      }

      if (draft.appointmentTime && !slots.some((slot) => slot.start === draft.appointmentTime)) {
        console.info('[AppointmentService] Reconciled aggregated availability by resetting the time.', {
          phone,
          serviceId,
          date,
          time: draft.appointmentTime,
          resolutionStatus: 'reset-time',
        })
        return {
          status: 'reset-time',
          draft: this.withAvailabilityFallback(draft, 'reset-time'),
          message: AVAILABILITY_FALLBACK_MESSAGE,
          contextUpdates: {
            availableProfessionalIdsForSlot: null,
            autoAssignedProfessional: false,
            timeSlot: null,
          },
        }
      }
    }

    return { status: 'ok', draft }
  }

  isAvailabilityConflictError(error: unknown): boolean {
    const message = this.extractErrorMessage(error)
    return Boolean(message && AVAILABILITY_ERROR_MESSAGES.has(message))
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

  private buildAvailabilityContextUpdates(updates: AppointmentAvailabilityContextUpdates = {}): AppointmentAvailabilityContextUpdates {
    return {
      professionalId: updates.professionalId ?? null,
      professionalName: updates.professionalName ?? null,
      availableProfessionalIdsForSlot: updates.availableProfessionalIdsForSlot ?? null,
      autoAssignedProfessional: updates.autoAssignedProfessional ?? false,
      timeSlot: updates.timeSlot ?? null,
    }
  }

  private async tryPreserveTimeSlotWithAnotherProfessional(
    phone: string,
    draft: IAppointmentValidationDraft,
    serviceId: number,
    date: string,
  ): Promise<AppointmentAvailabilityResolution | null> {
    const time = draft.appointmentTime ?? null
    if (!time) {
      return null
    }

    const aggregatedSlots = await professionalService.getAvailableSlotsAggregated({
      phone,
      date,
      serviceId,
    })
    const matchingSlot = aggregatedSlots.find((slot) => slot.start === time)
    if (!matchingSlot || !matchingSlot.professionals.length) {
      return null
    }

    const compatibleProfessionalIds = matchingSlot.professionals.map((professional) => String(professional.id))
    if (matchingSlot.professionals.length === 1) {
      const [singleProfessional] = matchingSlot.professionals
      return {
        status: 'ok',
        draft: {
          ...draft,
          service: draft.service ? { ...draft.service } : null,
          professional: {
            id: String(singleProfessional.id),
            name: singleProfessional.name ?? null,
          },
        },
        contextUpdates: this.buildAvailabilityContextUpdates({
          professionalId: String(singleProfessional.id),
          professionalName: singleProfessional.name ?? null,
          availableProfessionalIdsForSlot: null,
          autoAssignedProfessional: true,
          timeSlot: time,
        }),
      }
    }

    return {
      status: 'reselect-professional-keep-slot',
      draft: {
        ...draft,
        service: draft.service ? { ...draft.service } : null,
        professional: { id: null, name: null },
      },
      message: draft.professional?.name
        ? `${draft.professional.name} nao atende esse servico nesse horario, mas ${time} segue disponivel. Vou te mostrar quem consegue te atender.`
        : `O horario ${time} segue disponivel para esse servico. Vou te mostrar quem consegue te atender.`,
      compatibleProfessionalIds,
      contextUpdates: this.buildAvailabilityContextUpdates({
        professionalId: null,
        professionalName: null,
        availableProfessionalIdsForSlot: compatibleProfessionalIds,
        autoAssignedProfessional: false,
        timeSlot: time,
      }),
    }
  }

  private hasUsableRef(ref: IdNameRef | null | undefined): boolean {
    if (!ref) return false
    return Boolean(this.extractStringValue(ref.id) || this.extractStringValue(ref.name))
  }

  private withAvailabilityFallback(draft: IAppointmentValidationDraft, mode: 'reset-time' | 'reset-date' | 'reset-professional'): IAppointmentValidationDraft {
    return {
      ...draft,
      service: draft.service ? { ...draft.service } : null,
      professional: mode === 'reset-professional' ? { id: null, name: null } : draft.professional ? { ...draft.professional } : draft.professional,
      appointmentDate: mode === 'reset-date' ? null : draft.appointmentDate,
      appointmentTime: null,
    }
  }

  private extractErrorMessage(error: unknown): string | null {
    if (error instanceof ApiError) {
      return error.message?.trim() || error.userMessage?.trim() || null
    }

    if (error instanceof Error) {
      return error.message?.trim() || null
    }

    return null
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
