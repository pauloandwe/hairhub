import { addDays, format, isSameDay, parseISO } from 'date-fns'
import { sendWhatsAppMessage } from '../../api/meta.api'
import { getUserContextSync, setUserContext } from '../../env.config'
import { emptyAppointmentDraft } from '../drafts/appointment/appointment.draft'
import { SelectionItem } from '../generic/generic.types'
import { AvailabilityResolutionCandidate, IAppointmentValidationDraft, PendingAppointmentOffer, PendingAvailabilityResolution, StartAppointmentArgs } from './appointment.types'
import { appointmentService } from './appointmentService'
import { professionalService } from './professional.service'
import { serviceService } from './service.service'

const OFFER_TTL_MS = 15 * 60 * 1000

export const APPOINTMENT_AVAILABILITY_RESOLUTION_NAMESPACE = 'APPOINTMENT_AVAILABILITY_RESOLUTION'

type ExactAvailabilityResult = {
  available: boolean
  alternatives: string[]
}

type CheckThenOfferResult =
  | {
      status: 'offer'
      offer: PendingAppointmentOffer
      message: string
    }
  | {
      status: 'resolution'
      resolution: PendingAvailabilityResolution
    }
  | {
      status: 'unavailable'
      message: string
    }
  | {
      status: 'missing_slot'
      message: string
    }
  | {
      status: 'error'
      message: string
    }

type PendingOfferReplyResult = { handled: false } | { handled: true; action: 'accept' | 'decline'; offer?: PendingAppointmentOffer }

type PendingResolutionReplyResult = { handled: false } | { handled: true; action: 'selected'; request: Omit<StartAppointmentArgs, 'intentMode'> } | { handled: true; action: 'decline' }

const AFFIRMATIVE_REPLIES = new Set(['sim', 's', 'quero', 'pode', 'pode sim', 'claro', 'ok', 'okay', 'fechou', 'confirmo', 'pode marcar', 'quero marcar', 'marca', 'marcar', 'agenda', 'agendar'])

const NEGATIVE_REPLIES = new Set(['nao', 'não', 'n', 'agora nao', 'agora não', 'deixa', 'deixa pra la', 'deixa pra lá', 'deixa quieto', 'cancelar', 'nao quero', 'não quero'])

function cloneServiceRef(value: IAppointmentValidationDraft['service']): IAppointmentValidationDraft['service'] {
  if (!value) return null
  return {
    id: value.id ?? null,
    name: value.name ?? null,
    duration: value.duration ?? null,
  }
}

function cloneProfessionalRef(value: IAppointmentValidationDraft['professional']): IAppointmentValidationDraft['professional'] {
  if (!value) return null
  return {
    id: value.id ?? null,
    name: value.name ?? null,
  }
}

function cloneOffer(offer: PendingAppointmentOffer | null | undefined): PendingAppointmentOffer | null {
  if (!offer) return null
  return {
    appointmentDate: offer.appointmentDate,
    appointmentTime: offer.appointmentTime,
    service: offer.service
      ? {
          id: offer.service.id ?? null,
          name: offer.service.name ?? null,
          duration: offer.service.duration ?? null,
        }
      : null,
    professional: offer.professional
      ? {
          id: offer.professional.id ?? null,
          name: offer.professional.name ?? null,
        }
      : null,
    clientName: offer.clientName ?? null,
    clientPhone: offer.clientPhone ?? null,
    notes: offer.notes ?? null,
    createdAt: offer.createdAt,
    expiresAt: offer.expiresAt,
  }
}

function cloneResolution(resolution: PendingAvailabilityResolution | null | undefined): PendingAvailabilityResolution | null {
  if (!resolution) return null
  return {
    kind: resolution.kind,
    request: {
      ...resolution.request,
      service: typeof resolution.request.service === 'object' && resolution.request.service !== null ? { ...(resolution.request.service as Record<string, unknown>) } : resolution.request.service,
      professional: typeof resolution.request.professional === 'object' && resolution.request.professional !== null ? { ...(resolution.request.professional as Record<string, unknown>) } : resolution.request.professional,
    },
    candidates: resolution.candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      description: candidate.description,
      duration: candidate.duration ?? null,
    })),
    prompt: resolution.prompt,
    createdAt: resolution.createdAt,
    expiresAt: resolution.expiresAt,
  }
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
    .trim()
}

