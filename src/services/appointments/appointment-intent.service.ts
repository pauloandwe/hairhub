import { addDays, format, isSameDay, parseISO } from 'date-fns'
import OpenAI from 'openai'
import { sendWhatsAppMessage } from '../../api/meta.api'
import { env, getUserContextSync, setUserContext } from '../../env.config'
import { OpenAITool } from '../../types/openai-types'
import { emptyAppointmentDraft } from '../drafts/appointment/appointment.draft'
import { SelectionItem } from '../generic/generic.types'
import { AvailabilityResolutionCandidate, IAppointmentValidationDraft, PendingAppointmentOffer, PendingAvailabilityResolution, StartAppointmentArgs } from './appointment.types'
import { appointmentService } from './appointmentService'
import { professionalService, PUBLIC_SLOT_STEP_MINUTES } from './professional.service'
import { serviceService } from './service.service'

const OFFER_TTL_MS = 15 * 60 * 1000
const TIME_SLOT_REGEX = /^\d{2}:\d{2}$/

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

type PendingOfferReplyResult = { handled: false } | { handled: true; action: 'accept'; offer: PendingAppointmentOffer } | { handled: true; action: 'decline' } | { handled: true; action: 'needs_clarification'; message: string }

type PendingResolutionReplyResult = { handled: false } | { handled: true; action: 'selected'; request: Omit<StartAppointmentArgs, 'intentMode'> } | { handled: true; action: 'decline' } | { handled: true; action: 'repeat_options' } | { handled: true; action: 'needs_clarification'; message: string }

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

