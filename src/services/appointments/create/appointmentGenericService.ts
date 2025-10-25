import { GenericService } from '../../generic/generic.service'
import { IBaseEntity, SelectionItem, SummarySections } from '../../generic/generic.types'
import { AppointmentDraft, AppointmentCreatePayload, Appointment, IdNameRef } from '../../../types/appointment.types'
import { CreateAppointmentFields } from '../../../enums/appointment.enum'
import { MissingRule } from '../../drafts/draft-flow.utils'
import { createAppointment } from '../../../api/appointments.api'
import { getOrCreateBusinessConfig } from '../../../api/business.api'
import { FlowType } from '../../../enums/generic.enum'
import { Barber, Service } from '../../../types/business.types'
import { getUserContextSync } from '../../../env.config'
import { systemLogger } from '../../../utils/pino'

export interface AppointmentUpsertArgs {
  service?: IdNameRef
  barber?: IdNameRef
  date?: string
  time?: string
  notes?: string
}

export class AppointmentGenericService extends GenericService<AppointmentDraft, AppointmentCreatePayload, Appointment, AppointmentUpsertArgs> {
  constructor() {
    super(
      FlowType.AppointmentCreate,
      () => ({
        serviceId: null,
        service: null,
        barberId: null,
        barber: null,
        date: null,
        time: null,
        duration: null,
        notes: null,
      }),
      '', // No service prefix needed for mock
      '', // No autocomplete endpoint
      ['service', 'barber', 'date', 'time', 'notes'],
    )
  }

  protected transformToApiPayload = (draft: AppointmentDraft, context: { farmId: number }): AppointmentCreatePayload => {
    return {
      customerName: 'Cliente',
      customerPhone: '', // Will be filled in create
      barberId: draft.barberId!,
      serviceId: draft.serviceId!,
      dateTime: `${draft.date}T${draft.time}:00`,
      duration: draft.duration!,
      businessId: String(context.farmId || 'default'),
      notes: draft.notes ?? undefined,
    }
  }

  protected buildListParams = (_listType: string, _context: { phone: string }): Record<string, any> => {
    return {}
  }

  protected extractDataFromResult = (_listType: string, _result: any): any[] => {
    return []
  }

  protected formatItemToSelection = (_listType: string, _item: any): SelectionItem => {
    return { id: '', name: '' }
  }

  protected getListErrorMessage = (_listType: string): string => {
    return 'Erro ao buscar dados'
  }

  protected validateDraftArgsTypes = (_args: Partial<AppointmentUpsertArgs>, _currentDraft: AppointmentDraft): void => {
    // Validação simples
  }

  protected getRequiredFields = (): MissingRule<AppointmentDraft>[] => {
    return [
      { key: 'service', kind: 'ref' as const },
      { key: 'barber', kind: 'ref' as const },
      { key: 'date', kind: 'string' as const },
      { key: 'time', kind: 'string' as const },
    ]
  }

  protected getSummarySections = (): SummarySections[] => {
    return [
      { label: 'Serviço', value: (draft: any) => draft.service?.name || '-' },
      { label: 'Barbeiro', value: (draft: any) => draft.barber?.name || '-' },
      {
        label: 'Data',
        value: (draft: any) => {
          if (!draft.date) return '-'
          const dateObj = new Date(draft.date + 'T00:00:00')
          return dateObj.toLocaleDateString('pt-BR')
        },
      },
      { label: 'Horário', value: (draft: any) => draft.time || '-' },
      { label: 'Observações', value: (draft: any) => draft.notes || '-' },
    ]
  }

  getValidFieldsFormatted(): string {
    return 'serviço, barbeiro, data, horário, observações'
  }