function normalizeMatchText(value?: string | null): string {
  const normalized = normalizeText(value ?? '')
  if (!normalized) return ''

  return normalized
    .split(' ')
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
    .join(' ')
    .trim()
}

function matchesCandidate(input: string, candidateName?: string | null): boolean {
  const normalizedInput = normalizeMatchText(input)
  const normalizedCandidate = normalizeMatchText(candidateName ?? '')

  if (!normalizedInput || !normalizedCandidate) return false
  return normalizedCandidate === normalizedInput || normalizedCandidate.includes(normalizedInput) || normalizedInput.includes(normalizedCandidate)
}

function extractStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }

  if (value !== undefined && value !== null) {
    const normalized = String(value).trim()
    return normalized.length ? normalized : null
  }

  return null
}

function extractIdValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized.length ? normalized : null
}

function toIsoTimestamp(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return true
  const expiresAtMs = new Date(expiresAt).getTime()
  return !Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs
}

function formatDateLabel(date: string): string {
  try {
    return format(parseISO(date), 'dd/MM/yyyy')
  } catch {
    return date
  }
}

function formatConversationalDate(date: string): string {
  try {
    const parsedDate = parseISO(date)
    const today = new Date()
    if (isSameDay(parsedDate, today)) {
      return 'hoje'
    }
    if (isSameDay(parsedDate, addDays(today, 1))) {
      return 'amanha'
    }
    return `dia ${format(parsedDate, 'dd/MM')}`
  } catch {
    return `dia ${formatDateLabel(date)}`
  }
}

class AppointmentIntentService {
  private getPendingOffer(phone: string): PendingAppointmentOffer | null {
    const context = getUserContextSync(phone)
    return cloneOffer(context?.pendingAppointmentOffer)
  }

  private getPendingResolution(phone: string): PendingAvailabilityResolution | null {
    const context = getUserContextSync(phone)
    return cloneResolution(context?.pendingAvailabilityResolution)
  }

  async clearTransientState(phone: string): Promise<void> {
    await setUserContext(phone, {
      pendingAppointmentOffer: null,
      pendingAvailabilityResolution: null,
    })
  }

  async clearPendingOffer(phone: string): Promise<void> {
    await setUserContext(phone, { pendingAppointmentOffer: null })
  }

  async clearPendingResolution(phone: string): Promise<void> {
    await setUserContext(phone, { pendingAvailabilityResolution: null })
  }

  async cleanupExpiredState(phone: string): Promise<void> {
    const pendingOffer = this.getPendingOffer(phone)
    const pendingResolution = this.getPendingResolution(phone)
    const updates: Record<string, null> = {}

    if (pendingOffer && isExpired(pendingOffer.expiresAt)) {
      updates.pendingAppointmentOffer = null
    }

    if (pendingResolution && isExpired(pendingResolution.expiresAt)) {
      updates.pendingAvailabilityResolution = null
    }

    if (Object.keys(updates).length > 0) {
      await setUserContext(phone, updates)
    }
  }

  getPendingOfferSnapshot = async (phone: string): Promise<PendingAppointmentOffer | null> => {
    await this.cleanupExpiredState(phone)
    return this.getPendingOffer(phone)
  }

  getPendingResolutionSnapshot(phone: string): PendingAvailabilityResolution | null {
    const resolution = this.getPendingResolution(phone)
    if (!resolution || isExpired(resolution.expiresAt)) {
      return null
    }
    return resolution
  }

  getResolutionCandidates(phone: string): AvailabilityResolutionCandidate[] {
    const resolution = this.getPendingResolutionSnapshot(phone)
    return resolution?.candidates.map((candidate) => ({ ...candidate })) ?? []
  }

  getResolutionPrompt(phone: string): string | null {
    return this.getPendingResolutionSnapshot(phone)?.prompt ?? null
  }