function timeToMinutes(value: string): number | null {
  if (!TIME_SLOT_REGEX.test(value)) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function pickNearestTimes(requestedTime: string, slots: string[], limit = 3): string[] {
  const targetMinutes = timeToMinutes(requestedTime)
  const uniqueSlots = Array.from(new Set(slots.filter((slot) => TIME_SLOT_REGEX.test(slot))))

  if (targetMinutes === null) {
    return uniqueSlots.slice(0, limit)
  }

  return uniqueSlots
    .map((slot) => ({
      slot,
      minutes: timeToMinutes(slot),
    }))
    .filter((candidate): candidate is { slot: string; minutes: number } => candidate.minutes !== null && candidate.slot !== requestedTime)
    .sort((left, right) => {
      const leftDistance = Math.abs(left.minutes - targetMinutes)
      const rightDistance = Math.abs(right.minutes - targetMinutes)
      if (leftDistance !== rightDistance) return leftDistance - rightDistance
      return left.minutes - right.minutes
    })
    .slice(0, limit)
    .map((candidate) => candidate.slot)
}

class AppointmentIntentService {
  private openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  })

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

    const interpretation = await this.interpretPendingOfferReply(offer, incomingMessage)

    if (interpretation.action === 'accept') {
      await this.clearPendingOffer(phone)
      return { handled: true, action: 'accept', offer }
    }

    if (interpretation.action === 'decline') {
      await this.clearPendingOffer(phone)
      return { handled: true, action: 'decline' }
    }

    return {
      handled: true,
      action: 'needs_clarification',
      message: this.buildOfferClarificationMessage(),
    }
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

    const interpretation = await this.interpretPendingResolutionReply(resolution, incomingMessage)

    if (interpretation.action === 'decline') {
      await this.clearPendingResolution(phone)
      return { handled: true, action: 'decline' }
    }

    if (interpretation.action === 'repeat_options') {
      return { handled: true, action: 'repeat_options' }
    }

    if (interpretation.action === 'select_candidate') {
      const request = await this.consumeResolutionSelection(phone, interpretation.candidateId)
      if (!request) {
        return {
          handled: true,
          action: 'needs_clarification',
          message: this.buildResolutionClarificationMessage(resolution.kind),
        }
      }

      return { handled: true, action: 'selected', request }
    }

    return {
      handled: true,
      action: 'needs_clarification',
      message: this.buildResolutionClarificationMessage(resolution.kind),
    }
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

    const resolvedDraft = await this.resolveSuggestedDraft(phone, normalizedDraft)
    const requestedProfessionalName = this.extractReferenceName(normalizedStartArgs.professional, resolvedDraft.professional)

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
      const professionals = await professionalService.getProfessionals(phone, serviceId ?? undefined)
      const candidates = professionals.map((professional) => ({
        id: professional.id,
        name: professional.name || professional.id,
        description: professional.description,
      }))

      if (candidates.length > 0) {
        const resolution = await this.storeResolution(phone, 'professional', normalizedStartArgs, candidates, this.buildProfessionalNotFoundPrompt(requestedProfessionalName))
        return { status: 'resolution', resolution }
      }

      return {
        status: 'error',
        message: requestedProfessionalName ? `Nao encontrei nenhum ${requestedProfessionalName} aqui e nao achei barbeiros disponiveis agora.` : 'Nao consegui identificar certinho qual profissional voce quer e nao achei barbeiros disponiveis agora.',
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
        stepMinutes: PUBLIC_SLOT_STEP_MINUTES,
      })

      return {
        available: slots.includes(appointmentTime),
        alternatives: pickNearestTimes(appointmentTime, slots),
      }
    }

    const aggregatedSlots = await professionalService.getAvailableSlotsAggregated({
      phone,
      date: appointmentDate,
      stepMinutes: PUBLIC_SLOT_STEP_MINUTES,
      ...(serviceId ? { serviceId } : {}),
    })

    const sameProfessionalSlots = professionalId ? aggregatedSlots.filter((slot) => slot.professionals.some((professional) => String(professional.id) === professionalId)) : aggregatedSlots

    const exactMatch = sameProfessionalSlots.some((slot) => slot.start === appointmentTime)
    const alternatives = pickNearestTimes(
      appointmentTime,
      sameProfessionalSlots.map((slot) => slot.start),
    )

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
        stepMinutes: PUBLIC_SLOT_STEP_MINUTES,
        ...(serviceId ? { serviceId } : {}),
      })
      return days.slice(0, 3).map((day) => day.name || day.id)
    }

    const days = await professionalService.getAvailableDaysAggregated({
      phone,
      stepMinutes: PUBLIC_SLOT_STEP_MINUTES,
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

  private async storeResolution(phone: string, kind: PendingAvailabilityResolution['kind'], request: Omit<StartAppointmentArgs, 'intentMode'>, candidates: AvailabilityResolutionCandidate[], promptOverride?: string): Promise<PendingAvailabilityResolution> {
    const resolution: PendingAvailabilityResolution = {
      kind,
      request,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        description: candidate.description,
        duration: candidate.duration ?? null,
      })),
      prompt: promptOverride ?? (kind === 'service' ? 'Achei mais de um servico parecido. Qual deles voce quer?' : 'Achei mais de um profissional com esse nome. Qual deles voce quer?'),
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

  private buildProfessionalNotFoundPrompt(requestedProfessionalName?: string | null): string {
    if (requestedProfessionalName) {
      return `Nao encontrei nenhum ${requestedProfessionalName} aqui. Vou te mandar as opcoes dos barbeiros.`
    }

    return 'Nao consegui identificar qual barbeiro voce quer. Vou te mandar as opcoes dos barbeiros.'
  }

  private buildUnavailableMessage(draft: IAppointmentValidationDraft, alternatives: string[]): string {
    const requestedTime = draft.appointmentTime
    const serviceText = draft.service?.name ? ` para ${draft.service.name}` : ''
    const professionalText = draft.professional?.name ? ` com ${draft.professional.name}` : ''
    const intro = requestedTime ? `${requestedTime} nao esta livre${serviceText}${professionalText}.` : draft.professional?.name ? `Nao encontrei esse horario com ${draft.professional.name}.` : 'Nao encontrei esse horario disponivel.'

    if (alternatives.length === 0) {
      return `${intro} Se quiser, posso verificar outra opcao pra voce.`
    }

    const suggestionText = alternatives.join(', ')
    const alternativesAreTimes = alternatives.every((option) => TIME_SLOT_REGEX.test(option))
    return alternativesAreTimes ? `${intro} Posso te oferecer estas opcoes proximas: ${suggestionText}.` : `${intro} Posso te oferecer estas opcoes: ${suggestionText}.`
  }

  async notifyOfferDeclined(phone: string): Promise<void> {
    await sendWhatsAppMessage(phone, 'Tudo bem, nao segui com esse horario por aqui.')
  }

  private buildOfferClarificationMessage(): string {
    return 'Nao entendi se voce quer seguir com esse horario. Me responde se quer marcar ou se prefere deixar pra depois.'
  }

  private buildResolutionClarificationMessage(kind: PendingAvailabilityResolution['kind']): string {
    if (kind === 'professional') {
      return 'Nao entendi qual barbeiro voce quer. Me fala o nome da opcao ou pede para eu te mandar a lista de novo.'
    }

    return 'Nao entendi qual opcao voce quer. Me fala o nome do servico ou pede para eu te mandar a lista de novo.'
  }

  private describeOffer(offer: PendingAppointmentOffer): string {
    const parts = [`- Horario: ${formatConversationalDate(offer.appointmentDate)} as ${offer.appointmentTime}`]

    if (offer.professional?.name) {
      parts.push(`- Profissional: ${offer.professional.name}`)
    }

    if (offer.service?.name) {
      parts.push(`- Servico: ${offer.service.name}`)
    }

    return parts.join('\n')
  }

  private describeResolutionCandidates(candidates: AvailabilityResolutionCandidate[]): string {
    return candidates
      .map((candidate, index) => {
        const suffix = candidate.description ? ` (${candidate.description})` : ''
        return `${index + 1}. ${candidate.name}${suffix} [candidateId=${candidate.id}]`
      })
      .join('\n')
  }

  private async interpretPendingOfferReply(offer: PendingAppointmentOffer, incomingMessage: string): Promise<{ action: 'accept' | 'decline' | 'needs_clarification' }> {
    const tools: OpenAITool[] = [
      {
        type: 'function',
        function: {
          name: 'resolve_pending_offer_reply',
          description: 'Classifica a resposta do usuario sobre uma oferta pendente de horario.',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['accept', 'decline', 'needs_clarification'],
              },
            },
            required: ['action'],
            additionalProperties: false,
          },
        },
      },
    ]

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `
Você classifica respostas sobre uma oferta pendente de agendamento.

Escolha:
- accept: quando o usuario deixa explicitamente claro que quer seguir com esse horario.
- decline: quando o usuario deixa explicitamente claro que nao quer seguir com essa oferta agora.
- needs_clarification: quando houver duvida, ambiguidade, pergunta paralela ou qualquer mensagem que nao confirme nem recuse de forma inequívoca.

Regras:
- Nao use accept nem decline por aproximacao.
- Mensagens vagas, saudações, perguntas paralelas ou mudanca de assunto devem virar needs_clarification.
- Responda apenas com a chamada da funcao.
            `.trim(),
          },
          {
            role: 'user',
            content: `Oferta pendente:\n${this.describeOffer(offer)}\n\nMensagem do usuario:\n${incomingMessage}`,
          },
        ],
        tools,
        tool_choice: 'required',
      })

      const toolCall = response.choices[0]?.message?.tool_calls?.[0]
      if (toolCall?.type !== 'function') {
        return { action: 'needs_clarification' }
      }

      const parsed = JSON.parse(toolCall.function.arguments || '{}') as { action?: 'accept' | 'decline' | 'needs_clarification' }
      if (parsed.action === 'accept' || parsed.action === 'decline' || parsed.action === 'needs_clarification') {
        return { action: parsed.action }
      }
    } catch (error) {
      console.error('[AppointmentIntentService] Failed to interpret pending offer reply.', {
        error,
        incomingMessage,
      })
    }

    return { action: 'needs_clarification' }
  }

  private async interpretPendingResolutionReply(resolution: PendingAvailabilityResolution, incomingMessage: string): Promise<{ action: 'select_candidate'; candidateId: string } | { action: 'decline' | 'repeat_options' | 'needs_clarification' }> {
    const tools: OpenAITool[] = [
      {
        type: 'function',
        function: {
          name: 'resolve_pending_resolution_reply',
          description: 'Classifica a resposta do usuario para uma selecao pendente de opcoes de agendamento.',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['select_candidate', 'decline', 'repeat_options', 'needs_clarification'],
              },
              candidateId: {
                type: 'string',
              },
            },
            required: ['action'],
            additionalProperties: false,
          },
        },
      },
    ]

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `
Você classifica respostas sobre uma lista pendente de opcoes de agendamento.

Escolha:
- select_candidate: quando o usuario identificar de forma segura exatamente uma opcao da lista, por nome, indice, ordinal ou descricao.
- decline: quando o usuario desistir claramente dessa escolha por agora.
- repeat_options: quando o usuario pedir para ver a lista/opcoes novamente.
- needs_clarification: quando houver duvida, mais de uma opcao possivel, pergunta paralela ou mensagem sem escolha inequívoca.

Regras:
- So use select_candidate quando houver uma unica opcao claramente identificavel.
- Se action for select_candidate, envie candidateId exatamente como aparece na lista.
- Nao invente candidateId.
- Na duvida, use needs_clarification.
- Responda apenas com a chamada da funcao.
            `.trim(),
          },
          {
            role: 'user',
            content: `Tipo de resolucao: ${resolution.kind}\n\nOpcoes disponiveis:\n${this.describeResolutionCandidates(resolution.candidates)}\n\nMensagem do usuario:\n${incomingMessage}`,
          },
        ],
        tools,
        tool_choice: 'required',
      })

      const toolCall = response.choices[0]?.message?.tool_calls?.[0]
      if (toolCall?.type !== 'function') {
        return { action: 'needs_clarification' }
      }

      const parsed = JSON.parse(toolCall.function.arguments || '{}') as {
        action?: 'select_candidate' | 'decline' | 'repeat_options' | 'needs_clarification'
        candidateId?: string
      }

      if (parsed.action === 'select_candidate') {
        const candidateId = extractIdValue(parsed.candidateId)
        const valid = candidateId && resolution.candidates.some((candidate) => String(candidate.id) === candidateId)
        if (valid && candidateId) {
          return { action: 'select_candidate', candidateId }
        }
        return { action: 'needs_clarification' }
      }

      if (parsed.action === 'decline' || parsed.action === 'repeat_options' || parsed.action === 'needs_clarification') {
        return { action: parsed.action }
      }
    } catch (error) {
      console.error('[AppointmentIntentService] Failed to interpret pending resolution reply.', {
        error,
        incomingMessage,
        kind: resolution.kind,
      })
    }

    return { action: 'needs_clarification' }
  }
}

export const appointmentIntentService = new AppointmentIntentService()
