import { addMinutes, format, isValid, parse, parseISO } from 'date-fns'

export class DateFormatter {
  static toISODate(date: Date | string): string {
    if (typeof date === 'string') {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date
      }
      date = new Date(date)
    }

    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error('Data inválida fornecida')
    }

    return date.toISOString().split('T')[0]
  }

  static formatToBrazilianDate(rawDate?: string | Date | null): string | null {
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
          parsedDate = addMinutes(parsedByIso, parsedByIso.getTimezoneOffset())
        }
      }
    }

    if (!parsedDate || !isValid(parsedDate)) return null

    return format(parsedDate, 'dd/MM/yyyy')
  }

  static isValidISODate(dateString: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return false
    }

    const date = new Date(dateString)
    return date instanceof Date && !isNaN(date.getTime()) && date.toISOString().split('T')[0] === dateString
  }

  static isValidHarvest(harvest: string): boolean {
    return /^\d{4}\/\d{4}$/.test(harvest)
  }

  static normalizeToISODate(value: string | Date | null | undefined): string | null {
    if (!value) {
      return null
    }

    if (value instanceof Date) {
      return this.toISODate(value)
    }

    if (typeof value !== 'string') {
      return null
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    if (this.isValidISODate(trimmed)) {
      return trimmed
    }

    const isoWithTimeMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/)
    if (isoWithTimeMatch) {
      const [, year, month, day] = isoWithTimeMatch
      return `${year}-${month}-${day}`
    }

    const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (brMatch) {
      const [, day, month, year] = brMatch
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      return this.toISODate(parsed)
    }

    return trimmed
  }

  static formatParameters(params: { harvest?: string; startDate?: string | Date; endDate?: string | Date }) {
    const formatted: any = {}

    if (params.harvest) {
      if (!this.isValidHarvest(params.harvest)) {
        throw new Error('Safra deve estar no formato YYYY/YYYY')
      }
      formatted.harvest = params.harvest
    }

    if (params.startDate) {
      formatted.startDate = this.toISODate(params.startDate)
    }

    if (params.endDate) {
      formatted.endDate = this.toISODate(params.endDate)
    }

    return formatted
  }
}