  buildStartArgsFromOffer(offer: PendingAppointmentOffer): Omit<StartAppointmentArgs, 'intentMode'> {
    return {
      appointmentDate: offer.appointmentDate,
      appointmentTime: offer.appointmentTime,
      ...(offer.service ? { service: cloneServiceRef(offer.service) } : {}),
      ...(offer.professional ? { professional: cloneProfessionalRef(offer.professional) } : {}),
      ...(offer.clientName ? { clientName: offer.clientName } : {}),
      ...(offer.clientPhone ? { clientPhone: offer.clientPhone } : {}),
      ...(offer.notes ? { notes: offer.notes } : {}),
    }
  }

  async consumePendingOfferReply(phone: string, incomingMessage: string): Promise<PendingOfferReplyResult> {
    await this.cleanupExpiredState(phone)
    const offer = this.getPendingOffer(phone)
    if (!offer) {
      return { handled: false }
    }

    const normalizedMessage = normalizeText(incomingMessage)
    if (AFFIRMATIVE_REPLIES.has(normalizedMessage)) {
      await this.clearPendingOffer(phone)
      return { handled: true, action: 'accept', offer }
    }

    if (NEGATIVE_REPLIES.has(normalizedMessage)) {
      await this.clearPendingOffer(phone)
      return { handled: true, action: 'decline' }
    }

    return { handled: false }
  }

  async takePendingOffer(phone: string): Promise<PendingAppointmentOffer | null> {
    await this.cleanupExpiredState(phone)
    const offer = this.getPendingOffer(phone)
    if (!offer) return null
    await this.clearPendingOffer(phone)
    return offer
  }

  async consumeResolutionSelection(phone: string, candidateId: string): Promise<Omit<StartAppointmentArgs, 'intentMode'> | null> {
    await this.cleanupExpiredState(phone)
    const resolution = this.getPendingResolution(phone)
    if (!resolution || isExpired(resolution.expiresAt)) {
      await this.clearPendingResolution(phone)
      return null
    }

    const candidate = resolution.candidates.find((item) => String(item.id) === String(candidateId))
    if (!candidate) {
      return null
    }

    const nextRequest: Omit<StartAppointmentArgs, 'intentMode'> = { ...resolution.request }
    if (resolution.kind === 'service') {
      nextRequest.service = {
        id: candidate.id,
        name: candidate.name,
        duration: candidate.duration ?? null,
      }
    } else {
      nextRequest.professional = {
        id: candidate.id,
        name: candidate.name,
      }
    }

    await this.clearPendingResolution(phone)
    return nextRequest
  }

  async consumePendingResolutionReply(phone: string, incomingMessage: string): Promise<PendingResolutionReplyResult> {
    await this.cleanupExpiredState(phone)
    const resolution = this.getPendingResolution(phone)
    if (!resolution || isExpired(resolution.expiresAt)) {
      return { handled: false }
    }

    const normalizedMessage = normalizeText(incomingMessage)
    if (NEGATIVE_REPLIES.has(normalizedMessage)) {
      await this.clearPendingResolution(phone)
      return { handled: true, action: 'decline' }
    }

    const matches = resolution.candidates.filter((candidate) => matchesCandidate(incomingMessage, candidate.name))
    if (matches.length !== 1) {
      return { handled: false }
    }

    const request = await this.consumeResolutionSelection(phone, matches[0].id)
    if (!request) {
      return { handled: false }
    }

    return { handled: true, action: 'selected', request }
  }

