const NUMBER_PATTERN = /-?\d[\d.,]*/g

export interface ParseNumberOptions {
  allowNegative?: boolean
  precision?: number
}

const sanitizeNumericFragment = (rawValue: string): string => {
  let numeric = rawValue
  const hasComma = numeric.includes(',')
  const hasDot = numeric.includes('.')

  if (hasComma && hasDot) {
    if (numeric.lastIndexOf(',') > numeric.lastIndexOf('.')) {
      numeric = numeric.replace(/\./g, '').replace(',', '.')
    } else {
      numeric = numeric.replace(/,/g, '')
    }
  } else if (hasComma) {
    numeric = numeric.replace(/\./g, '').replace(',', '.')
  } else if (hasDot) {
    const lastDot = numeric.lastIndexOf('.')
    const decimals = numeric.length - lastDot - 1
    const digitsBeforeDot = numeric.slice(0, lastDot).replace(/\D/g, '')
    if (decimals === 3 && digitsBeforeDot.length > 0) {
      numeric = numeric.replace(/\./g, '')
    }
  }

  return numeric
}

export const parseLocalizedNumber = (value: unknown, options: ParseNumberOptions = {}): number | null => {
  if (value === null || value === undefined) return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    if (!options.allowNegative && value < 0) return null
    if (typeof options.precision === 'number') {
      const factor = 10 ** options.precision
      return Math.round(value * factor) / factor
    }
    return value
  }

  const rawString = String(value).trim()
  if (!rawString) return null

  const matches = rawString.match(NUMBER_PATTERN)
  if (!matches || matches.length === 0) return null

  const sanitized = sanitizeNumericFragment(matches[0])
  const parsed = Number(sanitized)
  if (!Number.isFinite(parsed)) return null
  if (!options.allowNegative && parsed < 0) return null

  if (typeof options.precision === 'number') {
    const factor = 10 ** options.precision
    return Math.round(parsed * factor) / factor
  }

  return parsed
}

export const parsePositiveInteger = (value: unknown): number | null => {
  const parsed = parseLocalizedNumber(value)
  if (parsed === null) return null
  const rounded = Math.round(parsed)
  return Number.isFinite(rounded) && rounded > 0 ? rounded : null
}

export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const formatCurrency = (value: number | null | undefined): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return currencyFormatter.format(value)
}

export const toIntegerCents = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.round(value * 100)
}
