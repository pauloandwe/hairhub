import { getZonedParts, resolveTimeZone } from './timezone'

export const DEFAULT_APPOINTMENT_DATE_LOCALE = 'pt-BR'

export const APPOINTMENT_DATE_INTERPRETATION_KINDS = ['explicit_date', 'day_month', 'day_only', 'relative_today', 'relative_tomorrow', 'relative_weekday', 'none', 'invalid', 'needs_clarification'] as const

export type AppointmentDateInterpretationKind = (typeof APPOINTMENT_DATE_INTERPRETATION_KINDS)[number]

export interface AppointmentDateInterpretation {
  kind: AppointmentDateInterpretationKind
  weekday?: number | null
  day?: number | null
  month?: number | null
  year?: number | null
  matchedText?: string | null
  confidenceNote?: string | null
  locale?: string | null
}

export interface NormalizeAppointmentDateInterpretationParams {
  interpretation: AppointmentDateInterpretation
  timezone?: string | null
  now?: Date
  source?: string | null
}

export interface RequestedAppointmentDateResolution {
  normalizedDate: string | null
  source: string | null
  matchedText: string | null
  requiresClarification: boolean
  clarificationMessage?: string
  interpretationKind: AppointmentDateInterpretationKind
  locale: string
  confidenceNote?: string | null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function normalizeLocale(locale?: string | null): string {
  const trimmed = String(locale || '').trim()
  return trimmed || DEFAULT_APPOINTMENT_DATE_LOCALE
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    return null
  }

  return `${year}-${pad(month)}-${pad(day)}`
}

function addDaysToIsoDate(isoDate: string, days: number): string | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0))
  if (Number.isNaN(base.getTime())) return null

  base.setUTCDate(base.getUTCDate() + days)
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`
}

export function getTodayIsoInTimeZone(now: Date, timezone?: string | null): string {
  const parts = getZonedParts(now, resolveTimeZone(timezone))
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function getIsoWeekdayFromIsoDate(isoDate: string): number | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0))
  if (Number.isNaN(candidate.getTime())) return null

  const weekday = candidate.getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function resolveNextIsoWeekday(weekday: number, todayIso: string, inclusiveToday = true): string | null {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    return null
  }

  const currentWeekday = getIsoWeekdayFromIsoDate(todayIso)
  if (!currentWeekday) return null

  let diff = weekday - currentWeekday
  if (diff < 0) {
    diff += 7
  }

  if (!inclusiveToday && diff === 0) {
    diff = 7
  }

  return addDaysToIsoDate(todayIso, diff)
}

function resolveFutureDayOnly(day: number, todayIso: string): string | null {
  const match = todayIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const baseYear = Number(match[1])
  const baseMonth = Number(match[2])

  for (let offset = 0; offset < 24; offset += 1) {
    const monthIndex = baseMonth - 1 + offset
    const year = baseYear + Math.floor(monthIndex / 12)
    const month = (monthIndex % 12) + 1
    const candidate = buildIsoDate(year, month, day)
    if (candidate && candidate >= todayIso) {
      return candidate
    }
  }

  return null
}

function resolveFutureDayMonth(day: number, month: number, todayIso: string): string | null {
  const match = todayIso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const currentYear = Number(match[1])
  const thisYearCandidate = buildIsoDate(currentYear, month, day)
  if (thisYearCandidate && thisYearCandidate >= todayIso) {
    return thisYearCandidate
  }

  return buildIsoDate(currentYear + 1, month, day)
}

function buildInvalidDateMessage(matchedText?: string | null): string {
  if (matchedText) {
    return `${matchedText} nao parece uma data valida. Me fala outra data, por favor.`
  }
  return 'Nao consegui validar essa data. Me fala outra, por favor.'
}

function buildClarificationMessage(matchedText?: string | null): string {
  if (matchedText) {
    return `Nao consegui entender exatamente qual data voce quis dizer em "${matchedText}". Me fala a data com mais detalhe, por favor.`
  }
  return 'Nao consegui entender qual data voce quer. Me fala a data com mais detalhe, por favor.'
}

function buildBaseResolution(interpretation: AppointmentDateInterpretation, source?: string | null): RequestedAppointmentDateResolution {
  return {
    normalizedDate: null,
    source: source ?? null,
    matchedText: interpretation.matchedText ?? null,
    requiresClarification: false,
    interpretationKind: interpretation.kind,
    locale: normalizeLocale(interpretation.locale),
    confidenceNote: interpretation.confidenceNote ?? null,
  }
}

export function normalizeAppointmentDateInterpretation(params: NormalizeAppointmentDateInterpretationParams): RequestedAppointmentDateResolution {
  const { interpretation, timezone, source } = params
  const now = params.now ?? new Date()
  const todayIso = getTodayIsoInTimeZone(now, timezone)
  const base = buildBaseResolution(interpretation, source)

  switch (interpretation.kind) {
    case 'none':
      return base
    case 'invalid':
      return {
        ...base,
        requiresClarification: true,
        clarificationMessage: buildInvalidDateMessage(interpretation.matchedText),
      }
    case 'needs_clarification':
      return {
        ...base,
        requiresClarification: true,
        clarificationMessage: buildClarificationMessage(interpretation.matchedText),
      }
    case 'relative_today':
      return {
        ...base,
        normalizedDate: todayIso,
      }
    case 'relative_tomorrow': {
      const normalizedDate = addDaysToIsoDate(todayIso, 1)
      return normalizedDate
        ? {
            ...base,
            normalizedDate,
          }
        : {
            ...base,
            requiresClarification: true,
            clarificationMessage: buildClarificationMessage(interpretation.matchedText),
          }
    }
    case 'relative_weekday': {
      const weekday = interpretation.weekday
      const normalizedDate = typeof weekday === 'number' ? resolveNextIsoWeekday(weekday, todayIso, true) : null
      return normalizedDate
        ? {
            ...base,
            normalizedDate,
          }
        : {
            ...base,
            requiresClarification: true,
            clarificationMessage: buildClarificationMessage(interpretation.matchedText),
          }
    }
    case 'day_only': {
      const day = interpretation.day
      const normalizedDate = typeof day === 'number' ? resolveFutureDayOnly(day, todayIso) : null
      return normalizedDate
        ? {
            ...base,
            normalizedDate,
          }
        : {
            ...base,
            requiresClarification: true,
            clarificationMessage: buildInvalidDateMessage(interpretation.matchedText),
          }
    }
    case 'day_month': {
      const day = interpretation.day
      const month = interpretation.month
      const normalizedDate = typeof day === 'number' && typeof month === 'number' ? resolveFutureDayMonth(day, month, todayIso) : null
      return normalizedDate
        ? {
            ...base,
            normalizedDate,
          }
        : {
            ...base,
            requiresClarification: true,
            clarificationMessage: buildInvalidDateMessage(interpretation.matchedText),
          }
    }
    case 'explicit_date': {
      const year = interpretation.year
      const month = interpretation.month
      const day = interpretation.day
      const normalizedDate = typeof year === 'number' && typeof month === 'number' && typeof day === 'number' ? buildIsoDate(year, month, day) : null
      return normalizedDate
        ? {
            ...base,
            normalizedDate,
          }
        : {
            ...base,
            requiresClarification: true,
            clarificationMessage: buildInvalidDateMessage(interpretation.matchedText),
          }
    }
    default:
      return {
        ...base,
        requiresClarification: true,
        clarificationMessage: buildClarificationMessage(interpretation.matchedText),
      }
  }
}