  async handleCheckThenOffer(phone: string, args: Omit<StartAppointmentArgs, 'intentMode'>): Promise<CheckThenOfferResult> {
    await this.clearTransientState(phone)

    const normalizedDraft = appointmentService.applyStartArgsToDraft(emptyAppointmentDraft(), args)
    const normalizedStartArgs = this.buildNormalizedRequestArgs(normalizedDraft, args)
    const professionalWasRequested = this.hasReferenceInput(args.professional)

    if (!normalizedDraft.appointmentDate || !normalizedDraft.appointmentTime) {
      return {
        status: 'missing_slot',
        message: 'Me fala o dia e o horario exato que voce quer verificar.',
      }
    }

    let resolvedDraft = await this.resolveSuggestedDraft(phone, normalizedDraft)

    const serviceResolution = await this.resolveService(phone, normalizedStartArgs.service, resolvedDraft)
    if (serviceResolution.status === 'ambiguous') {
      const resolution = await this.storeResolution(phone, 'service', normalizedStartArgs, serviceResolution.candidates)
      return { status: 'resolution', resolution }
    }
    if (serviceResolution.status === 'resolved') {
      resolvedDraft.service = cloneServiceRef(serviceResolution.ref)
      normalizedStartArgs.service = cloneServiceRef(serviceResolution.ref)
    }

    const serviceId = extractIdValue(resolvedDraft.service?.id)
    const professionalResolution = await this.resolveProfessional(phone, normalizedStartArgs.professional, resolvedDraft, serviceId)
    if (professionalResolution.status === 'ambiguous') {
      const resolution = await this.storeResolution(phone, 'professional', normalizedStartArgs, professionalResolution.candidates)
      return { status: 'resolution', resolution }
    }
    if (professionalResolution.status === 'resolved') {
      resolvedDraft.professional = cloneProfessionalRef(professionalResolution.ref)
      normalizedStartArgs.professional = cloneProfessionalRef(professionalResolution.ref)
    }

    if (professionalWasRequested && !extractIdValue(resolvedDraft.professional?.id)) {
      return {
        status: 'error',
        message: 'Nao consegui identificar certinho qual profissional voce quer. Pode me falar o nome completo ou escolher uma opcao?',
      }
    }

    const availability = await this.checkExactAvailability(phone, resolvedDraft)
    if (!availability.available) {
      return {
        status: 'unavailable',
        message: this.buildUnavailableMessage(resolvedDraft, availability.alternatives),
      }
    }

    const offer = await this.storeOffer(phone, resolvedDraft)
    return {
      status: 'offer',
      offer,
      message: this.buildOfferMessage(offer),
    }
  }