  updateDraft = async (userId: string, updates: Partial<AppointmentUpsertArgs>): Promise<AppointmentDraft> => {
    const currentDraft = await this.loadDraft(userId)
    const updatedDraft = await this.applyUpdates(userId, currentDraft, updates)

    const envelope = await this.loadEnvelope(userId)
    const context = getUserContextSync(userId)

    envelope.payload = updatedDraft
    envelope.type = this.type
    if (!envelope.sessionId && context?.activeRegistration?.sessionId) {
      envelope.sessionId = context.activeRegistration.sessionId
    }

    await this.store.save(userId, envelope)
    systemLogger.info(
      {
        type: this.type,
        userId,
        updates,
        draft: updatedDraft,
      },
      'Draft updated for user.',
    )

    return updatedDraft
  }

  private async applyUpdates(phone: string, draft: AppointmentDraft, updates: Partial<AppointmentUpsertArgs>): Promise<AppointmentDraft> {
    if (!updates || Object.keys(updates).length === 0) {
      return draft
    }

    let updatedDraft = { ...draft }
    let businessConfig: Awaited<ReturnType<typeof getOrCreateBusinessConfig>> | null = null

    const ensureBusinessConfig = async () => {
      if (!businessConfig) {
        businessConfig = await getOrCreateBusinessConfig(phone)
      }
      return businessConfig
    }

    if (updates.service !== undefined) {
      const config = await ensureBusinessConfig()
      const serviceMatch = this.resolveService(config.services, updates.service)

      if (!serviceMatch) {
        throw new Error('Não consegui identificar o serviço informado.')
      }

      updatedDraft = {
        ...updatedDraft,
        serviceId: String(serviceMatch.id),
        service: { id: serviceMatch.id, name: serviceMatch.name },
        duration: serviceMatch.duration,
      }

      // When the service changes, keep previous selections consistent
      // Reset time so the user can pick a new slot compatible with the duration
      updatedDraft.time = null
    }

    if (updates.barber !== undefined) {
      const config = await ensureBusinessConfig()
      const barberMatch = this.resolveBarber(config.barbers, updates.barber)

      if (!barberMatch) {
        throw new Error('Não consegui identificar o barbeiro informado.')
      }

      updatedDraft = {
        ...updatedDraft,
        barberId: String(barberMatch.id),
        barber: { id: barberMatch.id, name: barberMatch.name },
      }
    }

    if (updates.date !== undefined) {
      const normalizedDate = this.normalizeDate(updates.date)
      if (!normalizedDate) {
        throw new Error('Informe a data no formato YYYY-MM-DD (ex: 2025-01-20).')
      }

      updatedDraft = {
        ...updatedDraft,
        date: normalizedDate,
      }
    }

    if (updates.time !== undefined) {
      const normalizedTime = this.normalizeTime(updates.time)
      if (!normalizedTime) {
        throw new Error('Informe o horário no formato HH:MM (ex: 14:30).')
      }

      updatedDraft = {
        ...updatedDraft,
        time: normalizedTime,
      }
    }

    if (updates.notes !== undefined) {
      const normalizedNotes = this.normalizeNotes(updates.notes)
      updatedDraft = {
        ...updatedDraft,
        notes: normalizedNotes,
      }
    }

    return updatedDraft
  }

  private resolveService(services: Service[], input: unknown): Service | null {
    const activeServices = services.filter((service) => service.active)
    if (!input) {
      return null
    }

    if (typeof input === 'object' && input !== null) {
      const candidate = input as Partial<IdNameRef>
      if (candidate.id !== undefined && candidate.id !== null) {
        const byId = activeServices.find((service) => this.normalizeText(String(service.id)) === this.normalizeText(String(candidate.id)))
        if (byId) {
          return byId
        }
      }
      if (candidate.name) {
        const normalizedName = this.normalizeText(candidate.name)
        const byName = activeServices.find((service) => this.normalizeText(service.name) === normalizedName)
        if (byName) {
          return byName
        }
        const partial = activeServices.find((service) => this.normalizeText(service.name).includes(normalizedName))
        if (partial) {
          return partial
        }
      }
    }

    if (typeof input === 'string') {
      const normalizedInput = this.normalizeText(input)
      if (!normalizedInput) {
        return null
      }

      const byId = activeServices.find((service) => this.normalizeText(String(service.id)) === normalizedInput)
      if (byId) {
        return byId
      }

      const byName = activeServices.find((service) => this.normalizeText(service.name) === normalizedInput)
      if (byName) {
        return byName
      }

      return activeServices.find((service) => this.normalizeText(service.name).includes(normalizedInput)) ?? null
    }

    return null
  }

  private resolveBarber(barbers: Barber[], input: unknown): Barber | null {
    const activeBarbers = barbers.filter((barber) => barber.active)
    if (!input) {
      return null
    }

    if (typeof input === 'object' && input !== null) {
      const candidate = input as Partial<IdNameRef>
      if (candidate.id !== undefined && candidate.id !== null) {
        const byId = activeBarbers.find((barber) => this.normalizeText(String(barber.id)) === this.normalizeText(String(candidate.id)))
        if (byId) {
          return byId
        }
      }
      if (candidate.name) {
        const normalizedName = this.normalizeText(candidate.name)
        const byName = activeBarbers.find((barber) => this.normalizeText(barber.name) === normalizedName)
        if (byName) {
          return byName
        }
        const partial = activeBarbers.find((barber) => this.normalizeText(barber.name).includes(normalizedName))
        if (partial) {
          return partial
        }
      }
    }

    if (typeof input === 'string') {
      const normalizedInput = this.normalizeText(input)
      if (!normalizedInput) {
        return null
      }

      if (normalizedInput.includes('qualquer') || normalizedInput.includes('tanto faz') || normalizedInput.includes('sem preferencia') || normalizedInput.includes('indiferente')) {
        return activeBarbers[0] ?? null
      }

      const byId = activeBarbers.find((barber) => this.normalizeText(String(barber.id)) === normalizedInput)
      if (byId) {
        return byId
      }

      const byName = activeBarbers.find((barber) => this.normalizeText(barber.name) === normalizedInput)
      if (byName) {
        return byName
      }

      return activeBarbers.find((barber) => this.normalizeText(barber.name).includes(normalizedInput)) ?? null
    }

    return null
  }

  private normalizeDate(input: unknown): string | null {
    if (typeof input !== 'string') {
      return null
    }
    const trimmed = input.trim()
    if (!trimmed) {
      return null
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }

    const match = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/)
    if (match) {
      const [, day, month, year] = match
      return `${year}-${month}-${day}`
    }

    return null
  }

  private normalizeTime(input: unknown): string | null {
    if (typeof input !== 'string') {
      return null
    }
    const trimmed = input.trim()
    if (!trimmed) {
      return null
    }

    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed
    }

    const match = trimmed.match(/^(\d{1,2})h(\d{2})?$/)
    if (match) {
      const hours = match[1].padStart(2, '0')
      const minutes = (match[2] ?? '00').padStart(2, '0')
      return `${hours}:${minutes}`
    }

    return null
  }

  private normalizeNotes(input: unknown): string | null {
    if (input === null || input === undefined) {
      return null
    }

    if (typeof input !== 'string') {
      return String(input)
    }

    const trimmed = input.trim()
    if (!trimmed) {
      return null
    }

    const normalized = this.normalizeText(trimmed)
    if (!normalized) {
      return null
    }

    if (normalized === 'nao' || normalized.startsWith('sem ') || normalized.includes('nenhuma')) {
      return null
    }

    return trimmed
  }

  private normalizeText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  }

  // Override create to use mock API
  create = async (phone: string, draft: AppointmentDraft): Promise<{ id: string }> => {
    const businessConfig = await getOrCreateBusinessConfig(phone)

    const payload: AppointmentCreatePayload = {
      customerName: 'Cliente',
      customerPhone: phone,
      barberId: draft.barberId!,
      serviceId: draft.serviceId!,
      dateTime: `${draft.date}T${draft.time}:00`,
      duration: draft.duration!,
      businessId: businessConfig.id,
      notes: draft.notes ?? undefined,
    }

    const appointment = await createAppointment(payload)
    return { id: appointment.id }
  }

  handleServiceError = (err: any): string => {
    if (err?.message) {
      return err.message
    }
    return 'Erro ao criar agendamento. Tente novamente.'
  }
}