  private buildNormalizedRequestArgs(draft: IAppointmentValidationDraft, args: Omit<StartAppointmentArgs, 'intentMode'>): Omit<StartAppointmentArgs, 'intentMode'> {
    return {
      ...(draft.appointmentDate ? { appointmentDate: draft.appointmentDate } : {}),
      ...(draft.appointmentTime ? { appointmentTime: draft.appointmentTime } : {}),
      ...(args.service !== undefined ? { service: args.service } : draft.service?.id || draft.service?.name ? { service: cloneServiceRef(draft.service) } : {}),
      ...(args.professional !== undefined ? { professional: args.professional } : draft.professional?.id || draft.professional?.name ? { professional: cloneProfessionalRef(draft.professional) } : {}),
      ...(args.clientName !== undefined ? { clientName: args.clientName } : {}),
      ...(args.clientPhone !== undefined ? { clientPhone: args.clientPhone } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
    }
  }

  private async resolveSuggestedDraft(phone: string, normalizedDraft: IAppointmentValidationDraft): Promise<IAppointmentValidationDraft> {
    const suggested = await appointmentService.resolveSuggestedDraft(phone, normalizedDraft)
    return {
      ...normalizedDraft,
      ...suggested,
      service: cloneServiceRef(suggested.service ?? normalizedDraft.service),
      professional: cloneProfessionalRef(suggested.professional ?? normalizedDraft.professional),
    }
  }

  private async resolveService(
    phone: string,
    rawService: StartAppointmentArgs['service'],
    draft: IAppointmentValidationDraft,
  ): Promise<{ status: 'resolved'; ref: IAppointmentValidationDraft['service'] } | { status: 'ambiguous'; candidates: AvailabilityResolutionCandidate[] } | { status: 'unresolved' }> {
    if (draft.service?.id) {
      return { status: 'resolved', ref: draft.service }
    }

    const serviceName = this.extractReferenceName(rawService, draft.service)
    if (!serviceName) {
      return { status: 'unresolved' }
    }

    const matches = await this.findServiceMatches(phone, serviceName)
    if (matches.length > 1) {
      return {
        status: 'ambiguous',
        candidates: matches.map((service) => ({
          id: service.id,
          name: service.name || service.id,
          description: service.description,
          duration: service.duration ?? null,
        })),
      }
    }

    if (matches.length === 1) {
      const [service] = matches
      return {
        status: 'resolved',
        ref: {
          id: service.id,
          name: service.name || null,
          duration: service.duration ?? null,
        },
      }
    }

    return { status: 'unresolved' }
  }

  private async resolveProfessional(
    phone: string,
    rawProfessional: StartAppointmentArgs['professional'],
    draft: IAppointmentValidationDraft,
    serviceId: string | null,
  ): Promise<{ status: 'resolved'; ref: IAppointmentValidationDraft['professional'] } | { status: 'ambiguous'; candidates: AvailabilityResolutionCandidate[] } | { status: 'unresolved' }> {
    if (draft.professional?.id) {
      return { status: 'resolved', ref: draft.professional }
    }

    const professionalName = this.extractReferenceName(rawProfessional, draft.professional)
    if (!professionalName) {
      return { status: 'unresolved' }
    }

    const matches = await this.findProfessionalMatches(phone, professionalName, serviceId)
    if (matches.length > 1) {
      return {
        status: 'ambiguous',
        candidates: matches.map((professional) => ({
          id: professional.id,
          name: professional.name || professional.id,
          description: professional.description,
        })),
      }
    }

    if (matches.length === 1) {
      const [professional] = matches
      return {
        status: 'resolved',
        ref: {
          id: professional.id,
          name: professional.name || null,
        },
      }
    }

    return { status: 'unresolved' }
  }

  private extractReferenceName(rawValue: StartAppointmentArgs['service'] | StartAppointmentArgs['professional'], fallbackRef: { name?: string | null } | null | undefined): string | null {
    if (typeof rawValue === 'string') {
      return extractStringValue(rawValue)
    }

    if (typeof rawValue === 'number' || typeof rawValue === 'bigint') {
      return extractStringValue(rawValue)
    }

    if (rawValue && typeof rawValue === 'object') {
      return extractStringValue((rawValue as Record<string, unknown>).name ?? (rawValue as Record<string, unknown>).label ?? (rawValue as Record<string, unknown>).title)
    }

    return extractStringValue(fallbackRef?.name)
  }

  private hasReferenceInput(value: StartAppointmentArgs['service'] | StartAppointmentArgs['professional']): boolean {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (typeof value === 'number' || typeof value === 'bigint') return true
    if (typeof value === 'object') {
      const candidate = value as Record<string, unknown>
      return Boolean(extractStringValue(candidate.id) || extractStringValue(candidate.name) || extractStringValue(candidate.label) || extractStringValue(candidate.title))
    }
    return false
  }

  private async findServiceMatches(phone: string, query: string): Promise<SelectionItem[]> {
    const services = (await serviceService.getServices(phone)).filter((service) => service.active !== false)
    return services.filter((service) => matchesCandidate(query, service.name))
  }

  private async findProfessionalMatches(phone: string, query: string, serviceId?: string | null): Promise<SelectionItem[]> {
    const professionals = await professionalService.getProfessionals(phone, serviceId ?? undefined)
    return professionals.filter((professional) => matchesCandidate(query, professional.name))
  }

  private async checkExactAvailability(phone: string, draft: IAppointmentValidationDraft): Promise<ExactAvailabilityResult> {
    const appointmentDate = draft.appointmentDate
    const appointmentTime = draft.appointmentTime
    const professionalId = extractIdValue(draft.professional?.id)
    const serviceId = extractIdValue(draft.service?.id)

    if (!appointmentDate || !appointmentTime) {
      return { available: false, alternatives: [] }
    }

    if (professionalId && serviceId) {
      const slots = await professionalService.getAvailableSlots({
        phone,
        professionalId,
        date: appointmentDate,
        serviceId,
      })

      return {
        available: slots.includes(appointmentTime),
        alternatives: slots.filter((slot) => slot !== appointmentTime).slice(0, 3),
      }
    }

    const aggregatedSlots = await professionalService.getAvailableSlotsAggregated({
      phone,
      date: appointmentDate,
      ...(serviceId ? { serviceId } : {}),
    })

    const sameProfessionalSlots = professionalId ? aggregatedSlots.filter((slot) => slot.professionals.some((professional) => String(professional.id) === professionalId)) : aggregatedSlots

    const exactMatch = sameProfessionalSlots.some((slot) => slot.start === appointmentTime)
    const alternatives = sameProfessionalSlots
      .map((slot) => slot.start)
      .filter((slot) => slot !== appointmentTime)
      .slice(0, 3)

    if (exactMatch || alternatives.length > 0) {
      return {
        available: exactMatch,
        alternatives,
      }
    }

    return {
      available: false,
      alternatives: await this.findAlternativeDates(phone, draft, serviceId, professionalId),
    }
  }

  private async findAlternativeDates(phone: string, draft: IAppointmentValidationDraft, serviceId?: string | null, professionalId?: string | null): Promise<string[]> {
    if (professionalId) {
      const days = await professionalService.getAvailableDays({
        phone,
        professionalId,
        ...(serviceId ? { serviceId } : {}),
      })
      return days.slice(0, 3).map((day) => day.name || day.id)
    }

    const days = await professionalService.getAvailableDaysAggregated({
      phone,
      ...(serviceId ? { serviceId } : {}),
    })
    return days.slice(0, 3).map((day) => day.name || day.id)
  }

  private async storeOffer(phone: string, draft: IAppointmentValidationDraft): Promise<PendingAppointmentOffer> {
    const offer: PendingAppointmentOffer = {
      appointmentDate: draft.appointmentDate as string,
      appointmentTime: draft.appointmentTime as string,
      service: cloneServiceRef(draft.service),
      professional: cloneProfessionalRef(draft.professional),
      clientName: draft.clientName ?? null,
      clientPhone: draft.clientPhone ?? null,
      notes: draft.notes ?? null,
      createdAt: new Date().toISOString(),
      expiresAt: toIsoTimestamp(OFFER_TTL_MS),
    }

    await setUserContext(phone, {
      pendingAppointmentOffer: offer,
      pendingAvailabilityResolution: null,
    })

    return offer
  }

  private async storeResolution(phone: string, kind: PendingAvailabilityResolution['kind'], request: Omit<StartAppointmentArgs, 'intentMode'>, candidates: AvailabilityResolutionCandidate[]): Promise<PendingAvailabilityResolution> {
    const resolution: PendingAvailabilityResolution = {
      kind,
      request,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        duration: candidate.duration ?? null,
      })),
      prompt: kind === 'service' ? 'Achei mais de um servico parecido. Qual deles voce quer?' : 'Achei mais de um profissional com esse nome. Qual deles voce quer?',
      createdAt: new Date().toISOString(),
      expiresAt: toIsoTimestamp(OFFER_TTL_MS),
    }

    await setUserContext(phone, {
      pendingAvailabilityResolution: resolution,
      pendingAppointmentOffer: null,
    })

    return resolution
  }

  private buildOfferMessage(offer: PendingAppointmentOffer): string {
    const whenText = `${formatConversationalDate(offer.appointmentDate)} as ${offer.appointmentTime}`
    const withProfessional = offer.professional?.id && offer.professional.name ? ` com ${offer.professional.name}` : ''
    const withService = offer.service?.id && offer.service.name ? ` para ${offer.service.name}` : ''

    if (!offer.service?.id) {
      return `Tenho sim, ${whenText}${withProfessional}. Se quiser, ja sigo com o agendamento e so te pergunto o servico.`
    }

    return `Tenho sim, ${whenText}${withProfessional}${withService}. Se quiser, ja deixo isso encaminhado.`
  }

  private buildUnavailableMessage(draft: IAppointmentValidationDraft, alternatives: string[]): string {
    const intro = draft.professional?.name ? `Nao encontrei esse horario com ${draft.professional.name}.` : 'Nao encontrei esse horario disponivel.'

    if (alternatives.length === 0) {
      return `${intro} Se quiser, posso verificar outra opcao pra voce.`
    }

    const suggestionText = alternatives.join(', ')
    return `${intro} Posso te oferecer estas opcoes: ${suggestionText}.`
  }

  async notifyOfferDeclined(phone: string): Promise<void> {
    await sendWhatsAppMessage(phone, 'Tudo bem, nao segui com esse horario por aqui.')
  }
}

export const appointmentIntentService = new AppointmentIntentService()
